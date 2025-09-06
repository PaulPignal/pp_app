#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Scraper Offi.fr (théâtre) - Polite & robots-aware

Fonctionnel :
- Crawl à partir de seed URLs (listing ou détail)
- Respect robots.txt (User-Agent configurable)
- Throttling (sleep aléatoire min-max)
- Filtrage d'URLs interdites (/connexion.html, ?sort=, ?valuesSortGroup=)
- Extraction pages de détail théâtre :
    * Titre <h1>
    * Lieu (heuristique)
    * Adresse (si présente)
    * Dates début/fin (FR -> ISO)
    * Durée (ex. "1h30" -> minutes)
    * Prix (min/max si range)
    * Image (og:image)
    * Catégorie ("théâtre" si path)
    * Description (sections 'Présentation'/'Résumé'/'Synopsis' ; fallback meta description)
- Sortie JSONL
- CLI : --seeds, --out, --max-pages, --same-path, --ua, --min-delay, --max-delay
"""

from __future__ import annotations
import argparse
import json
import logging
import os
import random
import re
import time
from collections import deque
from dataclasses import dataclass, asdict
from datetime import datetime, date
from typing import Iterable, Optional
from urllib.parse import urlparse, urljoin, urlunparse, parse_qsl, urlencode
from urllib import robotparser

import requests
from bs4 import BeautifulSoup

# -----------------------
# Config & constantes
# -----------------------
DEFAULT_UA = "OffiTheatreScraper/1.0 (+https://example.org; contact: you@example.org)"
BASE_HOSTS = {"www.offi.fr", "offi.fr"}
DISALLOWED_SUBSTRINGS = [
    "/connexion.html",
]
DISALLOWED_QUERY_KEYS = {"sort", "valuesSortGroup"}
MAX_CONTENT_LENGTH = 5_000_000  # 5MB hard cap to avoid giant pages

FR_MONTHS = {
    "janvier": 1, "février": 2, "fevrier": 2, "mars": 3, "avril": 4, "mai": 5, "juin": 6,
    "juillet": 7, "août": 8, "aout": 8, "septembre": 9, "octobre": 10, "novembre": 11, "décembre": 12, "decembre": 12
}

# Détails page heuristics:
DETAIL_PATH_REGEX = re.compile(r"^/theatre/[^/]+-\d+/.+\.html$")
LISTING_HINT = "/theatre/programme.html"

PRICE_RE = re.compile(r"(\d+[.,]?\d*)\s*€")
PRICE_RANGE_RE = re.compile(r"(\d+)\s*[–\-—]\s*(\d+)\s*€")
DURATION_RE = re.compile(r"Durée\s*[:\-]?\s*([0-9hHmn\s]+)")
# Dates styles:
# "Du 10 septembre 2025 au 15 octobre 2025"
DU_AU_RE = re.compile(
    r"\b[Dd]u\s+(\d{1,2})(?:er)?\s+([a-zA-Zéèêëàâîïôöùûüç]+)\s+(\d{4})\s+au\s+(\d{1,2})(?:er)?\s+([a-zA-Zéèêëàâîïôöùûüç]+)\s+(\d{4})"
)
# "Le 5 octobre 2025" ou "À partir du 3 juin 2025"
LE_RE = re.compile(
    r"\b(?:[Ll]e|[ÀA] partir du)\s+(\d{1,2})(?:er)?\s+([a-zA-Zéèêëàâîïôöùûüç]+)\s+(\d{4})"
)
# time tag fallback
TIME_DT_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

PARIS_POSTAL_RE = re.compile(r"\b75(0\d|1\d|2\d)\b")  # 75001..752xx capture, on restreint 75001-75020 après

# -----------------------
# Dataclasses
# -----------------------
@dataclass
class OffiItem:
    url: str
    title: Optional[str]
    venue: Optional[str]
    address: Optional[str]
    arrondissement: Optional[int]
    date_start: Optional[str]   # YYYY-MM-DD
    date_end: Optional[str]     # YYYY-MM-DD
    duration_min: Optional[int]
    price_min_eur: Optional[float]
    price_max_eur: Optional[float]
    image: Optional[str]
    category: Optional[str]
    description: Optional[str]
    crawled_at: str

# -----------------------
# Utilitaires
# -----------------------
def normalize_url(url: str) -> str:
    """Nettoie l'URL (enlève fragments, normalise query en enlevant clés interdites)."""
    p = urlparse(url)
    if p.netloc not in BASE_HOSTS:
        return url  # sera filtré plus tard
    # filtre les query keys interdites
    q = {k: v for k, v in parse_qsl(p.query, keep_blank_values=True) if k not in DISALLOWED_QUERY_KEYS}
    new_p = p._replace(fragment="", query=urlencode(q))
    return urlunparse(new_p)

