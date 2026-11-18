// Sugestão POR HISTÓRICO (18/11/2026): aparece no Criar datas, separada e marcada como "confirmar".
const { chromium } = require('playwright');
const B = process.env.BASE || 'http://localhost:8790/'; const res = []; const ok = (c, m) => { res.push((c ? 'OK    ' : 'FALHA ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch(); const erros = [];
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route('**/config.js*', (r) => r.fulfill({ contentType: 'application/javascript', body: 'window.TQ_CONFIG = {};' }));
  await ctx.addInitScript(() => { try { localStorage.setItem('tq-consentimento', 'tudo'); localStorage.setItem('tq-tutorial-publico', '1'); localStorage.setItem('tq-sem-trilha', '1'); localStorage.setItem('tq-dp-aberto', '1'); } catch {} });
  const p = await ctx.newPage(); p.on('pageerror', (e) => erros.push(e.message));
  try {
    await p.goto(B); await p.waitForSelector('.cidade'); await p.keyboard.press('Escape');
    await p.click('#entrar'); await p.click('[data-demo="equipe"]'); try { await p.click('[data-tour="pular"]', { timeout: 2500 }); } catch {}
    await p.evaluate(() => { S.aba = 'datas_portal'; render(); }); await p.waitForSelector('#dpSugHist', { timeout: 8000 });
    const t = await p.textContent('#dpSugHist summary');
    ok(/Sugestão POR HISTÓRICO/.test(t) && /Confirme com a casa/.test(t), 'bloco "Sugestão POR HISTÓRICO" aparece com o aviso de confirmar');
    await p.evaluate(() => { S.dpb.de = '2026-11-18'; S.dpb.ate = '2026-12-31'; render(); });
    await p.click('#dpSugHist summary'); await p.waitForTimeout(300);
    const n = await p.$$eval('#dpSugHist .card', (x) => x.length);
    ok(n > 0, `traz sugestões no período (${n})`);
    ok((await p.$$('#dpSugHist [data-pp-novo^="casa|base:"]')).length > 0 && (await p.$$('#dpSugHist [data-pp-novo^="artista|base:"]')).length > 0, 'cada sugestão tem "Propor atualização" (casa e artistas)');
    await p.click('#dpSugHist [data-pp-novo^="casa|base:"]'); await p.waitForSelector('#ppForm', { timeout: 5000 });
    ok(/Pelo histórico do Tranquilo/.test(await p.inputValue('#ppMotivo')) && (await p.$$('[data-pp-dia]:checked')).length > 0, 'formulário vem preenchido pelo histórico (motivo e dias da semana)');
    await p.keyboard.press('Escape');
  } catch (e) { ok(false, 'quebrou: ' + e.message.split('\n')[0]); }
  ok(!erros.length, 'sem erro JS ' + erros.join(' | '));
  console.log(res.join('\n')); await b.close();
})();
