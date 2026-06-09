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


class ExtractOffersTests(unittest.TestCase):
    def test_full_offer(self):
        html = (
            '<div itemprop="offers">'
            '<link itemprop="availability" href="https://schema.org/InStock">'
            '<span itemprop="priceCurrency">EUR</span>'
            '<span itemprop="lowPrice">18,50</span><span itemprop="highPrice">42</span>'
            '</div>'
        )
        o = parsers.extract_offers(_soup(html))
        self.assertEqual(o["availability"], "InStock")
        self.assertEqual(o["currency"], "EUR")
        self.assertEqual(o["price_min"], 18.5)
        self.assertEqual(o["price_max"], 42.0)

    def test_single_price(self):
        html = (
            '<meta itemprop="availability" content="https://schema.org/SoldOut">'
            '<span itemprop="price">24.50</span><span itemprop="priceCurrency">EUR</span>'
        )
        o = parsers.extract_offers(_soup(html))
        self.assertEqual(o["availability"], "SoldOut")
        self.assertEqual(o["price_min"], 24.5)
        self.assertEqual(o["price_max"], 24.5)

    def test_unknown_availability_dropped(self):
        o = parsers.extract_offers(_soup('<link itemprop="availability" href="https://schema.org/Bogus">'))
        self.assertIsNone(o["availability"])

    def test_empty(self):
        o = parsers.extract_offers(_soup("<div>rien</div>"))
        self.assertEqual(o, {"availability": None, "currency": None, "price_min": None, "price_max": None})


class VenueTests(unittest.TestCase):
    def test_offi_id_from_url(self):
        self.assertEqual(parsers.offi_id_from_url("https://www.offi.fr/cinema/le-chaplin-3113.html"), 3113)
        self.assertEqual(parsers.offi_id_from_url("https://www.offi.fr/theatre/x-2490.html"), 2490)
        self.assertIsNone(parsers.offi_id_from_url("https://www.offi.fr/theatre/"))

    def test_theatre_venue_url_from_show(self):
        url = "https://www.offi.fr/theatre/theatre-de-la-huchette-2490/crime-et-chatiment-105182.html"
        self.assertEqual(
            parsers.theatre_venue_url_from_show(url),
            "https://www.offi.fr/theatre/theatre-de-la-huchette-2490.html",
        )
        self.assertIsNone(parsers.theatre_venue_url_from_show("https://www.offi.fr/theatre/x-2490.html"))

    def test_cinema_venue_links(self):
        html = (
            '<a href="/cinema/le-chaplin-3113.html">Le Chaplin</a>'
            '<a href="/cinema/le-chaplin-3113.html#onglet-acces">accès</a>'
            '<a href="https://www.offi.fr/cinema/ugc-velizy-3340.html">UGC</a>'
            '<a href="/cinema/evenement/film-104603.html">un film</a>'
        )
        links = sorted(parsers.cinema_venue_links(_soup(html)))
        self.assertEqual(
            links,
            [
                ("https://www.offi.fr/cinema/le-chaplin-3113.html", 3113),
                ("https://www.offi.fr/cinema/ugc-velizy-3340.html", 3340),
            ],
        )

    def test_extract_venue(self):
        html = (
            '<h1>Le Chaplin - Saint-Lambert</h1>'
            '<span itemprop="streetAddress">6 rue Péclet</span>'
            '<span itemprop="postalCode">75015</span>'
            '<span itemprop="addressLocality">Paris 15e</span>'
            '<span itemprop="addressCountry">FR</span>'
            '<meta itemprop="Latitude" content="48.8432">'
            '<meta itemprop="Longitude" content="2.2985">'
            '<span itemprop="telephone">01.42.50.23.32 (tlj 13h30-21h)</span>'
            '<p>Métro : Commerce Accès PMR, salle climatisée</p>'
            '<meta property="og:image" content="https://files.offi.fr/lieu/3113/images/1000/x.jpg">'
            # Boutons de partage (rel external mais hosts sociaux) → écartés
            '<a rel="external" href="https://pinterest.com/pin/create/x">Pinterest</a>'
            '<a href="https://wa.me/?text=x">WhatsApp</a>'
            # Site officiel du lieu → retenu
            '<a rel="external nofollow" href="http://www.lechaplin.fr">www.lechaplin.fr</a>'
        )
        v = parsers.extract_venue(_soup(html), "https://www.offi.fr/cinema/le-chaplin-3113.html", "cinema")
        self.assertEqual(v["offi_id"], 3113)
        self.assertEqual(v["name"], "Le Chaplin - Saint-Lambert")
        self.assertEqual(v["postal_code"], "75015")
        self.assertEqual(v["city"], "Paris 15e")
        self.assertEqual(v["latitude"], 48.8432)
        self.assertEqual(v["phone"], "01.42.50.23.32")
        self.assertEqual(v["metro"], "Commerce")  # coupé à la rubrique suivante
        self.assertEqual(v["access"], "Accès PMR, Espace climatisé")
        self.assertTrue(v["image"].endswith("x.jpg"))
        self.assertEqual(v["website"], "http://www.lechaplin.fr")  # site officiel, pas le partage

    def test_extract_venue_requires_name(self):
        self.assertIsNone(parsers.extract_venue(_soup("<div>no h1</div>"), "https://www.offi.fr/cinema/x-1.html", "cinema"))


class ExtractDescriptionTests(unittest.TestCase):
    def test_prefers_itemprop_over_promo_meta(self):
        html = (
            '<meta name="description" content="Réservez vos billets ✓ pour X • Du 5 juin">'
            '<div itemprop="description">Mathurin Bolze réinvente sur scène un spectacle acrobatique et magnétique.</div>'
        )
        self.assertEqual(
            parsers.extract_description(_soup(html)),
            'Mathurin Bolze réinvente sur scène un spectacle acrobatique et magnétique.',
        )

    def test_section_heading_fallback(self):
        html = '<h2>Présentation</h2><p>Une comédie baroque pleine de rebondissements et de musique.</p>'
        self.assertEqual(
            parsers.extract_description(_soup(html)),
            'Une comédie baroque pleine de rebondissements et de musique.',
        )

    def test_meta_last_resort(self):
        html = '<meta name="description" content="Description de repli quand rien d autre.">'
        self.assertEqual(parsers.extract_description(_soup(html)), 'Description de repli quand rien d autre.')

    def test_none_when_empty(self):
        self.assertIsNone(parsers.extract_description(_soup('<div>rien</div>')))


class ExtractCinemaVenuesTests(unittest.TestCase):
    def test_dedup_and_count(self):
        html = (
            '<span class="nomSalle">Le Chaplin</span>'
            '<span class="nomSalle">UGC Les Halles</span>'
            '<span class="nomSalle">Le Chaplin</span>'  # doublon (autre horaire)
            '<span class="nomSalle">Le Balzac</span>'
        )
        count, sample = parsers.extract_cinema_venues(_soup(html))
        self.assertEqual(count, 3)
        self.assertEqual(sample, ['Le Chaplin', 'UGC Les Halles', 'Le Balzac'])

    def test_empty(self):
        self.assertEqual(parsers.extract_cinema_venues(_soup('<div>rien</div>')), (0, []))


if __name__ == "__main__":
    unittest.main()
