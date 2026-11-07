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

# Neon met son compute en veille : le premier connect peut dépasser les 5 s que Prisma
# laisse par défaut (P1001 « Can't reach database server », run 37927345372 du 09/10/2026,
# échec en 6 s). Parade en deux temps, sans toucher au schéma :
#   1. connect_timeout=30 ajouté à DATABASE_URL (jamais affiché) ;
#   2. nouvelle tentative avec backoff (10, 20, 40, 80 s) sur les seules erreurs de
#      connexion. L'ingestion est idempotente (upsert) : la rejouer ne duplique rien.
add_connect_timeout() {
  [[ -n "${DATABASE_URL:-}" ]] || return 0
  case "$DATABASE_URL" in
    *connect_timeout=*) ;;
    *\?*) DATABASE_URL="$DATABASE_URL&connect_timeout=${OFFI_DB_CONNECT_TIMEOUT:-30}" ;;
    *) DATABASE_URL="$DATABASE_URL?connect_timeout=${OFFI_DB_CONNECT_TIMEOUT:-30}" ;;
  esac
  export DATABASE_URL
}

retry_db() {
  local label="$1"; shift
  local max="${OFFI_DB_ATTEMPTS:-5}" delay="${OFFI_DB_RETRY_DELAY:-10}" attempt=1 out rc
  while :; do
    out="$(mktemp)"
    set +e
    "$@" 2>&1 | tee -a "$LOG_FILE" "$out"
    rc=${PIPESTATUS[0]}
    set -e
    if [[ $rc -eq 0 ]]; then
      rm -f "$out"
      return 0
    fi
    if [[ $attempt -ge $max ]] || ! grep -qE "P1001|P1002|P1017|ECONNREFUSED|ETIMEDOUT|ECONNRESET|Connection terminated|timeout expired|Can't reach database" "$out"; then
      rm -f "$out"
      return "$rc"
    fi
    rm -f "$out"
    log "$label : connexion impossible (tentative $attempt/$max), nouvel essai dans ${delay}s"
    sleep "$delay"
    delay=$((delay * 2))
    attempt=$((attempt + 1))
  done
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
  --sections "${OFFI_SECTIONS:-theatre,cinema,exposition,concert,visite,enfants}"
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

add_connect_timeout

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
  if ! retry_db "Migrations" pnpm --dir "$ROOT_DIR/app" db:deploy; then
    exit 1
  fi
fi

log "Running ingestion -> $OUTPUT_FILE"
if ! retry_db "Ingestion" pnpm --dir "$ROOT_DIR/app" ingest:offi "$OUTPUT_FILE"; then
  exit 1
fi

trap - EXIT
rm -f "$TMP_FILE"
log "Pipeline completed successfully"
log "Output file: $OUTPUT_FILE"
log "Log file: $LOG_FILE"
