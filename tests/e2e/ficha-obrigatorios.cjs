// Ficha da casa: "Enviar" fica desabilitado sem os campos obrigatórios (diz o que falta, com link para o campo); o rascunho continua salvo.
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
    await p.waitForTimeout(200);
    // Enviar fica desabilitado enquanto faltar obrigatório (pedido da Marina, 18/11/2026) e diz o que falta, com link.
    const msg = await p.textContent('#faltaEnviar');
    ok(await p.isDisabled('#enviar') && /Para enviar, faltam/.test(msg) && /Nome da casa/.test(msg) && !/Cidade\/UF/.test(msg), `Enviar sem obrigatórios fica desabilitado e diz o que falta (${msg.slice(0, 90)}…)`);
    await p.click('#faltaEnviar a[data-ir-campo="nome"]'); await p.waitForTimeout(200);
    ok(await p.evaluate(() => document.activeElement?.dataset?.k === 'nome') && await p.$eval('[data-k="nome"]', (e) => e.classList.contains('campo-falta')), 'o link leva o cursor ao campo que falta e marca em vermelho');
    await p.fill('[data-k="nome"]', 'Casa Sem Dados'); await p.waitForTimeout(100);
    ok(!(await p.$eval('[data-k="nome"]', (e) => e.classList.contains('campo-falta'))), 'ao digitar, o campo sai do vermelho');
    await p.waitForTimeout(1800);
    ok(/Salvo automaticamente/.test(await p.textContent('#ferr')), 'o rascunho continua salvando sozinho');
    ok(!erros.length, 'sem erro JS ' + erros.join(' | '));
  } catch (e) { ok(false, 'erro no teste: ' + e.message); }
  finally { await b.close(); console.log(res.join('\n')); }
})();
