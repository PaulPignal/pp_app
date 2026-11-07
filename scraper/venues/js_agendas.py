# -*- coding: utf-8 -*-
"""Adaptateurs des lieux dont l'agenda passait pour « rendu en JavaScript » (rapport T2, section 4).

Examen du 07/11/2026 : seuls l'agenda de la Philharmonie (requête AJAX de leur propre page) et celui
d'Accor Arena (API du CMS appelée par leur propre page) exigent vraiment une source machine ; les
autres lieux servaient du HTML statique que l'extracteur générique n'avait pas su lire (motif de lien
inattendu, liens préfixés par /index.php, mois chargé par `?slug=`). Toutes ces sources sont publiques,
sans authentification, et robots.txt les autorise (Crawl-delay respecté par PoliteFetcher).

Chaque adaptateur : fonction(fetcher, venue, today) -> (enregistrements, info), même contrat que
`specific.ADAPTERS`. Les enregistrements passent par `schemaorg.records_from_groups`.
"""
from __future__ import annotations

import json
import re
from datetime import date, datetime, timedelta
from typing import Callable, Optional
from urllib.parse import urlencode
from zoneinfo import ZoneInfo

from bs4 import BeautifulSoup

try:
    from scraper import parsers
    from scraper.offi_scraper import MONTHS
    from scraper.venues import schemaorg, specific
    from scraper.venues.http import PoliteFetcher
except ModuleNotFoundError:  # pragma: no cover
    import parsers  # type: ignore[no-redef]
    from offi_scraper import MONTHS  # type: ignore[no-redef]
    from venues import schemaorg, specific  # type: ignore[no-redef]
    from venues.http import PoliteFetcher  # type: ignore[no-redef]

PARIS = ZoneInfo("Europe/Paris")
MAX_FICHES = 40


def paris_iso(day: date, hour: int = 0, minute: int = 0) -> str:
    """Date et heure locales (Europe/Paris) au format ISO 8601 avec décalage."""
    return datetime(day.year, day.month, day.day, hour, minute, tzinfo=PARIS).isoformat()


def _clean(text: Optional[str]) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def occurrence(title: str, url: str, day: date, start: Optional[str] = None, end_day: Optional[date] = None, **extra) -> dict:
    """Occurrence au format attendu par `schemaorg.group_occurrences` (mêmes clés que html_fiche.parse_fiche)."""
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


def _finish(occurrences: list[dict], venue: dict, source: str, today: Optional[date], info: dict) -> tuple[list[dict], dict]:
    info["status"] = "ok" if occurrences else info.get("status") or "aucun_event"
    groups = schemaorg.group_occurrences(occurrences)
    return schemaorg.records_from_groups(groups, venue, source, today=today), info


# --------------------------------------------------------------------------------------------
# Philharmonie de Paris : requête AJAX de leur page d'agenda (/fr/agenda-ajax), robots.txt l'autorise.
# --------------------------------------------------------------------------------------------
PHILHARMONIE = "https://philharmoniedeparis.fr"
PHILHARMONIE_PAGES = 8  # une page = environ un mois ; huit pages couvrent la saison à venir


