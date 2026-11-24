// Link do e-mail (18/11/2026): a casa convidada abria o link numa aba anônima e caía na página inicial, sem aviso.
// Link vencido ou já usado: abre direto o "Entrar" com a explicação. Conta que entrou pelo link sem senha: pede a senha.
const { chromium } = require('playwright');
const B = process.env.BASE || 'http://localhost:8790/'; const res = []; const ok = (c, m) => { res.push((c ? 'OK    ' : 'FALHA ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch(); const erros = [];
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route('**/config.js*', (r) => r.fulfill({ contentType: 'application/javascript', body: 'window.TQ_CONFIG = {}; window.TQ_INICIO_MODELO = "2000-01-01";' }));
  await ctx.addInitScript(() => { try { localStorage.setItem('tq-consentimento', 'tudo'); localStorage.setItem('tq-tutorial-publico', '1'); localStorage.setItem('tq-sem-trilha', '1'); localStorage.setItem('tq-dp-aberto', '1'); } catch {} });
  const p = await ctx.newPage(); p.on('pageerror', (e) => erros.push(e.message));
  try {
    await p.goto(B + '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
    await p.waitForSelector('#eerr', { timeout: 10000 }); await p.waitForTimeout(400);
    const t = await p.textContent('#eerr');
    ok(/já foi usado ou venceu/.test(t), 'link vencido abre o Entrar com a explicação (' + t.slice(0, 60) + ')');
    ok(!/error_code/.test(await p.evaluate(() => location.hash)), 'o erro sai do endereço');
    // Conta criada pelo link (sem senha): no primeiro acesso, pede a senha (antes só a equipe).
    await p.goto(B); await p.waitForSelector('.cidade'); await p.keyboard.press('Escape');
    await p.click('#entrar'); await p.click('[data-entrada="criar"]'); await p.waitForSelector('#enome');
    await p.click('label:has(input[name="tipoNovo"][value="casa"])'); await p.fill('#enome', 'Casa Link'); await p.fill('#email', 'casa@link.com'); await p.fill('#esenha', 'segredo123'); await p.press('#esenha', 'Enter');
    await p.waitForSelector('#side:not([hidden])', { timeout: 10000 });
    await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('tq-demo-v1')); const u = d.usuarios[d.sessao].perfil; u.senha_definida = false; u.tutorial_visto_em = null; localStorage.setItem('tq-demo-v1', JSON.stringify(d)); });
    await p.reload(); await p.waitForTimeout(1500);
    ok(await p.$('#ns1') !== null, 'casa que entrou pelo link sem senha recebe "Crie a sua senha"');
  } catch (e) { ok(false, 'quebrou: ' + e.message.split('\n')[0]); }
  ok(!erros.length, 'sem erro JS ' + erros.join(' | '));
  console.log(res.join('\n')); await b.close();
})();
