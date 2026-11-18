// Contrato automático, no modo demonstração: equipe cadastra o modelo e envia; a artista preenche, lê até o fim e assina.
const { chromium } = require('playwright');
const B = process.env.BASE || 'http://localhost:8790/'; const res = []; const ok = (c, m) => { res.push((c ? 'OK    ' : 'FALHA ') + m); if (!c) process.exitCode = 1; };
const MODELO = `CONTRATO DE APRESENTAÇÃO ARTÍSTICA

Contratada: {{artista}}, CPF [PREENCHER CPF], residente em [PREENCHER ENDEREÇO COMPLETO].
Apresentação em {{data}}, cidade de {{cidade}}. Cachê: R$ {{cache}}, pago por Pix na chave [PREENCHER CHAVE PIX] em até 20 dias.
${'Cláusula de exemplo, para o texto ficar longo e precisar rolar até o fim. '.repeat(60)}
E por estarem de acordo, assinam.`;
(async () => {
  const b = await chromium.launch(); const erros = [];
  const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } });
  await ctx.route('**/config.js*', (r) => r.fulfill({ contentType: 'application/javascript', body: 'window.TQ_CONFIG = {};' }));
  await ctx.addInitScript(() => { try { localStorage.setItem('tq-consentimento', 'tudo'); localStorage.setItem('tq-sem-trilha', '1'); localStorage.setItem('tq-dp-aberto', '1'); localStorage.setItem('tq-tutorial-publico', '1'); } catch {} });
  const p = await ctx.newPage(); p.on('pageerror', (e) => erros.push(e.message)); const dialogos = []; p.on('dialog', (d) => { dialogos.push(d.message()); d.accept(); });
  // Pula o tutorial (com um passo só não há "Pular": "Concluir" encerra).
  const pular = async () => { try { await p.waitForSelector('.tour-caixa', { timeout: 4000 }); await p.click((await p.$('[data-tour="pular"]')) ? '[data-tour="pular"]' : '[data-tour="avancar"]'); } catch {} };
  const sair = async () => { await p.click('#sair'); await p.waitForTimeout(300); };
  let evPrimeiro = '';
  try {
    await p.goto(B); await p.waitForSelector('.cidade');
    // artista nova
    await p.click('#entrar'); await p.click('[data-entrada="criar"]'); await p.waitForSelector('#enome');
    await p.click('label:has(input[name="tipoNovo"][value="artista"])'); await p.fill('#enome', 'Ana Contrato'); await p.fill('#email', 'ana@contrato.com'); await p.fill('#esenha', 'segredo123'); await p.press('#esenha', 'Enter');
    await pular(); await sair();
    // equipe: modelo e envio
    await p.click('#entrar'); await p.click('[data-demo="equipe"]'); await pular();
    await p.evaluate((k) => { const a = TQConta.areaDe?.(k) || k; S.sub = S.sub || {}; if (a !== k) S.sub[a] = k; S.aba = a; render(); }, 'documentos'); await p.waitForSelector('#contrAuto');
    {
      // Datas próximas sem contrato: "Preparar contrato" já escolhe a data.
      const pre = await p.$('[data-ct-pre]');
      if (pre) { const ev = (await pre.getAttribute('data-ct-pre')).split('|')[0]; evPrimeiro = ev; await pre.click(); await p.waitForTimeout(200);
        ok(await p.inputValue('#ctEv') === ev && /sem contrato/.test(await p.textContent('#app')), 'lista de datas sem contrato e "Preparar contrato" já escolhe a data'); }
      else ok(false, 'lista de datas sem contrato não apareceu');
    }
    await p.click('#contrAuto details:has(#mcNome) summary'); await p.fill('#mcNome', 'Apresenta artista'); await p.fill('#mcTexto', MODELO); await p.click('#mcOk');
    await p.waitForSelector('[data-ct-mod-editar]');
    ok(/Apresenta artista.*7 campos/s.test(await p.textContent('#contrAuto')), 'modelo salvo: [PREENCHER …] e {{…}} viram 7 campos');
    const conta = await p.$eval('#ctConta', (s) => [...s.options].find((o) => /Ana Contrato/.test(o.textContent))?.value);
    await p.selectOption('#ctConta', conta); await p.selectOption('#ctMod', { label: 'Apresenta artista' }); await p.click('#ctPrep');
    await p.waitForSelector('[data-ct-campo="cache"]');
    ok(await p.inputValue('[data-ct-campo="artista"]') === 'Ana Contrato' && await p.inputValue('[data-ct-campo="cpf"]') === '', 'preparar preenche o nome e deixa o CPF para a artista');
    await p.fill('[data-ct-campo="cache"]', '3.000,00'); await p.fill('[data-ct-campo="data"]', '05/11/2026'); await p.fill('[data-ct-campo="cidade"]', 'Belo Horizonte');
    await p.click('#ctEnviar'); await p.waitForSelector('[data-ct-ver]');
    ok(/Aguardando dados/.test(await p.textContent('#app')), 'contrato enviado aparece como "Aguardando dados"');
    await sair();
    // artista: preencher, ler e assinar
    // O formulário redesenha logo depois de sair: espera ele assentar antes de digitar.
    await p.click('#entrar'); await p.waitForSelector('#esenha'); await p.waitForTimeout(400);
    await p.fill('#email', 'ana@contrato.com'); await p.fill('#esenha', 'segredo123'); await p.click('#eok'); await pular();
    ok(/Contrato para assinar/.test(await p.textContent('#app')), 'artista vê o aviso do contrato no passo a passo');
    await p.click('[data-ct-abrir]'); await p.waitForSelector('#ctTexto', { state: 'attached' });
    ok(!(await p.isVisible('#ctTexto')) && /Ver o texto do contrato/.test(await p.textContent('#ctTextoBox summary')), 'texto do contrato vem recolhido em "Ver o texto do contrato"');
    await p.click('#ctTextoBox summary'); ok(await p.isVisible('#ctTexto'), 'abrir "Ver o texto do contrato" mostra o texto');
    ok(/R\$ 3\.000,00/.test(await p.textContent('#ctTexto')) && /________________/.test(await p.textContent('#ctTexto')), 'texto mostra o cachê da equipe e marca o que falta');
    ok(await p.isDisabled('[data-ct-ver]') && await p.isDisabled('[data-enviar-arquivo^="contrato_"]'), 'baixar e enviar ficam travados até salvar os dados');
    await p.fill('[data-ct-dado="cpf"]', '123.456.789-09'); await p.fill('[data-ct-dado="endereco_completo"]', 'Rua A, 10, Recife'); await p.fill('[data-ct-dado="chave_pix"]', 'ana@pix.com');
    await p.click('#ctSalvarDados'); await p.waitForSelector('#ctTexto', { state: 'attached' });
    if (process.env.SHOT2) { await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(200); await p.screenshot({ path: process.env.SHOT2, fullPage: true }); await p.setViewportSize({ width: 1280, height: 900 }); }
    ok(/123\.456\.789-09/.test(await p.textContent('#ctTexto')) && /✓ Feito/.test(await p.textContent('#ctDadosMsg')), 'dados salvos entram no texto, com ✓ Feito');
    ok(!(await p.isDisabled('[data-ct-ver]')) && !(await p.isDisabled('[data-enviar-arquivo^="contrato_"]')), 'com os dados salvos, libera baixar o PDF e enviar o assinado');
    ok(!(await p.$('#ctAssinar')), 'não assina dentro do portal: baixa, assina e envia');
    const [pop] = await Promise.all([ctx.waitForEvent('page'), p.click('[data-ct-ver]')]); await pop.waitForLoadState();
    ok(/Assinado pelo Tranquilo/.test(await pop.textContent('body')) && /123\.456\.789-09/.test(await pop.textContent('body')) && /Baixar em PDF/.test(await pop.textContent('body')), 'PDF sai com os dados da pessoa e a assinatura do Tranquilo');
    await pop.close(); await sair();
    // equipe vê o contrato aguardando o arquivo assinado
    await p.click('#entrar'); await p.click('[data-demo="equipe"]'); await pular(); await p.evaluate((k) => { const a = TQConta.areaDe?.(k) || k; S.sub = S.sub || {}; if (a !== k) S.sub[a] = k; S.aba = a; render(); }, 'documentos'); await p.waitForSelector('[data-ct-ver]');
    ok(/Aguardando assinatura/.test(await p.textContent('#app')), 'equipe vê o contrato aguardando a assinatura');
    // Segundo contrato para a mesma pessoa: a equipe é avisada da duplicata; a artista não digita os dados de novo.
    await p.selectOption('#ctConta', conta); await p.selectOption('#ctMod', { label: 'Apresenta artista' }); if (evPrimeiro) await p.selectOption('#ctEv', evPrimeiro); await p.click('#ctPrep');
    await p.waitForSelector('[data-ct-campo="cache"]'); await p.fill('[data-ct-campo="cache"]', '2.000,00'); await p.fill('[data-ct-campo="data"]', '12/12/2026'); await p.fill('[data-ct-campo="cidade"]', 'Recife');
    await p.click('#ctEnviar'); await p.waitForSelector('.conf-aqui');
    ok(/Já existe um contrato deste modelo para esta pessoa/.test(await p.textContent('.conf-aqui')), 'criar contrato repetido pede confirmação na própria página (evita duplicata por clique duplo ou reenvio)');
    await p.click('[data-conf-sim]'); await p.waitForTimeout(600);
    await sair();
    await p.click('#entrar'); await p.waitForSelector('#esenha'); await p.waitForTimeout(400);
    await p.fill('#email', 'ana@contrato.com'); await p.fill('#esenha', 'segredo123'); await p.click('#eok'); await pular();
    if (await p.$('[data-ct-voltar]')) { await p.click('[data-ct-voltar]'); await p.waitForTimeout(300); }
    await p.click('[data-ct-abrir]'); await p.waitForSelector('#ctTexto', { state: 'attached' });
    ok(await p.inputValue('[data-ct-dado="cpf"]') === '123.456.789-09' && await p.inputValue('[data-ct-dado="chave_pix"]') === 'ana@pix.com' && /Trouxemos o que você já informou/.test(await p.textContent('#app')), 'segundo contrato já vem com CPF, endereço e Pix do contrato anterior para conferir');
    await p.click('#ctSalvarDados'); await p.waitForSelector('#ctTexto', { state: 'attached' });
    ok(/123\.456\.789-09/.test(await p.textContent('#ctTexto')), 'ao salvar, os dados trazidos entram no texto');
    // Conferência (banco v28): a artista envia o assinado; a equipe pede de novo com o motivo; a artista reenvia; a equipe confirma.
    const pdf = { name: 'contrato-assinado.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 teste') };
    const ctId = (await p.getAttribute('[data-enviar-arquivo^="contrato_"]', 'data-enviar-arquivo')).slice(9);
    await p.setInputFiles('[data-enviar-arquivo^="contrato_"]', pdf); await p.waitForSelector('text=Contrato assinado enviado');
    ok(/vai conferir/.test(await p.textContent('#app')), 'artista envia o assinado e vê que a equipe vai conferir');
    await sair();
    await p.click('#entrar'); await p.click('[data-demo="equipe"]'); await pular(); await p.evaluate((k) => { const a = TQConta.areaDe?.(k) || k; S.sub = S.sub || {}; if (a !== k) S.sub[a] = k; S.aba = a; render(); }, 'documentos'); await p.waitForSelector(`[data-ct-conferir="${ctId}"]`);
    // "Para você" (Isa, Agenda): o contrato assinado aparece primeiro e o item abre direto a linha com "Conferir e confirmar".
    await p.evaluate(() => { S.conta.perfil.areas = ['agenda']; const a = TQConta.areaDe('hoje'); S.sub = S.sub || {}; S.sub[a] = 'hoje'; S.aba = a; render(); }); await p.waitForSelector('[data-abrir^="ct:"]');
    const vale = await p.textContent('#app');
    ok(/Vale olhar primeiro/.test(vale) && /Conferir contrato assinado \(1\)/.test(vale) && /Ana Contrato/.test(await p.textContent(`[data-abrir="ct:${ctId}"]`)), 'Para você (Agenda): bloco "Conferir contrato assinado" com a linha de quem assinou');
    // Com o pacote interno (datas do Notion), o contrato aparece sob o cabeçalho da data dele.
    const codEq = require('fs').readFileSync(process.env.ACESSOS || '/tmp/tq-acessos.tsv', 'utf8').trim().split('\n').map((l) => l.split('\t')).find(([t]) => t === 'equipe')?.[1];
    if (codEq) { await p.evaluate(async (cod) => { S.pac = await abrirPacote(cod); render(); }, codEq); await p.waitForTimeout(300); }
    ok(await p.$eval(`[data-abrir="ct:${ctId}"]`, (x) => { const g = x.closest('.pend-grupo'); return !!g && /\d{2}\/\d{2} · .+ · 1 contrato para conferir/.test(g.querySelector('.pend-ev')?.textContent || '') && !!x.closest('ul.pend-sub'); }), 'Para você: o contrato fica sob o cabeçalho da data ("1 contrato para conferir"), recuado');
    await p.click(`[data-abrir="ct:${ctId}"]`); await p.waitForSelector(`tr.foco [data-ct-conferir="${ctId}"]`);
    ok(true, 'o item abre Contratos com a linha do contrato em destaque e o botão "Conferir e confirmar"');
    const linhaCt = () => p.textContent(`tr:has([data-ct-ver="${ctId}"])`);
    ok(/Assinado · arquivo recebido/.test(await linhaCt()) && await p.$(`[data-ct-devolver="${ctId}"]`), 'equipe vê "arquivo recebido" com "Conferir e confirmar" e "Pedir de novo"');
    await p.click(`[data-ct-devolver="${ctId}"]`); await p.waitForSelector('#ctMotivo');
    await p.click(`[data-ct-devolver-ok="${ctId}"]`);
    ok(/✕ Erro: Escreva o motivo/.test(await p.textContent('#ctConfMsg')), 'pedir de novo sem motivo explica o que falta');
    await p.fill('#ctMotivo', 'Faltou a assinatura na página 2.'); await p.click(`[data-ct-devolver-ok="${ctId}"]`); await p.waitForSelector('#ctConfMsg.feito');
    ok(/✓ Feito: Pedido enviado: Ana Contrato/.test(await p.textContent('#ctConfMsg')) && /Arquivo pedido de novo/.test(await linhaCt()) && /Faltou a assinatura na página 2/.test(await linhaCt()) && !(await p.$(`[data-ct-conferir="${ctId}"]`)), 'pedido de novo fica na tabela com o motivo e sem o botão de conferir');
    await p.evaluate(() => { const a = TQConta.areaDe('hoje'); S.sub[a] = 'hoje'; S.aba = a; render(); }); await p.waitForTimeout(200);
    ok(/Cobrar reenvio de contrato devolvido \(1\)/.test(await p.textContent('#app')) && /Faltou a assinatura na página 2/.test(await p.textContent('#app')), 'Para você: contrato devolvido aguardando o reenvio, com o motivo');
    await sair();
    await p.click('#entrar'); await p.waitForSelector('#esenha'); await p.waitForTimeout(400);
    await p.fill('#email', 'ana@contrato.com'); await p.fill('#esenha', 'segredo123'); await p.click('#eok'); await pular();
    if (await p.$('[data-ct-voltar]')) { await p.click('[data-ct-voltar]'); await p.waitForTimeout(300); }
    ok((await p.textContent('#app')).indexOf('envie o arquivo assinado de novo') < (await p.textContent('#app')).indexOf('Olá'), 'Próximos passos: o contrato devolvido vem antes de tudo');
    ok(/envie o arquivo assinado de novo/.test(await p.textContent('#app')) && /Faltou a assinatura na página 2/.test(await p.textContent('#app')), 'artista vê no passo a passo que precisa enviar de novo, com o motivo');
    await p.click(`[data-ct-abrir="${ctId}"]`); await p.waitForSelector('#ctDeNovo');
    ok(/Faltou a assinatura na página 2/.test(await p.textContent('#ctDeNovo')) && !(await p.isDisabled('[data-enviar-arquivo^="contrato_"]')), 'tela do contrato mostra o motivo e libera o envio do arquivo novo');
    await p.waitForTimeout(20);
    await p.setInputFiles('[data-enviar-arquivo^="contrato_"]', { ...pdf, name: 'contrato-assinado-v2.pdf' }); await p.waitForSelector('text=Contrato assinado enviado');
    ok(!(await p.$('#ctDeNovo')), 'arquivo novo enviado: o pedido some da tela da artista');
    await sair();
    await p.click('#entrar'); await p.click('[data-demo="equipe"]'); await pular(); await p.evaluate((k) => { const a = TQConta.areaDe?.(k) || k; S.sub = S.sub || {}; if (a !== k) S.sub[a] = k; S.aba = a; render(); }, 'documentos'); await p.waitForSelector(`[data-ct-conferir="${ctId}"]`);
    await p.click(`[data-ct-conferir="${ctId}"]`); await p.waitForSelector('.conf-aqui');
    const pergunta = await p.textContent('.conf-aqui'); await p.click('[data-conf-sim]'); await p.waitForSelector('#ctConfMsg.feito');
    ok(/✓ Feito: Contrato conferido e confirmado/.test(await p.textContent('#ctConfMsg')) && /✓ Assinado e conferido/.test(await linhaCt()) && /conferido por/.test(await linhaCt()) && !(await p.$(`[data-ct-conferir="${ctId}"]`)), 'equipe confere e confirma: "✓ Assinado e conferido", com quem e quando');
    ok(/Depois de conferido, o contrato não muda mais/.test(pergunta), 'conferir pede confirmação antes, na própria página');
    await sair();
    await p.click('#entrar'); await p.waitForSelector('#esenha'); await p.waitForTimeout(400);
    await p.fill('#email', 'ana@contrato.com'); await p.fill('#esenha', 'segredo123'); await p.click('#eok'); await pular();
    if (await p.$('[data-ct-voltar]')) { await p.click('[data-ct-voltar]'); await p.waitForTimeout(300); }
    await p.click('[data-aba="contratos_meus"]'); await p.waitForSelector(`[data-ct-abrir="${ctId}"]`);
    ok(/✓ Assinado e conferido/.test(await p.textContent('#app')), 'na lista de contratos da artista aparece "✓ Assinado e conferido"');
    await p.click(`[data-ct-abrir="${ctId}"]`); await p.waitForSelector('#ctTexto', { state: 'attached' });
    ok(/Contrato assinado e conferido/.test(await p.textContent('#app')) && !(await p.$('[data-enviar-arquivo^="contrato_"]')) && !(await p.$('#ctSalvarDados')), 'artista vê "assinado e conferido", sem envio nem edição dos dados');
  } catch (e) { ok(false, 'quebrou: ' + e.message.split('\n')[0]); await p.screenshot({ path: process.env.SHOT || '/tmp/contr-falha.png' }).catch(() => {}); }
  ok(!erros.length, 'sem erro JS ' + erros.join(' | '));
  console.log(res.join('\n')); await b.close();
})();
