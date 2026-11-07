# -*- coding: utf-8 -*-
"""Extracteur générique schema.org : JSON-LD + microdata -> occurrences d'événements.

Pur (HTML en entrée, dicts en sortie). `occurrences_from_html` renvoie une occurrence par
objet Event trouvé ; `group_occurrences` regroupe les séances d'un même spectacle ;
`records_from_groups` produit les enregistrements au format offi (voir record.py).
"""
from __future__ import annotations

import html as htmllib
import json
import re
from datetime import date
from typing import Any, Iterable, Optional
from urllib.parse import urljoin

from bs4 import BeautifulSoup

try:
    from scraper import parsers
    from scraper.venues.record import finalize_record
except ModuleNotFoundError:  # pragma: no cover
    import parsers  # type: ignore[no-redef]
    from venues.record import finalize_record  # type: ignore[no-redef]

EVENT_TYPES = {
    "Event", "TheaterEvent", "MusicEvent", "DanceEvent", "ComedyEvent", "ExhibitionEvent",
    "VisualArtsEvent", "ScreeningEvent", "ChildrensEvent", "EducationEvent", "LiteraryEvent",
    "Festival", "SocialEvent", "SportsEvent", "PublicationEvent", "SaleEvent", "BusinessEvent",
}
TYPE_SECTION = {
    "MusicEvent": "concert", "ExhibitionEvent": "exposition", "VisualArtsEvent": "exposition",
    "ScreeningEvent": "cinema", "ChildrensEvent": "enfants", "TheaterEvent": "theatre",
    "DanceEvent": "theatre", "ComedyEvent": "theatre",
}
_DATE_FR_RE = re.compile(r"^(\d{1,2})/(\d{1,2})/(\d{4})")
_TAG_RE = re.compile(r"<[^>]+>")


# ---------- JSON-LD ----------
def _load_json(text: str) -> Any:
    cleaned = re.sub(r"^\s*<!--|-->\s*$", "", text.strip())
    for candidate in (cleaned, re.sub(r"[\x00-\x1f]+", " ", cleaned)):
        try:
            return json.loads(candidate, strict=False)
        except ValueError:
            continue
    return None


def _walk(node: Any) -> Iterable[dict]:
    if isinstance(node, list):
        for item in node:
            yield from _walk(item)
    elif isinstance(node, dict):
        yield node
        for key in ("@graph", "subEvent", "event", "events", "itemListElement", "item", "workPerformed"):
            if key in node:
                yield from _walk(node[key])


def _types(node: dict) -> set[str]:
    raw = node.get("@type")
    values = raw if isinstance(raw, list) else [raw]
    return {str(v).rsplit("/", 1)[-1] for v in values if v}


def jsonld_events(html: str) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")
    found: list[dict] = []
    for tag in soup.find_all("script", type=re.compile(r"ld\+json", re.I)):
        data = _load_json(tag.string or tag.get_text() or "")
        if data is None:
            continue
        for node in _walk(data):
            kind = _types(node) & EVENT_TYPES
            if kind:
                node = dict(node)
                node["_type"] = sorted(kind)[0]
                found.append(node)
    return found


# ---------- microdata ----------
def _md_value(el) -> Any:
    if el.has_attr("itemscope"):
        return _md_scope(el)
    for attr in ("content", "datetime", "href", "src"):
        if el.has_attr(attr) and (attr != "href" or el.name in ("a", "link")):
            return el[attr]
    if el.name in ("a", "link") and el.has_attr("href"):
        return el["href"]
    return el.get_text(" ", strip=True)


def _md_scope(scope) -> dict:
    out: dict[str, Any] = {}
    itemtype = scope.get("itemtype", "")
    out["@type"] = itemtype.rsplit("/", 1)[-1]
    for prop in scope.find_all(attrs={"itemprop": True}):
        # on ne garde que les propriétés dont le scope le plus proche est celui-ci
        if prop.find_parent(attrs={"itemscope": True}) is not scope:
            continue
        for name in prop["itemprop"].split():
            value = _md_value(prop)
            if name in out:
                if not isinstance(out[name], list):
                    out[name] = [out[name]]
                out[name].append(value)
            else:
                out[name] = value
    return out


def microdata_events(html: str) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")
    found: list[dict] = []
    for scope in soup.find_all(attrs={"itemscope": True, "itemtype": True}):
        kind = scope["itemtype"].rsplit("/", 1)[-1]
        if kind in EVENT_TYPES:
            node = _md_scope(scope)
            node["_type"] = kind
            found.append(node)
    return found


# ---------- normalisation ----------
def _first(value: Any) -> Any:
    return value[0] if isinstance(value, list) and value else value


def _text(value: Any) -> Optional[str]:
    value = _first(value)
    if isinstance(value, dict):
        value = value.get("name") or value.get("@value") or value.get("url")
    if value is None:
        return None
    cleaned = re.sub(r"\s+", " ", htmllib.unescape(_TAG_RE.sub(" ", str(value)))).strip()
    return cleaned or None


