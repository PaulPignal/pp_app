import unittest

from bs4 import BeautifulSoup

from scraper import parsers


def _soup(html: str) -> BeautifulSoup:
    return BeautifulSoup(html, "html.parser")


class ExtractCreditsTests(unittest.TestCase):
    def test_cinema_labelled_block(self):
        html = """
        <div class="fiche">Réalisation : <a href="/artiste/x">Georges Franju</a>
          Principaux artistes : <a href="/artiste/a">Pierre Brasseur</a>, <a href="/artiste/b">Alida Valli</a>
          Genre : Horreur</div>
        <footer>Avec L'Officiel des spectacles !</footer>
        """
        director, cast = parsers.extract_credits(_soup(html))
        self.assertEqual(director, "Georges Franju")
        self.assertEqual(cast, ["Pierre Brasseur", "Alida Valli"])

    def test_cinema_itemprop_fallback_excludes_crew(self):
        html = """
        <div>Réalisation : <a href="/artiste/x">Jane Doe</a> Genre : Drame</div>
        <div><a itemprop="actors" href="/a">Actor One ( Hero )</a>
             <a itemprop="actors" href="/b">Composer Guy (musique)</a></div>
        """
        director, cast = parsers.extract_credits(_soup(html))
        self.assertEqual(director, "Jane Doe")
        self.assertEqual(cast, ["Actor One"])  # le membre d'équipe (musique) est exclu

    def test_theatre_director_only(self):
        html = (
            '<p>De <a itemprop="performer" href="/x">Guilhem Connac</a>, '
            '<a itemprop="performer" href="/y">Benoît Labannierre</a>, '
            'mise en scène <a itemprop="performer" href="/z">Romain Thunin</a>.</p>'
        )
        director, cast = parsers.extract_credits(_soup(html))
        self.assertEqual(director, "Romain Thunin")
        self.assertEqual(cast, [])  # pas d'acteurs listés (auteurs non confondus avec le casting)

    def test_theatre_with_avec_cast(self):
        html = (
            '<p>De <a itemprop="performer" href="/x">Dostoïevski</a>, '
            'mise en scène <a itemprop="performer" href="/d">Dominique Scheer</a>, '
            'avec <a itemprop="performer" href="/a">Jérémy Petit</a>, '
            '<a itemprop="performer" href="/b">Milena Marinelli</a>.</p>'
        )
        director, cast = parsers.extract_credits(_soup(html))
        self.assertEqual(director, "Dominique Scheer")
        self.assertEqual(cast, ["Jérémy Petit", "Milena Marinelli"])


class ParsersTests(unittest.TestCase):
    def test_parse_prices_range(self):
        self.assertEqual(parsers.parse_prices("Tarifs de 22€ à 83€"), (22.0, 83.0))

    def test_parse_prices_single(self):
        self.assertEqual(parsers.parse_prices("Place à 30€"), (30.0, 30.0))

    def test_parse_prices_multiple_takes_min_max(self):
        self.assertEqual(parsers.parse_prices("12€, 25€ et 40€"), (12.0, 40.0))

    def test_parse_prices_handles_comma_decimal(self):
        self.assertEqual(parsers.parse_prices("9,5€"), (9.5, 9.5))

    def test_parse_prices_none(self):
        self.assertEqual(parsers.parse_prices("aucun prix"), (None, None))

    def test_parse_duration_hours_minutes(self):
        self.assertEqual(parsers.parse_duration("1h29"), 89)
        self.assertEqual(parsers.parse_duration("2h"), 120)
        self.assertEqual(parsers.parse_duration("90 min"), 90)

    def test_looks_like_duration_requires_context_for_hours(self):
        self.assertFalse(parsers.looks_like_duration_text("Représentation à 20h30"))
        self.assertTrue(parsers.looks_like_duration_text("Durée : 1h30"))
        self.assertTrue(parsers.looks_like_duration_text("20h30", allow_hour_only=True))

    def test_parse_iso8601_duration(self):
        self.assertEqual(parsers.parse_iso8601_duration("PT1H29M"), 89)
        self.assertEqual(parsers.parse_iso8601_duration("PT45M"), 45)
        self.assertIsNone(parsers.parse_iso8601_duration("garbage"))

    def test_is_valid_iso_date(self):
        self.assertTrue(parsers.is_valid_iso_date("2026-03-12"))
        self.assertFalse(parsers.is_valid_iso_date("12/03/2026"))
        self.assertFalse(parsers.is_valid_iso_date(None))


class ExtractCinemaMetaTests(unittest.TestCase):
    def test_nationality_and_year(self):
        html = (
            "<div>Genre : Horreur Nationalité : France Durée : 1h22 "
            "Année de production : 1959 Date de sortie</div>"
        )
        country, year = parsers.extract_cinema_meta(_soup(html))
        self.assertEqual(country, "France")
        self.assertEqual(year, 1959)

    def test_multiword_nationality_stops_at_next_label(self):
        html = "<div>Nationalité : Etats-Unis Langue : anglais Année de production : 1978</div>"
        country, year = parsers.extract_cinema_meta(_soup(html))
        self.assertEqual(country, "Etats-Unis")
        self.assertEqual(year, 1978)

    def test_missing_fields(self):
        country, year = parsers.extract_cinema_meta(_soup("<div>Aucune fiche technique</div>"))
        self.assertIsNone(country)
        self.assertIsNone(year)

    def test_year_out_of_range_ignored(self):
        country, year = parsers.extract_cinema_meta(_soup("<div>Année de production : 1700</div>"))
        self.assertIsNone(year)


class ExtractArrondissementTests(unittest.TestCase):
    def test_from_address_locality(self):
        html = '<span itemprop="addressLocality">Paris 5e</span>'
        self.assertEqual(parsers.extract_arrondissement(_soup(html)), "Paris 5e")

    def test_fallback_from_postal_code(self):
        html = '<span itemprop="postalCode">75010</span>'
        self.assertEqual(parsers.extract_arrondissement(_soup(html)), "Paris 10e")

    def test_postal_code_first_arrondissement(self):
        self.assertEqual(parsers.arrondissement_from_postal("75001"), "Paris 1er")

    def test_non_paris_postal_code(self):
        self.assertIsNone(parsers.arrondissement_from_postal("92100"))

    def test_missing(self):
        self.assertIsNone(parsers.extract_arrondissement(_soup("<div>rien</div>")))


if __name__ == "__main__":
    unittest.main()
