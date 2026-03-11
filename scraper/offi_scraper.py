#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Scraper Offi.fr - fiches 2 segments strictes, venue=théâtre fiable, parsing dates robuste
(abréviations, numériques, JSON-LD) + pas de troncature de description, fragments/query nettoyés.

Usage :
  python offi_scraper.py --max-pages 10 --out spectacles.jsonl [--debug]
"""

from __future__ import annotations
import argparse
import json
import logging
import os
import random
import re
import sys
import time
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple, List
from urllib.parse import urljoin, urlparse, urlunparse

import requests
from bs4 import BeautifulSoup
from bs4.element import Tag

# -----------------------
# Configuration
# -----------------------
BASE_URL = "https://www.offi.fr"
PROGRAMME_BASE = f"{BASE_URL}/theatre/programme.html"
USER_AGENTS = [
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
]
RETRYABLE_STATUS_CODES = {403, 408, 425, 429, 500, 502, 503, 504}
VENUE_BLOCKLIST = {
    "pièces de théâtre",
    "pieces de theatre",
    "spectacles musicaux",
    "humour & shows",
    "théâtre",
    "theatre",
}

# Regex prix / durée
PRICE_RE = re.compile(r"(\d+(?:[.,]\d+)?)\s*€")
PRICE_RANGE_RE = re.compile(r"(\d+)\s*[-–—]\s*(\d+)\s*€")
DURATION_RE = re.compile(r"(\d+)h(?:(\d+))?|(\d+)\s*(?:mn|min)")
DURATION_CONTEXT_RE = re.compile(r"\b(?:durée|duree|dur\.)\b", re.IGNORECASE)
ADDRESS_RE = re.compile(
    r"\b\d{1,4}\s+(?:bis\s+|ter\s+)?[A-Za-zÀ-ÖØ-öø-ÿ'’\-. ]+?\b\d{5}\s+[A-Za-zÀ-ÖØ-öø-ÿ'’\-. ]+"
)
RUBRIC_RE = re.compile(r"rubrique\s+([^\.]+)\.", re.IGNORECASE)

# Mois FR (longs + abréviations, avec ou sans point)
MONTHS = {
    "janvier": 1, "janv": 1,
    "février": 2, "fevrier": 2, "févr": 2, "fevr": 2,
    "mars": 3,
    "avril": 4, "avr": 4,
    "mai": 5,
    "juin": 6,
    "juillet": 7, "juil": 7,
    "août": 8, "aout": 8,
    "septembre": 9, "sept": 9,
    "octobre": 10, "oct": 10,
    "novembre": 11, "nov": 11,
    "décembre": 12, "decembre": 12, "déc": 12, "dec": 12,
}

# Motif mois pour regex (longs + abréviations, point optionnel)
MONTH_PATTERN = (
    r"(?:janvier|janv\.?|février|fevrier|févr\.?|fevr\.?|mars|avril|avr\.?|mai|juin|juillet|juil\.?|"
    r"août|aout|septembre|sept\.?|octobre|oct\.?|novembre|nov\.?|décembre|decembre|déc\.?|dec\.?)"
)

# --- CAPTURE du mois (entre parenthèses !) ---
# Date simple "12 octobre 2025"
DATE_WORD_RE = re.compile(
    rf"(\d{{1,2}})\s+({MONTH_PATTERN})\s+(\d{{4}})",
    re.IGNORECASE,
)

# Plages "du 30 décembre 2025 au 3 janvier 2026"
RANGE_BOTH_YEARS_RE = re.compile(
    rf"du\s+(\d{{1,2}})\s+({MONTH_PATTERN})\s+(\d{{4}})\s+au\s+(\d{{1,2}})\s+({MONTH_PATTERN})\s+(\d{{4}})",
    re.IGNORECASE,
)
# Plages "du 7 septembre au 12 octobre 2025" (année à la fin)
RANGE_YEAR_AT_END_RE = re.compile(
    rf"du\s+(\d{{1,2}})\s+({MONTH_PATTERN})\s+au\s+(\d{{1,2}})\s+({MONTH_PATTERN})\s+(\d{{4}})",
    re.IGNORECASE,
)
# Plages "du 5 au 12 octobre 2025" (même mois)
RANGE_SAME_MONTH_RE = re.compile(
    rf"du\s+(\d{{1,2}})\s+au\s+(\d{{1,2}})\s+({MONTH_PATTERN})\s+(\d{{4}})",
    re.IGNORECASE,
)

# Dates numériques (dd/mm/yyyy ou dd-mm-yyyy)
DATE_NUM = r"(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})"
RANGE_NUMERIC_RE = re.compile(rf"du\s+{DATE_NUM}\s+au\s+{DATE_NUM}", re.IGNORECASE)
DATE_NUMERIC_RE = re.compile(DATE_NUM)

# Bornes simples
JUSQU_AU_RE = re.compile(
    rf"jusqu['’]?au\s+(\d{{1,2}})\s+({MONTH_PATTERN})\s+(\d{{4}})",
    re.IGNORECASE,
)
A_PARTIR_DU_RE = re.compile(
    rf"à\s+partir\s+du\s+(\d{{1,2}})\s+({MONTH_PATTERN})\s+(\d{{4}})",
    re.IGNORECASE,
)

# URL spectacle : exactement 2 segments après /theatre/
#  - /theatre/nom-de-lieu-3176/nom-de-piece-94724.html
SHOW_PATH_RE = re.compile(r"^/theatre/[^/]+-\d+/[^/]+-\d+\.html$")
# URL d'une page de théâtre (lieu) : 1 segment avec ID numérique
#  - /theatre/nom-de-lieu-3176(.html)?
VENUE_PATH_RE = re.compile(r"^/theatre/[^/]+-\d+(?:\.html)?$")


@dataclass
class Show:
    url: str
    title: Optional[str] = None
    category: Optional[str] = None
    venue: Optional[str] = None
    address: Optional[str] = None
    date_start: Optional[str] = None   # 'YYYY-MM-DD'
    date_end: Optional[str] = None     # 'YYYY-MM-DD'
    duration_min: Optional[int] = None
    price_min_eur: Optional[float] = None
    price_max_eur: Optional[float] = None
    image: Optional[str] = None
    description: Optional[str] = None
    crawled_at: Optional[str] = None

    def is_empty(self) -> bool:
        fields = [self.title, self.venue, self.date_start, self.description]
        return sum(1 for f in fields if f is not None) <= 1


@dataclass
class CrawlStats:
    pages_crawled: int = 0
    pages_failed: int = 0
    shows_extracted: int = 0
    shows_completed: int = 0
    invalid_shows: int = 0
    requests: int = 0
    retries: int = 0
    request_failures: int = 0
    cached_loaded: int = 0
    cached_reused: int = 0
    detail_fetches: int = 0


class OffiScraper:
    def __init__(
        self,
        min_delay: float = 0.7,
        max_delay: float = 1.6,
        retries: int = 4,
        timeout: float = 20,
        cache_file: Optional[str] = None,
        refresh_after_hours: int = 72,
        debug: bool = False,
    ):
        self.session = requests.Session()
        self.session.headers.update({
            "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "User-Agent": random.choice(USER_AGENTS),
        })
        self.min_delay = min_delay
        self.max_delay = max_delay
        self.last_request = 0
        self.retries = retries
        self.timeout = timeout
        self.cache_file = cache_file
        self.refresh_after = timedelta(hours=max(refresh_after_hours, 0))
        self._seen_urls: set[str] = set()
        self.debug = debug
        self.stats = CrawlStats()
        self._cache: dict[str, Show] = self._load_cache(cache_file)

    # ---------------- Utils réseau ----------------

    def _throttle(self):
        now = time.time()
        if self.last_request > 0:
            elapsed = now - self.last_request
            if elapsed < self.min_delay:
                time.sleep(random.uniform(self.min_delay - elapsed, self.max_delay))
        self.last_request = time.time()

    def _fetch_page(self, url: str) -> Optional[BeautifulSoup]:
        for attempt in range(self.retries + 1):
            self._throttle()
            self.stats.requests += 1
            self.session.headers["User-Agent"] = random.choice(USER_AGENTS)
            try:
                resp = self.session.get(url, timeout=self.timeout)
                if resp.status_code == 200 and "text/html" in resp.headers.get("content-type", ""):
                    resp.encoding = resp.encoding or "utf-8"
                    return BeautifulSoup(resp.text, "html.parser")

                if resp.status_code in RETRYABLE_STATUS_CODES and attempt < self.retries:
                    self._sleep_before_retry(url, attempt, f"HTTP {resp.status_code}", resp)
                    continue

                if self.debug:
                    logging.debug(f"[DEBUG] Statut HTTP {resp.status_code} sur {url}")
                self.stats.request_failures += 1
                return None
            except requests.RequestException as e:
                logging.warning(f"Erreur sur {url} (tentative {attempt+1}/{self.retries+1}): {e}")
                if attempt < self.retries:
                    self._sleep_before_retry(url, attempt, type(e).__name__)
                    continue
                self.stats.request_failures += 1
            except Exception as e:
                logging.exception(f"Erreur inattendue sur {url}: {e}")
                self.stats.request_failures += 1
                return None
        return None

    @staticmethod
    def _extract_text(el) -> str:
        if not el:
            return ""
        return re.sub(r"\s+", " ", el.get_text(" ", strip=True)).strip()

    @staticmethod
    def _clean_text(value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        cleaned = re.sub(r"\s+", " ", value).strip()
        return cleaned or None

    @staticmethod
    def _is_valid_iso_date(value: Optional[str]) -> bool:
        if not value:
            return False
        try:
            datetime.strptime(value, "%Y-%m-%d")
            return True
        except ValueError:
            return False

    def _retry_delay(self, attempt: int, response: Optional[requests.Response] = None) -> float:
        if response is not None:
            retry_after = response.headers.get("Retry-After")
            if retry_after and retry_after.isdigit():
                return min(float(retry_after), 30.0)

        base = min(30.0, 1.5 * (2 ** attempt))
        if response is not None and response.status_code in {403, 429}:
            base = max(base, 5.0)
        return base + random.uniform(0.1, 0.8)

    def _sleep_before_retry(self, url: str, attempt: int, reason: str, response: Optional[requests.Response] = None):
        delay = self._retry_delay(attempt, response)
        self.stats.retries += 1
        logging.warning(
            "Retry %s/%s pour %s dans %.1fs (%s)",
            attempt + 2,
            self.retries + 1,
            url,
            delay,
            reason,
        )
        time.sleep(delay)

    def _load_cache(self, cache_file: Optional[str]) -> dict[str, Show]:
        cache: dict[str, Show] = {}
        if not cache_file or not os.path.exists(cache_file):
            return cache

        try:
            with open(cache_file, "r", encoding="utf-8") as f:
                for line in f:
                    row = line.strip()
                    if not row:
                        continue
                    try:
                        payload = json.loads(row)
                    except json.JSONDecodeError:
                        continue
                    show = self._show_from_payload(payload)
                    if show:
                        cache[show.url] = show
            self.stats.cached_loaded = len(cache)
            logging.info("Cache chargé depuis %s (%s fiches)", cache_file, len(cache))
        except Exception as exc:
            logging.warning("Impossible de charger le cache %s: %s", cache_file, exc)
        return cache

    def _show_from_payload(self, payload: dict) -> Optional[Show]:
        url = payload.get("url")
        if not isinstance(url, str) or not url:
            return None
        return Show(
            url=url,
            title=payload.get("title"),
            category=payload.get("category"),
            venue=payload.get("venue"),
            address=payload.get("address"),
            date_start=payload.get("date_start"),
            date_end=payload.get("date_end"),
            duration_min=payload.get("duration_min"),
            price_min_eur=payload.get("price_min_eur"),
            price_max_eur=payload.get("price_max_eur"),
            image=payload.get("image"),
            description=payload.get("description"),
            crawled_at=payload.get("crawled_at"),
        )

    @staticmethod
    def _parse_crawled_at(value: Optional[str]) -> Optional[datetime]:
        if not value:
            return None
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None

    def _is_cache_complete(self, show: Show) -> bool:
        return bool(show.title and show.category and show.venue and show.description)

    def _should_refresh_detail(self, cached_show: Optional[Show]) -> bool:
        if cached_show is None:
            return True
        if not self._is_cache_complete(cached_show):
            return True
        if self.refresh_after == timedelta(0):
            return False
        crawled_at = self._parse_crawled_at(cached_show.crawled_at)
        if crawled_at is None:
            return True
        return datetime.now(timezone.utc) - crawled_at > self.refresh_after

    @staticmethod
    def _merge_seed_with_cache(seed: Show, cached_show: Show) -> Show:
        merged = Show(**asdict(cached_show))
        merged.url = seed.url
        if seed.title and not merged.title:
            merged.title = seed.title
        return merged

    # ---------------- Helpers dates ----------------

    @staticmethod
    def _month_to_int(name: str) -> Optional[int]:
        if not name:
            return None
        key = name.lower().replace(".", "")
        return MONTHS.get(key)

    def _to_iso(self, day: str, month_name: str, year: str) -> Optional[str]:
        m = self._month_to_int(month_name)
        if not m:
            return None
        try:
            y = int(year)
            if y < 100:  # 24 -> 2024 naïf
                y += 2000
            return f"{y:04d}-{m:02d}-{int(day):02d}"
        except ValueError:
            return None

    @staticmethod
    def _iso_from_any(s: str) -> Optional[str]:
        """Extrait 'YYYY-MM-DD' si présent (ISO, éventuellement avec heure)."""
        m = re.match(r"^\s*(\d{4})-(\d{2})-(\d{2})", s)
        return f"{m.group(1)}-{m.group(2)}-{m.group(3)}" if m else None

    def _parse_date_range_text(self, text: str) -> Tuple[Optional[str], Optional[str]]:
        """Parsing hiérarchique d'un blob de texte (priorité aux vraies plages)."""
        if not text:
            return None, None
        t = " ".join(text.lower().split())

        # 1) Plage numérique: du 05/10/2025 au 12/11/2025
        m = RANGE_NUMERIC_RE.search(t)
        if m:
            d1, mo1, y1, d2, mo2, y2 = m.group(1), m.group(2), m.group(3), m.group(4), m.group(5), m.group(6)
            s = f"{int(y1) + (2000 if len(y1) == 2 else 0):04d}-{int(mo1):02d}-{int(d1):02d}"
            e = f"{int(y2) + (2000 if len(y2) == 2 else 0):04d}-{int(mo2):02d}-{int(d2):02d}"
            return s, e

        # 2) du 30 décembre 2025 au 3 janvier 2026
        m = RANGE_BOTH_YEARS_RE.search(t)
        if m:
            d1, m1, y1, d2, m2, y2 = m.groups()
            return self._to_iso(d1, m1, y1), self._to_iso(d2, m2, y2)

        # 3) du 7 septembre au 12 octobre 2025
        m = RANGE_YEAR_AT_END_RE.search(t)
        if m:
            d1, m1, d2, m2, y = m.groups()
            return self._to_iso(d1, m1, y), self._to_iso(d2, m2, y)

        # 4) du 5 au 12 octobre 2025
        m = RANGE_SAME_MONTH_RE.search(t)
        if m:
            d1, d2, mo, y = m.groups()
            return self._to_iso(d1, mo, y), self._to_iso(d2, mo, y)

        # 5) à partir du X (seulement start)
        m = A_PARTIR_DU_RE.search(t)
        if m:
            d, mo, y = m.groups()
            return self._to_iso(d, mo, y), None

        # 6) jusqu'au Y (seulement end)
        m = JUSQU_AU_RE.search(t)
        if m:
            d, mo, y = m.groups()
            return None, self._to_iso(d, mo, y)

        # 7) Fallback : repérer toutes les dates (mots + numériques) et prendre min/max
        dates: List[str] = []
        for mm in DATE_WORD_RE.finditer(t):
            d, mo, y = mm.groups()
            iso = self._to_iso(d, mo, y)
            if iso:
                dates.append(iso)
        for mm in DATE_NUMERIC_RE.finditer(t):
            d, mo, y = mm.groups()
            yy = int(y) + 2000 if len(y) == 2 else int(y)
            iso = f"{yy:04d}-{int(mo):02d}-{int(d):02d}"
            dates.append(iso)

        dates = sorted(set(dates))
        if dates:
            if len(dates) == 1:
                return dates[0], dates[0]
            return dates[0], dates[-1]

        return None, None

    def _dates_from_jsonld(self, soup: BeautifulSoup) -> Tuple[Optional[str], Optional[str]]:
        """Cherche des startDate/endDate ISO dans le JSON-LD et renvoie min/max."""
        iso_candidates: List[str] = []
        for script in soup.find_all("script", type="application/ld+json"):
            try:
                raw = script.string or script.get_text() or ""
                for m in re.finditer(r'"(?:startDate|endDate)"\s*:\s*"([^"]+)"', raw, flags=re.IGNORECASE):
                    iso = self._iso_from_any(m.group(1))
                    if iso:
                        iso_candidates.append(iso)
            except Exception:
                continue
        if not iso_candidates:
            return None, None
        iso_candidates = sorted(set(iso_candidates))
        return iso_candidates[0], iso_candidates[-1]

    # ---------------- Parsing autres champs ----------------

    def _parse_duration(self, text: str) -> Optional[int]:
        m = DURATION_RE.search((text or "").lower())
        if not m:
            return None
        hours, minutes, total_minutes = m.groups()
        if total_minutes:
            return int(total_minutes)
        if hours:
            return int(hours) * 60 + (int(minutes) if minutes else 0)
        return None

    @staticmethod
    def _looks_like_duration_text(text: str, allow_hour_only: bool = False) -> bool:
        tl = (text or "").lower()
        has_minutes = bool(re.search(r"\b\d+\s*(?:mn|min)\b", tl))
        has_hour_token = bool(re.search(r"\b\d+h(?:(\d+))?\b", tl))
        has_hour_duration = has_hour_token and (allow_hour_only or bool(DURATION_CONTEXT_RE.search(tl)))
        return has_minutes or has_hour_duration

    def _parse_prices(self, text: str) -> tuple[Optional[float], Optional[float]]:
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

    # ---------------- URL helpers ----------------

    def _normalize_show_url(self, href: str) -> Optional[str]:
        """Absolutise + supprime query/fragment ; valide uniquement les fiches 2 segments."""
        if not href:
            return None
        try:
            u = urlparse(urljoin(BASE_URL, href))
            if not SHOW_PATH_RE.match(u.path or ""):
                return None
            cleaned = u._replace(query="", fragment="")
            return urlunparse((cleaned.scheme, cleaned.netloc, cleaned.path, "", "", ""))
        except Exception:
            return None

    def _venue_from_show_url(self, show_url: str) -> Optional[str]:
        """Extrait le théâtre depuis l’URL de la fiche (1er segment)."""
        try:
            path = urlparse(show_url).path
            parts = path.strip("/").split("/")
            if len(parts) >= 2 and parts[0] == "theatre":
                first = parts[1]  # ex: theatre-montparnasse-2825
                base = re.sub(r"-\d+$", "", first)
                if base:
                    name = base.replace("-", " ").strip()
                    return " ".join(w.capitalize() for w in name.split())
        except Exception:
            pass
        return None

    @staticmethod
    def _looks_like_venue_text(text: str) -> bool:
        if not text:
            return False
        t = text.strip()
        tl = t.lower()
        if any(k in tl for k in ["réservation", "reservation", "billet", "billetterie"]):
            return False
        if re.search(r"\d", t):
            return False
        if any(sym in t for sym in ["€", "%", "-%"]):
            return False
        if len(t.split()) < 2:
            return False
        if not re.search(r"[A-Za-zÀ-ÖØ-öø-ÿ]", t):
            return False
        if tl in VENUE_BLOCKLIST or tl.startswith("le spectacle "):
            return False
        return True

    def _extract_address(self, soup: BeautifulSoup) -> Optional[str]:
        candidates: List[str] = []

        for sel in [
            "[itemprop='streetAddress']",
            "[itemprop='address']",
            "[class*=address]",
            "[id*=address]",
            "address",
        ]:
            for el in soup.select(sel):
                txt = self._clean_text(self._extract_text(el))
                if txt:
                    candidates.append(txt)

        for txt in candidates:
            match = ADDRESS_RE.search(txt)
            if match:
                return self._clean_text(match.group(0))

        full_text = self._extract_text(soup)
        match = ADDRESS_RE.search(full_text)
        if match:
            return self._clean_text(match.group(0))

        return None

    def _extract_category(self, text: str) -> Optional[str]:
        if not text:
            return None

        match = RUBRIC_RE.search(text)
        if match:
            rubric = self._clean_text(match.group(1))
            if rubric:
                rubric_lower = rubric.lower()
                if "humour" in rubric_lower:
                    return "humour"
                if "musical" in rubric_lower:
                    return "spectacle musical"
                if "théâtre" in rubric_lower or "theatre" in rubric_lower:
                    return "théâtre"
                return rubric

        return "théâtre"

    def _validate_show(self, show: Show) -> Optional[Show]:
        show.title = self._clean_text(show.title)
        show.category = self._clean_text(show.category)
        show.venue = self._clean_text(show.venue)
        show.address = self._clean_text(show.address)
        show.image = self._clean_text(show.image)
        show.description = self._clean_text(show.description)

        if not show.title:
            logging.warning("Show ignoré sans titre: %s", show.url)
            self.stats.invalid_shows += 1
            return None

        if not show.category:
            show.category = "théâtre"

        if show.image and not show.image.startswith(("http://", "https://")):
            logging.warning("Image ignorée car URL invalide pour %s", show.url)
            show.image = None

        if show.date_start and not self._is_valid_iso_date(show.date_start):
            logging.warning("Date de début invalide pour %s: %s", show.url, show.date_start)
            show.date_start = None

        if show.date_end and not self._is_valid_iso_date(show.date_end):
            logging.warning("Date de fin invalide pour %s: %s", show.url, show.date_end)
            show.date_end = None

        if show.date_start and show.date_end and show.date_end < show.date_start:
            logging.warning("Plage de dates inversée pour %s, permutation", show.url)
            show.date_start, show.date_end = show.date_end, show.date_start

        if show.duration_min is not None and (show.duration_min <= 0 or show.duration_min > 600):
            logging.warning("Durée invalide pour %s: %s", show.url, show.duration_min)
            show.duration_min = None

        if show.price_min_eur is not None and show.price_min_eur < 0:
            logging.warning("Prix min invalide pour %s: %s", show.url, show.price_min_eur)
            show.price_min_eur = None
        if show.price_max_eur is not None and show.price_max_eur < 0:
            logging.warning("Prix max invalide pour %s: %s", show.url, show.price_max_eur)
            show.price_max_eur = None
        if (
            show.price_min_eur is not None
            and show.price_max_eur is not None
            and show.price_min_eur > show.price_max_eur
        ):
            logging.warning("Plage de prix inversée pour %s, permutation", show.url)
            show.price_min_eur, show.price_max_eur = show.price_max_eur, show.price_min_eur

        if show.is_empty():
            logging.warning("Show ignoré car insuffisamment renseigné: %s", show.url)
            self.stats.invalid_shows += 1
            return None

        return show

    # ---------------- Extraction depuis page détail ----------------

    def _complete_show_from_detail_page(self, show: Show) -> Show:
        # Salle depuis l'URL (rapide et fiable)
        if not show.venue:
            v = self._venue_from_show_url(show.url)
            if v:
                show.venue = v

        soup = self._fetch_page(show.url)
        if not soup:
            return show

        # Titre
        if not show.title:
            h1 = soup.find("h1")
            if h1:
                show.title = self._extract_text(h1)

        # Consolider la salle via breadcrumbs si lien de théâtre identifiable
        breadcrumbs = soup.select("nav.breadcrumb a, .breadcrumb a, ol.breadcrumb a") or []
        for bc in reversed(breadcrumbs):
            href = bc.get("href", "")
            if VENUE_PATH_RE.match(urlparse(urljoin(BASE_URL, href)).path or ""):
                vt = self._extract_text(bc)
                if self._looks_like_venue_text(vt):
                    show.venue = vt
                    break

        if not show.address:
            show.address = self._extract_address(soup)

        # Dates (1) : zones candidates → texte → parsing
        if not (show.date_start and show.date_end):
            date_bins: List[str] = []
            for sel in [
                "time", ".date", ".dates", ".informations", ".meta",
                "[class*=date]", "[id*=date]", "section", "article"
            ]:
                for el in soup.select(sel):
                    txt = self._extract_text(el)
                    if txt and len(txt) > 6:
                        date_bins.append(txt)
            date_text = " • ".join(date_bins[:30])
            ds, de = self._parse_date_range_text(date_text)
            if ds:
                show.date_start = ds
            if de:
                show.date_end = de

        # Dates (2) : fallback JSON-LD
        if not (show.date_start and show.date_end):
            ds2, de2 = self._dates_from_jsonld(soup)
            if ds2 and (not show.date_start or ds2 < show.date_start):
                show.date_start = ds2
            if de2 and (not show.date_end or de2 > show.date_end):
                show.date_end = de2

        # ⚠️ Pas de forçage end=start si une seule borne trouvée (sauf cas 1 seule date détectée)

        # Image OG
        if not show.image:
            og = soup.find("meta", property="og:image")
            if og and og.get("content"):
                show.image = urljoin(show.url, og["content"])

        # Description (sans troncature)
        if not show.description:
            desc_keywords = ["présentation", "résumé", "synopsis", "à propos"]
            for heading in soup.find_all(["h2", "h3", "h4"]):
                ht = self._extract_text(heading).lower()
                if any(k in ht for k in desc_keywords):
                    parts = []
                    for sib in heading.find_next_siblings():
                        if sib.name in ["h2", "h3", "h4"]:
                            break
                        if sib.name in ["p", "div", "section"]:
                            t = self._extract_text(sib)
                            if t and len(t) > 10:
                                parts.append(t)
                    if parts:
                        show.description = " ".join(parts)
                        break
            if not show.description:
                meta_desc = soup.find("meta", attrs={"name": "description"})
                if meta_desc and meta_desc.get("content"):
                    show.description = meta_desc["content"].strip()

        if not show.category:
            show.category = self._extract_category(show.description or "")

        # Prix
        if show.price_min_eur is None:
            for el in soup.find_all(string=re.compile(r"tarif|prix|billet", re.IGNORECASE)):
                parent_text = self._extract_text(getattr(el, "parent", None))
                if parent_text:
                    lo, hi = self._parse_prices(parent_text)
                    if lo is not None:
                        show.price_min_eur, show.price_max_eur = lo, hi
                        break

        # Durée
        if not show.duration_min:
            dur_texts = []
            for sel, allow_hour_only in [
                (".informations", False),
                (".meta", False),
                ("section", False),
                ("article", False),
                ("p", False),
                ("[class*=durée]", True),
                ("[class*=duree]", True),
            ]:
                for el in soup.select(sel):
                    t = self._extract_text(el)
                    if t and self._looks_like_duration_text(t, allow_hour_only=allow_hour_only):
                        dur_texts.append(t)
            if dur_texts:
                show.duration_min = self._parse_duration(" • ".join(dur_texts[:8]))

        return show

    # ---------------- Génération des pages programme ----------------

    def _get_programme_pages(self, max_pages: int) -> list[str]:
        urls = [PROGRAMME_BASE]
        for page_num in range(2, min(max_pages + 1, 200)):
            urls.append(f"{PROGRAMME_BASE}?npage={page_num}")
        return urls

    # ---------------- Crawl principal ----------------

    def crawl_programme(self, output_file: str, max_pages: int = 150) -> CrawlStats:
        logging.info(f"Démarrage crawl programme - Max pages: {max_pages}")
        output_dir = os.path.dirname(output_file)
        if output_dir:
            os.makedirs(output_dir, exist_ok=True)

        programme_urls = self._get_programme_pages(max_pages)

        with open(output_file, "w", encoding="utf-8") as f:
            for url in programme_urls:
                logging.info(f"Crawling page {self.stats.pages_crawled + 1}: {url}")
                soup = self._fetch_page(url)
                if not soup:
                    logging.warning(f"Impossible de récupérer {url}")
                    self.stats.pages_failed += 1
                    continue
                self.stats.pages_crawled += 1

                # Tous les liens
                all_links = soup.find_all("a", href=True)

                # Candidats spectacles (format strict 2 segments)
                candidate_links: list[tuple[str, Tag]] = []
                for l in all_links:
                    href = l.get("href")
                    if not href:
                        continue
                    # ignorer pagination "1 2 3"
                    link_txt = (l.get_text(strip=True) or "").strip()
                    if link_txt.isdigit():
                        continue
                    norm = self._normalize_show_url(href)
                    if norm:
                        candidate_links.append((norm, l))

                if self.debug:
                    logging.debug(f"[DEBUG] Candidats spectacle (normalisés): {len(candidate_links)}")
                    for u, l in candidate_links[:20]:
                        logging.debug(f"[DEBUG] candidat: {u} | txt: {(l.get_text(strip=True) or '')[:80]}")

                # Dédupliquer par URL normalisée
                abs_urls: list[tuple[str, Tag]] = []
                seen = set()
                for norm_url, link_el in candidate_links:
                    if norm_url not in seen:
                        abs_urls.append((norm_url, link_el))
                        seen.add(norm_url)

                page_shows = 0
                for abs_url, link_el in abs_urls:
                    if abs_url in self._seen_urls:
                        continue
                    self._seen_urls.add(abs_url)

                    show = Show(url=abs_url, crawled_at=datetime.now(timezone.utc).isoformat())

                    # Titre si dispo dans le lien
                    link_txt = (link_el.get_text(strip=True) or "").strip()
                    if link_txt and not link_txt.isdigit():
                        show.title = link_txt

                    cached_show = self._cache.get(abs_url)
                    if self._should_refresh_detail(cached_show):
                        before = asdict(show)
                        show = self._complete_show_from_detail_page(show)
                        self.stats.shows_completed += 1
                        self.stats.detail_fetches += 1
                        if self.debug:
                            logging.debug(f"[DEBUG] Complété: {show.url}")
                            logging.debug(f"[DEBUG]   avant: {json.dumps(before, ensure_ascii=False)}")
                            logging.debug(f"[DEBUG]   après: {json.dumps(asdict(show), ensure_ascii=False)}")
                    else:
                        show = self._merge_seed_with_cache(show, cached_show)
                        self.stats.cached_reused += 1
                        if self.debug:
                            logging.debug(f"[DEBUG] Réutilisé depuis cache: {show.url}")

                    validated = self._validate_show(show)
                    if not validated:
                        continue

                    f.write(json.dumps(asdict(validated), ensure_ascii=False) + "\n")
                    f.flush()
                    self.stats.shows_extracted += 1
                    page_shows += 1

                logging.info(f"Page {self.stats.pages_crawled}: {page_shows} spectacles extraits")

                if page_shows == 0 and self.stats.pages_crawled > 1:
                    logging.info("Aucun spectacle trouvé, fin de pagination probable")
                    break

        logging.info(
            "Terminé - Pages OK: %s, Pages KO: %s, Spectacles: %s, Complétions: %s, Invalides: %s, Requêtes: %s, Retries: %s, Erreurs réseau: %s, Cache chargé: %s, Cache réutilisé: %s, Détails fetchés: %s",
            self.stats.pages_crawled,
            self.stats.pages_failed,
            self.stats.shows_extracted,
            self.stats.shows_completed,
            self.stats.invalid_shows,
            self.stats.requests,
            self.stats.retries,
            self.stats.request_failures,
            self.stats.cached_loaded,
            self.stats.cached_reused,
            self.stats.detail_fetches,
        )
        return self.stats


