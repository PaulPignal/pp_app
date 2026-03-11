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
            category="théâtre",
            venue="Lieu",
            description="Description",
            crawled_at=(datetime.now(timezone.utc) - timedelta(hours=96)).isoformat(),
        )

        self.assertTrue(self.scraper._should_refresh_detail(show))


if __name__ == "__main__":
    unittest.main()
