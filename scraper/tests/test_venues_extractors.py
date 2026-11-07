"""Un test par extracteur, sur une fixture HTML enregistrée et allégée (scraper/tests/fixtures/venues/).

Les fixtures sont des pages publiques de lieux et de billetteries relevées le 07/11/2026 ;
les dates attendues sont donc comparées à un « aujourd'hui » figé au 07/11/2026.
"""
import os
import re
import unittest
from datetime import date

from bs4 import BeautifulSoup

from scraper.venues import billetterie, html_fiche, schemaorg, specific, triage
from scraper.venues.adapters import merge_records
from scraper.venues.http import Page

TODAY = date(2026, 11, 7)
FIXTURES = os.path.join(os.path.dirname(__file__), "fixtures", "venues")


def fixture(name: str) -> str:
    with open(os.path.join(FIXTURES, name + ".html"), encoding="utf-8") as f:
        return f.read()


def page(name: str, url: str) -> Page:
    return Page(url=url, final_url=url, status=200, text=fixture(name))


def venue(name="Lieu test", section="theatre", slug="lieu-test-1"):
    return {"name": name, "sections": [section], "slug": slug, "city": "Paris 10e", "address": "1 rue X 75010 Paris"}


class FixtureSizeTests(unittest.TestCase):
    def test_fixtures_moins_de_200_ko(self):
        for filename in os.listdir(FIXTURES):
            self.assertLess(os.path.getsize(os.path.join(FIXTURES, filename)), 200 * 1024, filename)


class SchemaOrgExtractorTests(unittest.TestCase):
    def test_jsonld_agenda_new_morning(self):
        occurrences, signal = schemaorg.occurrences_from_html(fixture("jsonld_new_morning"), "https://www.newmorning.com/")
        self.assertEqual(signal, "jsonld")
        self.assertGreater(len(occurrences), 30)
        first = occurrences[0]
        self.assertTrue(first["title"] and first["date_start"] and first["url"].startswith("https://www.newmorning.com/"))
        records = schemaorg.records_from_groups(schemaorg.group_occurrences(occurrences), venue("New Morning", "concert"), "direct:jsonld", today=TODAY)
        self.assertGreater(len(records), 30)
        self.assertTrue(all(r["section"] == "concert" and r["source"] == "direct:jsonld" for r in records))
        self.assertTrue(any(r.get("price_min_eur") is not None for r in records))

    def test_microdata_agenda_theatre14(self):
        occurrences, signal = schemaorg.occurrences_from_html(fixture("microdata_theatre14"), "https://theatre14.fr/index.php/t14-agenda")
        self.assertEqual(signal, "microdata")
        self.assertGreater(len(occurrences), 5)
        self.assertTrue(all(o["title"] for o in occurrences))

    def test_regroupement_des_seances_et_filtre_des_dates_passees(self):
        html = (
            '<script type="application/ld+json">[{"@type":"TheaterEvent","name":"Hamlet","startDate":"2026-12-01T20:00","offers":{"price":"25,00","availability":"https://schema.org/SoldOut"}},'
            '{"@type":"TheaterEvent","name":"Hamlet","startDate":"2026-12-02T20:00","offers":{"price":"12","availability":"https://schema.org/InStock"}},'
            '{"@type":"TheaterEvent","name":"Ancien","startDate":"2025-01-01"}]</script>'
        )
        occurrences, _ = schemaorg.occurrences_from_html(html, "https://x.fr/agenda")
        groups = schemaorg.group_occurrences(occurrences)
        self.assertEqual(len(groups), 2)
        records = schemaorg.records_from_groups(groups, venue(), "direct:jsonld", today=TODAY)
        self.assertEqual([r["title"] for r in records], ["Hamlet"])
        hamlet = records[0]
        self.assertEqual((hamlet["date_start"], hamlet["date_end"]), ("2026-12-01", "2026-12-02"))
        self.assertEqual((hamlet["price_min_eur"], hamlet["price_max_eur"]), (12.0, 25.0))
        self.assertEqual(hamlet["availability"], "InStock")
        self.assertEqual(len(hamlet["performances"]), 2)


