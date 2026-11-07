# -*- coding: utf-8 -*-
"""Pertes de théâtre (07/11/2026) : appariement (élisions, sous-titres), extracteur générique
(classement des liens de fiche, pagination), sources WordPress, adaptateurs Nord-Ouest,
Comédie Saint-Michel et Épée de Bois. Fixtures : pages publiques relevées le 07/11/2026."""
import os
import unittest
from datetime import date

from bs4 import BeautifulSoup

from scraper.venues import billetterie, coverage, generic, specific, triage, wordpress

TODAY = date(2026, 11, 7)
FIXTURES = os.path.join(os.path.dirname(__file__), "fixtures", "venues")


def fixture(name: str) -> str:
    with open(os.path.join(FIXTURES, name + ".html"), encoding="utf-8") as f:
        return f.read()


class AppariementTests(unittest.TestCase):
    # 20 paires relues à la main (titre offi tel que dans l'URL, titre lu sur le site du lieu) : même spectacle.
    PAIRES_VRAIES = [
        ("il est urgent daimer", "Il est urgent d'aimer"),                      # élision
        ("lavare", "L'avare"),                                                   # élision, un seul mot
        ("laffaire dussaert", "L'affaire Dussaert"),
        ("le joueur dechecs", "Le Joueur d'échecs"),
        ("jai une theorie", "J'AI UNE THÉORIE *Scali Delpeyrat*"),
        ("cant be blue", "CAN'T BE BLUE"),
        ("pizzimpro", "Pizz'impro"),
        ("menopause la comedie qui bouscule les regles", "Ménopause"),           # sous-titre côté offi
        ("la valise", "Sophie Forte dans La valise"),                             # « Artiste dans Titre »
        ("morgane cadignan la nuit je mens", "Morgane Cadignan"),                 # titre = artiste
        ("gil alma nouveau spectacle en rodage", "GIL ALMA"),
        ("la honte", "La Honte (titre provisoire)"),
        ("forever 17", "Forever 17 - FOCUS #12"),
        ("falstafe", "FALSTAFE, de Valère Novarina, d'après William Shakespeare"),
        ("antonio gades noces de sang", "NOCES DE SANG"),
        ("lintegrale des fables", "L'intégrale des fables de La Fontaine"),
        ("la raison du plus fou rousseau vs diderot", "LA RAISON DU PLUS FOU"),
        ("les 7 doigts de la main the attic les choses que jai vues allongee sur le dos", "The Attic"),
        ("minotaure", "Ciné-club Lost in Frenchlation - MINOTAURE"),
        ("focus cabaret 1 collectif dartistes", "Focus Cabaret #1"),
    ]
    PAIRES_FAUSSES = [
        ("tango", "Tango argentin et milonga"),       # un mot court : trop fragile (règle d'origine)
        ("festival", "Festival d'humour"),            # mot générique seul
        ("concert", "Concert de Noël"),
        ("hamlet", "Macbeth"),
        ("le malade imaginaire", "Le Médecin malgré lui"),
        ("la vie de ma mort", "La Vie de Nelson Mandela"),
        ("spectacle", "Spectacle de fin d'année"),
    ]

    def test_elision_normalisee_comme_offi(self):
        self.assertEqual(coverage.normalize_title("L'avare et c'est l’heure"), "Lavare et cest lheure")
        self.assertEqual(coverage.normalize_title("Rock 'n' roll"), "Rock 'n' roll")  # pas entre deux lettres

    def test_paires_vraies(self):
        for offi, direct in self.PAIRES_VRAIES:
            self.assertTrue(coverage.titles_match(offi, direct), (offi, direct))

    def test_paires_fausses(self):
        for offi, direct in self.PAIRES_FAUSSES:
            self.assertFalse(coverage.titles_match(offi, direct), (offi, direct))


