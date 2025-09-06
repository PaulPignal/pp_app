#!/usr/bin/env bash
set -euo pipefail

OUT="AUDIT_PACK.md"
ROOT="$(pwd)"

# Fichiers/dossiers à INCLURE (app + scraper) et EXCLURE
INCLUDE_PATTERNS=(
  "app"
  "scraper"
  "data/offi.jsonl"        # si tu veux inclure un échantillon (optionnel: remplace par 20 lignes)
  "README.md"
)
EXCLUDE_REGEX='/(node_modules|\.next|\.git|dev\.db|\.DS_Store|coverage|dist|build|.turbo)/'

# En-tête
{
  echo "# Audit Pack"
  echo
  echo "Généré le: $(date -Iseconds)"
  echo "Racine: $ROOT"
  echo
  echo "## Arborescence"
  if command -v tree >/dev/null 2>&1; then
    tree -a -I 'node_modules|.next|.git|dev.db|.DS_Store|coverage|dist|build|.turbo' -L 6
  else
    # fallback find
    find . -maxdepth 6 | grep -Ev "$EXCLUDE_REGEX" | sed 's|^\./||g'
  fi
  echo
  echo "## Versions"
  (cd app && node -v 2>/dev/null || true) | sed 's/^/Node: /'
  (cd app && pnpm -v 2>/dev/null || true) | sed 's/^/pnpm: /'
  (cd app && npx -y prisma -v 2>/dev/null || true) | sed 's/^/Prisma: /'
  echo
  echo "## Fichiers"
} > "$OUT"

# Fonction: ajouter un fichier avec balises
add_file () {
  local f="$1"
  local rel="${f#./}"
  echo -e "\n\n=== FILE: $rel ===\n" >> "$OUT"
  # Détection extension pour le fence
  case "$rel" in
    *.ts)  lang="ts" ;;
    *.tsx) lang="tsx" ;;
    *.js)  lang="js" ;;
    *.mjs) lang="js" ;;
    *.json)lang="json" ;;
    *.py)  lang="python" ;;
    *.md)  lang="md" ;;
    *.yml|*.yaml) lang="yaml" ;;
    *.css) lang="css" ;;
    *)     lang="" ;;
  esac
  if [ -n "$lang" ]; then
    echo "\`\`\`$lang" >> "$OUT"
  else
    echo "\`\`\`" >> "$OUT"
  fi
  LC_ALL=C sed -e 's/\t/    /g' "$f" >> "$OUT"
  echo -e "\n\`\`\`" >> "$OUT"
}

# Liste des fichiers à inclure
FILES=()
for pat in "${INCLUDE_PATTERNS[@]}"; do
  if [ -f "$pat" ]; then
    FILES+=("$pat")
  elif [ -d "$pat" ]; then
    while IFS= read -r f; do
      case "$f" in
        */node_modules/*|*/.next/*|*/.git/*|*/coverage/*|*/dist/*|*/build/*|*/.turbo/*|*/dev.db)
          ;;
        *) FILES+=("$f") ;;
      esac
    done < <(find "$pat" -type f)
  fi
done

# Trier pour un ordre reproductible
IFS=$'\n' FILES_SORTED=($(printf "%s\n" "${FILES[@]}" | sort)); unset IFS

# Ajout des fichiers
for f in "${FILES_SORTED[@]}"; do
  add_file "$f"
done

echo "✅ Pack généré: $OUT"