class BilletterieExtractorTests(unittest.TestCase):
    def assert_event(self, platform, name, url, title_part, date_start=None):
        occurrences = billetterie.occurrences_for(billetterie.PLATFORMS[platform], page(name, url))
        self.assertEqual(len(occurrences), 1, platform)
        self.assertIn(title_part.lower(), occurrences[0]["title"].lower())
        if date_start:
            self.assertEqual(occurrences[0]["date_start"], date_start)
        return occurrences[0]

    def test_tick_and_live(self):
        occ = self.assert_event("tick_and_live", "tickandlive_event", "https://billetterie-2anes.tickandlive.com/evenement/x", "imitatueurs", "2026-11-09")
        self.assertEqual(occ["venue"], "THEATRE DES 2 ANES")

    def test_billetreduc_prix_et_disponibilite(self):
        occ = self.assert_event("billetreduc", "billetreduc_event", "https://www.billetreduc.com/spectacle/x-403046", "épargne", "2026-12-22")
        self.assertEqual((occ["price_min_eur"], occ["price_max_eur"]), (22.0, 32.5))
        self.assertEqual(occ["availability"], "InStock")
        self.assertIn("Martin Dust", occ["cast"])

    def test_helloasso(self):
        occ = self.assert_event("helloasso", "helloasso_event", "https://www.helloasso.com/associations/le-bal/evenements/x", "espace entre nous")
        self.assertEqual(occ["price_max_eur"], 6.0)

    def test_shotgun(self):
        occ = self.assert_event("shotgun", "shotgun_event", "https://shotgun.live/fr/events/tallisker-popup-paris", "tallisker", "2027-03-04")
        self.assertTrue(occ["venue"])

    def test_billetweb(self):
        self.assert_event("billetweb", "billetweb_event", "https://www.billetweb.fr/the-paulines-x-club-nova-x-antenna", "paulines", "2026-11-11")

    def test_eventbrite(self):
        self.assert_event("eventbrite", "eventbrite_event", "https://www.eventbrite.fr/e/billets-x-2002918016705", "we are human", "2026-11-24")

    def test_mapado_next_data(self):
        occ = self.assert_event("mapado", "mapado_event", "https://theatre-ouvert.mapado.com/event/858153-garcons-blockhaus-focus-12", "blockhaus", "2026-11-19")
        self.assertEqual((occ["price_min_eur"], occ["price_max_eur"]), (4.0, 6.0))  # facialValue en centimes ; tarif carte à 0 ignoré
        self.assertEqual(occ["availability"], "InStock")  # stock réservable > 0
        self.assertEqual(occ["currency"], "EUR")

    def test_liens_billetreduc_depuis_le_tunnel_d_achat(self):
        soup = BeautifulSoup(fixture("billetreduc_venue_site"), "html.parser")
        events, _ = billetterie.classify_links(soup, "https://essaion-theatre.com/", billetterie.PLATFORMS["billetreduc"])
        self.assertGreater(len(events), 5)
        self.assertTrue(all(re.match(r"https://www\.billetreduc\.com/\d+/evtcrit\.htm$", e) for e in events))

    def test_liens_boutiques(self):
        for name, base, platform, pattern in [
            ("tickandlive_shop", "https://billetterie-2anes.tickandlive.com/", "tick_and_live", "/evenement/"),
            ("mapado_shop", "https://theatre-ouvert.mapado.com/", "mapado", "/event/"),
            ("shotgun_venue", "https://shotgun.live/fr/venues/letrabendo", "shotgun", "/events/"),
        ]:
            soup = BeautifulSoup(fixture(name), "html.parser")
            events, _ = billetterie.classify_links(soup, base, billetterie.PLATFORMS[platform])
            self.assertGreater(len(events), 3, platform)
            self.assertTrue(all(pattern in e for e in events), platform)

    def test_billetteries_bloquees_laissees_de_cote(self):
        groups, info = billetterie.extract_platform(None, {"website": "https://x.fr"}, "fnac_spectacles")
        self.assertEqual(groups, [])
        self.assertIn("bloqué", info["status"])

    def test_billetterie_partagee_filtre_par_nom_de_lieu(self):
        self.assertTrue(billetterie.venue_matches("THEATRE DES 2 ANES", "Théâtre des 2 Ânes"))
        self.assertFalse(billetterie.venue_matches("LE POINT VIRGULE", "Salle Gaveau"))
        self.assertTrue(billetterie.venue_matches(None, "Salle Gaveau"))


