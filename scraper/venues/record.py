# -*- coding: utf-8 -*-
"""Format de sortie des extracteurs : les champs d'un enregistrement JSONL d'offi
(dataclass `Show`) plus des champs optionnels, avec les mêmes validations.

Les validations ne sont pas recopiées : on passe par `OffiScraper._validate_show`
(méthode sans réseau). Ainsi un enregistrement direct est accepté ou rejeté exactement
comme une fiche offi.
"""
from __future__ import annotations

import json
from dataclasses import asdict, fields
from datetime import datetime, timezone
from typing import Optional

try:
    from scraper.offi_scraper import OffiScraper, Show
except ModuleNotFoundError:  # pragma: no cover
    from offi_scraper import OffiScraper, Show  # type: ignore[no-redef]

OFFI_FIELDS = [f.name for f in fields(Show)]
# Champs nouveaux (optionnels) : absents d'offi, proposés pour une évolution du schéma.
EXTRA_FIELDS = [
    "source",          # "direct:jsonld", "direct:microdata", "direct:billetreduc"…
    "venue_slug",      # slug offi du lieu (jointure avec data/venues/catalogue.csv)
    "performances",    # liste de {start, end, availability, price_min_eur, url} : séances détaillées
    "booking_url",     # lien de réservation direct
    "accessibility",   # liste de mentions d'accessibilité
    "age_range",       # tranche d'âge (typicalAgeRange)
    "language",        # inLanguage
    "event_status",    # EventScheduled, EventCancelled, EventPostponed…
    "placement",       # "libre" | "numéroté"
]

_validator: Optional[OffiScraper] = None


def _get_validator() -> OffiScraper:
    global _validator
    if _validator is None:
        _validator = OffiScraper()
    return _validator


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def finalize_record(raw: dict) -> Optional[dict]:
    """Valide `raw` comme une fiche offi ; renvoie le dict JSONL (offi + extras) ou None."""
    base = {k: raw[k] for k in OFFI_FIELDS if k in raw and raw[k] is not None}
    base.setdefault("crawled_at", now_iso())
    show = Show(**base)
    validated = _get_validator()._validate_show(show)
    if validated is None:
        return None
    record = asdict(validated)
    for key in EXTRA_FIELDS:
        value = raw.get(key)
        if value in (None, "", []):
            continue
        record[key] = value
    return record


def dumps(record: dict) -> str:
    return json.dumps(record, ensure_ascii=False)
