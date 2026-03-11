#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="${OFFI_REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
SCHEDULE="${OFFI_CRON_SCHEDULE:-0 7 * * *}"
REFRESH_AFTER_HOURS="${OFFI_REFRESH_AFTER_HOURS:-72}"
LOG_DIR="${OFFI_LOG_DIR:-$ROOT_DIR/scraper/logs}"
CRON_LOG_FILE="${OFFI_CRON_LOG_FILE:-$LOG_DIR/cron.log}"
BEGIN_MARKER="# BEGIN OFFI PIPELINE"
END_MARKER="# END OFFI PIPELINE"
TMP_FILE="$(mktemp)"

mkdir -p "$LOG_DIR"

cleanup() {
  rm -f "$TMP_FILE"
}

trap cleanup EXIT

CRON_CMD="$SCHEDULE cd $ROOT_DIR && OFFI_REFRESH_AFTER_HOURS=$REFRESH_AFTER_HOURS ./scripts/offi-pipeline.sh >> $CRON_LOG_FILE 2>&1"

EXISTING_CRONTAB="$(crontab -l 2>/dev/null || true)"
printf '%s\n' "$EXISTING_CRONTAB" | awk -v begin="$BEGIN_MARKER" -v end="$END_MARKER" '
  $0 == begin { skip=1; next }
  $0 == end { skip=0; next }
  skip != 1 { print }
' > "$TMP_FILE"

{
  cat "$TMP_FILE"
  printf '%s\n' "$BEGIN_MARKER"
  printf '%s\n' "$CRON_CMD"
  printf '%s\n' "$END_MARKER"
} > "$TMP_FILE.new"

mv "$TMP_FILE.new" "$TMP_FILE"
crontab "$TMP_FILE"

printf 'Installed Offi cron:\n%s\n' "$CRON_CMD"
