#!/usr/bin/env bash
# Gera o site e publica na branch gh-pages (GitHub Pages).
# Requer SITE_SECRET no ambiente. NOTION_TOKEN é opcional (sem ele, usa o retrato em data/).
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/build.mjs
# Domínio próprio (pedido da Marina, 21/11/2026): com SITE_DOMINIO (variável do repositório, ex. rede.tranquilomusica.com.br),
# o GitHub Pages serve o portal nesse endereço. Só ligar depois que o DNS (CNAME → marinacollier.github.io) estiver no ar:
# com o domínio ligado, o endereço github.io passa a redirecionar para ele.
if [ -n "${SITE_DOMINIO:-}" ]; then echo "$SITE_DOMINIO" > dist/CNAME; fi
# Produção (pedido da Marina, 18/11/2026): o mesmo site em /prd, apontando para o banco de produção (só contas reais).
if [ -f src/config.prd.js ]; then mkdir -p dist/prd && (cd dist && find . -maxdepth 1 -mindepth 1 ! -name prd -exec cp -r {} prd/ \;) && cp src/config.prd.js dist/prd/config.js; fi
# Com o domínio próprio (pedido da Marina, 21/11/2026), o endereço principal abre a PRODUÇÃO (só contas e dados reais)
# e o site de teste passa para /teste. /prd continua funcionando para os links antigos.
if [ -n "${SITE_DOMINIO:-}" ] && [ -f src/config.prd.js ]; then
  mkdir -p dist/teste && (cd dist && find . -maxdepth 1 -mindepth 1 ! -name prd ! -name teste ! -name CNAME -exec cp -r {} teste/ \;)
  cp src/config.prd.js dist/config.js
fi
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
