const { chromium } = require('playwright');
const HUB = require('fs').readFileSync(__dirname + '/dados/hub-demo.json', 'utf8');
const B = process.env.BASE || 'http://localhost:8790/'; const res = []; const ok = (c, m) => { res.push((c ? 'OK    ' : 'FALHA ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch(); const erros = [];
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  await ctx.route('**/config.js*', (r) => r.fulfill({ contentType: 'application/javascript', body: 'window.TQ_CONFIG = {}; window.TQ_INICIO_MODELO = "2000-01-01";' }));
  await ctx.addInitScript((h) => { try { localStorage.setItem('tq-sem-trilha', '1'); localStorage.setItem('tq-dp-aberto', '1'); localStorage.setItem('tq-demo-hub', h);
    if (!localStorage.getItem('tq-demo-v1')) localStorage.setItem('tq-demo-v1', JSON.stringify({ usuarios: {}, insc: {}, casas: {}, chk: [], reg: [], sessao: null, conv: { 'rooftap@teste.com': { email: 'rooftap@teste.com', tipo: 'casa', nome: 'Rooftap', vinculo_nome: 'Rooftap', aceito_em: '2026-10-20T10:00:00Z', criado_em: '2026-10-20T10:00:00Z' } } })); } catch {} }, HUB);
  const p = await ctx.newPage(); p.on('pageerror', (e) => erros.push(e.message)); p.on('dialog', (d) => d.accept());
  // Abre uma aba do menu ou, no portal da casa, a parte de uma das quatro áreas.
  const abrirAba = async (k) => { if (await p.$(`[data-aba="${k}"]`)) return p.click(`[data-aba="${k}"]`); const a = await p.evaluate((k) => window.TQConta?.areaDe?.(k), k); if (!a) throw new Error('aba inexistente ' + k); await p.click(`[data-aba="${a}"]`); await p.waitForTimeout(150); const sb = await p.$(`[data-sub="${a}|${k}"]`); if (sb) await sb.click(); await p.waitForTimeout(150); };
  const SUBS = ['cadastro_casa', 'equipe_casa', 'trilha', 'minha_funcao', 'materiais', 'roteiro', 'duvidas', 'agenda_casa', 'passos', 'minhas', 'campanha'];
  try {
    await p.goto(B); await p.waitForSelector('.cidade'); await p.keyboard.press('Escape');
    // casa nova (demo)
    await p.click('#entrar'); await p.click('[data-entrada="criar"]'); await p.waitForSelector('#enome');
    await p.click('label:has(input[name="tipoNovo"][value="casa"])'); await p.waitForTimeout(200);
    await p.fill('#enome', 'Rooftap Teste'); await p.fill('#email', 'rooftap@teste.com'); await p.fill('#esenha', 'segredo123'); await p.press('#esenha', 'Enter');
    // "Pular tutorial" (Esc só pausa: o tutorial voltaria depois do recarregar e cobriria a tela).
    await p.waitForSelector('[data-aba="datas_casa"]', { timeout: 8000 }); await p.click('[data-tour="pular"]').catch(() => {}); await p.waitForTimeout(200);
    await abrirAba('campanha'); await p.waitForSelector('details.camp-casa', { timeout: 5000 });
    ok(!(await p.$('details.camp-casa[open]')) && /0 de 10 dias feitos, \d+ atrasados?/.test(await p.innerText('details.camp-casa summary')), 'campanha começa fechada, só com o resumo (0 de 10 feitos, atrasados)');
    await p.click('details.camp-casa summary'); await p.waitForSelector('.camp-dia', { timeout: 3000 });
    ok((await p.$$('.camp-dia')).length === 10, 'casa abre e vê os 10 dias da campanha do Rooftap');
    ok(/0 de 10 dias feitos/.test(await p.innerText('#app')), 'progresso começa em 0 de 10');
    ok(/atrasado/i.test(await p.innerText('#app')), 'dias que já passaram aparecem como atrasados');
    ok(await p.$('.camp-dia a[href^="https://trnql.app"]') !== null, 'links das ações viram botões');
    await p.check('[data-camp-feito="i0"]'); await p.waitForTimeout(500);
    ok(/1 de 10 dias feitos/.test(await p.innerText('#app')) && /Marcado por você/.test(await p.innerText('#app')) && !!(await p.$('details.camp-casa[open]')), 'marcar Feito atualiza o progresso, mostra quem marcou e a campanha continua aberta');
    await p.reload(); await p.waitForSelector('details.camp-casa', { timeout: 8000 });
    ok(/1 de 10 dias feitos/.test(await p.innerText('#app')), 'Feito continua depois de recarregar');
    await p.click('details.camp-casa summary');
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-camp-ics="c1"]')]);
    const ics = require('fs').readFileSync(await dl.path(), 'utf8');
    ok(dl.suggestedFilename() === 'campanha-rooftap-nov26.ics' && (ics.match(/BEGIN:VEVENT/g) || []).length === 10 && /DTSTART;VALUE=DATE:20261020/.test(ics) && ics.split('\r\n').every((l) => Buffer.byteLength(l) <= 75), 'campanha baixa em .ics com os 10 dias (linhas dentro do limite)');
    // materiais e ciência
    // Casa não vê Materiais, Base nem Método (pedido da Marina, 17/11/2026): só o time.
    ok(!(await p.$('[data-aba="materiais"]')) && !(await p.$('[data-aba="base"]')) && !(await p.$('[data-aba="metodo"]')) && !(await p.evaluate(() => TQConta.areaDe('materiais'))), 'casa não vê Materiais, Base nem Método');
    await p.click('#sair'); await p.waitForTimeout(500);
    // equipe (demo): andamento e ciência
    await p.click('#entrar'); await p.waitForSelector('[data-demo="equipe"]'); await p.click('[data-demo="equipe"]'); await p.waitForTimeout(900); await p.keyboard.press('Escape');
    await p.evaluate((k) => { const a = TQConta.areaDe?.(k) || k; S.sub = S.sub || {}; if (a !== k) S.sub[a] = k; S.aba = a; render(); }, 'campanhas'); await p.waitForSelector('details.camp-casa', { timeout: 5000 });
    ok(/O que é seu aqui: acompanhar .*cobrar .*ajustar o dia/.test(await p.innerText('#app')), 'topo de Campanhas explica numa frase o papel: acompanhar, cobrar e ajustar');
    const linha = await p.innerText('details.camp-casa[data-camp="c1"] summary');
    ok(!(await p.$('details.camp-casa[open]')) && /Rooftap/.test(linha) && /1 de 10 dias feitos, \d+ atrasados?/.test(linha), `equipe vê o mesmo resumo da casa, fechado (${linha.replace(/\s+/g, ' ')})`);
    await p.click('details.camp-casa[data-camp="c1"] summary'); await p.waitForTimeout(300);
    ok((await p.$$('details[data-camp="c1"] .camp-dia')).length === 10 && !(await p.$('[data-camp-feito]')), 'equipe abre o dia a dia, com os mesmos 10 dias, sem a caixa "Feito" da casa');
    const atrasados = (await p.$$('details[data-camp="c1"] .camp-dia.atrasado')).length;
    ok(atrasados > 0 && (await p.$$('details[data-camp="c1"] .camp-dia.atrasado [data-camp-pela-casa]')).length === atrasados && (await p.$$('details[data-camp="c1"] .camp-dia.atrasado a[data-camp-cobrar]')).length === atrasados && !(await p.$('.camp-dia.feito [data-camp-pela-casa]')), 'cada dia atrasado tem "Cobrar a casa no WhatsApp" e "Marcar como feito pela casa"');
    const wa = decodeURIComponent(await p.getAttribute('.camp-dia.atrasado a[data-camp-cobrar]', 'href'));
    ok(/^https:\/\/wa\.me\//.test(wa) && /Rooftap/.test(wa) && /sem "Feito"/.test(wa) && /#\/campanha/.test(wa) && /WhatsApp do grupo|Feed|Stories|Instagram/.test(wa), 'mensagem de cobrança pronta: o que fazer no dia e o link da campanha');
    // Marcar como feito pela casa (com quem e quando)
    const dia1 = await p.getAttribute('.camp-dia.atrasado [data-camp-pela-casa]', 'data-camp-pela-casa');
    await p.click(`[data-camp-pela-casa="${dia1}"]`); await p.waitForSelector('#cpQuem'); await p.fill('#cpQuem', 'Joana do Instagram');
    await p.click(`[data-camp-pela-ok="${dia1}"]`); await p.waitForTimeout(600);
    ok(/2 de 10 dias feitos/.test(await p.innerText('details[data-camp="c1"] summary')) && /Feito pela casa \(Joana do Instagram\) em \d\d\/\d\d/.test(await p.innerText(`[data-camp-dia="${dia1}"]`)) && !!(await p.$('details[data-camp="c1"][open]')), 'feito pela casa: conta no resumo, mostra quem e quando, e a campanha continua aberta');
    // Ajustar o dia (texto)
    const dia2 = await p.getAttribute('.camp-dia.atrasado [data-camp-ajustar]', 'data-camp-ajustar');
    await p.click(`[data-camp-ajustar="${dia2}"]`); await p.waitForSelector('#cpDia'); await p.fill('[data-cp-texto="0"]', 'Texto ajustado pelo marketing');
    await p.click(`[data-camp-ajustar-ok="${dia2}"]`); await p.waitForTimeout(600);
    ok(/Texto ajustado pelo marketing/.test(await p.innerText(`[data-camp-dia="${dia2}"]`)), 'ajustar o dia troca o texto');
    // A casa vê o mesmo: feito pela casa (anotado pela equipe) e o texto ajustado.
    await p.click('#sair'); await p.waitForTimeout(400);
    await p.click('#entrar'); await p.waitForTimeout(200); await p.fill('#email', 'rooftap@teste.com'); await p.fill('#esenha', 'segredo123'); await p.click('#eok'); await p.waitForTimeout(800); await p.keyboard.press('Escape');
    await abrirAba('campanha'); await p.waitForSelector('details.camp-casa', { timeout: 5000 });
    ok(/2 de 10 dias feitos/.test(await p.innerText('details.camp-casa summary')), 'casa vê o "feito pela casa" que a equipe marcou (2 de 10)');
    await p.click('details.camp-casa summary'); await p.waitForTimeout(200);
    ok(/Marcado pela equipe do Tranquilo em [^·]+· Feito pela casa \(Joana do Instagram\)/.test(await p.innerText(`[data-camp-dia="${dia1}"]`)) && /Texto ajustado pelo marketing/.test(await p.innerText(`[data-camp-dia="${dia2}"]`)) && await p.isChecked(`[data-camp-feito="${dia1}"]`), 'casa vê quem marcou, a anotação e o dia ajustado');
    await p.click('#sair'); await p.waitForTimeout(400);
    await p.click('#entrar'); await p.waitForSelector('[data-demo="equipe"]'); await p.click('[data-demo="equipe"]'); await p.waitForTimeout(900); await p.keyboard.press('Escape');
    // Bruno (Marketing): "Para você" traz a campanha atrasada e o item abre direto o dia a dia dela.
    await p.evaluate(() => { S.conta.perfil.areas = ['marketing']; S.campAbertas = null; const a = TQConta.areaDe('hoje'); S.sub = S.sub || {}; S.sub[a] = 'hoje'; S.aba = a; render(); }); await p.waitForSelector('[data-abrir^="camp:"]', { timeout: 5000 });
    ok(/Cobrar campanha atrasada \(\d+\)/.test(await p.innerText('#app')) && /dias? atrasados?/.test(await p.innerText('[data-abrir^="camp:"]')), 'Para você (Marketing): "Cobrar campanha atrasada" com a casa e quantos dias');
    ok(await p.$eval('[data-abrir^="camp:"]', (x) => { const g = x.closest('.pend-grupo'); return !g || /^ev:/.test(g.querySelector('.pend-ev')?.dataset.abrir || ''); }), 'Para você (Marketing): campanha com data fica sob o cabeçalho do evento, que abre o detalhe da data (sem acesso a Contratos)');
    await p.click('[data-abrir^="camp:"]'); await p.waitForTimeout(400);
    ok((await p.$$('details[data-camp][open] .camp-dia')).length === 10, 'o item abre direto o dia a dia da campanha');
    await p.evaluate(() => { delete S.conta.perfil.areas; S.campAbertas = null; render(); });
    await abrirAba('materiais'); await p.waitForTimeout(800);
    ok(/Ciência da versão 2026-10-20: \d+ pessoa/.test(await p.innerText('#app')), 'matriz vê quantos confirmaram a leitura');
    // equipe carrega campanha nova (arquivo de dados) e atualiza a do Rooftap (página HTML)
    await p.evaluate((k) => { const a = TQConta.areaDe?.(k) || k; S.sub = S.sub || {}; if (a !== k) S.sub[a] = k; S.aba = a; render(); }, 'campanhas'); await p.waitForSelector('#cfArq', { state: 'attached', timeout: 5000 });
    const cob = await p.innerText('table[data-tbl="cobcasas"]');
    ok(/Rooftap/.test(cob) && /2\/10/.test(cob) && /leve|completa|sem agenda/.test(cob) && /\b1\b/.test(cob), `casas no hub: Rooftap com pessoa, formato e campanha (${cob.replace(/\s+/g, ' ').slice(0, 120)})`);
    await p.click('details:has(#cfArq) summary'); await p.setInputFiles('#cfArq', __dirname + '/dados/casa-nova.json'); await p.waitForTimeout(400);
    ok(/2 dias e 3 ações lidos de casa-nova.json/.test(await p.innerText('#app')) && (await p.inputValue('#cfCasa')) === 'Casa Nova' && /casa-nova-2026-11/.test(await p.inputValue('#cfSlug')), 'arquivo de dados: prévia com dias, ações, casa e identificador');
    await p.click('[data-camp-importar]'); await p.waitForTimeout(600);
    ok(/Casa Nova[\s\S]*0 de 2 dias feitos/.test(await p.innerText('.camp-lista')), 'campanha nova aparece nas campanhas (0 de 2)');
    if (!(await p.isVisible('#cfArq'))) await p.click('details:has(#cfArq) summary');
    await p.setInputFiles('#cfArq', __dirname + '/dados/rooftap-v2.html'); await p.waitForTimeout(400);
    await p.fill('#cfCasa', 'Rooftap'); await p.fill('#cfSlug', 'rooftap-nov26'); await p.dispatchEvent('#cfSlug', 'input'); await p.waitForTimeout(100);
    ok(/9 dias e 24 ações/.test(await p.innerText('#app')), 'página HTML: prévia da versão nova (9 dias, 24 ações)');
    await p.check('#cfCie'); await p.click('[data-camp-importar]'); await p.waitForTimeout(600);
    ok(/✓ Feito: Campanha de Rooftap carregada: 9 dias/.test(await p.textContent('#camperr')), 'carregar a campanha termina com "✓ Feito" na tela (sem alert)');
    const and = await p.innerText('details[data-camp="c1"] summary');
    ok(/Rooftap[\s\S]*2 de 9 dias feitos/.test(and), `reimportar: dia retirado sai e o feito continua (${and.replace(/\s+/g, ' ').slice(0, 140)})`);
    await abrirAba('materiais'); await p.waitForTimeout(500);
    ok(/A campanha do Rooftap/.test(await p.innerText('#app')) && /Ciência da versão [0-9-]+ [0-9:]+: 0 pessoas/.test(await p.innerText('#app')), 'campanha atualizada pede "Li e estou ciente" em Materiais');
    // equipe publica nova versão pedindo ciência de novo, e cadastra material novo
    await p.click('details:has([data-mat-versao]) summary'); await p.selectOption('#mvMat', 'm1'); await p.fill('#mvVer', '2'); await p.fill('#mvRes', 'novo tripé');
    await p.click('[data-mat-versao]'); await p.click('[data-conf-sim]'); await p.waitForTimeout(400);
    ok(/Já existe|Dê um nome/.test(await p.innerText('#materr')) === false && /versão 2 · novo tripé/.test(await p.innerText('#app')) && !/Ciência da versão 2:/.test(await p.innerText('#app')), 'versão sem pedir ciência não gera pendência');
    await p.click('details:has([data-mat-versao]) summary').catch(() => {}); if (!(await p.isVisible('#mvVer'))) await p.click('details:has([data-mat-versao]) summary');
    await p.selectOption('#mvMat', 'm1'); await p.fill('#mvVer', '2'); await p.click('[data-mat-versao]'); await p.click('[data-conf-sim]'); await p.waitForTimeout(300);
    ok(/Já existe uma versão/.test(await p.innerText('#materr')), 'versão repetida é recusada com mensagem clara');
    await p.fill('#mvVer', '3'); await p.check('#mvCie'); await p.click('[data-mat-versao]'); await p.click('[data-conf-sim]'); await p.waitForTimeout(400);
    ok(/Ciência da versão 3: 0 pessoas/.test(await p.innerText('#app')), 'versão que muda o que a casa faz pede ciência de novo');
    if (!(await p.isVisible('#mnTit'))) await p.click('details:has([data-mat-novo]) summary');
    await p.fill('#mnTit', 'Função da fotografia'); await p.fill('#mnUrl', 'http://inseguro'); await p.click('[data-mat-novo]'); await p.waitForTimeout(200);
    ok(/https/.test(await p.innerText('#materr')), 'link sem https é recusado');
    await p.fill('#mnUrl', 'https://docs.google.com/document/d/1ZyXwVuTsRqPoNmLkJiHgFeDcBa98765/edit'); await p.check('#mnCie'); await p.click('[data-mat-novo]'); await p.waitForTimeout(400);
    ok(/Função da fotografia/.test(await p.innerText('#app')) && /Ciência da versão 1: 0 pessoas/.test(await p.innerText('#app')), 'material novo aparece com ciência pedida');
  } catch (e) { ok(false, 'quebrou: ' + e.message.split('\n')[0]); }
  ok(erros.length === 0, 'sem exceções JS ' + erros.slice(0, 2).join(' | '));
  console.log(res.join('\n')); await b.close();
})();
