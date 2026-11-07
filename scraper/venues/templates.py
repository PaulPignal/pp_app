# -*- coding: utf-8 -*-
"""Extracteurs par gabarit : un site de lieu bâti sur un modèle commun (thème, CMS, module de billetterie)
partage les mêmes balises ; l'empreinte relevée par `fingerprint` désigne l'extracteur à lancer.

Branchement : `adapters.run_venue` appelle `complement()` après l'extracteur générique ; les
enregistrements obtenus sont fusionnés par titre (le générique fait foi, ils comblent les trous).
Le gabarit détecté est écrit dans la colonne `template` du catalogue (`fingerprint.template_label`), ce
qui évite de redétecter au run hebdomadaire.

Gabarits actifs :
  - `billetreduc_salle` : la page « salle » de BilletReduc (/<id>/salle.htm) liste en JSON-LD tous les spectacles
    du lieu avec leurs dates ; son identifiant se lit sur le site du lieu (/S/171/salle.htm) ou sur une fiche
    BilletReduc que le site relie. Le générique ne suivait que les fiches liées depuis le site.
  - `fiches_famille` : le site publie ses spectacles sous un même chemin (/spectacle/<titre>/,
    /spectacles-tout-public/<titre>/) ; les liens de cette famille sont pris sur l'accueil ET sur chaque
    page de liste (le générique ne classe que les liens des pages agenda, et lit comme « agenda » une
    fiche que l'accueil met en avant), puis chaque fiche est lue en schema.org, sinon en HTML.
"""
from __future__ import annotations

import re
from datetime import date
from typing import Callable, Optional
from urllib.parse import urlparse

from bs4 import BeautifulSoup

try:
    from scraper.venues import billetterie, generic, html_fiche, schemaorg, triage
    from scraper.venues.http import Page, PoliteFetcher
except ModuleNotFoundError:  # pragma: no cover
    from venues import billetterie, generic, html_fiche, schemaorg, triage  # type: ignore[no-redef]
    from venues.http import Page, PoliteFetcher  # type: ignore[no-redef]

MIN_FAMILY_SIZE = 4          # fiches sœurs minimales sous un même chemin pour parler de « famille »
MAX_FAMILY_FICHES = 120      # même plafond que le générique
FAMILY_PATH_RE = re.compile(r"spectacle|programm|saison|agenda|evenement|piece|show|a-l-affiche|affiche|theatre|enfant|tout-public|jeune-public|humour|danse|musique|cirque|concert", re.I)


def _parent(url: str) -> str:
    segments = [s for s in urlparse(url).path.split("/") if s]
    return "/".join(segments[:-1])


def family_links(pages: list[Page]) -> list[str]:
    """Liens de fiche des pages (accueil comprise), regroupés par chemin parent : seules les familles d'au
    moins MIN_FAMILY_SIZE liens sous un chemin évocateur sont gardées. Les pages elles-mêmes comptent
    comme des liens (une fiche mise en avant par l'accueil appartient à sa famille)."""
    scored: dict[str, int] = {}
    for page in pages:
        soup = BeautifulSoup(page.text, "html.parser")
        for score, url in generic.ranked_links(soup, page.final_url, set()):
            scored[url] = max(scored.get(url, -9), score)
        own = page.final_url.split("#", 1)[0]
        if own not in scored and _parent(own):
            scored[own] = 2
    families: dict[str, list[str]] = {}
    for url, score in scored.items():
        parent = _parent(url)
        if parent and score >= 1 and FAMILY_PATH_RE.search(parent):
            families.setdefault(parent, []).append(url)
    links: list[str] = []
    for parent, urls in sorted(families.items(), key=lambda item: -len(item[1])):
        if len(urls) >= MIN_FAMILY_SIZE:
            links += [u for u in sorted(urls) if u not in links]
    return links[:MAX_FAMILY_FICHES]


