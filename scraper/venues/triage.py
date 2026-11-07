# -*- coding: utf-8 -*-
"""Triage automatique des sites officiels : plateforme, signal exploitable, faisabilité.

Budget par lieu : 1 requête sur l'accueil + au plus 2 pages agenda (liens de l'accueil).
Fonctions de détection pures (HTML en entrée), testables sans réseau.

Faisabilité :
  1 = donnée structurée directe (JSON-LD/microdata Event, flux iCal) : extracteur générique suffit
  2 = exploitable avec un adaptateur (billetterie tierce reconnue, API de CMS, flux RSS)
  3 = HTML sur mesure, rendu JavaScript, ou site bloqué/injoignable
"""
from __future__ import annotations

import csv
import os
import re
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from typing import Optional
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup

try:
    from scraper.venues import schemaorg
    from scraper.venues.http import PoliteFetcher, Page
except ModuleNotFoundError:  # pragma: no cover
    from venues import schemaorg  # type: ignore[no-redef]
    from venues.http import PoliteFetcher, Page  # type: ignore[no-redef]

# plateforme -> fragments de nom d'hôte
TICKETING_HOSTS = {
    "billetreduc": ["billetreduc.com"],
    "fnac_spectacles": ["fnacspectacles.com", "spectacles.fnac.com"],
    "ticketmaster": ["ticketmaster.fr", "ticketmaster.com"],
    "see_tickets": ["seetickets.com", "wegow.com"],
    "weezevent": ["weezevent.com", "weezticket"],
    "shotgun": ["shotgun.live"],
    "billetweb": ["billetweb.fr"],
    "mapado": ["mapado.com", "mapado.net"],
    "theatreonline": ["theatreonline.com"],
    "digitick": ["digitick.com"],
    "helloasso": ["helloasso.com"],
    "eventbrite": ["eventbrite."],
    "allocine": ["allocine.fr"],
    "arenametrix": ["arenametrix.com"],
    "secutix": ["secutix.com"],
    "reservation_ticketac": ["ticketac.com"],
    "yurplan": ["yurplan.com"],
    "webtic": ["webtic.fr", "webtic.com"],
    "francebillet": ["francebillet.com"],
    "infoconcert": ["infoconcert.com"],
    "tick_and_live": ["tickandlive.com"],
    "pass_culture": ["passculture.app"],
}
CMS_MARKERS = [
    ("wordpress", re.compile(r"wp-content/|wp-includes/|wp-json", re.I)),
    ("drupal", re.compile(r"drupal-settings-json|/sites/default/files|Drupal\.settings", re.I)),
    ("wix", re.compile(r"static\.wixstatic\.com|wix-warmup-data|X-Wix", re.I)),
    ("squarespace", re.compile(r"squarespace", re.I)),
    ("shopify", re.compile(r"cdn\.shopify\.com", re.I)),
    ("joomla", re.compile(r"/media/jui/|Joomla!", re.I)),
    ("typo3", re.compile(r"typo3temp|TYPO3", re.I)),
    ("webflow", re.compile(r"webflow", re.I)),
    ("prestashop", re.compile(r"prestashop", re.I)),
    ("next_js", re.compile(r"__NEXT_DATA__|/_next/static", re.I)),
    ("nuxt", re.compile(r"__NUXT__|/_nuxt/", re.I)),
    ("gatsby", re.compile(r"___gatsby", re.I)),
]
AGENDA_HINT_RE = re.compile(
    r"agenda|programmation|programme|spectacles?|saison|calendrier|a-l-affiche|a-laffiche|"
    r"billetterie|reserv|evenements?|events?|expositions?|seances?|cinema|concerts?|whats-on|visites?",
    re.I,
)
AGENDA_AVOID_RE = re.compile(r"mentions|cookies|contact|newsletter|presse|mecenat|location|recrut|\.pdf|cgv|cgu|faq|plan-du-site|passee|archive", re.I)
EXTRA_PATTERNS = {
    "distribution": re.compile(r"distribution|avec\s*:|mise en sc[eè]ne|interpr[eé]t", re.I),
    "duree": re.compile(r"dur[eé]e\s*:?\s*\d|\b\d\s?h\s?\d{0,2}\b|\b\d{2,3}\s?(?:min|mn)\b", re.I),
    "accessibilite": re.compile(r"accessib|PMR|mobilit[eé] r[eé]duite|handicap|LSF|audiodescription|boucle magn", re.I),
    "placement": re.compile(r"placement\s+(?:libre|num[eé]rot)|plan de salle|choisir (?:votre|ses) place|places? num[eé]rot", re.I),
}
EVENT_FEED_RE = re.compile(r"event|agenda|spectacle|programm|saison|calendar", re.I)
FEED_RE = re.compile(r"\.ics(\?|$)|^webcal:|/feed/?$|\.rss(\?|$)|type=\"application/(?:rss|atom)", re.I)


