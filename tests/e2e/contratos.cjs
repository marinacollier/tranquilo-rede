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
  await ctx.route('**/config.js', (r) => r.fulfill({ contentType: 'application/javascript', body: 'window.TQ_CONFIG = {};' }));
  await ctx.addInitScript(() => { try { localStorage.setItem('tq-consentimento', 'tudo'); localStorage.setItem('tq-tutorial-publico', '1'); } catch {} });
  const p = await ctx.newPage(); p.on('pageerror', (e) => erros.push(e.message)); p.on('dialog', (d) => d.accept());
  // Pula o tutorial (com um passo só não há "Pular": "Concluir" encerra).
  const pular = async () => { try { await p.waitForSelector('.tour-caixa', { timeout: 4000 }); await p.click((await p.$('[data-tour="pular"]')) ? '[data-tour="pular"]' : '[data-tour="avancar"]'); } catch {} };
  const sair = async () => { await p.click('#sair'); await p.waitForTimeout(300); };
  try {
    await p.goto(B); await p.waitForSelector('.cidade');
    // artista nova
    await p.click('#entrar'); await p.click('[data-entrada="criar"]'); await p.waitForSelector('#enome');
    await p.click('label:has(input[name="tipoNovo"][value="artista"])'); await p.fill('#enome', 'Ana Contrato'); await p.fill('#email', 'ana@contrato.com'); await p.fill('#esenha', 'segredo123'); await p.press('#esenha', 'Enter');
    await pular(); await sair();
    // equipe: modelo e envio
    await p.click('#entrar'); await p.click('[data-demo="equipe"]'); await pular();
    await p.click('[data-aba="documentos"]'); await p.waitForSelector('#contrAuto');
    await p.click('#contrAuto summary'); await p.fill('#mcNome', 'Apresenta artista'); await p.fill('#mcTexto', MODELO); await p.click('#mcOk');
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
    await p.click('#entrar'); await p.fill('#email', 'ana@contrato.com'); await p.fill('#esenha', 'segredo123'); await p.click('#eok'); await pular();
    ok(/Contrato para assinar/.test(await p.textContent('#app')), 'artista vê o aviso do contrato no passo a passo');
    await p.click('[data-ct-abrir]'); await p.waitForSelector('#ctTexto');
    ok(/R\$ 3\.000,00/.test(await p.textContent('#ctTexto')) && /\[CPF: preencha acima\]/.test(await p.textContent('#ctTexto')), 'texto mostra o cachê da equipe e marca o que falta');
    ok(await p.isDisabled('#ctAssinar'), '"Assinar" desabilitado antes de preencher e ler');
    await p.fill('[data-ct-dado="cpf"]', '123.456.789-00'); await p.fill('[data-ct-dado="endereco_completo"]', 'Rua A, 10, Recife'); await p.fill('[data-ct-dado="chave_pix"]', 'ana@pix.com');
    await p.click('#ctSalvarDados'); await p.waitForSelector('#ctTexto');
    if (process.env.SHOT2) { await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(200); await p.screenshot({ path: process.env.SHOT2, fullPage: true }); await p.setViewportSize({ width: 1280, height: 860 }); }
    ok(/123\.456\.789-00/.test(await p.textContent('#ctTexto')), 'dados salvos entram no texto');
    await p.waitForTimeout(200); ok(await p.isDisabled('#ctAssinar'), 'ainda desabilitado antes de rolar até o fim');
    await p.$eval('#ctTexto', (el) => { el.scrollTop = el.scrollHeight; el.dispatchEvent(new Event('scroll')); }); await p.waitForTimeout(300);
    ok(!(await p.isDisabled('#ctAssinar')) && /leu até o fim/.test(await p.textContent('#ctLido')), 'rolar até o fim libera a assinatura');
    await p.click('#ctAssinar'); ok(/Marque que leu/.test(await p.textContent('#ctErr')), 'exige marcar "li e concordo"');
    await p.fill('#ctNome', 'Ana'); await p.check('#ctConcordo'); await p.click('#ctAssinar'); await p.waitForTimeout(300);
    const msgNome = await p.textContent('#ctErr'); ok(/nome completo/.test(msgNome), 'exige nome completo (' + msgNome + ')');
    await p.fill('#ctNome', 'Ana Contrato Silva'); await p.click('#ctAssinar'); await p.waitForSelector('[data-ct-voltar]'); await p.waitForTimeout(300);
    ok(/Contrato assinado/.test(await p.textContent('#app')) && /Ana Contrato Silva/.test(await p.textContent('#app')), 'assinatura confirmada com nome e código de verificação');
    const [pop] = await Promise.all([ctx.waitForEvent('page'), p.click('[data-ct-ver]')]); await pop.waitForLoadState();
    ok(/Assinado por/.test(await pop.textContent('body')) && /SHA-256 [0-9a-f]{64}/.test(await pop.textContent('body')), 'cópia para imprimir traz o registro da assinatura');
    await pop.close(); await sair();
    // equipe vê assinado
    await p.click('#entrar'); await p.click('[data-demo="equipe"]'); await pular(); await p.click('[data-aba="documentos"]'); await p.waitForSelector('[data-ct-ver]');
    ok(/Assinado/.test(await p.textContent('#app')) && /Ana Contrato Silva/.test(await p.textContent('#app')) && !(await p.$('[data-ct-cancelar]')), 'equipe vê o contrato assinado, sem botão de cancelar');
  } catch (e) { ok(false, 'quebrou: ' + e.message.split('\n')[0]); await p.screenshot({ path: process.env.SHOT || '/tmp/contr-falha.png' }).catch(() => {}); }
  ok(!erros.length, 'sem erro JS ' + erros.join(' | '));
  console.log(res.join('\n')); await b.close();
})();
