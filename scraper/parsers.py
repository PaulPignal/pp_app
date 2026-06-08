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
