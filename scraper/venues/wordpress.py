# -*- coding: utf-8 -*-
"""Sources publiques d'un site WordPress : l'API wp-json (liste des fiches d'un type de contenu
« spectacle », « event »…) et The Events Calendar (tribe/events/v1 : séances datées).

Mesuré le 07/11/2026 : Suresnes (`shows`), Le POC (`spectacles`), Les Gémeaux (`spectacles`), Bergeries
(`tdb_show`), Watteau (`taw-saison-cultu`), Essaïon et La Scène Parisienne (`spectacle`) exposent la liste
complète de leurs fiches ; La Nouvelle Seine publie 126 séances via The Events Calendar. Les sites qui
refusent (401 sur wp-json : La Scala, Poche-Montparnasse, Le République) sont laissés de côté.
Appels avec le User-Agent du projet (sources machine), robots.txt respecté par PoliteFetcher.
"""
from __future__ import annotations

import json
import re
from datetime import date
from typing import Any, Optional
from urllib.parse import urlparse

try:
    from scraper.venues import html_fiche, schemaorg
    from scraper.venues.http import PoliteFetcher
except ModuleNotFoundError:  # pragma: no cover
    from venues import html_fiche, schemaorg  # type: ignore[no-redef]
    from venues.http import PoliteFetcher  # type: ignore[no-redef]

EVENT_TYPE_RE = re.compile(r"spectacle|event|evenement|agenda|programm|saison|show|representation|concert", re.I)
EXCLUDED_TYPES = {
    "post", "page", "attachment", "nav_menu_item", "wp_block", "wp_template", "wp_template_part", "wp_global_styles",
    "wp_navigation", "wp_font_family", "wp_font_face", "tribe_venue", "tribe_organizer", "tec_calendar_embed",
    "tribe_events",  # lu via l'API tribe, qui porte les dates
}
PER_PAGE = 100
MAX_PAGES = 2        # 200 fiches au plus par type de contenu
TRIBE_PER_PAGE = 50
TRIBE_MAX_PAGES = 3


def site_root(url: str) -> str:
    parsed = urlparse(url)
    return f"{parsed.scheme}://{parsed.netloc}"


def _json(fetcher: PoliteFetcher, url: str) -> Any:
    page = fetcher.get(url)
    if not page.ok:
        return None
    try:
        return json.loads(page.text)
    except ValueError:
        return None


def event_types(types: dict) -> list[str]:
    """`rest_base` des types de contenu qui ressemblent à des événements (hors types natifs)."""
    out: list[str] = []
    for name, info in types.items():
        rest_base = (info or {}).get("rest_base") or name
        if name in EXCLUDED_TYPES or rest_base in EXCLUDED_TYPES:
            continue
        if EVENT_TYPE_RE.search(name) or EVENT_TYPE_RE.search(rest_base):
            out.append(rest_base)
    return out


def fiche_links(fetcher: PoliteFetcher, page_url: str) -> list[str]:
    """Liens des fiches (champ `link`) des types de contenu événement d'un site WordPress."""
    root = site_root(page_url)
    types = _json(fetcher, f"{root}/wp-json/wp/v2/types")
    if not isinstance(types, dict):
        return []
    links: list[str] = []
    for rest_base in event_types(types):
        for number in range(1, MAX_PAGES + 1):
            items = _json(fetcher, f"{root}/wp-json/wp/v2/{rest_base}?per_page={PER_PAGE}&page={number}&_fields=id,link,title,date")
            if not isinstance(items, list) or not items:
                break
            for item in items:
                link = item.get("link") if isinstance(item, dict) else None
                if link and link not in links:
                    links.append(link)
            if len(items) < PER_PAGE:
                break
    return links


def _tribe_occurrence(event: dict, page_url: str) -> Optional[dict]:
    title = schemaorg._text(event.get("title"))
    start = schemaorg.iso_day(event.get("start_date"))
    if not title or not start:
        return None
    venue = event.get("venue") if isinstance(event.get("venue"), dict) else {}
    image = event.get("image") if isinstance(event.get("image"), dict) else {}
    low, high = html_fiche.parse_price_range(schemaorg._text(event.get("cost")) or "")
    return {
        "title": title, "url": schemaorg._text(event.get("url")) or page_url,
        "date_start": start, "date_end": schemaorg.iso_day(event.get("end_date")) or start,
        "venue": schemaorg._text(venue.get("venue")), "address": schemaorg._text(venue.get("address")),
        "description": schemaorg._text(event.get("description")), "image": image.get("url") if image else None,
        "duration_min": None, "cast": [], "director": None, "age_range": None, "language": None,
        "event_status": None, "accessibility": [], "type": "Event", "availability": None,
        "currency": "EUR" if low is not None else None, "booking_url": schemaorg._text(event.get("website")) or None,
        "price_min_eur": low, "price_max_eur": high,
    }


def tribe_events(data: Any, page_url: str) -> list[dict]:
    """Occurrences (une par séance) depuis une réponse de tribe/events/v1/events."""
    if not isinstance(data, dict):
        return []
    out = []
    for event in data.get("events") or []:
        if isinstance(event, dict):
            occ = _tribe_occurrence(event, page_url)
            if occ:
                out.append(occ)
    return out


def tribe_occurrences(fetcher: PoliteFetcher, page_url: str, today: Optional[date] = None) -> list[dict]:
    """Séances à venir d'un site équipé de The Events Calendar ; [] si l'API est absente."""
    root = site_root(page_url)
    start = (today or date.today()).isoformat()
    occurrences: list[dict] = []
    for number in range(1, TRIBE_MAX_PAGES + 1):
        data = _json(fetcher, f"{root}/wp-json/tribe/events/v1/events?per_page={TRIBE_PER_PAGE}&page={number}&start_date={start}")
        found = tribe_events(data, root)
        if not found:
            break
        occurrences += found
        if number >= int((data or {}).get("total_pages") or 1):
            break
    return occurrences
