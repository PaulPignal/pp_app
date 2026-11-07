# -*- coding: utf-8 -*-
from scraper.venues.__main__ import is_navigation_title, select_venues


def test_titres_de_menu_rejetes():
    for t in ["Agenda", "Spectacles", "Actualités", "Saison", "Saison 26—27", "Saison 2024/25",
              "BILLETTERIE SOLIDAIRE", "Réserver - Porte Saint-Martin", "Profitez d'offres promotionnelles",
              "Abonnements au cycle de conférences"]:
        assert is_navigation_title(t), t


def test_vrais_spectacles_gardes():
    for t in ["Nos corps désirants", "NOS EMPEREURS", "Tous les Français", "Nos volontés",
              "La Saison des pluies", "Spectacle de fin d'année des élèves", "Agenda ironique"]:
        assert not is_navigation_title(t), t


def test_filtre_par_section():
    rows = [
        {"slug": "a", "website": "https://a", "status": "ok", "feasibility": "3", "sections": ["theatre"], "platform": "", "ticketing_all": ""},
        {"slug": "b", "website": "https://b", "status": "ok", "feasibility": "1", "sections": ["concert"], "platform": "", "ticketing_all": ""},
    ]
    assert [r["slug"] for r in select_venues(rows, None, True, 3, None, None, {"theatre"})] == ["a"]
    assert len(select_venues(rows, None, True, 3, None)) == 2