def is_forbidden(url: str) -> bool:
    """Filtre rapide en plus de robots."""
    if any(bad in url for bad in DISALLOWED_SUBSTRINGS):
        return True
    p = urlparse(url)
    if p.netloc not in BASE_HOSTS:
        return True
    # on laisse robots.txt décider du reste
    return False

def load_robots(ua: str) -> robotparser.RobotFileParser:
    rp = robotparser.RobotFileParser()
    rp.set_url("https://www.offi.fr/robots.txt")
    rp.read()
    # robotparser ne gère pas le Crawl-delay standardisé, mais on a notre propre throttling
    return rp

def polite_get(url: str, ua: str, min_delay: float, max_delay: float, last_fetch_time: list[float]) -> Optional[requests.Response]:
    """GET avec UA, timeout, taille max, + sleep aléatoire entre requêtes."""
    # Throttle
    now = time.time()
    if last_fetch_time[0] is not None:
        # respecter un délai min entre requêtes successives
        sleep_s = random.uniform(min_delay, max_delay)
        time.sleep(sleep_s)
    last_fetch_time[0] = now

    headers = {"User-Agent": ua, "Accept-Language": "fr,fr-FR;q=0.9,en;q=0.8"}
    try:
        resp = requests.get(url, headers=headers, timeout=15)
        cl = resp.headers.get("Content-Length")
        if cl and cl.isdigit() and int(cl) > MAX_CONTENT_LENGTH:
            logging.warning("Content-Length trop grand: %s", url)
            return None
        if len(resp.content) > MAX_CONTENT_LENGTH:
            logging.warning("Réponse trop grande: %s", url)
            return None
        resp.encoding = resp.encoding or "utf-8"
        return resp
    except requests.RequestException as e:
        logging.warning("Erreur réseau sur %s : %s", url, e)
        return None

def extract_text(el) -> str:
    return re.sub(r"\s+", " ", el.get_text(" ", strip=True)).strip()

def parse_fr_date_to_iso(txt: str) -> Optional[str]:
    """Extrait la première date FR trouvée -> 'YYYY-MM-DD'."""
    m = re.search(r"(\d{1,2})(?:er)?\s+([a-zA-Zéèêëàâîïôöùûüç]+)\s+(\d{4})", txt)
    if not m:
        return None
    d, mname, y = m.groups()
    mname = mname.lower()
    mnum = FR_MONTHS.get(mname)
    if not mnum:
        return None
    try:
        dt = date(int(y), int(mnum), int(d))
        return dt.isoformat()
    except ValueError:
        return None

def parse_du_au(txt: str) -> tuple[Optional[str], Optional[str]]:
    m = DU_AU_RE.search(txt)
    if not m:
        return None, None
    d1, m1, y1, d2, m2, y2 = m.groups()
    s1 = parse_fr_date_to_iso(f"{d1} {m1} {y1}")
    s2 = parse_fr_date_to_iso(f"{d2} {m2} {y2}")
    return s1, s2

def parse_le(txt: str) -> Optional[str]:
    m = LE_RE.search(txt)
    if not m:
        return None
    d, mname, y = m.groups()
    return parse_fr_date_to_iso(f"{d} {mname} {y}")