def iso_day(value: Any) -> Optional[str]:
    text = _text(value)
    if not text:
        return None
    if re.match(r"^\d{4}-\d{2}-\d{2}", text):
        day = text[:10]
        return day if parsers.is_valid_iso_date(day) else None
    m = _DATE_FR_RE.match(text)
    if m:
        day = f"{m.group(3)}-{int(m.group(2)):02d}-{int(m.group(1)):02d}"
        return day if parsers.is_valid_iso_date(day) else None
    return None


def _names(value: Any) -> list[str]:
    items = value if isinstance(value, list) else [value]
    out = []
    for item in items:
        name = _text(item)
        if name and name not in out:
            out.append(name)
    return out


def _price(value: Any) -> Optional[float]:
    text = _text(value)
    if text is None:
        return None
    m = re.search(r"\d+(?:[.,]\d+)?", text.replace(" ", "").replace(" ", ""))
    return float(m.group(0).replace(",", ".")) if m else None


def _availability(value: Any) -> Optional[str]:
    text = _text(value)
    return text.rsplit("/", 1)[-1] if text else None


def _address(location: Any) -> tuple[Optional[str], Optional[str]]:
    """(nom du lieu, adresse) depuis un champ location."""
    location = _first(location)
    if isinstance(location, str):
        return _text(location), None
    if not isinstance(location, dict):
        return None, None
    name = _text(location.get("name"))
    addr = location.get("address")
    if isinstance(addr, dict):
        parts = [addr.get("streetAddress"), addr.get("postalCode"), addr.get("addressLocality")]
        return name, " ".join(p for p in (_text(x) for x in parts) if p) or None
    return name, _text(addr)


def _offers(node: dict) -> dict:
    """prix min/max, devise, disponibilité, lien de réservation et séances (offres multiples)."""
    raw = node.get("offers")
    items = [o for o in (raw if isinstance(raw, list) else [raw]) if isinstance(o, dict)]
    prices: list[float] = []
    out: dict[str, Any] = {"availability": None, "currency": None, "booking_url": None}
    for offer in items:
        for key in ("price", "lowPrice", "highPrice"):
            p = _price(offer.get(key))
            if p is not None:
                prices.append(p)
        out["currency"] = out["currency"] or _text(offer.get("priceCurrency"))
        availability = _availability(offer.get("availability"))
        # une offre disponible l'emporte sur une épuisée : le spectacle reste réservable
        if availability and (out["availability"] in (None, "SoldOut", "OutOfStock") or availability == "InStock"):
            out["availability"] = availability
        out["booking_url"] = out["booking_url"] or _text(offer.get("url"))
    out["price_min_eur"] = min(prices) if prices else None
    out["price_max_eur"] = max(prices) if prices else None
    return out


def _image(value: Any) -> Optional[str]:
    value = _first(value)
    if isinstance(value, dict):
        value = value.get("url") or value.get("contentUrl")
    return str(value).strip() if value else None


def normalize_event(node: dict, page_url: str) -> Optional[dict]:
    """Occurrence normalisée (clés internes) depuis un nœud Event JSON-LD/microdata."""
    work = node.get("workPresented") if isinstance(node.get("workPresented"), dict) else {}
    title = _text(node.get("name") or node.get("headline") or work.get("name"))
    if not title:
        return None
    venue_name, address = _address(node.get("location"))
    offers = _offers(node)
    people = _names(node.get("performer") or node.get("actor") or work.get("actor"))
    directors = _names(node.get("director") or work.get("director"))
    access = _names(node.get("accessibilityFeature")) + _names(node.get("accessibilitySummary"))
    if str(node.get("isAccessibleForFree", "")).lower() == "true":
        offers["price_min_eur"] = offers["price_min_eur"] if offers["price_min_eur"] is not None else 0.0
    url = _text(node.get("url")) or page_url
    return {
        "title": title,
        "url": urljoin(page_url, url),
        "date_start": iso_day(node.get("startDate")),
        "date_end": iso_day(node.get("endDate")),
        "venue": venue_name,
        "address": address,
        "description": _text(node.get("description")),
        "image": _image(node.get("image")),
        "duration_min": parsers.parse_iso8601_duration(_text(node.get("duration"))),
        "cast": people,
        "director": ", ".join(directors) or None,
        "age_range": _text(node.get("typicalAgeRange")),
        "language": _text(node.get("inLanguage")),
        "event_status": _availability(node.get("eventStatus")),
        "accessibility": access,
        "type": node.get("_type"),
        **offers,
    }