def main():
    parser = argparse.ArgumentParser(description="Scraper Offi.fr - fiches 2 segments, venue fiable, dates robustes")
    parser.add_argument("--out", default="spectacles.jsonl", help="Fichier de sortie")
    parser.add_argument("--max-pages", type=int, default=150, help="Nombre max de pages de programme")
    parser.add_argument("--min-delay", type=float, default=0.7, help="Délai min entre requêtes")
    parser.add_argument("--max-delay", type=float, default=1.6, help="Délai max entre requêtes")
    parser.add_argument("--retries", type=int, default=4, help="Nombre de retries HTTP")
    parser.add_argument("--timeout", type=float, default=20, help="Timeout HTTP par requête en secondes")
    parser.add_argument("--cache-file", default=None, help="Fichier JSONL précédent à réutiliser comme cache")
    parser.add_argument("--refresh-after-hours", type=int, default=72, help="Âge max du cache détail avant refresh")
    parser.add_argument("--debug", action="store_true", help="Logs détaillés de diagnostic")
    args = parser.parse_args()

    logging.basicConfig(
        level=(logging.DEBUG if args.debug else logging.INFO),
        format="%(asctime)s - %(levelname)s - %(message)s"
    )

    scraper = OffiScraper(
        min_delay=args.min_delay,
        max_delay=args.max_delay,
        retries=args.retries,
        timeout=args.timeout,
        cache_file=args.cache_file,
        refresh_after_hours=args.refresh_after_hours,
        debug=args.debug,
    )
    stats = scraper.crawl_programme(args.out, args.max_pages)

    if stats.shows_extracted == 0:
        logging.error("Aucun spectacle extrait")
        return 2
    if stats.pages_crawled == 0:
        logging.error("Aucune page programme récupérée")
        return 3
    return 0


if __name__ == "__main__":
    sys.exit(main())
