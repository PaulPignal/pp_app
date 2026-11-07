# -*- coding: utf-8 -*-
"""Récupération polie des pages : robots.txt, 1 requête/s par domaine, cache disque.

Aucun contournement : un site qui répond 401/403/429/503 (ou une page de défi anti-bot)
est noté « bloqué » et laissé de côté après une seule nouvelle tentative.
"""
from __future__ import annotations

import hashlib
import json
import os
import threading
import re
import time
from dataclasses import dataclass
from typing import Optional
from urllib import robotparser
from urllib.parse import urlparse

import requests

try:
    from scraper.offi_scraper import USER_AGENTS
except ModuleNotFoundError:  # exécuté depuis scraper/
    from offi_scraper import USER_AGENTS  # type: ignore[no-redef]

USER_AGENT = USER_AGENTS[1]
DEFAULT_CACHE_DIR = os.environ.get("VENUES_CACHE_DIR") or os.path.expanduser("~/perso/pp_app-relance/t2-cache")
# Durée de vie d'une page en cache (heures). Sans limite, un cache local rejoué des semaines
# plus tard servirait un agenda périmé. VENUES_CACHE_TTL_HOURS=0 désactive la limite.
DEFAULT_CACHE_TTL_HOURS = float(os.environ.get("VENUES_CACHE_TTL_HOURS", "24"))
# User-Agent qui identifie le projet (sans adresse e-mail) : utilisé par les sources machine
# (API JSON, iCal, sitemaps) ajoutées pour les lieux à agenda JavaScript.
PROJECT_USER_AGENT = "pp-app-agenda-culturel/1.0 (+https://github.com/PaulPignal/pp_app)"
MIN_INTERVAL_S = 1.0
MAX_CRAWL_DELAY_S = 10.0
MAX_BYTES = 3_000_000
BLOCK_STATUS = {401, 403, 429, 503}
_CHALLENGE_RE = re.compile(
    r"just a moment|attention required|cf-browser-verification|captcha|access denied|"
    r"datadome|px-captcha|incapsula|please enable javascript to",
    re.IGNORECASE,
)


@dataclass
class Page:
    url: str
    final_url: str
    status: int
    text: str
    from_cache: bool = False
    note: str = ""  # "", "bloqué", "robots", "erreur réseau"

    @property
    def ok(self) -> bool:
        return self.status == 200 and not self.note


