# -*- coding: utf-8 -*-
import csv
import json
import os
import tempfile
import unittest
from datetime import date

from scraper.venues import exit_report as er

CATALOGUE = [{"offi_id": "1", "slug": "theatre-a-1", "name": "Théâtre A"}, {"offi_id": "2", "slug": "theatre-b-2", "name": "Théâtre B"}]


def name(n):
    # mots distincts par spectacle : le rapprochement flou ignore les chiffres et les mots courts
    return f"Lune{n:02d} Soleil{n:02d}"


def offi(venue_id, n, title=None):
    return {"url": f"https://www.offi.fr/theatre/lieu-{venue_id}/piece-{n}-{100 + n}.html", "title": title or name(n)}


def direct(slug, n):
    return {"venue_slug": slug, "title": name(n)}


class ExitReportTest(unittest.TestCase):
    def test_taux_20_spectacles_18_retrouves(self):
        offi_records = [offi(1, n) for n in range(20)]
        direct_records = [direct("theatre-a-1", n) for n in range(18)]
        rates = er.compute_rates(offi_records, direct_records, CATALOGUE)
        self.assertEqual(rates["theatre-a-1"], {"offi_count": 20, "found": 18, "rate": 0.9})

    def test_lieu_essaye_sans_evenement_direct_a_zero(self):
        rates = er.compute_rates([offi(2, n) for n in range(6)], [], CATALOGUE, attempted={"theatre-b-2"})
        self.assertEqual(rates["theatre-b-2"]["rate"], 0.0)

    def test_lieu_non_essaye_ignore(self):
        rates = er.compute_rates([offi(2, 1)], [direct("theatre-a-1", 1)], CATALOGUE, attempted={"theatre-a-1"})
        self.assertNotIn("theatre-b-2", rates)

    def test_trois_semaines_consecutives_au_seuil(self):
        history = []
        for day in (date(2026, 11, 9), date(2026, 11, 16), date(2026, 11, 23)):
            history = er.update_history(history, {"theatre-a-1": {"offi_count": 20, "found": 18, "rate": 0.9}}, day)
        self.assertIn("theatre-a-1", er.eligible(history))
        self.assertEqual(er.streak(history, "theatre-a-1"), 3)

    def test_deux_semaines_ne_suffisent_pas_et_un_trou_casse_la_serie(self):
        m = {"offi_count": 20, "found": 18, "rate": 0.9}
        two = er.update_history(er.update_history([], {"x": m}, date(2026, 11, 9)), {"x": m}, date(2026, 11, 16))
        self.assertEqual(er.eligible(two), {})
        gap = er.update_history(two, {"x": m}, date(2026, 11, 30))  # semaine du 23/11 manquante
        self.assertEqual(er.eligible(gap), {})

    def test_une_semaine_sous_le_seuil_casse_la_serie(self):
        history = []
        for day, found in ((date(2026, 11, 9), 18), (date(2026, 11, 16), 17), (date(2026, 11, 23), 19)):
            history = er.update_history(history, {"x": {"offi_count": 20, "found": found, "rate": found / 20}}, day)
        self.assertEqual(er.eligible(history), {})

    def test_petit_lieu_ecarte_par_le_minimum(self):
        m = {"offi_count": 2, "found": 2, "rate": 1.0}
        history = []
        for day in (date(2026, 11, 9), date(2026, 11, 16), date(2026, 11, 23)):
            history = er.update_history(history, {"x": m}, day)
        self.assertEqual(er.eligible(history), {})
        self.assertIn("x", er.eligible(history, min_offi=2))

    def test_relancer_la_meme_semaine_remplace_la_mesure(self):
        h = er.update_history([], {"x": {"offi_count": 5, "found": 1, "rate": 0.2}}, date(2026, 11, 9))
        h = er.update_history(h, {"x": {"offi_count": 5, "found": 5, "rate": 1.0}}, date(2026, 11, 11))
        self.assertEqual(len(h), 1)
        self.assertEqual(h[0]["found"], 5)

    def test_cli_propose_sans_ecrire_direct_only(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = lambda name: os.path.join(tmp, name)
            with open(p("cat.csv"), "w", encoding="utf-8", newline="") as f:
                w = csv.DictWriter(f, fieldnames=["offi_id", "slug", "name"])
                w.writeheader()
                w.writerows(CATALOGUE)
            with open(p("offi.jsonl"), "w", encoding="utf-8") as f:
                f.write("\n".join(json.dumps(offi(1, n)) for n in range(20)))
            with open(p("events.jsonl"), "w", encoding="utf-8") as f:
                f.write("\n".join(json.dumps(direct("theatre-a-1", n)) for n in range(19)))
            with open(p("direct_only.csv"), "w", encoding="utf-8") as f:
                f.write("venue_slug,decision_date,note\n")
            before = open(p("direct_only.csv"), encoding="utf-8").read()
            for day in ("2026-11-09", "2026-11-16", "2026-11-23"):
                er.main(["--offi", p("offi.jsonl"), "--direct", p("events.jsonl"), "--catalogue", p("cat.csv"),
                         "--history", p("hist.csv"), "--direct-only", p("direct_only.csv"), "--out", p("rep.csv"), "--date", day])
            rows = list(csv.DictReader(open(p("rep.csv"), encoding="utf-8")))
            self.assertEqual(rows[0]["venue_slug"], "theatre-a-1")
            self.assertEqual(rows[0]["weeks_streak"], "3")
            self.assertIn("à proposer", rows[0]["proposal"])
            self.assertEqual(open(p("direct_only.csv"), encoding="utf-8").read(), before)
            self.assertEqual(len(list(csv.DictReader(open(p("hist.csv"), encoding="utf-8")))), 3)


if __name__ == "__main__":
    unittest.main()


class SelectionTest(unittest.TestCase):
    def test_vague_1_filtre_par_plateforme(self):
        from scraper.venues.__main__ import select_venues

        rows = [
            {"slug": "a-1", "website": "https://a", "status": "ok", "feasibility": "2", "platform": "mapado", "ticketing_all": "mapado:3"},
            {"slug": "b-2", "website": "https://b", "status": "ok", "feasibility": "1", "platform": "site_propre/wordpress", "ticketing_all": "shotgun:1"},
            {"slug": "c-3", "website": "https://c", "status": "ok", "feasibility": "1", "platform": "site_propre/wordpress", "ticketing_all": ""},
            {"slug": "d-4", "website": "https://d", "status": "bloqué", "feasibility": "2", "platform": "mapado", "ticketing_all": "mapado:1"},
        ]
        chosen = select_venues(rows, None, True, 2, None, {"mapado", "shotgun"})
        self.assertEqual([r["slug"] for r in chosen], ["a-1", "b-2"])
        self.assertEqual(len(select_venues(rows, None, True, 2, None)), 3)
