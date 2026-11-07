# -*- coding: utf-8 -*-
"""Empreinte technique d'un site de lieu : CMS, thème ou agence, modules de billetterie intégrés
(avec l'identifiant d'organisateur quand il se lit), extension d'agenda, données structurées.

Une empreinte est un jeu de balises qui se retrouve à l'identique sur tous les sites bâtis sur le même
gabarit ; elle sert à choisir l'extracteur sans le redétecter à chaque run (colonne `template` du
catalogue). Aucun accès réseau ici : l'appelant fournit le HTML déjà récupéré poliment.
"""
from __future__ import annotations

import json
import re
from typing import Optional
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup

# Billetteries et places de marché : plateforme -> (fragments d'hôte, motif d'identifiant d'organisateur)
WIDGET_HOSTS: dict[str, tuple[list[str], Optional[re.Pattern]]] = {
    "mapado": (["mapado.com", "mapado.net"], None),
    "billetreduc": (["billetreduc.com"], re.compile(r"(?:lieu/|/)(\d{3,})/(?:salle|evtcrit)")),
    "tick_and_live": (["tickandlive.com"], None),
    "shotgun": (["shotgun.live"], re.compile(r"venues/([a-z0-9\-]+)")),
    "billetweb": (["billetweb.fr"], re.compile(r"billetweb\.fr/(?:pro/|shop\.php\?event=)?([a-z0-9][a-z0-9\-_]+)")),
    "weezevent": (["weezevent.com", "weezticket"], None),
    "helloasso": (["helloasso.com"], re.compile(r"associations/([a-z0-9\-]+)")),
    "eventbrite": (["eventbrite."], re.compile(r"/o/([a-z0-9\-]+)")),
    "secutix": (["secutix.com"], None),
    "ticketmaster": (["ticketmaster."], None),
    "fnac_spectacles": (["fnacspectacles.com", "spectacles.fnac.com"], None),
    "see_tickets": (["seetickets.com", "wegow.com"], None),
    "vosbillets": (["vosbillets.fr"], re.compile(r"//([a-z0-9\-]+)\.vosbillets\.fr")),
    "supersoniks": (["supersoniks.com"], None),
    "festik": (["festik.net"], None),
    "yurplan": (["yurplan.com"], None),
    "placeminute": (["placeminute.com"], re.compile(r"//([a-z0-9\-]+)\.placeminute\.com")),
    "theatreonline": (["theatreonline.com"], None),
    "theatre_box": (["theatre-box.com", "theatrebox"], None),
    "ticketac": (["ticketac.com"], None),
    "digitick": (["digitick.com"], None),
    "arenametrix": (["arenametrix.com"], None),
    "webtic": (["webtic.fr", "webtic.com"], None),
    "francebillet": (["francebillet.com"], None),
    "infoconcert": (["infoconcert.com"], None),
    "reservation_resalib": (["resalib"], None),
    "lestheatres_net": (["lestheatres.net"], None),
    "reservationspectacle": (["reservationspectacle.com", "reservation-spectacle.com"], None),
    "pass_culture": (["passculture.app"], None),
    "kiosque_culture": (["kiosqueculture", "kiosque-culture"], None),
    "weblib_ticketing": (["ticketlib", "ticketing.fr"], None),
    "onlyoneticket": (["onlyoneticket", "bookingshow"], None),
}

CMS_RULES: list[tuple[str, re.Pattern]] = [
    ("wordpress", re.compile(r"wp-content/|wp-includes/|wp-json", re.I)),
    ("drupal", re.compile(r"drupal-settings-json|/sites/default/files|Drupal\.settings|/sites/all/", re.I)),
    ("wix", re.compile(r"static\.wixstatic\.com|wix-warmup-data|X-Wix|wixsite\.com", re.I)),
    ("squarespace", re.compile(r"squarespace", re.I)),
    ("webflow", re.compile(r"webflow", re.I)),
    ("jimdo", re.compile(r"jimdo", re.I)),
    ("joomla", re.compile(r"/media/jui/|/media/system/js|Joomla!|/components/com_", re.I)),
    ("typo3", re.compile(r"typo3temp|TYPO3|/typo3conf/", re.I)),
    ("odoo", re.compile(r"/web/static/|odoo", re.I)),
    ("shopify", re.compile(r"cdn\.shopify\.com", re.I)),
    ("prestashop", re.compile(r"prestashop", re.I)),
    ("spip", re.compile(r"spip\.php|generator[^>]+SPIP|/prive/|squelettes", re.I)),
    ("next_js", re.compile(r"__NEXT_DATA__|/_next/static", re.I)),
    ("nuxt", re.compile(r"__NUXT__|/_nuxt/", re.I)),
    ("gatsby", re.compile(r"___gatsby", re.I)),
    ("sitew", re.compile(r"sitew\.|e-monsite\.com|webnode|over-blog|wifeo|fr\.wix", re.I)),
]
# Extensions d'agenda : nom -> motif
CALENDAR_RULES: list[tuple[str, re.Pattern]] = [
    ("the_events_calendar", re.compile(r"tribe-events|tribe_events|the-events-calendar", re.I)),
    ("modern_events_calendar", re.compile(r"\bmec-(?:wrap|event|skin)|modern-events-calendar|mec_events", re.I)),
    ("eventon", re.compile(r"eventon|evo_pop|evcal_", re.I)),
    ("events_manager", re.compile(r"events-manager|em-events-list|em_events|\bem-event\b", re.I)),
    ("amelia", re.compile(r"ameliabooking|amelia-booking|amelia-app", re.I)),
    ("my_calendar", re.compile(r"my-calendar|mc-main|mc_event", re.I)),
    ("simple_calendar", re.compile(r"simcal|simple-calendar", re.I)),
    ("ajax_calendar", re.compile(r"fullcalendar", re.I)),
]
AGENCY_RE = re.compile(
    r"(?:site|conception|r[ée]alis[ée]|cr[ée][ée]|d[ée]velopp[ée]|design)[^<>]{0,40}?(?:par|by)\s*:?\s*(?:<[^>]+>\s*)*([A-Za-z0-9][A-Za-z0-9 &'\.\-]{2,30})",
    re.I,
)
THEME_RE = re.compile(r"/wp-content/themes/([a-zA-Z0-9_\-]+)/")
PLUGIN_RE = re.compile(r"/wp-content/plugins/([a-zA-Z0-9_\-]+)/")
GENERATOR_RE = re.compile(r"<meta[^>]+name=[\"']generator[\"'][^>]+content=[\"']([^\"']+)", re.I)
GENERATOR_RE2 = re.compile(r"<meta[^>]+content=[\"']([^\"']+)[\"'][^>]+name=[\"']generator[\"']", re.I)
EVENT_LD_RE = re.compile(r'"@type"\s*:\s*\[?\s*"(?:[A-Za-z]*Event|TheaterEvent|MusicEvent|DanceEvent|ComedyEvent)"', re.I)