class GeneriqueTests(unittest.TestCase):
    URL = "https://www.theatredurondpoint.fr/programme/saison-26-27"

    def test_pagination(self):
        soup = BeautifulSoup(fixture("rond_point_programme"), "html.parser")
        self.assertEqual(generic.pagination_links(soup, self.URL), [self.URL + "?page=2"])
        self.assertEqual(generic._page_number("https://x.fr/agenda/page/3/", "/agenda/"), 3)
        self.assertEqual(generic._page_number("https://x.fr/agenda?paged=2", "/agenda"), 2)
        self.assertIsNone(generic._page_number("https://x.fr/autre?page=2", "/agenda"))

    def test_fiches_avant_la_navigation(self):
        soup = BeautifulSoup(fixture("rond_point_programme"), "html.parser")
        links = generic.detail_links(soup, self.URL, set(), 40)
        self.assertGreaterEqual(len(links), 20)
        premiers = links[:15]
        self.assertTrue(all("/fr/programmation/saison-26-27/" in u for u in premiers), premiers)
        self.assertNotIn("https://www.theatredurondpoint.fr/recherche", premiers)
        self.assertTrue(any("merci-de-votre-collaboration" in u for u in links))

    def test_navigation_penalisee(self):
        html = """<html><body><nav><a href="/spectacles/menu-un">A</a><a href="/spectacles/menu-deux">B</a>
        <a href="/spectacles/menu-trois">C</a></nav><main><a href="/spectacles/hamlet-2026">Hamlet</a>
        <a href="/spectacles/phedre">Phèdre</a><a href="/spectacles/macbeth">Macbeth</a><a href="/contact">Contact</a>
        <a href="/infos.pdf">pdf</a></main></body></html>"""
        links = generic.detail_links(BeautifulSoup(html, "html.parser"), "https://x.fr/agenda", set(), 10)
        self.assertEqual(links[:3], ["https://x.fr/spectacles/hamlet-2026", "https://x.fr/spectacles/phedre", "https://x.fr/spectacles/macbeth"])
        self.assertNotIn("https://x.fr/contact", links)
        self.assertNotIn("https://x.fr/infos.pdf", links)


class WordPressTests(unittest.TestCase):
    def test_types_evenement(self):
        types = {"post": {"rest_base": "posts"}, "page": {"rest_base": "pages"}, "show": {"rest_base": "shows"},
                 "tribe_events": {"rest_base": "tribe_events"}, "taw-saison-cultu": {"rest_base": "taw-saison-cultu"},
                 "wpcf7_contact_form": {"rest_base": "contact-forms"}}
        self.assertEqual(wordpress.event_types(types), ["shows", "taw-saison-cultu"])

    def test_the_events_calendar(self):
        data = {"events": [{"title": "Kévin Bagot dans NAVIGUE À VUE", "start_date": "2026-11-07 18:00:00",
                            "end_date": "2026-11-07 19:00:00", "cost": "12€ - 18€", "url": "https://x.fr/events/kb/2026-11-07/",
                            "venue": {"venue": "La Nouvelle Seine", "address": "3 quai de Montebello"},
                            "image": {"url": "https://x.fr/a.jpg"}, "description": "<p>Texte</p>"},
                           {"title": "Sans date"}]}
        occ = wordpress.tribe_events(data, "https://x.fr")
        self.assertEqual(len(occ), 1)
        self.assertEqual((occ[0]["date_start"], occ[0]["price_min_eur"], occ[0]["price_max_eur"]), ("2026-11-07", 12.0, 18.0))
        self.assertEqual(occ[0]["venue"], "La Nouvelle Seine")
        self.assertEqual(occ[0]["description"], "Texte")
        self.assertEqual(wordpress.tribe_events({"code": "rest_no_route"}, "https://x.fr"), [])


class NordOuestTests(unittest.TestCase):
    def test_calendrier_par_semaine(self):
        occ = specific.nord_ouest_calendar(fixture("nord_ouest_calendrier"), specific.NORD_OUEST_CALENDAR, TODAY)
        self.assertGreater(len(occ), 20)
        antigone = next(o for o in occ if o["title"] == "Requiem pour Antigone")
        self.assertEqual(antigone["date_start"], "2026-11-02")
        self.assertEqual(antigone["performances"][0]["start"], "2026-11-02T18:30:00")
        self.assertIn("repid=10196", antigone["url"])
        self.assertEqual(antigone["description"], "Grande salle")
        self.assertTrue(all(o["date_start"].startswith("2026-11") for o in occ))

    def test_changement_d_annee(self):
        html = """<table><tr class="dateligne"><td>lun. 29/12</td><td>mar. 30/12</td><td>mer. 31/12</td><td>jeu. 1/1</td></tr>
        <tr class="creneauligne"><td></td><td></td><td></td><td><a href="../programme/?repid=1"><div class="creneauheurecal">20h30</div>
        <div class="creneautitrecal">Phèdre</div></a></td></tr></table>"""
        occ = specific.nord_ouest_calendar(html, specific.NORD_OUEST_CALENDAR, TODAY)
        self.assertEqual(occ[0]["date_start"], "2027-01-01")


