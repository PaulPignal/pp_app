# -*- coding: utf-8 -*-
"""CLI unique : python3 -m scraper.venues --venue <slug>|--all --out data/venues/events.jsonl

Pour chaque lieu du catalogue (data/venues/catalogue.csv) : adaptateur spécifique du lieu s'il
existe, sinon adaptateur de la billetterie détectée, sinon extracteur générique schema.org.
Un lieu bloqué ou sans site est noté et sauté. Écrit un enregistrement JSONL par spectacle
(champs d'offi + champs optionnels, voir scraper/venues/record.py).
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import re
import sys
import unicodedata
from concurrent.futures import ThreadPoolExecutor
from typing import Optional

try:
    from scraper.venues import adapters
    from scraper.venues.http import PoliteFetcher
    from scraper.venues.record import dumps
except ModuleNotFoundError:  # pragma: no cover
    from venues import adapters  # type: ignore[no-redef]
    from venues.http import PoliteFetcher  # type: ignore[no-redef]
    from venues.record import dumps  # type: ignore[no-redef]


def load_catalogue(path: str) -> list[dict]:
    with open(path, encoding="utf-8", newline="") as f:
        rows = list(csv.DictReader(f))
    for row in rows:
        counts = json.loads(row.get("works_by_section") or "{}")
        # la section qui porte le plus d'œuvres passe en premier : c'est celle des événements sans type précis
        row["sections"] = sorted((s for s in (row.get("sections") or "").split("|") if s), key=lambda s: -counts.get(s, 0))
    return rows


def platforms_of(row: dict) -> set[str]:
    """Plateformes de billetterie d'un lieu (colonne platform, sans le CMS, et ticketing_all)."""
    names = {p.split(":")[0] for p in (row.get("ticketing_all") or "").split("|") if p}
    names.add((row.get("platform") or "").split("/")[0])
    return names


# Titres de menu ou de rubrique lus par erreur comme des fiches (0,3 % des enregistrements le 07/11/2026).
# Correspondance exacte du titre entier, sans accents ni casse : un vrai spectacle « Nos volontés » passe.
_NAV_TITLE = re.compile(
    r"(agenda|spectacles?|actualites?|calendrier|programmation|accueil|billetterie( solidaire)?"
    r"|saison( \d{2,4}(\W+\d{2,4})?)?|reserver( - .*)?|abonnements?( .*)?|profitez d'offres promotionnelles)"
)


def is_navigation_title(title: str) -> bool:
    plain = unicodedata.normalize("NFKD", title or "").encode("ascii", "ignore").decode().lower().strip()
    return bool(_NAV_TITLE.fullmatch(re.sub(r"\s+", " ", plain)))


def select_venues(rows: list[dict], slug: Optional[str], run_all: bool, min_feasibility: int, limit: Optional[int],
                  platforms: Optional[set[str]] = None, sections: Optional[set[str]] = None) -> list[dict]:
    if slug:
        return [r for r in rows if r["slug"] == slug]
    if not run_all:
        return []
    chosen = [r for r in rows if r.get("website") and r.get("status") != "bloqué" and int(r.get("feasibility") or 3) <= min_feasibility
              and (not platforms or platforms_of(r) & platforms)
              and (not sections or set(r["sections"]) & sections)]
    return chosen[:limit] if limit else chosen


def main(argv: Optional[list[str]] = None) -> int:
    ap = argparse.ArgumentParser(prog="python3 -m scraper.venues")
    group = ap.add_mutually_exclusive_group(required=True)
    group.add_argument("--venue", help="slug offi du lieu (colonne slug du catalogue)")
    group.add_argument("--all", action="store_true", help="tous les lieux avec site et faisabilité suffisante")
    ap.add_argument("--catalogue", default="data/venues/catalogue.csv")
    ap.add_argument("--out", default="data/venues/events.jsonl")
    # Faisabilité 3 incluse par défaut depuis le 07/11/2026 : les sites « HTML sur mesure » sont lus par le repli
    # HTML de l'extracteur générique et par les adaptateurs spécifiques (MC93, Nord-Ouest…), qui sont tous notés 3.
    ap.add_argument("--max-feasibility", type=int, default=3, help="avec --all : ignore les lieux de faisabilité supérieure")
    ap.add_argument("--workers", type=int, default=10, help="lieux traités en parallèle (domaines distincts ; la politesse est par domaine)")
    ap.add_argument("--limit", type=int, help="avec --all : nombre max de lieux")
    ap.add_argument("--platforms", help="avec --all : ne garde que les lieux vendus via ces billetteries (ex. mapado,billetreduc,tick_and_live,shotgun : vague 1)")
    ap.add_argument("--sections", help="avec --all : ne garde que les lieux de ces sections offi (ex. theatre)")
    args = ap.parse_args(argv)

    venues = select_venues(load_catalogue(args.catalogue), args.venue, args.all, args.max_feasibility, args.limit,
                       set(args.platforms.split(",")) if args.platforms else None,
                       set(args.sections.split(",")) if args.sections else None)
    if not venues:
        print("Aucun lieu sélectionné", file=sys.stderr)
        return 1
    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    fetcher = PoliteFetcher()

    def run(venue: dict) -> tuple[dict, list[dict], dict]:
        try:
            records, info = adapters.run_venue(fetcher, venue)
        except Exception as exc:  # un lieu qui plante ne doit pas arrêter le lot
            records, info = [], {"adapter": "", "status": f"erreur {type(exc).__name__}"}
        return venue, records, info

    total = 0
    report_path = os.path.splitext(args.out)[0] + "_report.csv"
    # Domaines distincts d'un lieu à l'autre ; le fetcher garde 1 requête/s par domaine.
    with open(args.out, "w", encoding="utf-8") as out, open(report_path, "w", encoding="utf-8", newline="") as rep, \
            ThreadPoolExecutor(max_workers=args.workers) as pool:
        report = csv.writer(rep)
        report.writerow(["slug", "adapter", "status", "events"])
        for venue, records, info in pool.map(run, venues):
            records = [r for r in records if not is_navigation_title(r.get("title", ""))]
            for record in records:
                out.write(dumps(record) + "\n")
            out.flush()
            total += len(records)
            report.writerow([venue["slug"], info.get("adapter"), info.get("status"), len(records)])
            rep.flush()
            print(f"{venue['slug']}: {len(records)} événements ({info.get('adapter')}, {info.get('status')})", file=sys.stderr)
    print(f"{total} événements écrits dans {args.out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
