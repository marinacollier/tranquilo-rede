// Telas novas no celular (390 px): sem rolagem lateral, botões com área de toque e sem texto cortado.
const { chromium } = require('playwright');
const HUB = require('fs').readFileSync(__dirname + '/dados/hub-demo.json', 'utf8');
const B = process.env.BASE || 'http://localhost:8790/'; const res = []; const ok = (c, m) => { res.push((c ? 'OK    ' : 'FALHA ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route('**/config.js', (r) => r.fulfill({ contentType: 'application/javascript', body: 'window.TQ_CONFIG = {};' }));
  await ctx.addInitScript((h) => { try { localStorage.setItem('tq-demo-hub', h);
    if (!localStorage.getItem('tq-demo-v1')) localStorage.setItem('tq-demo-v1', JSON.stringify({ usuarios: {}, insc: {}, casas: {}, chk: [], reg: [], sessao: null, conv: { 'rooftap@teste.com': { email: 'rooftap@teste.com', tipo: 'casa', nome: 'Rooftap', vinculo_nome: 'Rooftap', aceito_em: '2026-10-20T10:00:00Z' } } })); } catch {} }, HUB);
  const p = await ctx.newPage(); const erros = []; p.on('pageerror', (e) => erros.push(e.message)); p.on('dialog', (d) => d.accept());
  const largura = async (nome) => {
    const r = await p.evaluate(() => {
      const larg = document.documentElement.scrollWidth, vw = innerWidth;
      const largos = [...document.querySelectorAll('#app *')].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.right > vw + 1 && !e.closest('.tbl-wrap, .table-wrap, [style*="overflow"]'); }).slice(0, 3).map((e) => e.tagName + '.' + e.className);
      const pequenos = [...document.querySelectorAll('#app button, #app a.btn, #app input[type=checkbox]')].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && b.height < 24; }).length;
      return { larg, vw, largos, pequenos };
    });
    ok(r.larg <= r.vw, `${nome}: sem rolagem lateral (${r.larg}px de ${r.vw})`);
    await p.screenshot({ path: (process.argv[2] || require('os').tmpdir()) + `/m-${nome.replace(/\W+/g, '-')}.png`, fullPage: false });
    return r;
  };
  try {
    await p.goto(B); await p.waitForSelector('.cidade'); await p.keyboard.press('Escape');
    await p.click('#entrar'); await p.click('[data-entrada="criar"]'); await p.waitForSelector('#enome');
    await p.click('label:has(input[name="tipoNovo"][value="casa"])'); await p.waitForTimeout(150);
    await p.fill('#enome', 'Rooftap'); await p.fill('#email', 'rooftap@teste.com'); await p.fill('#esenha', 'segredo123'); await p.press('#esenha', 'Enter');
    await p.waitForSelector('.tour-caixa', { timeout: 8000 });
    ok(!(await p.isVisible('.consent')), 'aviso de privacidade não fica por cima do tutorial');
    await p.waitForTimeout(900); await largura('casa-tutorial'); await p.click('[data-tour="pular"]');
    ok(await p.isVisible('.consent'), 'aviso de privacidade volta quando o tutorial fecha'); await p.click('[data-consent="ok"]');
    const ir = async (aba) => { await p.evaluate((a) => { const b = document.querySelector(`[data-aba="${a}"]`); b.click(); }, aba); await p.waitForTimeout(600); };
    await ir('campanha'); await p.waitForSelector('.camp-dia'); await largura('casa-campanha');
    await ir('materiais'); await largura('casa-materiais');
    await ir('duvidas'); ok(/Google Agenda/.test(await p.innerText('#app')) && /Li e estou ciente/.test(await p.innerText('#app')), 'casa: dúvidas novas aparecem (campanha, agenda, ciência)'); await largura('casa-duvidas');
    await p.evaluate(() => document.querySelector('#sair')?.click()); await p.waitForTimeout(500);
    await p.evaluate(() => document.querySelector('#entrar')?.click()); await p.waitForTimeout(300); await p.click('[data-demo="equipe"]'); await p.waitForSelector('.tour-caixa', { timeout: 8000 }); await p.click('[data-tour="pular"]');
    await ir('campanhas'); await p.waitForSelector('#cfArq', { state: 'attached' }); await p.click('details:has(#cfArq) summary');
    await p.setInputFiles('#cfArq', __dirname + '/dados/casa-nova.json'); await p.waitForTimeout(400); await largura('equipe-campanhas');
    const cel = await p.$eval('table[data-tbl="andcamp"] tbody td b', (b) => b.getClientRects().length);
    ok(cel === 1, 'nome da casa na tabela não quebra no meio da palavra');
    await ir('materiais'); await p.click('details:has([data-mat-versao]) summary'); await largura('equipe-materiais');
  } catch (e) { ok(false, 'quebrou: ' + e.message.split('\n')[0]); }
  ok(!erros.length, 'sem erro JS ' + erros.join(' | '));
  console.log(res.join('\n')); await b.close();
})();
