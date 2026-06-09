# -*- coding: utf-8 -*-
"""Lit le HTML d'une fiche Offi sur stdin, imprime en JSON les champs extraits
({"director","cast","arrondissement","country","year"}). Réutilise les parsers
du scraper (même logique) — utilisé par les backfills one-off de app/scripts/."""
import sys
import json

from bs4 import BeautifulSoup

try:
    from scraper import parsers  # contexte package
except ImportError:  # exécuté depuis le dossier scraper/
    import parsers  # type: ignore[no-redef]


def main() -> None:
    soup = BeautifulSoup(sys.stdin.read(), "html.parser")
    director, cast = parsers.extract_credits(soup)
    country, year = parsers.extract_cinema_meta(soup)
    arrondissement = parsers.extract_arrondissement(soup)
    offers = parsers.extract_offers(soup)
    description = parsers.extract_description(soup)
    cinema_venue_count, cinema_venues = parsers.extract_cinema_venues(soup)
    print(
        json.dumps(
            {
                "director": director,
                "cast": cast,
                "arrondissement": arrondissement,
                "country": country,
                "year": year,
                "availability": offers["availability"],
                "currency": offers["currency"],
                "price_min": offers["price_min"],
                "price_max": offers["price_max"],
                "description": description,
                "cinema_venue_count": cinema_venue_count,
                "cinema_venues": cinema_venues,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
