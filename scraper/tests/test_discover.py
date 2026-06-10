# -*- coding: utf-8 -*-
import unittest

from scraper import discover


# Extrait simplifié d'une home de théâtre (cas réels : Montparnasse).
HTML = """
<a href="/spectacle/tango/">¡Tango!</a>
<a href="/spectacle/ancien-malade-des-hopitaux-de-paris/">Ancien malade</a>
<a href="/spectacle/la-femme-qui-naimait-pas-rabbi-jacob-3/">La Femme...</a>
<a href="/histoire/">Notre histoire</a>
<a href="/contact-et-reservation/">Réserver</a>
<a href="https://twitter.com/x">Twitter</a>
"""
BASE = "https://www.theatremontparnasse.com"


class SlugifyTests(unittest.TestCase):
    def test_strips_accents_and_punct(self):
        self.assertEqual(discover.slugify("¡Tango!"), "tango")
        self.assertEqual(discover.slugify("Ancien malade des hôpitaux"), "ancien-malade-des-hopitaux")

    def test_tokens_drop_short_and_stopwords(self):
        self.assertEqual(discover.tokens("La Femme qui n'aimait pas"), {"femme", "aimait"})


class MatchTitlesTests(unittest.TestCase):
    def test_matches_known_shows(self):
        m = discover.match_titles(
            HTML, BASE, ["¡Tango!", "Ancien malade des hôpitaux de Paris", "La Femme qui n'aimait pas Rabbi Jacob"]
        )
        self.assertEqual(m["¡Tango!"], f"{BASE}/spectacle/tango/")
        self.assertTrue(m["Ancien malade des hôpitaux de Paris"].endswith("/spectacle/ancien-malade-des-hopitaux-de-paris/"))
        self.assertIn("rabbi-jacob", m["La Femme qui n'aimait pas Rabbi Jacob"])

    def test_short_title_not_matched(self):
        # « Art » = 1 token → trop court, on n'invente pas de lien.
        self.assertEqual(discover.match_titles(HTML, BASE, ["« Art »"]), {})

    def test_absent_show_not_matched(self):
        self.assertEqual(discover.match_titles(HTML, BASE, ["The Loop"]), {})

    def test_nav_pages_excluded(self):
        # "Notre histoire" ne doit pas être pris comme un spectacle.
        self.assertEqual(discover.match_titles(HTML, BASE, ["Le Porteur d'histoire"]), {})


class InferTemplateTests(unittest.TestCase):
    def test_slug_only_template(self):
        pairs = [
            ("¡Tango!", f"{BASE}/spectacle/tango/"),
            ("Laponie", f"{BASE}/spectacle/laponie/"),
        ]
        tpl, support = discover.infer_template(pairs)
        self.assertEqual(tpl, f"{BASE}/spectacle/{{slug}}/")
        self.assertEqual(support, 2)
        self.assertEqual(discover.build_event_url(tpl, "Laponie"), f"{BASE}/spectacle/laponie/")

    def test_root_slug_template(self):
        tpl, _ = discover.infer_template([("Tout contre la terre", "https://comediedeparis.com/tout-contre-la-terre")])
        self.assertEqual(tpl, "https://comediedeparis.com/{slug}")

    def test_rejects_numeric_id_path(self):
        # /spectacle/79/<slug> : id imprévisible → pas de gabarit reconstructible.
        tpl, support = discover.infer_template([("Soirée Humour", "https://x.com/spectacle/79/soiree-humour")])
        self.assertIsNone(tpl)
        self.assertEqual(support, 0)


if __name__ == "__main__":
    unittest.main()
