# -*- coding: utf-8 -*-
"""Lecture d'une fiche spectacle en HTML sans schema.org : titre (og:title / h1), dates en
français dans le texte, tarifs en €, durée. Les dates et tarifs lus dans le texte sont des
heuristiques : les enregistrements sont marqués source « direct:html » (à valider par comparaison
avec offi, voir le rapport T2).
"""
from __future__ import annotations

import re
from datetime import date
from typing import Optional

from bs4 import BeautifulSoup

try:
    from scraper import parsers
    from scraper.offi_scraper import MONTH_PATTERN, MONTHS
except ModuleNotFoundError:  # pragma: no cover
    import parsers  # type: ignore[no-redef]
    from offi_scraper import MONTH_PATTERN, MONTHS  # type: ignore[no-redef]

_DATE_RE = re.compile(rf"(?<![\d/])(\d{{1,2}})(?:er)?\s+({MONTH_PATTERN})(?:\s+(\d{{4}}))?", re.IGNORECASE)
_NUM_DATE_RE = re.compile(r"(?<![\d/])(\d{1,2})/(\d{1,2})/(20\d{2})(?![\d/])")
_DURATION_CTX_RE = re.compile(r"dur[ée]e\s*:?\s*(?:environ\s*|approx\.?\s*)?([0-9]+\s*h\s*[0-9]*|[0-9]+\s*(?:min|mn))", re.IGNORECASE)
_TITLE_SUFFIX_RE = re.compile(r"\s+[|\-–—]\s+[^|\-–—]{3,60}$")
_SKIP_TAGS = ("script", "style", "nav", "footer", "noscript", "svg", "form")
MAX_HORIZON_DAYS = 550


def _main_text(soup: BeautifulSoup) -> str:
    body = soup.find("main") or soup.find("article") or soup.body or soup
    clone = BeautifulSoup(str(body), "html.parser")
    for tag in clone(list(_SKIP_TAGS)):
        tag.decompose()
    return re.sub(r"\s+", " ", clone.get_text(" ", strip=True))


def parse_dates(text: str, today: date) -> list[str]:
    """Dates ISO plausibles (de aujourd'hui à +18 mois) lues dans un texte français.
    Sans année : la prochaine occurrence du jour/mois."""
    found: set[str] = set()
    for m in _DATE_RE.finditer(text):
        day, month, year = int(m.group(1)), MONTHS.get(m.group(2).lower().rstrip(".")), m.group(3)
        if not month:
            continue
        candidates = [int(year)] if year else [today.year, today.year + 1]
        for y in candidates:
            try:
                d = date(y, month, day)
            except ValueError:
                continue
            if year or d >= today:
                found.add(d.isoformat())
                break
    for m in _NUM_DATE_RE.finditer(text):
        try:
            found.add(date(int(m.group(3)), int(m.group(2)), int(m.group(1))).isoformat())
        except ValueError:
            continue
    horizon = date.fromordinal(today.toordinal() + MAX_HORIZON_DAYS).isoformat()
    return sorted(d for d in found if today.isoformat() <= d <= horizon)


def parse_price_range(text: str) -> tuple[Optional[float], Optional[float]]:
    """Tarifs en euros du texte (0 < prix ≤ 500) ; (None, None) sinon."""
    amounts = [float(p.replace(",", ".")) for p in parsers.PRICE_RE.findall(text)]
    amounts = [a for a in amounts if 0 < a <= 500]
    return (min(amounts), max(amounts)) if amounts else (None, None)


def _meta(soup: BeautifulSoup, *names: str) -> Optional[str]:
    for name in names:
        tag = soup.find("meta", attrs={"property": name}) or soup.find("meta", attrs={"name": name})
        if tag and tag.get("content"):
            return re.sub(r"\s+", " ", tag["content"]).strip()
    return None


def parse_fiche(html: str, url: str, today: Optional[date] = None, require_date: bool = True) -> Optional[dict]:
    """Occurrence normalisée (clés de schemaorg.normalize_event) ou None sans titre (ni date, sauf `require_date=False`)."""
    today = today or date.today()
    soup = BeautifulSoup(html, "html.parser")
    h1_texts = [h.get_text(" ", strip=True) for h in soup.find_all("h1")]
    h1 = next((t for t in h1_texts if t), None)  # le 1er h1 est parfois le logo du site (vide)
    title = _meta(soup, "og:title") or h1 or (soup.title.get_text(" ", strip=True) if soup.title else None)
    if h1 and (not title or len(h1) < len(title)):
        title = h1
    if not title:
        return None
    for _ in range(2):  # « Titre | Lieu – Slogan » : on retire jusqu'à deux suffixes de site
        title = _TITLE_SUFFIX_RE.sub("", title).strip() or title
    times = [t["datetime"][:10] for t in soup.find_all("time", attrs={"datetime": True})]
    description = _meta(soup, "og:description", "description") or ""
    text = f"{description} {_main_text(soup)}"  # certains sites mettent la date dans la meta description
    dates = sorted({d for d in times if parsers.is_valid_iso_date(d) and d >= today.isoformat()} | set(parse_dates(text, today)))
    if not dates and require_date:
        return None
    low, high = parse_price_range(text)
    dm = _DURATION_CTX_RE.search(text)
    return {
        "title": title, "url": url, "date_start": dates[0] if dates else None, "date_end": dates[-1] if dates else None,
        "venue": None, "address": None,
        "description": _meta(soup, "og:description", "description"), "image": _meta(soup, "og:image"),
        "duration_min": parsers.parse_duration(dm.group(1)) if dm else None, "cast": [], "director": None,
        "age_range": None, "language": None, "event_status": None, "accessibility": [], "type": "Event",
        "availability": None, "currency": "EUR" if low is not None else None, "booking_url": None,
        "price_min_eur": low, "price_max_eur": high,
        "performances": [{"start": d} for d in dates[:60]],
    }
