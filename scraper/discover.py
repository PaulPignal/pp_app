# -*- coding: utf-8 -*-
"""Découverte des pages dédiées d'un spectacle sur le site officiel du lieu.

Offi n'expose pas de lien profond pour le théâtre. Mais le site du lieu liste ses
spectacles courants avec, partout, le titre dans le slug/texte du lien — sans schéma
d'URL commun (theatremontparnasse.com/spectacle/<slug>/, comediedeparis.com/<slug>…).

On ne *fabrique* donc pas l'URL : on *découvre* les liens de la page du lieu et on
matche chaque titre de façon **conservatrice** (mieux vaut aucun lien qu'un mauvais).
Fonctions pures (HTML en entrée) → testables sans réseau.
"""
from __future__ import annotations

import re
import unicodedata
from typing import Optional
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup

# Mots vides FR/EN : exclus des tokens de matching (bruit, pas discriminants).
_STOP = {
    "les", "des", "une", "que", "qui", "pour", "sur", "avec", "dans", "the", "and",
    "nen", "tout", "tous", "toute", "aux", "par", "ses", "son", "sa", "mes", "vos",
    "nos", "leur", "ce", "cet", "cette", "est", "ne", "pas", "plus", "moins",
}
# Segments de navigation (jamais une fiche spectacle) : on les écarte d'office.
_NAV = {
    "contact", "acces", "infos", "info", "billetterie", "reservation", "reservations",
    "mentions", "mentions-legales", "cookies", "newsletter", "histoire", "agenda",
    "programmation", "programme", "saison", "categorie", "categorie-spectacle",
    "spectacles", "actualites", "presse", "partenaires", "mecenat", "faq", "plan",
    "accueil", "home", "boutique", "offres", "scolaires", "groupes", "accessibilite",
}


def slugify(value: str) -> str:
    value = unicodedata.normalize("NFKD", value or "").encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def tokens(value: str) -> set[str]:
    return {t for t in slugify(value).split("-") if len(t) >= 3 and t not in _STOP}


def _candidates(soup, base_url: str) -> list[tuple[str, str, set[str]]]:
    """Liens internes (url, slug du dernier segment, tokens slug+texte du lien)."""
    host = urlparse(base_url).netloc
    out: list[tuple[str, str, set[str]]] = []
    seen: set[str] = set()
    for a in soup.find_all("a", href=True):
        url = urljoin(base_url, a["href"])
        parsed = urlparse(url)
        if parsed.netloc != host:
            continue
        url = parsed._replace(query="", fragment="").geturl()
        path = parsed.path.strip("/")
        if not path or url in seen:
            continue
        segs = [s for s in path.split("/") if s]
        last = segs[-1]
        if last in _NAV or segs[0] in _NAV:
            continue
        seen.add(url)
        cslug = slugify(last)
        ctoks = tokens(last) | tokens(a.get_text(" ", strip=True))
        out.append((url, cslug, ctoks))
    return out


def match_title(title: str, candidates: list[tuple[str, str, set[str]]]) -> Optional[str]:
    """URL la plus probable pour ce titre, ou None si rien d'assez sûr.

    Conservateur, par ordre de confiance :
      1. slug du titre == slug candidat (égalité exacte) → sûr, même titre court ;
      2. slug du titre (≥ 8 car.) contenu dans le slug candidat ;
      3. ≥ 2 tokens communs couvrant ≥ 60 % du titre (titres ≥ 2 tokens).
    Sinon, rien (mieux vaut aucun lien qu'un mauvais)."""
    tslug = slugify(title)
    tt = tokens(title)
    best_url: Optional[str] = None
    best_score = 0.0
    for url, cslug, ctoks in candidates:
        score = 0.0
        if tslug and tslug == cslug:
            score = 1.0
        elif len(tslug) >= 8 and tslug in cslug:
            score = 1.0
        elif len(tt) >= 2:
            inter = tt & ctoks
            if len(inter) >= 2:
                recall = len(inter) / len(tt)
                if recall >= 0.6:
                    score = recall
        if score > best_score:
            best_score, best_url = score, url
    return best_url if best_score >= 0.6 else None


def match_titles(html: str, base_url: str, titles: list[str]) -> dict[str, str]:
    """Map {titre: url} pour les titres matchés avec confiance."""
    soup = BeautifulSoup(html or "", "html.parser")
    cands = _candidates(soup, base_url)
    result: dict[str, str] = {}
    for title in titles:
        url = match_title(title, cands)
        if url:
            result[title] = url
    return result


def _main() -> None:
    import json
    import sys

    base_url = sys.argv[1] if len(sys.argv) > 1 else ""
    payload = json.loads(sys.stdin.read() or "{}")
    matches = match_titles(payload.get("html", ""), base_url, payload.get("titles", []))
    print(json.dumps({"matches": matches}, ensure_ascii=False))


if __name__ == "__main__":
    _main()