def widget_hosts(soup: BeautifulSoup, base_url: str) -> dict[str, str]:
    """Billetteries intégrées (liens, iframes, scripts, formulaires) -> identifiant d'organisateur lisible ('' sinon)."""
    own = urlparse(base_url).netloc.lower().removeprefix("www.")
    found: dict[str, str] = {}
    urls: list[str] = []
    for tag, attr in (("a", "href"), ("iframe", "src"), ("script", "src"), ("form", "action"), ("link", "href")):
        urls += [urljoin(base_url, el[attr]) for el in soup.find_all(tag, attrs={attr: True})]
    for url in urls:
        host = urlparse(url).netloc.lower()
        if not host or host.removeprefix("www.") == own or host.endswith(own):
            continue
        for name, (fragments, id_re) in WIDGET_HOSTS.items():
            if any(f in host for f in fragments):
                ident = ""
                if id_re:
                    m = id_re.search(url)
                    ident = m.group(1) if m else ""
                if name not in found or (ident and not found[name]):
                    found[name] = ident
    return found


def detect_cms(html: str) -> str:
    for name, pattern in CMS_RULES:
        if pattern.search(html):
            return name
    return ""


def generator(html: str) -> str:
    m = GENERATOR_RE.search(html) or GENERATOR_RE2.search(html)
    return m.group(1).strip()[:60] if m else ""


def has_event_ld(html: str) -> bool:
    for block in re.findall(r'<script[^>]+application/ld\+json[^>]*>(.*?)</script>', html, re.S | re.I):
        if EVENT_LD_RE.search(block):
            return True
    return bool(re.search(r'itemtype=["\']https?://schema\.org/[A-Za-z]*Event', html, re.I))


def agency(soup: BeautifulSoup) -> str:
    """Crédit « site réalisé par X » du pied de page (dernier bloc footer, sinon fin de page)."""
    footer = soup.find("footer")
    text = str(footer) if footer else str(soup)[-4000:]
    m = AGENCY_RE.search(text)
    return re.sub(r"\s+", " ", m.group(1)).strip().lower()[:30] if m else ""


def fingerprint_html(html: str, url: str) -> dict:
    """Empreinte d'une page : cms, generator, theme, plugins, agency, widgets {nom: id}, calendar, ld_event."""
    soup = BeautifulSoup(html, "html.parser")
    cms = detect_cms(html)
    themes = THEME_RE.findall(html)
    plugins = sorted(set(PLUGIN_RE.findall(html)))
    calendar = ""
    for name, pattern in CALENDAR_RULES:
        if pattern.search(html):
            calendar = name
            break
    return {
        "cms": cms,
        "generator": generator(html),
        "theme": themes[0].lower() if themes else "",
        "plugins": plugins[:12],
        "agency": agency(soup),
        "widgets": widget_hosts(soup, url),
        "calendar": calendar,
        "ld_event": has_event_ld(html),
    }


def merge(prints: list[dict]) -> dict:
    """Empreinte d'un lieu : fusion de celles de ses pages (accueil, agenda)."""
    out = {"cms": "", "generator": "", "theme": "", "plugins": [], "agency": "", "widgets": {}, "calendar": "", "ld_event": False}
    for p in prints:
        for k in ("cms", "generator", "theme", "agency", "calendar"):
            out[k] = out[k] or p.get(k, "")
        out["plugins"] = sorted(set(out["plugins"]) | set(p.get("plugins", [])))
        out["ld_event"] = out["ld_event"] or p.get("ld_event", False)
        for name, ident in p.get("widgets", {}).items():
            if name not in out["widgets"] or (ident and not out["widgets"][name]):
                out["widgets"][name] = ident
    return out


def template_label(fp: dict) -> str:
    """Étiquette courte et stable de la colonne `template` : « <famille>:<nom> », plusieurs séparées par « | ».
    Seuls les gabarits qui pilotent un extracteur ou un regroupement utile sont retenus."""
    labels: list[str] = []
    if fp.get("calendar"):
        labels.append(f"agenda:{fp['calendar']}")
    for name in sorted(fp.get("widgets", {})):
        labels.append(f"billetterie:{name}")
    if fp.get("theme"):
        labels.append(f"theme:{fp['theme']}")
    elif fp.get("cms"):
        labels.append(f"cms:{fp['cms']}")
    return "|".join(labels)
