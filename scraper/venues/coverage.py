# -*- coding: utf-8 -*-
"""Couverture des sources directes, calculée par script.

Deux mesures par œuvre offi (une fiche = un spectacle, ou un film pour le cinéma) :
  - potentielle : l'œuvre appartient à un lieu pour lequel au moins un événement direct a été extrait ;
  - appariée    : un événement direct du même lieu porte le même titre (slug identique, ou recouvrement
                  d'au moins 60 % des mots significatifs). C'est la mesure prudente, retenue pour le verdict.
"""
from __future__ import annotations

import csv
import json
import re
from collections import defaultdict
from typing import Optional

try:
    from scraper import discover
except ModuleNotFoundError:  # pragma: no cover
    import discover  # type: ignore[no-redef]


def offi_title(url: str) -> str:
    """Titre lisible d'une fiche offi depuis son URL (/…/<titre>-<id>.html)."""
    return re.sub(r"-\d+$", "", url.rsplit("/", 1)[-1].removesuffix(".html")).replace("-", " ")


# Apostrophe d'élision entre deux lettres : offi la supprime dans ses URL (« l'avare » -> « lavare »,
# « c'est » -> « cest »), alors que slugify en fait un séparateur (« l-avare »). Sans cette
# normalisation, tout titre élidé compare « lavare » à « avare » et échoue.
_ELISION_RE = re.compile(r"(?<=[^\W\d_])['’ʼ`](?=[^\W\d_])")
# Mot seul trop générique pour valoir appariement par inclusion (« festival » dans « festival d'humour »).
_GENERIC_ALONE = {
    "festival", "spectacle", "spectacles", "concert", "concerts", "cabaret", "comedy-club", "lecture", "lectures",
    "rencontre", "rencontres", "atelier", "ateliers", "improvisation", "nouveau-spectacle", "en-rodage", "rodage",
    "jeune-public", "soiree", "soirees", "le-spectacle", "la-comedie", "le-cabaret", "conference", "projection",
}
MIN_INCLUSION_CHARS = 8


_LIGATURES = str.maketrans({"œ": "oe", "Œ": "OE", "æ": "ae", "Æ": "AE"})


def normalize_title(value: str) -> str:
    """Titre sans apostrophe d'élision ni ligature, comme dans les URL d'offi (« chœur » -> « choeur » ;
    la décomposition NFKD de slugify laisse « œ » de côté et donnait « chur »)."""
    return _ELISION_RE.sub("", (value or "").translate(_LIGATURES))


def titles_match(offi: str, direct: str) -> bool:
    """Même spectacle ? Slug identique ; ou l'un des deux titres (≥ 8 caractères, pas un mot générique)
    est contenu mot à mot dans l'autre (sous-titre, « Artiste dans Titre ») ; ou recouvrement d'au moins
    60 % des mots significatifs du titre offi (au moins deux)."""
    a, b = discover.slugify(normalize_title(offi)), discover.slugify(normalize_title(direct))
    if not a or not b:
        return False
    if a == b:
        return True
    short, long_ = sorted((a, b), key=len)
    if len(short) >= MIN_INCLUSION_CHARS and short not in _GENERIC_ALONE and f"-{short}-" in f"-{long_}-":
        return True
    ta, tb = discover.tokens(normalize_title(offi)), discover.tokens(normalize_title(direct))
    if len(ta) < 2:
        return False
    return len(ta & tb) / len(ta) >= 0.6 and len(ta & tb) >= 2


