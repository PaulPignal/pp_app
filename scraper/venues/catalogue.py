# -*- coding: utf-8 -*-
"""Catalogue des lieux d'offi.fr : listings par section, puis une page par lieu.

Sortie : data/venues/catalogue.csv (un lieu par ligne) + data/venues/works_by_venue.json
(œuvres par lieu, pour calculer la couverture). Réutilise parsers.extract_venue.
"""
from __future__ import annotations

import csv
import json
import re
from collections import defaultdict
from typing import Optional
from urllib.parse import urljoin

from bs4 import BeautifulSoup

try:
    from scraper import parsers
    from scraper.offi_scraper import SECTION_CONFIGS
    from scraper.venues.http import PoliteFetcher
except ModuleNotFoundError:  # pragma: no cover
    import parsers  # type: ignore[no-redef]
    from offi_scraper import SECTION_CONFIGS  # type: ignore[no-redef]
    from venues.http import PoliteFetcher  # type: ignore[no-redef]

OFFI = "https://www.offi.fr"
CATALOGUE_COLUMNS = [
    "offi_id", "slug", "name", "address", "postal_code", "city", "sections",
    "offi_url", "website", "works_count", "works_by_section",
]
_CINEMA_SALLE_RE = re.compile(r"^/cinema/(?!evenement/)([a-z0-9\-]+-(\d+))\.html$")
_CINEMA_AREA_RE = re.compile(r"^/cinema/([a-z0-9\-]+)\.html$")
_CINEMA_FILM_RE = SECTION_CONFIGS["cinema"].show_path_re


def _hrefs(html: str) -> list[str]:
    soup = BeautifulSoup(html, "html.parser")
    out = []
    for a in soup.find_all("a", href=True):
        href = a["href"].split("#", 1)[0].split("?", 1)[0]
        if href.startswith(OFFI):
            href = href[len(OFFI):]
        out.append(href)
    return out


def venue_slug(url: str) -> str:
    return re.sub(r"\.html$", "", url.rstrip("/").rsplit("/", 1)[-1])


def crawl_section_listing(fetcher: PoliteFetcher, section: str, max_pages: int = 200) -> dict[str, str]:
    """{url fiche -> url page lieu} pour une section à lieu dans l'URL (tout sauf cinéma)."""
    config = SECTION_CONFIGS[section]
    shows: dict[str, str] = {}
    for n in range(1, max_pages + 1):
        url = config.programme_url if n == 1 else f"{config.programme_url}?npage={n}"
        page = fetcher.get(url)
        if not page.ok:
            break
        new = 0
        for href in _hrefs(page.text):
            if not config.show_path_re.match(href):
                continue
            show_url = OFFI + href
            if show_url in shows:
                continue
            venue_path = href.rsplit("/", 1)[0] + ".html"
            shows[show_url] = OFFI + venue_path
            new += 1
        if new == 0:
            break
    return shows


def crawl_cinema_salles(fetcher: PoliteFetcher, max_pages: int = 30) -> dict[str, set[str]]:
    """{url salle -> films} depuis les pages par arrondissement / département."""
    hub = fetcher.get(f"{OFFI}/cinema/arrondissements.html")
    areas = sorted({h for h in _hrefs(hub.text) if _CINEMA_AREA_RE.match(h) and re.search(r"paris-|essonn|hauts-de|seine-|val-d|val-de|yvelines", h)})
    salles: dict[str, set[str]] = {}
    for area in areas:
        for n in range(1, max_pages + 1):
            page = fetcher.get(f"{OFFI}{area}" if n == 1 else f"{OFFI}{area}?npage={n}")
            if not page.ok:
                break
            before = len(salles)
            for href in _hrefs(page.text):
                if _CINEMA_SALLE_RE.match(href):
                    salles.setdefault(OFFI + href, set())
            if len(salles) == before:
                break
    return salles


def fetch_venue(fetcher: PoliteFetcher, url: str, kind: str) -> tuple[Optional[dict], set[str]]:
    """(infos du lieu, films listés sur sa page) ; films vide hors cinéma."""
    page = fetcher.get(url)
    if not page.ok:
        return None, set()
    soup = BeautifulSoup(page.text, "html.parser")
    films: set[str] = set()
    if kind == "cinema":
        films = {OFFI + h for h in _hrefs(page.text) if _CINEMA_FILM_RE.match(h)}
    return parsers.extract_venue(soup, url, kind), films


