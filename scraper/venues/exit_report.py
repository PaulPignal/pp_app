# -*- coding: utf-8 -*-
"""Rapport de sortie d'offi, par lieu.

Pour chaque lieu essayé en direct (une ligne dans `<events>_report.csv`), compare les spectacles
d'un run offi (JSONL, lieu lu dans l'URL) avec ceux d'un run direct :
    taux = spectacles offi retrouvés en direct / spectacles offi du lieu.
Le taux est historisé par semaine ISO. Règle de sortie (décision du 07/11/2026) : un lieu remplit
la condition quand son taux est d'au moins 90 % pendant 3 semaines consécutives
(exemple : 20 spectacles chez offi, 18 retrouvés, chaque semaine pendant 3 semaines).

Le script PROPOSE seulement : il n'écrit jamais dans `data/venues/direct_only.csv`, que Paul
modifie à la main. Un lieu de ce fichier n'est plus ingéré depuis offi.

Usage :
    python3 -m scraper.venues.exit_report --offi data/offi-theatre.jsonl --direct data/venues/events.jsonl
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import re
import sys
from collections import defaultdict
from datetime import date
from typing import Optional

try:
    from scraper.venues.coverage import read_jsonl, titles_match
except ModuleNotFoundError:  # pragma: no cover
    from venues.coverage import read_jsonl, titles_match  # type: ignore[no-redef]

THRESHOLD = 0.9
WEEKS = 3
MIN_OFFI = 5  # en dessous, un taux de 100 % ne prouve rien (hypothèse de prudence, réglable)
HISTORY_FIELDS = ["week", "date", "venue_slug", "offi_count", "found", "rate"]
OFFI_VENUE_RE = re.compile(r"^https://www\.offi\.fr/[^/]+/[^/]*?-(\d+)/[^/]+\.html")


def iso_week(day: date) -> str:
    year, week, _ = day.isocalendar()
    return f"{year}-W{week:02d}"


def week_ordinal(week: str) -> int:
    """Numéro de semaine absolu (lundi de la semaine / 7), pour tester des semaines consécutives."""
    year, num = week.split("-W")
    return date.fromisocalendar(int(year), int(num), 1).toordinal() // 7


def offi_venue_id(url: str) -> Optional[str]:
    match = OFFI_VENUE_RE.match(url or "")
    return match.group(1) if match else None


def read_direct_only(path: str) -> set[str]:
    if not os.path.exists(path):
        return set()
    out = set()
    with open(path, encoding="utf-8") as f:
        for line in f:
            slug = line.strip().split(",")[0].strip().strip('"')
            if slug and not slug.startswith("#") and slug != "venue_slug":
                out.add(slug)
    return out


def attempted_slugs(direct_jsonl: str) -> Optional[set[str]]:
    """Lieux essayés lors du run direct : colonne slug de `<events>_report.csv`, si le fichier existe."""
    report = os.path.splitext(direct_jsonl)[0] + "_report.csv"
    if not os.path.exists(report):
        return None
    with open(report, encoding="utf-8", newline="") as f:
        return {row["slug"] for row in csv.DictReader(f)}


def compute_rates(offi_records: list[dict], direct_records: list[dict], catalogue: list[dict],
                  attempted: Optional[set[str]] = None) -> dict[str, dict]:
    """Taux par lieu. Un spectacle offi compte une fois (URL), un titre direct peut en retrouver plusieurs."""
    slug_by_id = {row["offi_id"]: row["slug"] for row in catalogue}
    offi_by_slug: dict[str, dict[str, str]] = defaultdict(dict)  # slug -> url -> titre
    for record in offi_records:
        venue_id = offi_venue_id(record.get("url", ""))
        slug = slug_by_id.get(venue_id or "")
        if slug and record.get("title"):
            offi_by_slug[slug][record["url"]] = record["title"]
    direct_by_slug: dict[str, list[str]] = defaultdict(list)
    for record in direct_records:
        if record.get("venue_slug") and record.get("title"):
            direct_by_slug[record["venue_slug"]].append(record["title"])
    tried = attempted if attempted is not None else set(direct_by_slug)
    rates: dict[str, dict] = {}
    for slug, titles in offi_by_slug.items():
        if slug not in tried:
            continue
        direct_titles = direct_by_slug.get(slug, [])
        found = sum(1 for title in titles.values() if any(titles_match(title, d) for d in direct_titles))
        rates[slug] = {"offi_count": len(titles), "found": found, "rate": round(found / len(titles), 4)}
    return rates


def read_history(path: str) -> list[dict]:
    if not os.path.exists(path):
        return []
    with open(path, encoding="utf-8", newline="") as f:
        rows = list(csv.DictReader(f))
    for row in rows:
        row["offi_count"], row["found"], row["rate"] = int(row["offi_count"]), int(row["found"]), float(row["rate"])
    return rows


def update_history(history: list[dict], rates: dict[str, dict], day: date) -> list[dict]:
    """Ajoute les mesures de la semaine ISO de `day` ; relancer le script la même semaine remplace la mesure."""
    week = iso_week(day)
    kept = [row for row in history if not (row["week"] == week and row["venue_slug"] in rates)]
    for slug, m in sorted(rates.items()):
        kept.append({"week": week, "date": day.isoformat(), "venue_slug": slug, **m})
    return sorted(kept, key=lambda row: (row["week"], row["venue_slug"]))


def write_history(path: str, history: list[dict]) -> None:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=HISTORY_FIELDS)
        writer.writeheader()
        for row in history:
            writer.writerow({k: row[k] for k in HISTORY_FIELDS})


def eligible(history: list[dict], threshold: float = THRESHOLD, weeks: int = WEEKS, min_offi: int = MIN_OFFI) -> dict[str, list[dict]]:
    """Lieux dont les `weeks` dernières semaines mesurées sont consécutives et toutes au-dessus du seuil."""
    by_slug: dict[str, dict[str, dict]] = defaultdict(dict)
    for row in history:
        by_slug[row["venue_slug"]][row["week"]] = row
    out: dict[str, list[dict]] = {}
    for slug, by_week in by_slug.items():
        ordered = sorted(by_week, key=week_ordinal)
        if len(ordered) < weeks:
            continue
        last = ordered[-weeks:]
        ordinals = [week_ordinal(w) for w in last]
        if ordinals != list(range(ordinals[0], ordinals[0] + weeks)):
            continue
        rows = [by_week[w] for w in last]
        if all(r["offi_count"] >= min_offi and r["rate"] >= threshold for r in rows):
            out[slug] = rows
    return out


def streak(history: list[dict], slug: str, threshold: float = THRESHOLD, min_offi: int = MIN_OFFI) -> int:
    """Nombre de semaines consécutives récentes au-dessus du seuil (pour suivre la progression)."""
    by_week = {r["week"]: r for r in history if r["venue_slug"] == slug}
    ordered = sorted(by_week, key=week_ordinal, reverse=True)
    count, previous = 0, None
    for w in ordered:
        row = by_week[w]
        if row["offi_count"] < min_offi or row["rate"] < threshold:
            break
        if previous is not None and week_ordinal(w) != previous - 1:
            break
        count, previous = count + 1, week_ordinal(w)
    return count


def main(argv: Optional[list[str]] = None) -> int:
    ap = argparse.ArgumentParser(prog="python3 -m scraper.venues.exit_report")
    ap.add_argument("--offi", nargs="+", required=True, help="un ou plusieurs JSONL d'un run offi")
    ap.add_argument("--direct", default="data/venues/events.jsonl")
    ap.add_argument("--catalogue", default="data/venues/catalogue.csv")
    ap.add_argument("--history", default="data/venues/exit_history.csv")
    ap.add_argument("--direct-only", default="data/venues/direct_only.csv")
    ap.add_argument("--out", default="data/venues/exit_report.csv", help="rapport de la semaine (CSV)")
    ap.add_argument("--date", help="AAAA-MM-JJ, défaut aujourd'hui (UTC)")
    ap.add_argument("--threshold", type=float, default=THRESHOLD)
    ap.add_argument("--weeks", type=int, default=WEEKS)
    ap.add_argument("--min-offi", type=int, default=MIN_OFFI)
    args = ap.parse_args(argv)

    day = date.fromisoformat(args.date) if args.date else date.today()
    offi_records = [r for path in args.offi if os.path.exists(path) for r in read_jsonl(path)]
    if not offi_records:
        print("Aucun enregistrement offi lisible : rapport non calculé", file=sys.stderr)
        return 0
    with open(args.catalogue, encoding="utf-8", newline="") as f:
        catalogue = list(csv.DictReader(f))
    rates = compute_rates(offi_records, read_jsonl(args.direct), catalogue, attempted_slugs(args.direct))
    history = update_history(read_history(args.history), rates, day)
    write_history(args.history, history)
    ready = eligible(history, args.threshold, args.weeks, args.min_offi)
    already = read_direct_only(args.direct_only)
    names = {row["slug"]: row["name"] for row in catalogue}

    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    with open(args.out, "w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["venue_slug", "name", "offi_count", "found", "rate", "weeks_streak", "proposal"])
        for slug, m in sorted(rates.items(), key=lambda kv: (-kv[1]["rate"], kv[0])):
            if slug in already:
                proposal = "déjà dans direct_only.csv"
            elif slug in ready:
                proposal = "à proposer à Paul : ajouter à direct_only.csv"
            else:
                proposal = ""
            writer.writerow([slug, names.get(slug, ""), m["offi_count"], m["found"], m["rate"],
                             streak(history, slug, args.threshold, args.min_offi), proposal])

    print(f"{len(rates)} lieux mesurés (semaine {iso_week(day)}), historique : {args.history}", file=sys.stderr)
    proposals = [s for s in sorted(ready) if s not in already]
    if proposals:
        print(f"Lieux remplissant la règle de sortie ({args.weeks} semaines à {int(args.threshold * 100)} % ou plus) :", file=sys.stderr)
        for slug in proposals:
            rows = ready[slug]
            detail = ", ".join(f"{r['week']} {r['found']}/{r['offi_count']}" for r in rows)
            print(f"  - {slug} ({names.get(slug, '')}) : {detail}", file=sys.stderr)
        print("Décision manuelle : ajouter la ligne dans data/venues/direct_only.csv (jamais fait par ce script).", file=sys.stderr)
    else:
        print("Aucun lieu ne remplit encore la règle de sortie.", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
