# -*- coding: utf-8 -*-
"""Gabarits de sites de lieux (07/11/2026) : empreinte technique et extracteur de familles de fiches.
Fixtures : pages publiques du Théâtre de Passy (thème Salient, fiches /spectacle/<titre>/) relevées le 07/11/2026."""
import os
import re
import unittest
from datetime import date

from scraper.venues import fingerprint, templates
from scraper.venues.http import Page

TODAY = date(2026, 11, 7)
FIXTURES = os.path.join(os.path.dirname(__file__), "fixtures", "venues")


def fixture(name: str) -> str:
    with open(os.path.join(FIXTURES, name + ".html"), encoding="utf-8") as f:
        return f.read()


class FakeFetcher:
    """Pages enregistrées uniquement : aucune requête réseau."""

    def __init__(self, pages: dict[str, str]):
        self.pages = pages
        self.requested: list[str] = []

    def get(self, url: str) -> Page:
        self.requested.append(url)
        text = self.pages.get(url)
        return Page(url, url, 200 if text is not None else 404, text or "")

    def project_fetcher(self):
        return self


class EmpreinteTests(unittest.TestCase):
    def test_wordpress_theme_et_plugins(self):
        fp = fingerprint.fingerprint_html(fixture("passy_accueil"), "https://theatredepassy.fr/")
        self.assertEqual(fp["cms"], "wordpress")
        self.assertEqual(fp["theme"], "salient")
        self.assertIn("salient-portfolio", fp["plugins"])
        self.assertEqual(fingerprint.template_label(fp).split("|")[-1], "theme:salient")

    def test_billetteries_et_identifiant(self):
        html = (
            '<html><body><a href="https://www.billetreduc.com/171/salle.htm">BR</a>'
            '<iframe src="https://shotgun.live/venues/le-lieu-x"></iframe>'
            '<a href="https://www.billetweb.fr/mon-spectacle">B</a>'
            '<a href="https://monsite.fr/autre">interne</a></body></html>'
        )
        fp = fingerprint.fingerprint_html(html, "https://monsite.fr/")
        self.assertEqual(fp["widgets"], {"billetreduc": "171", "shotgun": "le-lieu-x", "billetweb": "mon-spectacle"})
        self.assertIn("billetterie:billetreduc", fingerprint.template_label(fp))

    def test_extension_agenda_et_donnees_structurees(self):
        html = '<div class="tribe-events-calendar"></div><script type="application/ld+json">{"@type":"TheaterEvent","name":"X"}</script>'
        fp = fingerprint.fingerprint_html(html, "https://x.fr/")
        self.assertEqual(fp["calendar"], "the_events_calendar")
        self.assertTrue(fp["ld_event"])
        self.assertFalse(fingerprint.fingerprint_html("<p>rien</p>", "https://x.fr/")["ld_event"])

    def test_fusion_garde_l_identifiant_lisible(self):
        a = {"widgets": {"mapado": ""}, "plugins": ["a"]}
        b = {"widgets": {"mapado": "azimut"}, "plugins": ["b"], "theme": "divi"}
        merged = fingerprint.merge([a, b])
        self.assertEqual(merged["widgets"]["mapado"], "azimut")
        self.assertEqual(merged["plugins"], ["a", "b"])
        self.assertEqual(merged["theme"], "divi")


