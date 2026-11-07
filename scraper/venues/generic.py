# -*- coding: utf-8 -*-
"""Extracteur générique : accueil + pages agenda (et leurs pages suivantes) + fiches spectacle.

Ordre de lecture : accueil, pages agenda repérées sur l'accueil, pages suivantes d'un agenda paginé
(?page=2, /page/2/), puis les fiches spectacle. Les fiches sont lues en schema.org (JSON-LD, microdata) ;
si aucune fiche du site n'en porte, elles sont lues en HTML (html_fiche : titre, dates en français,
tarifs). Sur un site WordPress, la liste des fiches vient aussi de l'API publique wp-json (types de
contenu « spectacle », « event »…) et The Events Calendar fournit directement les séances.

Les liens de fiche sont classés avant lecture : une famille de liens nombreuse sous un même chemin
(/spectacle/*, /evenements/*), un chemin évocateur (programmation, saison, agenda) et une position hors
navigation (nav, header, footer) passent devant. Sans ce classement, les 40 premiers liens d'une page
sont ceux du menu (mesuré sur le Théâtre du Rond-Point : 1 spectacle lu sur 38).
"""
from __future__ import annotations

import html as htmllib
import os
import re
from datetime import date
from typing import Optional
from urllib.parse import parse_qs, urljoin, urlparse

from bs4 import BeautifulSoup

try:
    from scraper import discover
    from scraper.venues import html_fiche, schemaorg, triage, wordpress
    from scraper.venues.http import Page, PoliteFetcher
except ModuleNotFoundError:  # pragma: no cover
    import discover  # type: ignore[no-redef]
    from venues import html_fiche, schemaorg, triage, wordpress  # type: ignore[no-redef]
    from venues.http import Page, PoliteFetcher  # type: ignore[no-redef]

# Plafond de fiches lues par lieu (VENUES_MAX_FICHES pour l'ajuster) : 40 laissait 39 spectacles de côté au
# Théâtre du Nord-Ouest (59 chez offi) ; à 60, quatre lieux restaient au plafond (Suresnes et Les Gémeaux
# ont 146 fiches, Pleyel 79, Apollo 67) ; 120 les couvre pour une centaine de requêtes de plus au total.
MAX_DETAIL_PAGES = int(os.environ.get("VENUES_MAX_FICHES", "120"))
MAX_LISTING_PAGES = 4  # pages suivantes d'un agenda paginé
MIN_LISTED_TITLES = 3  # en dessous, les pages de liste ne portent pas l'agenda : on lit les fiches
MIN_FAMILY = 3         # liens frères sous un même chemin pour former une « famille » de fiches
FICHE_SCORE = 2        # score minimal pour lire une page en HTML (repli sans schema.org)
STRONG_FICHE_SCORE = 3 # famille nombreuse + chemin profond (ou lien donné par wp-json)
DATELESS_FICHE_SCORE = 4  # famille nombreuse, chemin profond et parent d'agenda : fiche gardée même sans date
MIN_FICHE_FAMILY = 8   # fiches sûres à partir desquelles on lit les fiches malgré une liste structurée
_NAV_TAGS = ["nav", "header", "footer"]
_PAGE_QUERY_KEYS = ("page", "paged", "p", "pg")
_PAGE_PATH_RE = re.compile(r"/page/(\d+)/?$")
_SKIP_EXT = (".pdf", ".jpg", ".jpeg", ".png", ".gif", ".webp", ".ics", ".zip", ".mp3", ".mp4")


def _page_number(url: str, listing_path: str) -> Optional[int]:
    """Numéro de page si `url` est la page N d'un agenda dont le chemin est `listing_path`."""
    parsed = urlparse(url)
    path = parsed.path.rstrip("/") or "/"
    m = _PAGE_PATH_RE.search(parsed.path)
    if m and path[: m.start()].rstrip("/") == listing_path.rstrip("/"):
        return int(m.group(1))
    if path == (listing_path.rstrip("/") or "/"):
        for key in _PAGE_QUERY_KEYS:
            values = parse_qs(parsed.query).get(key)
            if values and values[0].isdigit():
                return int(values[0])
    return None


_DATA_NEXT_RE = re.compile(r'data-(?:next|url|href|load-more-url)="([^"]+)"')


