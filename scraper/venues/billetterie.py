# -*- coding: utf-8 -*-
"""Adaptateurs de billetterie tierce : on suit les liens de la page du lieu vers la billetterie
(fiches spectacle + page boutique), puis on lit chaque fiche.

Mesuré le 07/11/2026 : les fiches Tick&Live, Billetreduc, HelloAsso, Shotgun, Billetweb,
Weezevent et Eventbrite portent un JSON-LD Event lu par l'extracteur schema.org ; Mapado
n'en porte pas mais expose tout dans __NEXT_DATA__ (dates, tarifs en centimes, stock).
Fnac Spectacles répond 403 et Ticketmaster interdit les robots : ces deux-là sont notés
« bloqué » et laissés de côté (aucun contournement).
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Callable, Optional
from urllib.parse import urljoin, urlparse, urlunparse

from bs4 import BeautifulSoup

try:
    from scraper import discover, parsers
    from scraper.venues import schemaorg, triage
    from scraper.venues.http import Page, PoliteFetcher
except ModuleNotFoundError:  # pragma: no cover
    import discover, parsers  # type: ignore[no-redef]
    from venues import schemaorg, triage  # type: ignore[no-redef]
    from venues.http import Page, PoliteFetcher  # type: ignore[no-redef]

MAX_EVENTS = 40
MAX_ENTRY_PAGES = 3


@dataclass(frozen=True)
class Platform:
    name: str
    host: str                      # fragment de nom d'hôte
    event_re: re.Pattern           # chemin (+ requête) d'une fiche spectacle
    entry_re: Optional[re.Pattern]  # chemin d'une page boutique/lieu listant des fiches
    blocked: bool = False


def _p(pattern: str) -> re.Pattern:
    return re.compile(pattern)


PLATFORMS: dict[str, Platform] = {
    "tick_and_live": Platform("tick_and_live", "tickandlive.com", _p(r"^/evenement/[a-z0-9\-]+"), _p(r"^/?$")),
    "billetreduc": Platform("billetreduc", "billetreduc.com", _p(r"^/(spectacle/[a-z0-9\-]+-\d+|spectacle-[a-z0-9\-]+\.htm|\d+/evtcrit\.htm)"), _p(r"^/(lieu/|\d+/salle\.htm)")),
    "helloasso": Platform("helloasso", "helloasso.com", _p(r"^/associations/[^/]+/evenements/[^/?]+"), _p(r"^/associations/[^/]+/evenements/?$")),
    "mapado": Platform("mapado", "mapado.com", _p(r"^/event/\d+-[a-z0-9\-]+"), _p(r"^/?$")),
    "shotgun": Platform("shotgun", "shotgun.live", _p(r"^/(?:fr/)?events/[a-z0-9\-]+"), _p(r"^/(?:fr/)?venues/[a-z0-9\-]+")),
    "billetweb": Platform("billetweb", "billetweb.fr", _p(r"^/(?!pro/|js/|css/|img/|shop\.php|multi_event|login|signup)[a-z0-9][a-z0-9\-_]+/?$"), _p(r"^/(pro/[^/]+|multi_event\.php)")),
    "weezevent": Platform("weezevent", "weezevent.com", _p(r"^/(?!\?|js/)[a-z0-9][a-z0-9\-_]+/?$"), _p(r"^/[a-z0-9\-_]+/?$")),
    "eventbrite": Platform("eventbrite", "eventbrite.", _p(r"^/e/[^/?]+"), None),
    "fnac_spectacles": Platform("fnac_spectacles", "fnacspectacles.com", _p(r"^/event/"), None, blocked=True),
    "ticketmaster": Platform("ticketmaster", "ticketmaster.", _p(r"^/fr/manifestation/"), None, blocked=True),
}


def _clean(url: str) -> str:
    p = urlparse(url)
    # shop.php?event=... est une fiche ; les autres paramètres (suivi, _gl, idwl) sont du bruit
    query = p.query if "event=" in p.query or "user=" in p.query else ""
    return urlunparse((p.scheme, p.netloc, p.path, "", query, ""))


_EVENT_ID_RE = re.compile(r"eventId=(\d+)")
_GENERIC_NAME_TOKENS = {
    "theatre", "salle", "espace", "maison", "grande", "grand", "petit", "petite", "paris", "cafe", "centre",
    "cinema", "auditorium", "palais", "scene", "studio", "comedie", "opera", "eglise", "musee",
}


def venue_matches(record_venue: Optional[str], catalogue_name: str) -> bool:
    """Garde un spectacle d'une billetterie partagée (plusieurs salles) seulement s'il annonce
    notre lieu. Sans nom de lieu dans la fiche, on garde (le lien vient du site du lieu)."""
    if not record_venue:
        return True
    ours = discover_tokens(catalogue_name) - _GENERIC_NAME_TOKENS
    theirs = discover_tokens(record_venue)
    if not ours:  # nom entièrement générique : comparaison sur tous les mots
        ours = discover_tokens(catalogue_name)
    return bool(ours & theirs)


def discover_tokens(value: str) -> set[str]:
    return discover.tokens(value)


def classify_links(soup, base_url: str, platform: Platform) -> tuple[set[str], set[str]]:
    """(fiches spectacle, pages boutique) de la plateforme référencées par une page."""
    events: set[str] = set()
    entries: set[str] = set()
    for tag, attr in (("a", "href"), ("iframe", "src")):
        for el in soup.find_all(tag, attrs={attr: True}):
            url = urljoin(base_url, el[attr])
            parsed = urlparse(url)
            if platform.host not in parsed.netloc or parsed.scheme not in ("http", "https"):
                continue
            path = parsed.path or "/"
            if platform.name == "billetreduc" and _EVENT_ID_RE.search(parsed.fragment + parsed.query):
                # tunnel d'achat : l'identifiant d'événement ouvre la fiche /<id>/evtcrit.htm
                events.add(f"{parsed.scheme}://{parsed.netloc}/{_EVENT_ID_RE.search(parsed.fragment + parsed.query).group(1)}/evtcrit.htm")
            elif platform.event_re.match(path):
                events.add(_clean(url))
            elif platform.entry_re and platform.entry_re.match(path):
                entries.add(_clean(url))
    return events, entries


def mapado_occurrence(html: str, page_url: str) -> list[dict]:
    """Une occurrence par séance depuis __NEXT_DATA__ d'une fiche Mapado."""
    tag = BeautifulSoup(html, "html.parser").find("script", id="__NEXT_DATA__")
    if not tag or not tag.string:
        return []
    try:
        entities = json.loads(tag.string)["props"]["pageProps"]["entities"]
    except (ValueError, KeyError, TypeError):
        return []
    ticketing = entities.get("ticketing") or {}
    title = schemaorg._text(ticketing.get("title"))
    if not title:
        return []
    dates = (entities.get("eventDates") or {}).get("hydra:member") or []
    prices_by_start: dict[str, list[float]] = {}
    stock_by_start: dict[str, int] = {}
    for tp in (entities.get("ticketPrices") or {}).get("hydra:member") or []:
        ed = tp.get("eventDate") or {}
        start = ed.get("startDate")
        if tp.get("isPriceDisplayed") and tp.get("facialValue") is not None:
            prices_by_start.setdefault(start, []).append(tp["facialValue"] / 100)
        stock_by_start[start] = stock_by_start.get(start, 0) + int(tp.get("bookableStock") or 0)
    place = ticketing.get("place") or ticketing.get("venue")
    venue_name = schemaorg._text(place.get("name") if isinstance(place, dict) else place)
    media = (ticketing.get("mediaList") or [{}])[0] if isinstance(ticketing.get("mediaList"), list) else {}
    image = media.get("url") if isinstance(media, dict) else None
    occurrences = []
    for d in dates or [{"startDate": ticketing.get("firstFutureEventDateStartDate")}]:
        start = d.get("startDate")
        prices = prices_by_start.get(start, [])
        prices = [p for p in prices if p > 0] or prices  # tarif à 0 = carte d'abonné : ignoré s'il existe des tarifs payants
        stock = stock_by_start.get(start)
        occurrences.append({
            "title": title, "url": page_url, "date_start": schemaorg.iso_day(start), "date_end": schemaorg.iso_day(d.get("endDate")),
            "venue": venue_name, "address": None, "description": schemaorg._text(ticketing.get("description")),
            "image": image, "duration_min": None, "cast": [], "director": None, "age_range": None, "language": None,
            "event_status": None, "accessibility": [], "type": "Event",
            "availability": None if stock is None else ("InStock" if stock > 0 else "SoldOut"),
            "currency": "EUR" if prices else None, "booking_url": page_url,
            "price_min_eur": min(prices) if prices else None, "price_max_eur": max(prices) if prices else None,
        })
    return occurrences


