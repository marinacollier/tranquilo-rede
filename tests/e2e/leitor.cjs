// Documentos que abrem dentro do portal (pedido do Gui, 13/11/2026): a equipe publica os .html de uma vez em Materiais,
// a casa lê o Guia, os manuais e os documentos do marketing sem sair da página.
const { chromium } = require('playwright');
const B = process.env.BASE || 'http://localhost:8790/'; const res = []; const ok = (c, m) => { res.push((c ? 'OK    ' : 'FALHA ') + m); if (!c) process.exitCode = 1; };
const D = __dirname + '/dados/';
(async () => {
  const b = await chromium.launch(); const erros = [];
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route('**/config.js', (r) => r.fulfill({ contentType: 'application/javascript', body: 'window.TQ_CONFIG = {};' }));
  await ctx.addInitScript(() => { try { localStorage.setItem('tq-consentimento', 'tudo'); } catch {} });
  const p = await ctx.newPage(); p.on('pageerror', (e) => erros.push(e.message)); p.on('dialog', (d) => d.accept());
  const abrirAba = async (k) => { if (await p.$(`[data-aba="${k}"]`)) return p.click(`[data-aba="${k}"]`); const a = await p.evaluate((k) => window.TQConta?.areaDe?.(k), k); await p.click(`[data-aba="${a}"]`); await p.waitForTimeout(200); if (await p.$(`[data-sub="${a}|${k}"]`)) await p.click(`[data-sub="${a}|${k}"]`); };
  try {
    await p.goto(B); await p.waitForSelector('.cidade'); await p.keyboard.press('Escape');
    // equipe publica dois documentos de uma vez
    await p.click('#entrar'); await p.waitForSelector('[data-demo="equipe"]'); await p.click('[data-demo="equipe"]'); await p.waitForTimeout(900); await p.keyboard.press('Escape');
    await abrirAba('materiais'); await p.waitForSelector('#dpArq', { state: 'attached', timeout: 5000 });
    await p.click('details:has(#dpArq) summary'); await p.fill('#dpVer', '1.9');
    await p.setInputFiles('#dpArq', [D + 'guia-do-franqueado.html', D + 'briefing-anfitriao.html']);
    await p.waitForFunction(() => /Feito/.test(document.querySelector('#dperr')?.textContent || ''), null, { timeout: 8000 }).catch(() => {});
    const msg = await p.textContent('#dperr');
    ok(/^✓ Feito: 2 documentos publicados: Guia do Franqueado \(versão 1\.9\)/.test(msg), `equipe publica 2 documentos de uma vez (${msg})`);
    ok(await p.$eval('#dperr', (e) => e.classList.contains('feito')), 'mensagem de feito fica verde (classe feito)');
    await p.setInputFiles('#dpArq', [D + 'casa-nova.json']); await p.waitForTimeout(300);
    ok(/^✕ Erro: Não reconheci casa-nova\.json.*Nada foi publicado/.test(await p.textContent('#dperr')), 'arquivo com nome desconhecido: erro claro e nada publicado');
    await p.click('#sair'); await p.waitForTimeout(500);
    // casa lê dentro da página
    await p.click('#entrar'); await p.click('[data-entrada="criar"]'); await p.waitForSelector('#enome');
    await p.click('label:has(input[name="tipoNovo"][value="casa"])'); await p.waitForTimeout(200);
    await p.fill('#enome', 'Casa Leitora'); await p.fill('#email', 'leitora@teste.com'); await p.fill('#esenha', 'segredo123'); await p.press('#esenha', 'Enter');
    await p.waitForSelector('[data-aba="operacoes"]', { timeout: 8000 }); await p.click('[data-tour="pular"]').catch(() => {}); await p.waitForTimeout(200);
    await abrirAba('guia'); await p.waitForSelector('[data-ler="guia-do-franqueado"]', { timeout: 5000 });
    ok(!(await p.$('#app a[target="_blank"][href*="exemplo"]')), 'Guia não manda para outro link');
    await p.click('[data-ler="guia-do-franqueado"]'); await p.waitForSelector('#leitorDoc', { timeout: 5000 });
    const f = p.frameLocator('#leitorDoc');
    await f.locator('h1').waitFor({ timeout: 5000 });
    ok(/Guia do Franqueado de teste/.test(await f.locator('h1').innerText()), 'Guia abre dentro da página');
    await p.waitForTimeout(800);
    const alt = await p.evaluate(() => document.getElementById('leitorDoc').getBoundingClientRect().height);
    ok(alt > 1700, `quadro cresce com o documento, sem rolagem dupla (${Math.round(alt)}px)`);
    ok(/versão 1\.9/.test(await p.innerText('#app')), 'mostra a versão do documento');
    await f.locator('a[href="#fechamento"]').click(); await p.waitForTimeout(900);
    ok(await p.evaluate(() => scrollY) > 600, 'link interno (#fechamento) rola a página até a seção');
    await f.locator('a[href="#tq:briefing-anfitriao"]').click(); await p.waitForTimeout(900);
    await p.frameLocator('#leitorDoc').locator('h1').waitFor({ timeout: 5000 });
    ok(/Briefing do anfitrião de teste/.test(await p.frameLocator('#leitorDoc').locator('h1').innerText()), 'link para outro documento abre no mesmo leitor');
    await p.click('[data-ler-voltar] >> nth=0'); await p.waitForTimeout(300);
    ok(!(await p.$('#leitorDoc')), '"Voltar" fecha o documento');
    await p.click('[data-manual="Apresenta"]'); await p.waitForTimeout(300);
    ok(/Manual do Tranquilo Apresenta/.test(await p.innerText('#app')) && /Rider técnico/.test(await p.innerText('#app')) && /Camarim/.test(await p.innerText('#app')), 'manual do Apresenta abre na página, completo');
    await abrirAba('mkt_anfitriao'); await p.waitForTimeout(400);
    ok(!(await p.$('#leitorDoc')) && await p.$('[data-ler="briefing-anfitriao"]') !== null, 'trocar de parte fecha o leitor; Marketing do anfitrião tem o briefing para ler na página');
    ok(!/Plano de Ação/i.test(await p.innerText('#app')), 'Plano de Ação saiu do Marketing');
    await p.setViewportSize({ width: 390, height: 800 }); await p.click('[data-ler="briefing-anfitriao"]'); await p.waitForTimeout(800);
    ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no celular, o documento não estoura a largura');
    ok(!erros.length, 'sem erro JS ' + erros.join(' | '));
  } catch (e) { ok(false, 'erro no teste: ' + e.message); }
  finally { await b.close(); console.log(res.join('\n')); }
})();
