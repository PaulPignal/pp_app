-- Mesure la cadence réelle du flux offi à partir de Work.createdAt (date de première
-- entrée en base, jamais réécrite) et de Work.startDate. Sortie 100 % agrégée.
-- Objectif : déterminer la fréquence optimale de crawl par section.
\pset pager off
\timing off

\echo
\echo ===== 1. Fraicheur de la base =====
SELECT count(*)                AS works,
       max(date("createdAt"))  AS dernier_ajout,
       max(date("updatedAt"))  AS derniere_ecriture
FROM "Work";

\echo
\echo ===== 2. Historique des ingestions (40 derniers jours actifs) =====
SELECT date("createdAt") AS jour,
       count(*)          AS runs,
       sum(imported)     AS lignes_upsertees
FROM "ImportJob"
GROUP BY 1 ORDER BY 1 DESC LIMIT 40;

\echo
\echo ===== 3. Arrivees par section : volume, periode, jour de semaine =====
-- Le flux ayant tourne quotidiennement, le jour de semaine de createdAt est un
-- proxy fiable (a ~1 jour) du jour ou offi.fr publie reellement.
SELECT section,
       count(*)                                                      AS n,
       min(date("createdAt"))                                        AS premiere,
       max(date("createdAt"))                                        AS derniere,
       count(DISTINCT date("createdAt"))                             AS jours_avec_arrivee,
       count(*) FILTER (WHERE extract(isodow FROM "createdAt") = 1)  AS lun,
       count(*) FILTER (WHERE extract(isodow FROM "createdAt") = 2)  AS mar,
       count(*) FILTER (WHERE extract(isodow FROM "createdAt") = 3)  AS mer,
       count(*) FILTER (WHERE extract(isodow FROM "createdAt") = 4)  AS jeu,
       count(*) FILTER (WHERE extract(isodow FROM "createdAt") = 5)  AS ven,
       count(*) FILTER (WHERE extract(isodow FROM "createdAt") = 6)  AS sam,
       count(*) FILTER (WHERE extract(isodow FROM "createdAt") = 7)  AS dim
FROM "Work"
GROUP BY 1 ORDER BY 2 DESC;

\echo
\echo ===== 4. Debit d arrivees par section (hors seed initial) =====
-- Le seed initial charge tout le catalogue d un coup : on l exclut en ignorant le
-- premier jour d arrivee de chaque section, sinon le debit est ecrase par le bulk.
WITH premier AS (
  SELECT section, min(date("createdAt")) AS d0 FROM "Work" GROUP BY 1
), flux AS (
  SELECT w.section, date(w."createdAt") AS jour, count(*) AS n
  FROM "Work" w JOIN premier p ON p.section = w.section
  WHERE date(w."createdAt") > p.d0
  GROUP BY 1, 2
)
SELECT section,
       count(*)                                       AS jours_observes,
       sum(n)                                         AS arrivees,
       round(avg(n), 1)                               AS moy_par_jour_actif,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY n::float)  AS med_par_jour_actif,
       max(n)                                         AS max_jour
FROM flux GROUP BY 1 ORDER BY 3 DESC;

\echo
\echo ===== 5. Delai de publication : startDate - createdAt (en jours) =====
-- pct_en_retard = fiches decouvertes APRES leur date de debut : ratés secs de la cadence.
SELECT section,
       count(*)                                                                    AS avec_debut,
       round(100.0 * count(*) FILTER (WHERE "startDate"::date < "createdAt"::date)
             / count(*))                                                           AS pct_en_retard,
       round(100.0 * count(*) FILTER (WHERE "startDate"::date - "createdAt"::date
             BETWEEN 0 AND 3) / count(*))                                           AS pct_lead_0_3j,
       round(100.0 * count(*) FILTER (WHERE "startDate"::date - "createdAt"::date
             BETWEEN 0 AND 7) / count(*))                                           AS pct_lead_0_7j,
       percentile_cont(0.25) WITHIN GROUP (ORDER BY ("startDate"::date - "createdAt"::date)::float) AS lead_p25,
       percentile_cont(0.50) WITHIN GROUP (ORDER BY ("startDate"::date - "createdAt"::date)::float) AS lead_med,
       percentile_cont(0.75) WITHIN GROUP (ORDER BY ("startDate"::date - "createdAt"::date)::float) AS lead_p75
FROM "Work"
WHERE "startDate" IS NOT NULL
GROUP BY 1 ORDER BY 2 DESC;

\echo
\echo ===== 6. Idem, restreint aux evenements a date unique (les plus perissables) =====
SELECT section,
       count(*)                                                                    AS one_off,
       round(100.0 * count(*) FILTER (WHERE "startDate"::date < "createdAt"::date)
             / count(*))                                                           AS pct_en_retard,
       percentile_cont(0.25) WITHIN GROUP (ORDER BY ("startDate"::date - "createdAt"::date)::float) AS lead_p25,
       percentile_cont(0.50) WITHIN GROUP (ORDER BY ("startDate"::date - "createdAt"::date)::float) AS lead_med
FROM "Work"
WHERE "startDate" IS NOT NULL AND "endDate"::date = "startDate"::date
GROUP BY 1 ORDER BY 2 DESC;