def build_catalogue(fetcher: PoliteFetcher, sections: list[str], log=print) -> tuple[list[dict], dict]:
    works_by_venue: dict[int, dict[str, set[str]]] = defaultdict(lambda: defaultdict(set))
    venue_urls: dict[int, dict[str, str]] = defaultdict(dict)  # offi_id -> {section: url lieu}
    cinema_film_total: set[str] = set()

    for section in sections:
        if section == "cinema":
            continue
        shows = crawl_section_listing(fetcher, section)
        log(f"{section}: {len(shows)} fiches")
        for show_url, venue_url in shows.items():
            vid = parsers.offi_id_from_url(venue_url)
            if vid is None:
                continue
            venue_urls[vid].setdefault(section, venue_url)
            works_by_venue[vid][section].add(show_url)

    cinema_films_by_venue: dict[int, set[str]] = {}
    if "cinema" in sections:
        listing = crawl_cinema_listing_films(fetcher)
        cinema_film_total = listing
        log(f"cinema: {len(listing)} films, recherche des salles")
        for salle_url in crawl_cinema_salles(fetcher):
            vid = parsers.offi_id_from_url(salle_url)
            if vid is not None:
                venue_urls[vid].setdefault("cinema", salle_url)

    rows: list[dict] = []
    for i, (vid, by_section) in enumerate(sorted(venue_urls.items()), start=1):
        info: Optional[dict] = None
        for section, url in by_section.items():
            kind = "cinema" if section == "cinema" else "theatre"
            got, films = fetch_venue(fetcher, url, kind)
            if section == "cinema":
                cinema_films_by_venue[vid] = films
                works_by_venue[vid]["cinema"] = films
            info = info or got
        if i % 50 == 0:
            log(f"lieux décrits: {i}/{len(venue_urls)}")
        counts = {s: len(w) for s, w in works_by_venue[vid].items() if w}
        main_url = next(iter(by_section.values()))
        address = " ".join(x for x in [(info or {}).get("street_address"), (info or {}).get("postal_code"), (info or {}).get("city")] if x)
        rows.append({
            "offi_id": vid,
            "slug": venue_slug(main_url),
            "name": (info or {}).get("name") or venue_slug(main_url),
            "address": address,
            "postal_code": (info or {}).get("postal_code") or "",
            "city": (info or {}).get("city") or "",
            "sections": "|".join(sorted(by_section)),
            "offi_url": main_url,
            "website": (info or {}).get("website") or "",
            "works_count": sum(counts.values()),
            "works_by_section": json.dumps(counts, ensure_ascii=False, sort_keys=True),
        })
    works_json = {
        "venues": {str(v): {s: sorted(w) for s, w in d.items()} for v, d in works_by_venue.items()},
        "cinema_films_total": sorted(cinema_film_total),
    }
    return rows, works_json


def crawl_cinema_listing_films(fetcher: PoliteFetcher, max_pages: int = 200) -> set[str]:
    config = SECTION_CONFIGS["cinema"]
    films: set[str] = set()
    for n in range(1, max_pages + 1):
        url = config.programme_url if n == 1 else f"{config.programme_url}&npage={n}"
        page = fetcher.get(url)
        if not page.ok:
            break
        found = {OFFI + h for h in _hrefs(page.text) if _CINEMA_FILM_RE.match(h)}
        if not found - films:
            break
        films |= found
    return films


def write_catalogue(rows: list[dict], works_json: dict, csv_path: str, works_path: str) -> None:
    with open(csv_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=CATALOGUE_COLUMNS)
        writer.writeheader()
        writer.writerows(sorted(rows, key=lambda r: (-int(r["works_count"]), r["name"])))
    with open(works_path, "w", encoding="utf-8") as f:
        json.dump(works_json, f, ensure_ascii=False)


def main() -> None:
    import argparse
    import os

    ap = argparse.ArgumentParser(description="Catalogue des lieux d'offi.fr")
    ap.add_argument("--sections", default="theatre,concert,exposition,visite,enfants,cinema")
    ap.add_argument("--out", default="data/venues/catalogue.csv")
    ap.add_argument("--works-out", default="data/venues/works_by_venue.json")
    args = ap.parse_args()
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    fetcher = PoliteFetcher()
    rows, works_json = build_catalogue(fetcher, args.sections.split(","), log=lambda m: print(m, flush=True))
    write_catalogue(rows, works_json, args.out, args.works_out)
    print(f"{len(rows)} lieux écrits dans {args.out} ({fetcher.network_requests} requêtes réseau)")


if __name__ == "__main__":
    main()
