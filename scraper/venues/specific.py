# -*- coding: utf-8 -*-
"""Adaptateurs propres à un lieu : sites sans schema.org ni billetterie tierce lisible mais dont
les fiches spectacle sont en HTML statique. Chaque adaptateur = pages d'agenda + motif des liens
de fiche (mesuré sur le site) ; la lecture de la fiche est commune (html_fiche.parse_fiche).

Lieux d'abord écartés comme « rendus en JavaScript » (Philharmonie, Théâtre des Champs-Élysées, MC93,
Espace 1789, Saint-Quentin-en-Yvelines, Ferme du Buisson, Accor Arena, Trianon, Élysée Montmartre) :
réexaminés le 07/11/2026, voir `js_agendas.py` (Théâtre Darius Milhaud : renoncement, aucune source).

Ajouts du 07/11/2026 (pertes de théâtre) : Théâtre du Nord-Ouest (calendrier par semaine, 423 créneaux),
Comédie Saint-Michel (fiches Drupal `?q=node/N`), Apollo Théâtre (fiches `-loNNNN.html`, comme l'Alhambra),
Théâtre de l'Épée de Bois (agenda par mois de la page saison ; sa liste de 472 titres est un moteur de
recherche sur toutes les saisons, pas l'agenda).
"""
from __future__ import annotations

import re
from datetime import date
from typing import Callable, Optional
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup

try:
    from scraper.offi_scraper import MONTH_PATTERN, MONTHS
    from scraper.venues import generic, html_fiche, schemaorg
    from scraper.venues.http import PoliteFetcher
except ModuleNotFoundError:  # pragma: no cover
    from offi_scraper import MONTH_PATTERN, MONTHS  # type: ignore[no-redef]
    from venues import generic, html_fiche, schemaorg  # type: ignore[no-redef]
    from venues.http import PoliteFetcher  # type: ignore[no-redef]

MAX_FICHES = 40


def fiche_links(html: str, base_url: str, link_re: re.Pattern, limit: int = MAX_FICHES, keep_query: bool = False) -> list[str]:
    """Liens internes dont le chemin (ou chemin + requête avec `keep_query`) correspond au motif, sans doublon."""
    host = urlparse(base_url).netloc
    out: list[str] = []
    for a in BeautifulSoup(html, "html.parser").find_all("a", href=True):
        parsed = urlparse(urljoin(base_url, a["href"]))
        target = parsed.path + ("?" + parsed.query if keep_query and parsed.query else "")
        if parsed.netloc != host or not link_re.search(target):
            continue
        url = parsed._replace(query=parsed.query if keep_query else "", fragment="").geturl()
        if url not in out:
            out.append(url)
        if len(out) >= limit:
            break
    return out


def read_fiches(fetcher: PoliteFetcher, links: list[str], today, info: dict, limit: int = MAX_FICHES) -> list[dict]:
    occurrences = []
    if links:
        limit = generic.fiche_budget(fetcher, links[0], limit)  # Crawl-delay 10 s à la Comédie Saint-Michel : 24 fiches
    for link in links[:limit]:
        page = fetcher.get(link)
        info["event_pages"] += 1
        if page.ok:
            occ = html_fiche.parse_fiche(page.text, page.final_url, today)
            if occ:
                occurrences.append(occ)
    return occurrences


def _finish(occurrences: list[dict], links: list[str], venue: dict, today, info: dict) -> tuple[list[dict], dict]:
    if occurrences:
        info["status"] = "ok"
    elif links:
        info["status"] = "fiches_sans_date"
    groups = schemaorg.group_occurrences(occurrences)
    return schemaorg.records_from_groups(groups, venue, "direct:html", today=today), info


MAX_FILTER_PAGES = 12


def filter_pages(html: str, base_url: str, filter_re: re.Pattern, limit: int = MAX_FILTER_PAGES) -> list[str]:
    """Variantes filtrées d'une page de liste (même chemin, requête `?genres=N`…) : certains sites ne
    rendent que les premières fiches sans filtre (Théâtre Jacques Carat : 9 sur 26) et le reste par genre."""
    host, path = urlparse(base_url).netloc, urlparse(base_url).path.rstrip("/")
    out: list[str] = []
    for a in BeautifulSoup(html, "html.parser").find_all("a", href=True):
        parsed = urlparse(urljoin(base_url, a["href"]))
        if parsed.netloc == host and parsed.path.rstrip("/") == path and parsed.query and filter_re.search(parsed.query):
            url = parsed._replace(fragment="").geturl()
            if url not in out:
                out.append(url)
            if len(out) >= limit:
                break
    return out