def _philharmonie_cards(fetcher: PoliteFetcher, today: Optional[date] = None) -> list[dict]:
    """Séances « concerts et spectacles » (types=1), toutes salles. La page suivante démarre le lendemain de
    `lastDate` (paramètre `startDate` du sélecteur de date de la page : le suivi par lastDate seul rend
    deux fois la même page)."""
    cards: list[dict] = []
    seen: set[str] = set()
    start = today or date.today()
    for _ in range(PHILHARMONIE_PAGES):
        page = fetcher.get(f"{PHILHARMONIE}/fr/agenda-ajax?" + urlencode({"types": "1", "startDate": start.isoformat()}))
        if not page.ok:
            break
        try:
            data = json.loads(page.text)
        except ValueError:
            break
        soup = BeautifulSoup(data.get("content", ""), "html.parser")
        for art in soup.select("article.EventCard"):
            ts = art.get("data-timestamp")
            link = art.select_one("a.EventCard-button")
            title = art.select_one(".EventCard-title")
            eid = art.get("data-performance-eid")
            if not (ts and link and title) or eid in seen:
                continue
            seen.add(eid)
            hall = art.select_one(".EventCard-place")
            sub = art.select_one(".EventCard-subtitle")
            cat = art.select_one(".EventCard-category")
            desc = art.select_one(".EventCard-description")
            img = art.select_one("img.Card-image-element")
            cards.append({
                "eid": eid, "event_eid": art.get("data-event-eid"),
                "start": datetime.fromtimestamp(int(ts), PARIS), "title": _clean(title.get_text()),
                "subtitle": _clean(sub.get_text()) if sub else "", "category": _clean(cat.get_text()) if cat else "",
                "hall": _clean(hall.get_text()) if hall else "", "href": link["href"],
                "description": _clean(desc.get_text()) if desc else None, "image": img.get("src") if img else None,
            })
        last = data.get("lastDate")
        if not data.get("moreEvents") or not last:
            break
        start = date.fromisoformat(last) + timedelta(days=1)
    return cards


def philharmonie_status(item: dict) -> dict:
    """Disponibilité et tarifs d'une séance depuis la réponse de l'endpoint de disponibilités.
    GOOD = places, LIMITED = dernières places, NONE + libellé « Complet »/« Indisponible » = complet ;
    GOOD sans mise en vente (onSale faux) : aucune disponibilité affirmée."""
    label = _clean(item.get("label")).lower()
    level = item.get("level")
    text = re.sub(r"<[^>]+>", " ", item.get("content") or "")
    prices = [float(x.replace(",", ".")) for x in parsers.PRICE_RE.findall(text)]
    prices = [p for p in prices if 0 < p <= 1000]
    out: dict = {"price_min_eur": min(prices) if prices else None, "price_max_eur": max(prices) if prices else None}
    if "annul" in label:
        out["cancelled"] = True
    elif level == "LIMITED":
        out["availability"] = "LimitedAvailability"
    elif level == "NONE" and ("complet" in label or "indisponible" in label):
        out["availability"] = "SoldOut"
    elif level == "GOOD" and item.get("onSale"):
        out["availability"] = "InStock"
    return out


def _philharmonie_availability(fetcher: PoliteFetcher, eids: list[str]) -> dict[str, dict]:
    """Disponibilité et tarifs par séance (endpoint appelé par la page elle-même, 60 séances par requête)."""
    out: dict[str, dict] = {}
    for i in range(0, len(eids), 60):
        page = fetcher.get(f"{PHILHARMONIE}/fr/async/performances/availabilities?prices=1&eids={'+'.join(eids[i:i + 60])}&onlyActivities=")  # « + » littéral : encodé en %2B, la liste est refusée
        if not page.ok:
            continue
        try:
            data = json.loads(page.text)
        except ValueError:
            continue
        for eid, item in (data.items() if isinstance(data, dict) else []):  # `[]` quand aucune séance n'est connue
            if isinstance(item, dict):
                out[eid] = philharmonie_status(item)
    return out


def philharmonie_adapter(fetcher: PoliteFetcher, venue: dict, today=None) -> tuple[list[dict], dict]:
    """Séances de la salle du lieu (nom de salle = première partie du nom du catalogue)."""
    today = today or date.today()
    wanted = _clean(venue["name"].split(" - ")[0]).lower()
    info: dict = {"status": "aucun_event"}
    mine = [c for c in _philharmonie_cards(fetcher, today) if _clean(c["hall"].split(" - ")[0]).lower() == wanted]
    availability = _philharmonie_availability(fetcher, [c["eid"] for c in mine if c["eid"]]) if mine else {}
    occurrences = []
    for c in mine:
        status = availability.get(c["eid"], {})
        if status.get("cancelled"):
            continue  # séance annulée : jamais proposée
        url = PHILHARMONIE + c["href"].split("?")[0]
        start = c["start"]
        occurrences.append(occurrence(
            c["title"], url, start.date(), start=start.isoformat(), description=c["description"] or c["subtitle"] or None,
            image=c["image"], availability=status.get("availability"), booking_url=PHILHARMONIE + c["href"],
            price_min_eur=status.get("price_min_eur"), price_max_eur=status.get("price_max_eur"), type="Event",
        ))
    return _finish(occurrences, venue, "direct:philharmonie", today, info)