class FichesFamilleTests(unittest.TestCase):
    def setUp(self):
        self.accueil = fixture("passy_accueil")
        self.fiche = fixture("passy_fiche")
        self.fiche2 = fixture("passy_fiche2")

    def _venue(self):
        return {"slug": "theatre-de-passy-6975", "name": "Théâtre de Passy", "website": "https://theatredepassy.fr/",
                "address": "95 rue de Passy", "postal_code": "75016", "city": "Paris", "sections": ["theatre"], "offi_url": "x"}

    def test_famille_prise_sur_l_accueil_et_les_pages_liste(self):
        pages = [Page("https://theatredepassy.fr/", "https://theatredepassy.fr/", 200, self.accueil)]
        links = templates.family_links(pages)
        self.assertGreaterEqual(len(links), templates.MIN_FAMILY_SIZE)
        self.assertTrue(all("/spectacle/" in u for u in links))
        self.assertIn("https://theatredepassy.fr/spectacle/le-voleur-de-mots/", links)

    def test_famille_project_meme_dans_un_menu(self):
        html = '<nav>' + "".join(f'<a href="/project/spectacle-{c}/">S{c}</a>' for c in "abcde") + '</nav>'
        links = templates.family_links([Page("https://x.fr/", "https://x.fr/", 200, html)])
        self.assertEqual(len(links), 5)

    def test_pas_de_famille_sans_assez_de_soeurs(self):
        html = '<a href="/spectacle/a-b-c/">A</a><a href="/spectacle/d-e-f/">D</a><a href="/contact/">C</a>'
        pages = [Page("https://x.fr/", "https://x.fr/", 200, html)]
        self.assertEqual(templates.family_links(pages), [])

    def test_extraction_des_fiches_du_gabarit(self):
        links = templates.family_links([Page("https://theatredepassy.fr/", "https://theatredepassy.fr/", 200, self.accueil)])
        pages = {"https://theatredepassy.fr/": self.accueil,
                 "https://theatredepassy.fr/spectacle/le-voleur-de-mots/": self.fiche,
                 "https://theatredepassy.fr/spectacle/la-ptite-debrouille/": self.fiche2}
        for url in links:
            pages.setdefault(url, self.fiche2)  # fiches non enregistrées : lues comme la 2e (titres dédoublonnés)
        records, info = templates.complement(FakeFetcher(pages), self._venue(), TODAY)
        titles = {r["title"] for r in records}
        self.assertIn("Le Voleur de mots", titles)
        self.assertTrue(all(r["source"] == "direct:gabarit_fiches_famille" for r in records))
        self.assertEqual(info["fiches_famille"], "ok")

    def test_deja_couvert_ne_lit_aucune_fiche(self):
        fetcher = FakeFetcher({"https://theatredepassy.fr/": self.accueil})
        records, info = templates.complement(fetcher, self._venue(), TODAY, known=500)
        self.assertEqual(records, [])
        self.assertEqual(info["fiches_famille"], "deja_couvert")
        self.assertTrue(all(u == "https://theatredepassy.fr/" for u in fetcher.requested[:1]))


class FichesCartesTests(unittest.TestCase):
    def test_cartes_de_l_accueil_saint_georges(self):
        home = Page("https://theatre-saint-georges.com/", "https://theatre-saint-georges.com/", 200, fixture("saintgeorges_accueil"))
        links = templates.card_links(home)
        slugs = {u.rstrip("/").rsplit("/", 1)[-1].lower() for u in links}
        self.assertTrue({"the-loop", "telephone-moi", "blind-date"} <= slugs, slugs)
        self.assertFalse({"faq", "carte-cadeau", "lequipe", "photos"} & slugs)  # pages de service écartées

    def test_pas_de_cartes_sans_lien_reserver(self):
        html = "".join(f'<div><a href="/page-{c}-xxx/">Titre {c}</a></div>' for c in "abcd")
        home = Page("https://x.fr/", "https://x.fr/", 200, html)
        self.assertEqual(templates.card_links(home), [])

    def test_extraction_depuis_les_cartes(self):
        home = fixture("saintgeorges_accueil")
        pages = {"https://theatre-saint-georges.com/": home}
        for url in templates.card_links(Page("https://theatre-saint-georges.com/", "https://theatre-saint-georges.com/", 200, home)):
            pages[url] = fixture("saintgeorges_fiche")
        venue = {"slug": "theatre-saint-georges-3109", "name": "Théâtre Saint-Georges", "website": "https://theatre-saint-georges.com/",
                 "sections": ["theatre"], "address": "", "postal_code": "75009", "city": "Paris", "offi_url": "x"}
        records, info = templates.complement(FakeFetcher(pages), venue, TODAY)
        self.assertEqual(info["fiches_cartes"], "ok")
        self.assertTrue(any(r["source"] == "direct:gabarit_fiches_cartes" for r in records))