def make_adapter(listing_urls: list[str], link_re: str, max_fiches: int = MAX_FICHES, keep_query: bool = False,
                 filter_re: Optional[str] = None) -> Callable:
    pattern = re.compile(link_re)
    filters = re.compile(filter_re) if filter_re else None

    def adapter(fetcher: PoliteFetcher, venue: dict, today=None) -> tuple[list[dict], dict]:
        info = {"status": "aucune_fiche", "event_pages": 0}
        links: list[str] = []
        pages = list(listing_urls)
        for url in pages:
            page = fetcher.get(url)
            if not page.ok:
                continue
            links += [l for l in fiche_links(page.text, page.final_url, pattern, max_fiches, keep_query) if l not in links]
            if filters and url in listing_urls:
                pages += [u for u in filter_pages(page.text, page.final_url, filters) if u not in pages]
        occurrences = read_fiches(fetcher, links, today, info, max_fiches)
        return _finish(occurrences, links, venue, today, info)

    return adapter


# --------------------------------------------------------------------------------------------
# Théâtre du Nord-Ouest : /calendrier/ = toute la saison par semaine, une ligne de dates (« lun. 2/11 »)
# puis une ligne de créneaux (heure, salle, titre, lien ../programme/?repid=N). L'année n'est pas écrite :
# elle part de l'année du jour et avance quand le mois recule.
# --------------------------------------------------------------------------------------------
NORD_OUEST_CALENDAR = "https://www.theatredunordouest.com/calendrier/"
_DAY_MONTH_RE = re.compile(r"(\d{1,2})/(\d{1,2})")
_HOUR_RE = re.compile(r"(\d{1,2})\s*h\s*(\d{2})?")


def nord_ouest_calendar(html: str, page_url: str, today: date) -> list[dict]:
    """Occurrences (une par créneau) du calendrier par semaine."""
    soup = BeautifulSoup(html, "html.parser")
    week: list[Optional[date]] = []
    year, last_month = today.year, 0
    occurrences: list[dict] = []
    for row in soup.find_all("tr"):
        cells = row.find_all("td", recursive=False)
        classes = row.get("class") or []
        if "dateligne" in classes and cells:
            week = []
            for cell in cells:
                m = _DAY_MONTH_RE.search(cell.get_text(" ", strip=True))
                if not m:
                    week.append(None)
                    continue
                day, month = int(m.group(1)), int(m.group(2))
                if month < last_month:
                    year += 1
                last_month = month
                try:
                    week.append(date(year, month, day))
                except ValueError:
                    week.append(None)
        elif "creneauligne" in classes and cells and week:
            for day, cell in zip(week, cells):
                if day is None:
                    continue
                for a in cell.find_all("a", href=True):
                    title_el = a.select_one(".creneautitrecal")
                    title = re.sub(r"\s+", " ", title_el.get_text(" ", strip=True)) if title_el else ""
                    if not title:
                        continue
                    hour_el = a.select_one(".creneauheurecal")
                    hm = _HOUR_RE.search(hour_el.get_text() if hour_el else "")
                    start = f"{day.isoformat()}T{int(hm.group(1)):02d}:{int(hm.group(2) or 0):02d}:00" if hm else day.isoformat()
                    salle = a.select_one(".creneausallecal")
                    occurrences.append(schemaorg.blank_occurrence(
                        title, urljoin(page_url, a["href"]), day, start=start,
                        description=salle.get_text(" ", strip=True) if salle else None,
                    ))
    return occurrences


def nord_ouest_adapter(fetcher: PoliteFetcher, venue: dict, today=None) -> tuple[list[dict], dict]:
    today = today or date.today()
    info = {"status": "aucun_event", "event_pages": 1}
    page = fetcher.get(NORD_OUEST_CALENDAR)
    occurrences = nord_ouest_calendar(page.text, page.final_url, today) if page.ok else []
    if occurrences:
        info["status"] = "ok"
    groups = schemaorg.group_occurrences(occurrences)
    return schemaorg.records_from_groups(groups, venue, "direct:html", today=today), info