class PoliteFetcher:
    def __init__(self, cache_dir: str = DEFAULT_CACHE_DIR, min_interval: float = MIN_INTERVAL_S, timeout: float = 20,
                 user_agent: str = USER_AGENT, cache_ttl_hours: float = DEFAULT_CACHE_TTL_HOURS):
        self.cache_dir = cache_dir
        self.cache_ttl_hours = cache_ttl_hours
        self.min_interval = min_interval
        self.timeout = timeout
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": user_agent,
            "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
            "Accept": "text/html,application/xhtml+xml,application/xml,application/json;q=0.9,*/*;q=0.8",
        })
        self._last_hit: dict[str, float] = {}
        self._lock = threading.Lock()
        self._project: Optional[PoliteFetcher] = None
        self._crawl_delay: dict[str, float] = {}  # hôte -> Crawl-delay de robots.txt (secondes, plafonné)
        self._robots: dict[str, Optional[robotparser.RobotFileParser]] = {}
        self.network_requests = 0
        os.makedirs(cache_dir, exist_ok=True)

    # --- cache ---
    def _cache_path(self, url: str) -> str:
        return os.path.join(self.cache_dir, hashlib.sha1(url.encode()).hexdigest() + ".json")

    def _read_cache(self, url: str) -> Optional[Page]:
        path = self._cache_path(url)
        if not os.path.exists(path):
            return None
        if self.cache_ttl_hours and time.time() - os.path.getmtime(path) > self.cache_ttl_hours * 3600:
            return None
        try:
            with open(path, encoding="utf-8") as f:
                d = json.load(f)
            return Page(url=d["url"], final_url=d["final_url"], status=d["status"], text=d["text"], from_cache=True, note=d.get("note", ""))
        except (OSError, ValueError, KeyError):
            return None

    def _write_cache(self, page: Page) -> None:
        with open(self._cache_path(page.url), "w", encoding="utf-8") as f:
            json.dump({"url": page.url, "final_url": page.final_url, "status": page.status, "text": page.text, "note": page.note}, f, ensure_ascii=False)

    # --- politesse ---
    def _wait_turn(self, host: str) -> None:
        # Réservation atomique du créneau : plusieurs lieux d'un même domaine, traités en parallèle,
        # restent à 1 requête par intervalle (le Crawl-delay de robots.txt prime s'il est plus long).
        with self._lock:
            interval = max(self.min_interval, self._crawl_delay.get(host, 0.0))
            now = time.time()
            slot = max(now, self._last_hit.get(host, 0.0) + interval)
            self._last_hit[host] = slot
        if slot > now:
            time.sleep(slot - now)

    def project_fetcher(self) -> "PoliteFetcher":
        """Fetcher partagé, User-Agent du projet : pour les sources machine (API JSON, calendriers)."""
        with self._lock:
            if self._project is None:
                self._project = PoliteFetcher(self.cache_dir, self.min_interval, self.timeout, PROJECT_USER_AGENT, self.cache_ttl_hours)
            return self._project

    def _raw_get(self, url: str) -> requests.Response:
        self._wait_turn(urlparse(url).netloc)
        self.network_requests += 1
        return self.session.get(url, timeout=self.timeout)

    def _robots_for(self, url: str) -> Optional[robotparser.RobotFileParser]:
        parsed = urlparse(url)
        origin = f"{parsed.scheme}://{parsed.netloc}"
        if origin in self._robots:
            return self._robots[origin]
        rp: Optional[robotparser.RobotFileParser] = robotparser.RobotFileParser()
        robots_url = origin + "/robots.txt"
        cached = self._read_cache(robots_url)
        text = cached.text if cached else None
        status = cached.status if cached else None
        if cached is None:
            try:
                resp = self._raw_get(robots_url)
                text, status = resp.text, resp.status_code
                self._write_cache(Page(robots_url, robots_url, status, text if status == 200 else ""))
            except requests.RequestException:
                text, status = None, None
        if status == 200 and text is not None:
            rp.parse(text.splitlines())
            delay = rp.crawl_delay("*")
            if delay:  # respecté, plafonné pour qu'un lieu ne bloque pas tout le lot (valeur absurde : 4000)
                self._crawl_delay[parsed.netloc] = min(float(delay), MAX_CRAWL_DELAY_S)
        elif status in (401, 403):
            rp.disallow_all = True  # type: ignore[attr-defined]
        else:
            rp = None  # pas de robots.txt exploitable : tout est permis
        self._robots[origin] = rp
        return rp

    def allowed(self, url: str) -> bool:
        rp = self._robots_for(url)
        return True if rp is None else rp.can_fetch("*", url)

    # --- API ---
    def get(self, url: str) -> Page:
        cached = self._read_cache(url)
        if cached is not None:
            return cached
        if not self.allowed(url):
            page = Page(url, url, 0, "", note="robots")
            self._write_cache(page)
            return page
        page = Page(url, url, 0, "", note="erreur réseau")
        for _ in range(2):
            try:
                resp = self._raw_get(url)
            except requests.RequestException:
                continue
            if resp.status_code == 200 and "charset" not in resp.headers.get("content-type", "").lower():
                resp.encoding = resp.apparent_encoding  # sans charset, requests suppose latin-1 : accents cassés
            body = resp.text[:MAX_BYTES] if resp.status_code == 200 else ""
            note = ""
            if resp.status_code in BLOCK_STATUS or (
                resp.status_code == 200 and len(body) < 40_000 and _CHALLENGE_RE.search(body[:6000])
            ):
                note = "bloqué"
            page = Page(url, resp.url, resp.status_code, body, note=note)
            if resp.status_code < 500 and not note:
                break
            time.sleep(2)
        self._write_cache(page)
        return page
