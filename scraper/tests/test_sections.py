import unittest

from scraper.offi_scraper import SECTION_CONFIGS, SECTION_VALUES, OffiScraper


class SectionTests(unittest.TestCase):
    def test_six_sections_configured(self):
        expected = {"theatre", "cinema", "exposition", "concert", "visite", "enfants"}
        self.assertEqual(set(SECTION_CONFIGS), expected)
        self.assertEqual(SECTION_VALUES, expected)

    def test_infer_section_from_url(self):
        infer = OffiScraper._infer_section_from_url
        self.assertEqual(infer("https://www.offi.fr/expositions-musees/grand-palais-5399/x-1.html"), "exposition")
        self.assertEqual(infer("https://www.offi.fr/concerts/cafe-1598/x-2.html"), "concert")
        self.assertEqual(infer("https://www.offi.fr/visites-conferences/g-1/x-3.html"), "visite")
        self.assertEqual(infer("https://www.offi.fr/enfants/t-1/x-4.html"), "enfants")
        self.assertEqual(infer("https://www.offi.fr/theatre/t-1/x-5.html"), "theatre")
        self.assertEqual(infer("https://www.offi.fr/cinema/evenement/x-6.html"), "cinema")
        self.assertIsNone(infer("https://example.com/x"))

    def test_new_section_show_path_matches(self):
        cfg = SECTION_CONFIGS["concert"]
        self.assertTrue(cfg.show_path_re.match("/concerts/cafe-de-la-danse-1598/ondara-3239844.html"))
        self.assertTrue(cfg.venue_path_re.match("/concerts/cafe-de-la-danse-1598.html"))


if __name__ == "__main__":
    unittest.main()