# --------------------------------------------------------------------------------------------
# Comédie Saint-Michel : Drupal sans alias d'URL. L'accueil (`?q=node/117`, tout public) et la page
# enfants (`?q=node/38`) listent les spectacles dans `#mainContent .teaser h2 a` ; la fiche donne les
# dates (« Les dimanches 8/11 et 22/11 à 18h45 », sans année) et les tarifs.
# --------------------------------------------------------------------------------------------
CSM_LISTINGS = ["http://www.comediesaintmichel.fr/?q=node/117", "http://www.comediesaintmichel.fr/?q=node/38"]
_CSM_TITLE_SUFFIX_RE = re.compile(r"\s*[-–:]\s*(?:à partir|a partir|dès|des le|reprise|nouveau|du \d|le \d|les \d).*$", re.I)
_CSM_DATE_RE = re.compile(r"(?<![\d/])(\d{1,2})/(\d{1,2})(?![\d/])")


def csm_listing(html: str, base_url: str) -> list[tuple[str, str]]:
    """[(titre, url de fiche)] de la zone de contenu (le menu est en dehors de #mainContent)."""
    soup = BeautifulSoup(html, "html.parser")
    main = soup.find(id="mainContent") or soup
    out: list[tuple[str, str]] = []
    for h2 in main.select(".teaser h2"):
        a = h2.find("a", href=re.compile(r"\?q=node/\d+$"))
        if not a:
            continue
        title = _CSM_TITLE_SUFFIX_RE.sub("", re.sub(r"\s+", " ", a.get_text(" ", strip=True))).strip(" !")
        url = urljoin(base_url, a["href"])
        if title and url not in {u for _, u in out}:
            out.append((title, url))
    return out


def csm_dates(text: str, today: date) -> list[str]:
    """Dates « j/m » sans année (prochaine occurrence) en plus des dates lues par html_fiche."""
    found = set(html_fiche.parse_dates(text, today))
    for m in _CSM_DATE_RE.finditer(text):
        day, month = int(m.group(1)), int(m.group(2))
        for year in (today.year, today.year + 1):
            try:
                d = date(year, month, day)
            except ValueError:
                break
            if d >= today:
                found.add(d.isoformat())
                break
    horizon = date.fromordinal(today.toordinal() + html_fiche.MAX_HORIZON_DAYS).isoformat()
    return sorted(d for d in found if d <= horizon)


def csm_adapter(fetcher: PoliteFetcher, venue: dict, today=None) -> tuple[list[dict], dict]:
    today = today or date.today()
    info = {"status": "aucune_fiche", "event_pages": 0}
    shows: list[tuple[str, str]] = []
    for url in CSM_LISTINGS:
        page = fetcher.get(url)
        if page.ok:
            shows += [s for s in csm_listing(page.text, page.final_url) if s not in shows]
    occurrences = []
    for title, url in shows[:MAX_FICHES]:
        page = fetcher.get(url)
        info["event_pages"] += 1
        if not page.ok:
            continue
        soup = BeautifulSoup(page.text, "html.parser")
        text = html_fiche._main_text(soup)
        dates = csm_dates(text, today)
        if not dates:
            continue
        low, high = html_fiche.parse_price_range(text)
        occurrences.append(schemaorg.blank_occurrence(
            title, page.final_url, date.fromisoformat(dates[0]), end_day=date.fromisoformat(dates[-1]),
            price_min_eur=low, price_max_eur=high, description=html_fiche._meta(soup, "og:description", "description"),
            performances=[{"start": d} for d in dates[:60]],
        ))
    return _finish(occurrences, [u for _, u in shows], venue, today, info)


# --------------------------------------------------------------------------------------------
# Théâtre de l'Épée de Bois : la page saison est découpée par mois (`div.UnMois` : h3 « Novembre 2026 »,
# puis un bloc par spectacle avec h2 > a et `div.date` « Du 22 octobre au 01 novembre 2026 »).
# --------------------------------------------------------------------------------------------
EPEE_SAISON = "https://www.epeedebois.com/saison/"
_MONTH_YEAR_RE = re.compile(rf"({MONTH_PATTERN})\s+(\d{{4}})", re.IGNORECASE)
_DATE_PART_RE = re.compile(rf"(\d{{1,2}})(?:er)?\s+({MONTH_PATTERN})(?:\s+(\d{{4}}))?", re.IGNORECASE)


