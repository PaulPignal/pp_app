# -*- coding: utf-8 -*-
"""Extracteur générique : accueil + pages agenda + fiches spectacle, lus en schema.org."""
from __future__ import annotations

from typing import Optional
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup

try:
    from scraper import discover
    from scraper.venues import schemaorg, triage
    from scraper.venues.http import PoliteFetcher
except ModuleNotFoundError:  # pragma: no cover
    import discover  # type: ignore[no-redef]
    from venues import schemaorg, triage  # type: ignore[no-redef]
    from venues.http import PoliteFetcher  # type: ignore[no-redef]

MAX_DETAIL_PAGES = 40


def detail_links(soup, base_url: str, exclude: set[str], limit: int) -> list[str]:
    """Liens internes qui ressemblent à des fiches spectacle (pas de navigation)."""
    out: list[str] = []
    for url, _slug, _tokens in discover._candidates(soup, base_url):
        parsed = urlparse(url)
        segments = [s for s in parsed.path.split("/") if s]
        if url in exclude or not segments or len(segments[-1]) < 4 or segments[-1].endswith((".pdf", ".jpg", ".png", ".ics")):
            continue
        if triage.AGENDA_AVOID_RE.search(parsed.path):
            continue
        out.append(url)
        if len(out) >= limit:
            break
    return out


def extract_generic(fetcher: PoliteFetcher, venue: dict, max_detail: int = MAX_DETAIL_PAGES) -> tuple[list[dict], dict]:
    """(occurrences groupées, diagnostic). Les pages sont lues dans l'ordre : accueil, agenda, fiches."""
    website = venue["website"]
    info = {"pages": 0, "signal": "", "status": ""}
    home = fetcher.get(website)
    if not home.ok:
        info["status"] = home.note or f"http {home.status}"
        return [], info
    pages = [home]
    soup = BeautifulSoup(home.text, "html.parser")
    for link in triage.pick_agenda_links(soup, home.final_url):
        page = fetcher.get(link)
        if page.ok:
            pages.append(page)
    occurrences: list[dict] = []
    for page in pages:
        found, signal = schemaorg.occurrences_from_html(page.text, page.final_url)
        if found:
            occurrences += found
            info["signal"] = info["signal"] or signal
    if len(occurrences) < 3 and max_detail:  # peu d'événements listés : les fiches portent le JSON-LD
        seen = {p.final_url for p in pages}
        links: list[str] = []
        for page in pages[1:] or pages:
            links += detail_links(BeautifulSoup(page.text, "html.parser"), page.final_url, seen | set(links), max_detail)
        for link in links[:max_detail]:
            page = fetcher.get(link)
            info["pages"] += 1
            if not page.ok:
                continue
            found, signal = schemaorg.occurrences_from_html(page.text, page.final_url)
            if found:
                occurrences += found
                info["signal"] = info["signal"] or signal
    info["pages"] += len(pages)
    info["status"] = "ok" if occurrences else "aucun_event"
    return schemaorg.group_occurrences(occurrences), info


def generic_records(fetcher: PoliteFetcher, venue: dict, today=None) -> tuple[list[dict], dict]:
    groups, info = extract_generic(fetcher, venue)
    source = f"direct:{info['signal']}" if info["signal"] else "direct:schemaorg"
    return schemaorg.records_from_groups(groups, venue, source, today=today), info