def pagination_links(soup, page_url: str, limit: int = MAX_LISTING_PAGES) -> list[str]:
    """Pages suivantes (2, 3…) d'un agenda paginé, dans l'ordre, sans doublon : liens, ou attribut
    `data-next` d'un bouton « voir plus » (La Scala : data-next=".../programmation/page/2/")."""
    host = urlparse(page_url).netloc
    listing_path = urlparse(page_url).path
    found: dict[int, str] = {}
    candidates = [triage.clean_href(a["href"]) for a in soup.find_all("a", href=True)]
    candidates += [htmllib.unescape(u) for u in _DATA_NEXT_RE.findall(str(soup))]
    for href in candidates:
        url = urljoin(page_url, href).split("#", 1)[0]
        if urlparse(url).netloc != host:
            continue
        number = _page_number(url, listing_path)
        if number and number >= 2 and number not in found:
            found[number] = url
    return [found[n] for n in sorted(found)[:limit]]


def ranked_links(soup, base_url: str, exclude: set[str]) -> list[tuple[int, str]]:
    """Liens internes candidats à la fiche spectacle, avec un score (plus haut = plus probable)."""
    host = urlparse(base_url).netloc
    items: list[tuple[str, str, int, bool]] = []
    families: dict[str, int] = {}
    seen: set[str] = set()
    for a in soup.find_all("a", href=True):
        url = urljoin(base_url, triage.clean_href(a["href"]))
        parsed = urlparse(url)
        if parsed.netloc != host or parsed.scheme not in ("http", "https"):
            continue
        url = parsed._replace(query="", fragment="").geturl()
        segments = [s for s in parsed.path.split("/") if s]
        if not segments or url in seen or url in exclude:
            continue
        last = segments[-1]
        if len(last) < 4 or last.lower().endswith(_SKIP_EXT):
            continue
        # Un dernier segment de navigation (/agenda, /spectacles) est une liste, pas une fiche ; en premier
        # segment (/spectacles/hamlet) c'est au contraire la marque d'une fiche.
        if last in discover._NAV or triage.AGENDA_AVOID_RE.search(parsed.path):
            continue
        seen.add(url)
        parent = "/".join(segments[:-1])
        families[parent] = families.get(parent, 0) + 1
        items.append((url, parent, len(segments), a.find_parent(_NAV_TAGS) is not None))
    scored: list[tuple[int, str]] = []
    for url, parent, depth, in_nav in items:
        score = 0
        if families[parent] >= MIN_FAMILY:
            score += 2
        if depth >= 2:
            score += 1
        if parent and triage.AGENDA_HINT_RE.search(parent):
            score += 1
        if in_nav:
            score -= 3
        scored.append((score, url))
    return scored


def _parent(url: str) -> str:
    segments = [s for s in urlparse(url).path.split("/") if s]
    return "/".join(segments[:-1])


def detail_links(soup, base_url: str, exclude: set[str], limit: int) -> list[str]:
    """Liens internes qui ressemblent à des fiches spectacle, les plus probables d'abord."""
    ranked = sorted(ranked_links(soup, base_url, exclude), key=lambda item: -item[0])
    return [url for _, url in ranked[:limit]]


def listing_pages(fetcher: PoliteFetcher, home: Page, wordpress: bool = False) -> list[Page]:
    """Accueil, pages agenda de l'accueil, puis pages suivantes de chaque agenda paginé. Sur WordPress,
    sans lien de pagination visible, la convention /page/2/ est essayée (404 au-delà de la dernière page)."""
    pages = [home]
    soup = BeautifulSoup(home.text, "html.parser")
    for link in triage.pick_agenda_links(soup, home.final_url):
        page = fetcher.get(link)
        if page.ok:
            pages.append(page)
    seen = {p.final_url for p in pages} | {p.url for p in pages}
    for page in list(pages[1:]):
        links = pagination_links(BeautifulSoup(page.text, "html.parser"), page.final_url)
        if not links and wordpress and not urlparse(page.final_url).query and not _PAGE_PATH_RE.search(page.final_url):
            links = [f"{page.final_url.rstrip('/')}/page/{n}/" for n in range(2, MAX_LISTING_PAGES + 2)]
        for link in links:
            if link in seen:
                continue
            seen.add(link)
            more = fetcher.get(link)
            if not more.ok:
                break
            pages.append(more)
    return pages