def read_jsonl(path: str) -> list[dict]:
    with open(path, encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def compute(catalogue_csv: str, works_json: str, events_jsonl: str) -> dict:
    with open(catalogue_csv, encoding="utf-8", newline="") as f:
        venues = list(csv.DictReader(f))
    with open(works_json, encoding="utf-8") as f:
        works = json.load(f)
    direct_titles: dict[str, list[str]] = defaultdict(list)
    for record in read_jsonl(events_jsonl):
        direct_titles[record["venue_slug"]].append(record["title"])

    by_id = {v["offi_id"]: v for v in venues}
    extractable = {v["slug"] for v in venues if direct_titles.get(v["slug"])}
    sections_of = {slug: set() for slug in extractable}

    totals = {"works": 0, "potential": 0, "matched": 0}
    per_section: dict[str, dict] = defaultdict(lambda: {"works": 0, "potential": 0, "matched": 0})
    per_venue: dict[str, dict] = {}
    seen_urls: set[str] = set()
    cinema_urls = set(works.get("cinema_films_total", []))
    cinema_matched: set[str] = set()
    cinema_potential: set[str] = set()

    for offi_id, by_section in works["venues"].items():
        venue = by_id.get(offi_id)
        if not venue:
            continue
        slug = venue["slug"]
        titles = direct_titles.get(slug, [])
        for section, urls in by_section.items():
            if section == "cinema":
                for url in urls:
                    if titles:
                        cinema_potential.add(url)
                        if any(titles_match(offi_title(url), t) for t in titles):
                            cinema_matched.add(url)
                continue
            for url in urls:
                if url in seen_urls:
                    continue
                seen_urls.add(url)
                is_potential = bool(titles)
                is_matched = is_potential and any(titles_match(offi_title(url), t) for t in titles)
                for bucket in (totals, per_section[section]):
                    bucket["works"] += 1
                    bucket["potential"] += is_potential
                    bucket["matched"] += is_matched
                stats = per_venue.setdefault(slug, {"works": 0, "matched": 0})
                stats["works"] += 1
                stats["matched"] += is_matched
    cinema = {"works": len(cinema_urls), "potential": len(cinema_potential & cinema_urls), "matched": len(cinema_matched & cinema_urls)}
    per_section["cinema"] = cinema
    for key in totals:
        totals[key] += cinema[key]

    with_site = [v for v in venues if v.get("website")]
    return {
        "venues_total": len(venues),
        "venues_with_site": len(with_site),
        "venues_extractable": len(extractable),
        "totals": totals,
        "per_section": dict(per_section),
        "per_venue": per_venue,
    }


def by_platform(catalogue_csv: str, events_jsonl: str) -> list[dict]:
    """Par plateforme : lieux, œuvres offi, lieux avec événements directs, faisabilité moyenne."""
    with open(catalogue_csv, encoding="utf-8", newline="") as f:
        venues = list(csv.DictReader(f))
    with_events = {r["venue_slug"] for r in read_jsonl(events_jsonl)}
    table: dict[str, dict] = defaultdict(lambda: {"venues": 0, "works": 0, "extractable": 0, "feasibility": []})
    for v in venues:
        key = v.get("platform") or ("(sans site)" if v.get("status") == "sans_site" else "(site injoignable)" if v.get("status") != "ok" else "")
        row = table[key]
        row["venues"] += 1
        row["works"] += int(v["works_count"])
        row["extractable"] += v["slug"] in with_events
        row["feasibility"].append(int(v.get("feasibility") or 3))
    out = []
    for key, row in table.items():
        feas = row.pop("feasibility")
        out.append({"platform": key, **row, "feasibility_avg": round(sum(feas) / len(feas), 1)})
    return sorted(out, key=lambda r: -r["works"])


def main() -> None:
    import argparse

    ap = argparse.ArgumentParser(description="Couverture des sources directes")
    ap.add_argument("--catalogue", default="data/venues/catalogue.csv")
    ap.add_argument("--works", default="data/venues/works_by_venue.json")
    ap.add_argument("--events", default="data/venues/events.jsonl")
    ap.add_argument("--out", help="écrit le résultat JSON")
    args = ap.parse_args()
    result = compute(args.catalogue, args.works, args.events)
    result["platforms"] = by_platform(args.catalogue, args.events)
    text = json.dumps(result, ensure_ascii=False, indent=1)
    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            f.write(text)
    t = result["totals"]
    print(f"lieux: {result['venues_total']} | avec site: {result['venues_with_site']} | avec événements directs: {result['venues_extractable']}")
    print(f"œuvres: {t['works']} | potentielles: {t['potential']} | appariées: {t['matched']}")
    for section, s in result["per_section"].items():
        print(f"  {section}: {s}")


if __name__ == "__main__":
    main()
