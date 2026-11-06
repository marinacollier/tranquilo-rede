// Regressões achadas pelo QA de 06/11/2026 no portal da casa (modo demonstração, sem banco):
// salvamento automático da Ficha dentro da área "Ficha da Casa", capacidade aproximada ("80 a 100"),
// "Copiar respostas" com "Sua equipe" e "Como é a noite" sem cartões vazios.
const { chromium } = require('playwright');
const B = process.env.BASE || 'http://localhost:8790/'; const res = []; const ok = (c, m) => { res.push((c ? 'OK    ' : 'FALHA ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch(); const erros = [];
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(B).origin });
  await ctx.route('**/config.js', (r) => r.fulfill({ contentType: 'application/javascript', body: 'window.TQ_CONFIG = {};' }));
  await ctx.addInitScript(() => { try { localStorage.setItem('tq-consentimento', 'tudo'); localStorage.setItem('tq-tutorial-publico', '1'); } catch {} });
  const p = await ctx.newPage(); p.on('pageerror', (e) => erros.push(e.message)); p.on('dialog', (d) => d.accept());
  const pular = async () => { try { await p.waitForSelector('.tour-caixa', { timeout: 3000 }); await p.click((await p.$('[data-tour="pular"]')) ? '[data-tour="pular"]' : '[data-tour="avancar"]'); } catch {} };
  const db = () => p.evaluate(() => JSON.parse(localStorage.getItem('tq-demo-v1')));
  const dados = async () => { const d = await db(); return Object.values(d.casas || {}).find(Boolean)?.dados || {}; };
  try {
    await p.goto(B); await p.waitForSelector('.cidade');
    await p.click('#entrar'); await p.click('[data-entrada="criar"]'); await p.waitForSelector('#enome');
    await p.click('label:has(input[name="tipoNovo"][value="casa"])'); await p.fill('#enome', 'Dona QA'); await p.fill('#email', 'dona@qa.com'); await p.fill('#esenha', 'segredo123'); await p.press('#esenha', 'Enter');
    await pular();
    await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('tq-demo-v1')); Object.assign(d.usuarios[d.sessao].perfil, { vinculo_nome: 'Casa QA', codigo_acesso: 'AAAA-BBBB-CCCC' }); localStorage.setItem('tq-demo-v1', JSON.stringify(d)); });
    await p.reload(); await pular(); await p.click('[data-aba="ficha"]'); await p.waitForSelector('#form');
    // 1. Salvamento automático: digita, troca de área antes do 1,2 s e volta; depois recarrega.
    await p.fill('[data-k="nome"]', 'Casa QA Ltda'); await p.click('[data-aba="operacoes"]'); await p.waitForTimeout(500);
    await p.click('[data-aba="ficha"]'); await p.waitForSelector('#form');
    ok(await p.inputValue('[data-k="nome"]') === 'Casa QA Ltda', 'trocar de área não perde o que foi digitado na Ficha');
    await p.fill('[data-k="capacidade_sentado"]', '80 a 100'); await p.waitForTimeout(1800);
    await p.reload(); await pular(); await p.click('[data-aba="ficha"]'); await p.waitForSelector('#form');
    ok(await p.inputValue('[data-k="nome"]') === 'Casa QA Ltda', 'o salvamento automático grava a Ficha (sobrevive a recarregar a página)');
    // 2. Capacidade aproximada: "80 a 100" vale 80, nunca 80100.
    const cap = String((await dados()).capacidade_sentado ?? await p.inputValue('[data-k="capacidade_sentado"]'));
    ok(cap === '80', `capacidade "80 a 100" grava 80 (gravou ${cap})`);
    ok((await p.getAttribute('[data-k="capacidade_sentado"]', 'placeholder')) === 'ex.: 80', 'exemplo da capacidade sentada é de casa pequena, não "ex.: 12.000"');
    // 3. "Copiar respostas" leva também "Sua equipe".
    await p.click('#copiarFicha'); await p.waitForTimeout(300);
    const txt = await p.evaluate(() => navigator.clipboard.readText()).catch(() => '');
    ok(/\*Sua equipe\*/.test(txt) && /Líder Local \(produtor\)/.test(txt) && /Técnico\(a\) de som/.test(txt), '"Copiar respostas" inclui Sua equipe, como no modelo do Gui');
    // 4. "Como é a noite" não aparece para a casa enquanto o pacote não traz o conteúdo.
    const subsOp = await p.evaluate(() => [...document.querySelectorAll('[data-aba]')].length && ['roteiro'].filter((k) => window.TQConta.areaDe(k)));
    const vazios = subsOp.length ? await (async () => { await p.click('[data-aba="operacoes"]'); await p.click('[data-sub="operacoes|roteiro"]'); return p.$$eval('.card.md', (xs) => xs.filter((x) => !x.textContent.trim()).length); })() : 0;
    ok(vazios === 0, `"Como é a noite" sem cartões vazios (${subsOp.length ? 'aparece' : 'oculto sem conteúdo'})`);
  } catch (e) { ok(false, 'quebrou: ' + e.message.split('\n')[0]); }
  ok(!erros.length, 'sem erro JS ' + erros.join(' | '));
  console.log(res.join('\n')); await b.close();
})();
