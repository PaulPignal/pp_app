.RECIPEPREFIX := >

PYTHON ?= ../.venv/bin/python
OUT ?= ../data/offi.jsonl
MAX_PAGES ?= 150

.PHONY: scrape test pipeline

scrape:
>$(PYTHON) offi_scraper.py --out $(OUT) --max-pages $(MAX_PAGES)

test:
>$(PYTHON) -m unittest discover -s tests

pipeline:
>../scripts/offi-pipeline.sh
