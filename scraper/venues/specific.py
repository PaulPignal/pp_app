# -*- coding: utf-8 -*-
"""Adaptateurs propres à un lieu : sites sans schema.org ni billetterie tierce lisible mais dont
les fiches spectacle sont en HTML statique. Chaque adaptateur = pages d'agenda + motif des liens
de fiche (mesuré sur le site) ; la lecture de la fiche est commune (html_fiche.parse_fiche).

Lieux écartés après examen (rendu JavaScript, aucun lien de fiche dans le HTML servi) :
Philharmonie de Paris (agenda chargé par bouton « Jours suivants »), Théâtre des Champs-Élysées,
MC93, Espace 1789 (liens /node/N génériques), Théâtre de Saint-Quentin-en-Yvelines, La Ferme du Buisson, Théâtre Darius Milhaud,
Accor Arena (Angular, API interne /api-cms non documentée), Le Trianon et l'Élysée Montmartre
(liens de fiche absents du HTML servi).
"""
from __future__ import annotations

import re
from typing import Callable
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup

try:
    from scraper.venues import html_fiche, schemaorg
    from scraper.venues.http import PoliteFetcher
except ModuleNotFoundError:  # pragma: no cover
    from venues import html_fiche, schemaorg  # type: ignore[no-redef]
    from venues.http import PoliteFetcher  # type: ignore[no-redef]

MAX_FICHES = 40


def fiche_links(html: str, base_url: str, link_re: re.Pattern, limit: int = MAX_FICHES) -> list[str]:
    """Liens internes dont le chemin (+ requête) correspond au motif de fiche, sans doublon."""
    host = urlparse(base_url).netloc
    out: list[str] = []
    for a in BeautifulSoup(html, "html.parser").find_all("a", href=True):
        parsed = urlparse(urljoin(base_url, a["href"]))
        if parsed.netloc != host or not link_re.search(parsed.path):
            continue
        url = parsed._replace(query="", fragment="").geturl()
        if url not in out:
            out.append(url)
        if len(out) >= limit:
            break
    return out


def make_adapter(listing_urls: list[str], link_re: str) -> Callable:
    pattern = re.compile(link_re)

    def adapter(fetcher: PoliteFetcher, venue: dict, today=None) -> tuple[list[dict], dict]:
        info = {"status": "aucune_fiche", "event_pages": 0}
        links: list[str] = []
        for url in listing_urls:
            page = fetcher.get(url)
            if page.ok:
                links += [l for l in fiche_links(page.text, page.final_url, pattern) if l not in links]
        occurrences = []
        for link in links[:MAX_FICHES]:
            page = fetcher.get(link)
            info["event_pages"] += 1
            if page.ok:
                occ = html_fiche.parse_fiche(page.text, page.final_url, today)
                if occ:
                    occurrences.append(occ)
        if occurrences:
            info["status"] = "ok"
        elif links:
            info["status"] = "fiches_sans_date"
        groups = schemaorg.group_occurrences(occurrences)
        return schemaorg.records_from_groups(groups, venue, "direct:html", today=today), info

    return adapter


ADAPTERS: dict = {
    "maison-de-radio-france-2674": make_adapter(["https://www.maisondelaradioetdelamusique.fr/agenda"], r"^/evenement/[a-z0-9\-]+$"),
    "le-rex-3071": make_adapter(["https://www.legrandrex.com/calendrier"], r"^/evenement/\d+$"),
    "alhambra-3584": make_adapter(["https://www.alhambra-paris.com/"], r"-lo\d+\.html$"),
    "petit-bain-5136": make_adapter(["https://petitbain.org/agenda/"], r"^/evenement/\d+/?$"),
    "le-brady-1580": make_adapter(["https://www.lebrady.fr/les-evenements-du-brady/"], r"^/events/\d+-[a-z0-9\-]+/?$"),
    "cave-du-38-riv-4381": make_adapter(["https://38riv.com/concerts"], r"^/concerts/[a-z0-9\-]+-\d+$"),
    "theatre-des-mathurins-2750": make_adapter(["https://www.theatredesmathurins.com/reservation-groupes/"], r"^/spectacles/[a-z0-9\-]+/?$"),
}
