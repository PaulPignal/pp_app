.RECIPEPREFIX := >

PYTHON ?= ../.venv/bin/python
OUT ?= ../data/offi.jsonl
MAX_PAGES ?= 150
REFRESH_AFTER_HOURS ?= 72
CACHE ?= ../data/offi.jsonl

.PHONY: scrape test pipeline

scrape:
>$(PYTHON) offi_scraper.py --out $(OUT) --max-pages $(MAX_PAGES) --cache-file $(CACHE) --refresh-after-hours $(REFRESH_AFTER_HOURS)

test:
>$(PYTHON) -m unittest discover -s tests

pipeline:
>../scripts/offi-pipeline.sh