def fiches_famille(fetcher: PoliteFetcher, venue: dict, today: Optional[date] = None, known: int = 0) -> tuple[list[dict], dict]:
    """(groupes de séances, diagnostic) : fiches d'une famille de liens du site. Rien n'est lu quand la famille
    n'est pas plus nombreuse que les spectacles déjà extraits (`known`) : le générique a déjà tout vu."""
    info = {"pages": 0, "status": ""}
    home = fetcher.get(venue["website"])
    if not home.ok:
        info["status"] = home.note or f"http {home.status}"
        return [], info
    pages = generic.listing_pages(fetcher, home, triage.detect_cms(home.text) == "wordpress")
    occurrences: list[dict] = []
    links = family_links(pages)
    if len(links) <= known:
        info["status"] = "deja_couvert"
        return [], info
    for url in links:
        page = fetcher.get(url)
        info["pages"] += 1
        if not page.ok:
            continue
        found, _ = schemaorg.occurrences_from_html(page.text, page.final_url)
        if not found:
            occ = html_fiche.parse_fiche(page.text, page.final_url, today, require_date=False)
            found = [occ] if occ else []
        occurrences += found
    info["status"] = "ok" if occurrences else "aucun_event"
    return schemaorg.group_occurrences(occurrences), info


BR_SALLE_RE = re.compile(r"billetreduc\.com/(?:[a-z0-9\-]+/)?(?:[sS]/)?(\d{2,7})/salle(?:liste|\.htm)", re.I)
BR_SALLE_REL_RE = re.compile(r"(?:[\"'(=]|^)/(?:[a-z0-9\-]+/)?(?:[sS]/)?(\d{2,7})/salle(?:liste|\.htm)", re.I)  # lien relatif d'une page BilletReduc
BR_FICHES = 3  # fiches BilletReduc lues pour y trouver la salle quand le site ne la lie pas


def billetreduc_salle_id(fetcher: PoliteFetcher, venue: dict) -> Optional[str]:
    """Identifiant de la salle BilletReduc du lieu : lien direct du site, sinon salle citée par ses fiches liées."""
    pages = billetterie.site_pages(fetcher, venue)
    votes: dict[str, int] = {}
    for page in pages:
        for m in BR_SALLE_RE.finditer(page.text):
            votes[m.group(1)] = votes.get(m.group(1), 0) + 1
    if votes:
        return max(votes, key=votes.get)
    platform = billetterie.PLATFORMS["billetreduc"]
    fiches: set[str] = set()
    for page in pages:
        events, _ = billetterie.classify_links(BeautifulSoup(page.text, "html.parser"), page.final_url, platform)
        fiches |= events
    for url in sorted(fiches)[:BR_FICHES]:
        page = fetcher.get(url)
        if page.ok:
            for m in list(BR_SALLE_RE.finditer(page.text)) + list(BR_SALLE_REL_RE.finditer(page.text)):
                votes[m.group(1)] = votes.get(m.group(1), 0) + 1
    return max(votes, key=votes.get) if votes else None


def billetreduc_salle(fetcher: PoliteFetcher, venue: dict, today: Optional[date] = None, known: int = 0) -> tuple[list[dict], dict]:
    info = {"status": "", "salle": ""}
    salle = billetreduc_salle_id(fetcher, venue)
    if not salle:
        info["status"] = "salle_introuvable"
        return [], info
    info["salle"] = salle
    page = fetcher.get(f"https://www.billetreduc.com/{salle}/salle.htm")
    if not page.ok:
        info["status"] = page.note or f"http {page.status}"
        return [], info
    found, _ = schemaorg.occurrences_from_html(page.text, page.final_url)
    groups = [g for g in schemaorg.group_occurrences(found) if billetterie.venue_matches(g.get("venue"), venue["name"])]
    info["status"] = "ok" if groups else "aucun_event"
    return groups, info


EXTRACTORS: dict[str, Callable] = {
    "billetreduc_salle": billetreduc_salle,
    "fiches_famille": fiches_famille,
}


def complement(fetcher: PoliteFetcher, venue: dict, today: Optional[date] = None, known: int = 0) -> tuple[list[dict], dict]:
    """Enregistrements des extracteurs de gabarit pour un lieu (liste vide si aucun ne s'applique).
    `known` : nombre de spectacles déjà extraits par les autres sources."""
    records: list[dict] = []
    info: dict = {}
    for name, extractor in EXTRACTORS.items():
        groups, sub = extractor(fetcher, venue, today, known)
        info[name] = sub.get("status", "")
        records += schemaorg.records_from_groups(groups, venue, f"direct:gabarit_{name}", today=today)
    return records, info
