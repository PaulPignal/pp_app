#!/usr/bin/env bash
# Génère des AUDIT_PACK_partN.md en respectant des limites de taille, avec tronquage.
# Robuste macOS/zsh, pas d'underscores dans les nombres, fonctionne avec ou sans "app/".

set -euo pipefail

# ---------- Paramètres ----------
MAX_PACK_BYTES=4500000     # ~4.5 MB par pack
PER_FILE_MAX_BYTES=400000  # ~400 KB par fichier
JSONL_SAMPLE_LINES=200     # lignes max pour un .jsonl
TREE_MAX_DEPTH=6

# Dossiers/fichiers à INCLURE (relatifs au dossier courant)
INCLUDE_PATTERNS=(
  "app"
  "scraper"
  "README.md"
  "data/offi.jsonl"
)

EXCLUDE_REGEX='/(node_modules|\.next|\.git|dev\.db|\.DS_Store|coverage|dist|build|\.turbo|\.cache|\.pnpm-store)/'

ROOT="$(pwd)"
PART=1
OUT="AUDIT_PACK_part${PART}.md"

# Détection d'un dossier applicatif pour afficher des versions (peut être . ou app)
APP_DIR=""
if [ -d "./app" ]; then
  APP_DIR="./app"
elif [ -f "./package.json" ]; then
  APP_DIR="."
fi

is_text () {
  local f="$1"
  local mime
  mime="$(file -b --mime "$f" 2>/dev/null || echo "")"
  case "$mime" in
    text/*|*charset=* ) return 0 ;;
    * ) return 1 ;;
  esac
}

write_header () {
  {
    echo "# Audit Pack (part ${PART})"
    echo
    echo "- Généré le: $(date -Iseconds)"
    echo "- Racine: $ROOT"
    echo
    echo "## Arborescence (filtrée)"
    if command -v tree >/dev/null 2>&1; then
      tree -a -I 'node_modules|.next|.git|dev.db|.DS_Store|coverage|dist|build|.turbo|.cache' -L ${TREE_MAX_DEPTH}
    else
      find . -maxdepth ${TREE_MAX_DEPTH} | grep -Ev "$EXCLUDE_REGEX" | sed 's|^\./||g'
    fi
    echo
    echo "## Versions"
    if [ -n "$APP_DIR" ]; then
      (cd "$APP_DIR" && node -v 2>/dev/null || true) | sed 's/^/Node: /'
      (cd "$APP_DIR" && pnpm -v 2>/dev/null || true) | sed 's/^/pnpm: /'
      (cd "$APP_DIR" && npx -y prisma -v 2>/dev/null || true) | sed 's/^/Prisma: /'
      if [ -f "$APP_DIR/package.json" ]; then
        (cd "$APP_DIR" && node -e 'try{const p=require("./package.json");console.log("Next:",p.dependencies?.next||p.devDependencies?.next||"N/A")}catch{}' 2>/dev/null || true)
      fi
    else
      echo "Node: (app introuvable)"
      echo "pnpm: (app introuvable)"
      echo "Prisma: (app introuvable)"
      echo "Next: (app introuvable)"
    fi
    echo
    echo "## Fichiers"
  } > "$OUT"
}

rotate_if_needed () {
  local size
  size=$(wc -c < "$OUT" | tr -d ' ')
  if [ "$size" -gt "$MAX_PACK_BYTES" ]; then
    PART=$((PART+1))
    OUT="AUDIT_PACK_part${PART}.md"
    write_header
  fi
}

add_file_truncated () {
  local f="$1"
  local rel="${f#./}"
  local lang=""
  case "$rel" in
    *.ts)   lang="ts" ;;
    *.tsx)  lang="tsx" ;;
    *.js)   lang="js" ;;
    *.mjs)  lang="js" ;;
    *.json) lang="json" ;;
    *.jsonl)lang="json" ;;
    *.py)   lang="python" ;;
    *.md)   lang="md" ;;
    *.yml|*.yaml) lang="yaml" ;;
    *.css)  lang="css" ;;
    *.env|*.env.example) lang="" ;;
    *)      lang="" ;;
  esac

  {
    echo
    echo "=== FILE: ${rel} ==="
    echo
    if [ -n "$lang" ]; then
      echo "\`\`\`$lang"
    else
      echo "\`\`\`"
    fi

    if [[ "$rel" == *.jsonl ]]; then
      head -n ${JSONL_SAMPLE_LINES} "$f"
      echo
      echo "# NOTE: tronqué à ${JSONL_SAMPLE_LINES} lignes pour l'audit."
    else
      local bytes
      bytes=$(wc -c < "$f" | tr -d ' ')
      if [ "$bytes" -gt "$PER_FILE_MAX_BYTES" ]; then
        head -c ${PER_FILE_MAX_BYTES} "$f"
        echo
        echo "# NOTE: tronqué à ~${PER_FILE_MAX_BYTES} octets pour l'audit."
      else
        # Remplacement TAB → espaces, en environnement C pour éviter l'UTF-8 bug de sed sur macOS
        LC_ALL=C sed -e 's/\t/    /g' "$f"
      fi
    fi

    echo
    echo "\`\`\`"
  } >> "$OUT"

  rotate_if_needed
}

write_header

# Construire la liste des fichiers à inclure
FILES=()
for pat in "${INCLUDE_PATTERNS[@]}"; do
  if [ -f "$pat" ]; then
    FILES+=("$pat")
  elif [ -d "$pat" ]; then
    while IFS= read -r f; do
      case "$f" in
        */node_modules/*|*/.next/*|*/.git/*|*/coverage/*|*/dist/*|*/build/*|*/.turbo/*|*/.cache/*|*/dev.db)
          ;;
        *) FILES+=("$f") ;;
      esac
    done < <(find "$pat" -type f)
  fi
done

# Tri
IFS=$'\n' FILES_SORTED=($(printf "%s\n" "${FILES[@]}" | sort)); unset IFS

# Ajout des fichiers (texte uniquement)
for f in "${FILES_SORTED[@]}"; do
  f="${f#./}"
  [ -f "$f" ] || continue
  if echo "$f" | grep -Eq "$EXCLUDE_REGEX"; then
    continue
  fi
  if ! is_text "$f"; then
    {
      echo
      echo "=== FILE: ${f} (binaire — ignoré) ==="
      echo
      echo "\`\`\`"
      echo "(binaire ignoré pour limiter la taille)"
      echo "\`\`\`"
    } >> "$OUT"
    rotate_if_needed
    continue
  fi
  add_file_truncated "$f"
done

echo "✅ Packs générés :"
for p in $(ls AUDIT_PACK_part*.md 2>/dev/null | sort); do
  sz=$(wc -c < "$p" | tr -d ' ')
  printf " - %s (%.2f MB)\n" "$p" "$(echo "$sz / 1048576" | bc -l)"
done
