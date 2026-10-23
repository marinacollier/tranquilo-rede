// Vínculo por código (schema v9): colar o código vira pedido; as métricas já abrem e a conta mostra "aguardando".
const { chromium } = require('playwright');
const B = process.env.BASE || 'http://localhost:8790/'; const res = []; const ok = (c, m) => { res.push((c ? 'OK    ' : 'FALHA ') + m); if (!c) process.exitCode = 1; };
const COD = {}; for (const [t, c] of require('fs').readFileSync(process.env.ACESSOS || '/tmp/tq-acessos.tsv', 'utf8').trim().split('\n').map((l) => l.split('\t'))) COD[t] ||= c;
(async () => {
  const b = await chromium.launch(); const erros = [];
  const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } });
  await ctx.route('**/config.js', (r) => r.fulfill({ contentType: 'application/javascript', body: 'window.TQ_CONFIG = {};' }));
  await ctx.addInitScript(() => { try { localStorage.setItem('tq-consentimento', 'tudo'); localStorage.setItem('tq-tutorial-publico', '1'); } catch {} });
  const p = await ctx.newPage(); p.on('pageerror', (e) => erros.push(e.message)); p.on('dialog', (d) => d.accept());
  const pular = async () => { try { await p.waitForSelector('.tour-caixa', { timeout: 4000 }); await p.click((await p.$('[data-tour="pular"]')) ? '[data-tour="pular"]' : '[data-tour="avancar"]'); } catch {} };
  try {
    await p.goto(B); await p.waitForSelector('.cidade');
    await p.click('#entrar'); await p.click('[data-entrada="criar"]'); await p.waitForSelector('#enome');
    await p.click('label:has(input[name="tipoNovo"][value="artista"])'); await p.fill('#enome', 'Bia Vínculo'); await p.fill('#email', 'bia@vinculo.com'); await p.fill('#esenha', 'segredo123'); await p.press('#esenha', 'Enter');
    await pular();
    await p.click('[data-aba="conta"]'); await p.waitForSelector('#vcod');
    await p.fill('#vcod', COD.artista); await p.click('#vok'); await p.waitForTimeout(800);
    const txt = await p.textContent('#app');
    ok(/aguardando a equipe confirmar/.test(txt), 'depois de colar o código, a conta mostra o vínculo aguardando confirmação');
    ok(!(await p.$('#vcod')), 'o campo de código some enquanto o pedido está aberto');
    ok(await p.$('[data-aba="agenda"]') !== null, 'as métricas do código já abrem (aba Minha agenda)');
    await p.reload(); await pular(); await p.waitForTimeout(500);
    await p.click('[data-aba="conta"]');
    ok(/aguardando a equipe confirmar/.test(await p.textContent('#app')) && await p.$('[data-aba="agenda"]') !== null, 'o pedido e as métricas continuam depois de recarregar');
  } catch (e) { ok(false, 'quebrou: ' + e.message.split('\n')[0]); }
  ok(!erros.length, 'sem erro JS ' + erros.join(' | '));
  console.log(res.join('\n')); await b.close();
})();
