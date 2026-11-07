# -*- coding: utf-8 -*-
"""Récupération polie des pages : robots.txt, 1 requête/s par domaine, cache disque.

Aucun contournement : un site qui répond 401/403/429/503 (ou une page de défi anti-bot)
est noté « bloqué » et laissé de côté après une seule nouvelle tentative.
"""
from __future__ import annotations

import hashlib
import json
import os
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
DEFAULT_CACHE_DIR = os.path.expanduser("~/perso/pp_app-relance/t2-cache")
MIN_INTERVAL_S = 1.0
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
    def __init__(self, cache_dir: str = DEFAULT_CACHE_DIR, min_interval: float = MIN_INTERVAL_S, timeout: float = 20):
        self.cache_dir = cache_dir
        self.min_interval = min_interval
        self.timeout = timeout
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": USER_AGENT,
            "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
            "Accept": "text/html,application/xhtml+xml,application/xml,application/json;q=0.9,*/*;q=0.8",
        })
        self._last_hit: dict[str, float] = {}
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
        last = self._last_hit.get(host, 0.0)
        delay = self.min_interval - (time.time() - last)
        if delay > 0:
            time.sleep(delay)
        self._last_hit[host] = time.time()

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