def date_range_fr(text: str, default_year: int) -> tuple[Optional[date], Optional[date]]:
    """« Du 22 octobre au 01 novembre 2026 » -> (2026-10-22, 2026-11-01) : l'année écrite en fin de
    période vaut pour les dates qui la précèdent (une date de janvier après décembre prend l'année suivante)."""
    parts = []
    for m in _DATE_PART_RE.finditer(text):
        month = MONTHS.get(m.group(2).lower().rstrip("."))
        if month:
            parts.append((int(m.group(1)), month, int(m.group(3)) if m.group(3) else None))
    if not parts:
        return None, None
    year = next((y for _, _, y in reversed(parts) if y), default_year)
    dates = []
    for day, month, written in parts:
        y = written or year
        if not written and month > parts[-1][1] and parts[-1][2]:
            y -= 1  # « du 28 décembre au 3 janvier 2027 »
        try:
            dates.append(date(y, month, day))
        except ValueError:
            continue
    return (min(dates), max(dates)) if dates else (None, None)


def epee_listing(html: str, base_url: str, today: date) -> list[dict]:
    """Occurrences (titre, lien de fiche, période) des mois en cours et à venir de la page saison."""
    soup = BeautifulSoup(html, "html.parser")
    occurrences: list[dict] = []
    seen: set[str] = set()
    for block in soup.select("div.UnMois"):
        heading = block.find("h3")
        m = _MONTH_YEAR_RE.search(heading.get_text(" ", strip=True)) if heading else None
        if not m:
            continue
        month, year = MONTHS.get(m.group(1).lower().rstrip(".")), int(m.group(2))
        if not month or (year, month) < (today.year, today.month):
            continue
        for show in block.select("div.BlocSpecFlyer"):
            a = show.select_one("h2 a[href]")
            if not a:
                continue
            title = re.sub(r"\s+", " ", a.get_text(" ", strip=True))
            url = urljoin(base_url, a["href"])
            when = show.select_one("div.date")
            start, end = date_range_fr(when.get_text(" ", strip=True) if when else "", year)
            key = f"{url}|{start}"
            if not title or not start or key in seen:
                continue
            seen.add(key)
            occurrences.append(schemaorg.blank_occurrence(title, url, start, end_day=end or start))
    return occurrences


def epee_adapter(fetcher: PoliteFetcher, venue: dict, today=None) -> tuple[list[dict], dict]:
    today = today or date.today()
    info = {"status": "aucun_event", "event_pages": 1}
    page = fetcher.get(EPEE_SAISON)
    occurrences = epee_listing(page.text, page.final_url, today) if page.ok else []
    if occurrences:
        info["status"] = "ok"
    groups = schemaorg.group_occurrences(occurrences)
    return schemaorg.records_from_groups(groups, venue, "direct:html", today=today), info


ADAPTERS: dict = {
    "maison-de-radio-france-2674": make_adapter(["https://www.maisondelaradioetdelamusique.fr/agenda"], r"^/evenement/[a-z0-9\-]+$"),
    "le-rex-3071": make_adapter(["https://www.legrandrex.com/calendrier"], r"^/evenement/\d+$"),
    "alhambra-3584": make_adapter(["https://www.alhambra-paris.com/"], r"-lo\d+\.html$"),
    "petit-bain-5136": make_adapter(["https://petitbain.org/agenda/"], r"^/evenement/\d+/?$"),
    "le-brady-1580": make_adapter(["https://www.lebrady.fr/les-evenements-du-brady/"], r"^/events/\d+-[a-z0-9\-]+/?$"),
    "cave-du-38-riv-4381": make_adapter(["https://38riv.com/concerts"], r"^/concerts/[a-z0-9\-]+-\d+$"),
    "cartoucherie-theatre-de-lepee-de-bois-1631": epee_adapter,
    "theatre-71-3268": make_adapter(["https://malakoffscenenationale.fr/calendrier"], r"^/theatre-71/programme/[a-z0-9\-]+$"),
    "theatre-rive-gauche-3077": make_adapter(["https://lagaiterivegauche.com/spectacles/paris-is-magique/"], r"^/spectacles/[a-z0-9\-]+/?$"),
    "theatre-des-mathurins-2750": make_adapter(["https://www.theatredesmathurins.com/", "https://www.theatredesmathurins.com/reservation-groupes/"], r"^/spectacles/[a-z0-9\-]+/?$", max_fiches=60),
    "theatre-du-nord-ouest-2849": nord_ouest_adapter,
    "comedie-saint-michel-3528": csm_adapter,
    "apollo-theatre-3239": make_adapter(["https://www.apollotheatre.fr/nos-spectacles-l.html"], r"-lo\d+\.html$", max_fiches=100),  # 67 fiches listées le 07/11
    "theatre-3251": make_adapter(["https://www.theatrejacquescarat.fr/la-saison"], r"^/la-saison/[a-z0-9\-]+$", filter_re=r"genres="),
}