def parse_duration_minutes(txt: str) -> Optional[int]:
    m = DURATION_RE.search(txt)
    if not m:
        return None
    raw = m.group(1).lower().replace(" ", "")
    # formats possibles: "1h30", "2h", "90mn", "90min"
    h, mn = 0, 0
    if "h" in raw:
        parts = raw.split("h")
        try:
            h = int(parts[0] or 0)
        except ValueError:
            h = 0
        if len(parts) > 1 and parts[1]:
            try:
                mn = int(re.sub(r"[^0-9]", "", parts[1]))
            except ValueError:
                mn = 0
    elif "mn" in raw or "min" in raw:
        try:
            mn = int(re.sub(r"[^0-9]", "", raw))
        except ValueError:
            mn = 0
    else:
        # juste un nombre => minutes
        try:
            mn = int(re.sub(r"[^0-9]", "", raw))
        except ValueError:
            mn = 0
    total = h * 60 + mn
    return total if total > 0 else None

def parse_prices(txt: str) -> tuple[Optional[float], Optional[float]]:
    # d'abord range "12-30 €"
    m = PRICE_RANGE_RE.search(txt.replace(" ", ""))
    if m:
        lo, hi = m.groups()
        return float(lo.replace(",", ".")), float(hi.replace(",", "."))
    # sinon, toutes les occurrences "xx €"
    nums = [float(x.replace(",", ".")) for x in PRICE_RE.findall(txt)]
    if not nums:
        return None, None
    return (min(nums), max(nums)) if len(nums) > 1 else (nums[0], nums[0])

def find_arrondissement(address: str | None) -> Optional[int]:
    if not address:
        return None
    m = PARIS_POSTAL_RE.search(address.replace(" ", ""))
    if not m:
        return None
    # Convertir 75001..75020
    m2 = re.search(r"\b75(0\d)\b", address.replace(" ", ""))
    if not m2:
        return None
    two = int(m2.group(1))
    if 1 <= two <= 20:
        return two
    return None

def same_path_allowed(url: str, allowed_prefixes: set[str]) -> bool:
    if not allowed_prefixes:
        return True
    p = urlparse(url)
    for pref in allowed_prefixes:
        if p.path.startswith(pref):
            return True
    return False

def looks_like_detail(path: str) -> bool:
    return bool(DETAIL_PATH_REGEX.match(path))

def extract_description(soup: BeautifulSoup) -> Optional[str]:
    """
    Heuristiques DOM :
      1) Rechercher sections dont heading contient 'Présentation' / 'Résumé' / 'Synopsis'
      2) Prendre paragraphes qui suivent jusqu'au prochain heading de même niveau
      3) Fallback: meta[name=description] ou meta[property=og:description]
    """
    headings = soup.select("h2, h3, h4")
    wanted = None
    for h in headings:
        txt = extract_text(h).lower()
        if any(key in txt for key in ("présentation", "presentation", "résumé", "resume", "synopsis")):
            wanted = h
            break
    if wanted:
        parts = []
        for sib in wanted.next_siblings:
            # s'arrêter au prochain heading
            if getattr(sib, "name", None) in ("h2", "h3", "h4"):
                break
            if getattr(sib, "name", None) in ("p", "div", "section"):
                t = extract_text(sib)
                if t:
                    parts.append(t)
        if parts:
            return "\n\n".join(parts).strip() or None

    # Fallback meta description
    meta = soup.find("meta", attrs={"name": "description"}) or soup.find("meta", attrs={"property": "og:description"})
    if meta and meta.get("content"):
        return meta["content"].strip()
    return None

def extract_title(soup: BeautifulSoup) -> Optional[str]:
    h1 = soup.find("h1")
    return extract_text(h1) if h1 else None

def extract_image(soup: BeautifulSoup) -> Optional[str]:
    m = soup.find("meta", attrs={"property": "og:image"})
    return m["content"].strip() if m and m.get("content") else None