class ComedieSaintMichelTests(unittest.TestCase):
    def test_liste_et_dates(self):
        shows = specific.csm_listing(fixture("comedie_saint_michel_accueil"), "http://www.comediesaintmichel.fr/")
        self.assertGreaterEqual(len(shows), 5)
        titles = dict(shows)
        self.assertIn("Le songe d'une nuit d'été", titles)
        self.assertEqual(titles["Le songe d'une nuit d'été"], "http://www.comediesaintmichel.fr/?q=node/703")
        self.assertTrue(all(u.endswith(("node/703", "node/698")) or "?q=node/" in u for u in titles.values()))
        self.assertNotIn("Nos Spectacles Enfants", titles)  # menu, hors zone de contenu
        self.assertEqual(specific.csm_dates("Les dimanches 8/11 et 22/11 à 18h45 • Les jeudis 10/12 et 17/12", TODAY),
                         ["2026-11-08", "2026-11-22", "2026-12-10", "2026-12-17"])


class EpeeDeBoisTests(unittest.TestCase):
    def test_periode_francaise(self):
        self.assertEqual(specific.date_range_fr("Du 22 octobre au 01 novembre 2026", 2026), (date(2026, 10, 22), date(2026, 11, 1)))
        self.assertEqual(specific.date_range_fr("du 28 décembre au 3 janvier 2027", 2026), (date(2026, 12, 28), date(2027, 1, 3)))
        self.assertEqual(specific.date_range_fr("Le 15 novembre", 2026), (date(2026, 11, 15), date(2026, 11, 15)))
        self.assertEqual(specific.date_range_fr("Bientôt", 2026), (None, None))

    def test_mois_en_cours_et_a_venir(self):
        occ = specific.epee_listing(fixture("epee_de_bois_saison"), specific.EPEE_SAISON, TODAY)
        self.assertGreaterEqual(len(occ), 5)
        self.assertTrue(all(o["url"].startswith("https://www.epeedebois.com/un-spectacle/") for o in occ))
        self.assertNotIn("UBU ROI", {o["title"] for o in occ})  # liste de recherche toutes saisons, hors agenda
        self.assertTrue(all(o["date_end"] >= "2026-10-01" for o in occ))  # septembre écarté
        self.assertTrue(any(o["date_end"] >= "2026-11-07" for o in occ))


class HrefEchappesTests(unittest.TestCase):
    def test_guillemets_echappes_retires(self):
        self.assertEqual(triage.clean_href('\\"/programme\\"'), "/programme")
        self.assertEqual(triage.clean_href(" /agenda/ "), "/agenda/")
        html = '<a href=\\"/programme\\">Programme</a><a href=\\"/sur-les-traces-darsene-lupin\\">Lupin</a>'  # HTML réel : href=\\"/programme\\"
        soup = BeautifulSoup(html, "html.parser")
        self.assertEqual(triage.pick_agenda_links(soup, "https://www.laurette-theatre.fr/"), ["https://www.laurette-theatre.fr/programme"])
        self.assertIn("https://www.laurette-theatre.fr/sur-les-traces-darsene-lupin", generic.detail_links(soup, "https://www.laurette-theatre.fr/programme", set(), 5))


class VosbilletsTests(unittest.TestCase):
    def test_liens_et_fiche(self):
        platform = billetterie.PLATFORMS["vosbillets"]
        soup = BeautifulSoup(fixture("vosbillets_billetterie"), "html.parser")
        events, _ = billetterie.classify_links(soup, "https://leguichetmontparnasse.vosbillets.fr/billetterie", platform)
        self.assertGreaterEqual(len(events), 10)
        self.assertTrue(all("/billetterie/representation/" in e for e in events))
        occ = billetterie.vosbillets_occurrence(fixture("vosbillets_representation"), "https://leguichetmontparnasse.vosbillets.fr/billetterie/representation/36335/frederique-le-banc-public")
        self.assertEqual(len(occ), 1)
        self.assertEqual(occ[0]["title"], "Frédérique, Le Banc Public")
        self.assertEqual(occ[0]["date_end"], "2026-12-19")
        self.assertEqual(triage.detect_ticketing(["leguichetmontparnasse.vosbillets.fr"]), {"vosbillets": 1})


if __name__ == "__main__":
    unittest.main()
