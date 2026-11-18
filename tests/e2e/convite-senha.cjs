// Convite e senha no primeiro acesso (pedido da Marina, 18/11/2026).
// 1. Depois de "Enviar convite", "Reenviar convite" e "Enviar link de senha": no topo, "✓ Convite enviado/criado para <e-mail>"
//    e o que a pessoa vai receber; embaixo, Reenviar o e-mail, WhatsApp, Copiar, Fechar; a mensagem fica recolhida.
// 2. A casa convidada abriu o link do e-mail e entrou sem criar senha: a conta do link nasce com uma senha aleatória do
//    Supabase (senha_definida = true). Quem veio pelo link e nunca salvou senha no portal vê a TELA "Crie a sua senha"
//    antes do tutorial; só segue depois de salvar (ou "fazer depois").
const { chromium } = require('playwright');
const B = process.env.BASE || 'http://localhost:8790/'; const res = []; const ok = (c, m) => { res.push((c ? 'OK    ' : 'FALHA ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch(); const erros = [];
  const novoCtx = async () => {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.route('**/config.js*', (r) => r.fulfill({ contentType: 'application/javascript', body: 'window.TQ_CONFIG = {};' }));
    await ctx.addInitScript(() => { try { localStorage.setItem('tq-consentimento', 'tudo'); localStorage.setItem('tq-tutorial-publico', '1'); localStorage.setItem('tq-sem-trilha', '1'); } catch {} });
    const p = await ctx.newPage(); p.on('pageerror', (e) => erros.push(e.message)); p.on('dialog', (d) => d.accept());
    return p;
  };
  // Conta criada como se fosse pelo link: senha_definida true (senha aleatória do Supabase), sem senha salva no portal.
  const contaDoLink = async (p, tipo, nome, email) => {
    await p.goto(B); await p.waitForSelector('.cidade'); await p.keyboard.press('Escape');
    await p.click('#entrar'); await p.click('[data-entrada="criar"]'); await p.waitForSelector('#enome');
    await p.click(`label:has(input[name="tipoNovo"][value="${tipo}"])`); await p.fill('#enome', nome); await p.fill('#email', email); await p.fill('#esenha', 'segredo123'); await p.press('#esenha', 'Enter');
    await p.waitForSelector('#side:not([hidden])', { timeout: 10000 });
    await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('tq-demo-v1')); const u = d.usuarios[d.sessao].perfil; u.senha_definida = true; u.senha_portal = false; u.tutorial_visto_em = null; localStorage.setItem('tq-demo-v1', JSON.stringify(d)); });
    await p.goto('about:blank'); await p.goto(B + '#access_token=demo-nao-e-token&expires_in=3600&token_type=bearer&type=magiclink');
    await p.waitForSelector('#side:not([hidden])', { timeout: 15000 }); await p.waitForTimeout(800);
  };
  try {
    // ---------- 1. diálogo depois de enviar ----------
    const p = await novoCtx();
    await p.goto(B); await p.waitForSelector('.cidade'); await p.keyboard.press('Escape');
    await p.click('#entrar'); await p.click('[data-demo="adm"]'); await p.waitForSelector('#side:not([hidden])');
    await p.waitForTimeout(500); if (await p.$('[data-tour="pular"]')) await p.click('[data-tour="pular"]');
    await p.click('[data-aba="convites"]'); await p.waitForSelector('#cvOk');
    if (await p.$('#cvTipo')) { await p.selectOption('#cvTipo', 'casa'); await p.waitForTimeout(200); }
    await p.fill('#cvNome', 'Casa Convite Teste'); await p.fill('#cvEmail', 'casa.convite@teste.com'); await p.fill('#cvWa', '31 98888-7777'); await p.click('#cvOk');
    await p.waitForSelector('#dlg[open] .envio-ok');
    const topo = await p.textContent('#dlg .envio-ok');
    ok(/✓ Convite (enviado|criado) para casa\.convite@teste\.com/.test(topo), 'convite: topo diz "✓ Convite … para <e-mail>" (' + topo.trim() + ')');
    const dlg = await p.innerText('#dlgIn');
    ok(/O que a pessoa vai receber/.test(dlg) && /criar a senha/.test(dlg), 'convite: explica o que a pessoa vai receber');
    const botoes = await p.$$eval('#dlgIn .barra-acoes > *', (xs) => xs.map((x) => x.textContent.trim()));
    ok(botoes[0] === 'Reenviar o e-mail' && /^Mandar também pelo WhatsApp/.test(botoes[1]) && botoes[2] === 'Copiar mensagem' && botoes[3] === 'Fechar', 'convite: ações embaixo, nesta ordem (' + botoes.join(' | ') + ')');
    ok(!(await p.isVisible('#envTxt')) && await p.$eval('#dlgIn details', (d) => !d.open), 'convite: a mensagem pronta fica recolhida em "Ver a mensagem"');
    await p.click('#dlgIn summary'); ok(await p.isVisible('#envTxt') && /#criar&email=/.test(await p.inputValue('#envTxt')), 'convite: "Ver a mensagem" mostra a mensagem com o link');
    ok((await p.getAttribute('#dlgIn .barra-acoes [data-envio]', 'href')).startsWith('https://wa.me/5531988887777'), 'convite: WhatsApp vai para o número da pessoa');
    await p.click('#envReenviar'); await p.waitForTimeout(500);
    ok(await p.isVisible('#dlg[open] .envio-ok'), 'convite: "Reenviar o e-mail" mantém a janela com o resultado');
    await p.click('#dlg button:has-text("Fechar")'); ok(!(await p.isVisible('#dlg[open]')), 'convite: "Fechar" fecha');
    // Reenviar convite (lista de convites)
    await p.click('[data-reconvidar="casa.convite@teste.com"]'); await p.waitForSelector('#dlg[open] .envio-ok');
    ok(/✓ Convite (enviado|criado) para casa\.convite@teste\.com/.test(await p.textContent('#dlg .envio-ok')) && !!(await p.$('#envReenviar')), '"Reenviar convite": mesma janela clara');
    await p.click('#dlg button:has-text("Fechar")');
    // Enviar link de senha (Pessoas)
    await p.evaluate(() => { const g = TQConta.areaDe?.('pessoas'); if (g) { S.sub = S.sub || {}; S.sub[g] = 'pessoas'; S.aba = g; } else S.aba = 'pessoas'; render(); }); await p.waitForSelector('[data-link-senha]');
    const em = await p.getAttribute('[data-link-senha]', 'data-link-senha');
    await p.click('[data-link-senha]'); await p.waitForSelector('#dlg[open] .envio-ok');
    ok(new RegExp('✓ Link de senha (enviado|criado) para ' + em.replace(/[.+]/g, '\\$&')).test(await p.textContent('#dlg .envio-ok')) && /senha nova/.test(await p.innerText('#dlgIn')), '"Enviar link de senha": topo claro e o que a pessoa recebe');
    await p.click('#dlg button:has-text("Fechar")');
    await p.context().close();

    // ---------- 2. casa que entrou pelo link: tela de senha antes do tutorial ----------
    const c = await novoCtx();
    await contaDoLink(c, 'casa', 'Casa Link Teste', 'casa.link@teste.com');
    ok(await c.isVisible('.tela-senha') && /Crie a sua senha para entrar das próximas vezes/.test(await c.textContent('#app')), 'casa do link (senha_definida true, sem senha salva): TELA "Crie a sua senha"');
    ok(await c.$('.tour') === null, 'casa do link: o tutorial espera a senha');
    ok(await c.evaluate(() => sessionStorage.getItem('tq-veio-link')) === 'magiclink' && !/access_token/.test(await c.evaluate(() => location.hash)), 'o link do e-mail fica guardado na aba e o token sai do endereço');
    const aba = await c.$('#tabs [data-aba]'); if (aba) { await aba.click(); await c.waitForTimeout(200); }
    ok(await c.isVisible('.tela-senha'), 'casa do link: trocar de aba não pula a tela de senha');
    await c.fill('#ns1', 'curta'); await c.click('#nsok'); ok(/8 caracteres/.test(await c.textContent('#nserr')), 'senha curta: explica');
    await c.fill('#ns1', 'senha-nova-1'); await c.fill('#ns2', 'senha-nova-1'); await c.press('#ns2', 'Enter');
    await c.waitForTimeout(1800);
    ok(await c.$('.tela-senha') === null && await c.$('.tour') !== null, 'depois de salvar, segue para o tutorial');
    ok(await c.evaluate(() => { const d = JSON.parse(localStorage.getItem('tq-demo-v1')); const u = d.usuarios[d.sessao]; return u.senha === 'senha-nova-1' && u.perfil.senha_portal === true; }), 'a senha nova fica salva na conta');
    await c.reload(); await c.waitForTimeout(1200); ok(await c.$('.tela-senha') === null, 'depois de salvar, não pede de novo');
    await c.context().close();

    // ---------- artista do link: "fazer depois" ----------
    const a = await novoCtx();
    await contaDoLink(a, 'artista', 'Artista Link Teste', 'artista.link@teste.com');
    ok(await a.isVisible('.tela-senha'), 'artista do link: tela de senha também');
    await a.click('#nsdepois'); await a.waitForTimeout(500);
    ok(await a.$('.tela-senha') === null && await a.$('.tour') !== null, 'artista: "fazer depois" segue para o tutorial');
    await a.reload(); await a.waitForTimeout(1200); ok(await a.$('.tela-senha') === null, 'artista: "fazer depois" vale na aba (não insiste a cada recarga)');
    await a.context().close();

    // ---------- equipe com senha_definida false (sem link na aba): também vê a tela ----------
    const e = await novoCtx();
    await e.goto(B); await e.waitForSelector('.cidade'); await e.keyboard.press('Escape');
    await e.click('#entrar'); await e.click('[data-demo="equipe"]'); await e.waitForSelector('#side:not([hidden])');
    await e.evaluate(() => { const d = JSON.parse(localStorage.getItem('tq-demo-v1')); const u = d.usuarios[d.sessao].perfil; u.senha_definida = false; localStorage.setItem('tq-demo-v1', JSON.stringify(d)); });
    await e.reload(); await e.waitForTimeout(1500);
    ok(await e.isVisible('.tela-senha'), 'equipe com senha_definida false: tela de senha');
    await e.context().close();
  } catch (e) { ok(false, 'quebrou: ' + e.message.split('\n')[0]); }
  ok(!erros.length, 'sem erro JS ' + erros.join(' | '));
  console.log(res.join('\n')); await b.close();
})();
