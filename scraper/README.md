# Scraper Offi

## Audit rapide

- Point d'entrée scraper: `scraper/offi_scraper.py`
- Point d'entrée ingestion DB: `app/scripts/ingest-offi.ts`
- Sortie standard du pipeline: `data/offi.jsonl`
- Logs pipeline: `scraper/logs/offi-pipeline-YYYYMMDD-HHMMSS.log`
- Dépendances Python: `requests`, `beautifulsoup4`, `lxml`
- Dépendances DB/app: `pnpm --dir app ...` avec `DATABASE_URL`

Le scraper applique désormais un throttling, des retries exponentiels sur `403/429/5xx/timeouts`, une validation stricte des enregistrements, et renvoie un code non nul si aucune donnée exploitable n'est extraite.

L'ingestion fait un `upsert` sur `Work.sourceUrl`, valide chaque ligne JSONL, refuse les doublons dans le fichier, et n'écrase plus les champs déjà présents en base par `null`.

Le mode recommandé pour le cron reste exhaustif sur la pagination : il parcourt les sections `theatre` et `cinema`, puis réutilise le dernier `data/offi.jsonl` comme cache de fiches détail. Une fiche connue n'est refetch que si elle est nouvelle, incomplète, ou plus vieille que `72h` par défaut.

## Commande recommandée

Depuis la racine du repo :

```bash
./scripts/offi-pipeline.sh
```

Options utiles :

```bash
OFFI_MAX_PAGES=20 ./scripts/offi-pipeline.sh --debug
```

Le wrapper applique aussi `pnpm --dir app db:deploy` avant l'ingestion, sauf si `OFFI_SKIP_DB_DEPLOY=1`.

Variables utiles :
- `OFFI_SECTIONS=theatre,cinema` : sections Offi à crawler
- `OFFI_REFRESH_AFTER_HOURS=72` : âge max du cache détail avant refresh
- `OFFI_MAX_PAGES=150` : limite de pagination
- `OFFI_SKIP_DB_DEPLOY=1` : saute `db:deploy` si tu veux seulement scraper+ingest

## Commandes de dev

```bash
make -C scraper scrape
make -C scraper test
pnpm --dir app test
```

## Scheduling recommandé

Local et prod : même wrapper exécuté par cron
- exemple versionné : `scripts/offi-pipeline.cron.example`
- installateur local : `scripts/install-offi-cron.sh`
- prérequis : `pnpm`, Python, accès réseau à Offi et `DATABASE_URL`
- activation : lancer `./scripts/install-offi-cron.sh`

```cron
0 7 * * * cd /Users/paulpignal/Desktop/offi-app && /bin/bash ./scripts/offi-pipeline.sh >> /Users/paulpignal/Desktop/offi-app/scraper/logs/cron.log 2>&1
```

La même stratégie fonctionne sur un hôte de prod tant que l'environnement expose `DATABASE_URL` et les dépendances système nécessaires.
