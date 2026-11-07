# -*- coding: utf-8 -*-
"""Compare, pour quelques lieux, les enregistrements directs avec les fiches offi du même lieu
(dates, tarifs, champs en plus, champs manquants). Les fiches offi sont relues sur offi.fr
(1 requête par fiche, délai du scraper existant)."""
from __future__ import annotations

import csv
import json
from typing import Optional

try:
    from scraper.offi_scraper import OffiScraper, Show
    from scraper.venues.coverage import offi_title, read_jsonl, titles_match
except ModuleNotFoundError:  # pragma: no cover
    from offi_scraper import OffiScraper, Show  # type: ignore[no-redef]
    from venues.coverage import offi_title, read_jsonl, titles_match  # type: ignore[no-redef]

FIELDS = ["date_start", "date_end", "price_min_eur", "price_max_eur", "duration_min", "description", "image", "cast", "director", "availability"]
EXTRAS = ["performances", "booking_url", "accessibility", "age_range", "language", "event_status", "placement"]


def filled(value) -> bool:
    return value not in (None, "", [], {})


def fetch_offi(scraper: OffiScraper, url: str, section: str) -> Optional[dict]:
    from dataclasses import asdict

    show = scraper._complete_show_from_detail_page(Show(url=url, section=section))
    return asdict(show) if show.title or show.description else None


def compare_venue(slug: str, catalogue_csv: str, works_json: str, events_jsonl: str, max_offi: int = 45) -> dict:
    with open(catalogue_csv, encoding="utf-8", newline="") as f:
        venue = next(v for v in csv.DictReader(f) if v["slug"] == slug)
    with open(works_json, encoding="utf-8") as f:
        works = json.load(f)["venues"][venue["offi_id"]]
    section, urls = max(((s, u) for s, u in works.items() if s != "cinema"), key=lambda kv: len(kv[1]), default=("cinema", works.get("cinema", [])))
    direct = [r for r in read_jsonl(events_jsonl) if r["venue_slug"] == slug]
    scraper = OffiScraper(min_delay=1.0, max_delay=1.6)
    offi = {}
    for url in urls[:max_offi]:
        record = fetch_offi(scraper, url, section)
        if record:
            offi[url] = record
    pairs = []
    used: set[str] = set()
    for d in direct:
        for url, o in offi.items():
            if url not in used and titles_match(o["title"] or offi_title(url), d["title"]):
                pairs.append((d, o))
                used.add(url)
                break

    def eq(a, b) -> str:
        if filled(a) and filled(b):
            return "égal" if a == b else "différent"
        return "direct seul" if filled(a) else "offi seul" if filled(b) else "absent des deux"

    fields = {}
    for name in FIELDS:
        counts: dict[str, int] = {}
        for d, o in pairs:
            key = eq(d.get(name), o.get(name))
            counts[key] = counts.get(key, 0) + 1
        fields[name] = counts
    examples = [
        {k: (d.get(k), o.get(k)) for k in ("title", "date_start", "date_end", "price_min_eur", "price_max_eur")}
        for d, o in pairs[:6]
    ]
    return {
        "slug": slug, "name": venue["name"], "offi_shows_read": len(offi), "offi_shows_in_catalogue": len(urls),
        "direct_events": len(direct), "matched": len(pairs),
        "direct_only": len(direct) - len(pairs), "offi_only": len(offi) - len(pairs),
        "fields": fields,
        "fill_rate_direct": {n: sum(filled(d.get(n)) for d in direct) for n in FIELDS + EXTRAS},
        "fill_rate_offi": {n: sum(filled(o.get(n)) for o in offi.values()) for n in FIELDS},
        "examples": examples,
    }


def main() -> None:
    import argparse

    ap = argparse.ArgumentParser(description="Compare direct et offi sur quelques lieux")
    ap.add_argument("venues", nargs="+")
    ap.add_argument("--catalogue", default="data/venues/catalogue.csv")
    ap.add_argument("--works", default="data/venues/works_by_venue.json")
    ap.add_argument("--events", default="data/venues/events.jsonl")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    results = [compare_venue(v, args.catalogue, args.works, args.events) for v in args.venues]
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=1)
    for r in results:
        print(r["slug"], {k: r[k] for k in ("offi_shows_read", "direct_events", "matched", "direct_only", "offi_only")})


if __name__ == "__main__":
    main()
