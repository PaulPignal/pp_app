# -*- coding: utf-8 -*-
"""Lit le HTML d'une fiche Offi sur stdin, imprime {"director","cast"} en JSON.
Réutilise parsers.extract_credits (même logique que le scraper) — utilisé par le
backfill one-off app/scripts/backfill-credits.ts."""
import sys
import json

from bs4 import BeautifulSoup

try:
    from scraper import parsers  # contexte package
except ImportError:  # exécuté depuis le dossier scraper/
    import parsers  # type: ignore[no-redef]


def main() -> None:
    html = sys.stdin.read()
    director, cast = parsers.extract_credits(BeautifulSoup(html, "html.parser"))
    print(json.dumps({"director": director, "cast": cast}, ensure_ascii=False))


if __name__ == "__main__":
    main()
