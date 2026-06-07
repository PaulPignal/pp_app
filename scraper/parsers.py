# -*- coding: utf-8 -*-
"""Parsers purs (prix, durée, dates ISO) extraits d'OffiScraper.

Fonctions sans état ni I/O réseau, donc testables isolément. La classe
OffiScraper délègue à ce module : on réduit sa surface (God class) et on rend
ces règles de parsing directement unitestables. Comportement inchangé.
"""
from __future__ import annotations

import re
from datetime import datetime
from typing import Optional

# Regex prix / durée
PRICE_RE = re.compile(r"(\d+(?:[.,]\d+)?)\s*€")
PRICE_RANGE_RE = re.compile(r"(\d+)\s*[-–—]\s*(\d+)\s*€")
DURATION_RE = re.compile(r"(\d+)h(?:(\d+))?|(\d+)\s*(?:mn|min)")
DURATION_CONTEXT_RE = re.compile(r"\b(?:durée|duree|dur\.)\b", re.IGNORECASE)

_MINUTES_RE = re.compile(r"\b\d+\s*(?:mn|min)\b")
_HOUR_TOKEN_RE = re.compile(r"\b\d+h(?:(\d+))?\b")
_ISO8601_DURATION_RE = re.compile(r"^PT(?:(\d+)H)?(?:(\d+)M)?$", re.IGNORECASE)


def is_valid_iso_date(value: Optional[str]) -> bool:
    if not value:
        return False
    try:
        datetime.strptime(value, "%Y-%m-%d")
        return True
    except ValueError:
        return False


def parse_duration(text: str) -> Optional[int]:
    m = DURATION_RE.search((text or "").lower())
    if not m:
        return None
    hours, minutes, total_minutes = m.groups()
    if total_minutes:
        return int(total_minutes)
    if hours:
        return int(hours) * 60 + (int(minutes) if minutes else 0)
    return None


def looks_like_duration_text(text: str, allow_hour_only: bool = False) -> bool:
    tl = (text or "").lower()
    has_minutes = bool(_MINUTES_RE.search(tl))
    has_hour_token = bool(_HOUR_TOKEN_RE.search(tl))
    has_hour_duration = has_hour_token and (allow_hour_only or bool(DURATION_CONTEXT_RE.search(tl)))
    return has_minutes or has_hour_duration


def parse_iso8601_duration(value: Optional[str]) -> Optional[int]:
    if not value:
        return None
    match = _ISO8601_DURATION_RE.match(value.strip())
    if not match:
        return None
    hours = int(match.group(1) or 0)
    minutes = int(match.group(2) or 0)
    total = hours * 60 + minutes
    return total or None


def parse_prices(text: str) -> tuple[Optional[float], Optional[float]]:
    range_match = PRICE_RANGE_RE.search(text or "")
    if range_match:
        lo = float(range_match.group(1).replace(",", "."))
        hi = float(range_match.group(2).replace(",", "."))
        return lo, hi
    prices = [float(p.replace(",", ".")) for p in PRICE_RE.findall(text or "")]
    if not prices:
        return None, None
    if len(prices) == 1:
        return prices[0], prices[0]
    return min(prices), max(prices)
