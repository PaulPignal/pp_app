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


# --- Casting / mise en scène ---------------------------------------------------
# Offi expose les crédits différemment selon le segment :
#  - cinéma : bloc "fiche technique" labellisé ("Réalisation : X", "Principaux artistes : A, B")
#    + des liens itemprop="actors" (acteurs "(personnage)" mêlés à l'équipe "(scénario)"…) ;
#  - théâtre : une phrase de crédit ("De A, B, mise en scène C[, avec D, E]") avec itemprop="performer".
# On scope l'extraction à ces blocs pour éviter le bruit (footer "Avec L'Officiel des spectacles !").

# Rôles d'équipe à exclure du casting (parenthèse sur les liens acteurs cinéma).
_CREW_ROLES = {
    "scénario", "scenario", "musique", "montage", "image", "photographie", "photo",
    "son", "décors", "decors", "costumes", "production", "dialogues", "adaptation",
    "réalisation", "realisation", "d'après", "auteur", "mixage", "effets",
}
_CREDIT_STOP = (
    r"(?:Principaux|Genre|Nationalit|Dur[ée]e|Ann[ée]e|Date|Distributeur|Num[ée]ro|Sc[ée]nario|Visa|\||$)"
)


def _clean_credit(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip(" ,.;:•|")


def _name_only(text: str) -> str:
    # "Alida Valli ( Louise )" -> "Alida Valli"
    return _clean_credit(re.sub(r"\(.*$", "", text or ""))


def _tech_block_text(soup) -> str:
    label = soup.find(string=re.compile(r"R[ée]alisation\s*:", re.IGNORECASE))
    if not label:
        return ""
    node = label.parent
    for _ in range(4):
        if node is None or len(node.get_text(" ", strip=True)) > 60:
            break
        node = node.parent
    return _clean_credit(node.get_text(" ", strip=True)) if node else ""


def extract_credits(soup) -> tuple[Optional[str], list[str]]:
    """Retourne (director, cast) depuis une fiche Offi (BeautifulSoup). Robuste théâtre + cinéma."""
    perf_links = soup.select('a[itemprop="performer"], a[itemprop="actors"]')
    perf_block = _clean_credit(perf_links[0].parent.get_text(" ", strip=True)) if perf_links else ""
    tech_block = _tech_block_text(soup)

    director: Optional[str] = None
    tech_match = re.search(r"R[ée]alisation\s*:?\s*(.+?)\s+" + _CREDIT_STOP, tech_block, re.IGNORECASE)
    if tech_match and _clean_credit(tech_match.group(1)):
        director = _clean_credit(tech_match.group(1))
    if not director:
        stage_match = re.search(r"mise en sc[èe]ne\s+([A-ZÉÈÀ][^,.|]{2,60})", perf_block, re.IGNORECASE)
        if stage_match:
            director = _clean_credit(stage_match.group(1))

    cast: list[str] = []
    main = re.search(r"Principaux artistes\s*:?\s*(.+?)\s+" + _CREDIT_STOP, tech_block, re.IGNORECASE)
    if main:
        cast = [_clean_credit(c) for c in re.split(r",| et ", main.group(1)) if _clean_credit(c)]
    if not cast:
        avec = re.search(r"\bavec\s+(.+?)(?:[.;]|$)", perf_block, re.IGNORECASE)
        if avec:
            cast = [_clean_credit(c) for c in re.split(r",| et ", avec.group(1)) if _clean_credit(c)]
    if not cast:
        seen: set[str] = set()
        for link in soup.select('a[itemprop="actors"]'):
            text = link.get_text(" ", strip=True)
            role = re.search(r"\(([^)]+)\)", text)
            if role and role.group(1).strip().lower() in _CREW_ROLES:
                continue
            name = _name_only(text)
            if name and name.lower() not in seen:
                seen.add(name.lower())
                cast.append(name)

    cast = [c for c in cast if c and c != director and 2 <= len(c) <= 40][:8]
    return director, cast


# --- Métadonnées cinéma : nationalité + année de production ---------------------
# La « fiche technique » ciné expose "Nationalité : X" et "Année de production : YYYY".
_NATIONALITY_RE = re.compile(
    r"Nationalit[ée]\s*:?\s*([A-Za-zÀ-ÿ'’\- ,]{2,40}?)\s*"
    r"(?:Dur[ée]e|Langue|Ann[ée]e|Genre|Date|Distributeur|Num[ée]ro|Visa|R[ée]alisation|Sortie|\||$)",
    re.IGNORECASE,
)
_PROD_YEAR_RE = re.compile(r"Ann[ée]e\s+de\s+production\s*:?\s*(\d{4})", re.IGNORECASE)


def extract_cinema_meta(soup) -> tuple[Optional[str], Optional[int]]:
    """Retourne (country, year) depuis une fiche ciné (BeautifulSoup)."""
    text = soup.get_text(" ", strip=True)

    country: Optional[str] = None
    m = _NATIONALITY_RE.search(text)
    if m:
        candidate = _clean_credit(m.group(1))
        if candidate:
            country = candidate

    year: Optional[int] = None
    y = _PROD_YEAR_RE.search(text)
    if y:
        value = int(y.group(1))
        if 1880 <= value <= 2100:
            year = value

    return country, year


# --- Arrondissement / ville (théâtre) ------------------------------------------
# Microdata `addressLocality` ("Paris 5e", "Boulogne-Billancourt"). Fallback :
# dériver depuis le code postal parisien (75001..75020 → "Paris 1er..20e").
def arrondissement_from_postal(code: Optional[str]) -> Optional[str]:
    code = (code or "").strip()
    m = re.match(r"^75(\d{3})$", code)
    if not m:
        return None
    n = int(m.group(1))
    if not 1 <= n <= 20:
        return None
    suffix = "er" if n == 1 else "e"
    return f"Paris {n}{suffix}"


def extract_arrondissement(soup) -> Optional[str]:
    """Retourne la ville/arrondissement ("Paris 10e") depuis une fiche (BeautifulSoup)."""
    el = soup.select_one('[itemprop="addressLocality"]')
    if el:
        value = _clean_credit(el.get("content") or el.get_text(" ", strip=True))
        if value:
            return value

    pc = soup.select_one('[itemprop="postalCode"]')
    if pc:
        code = (pc.get("content") or pc.get_text(" ", strip=True) or "").strip()
        return arrondissement_from_postal(code)

    return None


# --- Offre billetterie : disponibilité, devise, prix structurés ----------------
# Offi expose un bloc `offers` (microdata schema.org) sur les fiches avec billetterie
# (surtout théâtre) : availability ("https://schema.org/InStock"), priceCurrency,
# lowPrice/highPrice (ou price). Plus fiable que le regex texte sur "tarif".
_KNOWN_AVAILABILITY = {
    "InStock", "SoldOut", "PreOrder", "OutOfStock", "LimitedAvailability",
    "PreSale", "Discontinued", "InStoreOnly", "OnlineOnly", "BackOrder",
}


def _itemprop_value(soup, name: str) -> Optional[str]:
    el = soup.select_one(f'[itemprop="{name}"]')
    if not el:
        return None
    value = el.get("content") or el.get("href") or el.get_text(" ", strip=True)
    return value.strip() if value else None


def _to_price(value: Optional[str]) -> Optional[float]:
    if not value:
        return None
    match = re.search(r"\d+(?:[.,]\d+)?", value)
    if not match:
        return None
    try:
        price = float(match.group(0).replace(",", "."))
    except ValueError:
        return None
    return price if 0 <= price <= 1000 else None


def extract_offers(soup) -> dict:
    """Retourne {availability, currency, price_min, price_max} depuis le bloc offers."""
    availability = _itemprop_value(soup, "availability")
    if availability:
        # "https://schema.org/InStock" -> "InStock"
        availability = availability.rstrip("/").rsplit("/", 1)[-1]
        if availability not in _KNOWN_AVAILABILITY:
            availability = None

    currency = _itemprop_value(soup, "priceCurrency")
    if currency:
        currency = currency.upper()[:3] if re.fullmatch(r"[A-Za-z]{3}", currency) else None

    low = _to_price(_itemprop_value(soup, "lowPrice"))
    high = _to_price(_itemprop_value(soup, "highPrice"))
    single = _to_price(_itemprop_value(soup, "price"))

    price_min = low if low is not None else single
    price_max = high if high is not None else single
    if price_min is not None and price_max is not None and price_min > price_max:
        price_min, price_max = price_max, price_min

    return {
        "availability": availability,
        "currency": currency,
        "price_min": price_min,
        "price_max": price_max,
    }


# --- Lieux (théâtres / cinémas) -------------------------------------------------
# Pages lieu : /theatre/<slug>-<id>.html et /cinema/<slug>-<id>.html. Même forme
# (nom, adresse structurée, géo, téléphone, métro, accès, image HD /lieu/<id>/).

_OFFI_ID_RE = re.compile(r"-(\d+)(?:\.html)?(?:[?#].*)?$")
_PHONE_RE = re.compile(r"\+?\d[\d .]{7,}\d")
_METRO_RE = re.compile(r"M[ée]tro\s*:?\s*([A-Za-zÀ-ÿ0-9 '’\-]{3,60})", re.IGNORECASE)


def offi_id_from_url(url: Optional[str]) -> Optional[int]:
    if not url:
        return None
    match = _OFFI_ID_RE.search(url.strip())
    return int(match.group(1)) if match else None


def theatre_venue_url_from_show(url: Optional[str]) -> Optional[str]:
    """Déduit l'URL de la page lieu depuis l'URL d'un spectacle de théâtre.
    /theatre/<venue>-<vid>/<show>-<sid>.html -> /theatre/<venue>-<vid>.html"""
    m = re.match(r"^(https?://[^/]+/theatre/[^/]+-\d+)/[^/]+-\d+(?:\.html)?$", (url or "").strip())
    return f"{m.group(1)}.html" if m else None


def cinema_venue_links(soup) -> list[tuple[str, int]]:
    """Liste (url, offi_id) des salles de cinéma référencées sur une fiche film."""
    seen: dict[int, str] = {}
    for a in soup.find_all("a", href=True):
        href = a["href"]
        m = re.search(r"/cinema/(?!evenement/)[a-z0-9\-]+-(\d+)\.html", href)
        if not m:
            continue
        vid = int(m.group(1))
        url = href if href.startswith("http") else f"https://www.offi.fr{href}"
        url = url.split("#", 1)[0]
        seen.setdefault(vid, url)
    return [(url, vid) for vid, url in seen.items()]


def _venue_access_features(text: str) -> Optional[str]:
    features: list[str] = []
    if re.search(r"\bPMR\b", text):
        features.append("Accès PMR")
    if re.search(r"climatis", text, re.IGNORECASE):
        features.append("Espace climatisé")
    return ", ".join(features) or None


def extract_venue(soup, source_url: str, kind: str) -> Optional[dict]:
    """Extrait les infos d'une page lieu (BeautifulSoup) → dict, ou None si pas de nom."""
    offi_id = offi_id_from_url(source_url)
    if offi_id is None:
        return None

    h1 = soup.select_one("h1")
    name = _clean_credit(h1.get_text(" ", strip=True)) if h1 else None
    if not name:
        return None

    def ip(n: str) -> Optional[str]:
        return _itemprop_value(soup, n)

    street = _clean_credit(ip("streetAddress") or "") or None
    postal = _clean_credit(ip("postalCode") or "") or None
    city = _clean_credit(ip("addressLocality") or "") or None
    country = _clean_credit(ip("addressCountry") or "") or None

    def to_float(v: Optional[str]) -> Optional[float]:
        try:
            return float(v) if v else None
        except ValueError:
            return None

    # itemprops géo capitalisés sur offi ("Latitude"/"Longitude").
    latitude = to_float(ip("Latitude") or ip("latitude"))
    longitude = to_float(ip("Longitude") or ip("longitude"))

    phone = None
    raw_phone = ip("telephone")
    if raw_phone:
        pm = _PHONE_RE.search(raw_phone)
        if pm:
            phone = re.sub(r"\s+", " ", pm.group(0)).strip()

    text = soup.get_text(" ", strip=True)
    metro = None
    mm = _METRO_RE.search(text)
    if mm:
        # On coupe à la rubrique suivante (Accès, Bus, Parking, RER…).
        metro = re.split(r"\s+(?:Acc[èe]s|Bus|Parking|Voiture|RER|Horaires|T[ée]l)\b", mm.group(1))[0]
        metro = _clean_credit(metro) or None
    access = _venue_access_features(text)

    image = None
    og = soup.find("meta", property="og:image")
    if og and og.get("content"):
        image = og["content"].strip()

    return {
        "offi_id": offi_id,
        "kind": kind,
        "name": name,
        "street_address": street,
        "postal_code": postal,
        "city": city,
        "country": country,
        "latitude": latitude,
        "longitude": longitude,
        "phone": phone,
        "metro": metro,
        "access": access,
        "image": image,
        "source_url": source_url,
    }
