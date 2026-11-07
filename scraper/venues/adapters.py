# -*- coding: utf-8 -*-
"""Aiguillage par lieu : adaptateur spécifique, billetteries tierces reconnues, puis générique."""
from __future__ import annotations

from typing import Callable, Optional

from bs4 import BeautifulSoup

try:
    from scraper.venues import billetterie, generic, js_agendas, schemaorg, specific, triage
    from scraper.venues.http import PoliteFetcher
except ModuleNotFoundError:  # pragma: no cover
    from venues import billetterie, generic, js_agendas, schemaorg, specific, triage  # type: ignore[no-redef]
    from venues.http import PoliteFetcher  # type: ignore[no-redef]

SPECIFIC: dict[str, Callable] = {**specific.ADAPTERS, **js_agendas.ADAPTERS}  # slug offi du lieu -> fonction(fetcher, venue, today)


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


def venue_platforms(fetcher: PoliteFetcher, venue: dict) -> list[str]:
    """Billetteries du lieu : celles du catalogue (triage) puis celles reconnues sur l'accueil au moment du
    run (une plateforme ajoutée après le triage, comme Vosbillets, est ainsi prise en compte sans retriage)."""
    names = [p.split(":")[0] for p in (venue.get("ticketing_all") or "").split("|") if p]
    for page in billetterie.site_pages(fetcher, venue):  # accueil + pages agenda, déjà en cache
        soup = BeautifulSoup(page.text, "html.parser")
        for name in triage.detect_ticketing(triage.external_hosts(soup, page.final_url)):
            if name not in names:
                names.append(name)
    return names


def _platform_batches(fetcher: PoliteFetcher, venue: dict, info: dict, today) -> tuple[list[list[dict]], list[str]]:
    """Lots d'enregistrements des billetteries tierces reconnues sur le site du lieu."""
    batches: list[list[dict]] = []
    used: list[str] = []
    for platform in venue_platforms(fetcher, venue):
        if platform in billetterie.PLATFORMS:
            records, sub = billetterie.platform_records(fetcher, venue, platform, today)
            info[f"{platform}"] = sub["status"]
            if records:
                batches.append(records)
                used.append(platform)
    return batches, used


def run_venue(fetcher: PoliteFetcher, venue: dict, today=None) -> tuple[list[dict], dict]:
    info: dict = {"adapter": "", "status": ""}
    if venue["slug"] in SPECIFIC:
        # Lieux à agenda « JavaScript » : User-Agent du projet (sources machine), le reste inchangé.
        active = fetcher.project_fetcher() if venue["slug"] in js_agendas.ADAPTERS else fetcher
        records, sub = SPECIFIC[venue["slug"]](active, venue, today)
        info.update(sub)
        info["adapter"] = f"specifique:{venue['slug']}"
        # Les billetteries tierces du lieu complètent l'adaptateur (prix, disponibilité, spectacles
        # absents de l'agenda du site) ; l'adaptateur fait foi en cas de doublon.
        batches, used = ([records] if records else []), []
        if venue.get("website") and venue.get("status") in ("ok", "", None):
            site = dict(venue, website=triage.normalize_website(venue["website"]))
            more, used = _platform_batches(fetcher, site, info, today)
            batches += more
        if used:
            info["adapter"] += "+" + "+".join(used)
        if batches:
            info["status"] = "ok"
        return merge_records(batches), info
    if not venue.get("website"):
        info["status"] = "sans_site"
        return [], info
    venue = dict(venue, website=triage.normalize_website(venue["website"]))
    if venue.get("status") not in ("ok", "", None):
        info["status"] = venue["status"]
        return [], info
    batches, used = _platform_batches(fetcher, venue, info, today)
    records, sub = generic.generic_records(fetcher, venue, today)
    if records:
        batches.insert(0, records)
        used.insert(0, "generique")
    info["adapter"] = "+".join(used) or "aucun"
    info["status"] = "ok" if batches else (sub.get("status") or "aucun_event")
    return merge_records(batches), info