class WixPlatesTests(unittest.TestCase):
    def _home(self):
        menu = '<nav><ul>' + "".join(f'<li><a href="/menu-{c}-xxx">M</a></li>' for c in "abcdefg") + '</ul></nav>'
        section = '<section><div>' + "".join(f'<div><a href="/spectacle-{c}-titre">Titre {c}</a></div>' for c in "abcdefgh") + '</div></section>'
        pied = '<footer>' + "".join(f'<a href="/pied-{c}-xxx">P</a>' for c in "abcdefg") + '</footer>'
        return Page("https://x.fr/", "https://x.fr/", 200, f"<html><body>{menu}{section}<div><a href='/contact'>c</a><a href='/faq'>f</a></div>{pied}</body></html>")

    def test_sections_hors_menu_et_pied(self):
        links = templates.wix_section_links(self._home())
        self.assertEqual(len(links), 8)
        self.assertTrue(all("spectacle-" in u for u in links))

    def test_extracteur_reserve_aux_sites_wix(self):
        venue = {"slug": "x", "name": "X", "website": "https://x.fr/", "sections": ["theatre"]}
        groups, info = templates.fiches_wix_plates(FakeFetcher({"https://x.fr/": self._home().text}), venue, TODAY)
        self.assertEqual((groups, info["status"]), ([], "pas_wix"))  # pas de marqueur Wix dans la page

    def test_sections_trop_petites(self):
        html = '<section>' + "".join(f'<a href="/spectacle-{c}-titre">T</a>' for c in "abc") + '</section>'
        self.assertEqual(templates.wix_section_links(Page("https://x.fr/", "https://x.fr/", 200, html)), [])


class PlaceminuteTests(unittest.TestCase):
    def test_boutique_du_lieu(self):
        venue = {"slug": "le-colombier-1902", "name": "Le Colombier", "website": "https://lecolombier.fr/", "sections": ["theatre"],
                 "address": "", "postal_code": "93100", "city": "Bagnolet", "offi_url": "x"}
        shop = fixture("placeminute_boutique")
        pages = {"https://lecolombier.fr/": '<a href="https://le-colombier-langaja.placeminute.com/">Billetterie</a>',
                 "https://le-colombier-langaja.placeminute.com/": shop}
        self.assertTrue(templates.PLACEMINUTE_EVENT_RE.match("/event/danse/faire-corps,48727.html"))
        for url in set(re.findall(r'href="([^"]*,\d+\.html)[^"]*"', shop)):
            pages[("https://le-colombier-langaja.placeminute.com" + url) if url.startswith("/") else url] = fixture("placeminute_fiche")
        groups, info = templates.placeminute_boutique(FakeFetcher(pages), venue, TODAY)
        self.assertEqual(info["boutique"], "le-colombier-langaja")
        self.assertEqual(info["status"], "ok")
        self.assertGreaterEqual(len(groups), 1)

    def test_sans_boutique_rien_n_est_lu(self):
        venue = {"slug": "x", "name": "X", "website": "https://x.fr/"}
        groups, info = templates.placeminute_boutique(FakeFetcher({"https://x.fr/": "<p>rien</p>"}), venue, TODAY)
        self.assertEqual((groups, info["status"]), ([], "sans_placeminute"))

    def test_empreinte_identifiant_de_boutique(self):
        fp = fingerprint.fingerprint_html('<a href="https://lafleche.placeminute.com/event/x/y,1.html">r</a>', "https://lafleche.fr/")
        self.assertEqual(fp["widgets"], {"placeminute": "lafleche"})