# --------------------------------------------------------------------------------------------
# Théâtre des Champs-Élysées : calendrier mensuel en HTML (`/calendrier?slug=AA-MM`) + fiche (tarifs).
# --------------------------------------------------------------------------------------------
TCE = "https://www.theatrechampselysees.fr"
_TIME_RE = re.compile(r"(\d{1,2})h(\d{2})?")
_FR_MONTHS = {m: n for m, n in MONTHS.items()}


def tce_month_events(html: str, slug: str) -> list[dict]:
    """Séances d'un mois du calendrier : [{day, hour, minute, title, href, category}]."""
    year = 2000 + int(slug.split("-")[0])
    out = []
    for day_el in BeautifulSoup(html, "html.parser").select("div.calendar__day.has-events"):
        spans = day_el.select(".calendar__name span")
        m = re.match(r"(\d{1,2})(?:er)?\s+(\S+)", _clean(spans[-1].get_text())) if spans else None
        month = _FR_MONTHS.get(m.group(2).lower()) if m else None
        if not (m and month):
            continue
        day = date(year, month, int(m.group(1)))
        for li in day_el.select("li.calendar__event"):
            link = li.find("a", href=True)
            if not link:
                continue
            t = _TIME_RE.search(_clean((li.select_one(".date-value") or li).get_text()))
            raw = _clean(link.get_text())
            title, _, category = raw.partition(" | ")
            out.append({"day": day, "hour": int(t.group(1)) if t else 0, "minute": int(t.group(2) or 0) if t else 0,
                        "title": title.strip(), "href": link["href"], "category": category.strip()})
    return out


def tce_fiche(html: str) -> dict:
    soup = BeautifulSoup(html, "html.parser")
    prices = [float(p.replace(",", ".")) for p in parsers.PRICE_RE.findall(" ".join(el.get_text() for el in soup.select(".widget__prices-item .price")))]
    prices = [p for p in prices if 0 < p <= 1000]
    desc = soup.find("meta", attrs={"name": "description"})
    img = soup.find("meta", attrs={"property": "og:image"})
    book = soup.select_one("a.reservation[href]")
    return {"price_min_eur": min(prices) if prices else None, "price_max_eur": max(prices) if prices else None,
            "description": desc.get("content") if desc else None, "image": img.get("content") if img else None,
            "booking_url": book["href"] if book else None}


def tce_adapter(fetcher: PoliteFetcher, venue: dict, today=None) -> tuple[list[dict], dict]:
    today = today or date.today()
    info: dict = {"status": "aucun_event", "event_pages": 0}
    first = fetcher.get(f"{TCE}/calendrier")
    if not first.ok:
        info["status"] = first.note or f"http_{first.status}"
        return [], info
    slugs = [s for s in re.findall(r'data-slug="(\d{2}-\d{2})"', first.text)]
    slugs = sorted(set(s for s in slugs if (2000 + int(s[:2]), int(s[3:])) >= (today.year, today.month)))[:12]
    sessions = []
    for slug in slugs:
        page = first if slug == f"{today.year % 100:02d}-{today.month:02d}" else fetcher.get(f"{TCE}/calendrier?slug={slug}")
        if page.ok:
            sessions += [s for s in tce_month_events(page.text, slug) if s["day"] >= today]
    fiches: dict[str, dict] = {}
    for href in list(dict.fromkeys(s["href"] for s in sessions))[:MAX_FICHES]:
        page = fetcher.get(TCE + href)
        info["event_pages"] += 1
        fiches[href] = tce_fiche(page.text) if page.ok else {}
    occurrences = []
    for s in sessions:
        f = fiches.get(s["href"])
        if f is None:
            continue
        occurrences.append(occurrence(
            s["title"], TCE + s["href"], s["day"], start=paris_iso(s["day"], s["hour"], s["minute"]),
            description=f.get("description"), image=f.get("image"), booking_url=f.get("booking_url"),
            price_min_eur=f.get("price_min_eur"), price_max_eur=f.get("price_max_eur"),
            type="MusicEvent" if "Opéra" not in s["category"] else "TheaterEvent",
        ))
    return _finish(occurrences, venue, "direct:calendrier", today, info)


