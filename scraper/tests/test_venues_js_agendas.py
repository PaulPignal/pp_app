# -*- coding: utf-8 -*-
"""Adaptateurs des lieux à agenda « JavaScript » : extraits HTML/JSON réduits, relevés le 07/11/2026."""
import json
import unittest
from datetime import date

from scraper.venues import js_agendas as j

TCE_MONTH = """
<div class="calendar__days">
 <div class="calendar__day has-events">
  <div class="calendar__day-head"><p class="calendar__name"><span>lundi</span><span>2 novembre</span></p></div>
  <ul class="calendar__events"><li class="calendar__event"><span class="date-value"> 19h30 </span>
   <a href="/saison-2026-27/opera-mis-en-scene/manon-lescaut"> Manon Lescaut, Puccini | Opéra mis en scène </a></li></ul>
 </div>
 <div class="calendar__day"><div class="calendar__day-head"><p class="calendar__name"><span>mardi</span><span>3 novembre</span></p></div></div>
</div>"""

TCE_FICHE = """<html><head><meta name="description" content="Giacomo Puccini"/><meta property="og:image" content="https://x/i.jpg"/></head><body>
<ol><li class="widget__prices-item"><span class="name">ORCH.</span> <span class="price">190 €</span></li>
<li class="widget__prices-item"><span class="name">CAT. 4</span> <span class="price">35 €</span></li></ol>
<a class="btn season reservation" href="https://billetterie.example/p/1">Réserver</a></body></html>"""

MC93 = """
<div class="group-mois" id="sep2026"><div class="label-mois">septembre</div>
 <div class="group-jour"><div class="label-jour">jeu 17 </div><ul>
  <li class="evenement representation"><div class="heure"><time datetime="2026-09-17T19:30:00Z">19h30</time></div>
   <div class="contenu"><div class="titre"><a href="/saison/les-aventures">Les Aventures d&#039;un soi</a></div>
   <div class="lieu">Salle Christian Bourgois</div><div class="genre">Théâtre — création 2025</div><div class="duree">&nbsp;—&nbsp;durée 1h30</div></div>
   <div class="resa"><a href="https://billetterie.mc93.com/spectacle?id=1" class="btn reserver">réserver</a></div></li></ul></div></div>"""

FERME = """
<div class="item content preview agenda"><a href="/fr/behind-the-light" class="item-content agenda"><p class="genre">Danse</p>
 <div class="text"><p class="date">17.11.26 à 20h30</p><p class="title">Behind the Light</p><p class="subtitle">Cristiana Morganti</p></div></a></div>
<div class="item content preview agenda"><a href="/fr/expo" class="item-content agenda"><p class="genre">Centre d'art</p>
 <div class="text"><p class="date">10.10 - 24.01.27</p><p class="title">Abraz</p></div></a></div>"""

SQY = """
<div class="calendrier"><a href="/saison/spectacle/dogs.htm" class="cellBlock1"><div class="cellDate"><strong>mar. 01</strong><br>20:30</div>
<div class="cellSupport">Dogs [Nouvelles du parc humain]</div></a>
<div class="cellBlock2"><a class="cellLieu">Salle Marta Pan</a><div class="cellResa"><a href="https://indiv.themisweb.fr/x?EventId=1184">réserver</a></div></div></div>"""


