// Ficha da casa: "Enviar" não passa sem os campos obrigatórios (marca em vermelho e diz o que falta); o rascunho continua salvo.
const { chromium } = require('playwright');
const B = process.env.BASE || 'http://localhost:8790/'; const res = []; const ok = (c, m) => { res.push((c ? 'OK    ' : 'FALHA ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch(); const erros = [];
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route('**/config.js*', (r) => r.fulfill({ contentType: 'application/javascript', body: 'window.TQ_CONFIG = {};' }));
  await ctx.addInitScript(() => { try { localStorage.setItem('tq-consentimento', 'tudo'); localStorage.setItem('tq-sem-trilha', '1'); } catch {} });
  const p = await ctx.newPage(); p.on('pageerror', (e) => erros.push(e.message)); p.on('dialog', (d) => d.accept());
  try {
    await p.goto(B); await p.waitForSelector('.cidade'); await p.keyboard.press('Escape');
    await p.click('#entrar'); await p.click('[data-entrada="criar"]'); await p.waitForSelector('#enome');
    await p.click('label:has(input[name="tipoNovo"][value="casa"])'); await p.waitForTimeout(200);
    await p.fill('#enome', 'Casa Sem Dados'); await p.fill('#email', 'semdados@teste.com'); await p.fill('#esenha', 'segredo123'); await p.press('#esenha', 'Enter');
    await p.waitForSelector('[data-aba="ficha"]', { timeout: 8000 }); await p.click('[data-tour="pular"]').catch(() => {}); await p.waitForTimeout(200);
    await p.waitForSelector('#enviar', { timeout: 5000 });
    await p.fill('[data-k="nome"]', ''); await p.fill('[data-k="cidade_uf"]', 'Recife/PE');
    await p.click('#enviar'); await p.waitForTimeout(400);
    const msg = await p.textContent('#ferr');
    ok(/^✕ Erro: Não enviado: falta preencher Nome da casa/.test(msg) && !/Cidade\/UF/.test(msg), `Enviar sem obrigatórios é barrado e diz o que falta (${msg.slice(0, 90)}…)`);
    const n = await p.$$eval('.campo-falta', (x) => x.length);
    ok(n === 5, `os 5 campos que faltam ficam marcados em vermelho (${n})`);
    ok(await p.evaluate(() => document.activeElement?.dataset?.k === 'nome'), 'o cursor vai para o primeiro campo que falta');
    await p.fill('[data-k="nome"]', 'Casa Sem Dados'); await p.waitForTimeout(100);
    ok(!(await p.$eval('[data-k="nome"]', (e) => e.classList.contains('campo-falta'))), 'ao digitar, o campo sai do vermelho');
    await p.waitForTimeout(1800);
    ok(/Salvo automaticamente/.test(await p.textContent('#ferr')), 'o rascunho continua salvando sozinho');
    ok(!erros.length, 'sem erro JS ' + erros.join(' | '));
  } catch (e) { ok(false, 'erro no teste: ' + e.message); }
  finally { await b.close(); console.log(res.join('\n')); }
})();