def detect_ticketing(hosts: list[str]) -> Counter:
    found: Counter = Counter()
    for host in hosts:
        for platform, fragments in TICKETING_HOSTS.items():
            if any(f in host for f in fragments):
                found[platform] += 1
    return found


def detect_cms(html: str) -> Optional[str]:
    for name, pattern in CMS_MARKERS:
        if pattern.search(html):
            return name
    return None


def external_hosts(soup, base_url: str) -> list[str]:
    """Hôtes externes référencés (liens, iframes, scripts, formulaires)."""
    own = urlparse(base_url).netloc.removeprefix("www.")
    hosts = []
    for tag, attr in (("a", "href"), ("iframe", "src"), ("script", "src"), ("form", "action"), ("link", "href")):
        for el in soup.find_all(tag, attrs={attr: True}):
            host = urlparse(urljoin(base_url, el[attr])).netloc.lower()
            if host and host.removeprefix("www.") != own and not host.endswith(own):
                hosts.append(host)
    return hosts


def find_feeds(soup, base_url: str) -> list[str]:
    feeds = []
    for el in soup.find_all(["link", "a"], href=True):
        href = el["href"]
        type_attr = (el.get("type") or "").lower()
        if "calendar" in type_attr or "rss" in type_attr or "atom" in type_attr or FEED_RE.search(href):
            feeds.append(urljoin(base_url, href))
    return sorted(set(feeds))[:5]


def pick_agenda_links(soup, base_url: str, limit: int = 2) -> list[str]:
    """Liens internes les plus probables vers l'agenda (texte ou chemin évocateur)."""
    host = urlparse(base_url).netloc
    scored: dict[str, int] = {}
    for a in soup.find_all("a", href=True):
        url = urljoin(base_url, a["href"]).split("#", 1)[0]
        parsed = urlparse(url)
        if parsed.netloc != host or parsed.path in ("", "/") or parsed.scheme not in ("http", "https"):
            continue
        label = f"{parsed.path} {a.get_text(' ', strip=True)}"
        if AGENDA_AVOID_RE.search(label) or not AGENDA_HINT_RE.search(label):
            continue
        depth = parsed.path.strip("/").count("/")
        score = 3 - min(depth, 2) + (2 if re.search(r"agenda|programmation|calendrier|a-l-affiche", label, re.I) else 0)
        scored[url] = max(scored.get(url, 0), score)
    return [u for u, _ in sorted(scored.items(), key=lambda kv: -kv[1])[:limit]]


def normalize_website(website: str) -> str:
    """offi saisit parfois « http://https://… » ou un site sans schéma."""
    website = re.sub(r"^https?://(?=https?://)", "", website.strip())
    return website if website.startswith("http") else "http://" + website