# --------------------------------------------------------------------------------------------
# Accor Arena : API du CMS, celle que la page de programmation appelle elle-même (/api-cms/custom/items/event).
# --------------------------------------------------------------------------------------------
ACCOR = "https://www.accorarena.com"


def accor_events(data: dict) -> list[dict]:
    out = []
    for item in data.get("data", []):
        if item.get("status") != "published" or not item.get("start"):
            continue
        tr = next((t for t in item.get("translations") or [] if t.get("title") and t.get("url")), None)
        title = _clean((tr or {}).get("title") or item.get("artist_reference"))
        if not title:
            continue
        start = datetime.fromisoformat(item["start"]).astimezone(PARIS)
        end = datetime.fromisoformat(item["end"]).astimezone(PARIS) if item.get("end") else start
        out.append({
            "title": title, "url": f"{ACCOR}/fr/{tr['url']}" if tr else f"{ACCOR}/fr/programmation",
            "start": start, "end": end, "booking_url": (tr or {}).get("url_event") or None,
            "price": item["min_price"] if isinstance(item.get("min_price"), (int, float)) and item["min_price"] > 0 else None,
            "category": (tr or {}).get("sub_category"),
        })
    return out


def accor_adapter(fetcher: PoliteFetcher, venue: dict, today=None) -> tuple[list[dict], dict]:
    today = today or date.today()
    info: dict = {"status": "aucun_event", "event_pages": 0}
    events: list[dict] = []
    for page_no in range(1, 6):  # 100 événements par page
        query = urlencode({"filter[start][gte]": today.isoformat(), "sort": "start", "limit": 100, "page": page_no})
        page = fetcher.get(f"{ACCOR}/api-cms/custom/items/event?{query}")
        if not page.ok:
            info["status"] = page.note or f"http_{page.status}"
            break
        try:
            batch = accor_events(json.loads(page.text))
        except ValueError:
            break
        events += batch
        if len(batch) < 100:
            break
    occurrences = [
        occurrence(e["title"], e["url"], e["start"].date(), start=e["start"].isoformat(), end_day=e["end"].date(),
                   booking_url=e["booking_url"], price_min_eur=e["price"], type="Event")
        for e in events
    ]
    return _finish(occurrences, venue, "direct:cms", today, info)


# --------------------------------------------------------------------------------------------
# MC93 : calendrier Drupal en HTML statique, une ligne par représentation avec lien de réservation.
# --------------------------------------------------------------------------------------------
MC93 = "https://www.mc93.com"


def mc93_sessions(html: str) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")
    out = []
    for month_el in soup.select("div.group-mois"):
        m = re.search(r"([a-z]{3})(\d{4})$", month_el.get("id", ""))
        if not m:
            continue
        year = int(m.group(2))
        month_name = _clean((month_el.select_one(".label-mois") or month_el).get_text()).lower()
        month = _FR_MONTHS.get(month_name)
        if not month:
            continue
        for day_el in month_el.select("div.group-jour"):
            d = re.search(r"(\d{1,2})", _clean((day_el.select_one(".label-jour") or day_el).get_text()))
            if not d:
                continue
            day = date(year, month, int(d.group(1)))
            for li in day_el.select("li.representation"):
                link = li.select_one(".titre a[href]")
                t = _TIME_RE.search(_clean((li.select_one(".heure") or li).get_text()))
                if not link:
                    continue
                book = li.select_one("a.reserver[href]")
                genre = _clean((li.select_one(".genre") or li).get_text()) if li.select_one(".genre") else ""
                dur = li.select_one(".duree")
                out.append({
                    "day": day, "hour": int(t.group(1)) if t else 0, "minute": int(t.group(2) or 0) if t else 0,
                    "title": _clean(link.get_text()), "href": link["href"], "genre": genre,
                    "hall": _clean(li.select_one(".lieu").get_text()) if li.select_one(".lieu") else None,
                    "duration": parsers.parse_duration(_clean(dur.get_text())) if dur else None,
                    "booking": book["href"] if book else None,
                })
    return out


