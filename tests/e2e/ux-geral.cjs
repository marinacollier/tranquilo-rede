// "Não tem como errar" e "começa pequeno e expande" (Marina, 18/11/2026), no celular (390 px) e no modo demonstração:
// botões dizem o efeito com uma linha embaixo; blocos longos começam recolhidos com um resumo e lembram o que a pessoa abriu;
// apagar/cancelar/enviar pergunta na própria página (sem janelinha do navegador); nada passa da largura da tela.
const { chromium } = require('playwright');
const B = process.env.BASE || 'http://localhost:8790/'; const res = []; const ok = (c, m) => { res.push((c ? 'OK    ' : 'FALHA ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch(); const erros = [], dialogos = [];
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.route('**/config.js*', (r) => r.fulfill({ contentType: 'application/javascript', body: 'window.TQ_CONFIG = {};' }));
  // A trilha fica ligada aqui (é parte do "começa pequeno"); só o tutorial do público sai do caminho.
  await ctx.addInitScript(() => { try { localStorage.setItem('tq-consentimento', 'tudo'); localStorage.setItem('tq-tutorial-publico', '1'); } catch {} });
  const p = await ctx.newPage(); p.on('pageerror', (e) => erros.push(e.message)); p.on('dialog', (d) => { dialogos.push(d.message()); d.dismiss(); });
  const pular = async () => { try { await p.waitForSelector('.tour-caixa', { timeout: 3000 }); await p.click((await p.$('[data-tour="pular"]')) ? '[data-tour="pular"]' : '[data-tour="avancar"]'); } catch {} };
  const ir = (k) => p.evaluate((x) => { S.aba = x; render(); scrollTo(0, 0); }, k);
  const passa = () => p.evaluate(() => { const vw = innerWidth; return [...document.querySelectorAll('main *')].filter((e) => { const r = e.getBoundingClientRect(); if (!r.width || r.right <= vw + 1) return false;
    for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) if (/auto|scroll|hidden/.test(getComputedStyle(a).overflowX)) return false; return true; }).map((e) => e.id || e.className || e.tagName).slice(0, 3); });
  const db = () => p.evaluate(() => JSON.parse(localStorage.getItem('tq-demo-v1')));
  try {
    await p.goto(B); await p.waitForSelector('.cidade');
    await p.click('#entrar'); await p.click('[data-entrada="criar"]'); await p.waitForSelector('#enome');
    await p.click('label:has(input[name="tipoNovo"][value="casa"])'); await p.fill('#enome', 'Casa UX'); await p.fill('#email', 'ux@casa.com'); await p.fill('#esenha', 'segredo123'); await p.press('#esenha', 'Enter');
    await pular(); await p.waitForTimeout(500);
    // 1. Trilha: o passo de agora aparece; os próximos ficam numa linha que abre.
    await ir('datas_casa'); await p.waitForTimeout(300);
    ok(await p.isVisible('.trilha .trilha-lista li.atual') && /Depois vêm mais \d etapas/.test(await p.innerText('.trilha')) && !(await p.isVisible('[data-dobra="trilha-depois"] li')), 'trilha: passo de agora visível, os próximos recolhidos numa linha');
    // 2. Ficha: Parte 1, "O que falta" e "Sua equipe" começam recolhidas com uma linha de resumo; a primeira parte pendente vem aberta.
    await ir('ficha'); await p.waitForSelector('#form');
    const fechado = (id) => p.$eval(`[data-dobra="${id}"]`, (d) => !d.open);
    ok(await fechado('ficha-parte1') && await fechado('ficha-falta') && (await p.$$eval('#form details.eqlin', (xs) => xs.length && xs.every((d) => !d.open))), 'Ficha: Parte 1, "O que falta" e as linhas de "Sua equipe" começam recolhidas');
    ok(/para habilitar/.test(await p.innerText('[data-dobra="ficha-falta"] summary')), 'cada bloco recolhido diz o que é e o status numa linha');
    ok(await p.$eval('#form details[data-parte="0"]', (d) => d.open) && !(await p.$eval('#form details[data-parte="1"]', (d) => d.open)), 'a primeira parte pendente vem aberta, as outras recolhidas');
    await p.click('[data-dobra="ficha-parte1"] summary'); await p.evaluate(() => render()); await p.waitForTimeout(200);
    ok(await p.$eval('[data-dobra="ficha-parte1"]', (d) => d.open) && /Divisão das receitas/.test(await p.innerText('#app')), 'abre ao tocar e continua aberta depois de redesenhar a tela');
    // 3. Botões dizem o efeito, com uma linha embaixo.
    const exp = await p.$$eval('.barra-acoes .acao-exp', (xs) => xs.map((x) => [x.querySelector('.btn')?.textContent.trim(), x.querySelector('small')?.textContent.trim()]));
    ok(exp.length >= 3 && exp.every(([r, e]) => r && e && e.length > 15), `Ficha: cada botão tem a linha do que acontece (${exp.map(([r]) => r).join(' · ')})`);
    ok(exp.some(([r, e]) => /cópia das respostas/i.test(r) && /Não envia a Ficha/.test(e)) && exp.some(([r, e]) => /rascunho/i.test(r) && /Ainda não vai/.test(e)), 'rótulos com efeito e destino: "Mandar uma cópia…" não envia a Ficha; rascunho ainda não vai para análise');
    ok(!(await passa()).length, `Ficha no celular: nada passa da tela (${(await passa()).join(', ')})`);
    { const r = await p.$eval('#copiarFicha', (x) => x.getBoundingClientRect().right); ok(r <= 390, `#copiarFicha cabe na tela (direita em ${Math.round(r)}px)`); }
    // 4. Enviar pergunta na própria página; "Não, voltar" não envia nada.
    await p.$$eval('#form details[data-parte]', (xs) => xs.forEach((x) => { x.open = true; }));
    for (const [k, v] of [['nome', 'Casa UX'], ['cidade_uf', 'Recife/PE'], ['razao_social', 'Casa UX Ltda'], ['cnpj', '11.222.333/0001-81'], ['endereco', 'Rua A, 1'], ['dono_nome', 'Dona Teste'], ['dono_cpf', '529.982.247-25'], ['whatsapp', '81 99999-0000'], ['rep_titular', 'Casa UX Ltda'], ['rep_documento', '11.222.333/0001-81'], ['rep_pix', '11.222.333/0001-81'], ['capacidade_sentado', '80']]) await p.fill(`#form [data-k="${k}"]`, v);
    await p.click('#enviar'); await p.waitForSelector('.conf-aqui');
    ok(/Enviar a Ficha ao Tranquilo agora\?/.test(await p.innerText('.conf-aqui')) && /Gui/.test(await p.innerText('.conf-aqui')) && !dialogos.length, 'Enviar abre a confirmação na própria página, dizendo o que acontece (sem janelinha)');
    await p.click('[data-conf-nao]'); await p.waitForTimeout(400);
    ok(!(await p.$('.conf-aqui')) && !['em_analise', 'habilitada'].includes(Object.values((await db()).casas)[0]?.status), '"Não, voltar" fecha a caixa e não envia nada');
    await p.click('#enviar'); await p.click('[data-conf-sim]'); await p.waitForTimeout(900);
    ok(Object.values((await db()).casas)[0]?.status === 'em_analise' && /Próximo passo/.test(await p.innerText('#tqAviso').catch(() => '')), '"Sim, enviar" envia e a mensagem diz o próximo passo');
    // 5. Ficha enviada: botões com o efeito e para quem vai.
    await ir('ficha'); await p.waitForSelector('#solPedir');
    const enviada = await p.innerText('.barra-acoes:has(#solPedir)');
    ok(/Pedir para mudar uma resposta já enviada/.test(enviada) && /Gui \(Operações\) aprovar/.test(enviada) && /Salvar os campos que estavam em branco/.test(enviada) && /Já chega ao Tranquilo/.test(enviada), 'Ficha enviada: "Pedir para mudar…" (o Gui aprova) e "Salvar os campos em branco" (já chega ao Tranquilo)');
    ok(!(await passa()).length, `Ficha enviada no celular: nada passa da tela (${(await passa()).join(', ')})`);
    // 6. Lista vazia: só o aviso, sem a tabela vazia cortada no celular.
    await p.click('#sair').catch(() => p.evaluate(() => document.querySelector('#sair')?.click())); await p.waitForTimeout(400);
    await p.click('#entrar'); await p.click('[data-demo="equipe"]'); await pular(); await p.waitForTimeout(600);
    await p.evaluate(() => { const a = TQConta.areaDe?.('convites') || 'convites'; S.sub = S.sub || {}; if (a !== 'convites') S.sub[a] = 'convites'; S.aba = a; render(); }); await p.waitForTimeout(500);
    ok(!!(await p.$('[data-tbl-vazia] .vazio')) && !(await passa()).length, 'lista vazia mostra só o aviso, inteiro na tela');
    await p.evaluate(() => { const a = TQConta.areaDe?.('inicio') || 'inicio'; S.sub = S.sub || {}; if (a !== 'inicio') S.sub[a] = 'inicio'; S.aba = a; render(); }); await p.waitForTimeout(500);
    { const d = await p.$('[data-dobra="inicio-em-dia"]'); ok(!d || !(await d.evaluate((x) => x.open)), 'Início da equipe: filas zeradas ficam numa linha recolhida'); }
    // 7. Filtros e abas gritam que são clicáveis: Criar datas é um passo a passo numerado e cada formato diz quantas combinações tem.
    await p.evaluate(() => { const a = TQConta.areaDe?.('datas_portal') || 'datas_portal'; S.sub = S.sub || {}; if (a !== 'datas_portal') S.sub[a] = 'datas_portal'; S.aba = a; render(); }); await p.waitForSelector('[data-dpb-modo]');
    const passos = await p.$$eval('#dpBusca .passo-rot', (xs) => xs.map((x) => x.textContent.trim()));
    ok(/^1\s*Escolha o formato/.test(passos[0] || '') && /^2\s*Período e cidade/.test(passos[1] || '') && /^3/.test(passos[2] || ''), `Criar datas: passo a passo numerado (${passos.join(' → ')})`);
    const modos = await p.$$eval('[data-dpb-modo]', (xs) => xs.map((x) => x.textContent.trim()));
    ok(modos.length === 5 && modos.every((m) => /\d+ (combinaç|artista|dia)/.test(m)), `cada formato mostra a contagem (${modos.join(' | ')})`);
    ok(await p.$eval('[data-dpb-modo][aria-pressed="true"]', (x) => getComputedStyle(x).backgroundColor !== getComputedStyle(x.nextElementSibling || x.previousElementSibling).backgroundColor), 'o formato escolhido fica preenchido, diferente dos outros');
    ok(/Ver:/.test(await p.evaluate(() => getComputedStyle(document.querySelector('.subnav'), '::before').content)), 'abas de cima com rótulo "Ver:" antes');
  } catch (e) { ok(false, 'quebrou: ' + e.message.split('\n')[0]); }
  ok(!erros.length, 'sem erro JS ' + erros.join(' | '));
  console.log(res.join('\n')); await b.close();
})();
