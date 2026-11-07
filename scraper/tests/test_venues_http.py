import tempfile
import unittest

from scraper.venues.http import PoliteFetcher


class FakeResponse:
    def __init__(self, status=200, text="<html></html>", url=""):
        self.status_code, self.text, self.url = status, text, url
        self.headers = {"content-type": "text/html; charset=utf-8"}
        self.apparent_encoding = "utf-8"


class FakeFetcher(PoliteFetcher):
    """Remplace le réseau par un dictionnaire {url: FakeResponse} et compte les appels."""

    def __init__(self, routes, cache_dir):
        super().__init__(cache_dir=cache_dir, min_interval=0)
        self.routes = routes
        self.calls = []

    def _raw_get(self, url):
        self.calls.append(url)
        self.network_requests += 1
        resp = self.routes.get(url, FakeResponse(404))
        resp.url = resp.url or url
        return resp


class PoliteFetcherTests(unittest.TestCase):
    def test_cache_disque_evite_la_seconde_requete(self):
        with tempfile.TemporaryDirectory() as tmp:
            routes = {"https://a.fr/": FakeResponse(200, "<html>ok</html>")}
            f = FakeFetcher(routes, tmp)
            self.assertTrue(f.get("https://a.fr/").ok)
            first = len(f.calls)
            page = f.get("https://a.fr/")
            self.assertTrue(page.from_cache)
            self.assertEqual(len(f.calls), first)

    def test_robots_interdit_aucune_requete_sur_la_page(self):
        with tempfile.TemporaryDirectory() as tmp:
            routes = {"https://b.fr/robots.txt": FakeResponse(200, "User-agent: *\nDisallow: /prive")}
            f = FakeFetcher(routes, tmp)
            page = f.get("https://b.fr/prive/x")
            self.assertEqual(page.note, "robots")
            self.assertNotIn("https://b.fr/prive/x", f.calls)

    def test_site_qui_bloque_est_note_bloque_apres_une_seule_relance(self):
        with tempfile.TemporaryDirectory() as tmp:
            routes = {"https://c.fr/": FakeResponse(403)}
            f = FakeFetcher(routes, tmp)
            import scraper.venues.http as http_mod

            original = http_mod.time.sleep
            http_mod.time.sleep = lambda s: None
            try:
                page = f.get("https://c.fr/")
            finally:
                http_mod.time.sleep = original
            self.assertEqual(page.note, "bloqué")
            self.assertEqual(f.calls.count("https://c.fr/"), 2)

    def test_page_de_defi_anti_bot_est_bloquee(self):
        with tempfile.TemporaryDirectory() as tmp:
            routes = {"https://d.fr/": FakeResponse(200, "<title>Just a moment...</title>")}
            f = FakeFetcher(routes, tmp)
            self.assertEqual(f.get("https://d.fr/").note, "bloqué")


if __name__ == "__main__":
    unittest.main()