def mc93_adapter(fetcher: PoliteFetcher, venue: dict, today=None) -> tuple[list[dict], dict]:
    today = today or date.today()
    info: dict = {"status": "aucun_event"}
    page = fetcher.get(f"{MC93}/calendrier")
    if not page.ok:
        info["status"] = page.note or f"http_{page.status}"
        return [], info
    occurrences = []
    for s in mc93_sessions(page.text):
        if s["day"] < today or re.match(r"(visite|atelier)", s["genre"], re.IGNORECASE):
            continue
        occurrences.append(occurrence(
            s["title"], MC93 + s["href"], s["day"], start=paris_iso(s["day"], s["hour"], s["minute"]),
            booking_url=s["booking"], duration_min=s["duration"], venue=None,
            type="MusicEvent" if s["genre"].lower().startswith("musique") else "TheaterEvent",
        ))
    return _finish(occurrences, venue, "direct:calendrier", today, info)


# --------------------------------------------------------------------------------------------
# La Ferme du Buisson : cartes `div.item.agenda` (genre, date, titre) du programme, HTML servi.
# --------------------------------------------------------------------------------------------
FERME = "https://www.lafermedubuisson.com"
_FERME_DATE = re.compile(r"^(\d{2})\.(\d{2})(?:\.(\d{2}))?(?:\s*-\s*(\d{2})\.(\d{2})\.(\d{2}))?(?:\s*à\s*(\d{1,2})h(\d{2}))?")


def ferme_cards(html: str) -> list[dict]:
    out = []
    for a in BeautifulSoup(html, "html.parser").select("div.item.agenda a.item-content[href]"):
        raw = _clean((a.select_one("p.date") or a).get_text()) if a.select_one("p.date") else ""
        m = _FERME_DATE.match(raw)
        title = a.select_one("p.title")
        if not (m and title):
            continue
        d1, m1, y1, d2, m2, y2, hh, mm = m.groups()
        if y2:  # « 06.11 - 07.11.26 » ou « 10.10 - 24.01.27 » : l'année de début se déduit de la fin
            end = date(2000 + int(y2), int(m2), int(d2))
            start_year = 2000 + int(y1) if y1 else end.year - (1 if int(m1) > int(m2) else 0)
            start = date(start_year, int(m1), int(d1))
        elif y1:
            start = end = date(2000 + int(y1), int(m1), int(d1))
        else:
            continue
        genre = _clean(a.select_one("p.genre").get_text()) if a.select_one("p.genre") else ""
        sub = a.select_one("p.subtitle")
        out.append({"title": _clean(title.get_text()), "href": a["href"], "start": start, "end": end,
                    "hour": int(hh) if hh else None, "minute": int(mm) if mm else 0, "genre": genre,
                    "subtitle": _clean(sub.get_text()) if sub else None})
    return out


def ferme_adapter(fetcher: PoliteFetcher, venue: dict, today=None) -> tuple[list[dict], dict]:
    today = today or date.today()
    info: dict = {"status": "aucun_event"}
    cards: list[dict] = []
    seen: set = set()
    for page_no in range(1, 6):  # 15 cartes par page, filtre « spectacles » du site
        page = fetcher.get(f"{FERME}/fr/programme?subsections=spectacles&page={page_no}")
        if not page.ok:
            info["status"] = page.note or f"http_{page.status}"
            break
        fresh = [c for c in ferme_cards(page.text) if (c["href"], c["start"]) not in seen]
        if not fresh:
            break
        seen.update((c["href"], c["start"]) for c in fresh)
        cards += fresh
    occurrences = []
    for c in cards:
        if c["genre"].lower().startswith(("cinéma", "cinema", "centre d")) or c["end"] < today:
            continue  # cinéma mis de côté, centre d'art = expositions (hors périmètre de ce lieu de théâtre)
        start_iso = paris_iso(c["start"], c["hour"] or 0, c["minute"]) if c["hour"] is not None else c["start"].isoformat()
        occurrences.append(occurrence(
            c["title"], FERME + c["href"], c["start"], start=start_iso, end_day=c["end"],
            description=c["subtitle"], type="TheaterEvent",
        ))
    return _finish(occurrences, venue, "direct:html", today, info)