class HtmlFicheTests(unittest.TestCase):
    """Adaptateurs spécifiques : liens de fiche sur la page d'agenda, puis lecture de la fiche."""

    def check(self, listing, listing_url, link_re, fiche, fiche_url, title_part, date_start):
        links = specific.fiche_links(fixture(listing), listing_url, re.compile(link_re))
        self.assertGreater(len(links), 0, listing)
        occ = html_fiche.parse_fiche(fixture(fiche), fiche_url, TODAY)
        self.assertIsNotNone(occ, fiche)
        self.assertIn(title_part.lower(), occ["title"].lower())
        self.assertEqual(occ["date_start"], date_start)
        return occ

    def test_le_rex(self):
        occ = self.check("rex_listing", "https://www.legrandrex.com/calendrier", r"^/evenement/\d+$", "rex_fiche", "https://www.legrandrex.com/evenement/1753", "witcher", "2026-11-13")
        self.assertNotIn("Spectacles & Concerts", occ["title"])
        self.assertEqual((occ["price_min_eur"], occ["price_max_eur"]), (64.2, 91.7))

    def test_maison_de_la_radio(self):
        occ = self.check("radio_listing", "https://www.maisondelaradioetdelamusique.fr/agenda", r"^/evenement/[a-z0-9\-]+$", "radio_fiche", "https://www.maisondelaradioetdelamusique.fr/evenement/cendrillon-1", "cendrillon", "2026-11-07")
        self.assertEqual(occ["duration_min"], 60)

    def test_alhambra(self):
        occ = self.check("alhambra_home", "https://www.alhambra-paris.com/", r"-lo\d+\.html$", "alhambra_fiche", "https://www.alhambra-paris.com/albert-tawil-lo4574.html", "tawil", "2026-11-07")
        self.assertEqual((occ["price_min_eur"], occ["price_max_eur"]), (45.0, 55.0))

    def test_petit_bain(self):
        links = specific.fiche_links(fixture("petitbain_fiche"), "https://petitbain.org/agenda/", re.compile(r"^/evenement/\d+/?$"))
        self.assertIsInstance(links, list)
        occ = html_fiche.parse_fiche(fixture("petitbain_fiche"), "https://petitbain.org/evenement/11031/", TODAY)
        self.assertEqual(occ["date_start"], "2026-11-30")
        self.assertEqual(occ["price_min_eur"], 22.0)
        self.assertTrue(occ["title"].lower().startswith("desire"))

    def test_le_brady(self):
        self.check("brady_listing", "https://www.lebrady.fr/les-evenements-du-brady/", r"^/events/\d+-[a-z0-9\-]+/?$", "brady_fiche", "https://www.lebrady.fr/events/84665-taxi-driver/", "taxi driver", "2026-11-11")

    def test_cave_du_38_riv(self):
        self.check("riv38_listing", "https://38riv.com/concerts", r"^/concerts/[a-z0-9\-]+-\d+$", "riv38_fiche", "https://38riv.com/concerts/jam-session-blues-lemmys-tribe-14", "jam session", "2027-02-05")

    def test_theatre_des_mathurins(self):
        occ = self.check("mathurins_listing", "https://www.theatredesmathurins.com/reservation-groupes/", r"^/spectacles/[a-z0-9\-]+/?$", "mathurins_fiche", "https://www.theatredesmathurins.com/spectacles/veronique-gallo/", "gallo", "2027-01-08")
        self.assertEqual(occ["duration_min"], 80)

    def test_cartoucherie_epee_de_bois(self):
        occ = self.check("cartoucherie_listing", "https://www.epeedebois.com/saison/", r"^/un-spectacle/[a-z0-9\-]+/?$", "cartoucherie_fiche", "https://www.epeedebois.com/un-spectacle/ubu-roi/", "ubu roi", "2027-03-27")
        self.assertEqual(occ["duration_min"], 100)

    def test_theatre_71_malakoff(self):
        occ = self.check("theatre71_listing", "https://malakoffscenenationale.fr/calendrier", r"^/theatre-71/programme/[a-z0-9\-]+$", "theatre71_fiche", "https://malakoffscenenationale.fr/theatre-71/programme/rodolphe-burger", "burger", "2026-11-07")
        self.assertEqual(occ["duration_min"], 60)

    def test_gaite_rive_gauche(self):
        occ = self.check("rivegauche_listing", "https://lagaiterivegauche.com/spectacles/paris-is-magique/", r"^/spectacles/[a-z0-9\-]+/?$", "rivegauche_fiche", "https://lagaiterivegauche.com/spectacles/the-opera-locos/", "opera locos", "2026-12-31")
        self.assertEqual(occ["duration_min"], 75)

    def test_dates_francaises(self):
        self.assertEqual(html_fiche.parse_dates("Samedi 7 novembre 2026 et 1er décembre à 20h", TODAY), ["2026-11-07", "2026-12-01"])
        self.assertEqual(html_fiche.parse_dates("du 3 janvier 2020 au 9 janvier 2020", TODAY), [])
        self.assertEqual(html_fiche.parse_price_range("Plein tarif 25 € / réduit 12,50 € / 9999 €"), (12.5, 25.0))


