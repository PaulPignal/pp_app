#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="${OFFI_LOG_DIR:-$ROOT_DIR/scraper/logs}"
DATA_DIR="${OFFI_DATA_DIR:-$ROOT_DIR/data}"
STAMP="$(date '+%Y%m%d-%H%M%S')"
LOG_FILE="${OFFI_LOG_FILE:-$LOG_DIR/offi-pipeline-$STAMP.log}"
TMP_FILE="${OFFI_TMP_FILE:-$DATA_DIR/offi.$STAMP.jsonl.tmp}"
OUTPUT_FILE="${OFFI_OUTPUT_FILE:-$DATA_DIR/offi.jsonl}"

mkdir -p "$LOG_DIR" "$DATA_DIR"

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" | tee -a "$LOG_FILE"
}

cleanup() {
  local exit_code=$?
  rm -f "$TMP_FILE"
  if [[ $exit_code -ne 0 ]]; then
    log "Pipeline failed with exit code $exit_code"
  fi
}

resolve_python() {
  if [[ -n "${OFFI_PYTHON_BIN:-}" ]]; then
    printf '%s\n' "$OFFI_PYTHON_BIN"
    return 0
  fi

  if [[ -x "$ROOT_DIR/.venv/bin/python" ]]; then
    printf '%s\n' "$ROOT_DIR/.venv/bin/python"
    return 0
  fi

  if command -v python3 >/dev/null 2>&1; then
    command -v python3
    return 0
  fi

  return 1
}

trap cleanup EXIT

if ! command -v pnpm >/dev/null 2>&1; then
  log "pnpm introuvable"
  exit 127
fi

PYTHON_BIN="$(resolve_python || true)"
if [[ -z "$PYTHON_BIN" ]]; then
  log "Python introuvable. Définis OFFI_PYTHON_BIN ou crée .venv/"
  exit 127
fi

SCRAPER_CMD=(
  "$PYTHON_BIN"
  "$ROOT_DIR/scraper/offi_scraper.py"
  --out "$TMP_FILE"
  --max-pages "${OFFI_MAX_PAGES:-150}"
  --sections "${OFFI_SECTIONS:-theatre,cinema}"
  --min-delay "${OFFI_MIN_DELAY:-0.7}"
  --max-delay "${OFFI_MAX_DELAY:-1.6}"
  --retries "${OFFI_RETRIES:-4}"
  --timeout "${OFFI_TIMEOUT:-20}"
  --refresh-after-hours "${OFFI_REFRESH_AFTER_HOURS:-72}"
)

if [[ -f "$OUTPUT_FILE" ]]; then
  SCRAPER_CMD+=(--cache-file "$OUTPUT_FILE")
fi

if [[ $# -gt 0 ]]; then
  SCRAPER_CMD+=("$@")
fi

log "Running scraper -> $TMP_FILE"
if ! "${SCRAPER_CMD[@]}" 2>&1 | tee -a "$LOG_FILE"; then
  exit 1
fi

if [[ ! -s "$TMP_FILE" ]]; then
  log "Scraper output is empty"
  exit 1
fi

mv "$TMP_FILE" "$OUTPUT_FILE"
if [[ "${OFFI_SKIP_DB_DEPLOY:-0}" != "1" ]]; then
  log "Applying Prisma migrations"
  if ! pnpm --dir "$ROOT_DIR/app" db:deploy 2>&1 | tee -a "$LOG_FILE"; then
    exit 1
  fi
fi

log "Running ingestion -> $OUTPUT_FILE"
if ! pnpm --dir "$ROOT_DIR/app" ingest:offi "$OUTPUT_FILE" 2>&1 | tee -a "$LOG_FILE"; then
  exit 1
fi

trap - EXIT
rm -f "$TMP_FILE"
log "Pipeline completed successfully"
log "Output file: $OUTPUT_FILE"
log "Log file: $LOG_FILE"
