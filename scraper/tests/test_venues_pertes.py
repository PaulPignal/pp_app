# -*- coding: utf-8 -*-
"""Pertes de théâtre (07/11/2026) : appariement (élisions, sous-titres), extracteur générique
(classement des liens de fiche, pagination), sources WordPress, adaptateurs Nord-Ouest,
Comédie Saint-Michel et Épée de Bois. Fixtures : pages publiques relevées le 07/11/2026."""
import os
import unittest
from datetime import date

from bs4 import BeautifulSoup

from scraper.venues import coverage

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


if __name__ == "__main__":
    unittest.main()
