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


def test_dates_a_annee_sur_deux_chiffres():
    from datetime import date
    from scraper.venues.html_fiche import parse_dates
    assert parse_dates("Du 12/01/27 au 16/05/27", date(2026, 11, 7)) == ["2027-01-12", "2027-05-16"]
    assert parse_dates("Avis du 18/07/2026", date(2026, 11, 7)) == []


def test_billetreduc_jamais_lu(tmp_path):
    from scraper.venues.http import PoliteFetcher
    fetcher = PoliteFetcher(cache_dir=str(tmp_path))
    fetcher._raw_get = lambda url: (_ for _ in ()).throw(AssertionError("requête envoyée"))
    for url in ["https://www.billetreduc.com/123/salle.htm", "https://billetreduc.com/spectacle/x-1"]:
        page = fetcher.get(url)
        assert page.note == "exclu" and not page.ok


def test_gabarit_billetreduc_retire():
    from scraper.venues import templates
    assert "billetreduc_salle" not in templates.EXTRACTORS