def extract_venue(soup: BeautifulSoup) -> Optional[str]:
    """
    Heuristiques pour le lieu :
      - Ancre proche du H1 menant à /theatre/xxx-nnnn/ (le lieu) ou libellé 'Lieu'
      - Breadcrumb: dernier ou avant-dernier lien contenant '/theatre/'
    """
    h1 = soup.find("h1")
    if h1:
        for a in h1.find_all_next("a", href=True, limit=5):
            if "/theatre/" in a["href"]:
                t = extract_text(a)
                if t and len(t) > 2:
                    return t
    # Breadcrumbs
    for sel in ("nav.breadcrumb a", "ul.breadcrumb a", "ol.breadcrumb a"):
        bc = soup.select(sel)
        if bc:
            for a in reversed(bc):
                href = a.get("href", "")
                if "/theatre/" in href:
                    t = extract_text(a)
                    if t and len(t) > 2:
                        return t
    # Fallback par libellé 'Lieu'
    lbls = soup.find_all(string=re.compile(r"\b[Ll]ieu\b\s*:"))
    for s in lbls:
        parent = getattr(s, "parent", None)
        if parent:
            a = parent.find("a")
            if a:
                return extract_text(a)
    return None

def extract_address(soup: BeautifulSoup) -> Optional[str]:
    """
    Heuristiques adresse :
      - <address>, ou classe 'adresse'/'address', ou microdata itemprop=address
      - Sinon, rechercher un bloc contenant un code postal '75xxx' et une rue
    """
    # <address>
    addr_el = soup.find("address")
    if addr_el:
        t = extract_text(addr_el)
        if t:
            return t

    # classes courantes
    for sel in (".adresse", ".address", "[itemprop=address]"):
        e = soup.select_one(sel)
        if e:
            t = extract_text(e)
            if t:
                return t

    # heuristique brute
    text = extract_text(soup)
    m = re.search(r"\b(\d{1,3}\s*,?\s*(?:rue|av(?:enue)?|bd|boulevard|quai|place|chemin|allée|impasse)\b[^,;\n]+[,;\n ]+\d{5}\s+Paris)\b", text, flags=re.IGNORECASE)
    if m:
        return m.group(1).strip()

    # fallback: un code postal parisien
    m2 = re.search(r"\b75\d{3}\s+Paris\b", text, flags=re.IGNORECASE)
    if m2:
        return m2.group(0)

    return None

def extract_dates(soup: BeautifulSoup) -> tuple[Optional[str], Optional[str]]:
    """
    Cherche d'abord un bloc de texte avec 'Du ... au ...', sinon 'Le ...',
    sinon <time datetime="YYYY-MM-DD">.
    """
    txt = extract_text(soup)

    s, e = parse_du_au(txt)
    if s or e:
        return s, e

    s2 = parse_le(txt)
    if s2:
        return s2, s2

    # time[datetime] fallback (prendre min/max)
    times = [t.get("datetime") for t in soup.find_all("time") if t.get("datetime") and TIME_DT_RE.match(t.get("datetime"))]
    times = sorted(set(times))
    if times:
        return times[0], times[-1] if len(times) > 1 else times[0]

    return None, None

def extract_prices(soup: BeautifulSoup) -> tuple[Optional[float], Optional[float]]:
    # Chercher dans un bloc 'Tarifs' / 'Billets' / 'Réservation'
    for hint in ("tarif", "tarifs", "billet", "réservation", "reservation", "prix"):
        el = soup.find(string=re.compile(hint, flags=re.IGNORECASE))
        if el:
            block = extract_text(el.parent if hasattr(el, "parent") else soup)
            lo, hi = parse_prices(block)
            if lo or hi:
                return lo, hi
    # fallback global text
    return parse_prices(extract_text(soup))

def extract_category_from_url(url: str) -> Optional[str]:
    p = urlparse(url)
    if p.path.startswith("/theatre/"):
        return "théâtre"
    return None

def parse_detail(url: str, soup: BeautifulSoup) -> OffiItem:
    title = extract_title(soup)
    venue = extract_venue(soup)
    address = extract_address(soup)
    arrondissement = find_arrondissement(address)
    dstart, dend = extract_dates(soup)
    duration = parse_duration_minutes(extract_text(soup))  # cherche "Durée : ..."
    pmin, pmax = extract_prices(soup)
    image = extract_image(soup)
    category = extract_category_from_url(url)
    desc = extract_description(soup)
    return OffiItem(
        url=url,
        title=title, venue=venue, address=address, arrondissement=arrondissement,
        date_start=dstart, date_end=dend, duration_min=duration,
        price_min_eur=pmin, price_max_eur=pmax,
        image=image, category=category, description=desc,
        crawled_at=datetime.utcnow().isoformat(timespec="seconds")+"Z",
    )

