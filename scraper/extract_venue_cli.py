# -*- coding: utf-8 -*-
"""Lit le HTML d'une page lieu Offi sur stdin, imprime le lieu en JSON.
Usage : python extract_venue_cli.py <source_url> <kind>  (kind = theatre|cinema)
Réutilise parsers.extract_venue (même logique que le scraper) — utilisé par
app/scripts/backfill-venues.ts."""
import sys
import json

from bs4 import BeautifulSoup

try:
    from scraper import parsers  # contexte package
except ImportError:  # exécuté depuis le dossier scraper/
    import parsers  # type: ignore[no-redef]


def main() -> None:
    source_url = sys.argv[1] if len(sys.argv) > 1 else ""
    kind = sys.argv[2] if len(sys.argv) > 2 else "theatre"
    venue = parsers.extract_venue(BeautifulSoup(sys.stdin.read(), "html.parser"), source_url, kind)
    print(json.dumps(venue, ensure_ascii=False))


if __name__ == "__main__":
    main()
