import json
import unittest
from dataclasses import fields

from scraper.offi_scraper import Show
from scraper.venues.record import EXTRA_FIELDS, OFFI_FIELDS, dumps, finalize_record

# Champs lus par app/src/features/offi-import/schemas.ts (offiWorkSchema).
INGEST_KEYS = {
    "url", "title", "section", "category", "venue", "address", "arrondissement", "country", "year",
    "availability", "currency", "cinema_venue_count", "cinema_venues", "date_start", "date_end",
    "duration_min", "price_min_eur", "price_max_eur", "image", "official_url", "description",
    "director", "cast", "crawled_at",
}


def _raw(**kw):
    base = {"url": "https://x.fr/spectacle/hamlet", "title": " Hamlet ", "section": "theatre", "venue": "Théâtre X", "date_start": "2026-12-01"}
    base.update(kw)
    return base


class RecordFormatTests(unittest.TestCase):
    def test_memes_champs_que_la_fiche_offi(self):
        self.assertEqual(OFFI_FIELDS, [f.name for f in fields(Show)])
        self.assertTrue(INGEST_KEYS <= set(OFFI_FIELDS))

    def test_enregistrement_valide_contient_tous_les_champs_offi_et_les_extras_renseignes(self):
        rec = finalize_record(_raw(source="direct:jsonld", accessibility=["PMR"], placement=None))
        self.assertEqual(set(OFFI_FIELDS), set(rec) & set(OFFI_FIELDS))
        self.assertEqual(rec["title"], "Hamlet")
        self.assertEqual(rec["source"], "direct:jsonld")
        self.assertNotIn("placement", rec)
        self.assertTrue(set(rec) <= set(OFFI_FIELDS) | set(EXTRA_FIELDS))
        json.loads(dumps(rec))

    def test_memes_validations_que_offi(self):
        self.assertIsNone(finalize_record(_raw(title="")))
        self.assertIsNone(finalize_record(_raw(section="jardinage")))
        rec = finalize_record(_raw(date_start="2026-02-31", price_min_eur=30.0, price_max_eur=10.0, duration_min=900, image="/x.jpg"))
        self.assertIsNone(rec["date_start"])
        self.assertEqual((rec["price_min_eur"], rec["price_max_eur"]), (10.0, 30.0))
        self.assertIsNone(rec["duration_min"])
        self.assertIsNone(rec["image"])

    def test_fiche_trop_pauvre_rejetee(self):
        self.assertIsNone(finalize_record({"url": "https://x.fr/a", "title": "A", "section": "theatre"}))


if __name__ == "__main__":
    unittest.main()
