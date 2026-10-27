// Manual da Operação: cronograma, camarim e rider aparecem no Roteiro da noite (código de casa), também no celular.
const { chromium } = require('playwright');
const B = process.env.BASE || 'http://localhost:8790/'; const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALHA') + ' ' + m); if (!c) process.exitCode = 1; };
const COD = {}; for (const [t, c] of require('fs').readFileSync(process.env.ACESSOS || '/tmp/tq-acessos.tsv', 'utf8').trim().split('\n').map((l) => l.split('\t'))) COD[t] ||= c;
(async () => {
  const b = await chromium.launch(); const erros = [];
  for (const [nome, vp] of [['computador', { width: 1280, height: 860 }], ['celular', { width: 390, height: 844 }]]) {
    const ctx = await b.newContext({ viewport: vp });
    await ctx.route('**/config.js', (r) => r.fulfill({ contentType: 'application/javascript', body: 'window.TQ_CONFIG = {};' }));
    await ctx.addInitScript(() => { try { localStorage.setItem('tq-tutorial-publico', '1'); localStorage.setItem('tq-consentimento', 'tudo'); localStorage.setItem('tq-tutorial-codigo-casa', '2099-01-01'); } catch {} });
    const p = await ctx.newPage(); p.on('pageerror', (e) => erros.push(e.message));
    await p.goto(B + '#c=' + COD.casa); await p.waitForSelector('[data-aba="roteiro"]', { state: 'attached', timeout: 10000 });
    await p.evaluate(() => document.querySelector('[data-aba="roteiro"]').click()); await p.waitForTimeout(600);
    const t = await p.innerText('#app');
    ok(/Manual da Operação/.test(t) && /Abertura pelo anfitrião/.test(t) && /Sábado e domingo/.test(t) && /Estrella Galicia/.test(t) && /SM58/.test(t) && /menores de 10/i.test(t), `${nome}: Roteiro da noite mostra cronogramas, camarim, rider e crianças`);
    const larg = await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
    ok(larg, `${nome}: sem rolagem lateral`);
    await ctx.close();
  }
  ok(!erros.length, 'sem erro JS ' + erros.join(' | '));
  await b.close();
})();
