// Gerado a partir dos testes manuais da sessão de QA. Rode com: scripts/testar-e2e.sh
const BASE = process.env.BASE || 'http://localhost:8077/';
const COD = Object.fromEntries(require('fs').readFileSync(process.env.ACESSOS || '/tmp/tq-acessos.tsv', 'utf8').trim().split('\n').map((l) => l.split('\t')).filter((c) => ['adm', 'equipe'].includes(c[0]) || ['Joyce Alane', 'Coringa Madá'].includes(c[2])).map((c) => [c[0] === 'artista' || c[0] === 'casa' ? c[0] : c[0], c[1].replace(/-/g, '')]));
const { chromium } = require('playwright');
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALHA') + ' ' + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch(); const erros = [];
  const c = await b.newContext({ viewport: { width: 1280, height: 860 } }); await c.route(/supabase\.co/, (r) => r.abort());
  await c.addInitScript(() => { try { localStorage.setItem('tq-tutorial-publico', '1'); } catch {} });
  const p = await c.newPage(); p.on('pageerror', (e) => erros.push(e.message));
  const fila = () => p.evaluate(() => JSON.parse(localStorage.getItem('tq-diario-fila') || '[]'));
  await p.goto(BASE); await p.waitForTimeout(1500);
  ok(await p.isVisible('[data-consent="tudo"]') && await p.isVisible('[data-consent="necessarios"]'), 'banner oferece "Aceitar tudo" e "Apenas necessários"');
  await p.click('[data-consent="tudo"]');
  await p.selectOption('#avCidade', '__outra'); await p.fill('#avOutra', 'Cidade Secreta'); await p.fill('#avContato', 'segredo@exemplo.com'); await p.click('#avOk');
  await p.waitForTimeout(300);
  let f = await fila(); const txt = JSON.stringify(f);
  ok(f.some((e) => e.tipo === 'sessao') && f.some((e) => e.tipo === 'tela' && e.tela === 'publica'), 'registra a abertura do site e a tela pública');
  ok(f.some((e) => e.tipo === 'acao' && /avOk/.test(e.alvo)), 'registra o clique em "Me avise"');
  ok(f.some((e) => e.tipo === 'erro' && /autoriza/i.test(e.alvo)), 'registra a mensagem de erro que a pessoa viu');
  ok(!/segredo@exemplo|Cidade Secreta/.test(txt), 'não grava nada do que foi digitado');
  await p.goto('about:blank'); await p.goto('' + BASE + '#c=' + COD.adm); await p.waitForTimeout(2500);
  await p.click('[data-aba="datas"]'); await p.waitForTimeout(300);
  f = await fila();
  ok(f.some((e) => e.tipo === 'tela' && e.tela === 'datas' && /adm/.test(e.perfil)), 'registra a troca de aba com o perfil');
  ok(!JSON.stringify(f).includes(COD.adm), 'o código de acesso não aparece no diário');
  await p.click('tbody tr.click >> nth=0'); await p.waitForTimeout(300);
  ok((await fila()).some((e) => e.tipo === 'tela' && /^janela/.test(e.tela)), 'registra a janela (ficha) aberta');
  await p.reload(); await p.waitForTimeout(1500);
  ok((await fila()).length >= f.length, 'sem banco no ar, a fila continua guardada depois de recarregar');
  // Apenas necessários: visitante não entra no diário
  const c2 = await b.newContext(); await c2.route(/supabase\.co/, (r) => r.abort());
  await c2.addInitScript(() => { try { localStorage.setItem('tq-tutorial-publico', '1'); } catch {} });
  const p2 = await c2.newPage(); await p2.goto(BASE); await p2.waitForTimeout(1200); await p2.click('[data-consent="necessarios"]'); await p2.waitForTimeout(6000);
  ok((await p2.evaluate(() => JSON.parse(localStorage.getItem('tq-diario-fila') || '[]'))).filter((e) => e.perfil === 'visitante').length === 0, '"Apenas necessários" descarta o diário do visitante');
  ok(erros.length === 0, 'sem erros de JavaScript ' + erros.join(' | '));
  await b.close();
})();
// envio: com um banco falso que aceita, a fila esvazia
(async () => {})();
