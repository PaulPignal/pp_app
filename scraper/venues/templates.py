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
  - `fiches_cartes` : sites dont les spectacles sont des « cartes » de l'accueil (lien /<titre>/ à la racine,
    à côté d'un lien « Réserver » ou « Infos ») : Saint-Georges et Tristan-Bernard, sans chemin commun.
  - `fiches_famille` : le site publie ses spectacles sous un même chemin (/spectacle/<titre>/,
    /spectacles-tout-public/<titre>/) ; les liens de cette famille sont pris sur l'accueil ET sur chaque
    page de liste (le générique ne classe que les liens des pages agenda, et lit comme « agenda » une
    fiche que l'accueil met en avant), puis chaque fiche est lue en schema.org, sinon en HTML.
"""
from __future__ import annotations

import re
from datetime import date
from typing import Callable, Optional
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup

try:
    from scraper.venues import billetterie, fingerprint, generic, html_fiche, schemaorg, triage
    from scraper.venues.http import Page, PoliteFetcher
except ModuleNotFoundError:  # pragma: no cover
    from venues import billetterie, fingerprint, generic, html_fiche, schemaorg, triage  # type: ignore[no-redef]
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


BOOKING_TEXT_RE = re.compile(r"r[ée]serv|billet|infos?\b|en savoir plus|r[ée]sa\b|acheter|book", re.I)
NOT_A_SHOW_RE = re.compile(r"cadeau|abonnement|privatis|black-friday|printemps-du|faq|photos?|partenaires?|actualit|equipe|histoire|informations?-pratiques|contact|mentions|cgv|cgu|carte-|cours|stage|atelier|location|recrut|presse|newsletter|accessib|plan|pratique|reservation|groupes|^theatre$|^spectacles?$|^programm", re.I)
CARD_DEPTH = 4  # niveaux d'ancêtres examinés pour trouver le lien « Réserver » de la carte
MIN_CARDS = 3


def card_links(home: Page) -> list[str]:
    """Liens /<titre>/ de l'accueil (hors navigation) dont la carte contient aussi un lien « Réserver » ou « Infos »."""
    soup = BeautifulSoup(home.text, "html.parser")
    host = urlparse(home.final_url).netloc
    found: list[str] = []
    for a in soup.find_all("a", href=True):
        url = urljoin(home.final_url, triage.clean_href(a["href"])).split("#", 1)[0].split("?", 1)[0]
        parsed = urlparse(url)
        segments = [x for x in parsed.path.split("/") if x]
        if parsed.netloc != host or len(segments) != 1 or len(segments[0]) < 4 or NOT_A_SHOW_RE.search(segments[0]):
            continue
        if a.find_parent(["nav", "header", "footer"]) is not None or url in found:
            continue
        card, hit = a, False
        for _ in range(CARD_DEPTH):
            card = card.parent
            if card is None or card.name in ("body", "html", "main"):
                break
            others = [b for b in card.find_all("a", href=True) if b is not a]
            if len(card.find_all("a", href=True)) > 6:  # conteneur trop large : plusieurs cartes mélangées
                break
            if any(BOOKING_TEXT_RE.search(b.get_text(" ", strip=True)) for b in others):
                hit = True
                break
        if hit:
            found.append(url)
    return found


def fiches_cartes(fetcher: PoliteFetcher, venue: dict, today: Optional[date] = None, known: int = 0) -> tuple[list[dict], dict]:
    info = {"pages": 0, "status": ""}
    home = fetcher.get(venue["website"])
    if not home.ok:
        info["status"] = home.note or f"http {home.status}"
        return [], info
    links = card_links(home)
    if len(links) < MIN_CARDS or len(links) <= known:
        info["status"] = "pas_de_cartes" if len(links) < MIN_CARDS else "deja_couvert"
        return [], info
    occurrences: list[dict] = []
    for url in links[:MAX_FAMILY_FICHES]:
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


EXTRACTORS: dict[str, Callable] = {
    "billetreduc_salle": billetreduc_salle,
    "fiches_famille": fiches_famille,
    "fiches_cartes": fiches_cartes,
}


def selected(venue: dict) -> list[str]:
    """Extracteurs à lancer pour un lieu. La colonne `template` du catalogue (écrite par `annotate`) les nomme
    (« extracteur:fiches_cartes ») ; « aucun » = lieu analysé, aucun gabarit ; colonne vide ou absente = lieu
    non analysé, tous les extracteurs sont essayés."""
    tags = [t for t in (venue.get("template") or "").split("|") if t]
    if not tags:
        return list(EXTRACTORS)
    return [t.split(":", 1)[1] for t in tags if t.startswith("extracteur:") and t.split(":", 1)[1] in EXTRACTORS]


def detect(fetcher: PoliteFetcher, venue: dict) -> str:
    """Valeur de la colonne `template` : empreinte (thème ou CMS, billetteries, extension d'agenda) puis
    extracteurs applicables, mesurés sur l'accueil et les pages agenda (en cache après le triage)."""
    home = fetcher.get(venue["website"])
    if not home.ok:
        return ""
    pages = billetterie.site_pages(fetcher, venue) or [home]
    fp = fingerprint.merge([fingerprint.fingerprint_html(p.text, p.final_url) for p in pages])
    tags = [t for t in fingerprint.template_label(fp).split("|") if t]
    if "billetreduc" in fp["widgets"] or any(BR_SALLE_RE.search(p.text) for p in pages):
        tags.append("extracteur:billetreduc_salle")
    if len(family_links(pages)) >= MIN_FAMILY_SIZE:
        tags.append("extracteur:fiches_famille")
    if len(card_links(home)) >= MIN_CARDS:
        tags.append("extracteur:fiches_cartes")
    return "|".join(tags) or "aucun"


def annotate(csv_in: str, csv_out: str, fetcher: PoliteFetcher, workers: int = 6, log=print) -> None:
    """Écrit la colonne `template` du catalogue (les autres colonnes sont conservées telles quelles)."""
    import csv
    from concurrent.futures import ThreadPoolExecutor

    with open(csv_in, encoding="utf-8", newline="") as f:
        rows = list(csv.DictReader(f))
    columns = list(rows[0].keys()) if rows else []
    if "template" not in columns:
        columns.append("template")

    def work(row: dict) -> None:
        row["template"] = ""
        if row.get("website") and row.get("status") in ("ok", "", None):
            try:
                row["template"] = detect(fetcher, dict(row, website=triage.normalize_website(row["website"])))
            except Exception:  # un site illisible ne doit pas arrêter l'analyse
                row["template"] = ""

    with ThreadPoolExecutor(max_workers=workers) as pool:
        for i, _ in enumerate(pool.map(work, rows), start=1):
            if i % 50 == 0:
                log(f"gabarits: {i}/{len(rows)} lieux")
    with open(csv_out, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow({c: row.get(c, "") for c in columns})


def main() -> None:
    import argparse

    ap = argparse.ArgumentParser(description="Détecte le gabarit de chaque lieu et l'écrit dans la colonne `template` du catalogue")
    ap.add_argument("--catalogue", default="data/venues/catalogue.csv")
    ap.add_argument("--out", default="data/venues/catalogue.csv")
    args = ap.parse_args()
    annotate(args.catalogue, args.out, PoliteFetcher(), log=lambda m: print(m, flush=True))


def complement(fetcher: PoliteFetcher, venue: dict, today: Optional[date] = None, known: int = 0) -> tuple[list[dict], dict]:
    """Enregistrements des extracteurs de gabarit pour un lieu (liste vide si aucun ne s'applique).
    `known` : nombre de spectacles déjà extraits par les autres sources."""
    records: list[dict] = []
    info: dict = {}
    for name in selected(venue):
        extractor = EXTRACTORS[name]
        groups, sub = extractor(fetcher, venue, today, known)
        info[name] = sub.get("status", "")
        records += schemaorg.records_from_groups(groups, venue, f"direct:gabarit_{name}", today=today)
    return records, info


if __name__ == "__main__":
    main()