# --------------------------------------------------------------------------------------------
# Théâtre de Saint-Quentin-en-Yvelines : calendrier mensuel servi par /saison/ajax.htm (même appel que
# les onglets de leur page, ici en GET).
# --------------------------------------------------------------------------------------------
SQY = "https://www.theatresqy.org"
_SQY_DAY = re.compile(r"(\d{1,2})")


def sqy_sessions(html: str, month: int, year: int) -> list[dict]:
    out = []
    for row in BeautifulSoup(html, "html.parser").select("div.calendrier"):
        link = row.select_one("a.cellBlock1[href]")
        cell = row.select_one(".cellDate")
        title = row.select_one(".cellSupport")
        if not (link and cell and title):
            continue
        d = _SQY_DAY.search(_clean(cell.get_text()))
        t = re.search(r"(\d{1,2}):(\d{2})", _clean(cell.get_text()))
        if not d:
            continue
        book = row.select_one(".cellResa a[href]")
        hall = row.select_one(".cellLieu")
        out.append({"day": date(year, month, int(d.group(1))), "hour": int(t.group(1)) if t else 0, "minute": int(t.group(2)) if t else 0,
                    "title": _clean(title.get_text()), "href": link["href"], "booking": book["href"] if book else None,
                    "hall": _clean(hall.get_text()) if hall else None})
    return out


def sqy_adapter(fetcher: PoliteFetcher, venue: dict, today=None) -> tuple[list[dict], dict]:
    today = today or date.today()
    info: dict = {"status": "aucun_event"}
    occurrences = []
    for offset in range(10):  # une saison : les dix mois à venir
        month = (today.month - 1 + offset) % 12 + 1
        year = today.year + (today.month - 1 + offset) // 12
        page = fetcher.get(f"{SQY}/saison/ajax.htm?laction=aff_calendrier&mois={month}")
        if not page.ok:
            continue
        for s in sqy_sessions(page.text, month, year):
            if s["day"] < today or "atelier" in s["title"].lower():
                continue
            occurrences.append(occurrence(
                s["title"], SQY + s["href"], s["day"], start=paris_iso(s["day"], s["hour"], s["minute"]),
                booking_url=s["booking"], type="TheaterEvent",
            ))
    return _finish(occurrences, venue, "direct:calendrier", today, info)


ADAPTERS: dict[str, Callable] = {
    "grande-salle-6005": philharmonie_adapter,
    "salle-des-concerts-6006": philharmonie_adapter,
    "amphitheatre-6007": philharmonie_adapter,
    "musee-de-la-musique-2833": philharmonie_adapter,
    "le-studio-7027": philharmonie_adapter,
    "theatre-des-champs-elysees-1756": tce_adapter,
    "palais-omnisports-de-paris-bercy-2913": accor_adapter,
    "mc-93-2756": mc93_adapter,
    "la-ferme-du-buisson-2316": ferme_adapter,
    # HTML statique dont les fiches sont reconnues par un motif de lien (vérifié le 07/11/2026)
    "theatre-de-saint-quentin-en-yvelines-4133": sqy_adapter,
    "espace-1789-2188": specific.make_adapter(["https://www.espace-1789.com/spectacle/saison"], r"^/(index\.php/)?spectacle/[a-z0-9\-]+$"),
    "theatre-trianon-3299": specific.make_adapter(["https://www.letrianon.fr/fr/programmation/"], r"^/fr/programmation/[a-z0-9\-]+/?$"),
    "elysee-montmartre-2168": specific.make_adapter(["https://www.elyseemontmartre.com/fr/programmation/"], r"^/fr/programmation/[a-z0-9\-]+/?$"),
}