def analyse_site(fetcher: PoliteFetcher, website: str) -> dict:
    """Une requête sur l'accueil, au plus deux pages agenda. Renvoie les colonnes de triage."""
    result = {
        "platform": "", "cms": "", "signal": "", "signal_detail": "", "feasibility": 3,
        "extras": "", "agenda_url": "", "status": "", "ticketing_all": "",
    }
    home = fetcher.get(website)
    if not home.ok:
        result["status"] = home.note or f"http {home.status}"
        return result
    result["status"] = "ok"
    pages: list[Page] = [home]
    home_soup = BeautifulSoup(home.text, "html.parser")
    agenda_links = pick_agenda_links(home_soup, home.final_url)
    for link in agenda_links:
        page = fetcher.get(link)
        if page.ok:
            pages.append(page)
    if agenda_links:
        result["agenda_url"] = agenda_links[0]

    hosts: list[str] = []
    feeds: list[str] = []
    best_signal, best_count, best_page = "", 0, ""
    text_parts = []
    for page in pages:
        soup = BeautifulSoup(page.text, "html.parser")
        hosts += external_hosts(soup, page.final_url)
        feeds += find_feeds(soup, page.final_url)
        occurrences, signal = schemaorg.occurrences_from_html(page.text, page.final_url)
        if len(occurrences) > best_count:
            best_signal, best_count, best_page = signal, len(occurrences), page.final_url
        text_parts.append(soup.get_text(" ", strip=True)[:60000])
    ticketing = detect_ticketing(hosts)
    cms = detect_cms(home.text) or ""
    ics = [f for f in feeds if re.search(r"\.ics|webcal|calendar", f, re.I)]
    rss = [f for f in feeds if f not in ics]

    result["cms"] = cms
    result["ticketing_all"] = "|".join(f"{p}:{n}" for p, n in ticketing.most_common())
    result["platform"] = ticketing.most_common(1)[0][0] if ticketing else ("site_propre" + (f"/{cms}" if cms else ""))
    if best_signal:
        result["signal"] = best_signal
        result["signal_detail"] = f"{best_count} events sur {best_page}"
        result["feasibility"] = 1
    elif ics:
        result["signal"], result["signal_detail"], result["feasibility"] = "ical", ics[0], 1
    elif ticketing:
        result["signal"], result["signal_detail"], result["feasibility"] = "billetterie_tierce", result["ticketing_all"], 2
    elif any(EVENT_FEED_RE.search(f) for f in rss):
        result["signal"], result["signal_detail"], result["feasibility"] = "rss_agenda", next(f for f in rss if EVENT_FEED_RE.search(f)), 2
    elif rss:  # flux WordPress /feed/ : articles d'actualité, pas un agenda (hypothèse confirmée sur échantillon à faire)
        result["signal"], result["signal_detail"] = "rss_actualites", rss[0]
    elif cms == "wordpress":
        result["signal"], result["signal_detail"], result["feasibility"] = "api_wordpress_hypothese", "wp-json non testé", 2
    else:
        result["signal"], result["signal_detail"] = "html_sur_mesure", f"{len(pages)} pages lues"
    full_text = " ".join(text_parts)
    result["extras"] = "|".join(k for k, p in EXTRA_PATTERNS.items() if p.search(full_text))
    return result


def load_overrides() -> dict[str, str]:
    """Sites retrouvés à la main pour des lieux dont offi ne donne pas l'URL (website_overrides.csv)."""
    path = os.path.join(os.path.dirname(__file__), "website_overrides.csv")
    with open(path, encoding="utf-8", newline="") as f:
        return {r["slug"]: r["website"] for r in csv.DictReader(f)}


TRIAGE_COLUMNS = ["platform", "cms", "signal", "signal_detail", "feasibility", "extras", "agenda_url", "status", "ticketing_all", "website_source"]


def triage_catalogue(csv_in: str, csv_out: str, fetcher: PoliteFetcher, limit: Optional[int] = None, log=print, workers: int = 6) -> None:
    with open(csv_in, encoding="utf-8", newline="") as f:
        rows = list(csv.DictReader(f))
    base_cols = [c for c in rows[0].keys() if c not in TRIAGE_COLUMNS] if rows else []
    overrides = load_overrides()
    todo = []
    for row in rows:
        row["website_source"] = "offi" if row.get("website") else ""
        if not row.get("website") and row["slug"] in overrides:
            row["website"], row["website_source"] = overrides[row["slug"]], "recherche"
        website = row.get("website") or ""
        if not website:
            row.update({c: "" for c in TRIAGE_COLUMNS})
            row.update({"status": "sans_site", "feasibility": 3})
        else:
            todo.append((row, normalize_website(website)))
    if limit is not None:
        todo = todo[:limit]

    def work(item):
        row, website = item
        try:
            row.update(analyse_site(fetcher, website))
        except Exception as exc:  # un site illisible ne doit pas arrêter le triage
            row.update({"status": f"erreur {type(exc).__name__}", "feasibility": 3})

    # Threads : les domaines sont distincts d'un lieu à l'autre, le fetcher garde 1 requête/s par domaine.
    with ThreadPoolExecutor(max_workers=workers) as pool:
        for i, _ in enumerate(pool.map(work, todo), start=1):
            if i % 25 == 0:
                log(f"triage: {i}/{len(todo)} sites")
    with open(csv_out, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=base_cols + TRIAGE_COLUMNS, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow({c: row.get(c, "") for c in base_cols + TRIAGE_COLUMNS})


def main() -> None:
    import argparse

    ap = argparse.ArgumentParser(description="Triage des sites officiels du catalogue")
    ap.add_argument("--catalogue", default="data/venues/catalogue.csv")
    ap.add_argument("--out", default="data/venues/catalogue.csv")
    ap.add_argument("--limit", type=int)
    args = ap.parse_args()
    triage_catalogue(args.catalogue, args.out, PoliteFetcher(), args.limit, log=lambda m: print(m, flush=True))


if __name__ == "__main__":
    main()