class ColonneTemplateTests(unittest.TestCase):
    def test_selection_par_colonne(self):
        self.assertEqual(templates.selected({}), list(templates.EXTRACTORS))                       # lieu non analysé : tout est essayé
        self.assertEqual(templates.selected({"template": "aucun"}), [])                            # analysé, aucun gabarit
        self.assertEqual(templates.selected({"template": "theme:salient|extracteur:fiches_cartes"}), ["fiches_cartes"])
        self.assertEqual(templates.selected({"template": "extracteur:inconnu"}), [])

    def test_detection_sur_une_page_enregistree(self):
        venue = {"slug": "x", "name": "Passy", "website": "https://theatredepassy.fr/"}
        label = templates.detect(FakeFetcher({"https://theatredepassy.fr/": fixture("passy_accueil")}), venue)
        self.assertIn("theme:salient", label)
        self.assertIn("extracteur:fiches_famille", label)
        self.assertEqual(templates.detect(FakeFetcher({"https://x.fr/": "<p>rien</p>"}), {"slug": "y", "name": "Y", "website": "https://x.fr/"}), "aucun")

    def test_complement_respecte_la_colonne(self):
        fetcher = FakeFetcher({})
        venue = {"slug": "x", "name": "X", "website": "https://x.fr/", "template": "aucun", "sections": ["theatre"]}
        self.assertEqual(templates.complement(fetcher, venue, TODAY), ([], {}))
        self.assertEqual(fetcher.requested, [])  # aucun extracteur : aucune requête


class BilletreducSalleTests(unittest.TestCase):
    SALLE = (
        '<html><head><script type="application/ld+json">[{"@type":"TheaterEvent","name":"Hamlet","startDate":"2026-12-01T20:00:00",'
        '"location":{"@type":"Place","name":"Théâtre du Marais"},"url":"https://www.billetreduc.com/spectacle/hamlet-1"},'
        '{"@type":"TheaterEvent","name":"Autre salle","startDate":"2026-12-02T20:00:00","location":{"@type":"Place","name":"Cirque Zinzin"}}]</script></head></html>'
    )

    def _venue(self):
        return {"slug": "theatre-du-marais-2718", "name": "Théâtre du Marais", "website": "https://www.theatredumarais.com/",
                "sections": ["theatre"], "address": "", "postal_code": "75003", "city": "Paris", "offi_url": "x"}

    def test_identifiant_de_salle_lu_sur_le_site(self):
        home = '<a href="https://www.billetreduc.com/S/171/salle.htm">Réserver</a>'
        fetcher = FakeFetcher({"https://www.theatredumarais.com/": home, "https://www.billetreduc.com/171/salle.htm": self.SALLE})
        self.assertEqual(templates.billetreduc_salle_id(fetcher, self._venue()), "171")
        groups, info = templates.billetreduc_salle(fetcher, self._venue(), TODAY)
        self.assertEqual([g["title"] for g in groups], ["Hamlet"])  # la salle voisine est écartée
        self.assertEqual(info, {"status": "ok", "salle": "171"})

    def test_identifiant_de_salle_lu_sur_une_fiche_liee(self):
        home = '<a href="https://www.billetreduc.com/spectacle/hamlet-1">Hamlet</a>'
        fiche = '<a href="/11648/salle.htm">Théâtre du Marais</a>'
        fetcher = FakeFetcher({"https://www.theatredumarais.com/": home, "https://www.billetreduc.com/spectacle/hamlet-1": fiche})
        self.assertEqual(templates.billetreduc_salle_id(fetcher, self._venue()), "11648")

    def test_sans_billetreduc_rien_n_est_lu(self):
        fetcher = FakeFetcher({"https://www.theatredumarais.com/": "<p>aucun lien</p>"})
        groups, info = templates.billetreduc_salle(fetcher, self._venue(), TODAY)
        self.assertEqual((groups, info["status"]), ([], "salle_introuvable"))


if __name__ == "__main__":
    unittest.main()
