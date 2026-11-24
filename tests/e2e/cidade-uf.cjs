// Cidade e estado (pedido da Marina, 18/11/2026), no modo demonstração (sem banco): primeiro o estado (27 UFs), depois
// a cidade com busca só daquele estado (base do IBGE em cidades.json, carregada sob demanda). Escolher "Campinas - SP"
// na busca já marca a UF. As chaves gravadas continuam as mesmas: cidade_base + estado na artista, cidade_uf na casa.
const { chromium } = require('playwright');
const B = process.env.BASE || 'http://localhost:8790/'; const res = []; const ok = (c, m) => { res.push((c ? 'OK    ' : 'FALHA ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch(); const erros = [];
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route('**/config.js*', (r) => r.fulfill({ contentType: 'application/javascript', body: 'window.TQ_CONFIG = {}; window.TQ_INICIO_MODELO = "2000-01-01";' }));
  await ctx.addInitScript(() => { try { localStorage.setItem('tq-consentimento', 'tudo'); localStorage.setItem('tq-sem-trilha', '1'); localStorage.setItem('tq-dp-aberto', '1'); localStorage.setItem('tq-tutorial-publico', '1'); } catch {} });
  const p = await ctx.newPage(); p.on('pageerror', (e) => erros.push(e.message)); p.on('dialog', (d) => d.accept());
  let pedidosBase = 0; p.on('request', (r) => { if (/cidades\.json/.test(r.url())) pedidosBase++; });
  const pular = async () => { try { await p.waitForSelector('.tour-caixa', { timeout: 2500 }); await p.click((await p.$('[data-tour="pular"]')) ? '[data-tour="pular"]' : '[data-tour="avancar"]'); } catch {} };
  const ir = async (k) => { await p.evaluate((k) => { const a = TQConta.areaDe?.(k); if (a) { S.sub = S.sub || {}; S.sub[a] = k; S.aba = a; } else S.aba = k; render(); }, k); await p.waitForTimeout(600); };
  const db = () => p.evaluate(() => JSON.parse(localStorage.getItem('tq-demo-v1')));
  const criar = async (tipo, nome, email) => {
    await p.click('#entrar'); await p.click('[data-entrada="criar"]'); await p.waitForSelector('#enome');
    await p.click(`label:has(input[name="tipoNovo"][value="${tipo}"])`); await p.waitForTimeout(200);
    await p.fill('#enome', nome); await p.fill('#email', email); await p.fill('#esenha', 'segredo123'); await p.press('#esenha', 'Enter'); await p.waitForTimeout(800); await pular();
  };
  const opcoes = (sel) => p.$eval(sel, (el) => [...(el.list?.options || [])].map((o) => o.value));
  try {
    // A base do IBGE no site publicado (dist): 27 UFs, ~5.570 municípios.
    const base = await (await p.request.get(B + 'cidades.json')).json();
    const total = Object.values(base).reduce((n, l) => n + l.length, 0);
    ok(Object.keys(base).length === 27 && total >= 5560 && base.SP.includes('Campinas') && base.DF.includes('Brasília'), `cidades.json no site: 27 UFs e ${total} municípios`);
    await p.goto(B); await p.waitForSelector('.cidade'); await p.keyboard.press('Escape');
    ok(pedidosBase === 0, 'a base de cidades não carrega na página inicial (só sob demanda)');
    // ---------- Artista: estado, depois a cidade ----------
    await criar('artista', 'Lia Cidades', 'lia@cidades.com');
    await ir('inscricao'); await p.waitForSelector('#form details[data-parte]');
    const ordem = await p.$$eval('#form [data-parte="0"] [data-k]', (xs) => xs.map((x) => x.dataset.k));
    ok(ordem.indexOf('estado') >= 0 && ordem.indexOf('estado') < ordem.indexOf('cidade_base'), 'artista: o estado vem antes da cidade');
    ok((await p.$$eval('#form select[data-k="estado"] option', (xs) => xs.filter((o) => o.value).length)) === 27, 'artista: lista com as 27 UFs');
    await p.waitForTimeout(500);
    ok(pedidosBase === 1, `a base carrega quando o formulário com cidade aparece (${pedidosBase} pedido)`);
    // Busca direta, sem estado: "Campinas - SP" entra e a UF é marcada sozinha.
    await p.fill('#form [data-k="cidade_base"]', 'campin'); await p.waitForTimeout(300);
    const sug = await opcoes('#form [data-k="cidade_base"]');
    ok(sug.includes('Campinas - SP') && sug.every((x) => / - [A-Z]{2}$/.test(x)), `sem estado, a busca sugere "Cidade - UF" (${sug.slice(0, 4).join(', ')}…)`);
    await p.fill('#form [data-k="cidade_base"]', 'Campinas - SP'); await p.waitForTimeout(200);
    ok(await p.inputValue('#form [data-k="estado"]') === 'SP' && await p.inputValue('#form [data-k="cidade_base"]') === 'Campinas', 'escolheu "Campinas - SP": a UF entra sozinha e a cidade fica "Campinas"');
    const sugSP = await opcoes('#form [data-k="cidade_base"]');
    ok(sugSP.length > 600 && sugSP.includes('Sorocaba') && !sugSP.includes('Recife'), `com estado, a busca mostra só as cidades dele (${sugSP.length} de SP)`);
    // Trocar o estado tira a cidade que não é dele.
    await p.selectOption('#form [data-k="estado"]', 'PE'); await p.waitForTimeout(200);
    ok(await p.inputValue('#form [data-k="cidade_base"]') === '' && (await opcoes('#form [data-k="cidade_base"]')).includes('Recife'), 'trocou para PE: Campinas sai e a busca passa a ser de PE');
    // Sem acento vira o nome oficial ao sair do campo; cidade que não é do estado não passa.
    await p.fill('#form [data-k="cidade_base"]', 'jaboatao dos guararapes'); await p.press('#form [data-k="cidade_base"]', 'Tab'); await p.waitForTimeout(200);
    ok(await p.inputValue('#form [data-k="cidade_base"]') === 'Jaboatão dos Guararapes', 'sem acento: ao sair do campo vira o nome oficial do IBGE');
    await p.fill('#form [data-k="cidade_base"]', 'Cidade Inventada'); await p.waitForTimeout(300);
    ok(/não está na lista de cidades de PE/.test(await p.textContent('#faltaEnviar')) && await p.isDisabled('#enviar'), 'cidade fora do estado escolhido segura o envio, dizendo o motivo');
    await p.fill('#form [data-k="cidade_base"]', 'Recife'); await p.waitForTimeout(1700);
    const dA = Object.values((await db()).insc)[0]?.dados || {};
    ok(dA.cidade_base === 'Recife' && dA.estado === 'PE', `artista: grava cidade_base e estado como antes (${dA.cidade_base}/${dA.estado})`);
    ok(!/Cidade onde mora|Estado \(UF\)/.test(await p.textContent('#faltaEnviar')), 'com estado e cidade certos, nada falta sobre cidade');
    await ir('conta'); await p.click('#sairConta'); await p.waitForTimeout(400);
    // ---------- Casa: Cidade/UF num campo só ("Cidade/UF") ----------
    await criar('casa', 'Dono Cidades', 'dono@cidades.com');
    await ir('cadastro_casa'); await p.waitForSelector('#form details[data-parte]');
    ok(!!(await p.$('#form [data-fcid] [data-fcid-uf]')) && !!(await p.$('#form [data-fcid] [data-k="cidade_uf"]')), 'casa: Cidade/UF vira estado + cidade com busca');
    await p.selectOption('#form [data-fcid-uf]', 'SC'); await p.waitForTimeout(300);
    ok(/Cidade\/UF: escolha a cidade/.test(await p.textContent('#faltaEnviar')), 'só o estado: pede a cidade');
    await p.fill('#form [data-k="cidade_uf"]', 'itajai'); await p.press('#form [data-k="cidade_uf"]', 'Tab'); await p.waitForTimeout(1700);
    const dC = Object.values((await db()).casas)[0]?.dados || {};
    ok(dC.cidade_uf === 'Itajaí/SC', `casa: grava "Cidade/UF" como antes (${dC.cidade_uf})`);
    ok(!/Cidade\/UF/.test(await p.textContent('#faltaEnviar')), 'casa: com estado e cidade, Cidade/UF sai do que falta');
    // Ficha antiga com cidade sem UF: aparece na cidade e pede o estado.
    await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('tq-demo-v1')); const c = Object.values(d.casas)[0]; c.dados.cidade_uf = ''; c.dados.cidade = 'Recife'; delete c.dados.estado; localStorage.setItem('tq-demo-v1', JSON.stringify(d)); });
    await p.reload(); await p.waitForTimeout(800); await pular(); await ir('cadastro_casa'); await p.waitForSelector('#form details[data-parte]'); await p.waitForTimeout(400);
    ok(await p.inputValue('#form [data-k="cidade_uf"]') === 'Recife' && await p.inputValue('#form [data-fcid-uf]') === '' && /Cidade\/UF: escolha o estado/.test(await p.textContent('#faltaEnviar')), 'ficha antiga só com a cidade: mostra a cidade e pede o estado');
    // Celular: estado e cidade um embaixo do outro, sem rolagem lateral.
    await p.setViewportSize({ width: 375, height: 800 }); await p.waitForTimeout(200);
    ok(await p.$eval('#form [data-fcid]', (e) => { const [u, c] = [e.querySelector('select'), e.querySelector('input')].map((x) => x.getBoundingClientRect()); return e.getBoundingClientRect().right <= innerWidth && c.top >= u.bottom - 1; }), 'celular: estado e cidade um embaixo do outro, dentro da tela');
  } catch (e) { ok(false, 'quebrou: ' + e.message.split('\n')[0]); }
  ok(!erros.length, 'sem erro JS ' + erros.join(' | '));
  console.log(res.join('\n')); await b.close();
})();