class TriageTests(unittest.TestCase):
    def test_detection_billetterie_et_cms(self):
        hosts = ["www.billetreduc.com", "shotgun.live", "www.billetreduc.com", "fonts.googleapis.com", "x.mapado.com"]
        found = triage.detect_ticketing(hosts)
        self.assertEqual(found.most_common(1)[0], ("billetreduc", 2))
        self.assertIn("mapado", found)
        self.assertEqual(triage.detect_cms('<link href="/wp-content/themes/x.css">'), "wordpress")

    def test_liens_agenda(self):
        soup = BeautifulSoup(fixture("alhambra_home"), "html.parser")
        links = triage.pick_agenda_links(soup, "https://www.alhambra-paris.com/")
        self.assertLessEqual(len(links), 2)

    def test_nom_de_domaine_saisi_avec_double_schema(self):
        self.assertEqual(triage.normalize_website("http://https://www.pathe.fr/x"), "https://www.pathe.fr/x")
        self.assertEqual(triage.normalize_website("www.x.fr"), "http://www.x.fr")


class MergeTests(unittest.TestCase):
    def test_fusion_par_titre_sans_ecraser(self):
        a = [{"title": "Hamlet", "source": "direct:jsonld", "price_min_eur": None, "url": "https://a"}]
        b = [{"title": "HAMLET", "source": "direct:billetreduc", "price_min_eur": 10.0, "url": "https://b"}]
        merged = merge_records([a, b])
        self.assertEqual(len(merged), 1)
        self.assertEqual(merged[0]["url"], "https://a")
        self.assertEqual(merged[0]["price_min_eur"], 10.0)
        self.assertEqual(merged[0]["source"], "direct:jsonld+billetreduc")


class CoverageTests(unittest.TestCase):
    def test_titre_offi_depuis_l_url_et_appariement(self):
        from scraper.venues.coverage import offi_title, titles_match

        self.assertEqual(offi_title("https://www.offi.fr/theatre/la-grande-comedie-2410/restons-calme-107668.html"), "restons calme")
        self.assertTrue(titles_match("restons calme", "Restons calme !"))
        self.assertTrue(titles_match("le tour du monde en 80 jours", "Le Tour du monde en 80 jours - Théâtre X"))
        self.assertFalse(titles_match("hamlet", "Macbeth"))
        self.assertFalse(titles_match("tango", "Tango argentin et milonga"))  # un seul mot : trop fragile


if __name__ == "__main__":
    unittest.main()