def discover_links(base_url: str, soup: BeautifulSoup) -> Iterable[str]:
    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        if href.startswith("#") or not href:
            continue
        absu = urljoin(base_url, href)
        yield normalize_url(absu)

def main():
    ap = argparse.ArgumentParser(description="Scraper Offi.fr (théâtre) - Polite")
    ap.add_argument("--seeds", nargs="+", required=True, help="Seed URLs (listing et/ou détail)")
    ap.add_argument("--out", default="data/offi.jsonl", help="Chemin du fichier JSONL de sortie")
    ap.add_argument("--max-pages", type=int, default=200, help="Nombre max de pages à télécharger (total)")
    ap.add_argument("--same-path", action="store_true", help="Rester dans le(s) même(s) chemin(s) que les seeds")
    ap.add_argument("--ua", default=DEFAULT_UA, help="User-Agent explicite")
    ap.add_argument("--min-delay", type=float, default=1.0, help="Délai min (s) entre requêtes")
    ap.add_argument("--max-delay", type=float, default=2.5, help="Délai max (s) entre requêtes")
    args = ap.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )

    # Prépare robots
    rp = load_robots(args.ua)

    # Prépare allowed path prefixes si --same-path
    allowed = set()
    if args.same-path if False else False:  # placeholder to avoid syntax error in editors without CLI
        pass
    if args.same_path:
        for s in args.seeds:
            p = urlparse(s)
            allowed.add(p.path.rstrip("/"))

    q = deque()
    seen = set()
    for s in args.seeds:
        ns = normalize_url(s)
        if not is_forbidden(ns):
            q.append(ns)
            seen.add(ns)

    # Sortie
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    fout = open(args.out, "a", encoding="utf-8")

    pages_fetched = 0
    last_fetch_time = [None]  # mutable holder

    try:
        while q and pages_fetched < args.max_pages:
            url = q.popleft()
            if is_forbidden(url):
                logging.info("Filtré (interdit): %s", url)
                continue

            p = urlparse(url)

            # Respect robots.txt
            test_url = url
            if not rp.can_fetch(args.ua, test_url):
                logging.info("Robots.txt interdit: %s", url)
                continue

            # same-path restriction
            if args.same_path and not same_path_allowed(url, allowed):
                logging.info("Hors same-path: %s", url)
                continue

            resp = polite_get(url, args.ua, args.min_delay, args.max_delay, last_fetch_time)
            if not resp or resp.status_code != 200 or "text/html" not in resp.headers.get("Content-Type", ""):
                logging.info("Ignoré (HTTP/Content-Type): %s", url)
                continue

            pages_fetched += 1
            soup = BeautifulSoup(resp.text, "lxml")

            if looks_like_detail(p.path):
                # Page détail théâtre
                item = parse_detail(url, soup)
                fout.write(json.dumps(asdict(item), ensure_ascii=False) + "\n")
                logging.info("Détail extrait: %s", url)
            else:
                # Listing / autre: découverte de liens
                for link in discover_links(url, soup):
                    if link in seen or is_forbidden(link):
                        continue
                    lp = urlparse(link)
                    if lp.netloc not in BASE_HOSTS:
                        continue
                    # exclure query keys interdites (déjà nettoyées), exclure patterns spécifiques
                    if any(k in link for k in ("?sort=", "?valuesSortGroup=")):
                        continue
                    # on reste globalement sur offi.fr, mais we'll rely on same_path filter if set
                    seen.add(link)
                    q.append(link)

        logging.info("Terminé. Pages explorées: %d. Sortie: %s", pages_fetched, args.out)
    finally:
        fout.close()

if __name__ == "__main__":
    main()
