// Gerado a partir dos testes manuais da sessão de QA. Rode com: scripts/testar-e2e.sh
const BASE = process.env.BASE || 'http://localhost:8077/';
const COD = Object.fromEntries(require('fs').readFileSync(process.env.ACESSOS || '/tmp/tq-acessos.tsv', 'utf8').trim().split('\n').map((l) => l.split('\t')).filter((c) => ['adm', 'equipe'].includes(c[0]) || ['Joyce Alane', 'Coringa Madá'].includes(c[2])).map((c) => [c[0] === 'artista' || c[0] === 'casa' ? c[0] : c[0], c[1].replace(/-/g, '')]));
const { chromium } = require('playwright');
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALHA') + ' ' + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch(); const c = await b.newContext(); await c.route(/supabase\.co/, (r) => r.abort());
  await c.addInitScript(() => { try { localStorage.setItem('tq-tutorial-publico', '1'); localStorage.setItem('tq-consentimento', 'tudo'); } catch {} });
  const p = await c.newPage(); await p.goto(BASE); await p.waitForTimeout(1500);
  const antes = await p.evaluate(() => TQDiario.pendentes());
  // simula o banco aceitando: troca o envio do modo demonstração por um que guarda as linhas
  const enviados = await p.evaluate(async () => { window.__linhas = []; TQConta.diario = async (l) => { window.__linhas.push(...l); return true; }; await TQDiario.enviar(); return window.__linhas.length; });
  ok(antes > 0 && enviados > 0 && await p.evaluate(() => TQDiario.pendentes()) === 0, `fila enviada ao banco (${enviados} eventos) e esvaziada`);
  const campos = await p.evaluate(() => Object.keys(window.__linhas[0]).sort().join(','));
  ok(campos === 'alvo,conta_id,detalhe,dispositivo,perfil,quando_cliente,sessao,tela,tipo,url,user_id', 'linha tem só as colunas da tabela diario_uso: ' + campos);
  await b.close();
})();