PARSERS: dict[str, Callable[[str, str], list[dict]]] = {"mapado": mapado_occurrence}


def occurrences_for(platform: Platform, page: Page) -> list[dict]:
    custom = PARSERS.get(platform.name)
    if custom:
        return custom(page.text, page.final_url)
    return schemaorg.occurrences_from_html(page.text, page.final_url)[0]


def site_pages(fetcher: PoliteFetcher, venue: dict) -> list[Page]:
    """Accueil + au plus 2 pages agenda du site du lieu (déjà en cache après le triage)."""
    home = fetcher.get(venue["website"])
    if not home.ok:
        return []
    pages = [home]
    for link in triage.pick_agenda_links(BeautifulSoup(home.text, "html.parser"), home.final_url):
        page = fetcher.get(link)
        if page.ok:
            pages.append(page)
    return pages


def extract_platform(fetcher: PoliteFetcher, venue: dict, platform_name: str, max_events: int = MAX_EVENTS) -> tuple[list[dict], dict]:
    """(groupes de séances, diagnostic) pour un lieu dont la billetterie est `platform_name`."""
    platform = PLATFORMS[platform_name]
    info = {"status": "", "event_pages": 0}
    if platform.blocked:
        info["status"] = "bloqué (billetterie)"
        return [], info
    events: set[str] = set()
    entries: set[str] = set()
    for page in site_pages(fetcher, venue):
        ev, en = classify_links(BeautifulSoup(page.text, "html.parser"), page.final_url, platform)
        events |= ev
        entries |= en
    for entry in sorted(entries)[:MAX_ENTRY_PAGES]:
        page = fetcher.get(entry)
        if page.ok:
            ev, _ = classify_links(BeautifulSoup(page.text, "html.parser"), page.final_url, platform)
            events |= ev
    occurrences: list[dict] = []
    for url in sorted(events)[:max_events]:
        page = fetcher.get(url)
        info["event_pages"] += 1
        if page.ok:
            occurrences += occurrences_for(platform, page)
    info["status"] = "ok" if occurrences else ("aucune_fiche" if not events else "fiches_sans_donnees")
    return schemaorg.group_occurrences(occurrences), info


def platform_records(fetcher: PoliteFetcher, venue: dict, platform_name: str, today=None) -> tuple[list[dict], dict]:
    groups, info = extract_platform(fetcher, venue, platform_name)
    groups = [g for g in groups if venue_matches(g.get("venue"), venue["name"])]
    return schemaorg.records_from_groups(groups, venue, f"direct:{platform_name}", today=today), info
