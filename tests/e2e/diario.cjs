// Diário de uso: nada se perde enquanto o banco não aceita, e nada do que se digita é gravado.
const BASE = process.env.BASE || 'http://localhost:8077/';
const { chromium } = require('playwright');
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALHA') + ' ' + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch(); const erros = [];
  const c = await b.newContext({ viewport: { width: 1280, height: 860 } });
  let aceita = false; const recebidos = [];
  // Banco simulado: só o endereço do diário responde; o resto do Supabase fica fora do ar.
  await c.route('**/config.js', (r) => r.fulfill({ contentType: 'application/javascript', body: 'window.TQ_CONFIG = { supabaseUrl: "https://teste-diario.supabase.co", supabaseAnonKey: "chave-de-teste" };' }));
  await c.route(/teste-diario\.supabase\.co/, (r) => r.abort());   // registrada antes: a regra do diário (abaixo) tem prioridade
  await c.route(/teste-diario\.supabase\.co\/rest\/v1\/diario/, async (r) => {
    if (!aceita) return r.fulfill({ status: 404, body: '{"code":"PGRST205","message":"Could not find the table"}' });
    recebidos.push(...JSON.parse(r.request().postData() || '[]')); return r.fulfill({ status: 201, body: '' });
  });
  await c.addInitScript(() => { try { localStorage.setItem('tq-tutorial-publico', '1'); localStorage.setItem('tq-consentimento', 'tudo'); } catch {} });
  const p = await c.newPage(); p.on('pageerror', (e) => erros.push(e.message));
  await p.goto(BASE); await p.waitForTimeout(2500);
  await p.fill('#avContato', 'segredo@exemplo.com'); await p.click('#avOk'); await p.waitForTimeout(6500);
  const pend = () => p.evaluate(() => JSON.parse(localStorage.getItem('tq-diario-pendente') || '[]'));
  let fila = await pend();
  ok(fila.length > 0, `tabela ausente: eventos guardados no navegador (${fila.length})`);
  ok(!JSON.stringify(fila).includes('segredo@exemplo'), 'o que foi digitado não entra no diário');
  await p.reload(); await p.waitForTimeout(1500);
  ok((await pend()).length >= fila.length, 'recarregar a página não perde a fila');
  aceita = true; await p.waitForTimeout(7000);
  const chegou = new Set(recebidos.map((e) => e.quando_cliente + e.acao));
  ok(fila.every((e) => chegou.has(e.quando_cliente + e.acao)), `banco aceitando: todos os ${fila.length} eventos que esperavam chegaram (${recebidos.length} enviados)`);
  ok(recebidos.some((e) => e.acao === 'abriu') && recebidos.some((e) => e.acao === 'clique'), 'chegam abertura do site e cliques');
  ok(erros.length === 0, 'sem erros de JavaScript ' + erros.join(' | '));
  await b.close();
})();