def occurrences_from_html(html: str, page_url: str) -> tuple[list[dict], str]:
    """(occurrences, signal) ; signal = 'jsonld' | 'microdata' | ''."""
    nodes, signal = jsonld_events(html), "jsonld"
    if not nodes:
        nodes, signal = microdata_events(html), "microdata"
    occurrences = [o for o in (normalize_event(n, page_url) for n in nodes) if o]
    return occurrences, (signal if occurrences else "")


def blank_occurrence(title: str, url: str, day: date, start: Optional[str] = None, end_day: Optional[date] = None, **extra) -> dict:
    """Occurrence au format de `normalize_event` pour les adaptateurs qui lisent du HTML sur mesure :
    tous les champs présents (None ou vide), une séance `start` (date ISO ou date-heure) par défaut."""
    occ = {
        "title": title, "url": url, "date_start": day.isoformat(), "date_end": (end_day or day).isoformat(),
        "venue": None, "address": None, "description": None, "image": None, "duration_min": None, "cast": [],
        "director": None, "age_range": None, "language": None, "event_status": None, "accessibility": [],
        "type": "Event", "availability": None, "currency": None, "booking_url": None,
        "price_min_eur": None, "price_max_eur": None, "performances": [],
    }
    occ.update(extra)
    if occ["price_min_eur"] is not None and not occ["currency"]:
        occ["currency"] = "EUR"
    if not occ["performances"]:
        perf = {"start": start or day.isoformat()}
        for key, source in (("availability", "availability"), ("price_min_eur", "price_min_eur"), ("url", "booking_url")):
            if occ.get(source) is not None:
                perf[key] = occ[source]
        occ["performances"] = [perf]
    return occ


# ---------- regroupement ----------
def group_occurrences(occurrences: list[dict]) -> list[dict]:
    """Une entrée par spectacle (titre), séances fusionnées dans `performances`. Un site = un lieu."""
    groups: dict[str, dict] = {}
    for occ in occurrences:
        key = re.sub(r"\W+", "", occ["title"].lower())
        group = groups.get(key)
        perf = {
            "start": occ["date_start"], "end": occ["date_end"], "availability": occ["availability"],
            "price_min_eur": occ["price_min_eur"], "url": occ["booking_url"],
        }
        if group is None:
            group = dict(occ)
            group["performances"] = []
            group["_prices"] = []
            groups[key] = group
        if occ.get("performances"):  # séances déjà détaillées par la source (fiche HTML)
            group["performances"] += occ["performances"]
        else:
            cleaned = {k: v for k, v in perf.items() if v is not None}
            if cleaned.get("start"):
                group["performances"].append(cleaned)
        for p in (occ["price_min_eur"], occ["price_max_eur"]):
            if p is not None:
                group["_prices"].append(p)
        for field in ("description", "image", "duration_min", "director", "age_range", "language", "address"):
            group[field] = group.get(field) or occ.get(field)
        group["cast"] = group["cast"] or occ["cast"]
        group["accessibility"] = list(dict.fromkeys(group["accessibility"] + occ["accessibility"]))
        starts = [x for x in (group["date_start"], occ["date_start"]) if x]
        ends = [x for x in (group["date_end"], occ["date_end"], occ["date_start"]) if x]
        group["date_start"] = min(starts) if starts else None
        group["date_end"] = max(ends) if ends else None
        if occ["availability"] == "InStock" or group["availability"] is None:
            group["availability"] = occ["availability"] or group["availability"]
    for group in groups.values():
        prices = group.pop("_prices")
        group["price_min_eur"] = min(prices) if prices else None
        group["price_max_eur"] = max(prices) if prices else None
        group["performances"] = sorted(group["performances"], key=lambda p: p.get("start") or "")[:60]
    return list(groups.values())


def section_for(event_type: Optional[str], venue: dict) -> Optional[str]:
    """Section de l'œuvre : type schema.org si le lieu relève de cette section, sinon la 1re du lieu."""
    sections = venue.get("sections") or ([venue["section"]] if venue.get("section") else [])
    guess = TYPE_SECTION.get(event_type or "")
    return guess if guess in sections else (sections[0] if sections else None)


def records_from_groups(
    groups: list[dict],
    venue: dict,
    source: str,
    today: Optional[date] = None,
    keep_past: bool = False,
) -> list[dict]:
    """Enregistrements validés au format offi (+ extras). `venue` = ligne du catalogue."""
    cutoff = (today or date.today()).isoformat()
    records = []
    for g in groups:
        last = g.get("date_end") or g.get("date_start")
        if not keep_past and last and last < cutoff:
            continue
        raw = dict(g)
        raw.update({
            "section": section_for(g.get("type"), venue),
            "venue": g.get("venue") or venue.get("name"),
            "address": g.get("address") or venue.get("address"),
            "arrondissement": venue.get("city"),
            "official_url": g["url"],
            "source": source,
            "venue_slug": venue.get("slug"),
        })
        record = finalize_record(raw)
        if record:
            records.append(record)
    return records
