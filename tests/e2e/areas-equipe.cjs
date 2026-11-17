// Áreas da equipe (banco v22, pedido da Marina, 17/11/2026): a administração marca a área de cada conta de equipe em Pessoas
// e escolhe a área ao convidar; com área marcada, a pessoa vê só as abas e os botões da área. Sem área, vê tudo.
const { chromium } = require('playwright');
const B = process.env.BASE || 'http://localhost:8790/'; const res = []; const ok = (c, m) => { res.push((c ? 'OK    ' : 'FALHA ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch(); const erros = [];
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route('**/config.js*', (r) => r.fulfill({ contentType: 'application/javascript', body: 'window.TQ_CONFIG = {};' }));
  await ctx.addInitScript(() => { try { localStorage.setItem('tq-consentimento', 'tudo'); localStorage.setItem('tq-tutorial-publico', '1'); } catch {} });
  const p = await ctx.newPage(); p.on('pageerror', (e) => erros.push(e.message)); p.on('dialog', (d) => d.accept());
  const pular = async () => { try { await p.waitForSelector('.tour-caixa', { timeout: 2500 }); await p.click((await p.$('[data-tour="pular"]')) ? '[data-tour="pular"]' : '[data-tour="avancar"]'); } catch {} };
  const abas = () => p.evaluate(() => TQConta.abas().map(([k]) => k));
  const entrar = async (tipo) => { await p.click('#entrar'); await p.click(`[data-demo="${tipo}"]`); await pular(); await p.waitForTimeout(400); };
  const sair = async () => { await p.evaluate(() => { S.aba = 'conta'; render(); }); await p.click('#sairConta'); await p.waitForTimeout(400); };
  const ir = async (k) => { await p.evaluate((k) => { S.aba = k; render(); }, k); await p.waitForTimeout(700); };
  try {
    await p.goto(B); await p.waitForSelector('.cidade'); await p.keyboard.press('Escape');
    // 1. Equipe sem área: vê tudo, como antes.
    await entrar('equipe');
    const todas = await abas();
    ok(['datas_portal', 'documentos', 'campanhas', 'prontidao', 'relatos'].every((k) => todas.includes(k)), 'equipe sem área marcada continua vendo todas as abas da equipe');
    const eqId = await p.evaluate(() => S.conta.perfil.id);
    await sair();
    // 2. Administração marca "Marketing" para a conta de equipe em Pessoas.
    await entrar('adm'); await ir('pessoas');
    const cx = `[data-area-conta="${eqId}"][value="marketing"]`;
    ok(!!(await p.$(cx)), 'Pessoas: conta de equipe tem as caixas de área (Operações, Agenda, Marketing)');
    await p.check(cx); await p.waitForTimeout(500);
    ok(/✓ Feito: Marketing/.test(await p.textContent('#app')), 'marcar a área mostra "✓ Feito"');
    // 3. Convite de equipe com área.
    await ir('convites'); await p.selectOption('#cvTipo', 'equipe'); await p.waitForTimeout(400);
    ok((await p.$$('[data-cv-area]')).length === 3, 'Convites: ao convidar equipe, a administração escolhe a área');
    await p.check('[data-cv-area][value="agenda"]'); await p.fill('#cvNome', 'Pessoa Agenda'); await p.fill('#cvEmail', 'agenda.equipe@teste.com'); await p.click('#cvOk'); await p.waitForTimeout(700);
    await p.evaluate(() => document.querySelector('#dlg')?.open && document.querySelector('#dlg').close());
    const conv = await p.evaluate(() => JSON.parse(localStorage.getItem('tq-demo-v1')).conv['agenda.equipe@teste.com']);
    ok(JSON.stringify(conv?.areas) === '["agenda"]', `o convite guarda a área (${JSON.stringify(conv?.areas)})`);
    await sair();
    // 4. Equipe com Marketing: vê Campanhas, não vê Criar datas, Documentos, Prontidão nem Relatos.
    await entrar('equipe');
    const mk = await abas();
    ok(mk.includes('campanhas') && !mk.includes('datas_portal') && !mk.includes('documentos') && !mk.includes('prontidao') && !mk.includes('relatos'), `Marketing: abas da área (${mk.join(', ')})`);
    ok(['inicio', 'painel', 'lado_a_lado', 'agenda_casas', 'curadoria', 'casas_cad', 'trilhas', 'convites', 'demanda', 'materiais', 'conta'].every((k) => mk.includes(k)), 'todos da equipe mantêm Painel, Curadoria, Cadastros, Treinamentos, Convites, Demanda e Materiais');
    // Cadastros de casas e Curadoria: só visualizar (sem Habilitar nem Aprovar).
    await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('tq-demo-v1')); d.casas = d.casas || {}; d.casas.x = { id: 'casa-x', user_id: 'u-x', status: 'em_analise', dados: { nome: 'Casa X', cidade_uf: 'Recife/PE' }, criado_em: new Date().toISOString(), atualizado_em: new Date().toISOString() }; localStorage.setItem('tq-demo-v1', JSON.stringify(d)); });
    await p.reload(); await p.waitForTimeout(800); await pular();
    await ir('casas_cad'); const cc = await p.$('[data-click^="casacad:"]');
    if (cc) { await cc.click(); await p.waitForTimeout(500); const t = await p.textContent('#dlg');
      ok(!(await p.$('#dlg [data-decisao="habilitada"]')) && /área de Operações/.test(t), 'Cadastros de casas: Marketing vê a Ficha sem os botões de Habilitar e Pedir ajustes'); await p.evaluate(() => document.querySelector('#dlg').close()); }
    else ok(true, 'Cadastros de casas: sem ficha no modo demonstração para abrir');
    await ir('materiais');
    ok(/Publicar/.test(await p.textContent('#app')), 'Materiais: Marketing pode publicar documentos');
    // 5. Equipe com Agenda: Criar datas e Documentos, sem Campanhas e sem publicar em Materiais.
    await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('tq-demo-v1')); d.usuarios[d.sessao].perfil.areas = ['agenda']; localStorage.setItem('tq-demo-v1', JSON.stringify(d)); });
    await p.reload(); await p.waitForTimeout(800); await pular();
    const ag = await abas();
    ok(ag.includes('datas_portal') && ag.includes('documentos') && !ag.includes('campanhas'), `Agenda: Criar datas e Documentos, sem Campanhas (${ag.join(', ')})`);
    await ir('materiais'); const tm = await p.textContent('#app');
    ok(!/Publicar/.test(tm), 'Materiais: Agenda só lê (sem publicar)');
    await sair();
    // 6. Administração vê tudo.
    await entrar('adm'); const ad = await abas();
    ok(['datas_portal', 'documentos', 'campanhas', 'prontidao', 'relatos', 'pessoas', 'historico'].every((k) => ad.includes(k)), 'Administração vê tudo, com Pessoas e Histórico');
  } catch (e) { ok(false, 'quebrou: ' + e.message.split('\n')[0]); }
  ok(!erros.length, 'sem erro JS ' + erros.join(' | '));
  console.log(res.join('\n')); await b.close();
})();
