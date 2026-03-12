import unittest
from datetime import datetime, timedelta, timezone

from bs4 import BeautifulSoup

from scraper.offi_scraper import OffiScraper, Show


class OffiScraperTests(unittest.TestCase):
    def setUp(self):
        self.scraper = OffiScraper()

    def test_extract_category_from_rubric(self):
        text = "Le spectacle X est référencé dans notre rubrique Humour & Shows ."
        self.assertEqual(self.scraper._extract_category(text), "humour")

    def test_validate_show_normalizes_ranges(self):
        show = Show(
            url="https://www.offi.fr/theatre/theatre-antoine-1408/le-bourgeois-gentilhomme-101852.html",
            title="Le Bourgeois gentilhomme",
            date_start="2025-11-15",
            date_end="2025-08-27",
            price_min_eur=83.0,
            price_max_eur=22.0,
        )

        validated = self.scraper._validate_show(show)

        self.assertIsNotNone(validated)
        self.assertEqual(validated.section, "theatre")
        self.assertEqual(validated.category, "théâtre")
        self.assertEqual(validated.date_start, "2025-08-27")
        self.assertEqual(validated.date_end, "2025-11-15")
        self.assertEqual(validated.price_min_eur, 22.0)
        self.assertEqual(validated.price_max_eur, 83.0)

    def test_extract_address_from_html(self):
        soup = BeautifulSoup(
            """
            <html>
              <body>
                <div class="venue-address">14 boulevard de Strasbourg 75010 Paris</div>
              </body>
            </html>
            """,
            "html.parser",
        )

        self.assertEqual(
            self.scraper._extract_address(soup),
            "14 boulevard de Strasbourg 75010 Paris",
        )

    def test_generic_rubric_is_not_a_venue(self):
        self.assertFalse(self.scraper._looks_like_venue_text("Pièces de théâtre"))

    def test_time_of_day_is_not_parsed_as_duration_without_context(self):
        self.assertFalse(self.scraper._looks_like_duration_text("Représentation à 20h30"))
        self.assertTrue(self.scraper._looks_like_duration_text("Durée : 1h30"))

    def test_complete_recent_cache_can_be_reused(self):
        show = Show(
            url="https://www.offi.fr/theatre/test-1/show-1.html",
            title="Titre",
            section="theatre",
            category="théâtre",
            venue="Lieu",
            description="Description",
            crawled_at=(datetime.now(timezone.utc) - timedelta(hours=2)).isoformat(),
        )

        self.assertFalse(self.scraper._should_refresh_detail(show))

    def test_stale_cache_is_refreshed(self):
        show = Show(
            url="https://www.offi.fr/theatre/test-1/show-1.html",
            title="Titre",
            section="theatre",
            category="théâtre",
            venue="Lieu",
            description="Description",
            crawled_at=(datetime.now(timezone.utc) - timedelta(hours=96)).isoformat(),
        )

        self.assertTrue(self.scraper._should_refresh_detail(show))

    def test_show_from_legacy_payload_infers_theatre_section(self):
        show = self.scraper._show_from_payload(
            {
                "url": "https://www.offi.fr/theatre/theatre-antoine-1408/le-bourgeois-gentilhomme-101852.html",
                "title": "Le Bourgeois gentilhomme",
            }
        )

        self.assertIsNotNone(show)
        self.assertEqual(show.section, "theatre")

    def test_normalize_show_url_accepts_cinema_detail_pages(self):
        normalized = self.scraper._normalize_show_url(
            "/cinema/evenement/carmen-de-kawachi-45189.html?foo=1#bar",
            "cinema",
        )

        self.assertEqual(normalized, "https://www.offi.fr/cinema/evenement/carmen-de-kawachi-45189.html")

    def test_complete_cinema_detail_page_extracts_fields(self):
        html = """
        <html>
          <head>
            <meta property="og:image" content="https://files.offi.fr/cinema.jpg" />
            <meta name="description" content="Une restauration flamboyante du mélodrame de Mizoguchi." />
            <script type="application/ld+json">
              {
                "@context": "https://schema.org",
                "@type": "Movie",
                "genre": "drame",
                "duration": "PT1H29M",
                "datePublished": "2026-03-12"
              }
            </script>
          </head>
          <body>
            <h1>Carmen de Kawachi</h1>
            <section class="meta">
              Genre : drame
              Date de sortie (ou ressortie) en France : 12 mars 2026
              Durée : 1h29
            </section>
            <h2>Synopsis</h2>
            <p>Une jeune femme tente d'échapper à la violence de son milieu.</p>
          </body>
        </html>
        """
        self.scraper._fetch_page = lambda url: BeautifulSoup(html, "html.parser")

        show = self.scraper._complete_show_from_detail_page(
            Show(
                url="https://www.offi.fr/cinema/evenement/carmen-de-kawachi-45189.html",
                section="cinema",
            )
        )

        self.assertEqual(show.title, "Carmen de Kawachi")
        self.assertEqual(show.section, "cinema")
        self.assertEqual(show.category, "drame")
        self.assertEqual(show.date_start, "2026-03-12")
        self.assertEqual(show.duration_min, 89)
        self.assertEqual(show.image, "https://files.offi.fr/cinema.jpg")
        self.assertIn("Une jeune femme", show.description)
        self.assertIsNone(show.venue)


if __name__ == "__main__":
    unittest.main()