def extract_generic(fetcher: PoliteFetcher, venue: dict, max_detail: int = MAX_DETAIL_PAGES,
                    today: Optional[date] = None) -> tuple[list[dict], dict]:
    """(occurrences groupées, diagnostic). Les pages sont lues dans l'ordre : accueil, agenda, fiches."""
    website = venue["website"]
    info = {"pages": 0, "signal": "", "status": ""}
    home = fetcher.get(website)
    if not home.ok:
        info["status"] = home.note or f"http {home.status}"
        return [], info
    is_wordpress = triage.detect_cms(home.text) == "wordpress"
    pages = listing_pages(fetcher, home, is_wordpress)
    occurrences: list[dict] = []
    for page in pages:
        found, signal = schemaorg.occurrences_from_html(page.text, page.final_url)
        if found:
            occurrences += found
            info["signal"] = info["signal"] or signal

    def titles() -> int:  # spectacles distincts déjà lus (une fiche de 8 séances ne vaut qu'un spectacle)
        return len({re.sub(r"\W+", "", o["title"].lower()) for o in occurrences})

    if is_wordpress:  # The Events Calendar liste toute la saison, même quand l'accueil n'en met que quelques-uns en avant
        found = wordpress.tribe_occurrences(fetcher.project_fetcher(), home.final_url, today)
        if found:
            occurrences += found
            info["signal"] = info["signal"] or "wp_tribe"
    seen = {p.final_url for p in pages} | {p.url for p in pages}
    scored: dict[str, int] = {}
    if max_detail:
        if is_wordpress:
            for url in wordpress.fiche_links(fetcher.project_fetcher(), home.final_url):
                if url not in seen:
                    scored[url] = max(scored.get(url, 0), STRONG_FICHE_SCORE)
        for page in pages[1:] or pages:
            for score, url in ranked_links(BeautifulSoup(page.text, "html.parser"), page.final_url, seen):
                scored[url] = max(scored.get(url, -9), score)
    strong = sum(1 for u in scored if scored[u] >= STRONG_FICHE_SCORE)
    # Les fiches sont lues quand la liste ne porte pas l'agenda, ou quand une vraie famille de fiches existe
    # alors que la liste n'en structure qu'une partie (L'Européen : 13 spectacles JSON-LD sur l'accueil,
    # 21 fiches ; BO Saint-Martin : wp-json liste toutes les fiches).
    if max_detail and (titles() < MIN_LISTED_TITLES or strong >= MIN_FICHE_FAMILY):
        # score négatif = lien de navigation sans autre indice : jamais une fiche, pas de requête
        links = [u for u in sorted(scored, key=lambda u: -scored[u]) if scored[u] >= 0][:max_detail]
        fetched: list[Page] = []
        structured: set[str] = set()  # familles (chemin parent) des fiches lues en schema.org
        cutoff = (today or date.today()).isoformat()
        for link in links:
            page = fetcher.get(link)
            info["pages"] += 1
            if not page.ok:
                continue
            found, signal = schemaorg.occurrences_from_html(page.text, page.final_url)
            if found and not any((o["date_end"] or o["date_start"] or "") >= cutoff for o in found):
                # données structurées périmées (Théâtre de l'Atelier : JSON-LD daté de 2023 sur des fiches
                # 2026) : le texte de la fiche, qui ne livre que des dates à venir, fait foi
                occ = html_fiche.parse_fiche(page.text, page.final_url, today)
                if occ:
                    found, signal = [occ], "html"
            if found:
                structured.add(_parent(page.url))
                occurrences += found
                info["signal"] = info["signal"] or signal
            else:
                fetched.append(page)
        # Fiches sans schema.org : lecture HTML des pages les plus probables. Sur un site dont certaines fiches
        # sont structurées, seules leurs sœurs (même chemin parent) sont relues : Bobino met un JSON-LD sur
        # une fiche /event-pro/ sur vingt ; les pages de service d'un site structuré restent ignorées.
        for page in fetched:
            score = scored.get(page.url, 0)
            if score < FICHE_SCORE or (structured and _parent(page.url) not in structured):
                continue
            # Fiche d'une famille sûre (/spectacles/*, sous un chemin d'agenda) sans date lisible : gardée sans
            # date, le titre et le lien suffisent à l'appariement (l'ingestion accepte date_start nulle).
            occ = html_fiche.parse_fiche(page.text, page.final_url, today, require_date=score < DATELESS_FICHE_SCORE)
            if occ:
                occurrences.append(occ)
                info["signal"] = info["signal"] or "html"
    info["pages"] += len(pages)
    info["status"] = "ok" if occurrences else "aucun_event"
    return schemaorg.group_occurrences(occurrences), info


def generic_records(fetcher: PoliteFetcher, venue: dict, today=None) -> tuple[list[dict], dict]:
    groups, info = extract_generic(fetcher, venue, today=today)
    source = f"direct:{info['signal']}" if info["signal"] else "direct:schemaorg"
    return schemaorg.records_from_groups(groups, venue, source, today=today), info
