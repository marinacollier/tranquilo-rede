#!/usr/bin/env bash
# Roda todos os testes (banco + navegador) num build local e salva o resultado em qa/resultados/<data>.txt.
# Usa um segredo de teste: os códigos gerados só abrem os pacotes deste build local, nunca os do site no ar.
# Uso: scripts/testar-e2e.sh            (precisa de Node 22 e do Playwright com Chromium)
set -uo pipefail
cd "$(dirname "$0")/.."
ACESSOS=$(mktemp); SAIDA_IMG=$(mktemp -d); PORTA=${PORTA:-8077}
RES="qa/resultados/$(date -u +%Y-%m-%d_%H%M)Z.txt"; mkdir -p qa/resultados
SITE_SECRET=segredo-de-teste-local-nao-e-o-do-site ACESSOS_SAIDA="$ACESSOS" node scripts/build.mjs > /dev/null
# Sem banco configurado o site roda em modo demonstração (contas só no navegador): os testes nunca tocam o banco real.
printf 'window.TQ_CONFIG = { supabaseUrl: "", supabaseAnonKey: "" };\n' > dist/config.js
python3 -m http.server "$PORTA" --directory dist > /dev/null 2>&1 & SERVIDOR=$!
trap 'kill $SERVIDOR 2>/dev/null; rm -f "$ACESSOS"' EXIT
sleep 1
export BASE="http://localhost:$PORTA/" ACESSOS NODE_PATH="$PWD/node_modules:$(npm root -g)"
{
  echo "# Testes da Rede Tranquilo — $(date -u '+%Y-%m-%d %H:%M UTC') — commit $(git rev-parse --short HEAD)"
  echo; echo "## Banco (PGlite com o supabase/schema.sql)"; node tests/schema.test.mjs 2>&1 | grep -E "^(OK|FALHA)" ; node tests/schema.test.mjs 2>&1 | tail -1
  echo; echo "## Contrato automático (PGlite)"; node tests/contratos.test.mjs 2>&1 | grep -E "^(OK|FALHA)"
  echo; echo "## Segurança (ataques da auditoria; ABERTO = problema conhecido ainda não corrigido)"; node tests/seguranca.test.mjs supabase/schema.sql 2>&1 | grep -E "^(OK|FALHA)|verificações" | sed "s/^FALHA/ABERTO/"
  for t in tests/e2e/*.cjs; do echo; echo "## $(basename "$t" .cjs)"; node "$t" "$SAIDA_IMG" 2>&1 | grep -vE "agent-proxy|^\s*$"; done
} | tee "$RES"
echo; echo "Resultado salvo em $RES"; echo "Capturas desta rodada em $SAIDA_IMG"
grep -q "^FALHA" "$RES" && exit 1 || exit 0