class JsAgendasTest(unittest.TestCase):
    def test_paris_iso_heure_d_ete_et_d_hiver(self):
        self.assertEqual(j.paris_iso(date(2026, 7, 1), 20, 30), "2026-07-01T20:30:00+02:00")
        self.assertEqual(j.paris_iso(date(2026, 12, 1), 20, 30), "2026-12-01T20:30:00+01:00")

    def test_tce_calendrier_mensuel(self):
        sessions = j.tce_month_events(TCE_MONTH, "26-11")
        self.assertEqual(len(sessions), 1)
        s = sessions[0]
        self.assertEqual((s["day"], s["hour"], s["minute"]), (date(2026, 11, 2), 19, 30))
        self.assertEqual(s["title"], "Manon Lescaut, Puccini")
        self.assertEqual(s["category"], "Opéra mis en scène")

    def test_tce_fiche_tarifs_et_reservation(self):
        f = j.tce_fiche(TCE_FICHE)
        self.assertEqual((f["price_min_eur"], f["price_max_eur"]), (35.0, 190.0))
        self.assertEqual(f["booking_url"], "https://billetterie.example/p/1")
        self.assertEqual(f["image"], "https://x/i.jpg")

    def test_mc93_representations_avec_reservation(self):
        sessions = j.mc93_sessions(MC93)
        self.assertEqual(len(sessions), 1)
        s = sessions[0]
        self.assertEqual((s["day"], s["hour"], s["minute"], s["duration"]), (date(2026, 9, 17), 19, 30, 90))
        self.assertEqual(s["title"], "Les Aventures d'un soi")
        self.assertEqual(s["booking"], "https://billetterie.mc93.com/spectacle?id=1")

    def test_ferme_du_buisson_cartes_et_annees(self):
        cards = j.ferme_cards(FERME)
        self.assertEqual(cards[0]["start"], date(2026, 11, 17))
        self.assertEqual((cards[0]["hour"], cards[0]["minute"]), (20, 30))
        # « 10.10 - 24.01.27 » : le début est en 2026 car son mois suit celui de la fin
        self.assertEqual((cards[1]["start"], cards[1]["end"]), (date(2026, 10, 10), date(2027, 1, 24)))

    def test_sqy_calendrier_mensuel(self):
        s = j.sqy_sessions(SQY, 12, 2026)[0]
        self.assertEqual((s["day"], s["hour"], s["minute"]), (date(2026, 12, 1), 20, 30))
        self.assertEqual(s["booking"], "https://indiv.themisweb.fr/x?EventId=1184")

    def test_philharmonie_disponibilite_et_tarifs(self):
        good = j.philharmonie_status({"level": "GOOD", "label": "", "onSale": True, "content": "<p>13€ | 27€ | 88€</p>"})
        self.assertEqual((good["availability"], good["price_min_eur"], good["price_max_eur"]), ("InStock", 13.0, 88.0))
        self.assertEqual(j.philharmonie_status({"level": "LIMITED", "label": "Dernières places", "onSale": True, "content": ""})["availability"], "LimitedAvailability")
        self.assertEqual(j.philharmonie_status({"level": "NONE", "label": "Complet", "onSale": True, "content": ""})["availability"], "SoldOut")
        self.assertTrue(j.philharmonie_status({"level": "NONE", "label": "Annulé", "onSale": False, "content": ""})["cancelled"])
        self.assertNotIn("availability", j.philharmonie_status({"level": "GOOD", "label": "", "onSale": False, "content": ""}))

    def test_accor_arena_evenements_api(self):
        data = {"data": [
            {"status": "published", "start": "2026-11-07T20:00:00+01:00", "end": "2026-11-07T20:00:00+01:00", "min_price": 39, "artist_reference": "Lujipeka",
             "translations": [{"title": "Lujipeka", "url": "programmation/lujipeka--bb4d0", "url_event": "https://billetterie.accorarena.com/x", "sub_category": "RAP"}]},
            {"status": "draft", "start": "2026-11-08T20:00:00+01:00", "artist_reference": "Brouillon", "translations": []},
        ]}
        events = j.accor_events(data)
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["url"], "https://www.accorarena.com/fr/programmation/lujipeka--bb4d0")
        self.assertEqual(events[0]["price"], 39)

    def test_occurrence_cree_une_seance_par_defaut(self):
        occ = j.occurrence("Titre", "https://x/y", date(2026, 11, 7), start="2026-11-07T20:00:00+01:00", booking_url="https://x/b", price_min_eur=12.0)
        self.assertEqual(occ["performances"], [{"start": "2026-11-07T20:00:00+01:00", "price_min_eur": 12.0, "url": "https://x/b"}])
        self.assertEqual(occ["currency"], "EUR")


if __name__ == "__main__":
    unittest.main()
