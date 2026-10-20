#!/usr/bin/env bash
# Gera o site e publica na branch gh-pages (GitHub Pages).
# Requer SITE_SECRET no ambiente. NOTION_TOKEN é opcional (sem ele, usa o retrato em data/).
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/build.mjs
REMOTO=$(git remote get-url origin)
TMP=$(mktemp -d)
cp -r dist/. "$TMP"
cd "$TMP"
git init -q -b gh-pages
git add -A
git -c user.name="Rede Tranquilo (robô)" -c user.email="robo@tranquilo.invalid" commit -q -m "Atualização do site $(date -u +%Y-%m-%dT%H:%MZ)"
for espera in 0 2 4 8 16; do
  sleep "$espera"
  if git push -q -f "$REMOTO" gh-pages; then echo "Publicado em gh-pages."; exit 0; fi
done
echo "Falha ao publicar." >&2; exit 1
