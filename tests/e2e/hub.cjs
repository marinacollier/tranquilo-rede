const { chromium } = require('playwright');
const HUB = require('fs').readFileSync(__dirname + '/dados/hub-demo.json', 'utf8');
const B = process.env.BASE || 'http://localhost:8790/'; const res = []; const ok = (c, m) => { res.push((c ? 'OK    ' : 'FALHA ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch(); const erros = [];
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  await ctx.route('**/config.js', (r) => r.fulfill({ contentType: 'application/javascript', body: 'window.TQ_CONFIG = {};' }));
  await ctx.addInitScript((h) => { try { localStorage.setItem('tq-demo-hub', h);
    if (!localStorage.getItem('tq-demo-v1')) localStorage.setItem('tq-demo-v1', JSON.stringify({ usuarios: {}, insc: {}, casas: {}, chk: [], reg: [], sessao: null, conv: { 'rooftap@teste.com': { email: 'rooftap@teste.com', tipo: 'casa', nome: 'Rooftap', vinculo_nome: 'Rooftap', aceito_em: '2026-10-20T10:00:00Z', criado_em: '2026-10-20T10:00:00Z' } } })); } catch {} }, HUB);
  const p = await ctx.newPage(); p.on('pageerror', (e) => erros.push(e.message)); p.on('dialog', (d) => d.accept());
  try {
    await p.goto(B); await p.waitForSelector('.cidade'); await p.keyboard.press('Escape');
    // casa nova (demo)
    await p.click('#entrar'); await p.click('[data-entrada="criar"]'); await p.waitForSelector('#enome');
    await p.click('label:has(input[name="tipoNovo"][value="casa"])'); await p.waitForTimeout(200);
    await p.fill('#enome', 'Rooftap Teste'); await p.fill('#email', 'rooftap@teste.com'); await p.fill('#esenha', 'segredo123'); await p.press('#esenha', 'Enter');
    // "Pular tutorial" (Esc só pausa: o tutorial voltaria depois do recarregar e cobriria a tela).
    await p.waitForSelector('[data-aba="campanha"]', { timeout: 8000 }); await p.click('[data-tour="pular"]').catch(() => {}); await p.waitForTimeout(200);
    await p.click('[data-aba="campanha"]'); await p.waitForSelector('.camp-dia', { timeout: 5000 });
    ok((await p.$$('.camp-dia')).length === 10, 'casa vê os 10 dias da campanha do Rooftap');
    ok(/0 de 10 dias feitos/.test(await p.innerText('#app')), 'progresso começa em 0 de 10');
    ok(/atrasado/i.test(await p.innerText('#app')), 'dias que já passaram aparecem como atrasados');
    ok(await p.$('.camp-dia a[href^="https://trnql.app"]') !== null, 'links das ações viram botões');
    await p.check('[data-camp-feito="i0"]'); await p.waitForTimeout(500);
    ok(/1 de 10 dias feitos/.test(await p.innerText('#app')) && /Marcado por você/.test(await p.innerText('#app')), 'marcar Feito atualiza o progresso e mostra quem marcou');
    await p.reload(); await p.waitForSelector('.camp-dia', { timeout: 8000 });
    ok(/1 de 10 dias feitos/.test(await p.innerText('#app')), 'Feito continua depois de recarregar');
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-camp-ics="c1"]')]);
    const ics = require('fs').readFileSync(await dl.path(), 'utf8');
    ok(dl.suggestedFilename() === 'campanha-rooftap-nov26.ics' && (ics.match(/BEGIN:VEVENT/g) || []).length === 10 && /DTSTART;VALUE=DATE:20261020/.test(ics) && ics.split('\r\n').every((l) => Buffer.byteLength(l) <= 75), 'campanha baixa em .ics com os 10 dias (linhas dentro do limite)');
    // materiais e ciência
    await p.click('[data-aba="materiais"]'); await p.waitForSelector('[data-ciencia]', { timeout: 5000 });
    ok(/1 material pede sua confirmação/.test(await p.innerText('#app')), 'aviso de material pendente de leitura');
    await p.click('[data-ciencia="v1"]'); await p.waitForTimeout(500);
    ok(/Você confirmou a leitura da versão 2026-10-20/.test(await p.innerText('#app')) && !(await p.$('[data-ciencia]')), '"Li e estou ciente" registra e some o botão');
    ok(await p.$('a[href="https://exemplo.com/apresenta"]') !== null, 'material sem ciência só tem o botão Abrir');
    ok(await p.$('a[href="https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/copy"]') !== null, 'Google Docs ganha "Fazer minha cópia" (/copy)');
    ok(!(await p.$('[data-mat-versao]')), 'casa não vê o formulário de publicar');
    await p.click('#sair'); await p.waitForTimeout(500);
    // equipe (demo): andamento e ciência
    await p.click('#entrar'); await p.waitForSelector('[data-demo="equipe"]'); await p.click('[data-demo="equipe"]'); await p.waitForTimeout(900); await p.keyboard.press('Escape');
    await p.click('[data-aba="campanhas"]'); await p.waitForSelector('table[data-tbl="andcamp"] tbody tr', { timeout: 5000 });
    const linha = await p.innerText('table[data-tbl="andcamp"] tbody tr');
    ok(/Rooftap/.test(linha) && /1\/10/.test(linha), `matriz vê o andamento (${linha.replace(/\s+/g, ' ')})`);
    await p.click('table[data-tbl="andcamp"] tbody tr'); await p.waitForTimeout(400);
    ok((await p.$$('.camp-dia')).length === 10 && !(await p.$('[data-camp-feito]')), 'matriz abre o dia a dia, sem poder marcar');
    await p.click('[data-aba="materiais"]'); await p.waitForTimeout(800);
    ok(/Ciência da versão 2026-10-20:<\/b>|Ciência da versão 2026-10-20: 1 pessoa/.test(await p.innerText('#app')), 'matriz vê quantos confirmaram a leitura');
    // equipe carrega campanha nova (arquivo de dados) e atualiza a do Rooftap (página HTML)
    await p.click('[data-aba="campanhas"]'); await p.waitForSelector('#cfArq', { state: 'attached', timeout: 5000 });
    const cob = await p.innerText('table[data-tbl="cobcasas"]');
    ok(/Rooftap/.test(cob) && /1\/10/.test(cob) && /leve/.test(cob) && /\b1\b/.test(cob), `casas no hub: Rooftap com pessoa, formato e campanha (${cob.replace(/\s+/g, ' ').slice(0, 120)})`);
    await p.click('details:has(#cfArq) summary'); await p.setInputFiles('#cfArq', __dirname + '/dados/casa-nova.json'); await p.waitForTimeout(400);
    ok(/2 dias e 3 ações lidos de casa-nova.json/.test(await p.innerText('#app')) && (await p.inputValue('#cfCasa')) === 'Casa Nova' && /casa-nova-2026-11/.test(await p.inputValue('#cfSlug')), 'arquivo de dados: prévia com dias, ações, casa e identificador');
    await p.click('[data-camp-importar]'); await p.waitForTimeout(600);
    ok(/Casa Nova/.test(await p.innerText('table[data-tbl="andcamp"]')) && /0\/2/.test(await p.innerText('table[data-tbl="andcamp"]')), 'campanha nova aparece no andamento (0/2)');
    if (!(await p.isVisible('#cfArq'))) await p.click('details:has(#cfArq) summary');
    await p.setInputFiles('#cfArq', __dirname + '/dados/rooftap-v2.html'); await p.waitForTimeout(400);
    await p.fill('#cfCasa', 'Rooftap'); await p.fill('#cfSlug', 'rooftap-nov26'); await p.dispatchEvent('#cfSlug', 'input'); await p.waitForTimeout(100);
    ok(/9 dias e 24 ações/.test(await p.innerText('#app')), 'página HTML: prévia da versão nova (9 dias, 24 ações)');
    await p.check('#cfCie'); await p.click('[data-camp-importar]'); await p.waitForTimeout(600);
    const and = await p.innerText('table[data-tbl="andcamp"]');
    ok(/Rooftap[\s\S]*1\/9/.test(and), `reimportar: dia retirado sai e o feito continua (${and.replace(/\s+/g, ' ').slice(0, 140)})`);
    await p.click('[data-aba="materiais"]'); await p.waitForTimeout(500);
    ok(/A campanha do Rooftap/.test(await p.innerText('#app')) && /Ciência da versão [0-9-]+ [0-9:]+: 0 pessoas/.test(await p.innerText('#app')), 'campanha atualizada pede "Li e estou ciente" em Materiais');
    // equipe publica nova versão pedindo ciência de novo, e cadastra material novo
    await p.click('details:has([data-mat-versao]) summary'); await p.selectOption('#mvMat', 'm1'); await p.fill('#mvVer', '2'); await p.fill('#mvRes', 'novo tripé');
    await p.click('[data-mat-versao]'); await p.waitForTimeout(400);
    ok(/Já existe|Dê um nome/.test(await p.innerText('#materr')) === false && /versão 2 · novo tripé/.test(await p.innerText('#app')) && !/Ciência da versão 2:/.test(await p.innerText('#app')), 'versão sem pedir ciência não gera pendência');
    await p.click('details:has([data-mat-versao]) summary').catch(() => {}); if (!(await p.isVisible('#mvVer'))) await p.click('details:has([data-mat-versao]) summary');
    await p.selectOption('#mvMat', 'm1'); await p.fill('#mvVer', '2'); await p.click('[data-mat-versao]'); await p.waitForTimeout(300);
    ok(/Já existe uma versão/.test(await p.innerText('#materr')), 'versão repetida é recusada com mensagem clara');
    await p.fill('#mvVer', '3'); await p.check('#mvCie'); await p.click('[data-mat-versao]'); await p.waitForTimeout(400);
    ok(/Ciência da versão 3: 0 pessoas/.test(await p.innerText('#app')), 'versão que muda o que a casa faz pede ciência de novo');
    if (!(await p.isVisible('#mnTit'))) await p.click('details:has([data-mat-novo]) summary');
    await p.fill('#mnTit', 'Função da fotografia'); await p.fill('#mnUrl', 'http://inseguro'); await p.click('[data-mat-novo]'); await p.waitForTimeout(200);
    ok(/https/.test(await p.innerText('#materr')), 'link sem https é recusado');
    await p.fill('#mnUrl', 'https://docs.google.com/document/d/1ZyXwVuTsRqPoNmLkJiHgFeDcBa98765/edit'); await p.check('#mnCie'); await p.click('[data-mat-novo]'); await p.waitForTimeout(400);
    ok(/Função da fotografia/.test(await p.innerText('#app')) && /Ciência da versão 1: 0 pessoas/.test(await p.innerText('#app')), 'material novo aparece com ciência pedida');
    await p.click('#sair'); await p.waitForTimeout(500);
    await p.click('#entrar'); await p.waitForTimeout(300); if (await p.isVisible('[data-entrada="entrar"]')) await p.click('[data-entrada="entrar"]'); await p.waitForSelector('#email'); await p.fill('#email', 'rooftap@teste.com'); await p.fill('#esenha', 'segredo123'); await p.press('#esenha', 'Enter');
    await p.waitForSelector('[data-aba="materiais"]', { timeout: 8000 }); await p.keyboard.press('Escape'); await p.waitForTimeout(200);
    await p.click('[data-aba="materiais"]'); await p.waitForSelector('[data-ciencia]', { timeout: 5000 });
    ok(/4 materiais pedem sua confirmação/.test(await p.innerText('#app')), `casa volta a ter pendência: nova versão + material novo (${(await p.innerText('.alert.warn')).slice(0, 60)})`);
  } catch (e) { ok(false, 'quebrou: ' + e.message.split('\n')[0]); }
  ok(erros.length === 0, 'sem exceções JS ' + erros.slice(0, 2).join(' | '));
  console.log(res.join('\n')); await b.close();
})();
