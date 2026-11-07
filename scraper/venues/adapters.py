# -*- coding: utf-8 -*-
"""Aiguillage par lieu : adaptateur spécifique, billetteries tierces reconnues, puis générique."""
from __future__ import annotations

from typing import Callable, Optional

try:
    from scraper.venues import billetterie, generic, schemaorg, specific, triage
    from scraper.venues.http import PoliteFetcher
except ModuleNotFoundError:  # pragma: no cover
    from venues import billetterie, generic, schemaorg, specific, triage  # type: ignore[no-redef]
    from venues.http import PoliteFetcher  # type: ignore[no-redef]

SPECIFIC: dict[str, Callable] = specific.ADAPTERS  # slug offi du lieu -> fonction(fetcher, venue, today)


def _title_key(record: dict) -> str:
    return schemaorg.re.sub(r"\W+", "", record["title"].lower())


def merge_records(batches: list[list[dict]]) -> list[dict]:
    """Fusionne par titre : le premier lot fait foi, les suivants comblent les champs vides
    (prix, disponibilité, séances) sans écraser."""
    merged: dict[str, dict] = {}
    for batch in batches:
        for record in batch:
            key = _title_key(record)
            base = merged.get(key)
            if base is None:
                merged[key] = dict(record)
                continue
            for field, value in record.items():
                if base.get(field) in (None, "", [], {}) and value not in (None, "", [], {}):
                    base[field] = value
            if record.get("source") and record["source"] not in base["source"]:
                base["source"] += "+" + record["source"].removeprefix("direct:")
    return list(merged.values())


def run_venue(fetcher: PoliteFetcher, venue: dict, today=None) -> tuple[list[dict], dict]:
    info: dict = {"adapter": "", "status": ""}
    if venue["slug"] in SPECIFIC:
        records, sub = SPECIFIC[venue["slug"]](fetcher, venue, today)
        info.update(sub)
        info["adapter"] = f"specifique:{venue['slug']}"
        return records, info
    if not venue.get("website"):
        info["status"] = "sans_site"
        return [], info
    venue = dict(venue, website=triage.normalize_website(venue["website"]))
    if venue.get("status") not in ("ok", "", None):
        info["status"] = venue["status"]
        return [], info
    platforms = [p.split(":")[0] for p in (venue.get("ticketing_all") or "").split("|") if p]
    batches: list[list[dict]] = []
    used: list[str] = []
    for platform in platforms:
        if platform in billetterie.PLATFORMS:
            records, sub = billetterie.platform_records(fetcher, venue, platform, today)
            info[f"{platform}"] = sub["status"]
            if records:
                batches.append(records)
                used.append(platform)
    records, sub = generic.generic_records(fetcher, venue, today)
    if records:
        batches.insert(0, records)
        used.insert(0, "generique")
    info["adapter"] = "+".join(used) or "aucun"
    info["status"] = "ok" if batches else (sub.get("status") or "aucun_event")
    return merge_records(batches), info
