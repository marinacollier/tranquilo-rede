// Ficha já enviada (banco v25, pedido da Marina, 17/11/2026): a casa e a artista preenchem os campos vazios direto;
// o que já foi respondido fica travado (casa: Solicitar atualização; artista: ajustes da curadoria).
const { chromium } = require('playwright');
const B = process.env.BASE || 'http://localhost:8790/'; const res = []; const ok = (c, m) => { res.push((c ? 'OK    ' : 'FALHA ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch(); const erros = [];
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route('**/config.js*', (r) => r.fulfill({ contentType: 'application/javascript', body: 'window.TQ_CONFIG = {};' }));
  await ctx.addInitScript(() => { try { localStorage.setItem('tq-consentimento', 'tudo'); localStorage.setItem('tq-sem-trilha', '1'); localStorage.setItem('tq-tutorial-publico', '1'); } catch {} });
  const p = await ctx.newPage(); p.on('pageerror', (e) => erros.push(e.message)); p.on('dialog', (d) => d.accept());
  const pular = async () => { try { await p.waitForSelector('.tour-caixa', { timeout: 2500 }); await p.click((await p.$('[data-tour="pular"]')) ? '[data-tour="pular"]' : '[data-tour="avancar"]'); } catch {} };
  const ir = async (k) => { await p.evaluate((k) => { const a = TQConta.areaDe?.(k); if (a) { S.sub = S.sub || {}; S.sub[a] = k; S.aba = a; } else S.aba = k; render(); }, k); await p.waitForTimeout(700); };
  const sair = async () => { await ir('conta'); await p.click('#sairConta'); await p.waitForTimeout(400); };
  const criar = async (tipo, nome, email) => {
    await p.click('#entrar'); await p.click('[data-entrada="criar"]'); await p.waitForSelector('#enome');
    await p.click(`label:has(input[name="tipoNovo"][value="${tipo}"])`); await p.waitForTimeout(200);
    await p.fill('#enome', nome); await p.fill('#email', email); await p.fill('#esenha', 'segredo123'); await p.press('#esenha', 'Enter'); await p.waitForTimeout(800); await pular();
  };
  const abrirTudo = () => p.$$eval('#form details[data-parte]', (xs) => xs.forEach((x) => { x.open = true; }));
  const demo = (fn, arg) => p.evaluate(([fn, arg]) => { const d = JSON.parse(localStorage.getItem('tq-demo-v1')); new Function('d', 'arg', fn)(d, arg); localStorage.setItem('tq-demo-v1', JSON.stringify(d)); }, [fn, arg]);
  try {
    await p.goto(B); await p.waitForSelector('.cidade'); await p.keyboard.press('Escape');
    // Artista com inscrição na curadoria e o YouTube vazio.
    await criar('artista', 'Bia Vazios', 'bia@vazios.com');
    await demo(`d.insc[d.sessao] = { id: 'i1', user_id: d.sessao, status: 'em_curadoria', dados: { nome_artistico: 'Bia Vazios', cidade_base: 'Recife', youtube: '' }, criado_em: new Date().toISOString() };`);
    await p.reload(); await p.waitForTimeout(800); await pular(); await ir('inscricao');
    ok(await p.isDisabled('[data-k="nome_artistico"]') && !(await p.isDisabled('[data-k="youtube"]')), 'artista: campo respondido travado, campo vazio aberto');
    await abrirTudo(); await p.fill('[data-k="youtube"]', 'https://youtube.com/@bia'); await p.click('#salvarVazios'); await p.waitForTimeout(600);
    const ins = await p.evaluate(() => Object.values(JSON.parse(localStorage.getItem('tq-demo-v1')).insc)[0]);
    ok(ins.dados.youtube === 'https://youtube.com/@bia' && ins.status === 'em_curadoria' && ins.dados.nome_artistico === 'Bia Vazios', 'artista salva o campo vazio e a inscrição continua na curadoria');
    ok(/✓ Feito: Salvo/.test(await p.textContent('#ferr')), 'mostra "✓ Feito"');
    await sair();
    // Casa habilitada com o Instagram vazio.
    await criar('casa', 'Casa Vazios', 'casa@vazios.com');
    await demo(`d.casas[d.sessao] = { id: 'c1', user_id: d.sessao, status: 'habilitada', dados: { nome: 'Casa Vazios', cidade_uf: 'Recife/PE', instagram: '' }, criado_em: new Date().toISOString() };`);
    await p.reload(); await p.waitForTimeout(800); await pular(); await ir('ficha');
    await p.waitForSelector('#form');
    ok(await p.isDisabled('[data-k="nome"]') && !(await p.isDisabled('[data-k="instagram"]')) && !!(await p.$('#solPedir')), 'casa habilitada: respondido travado, vazio aberto, Solicitar atualização continua');
    await abrirTudo(); await p.fill('[data-k="instagram"]', '@casavazios'); await p.click('#salvarVazios'); await p.waitForTimeout(600);
    const casa = await p.evaluate(() => Object.values(JSON.parse(localStorage.getItem('tq-demo-v1')).casas)[0]);
    ok(casa.dados.instagram === '@casavazios' && casa.status === 'habilitada' && casa.dados.nome === 'Casa Vazios', 'casa salva o campo vazio e continua habilitada');
  } catch (e) { ok(false, 'quebrou: ' + e.message.split('\n')[0]); }
  ok(!erros.length, 'sem erro JS ' + erros.join(' | '));
  console.log(res.join('\n')); await b.close();
})();
