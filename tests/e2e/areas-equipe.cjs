// Áreas da equipe (banco v22, pedido da Marina, 17/11/2026): a administração marca a área de cada conta de equipe em Pessoas
// e escolhe a área ao convidar; com área marcada, a pessoa vê só as abas e os botões da área. Sem área, vê tudo.
const { chromium } = require('playwright');
const B = process.env.BASE || 'http://localhost:8790/'; const res = []; const ok = (c, m) => { res.push((c ? 'OK    ' : 'FALHA ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch(); const erros = [];
  const ctx = await b.newContext({ viewport: { width: 1280, height: 1500 } });
  await ctx.route('**/config.js*', (r) => r.fulfill({ contentType: 'application/javascript', body: 'window.TQ_CONFIG = {};' }));
  await ctx.addInitScript(() => { try { localStorage.setItem('tq-consentimento', 'tudo'); localStorage.setItem('tq-sem-trilha', '1'); localStorage.setItem('tq-dp-aberto', '1'); localStorage.setItem('tq-tutorial-publico', '1'); } catch {} });
  const p = await ctx.newPage(); p.on('pageerror', (e) => erros.push(e.message)); p.on('dialog', (d) => d.accept());
  const pular = async () => { try { await p.waitForSelector('.tour-caixa', { timeout: 2500 }); await p.click((await p.$('[data-tour="pular"]')) ? '[data-tour="pular"]' : '[data-tour="avancar"]'); } catch {} };
  // Menu da equipe com área: itens que agrupam telas (como as áreas da casa); a lista aqui abre os grupos nas telas de dentro.
  const abas = () => p.evaluate(() => TQConta.abas().flatMap(([k]) => k.startsWith('g_') ? TQConta.subsDoGrupo(k).map(([x]) => x) : [k]).filter((k, i, xs) => xs.indexOf(k) === i));
  const entrar = async (tipo) => { await p.click('#entrar'); await p.click(`[data-demo="${tipo}"]`); await pular(); await p.waitForTimeout(400); };
  const sair = async () => { await p.evaluate(() => { S.aba = 'conta'; render(); }); await p.click('#sairConta'); await p.waitForTimeout(400); };
  const ir = async (k) => { await p.evaluate((k) => { const g = TQConta.areaDe?.(k); if (g) { S.sub = S.sub || {}; S.sub[g] = k; S.aba = g; } else S.aba = k; render(); }, k); await p.waitForTimeout(700); };
  try {
    await p.goto(B); await p.waitForSelector('.cidade'); await p.keyboard.press('Escape');
    // 1. Equipe sem área: vê tudo, como antes.
    await entrar('equipe');
    const todas = await abas();
    ok(['datas_portal', 'documentos', 'campanhas', 'curadoria', 'casas_cad'].every((k) => todas.includes(k)) && !todas.includes('relatos'), 'equipe sem área marcada vê todas as partes do time (relatos e prontidão só a administração)');
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
    ok(JSON.stringify(mk) === JSON.stringify(['hoje', 'feito', 'geral', 'painel', 'campanhas', 'demanda', 'convites', 'materiais', 'base', 'metodo', 'conta']), `Marketing (júnior): telas da área (${mk.join(', ')})`);
    { const r = await p.evaluate(() => { const ks = [...TQConta.abas().map(([k]) => k), ...TQConta.abas().flatMap(([k]) => k.startsWith('g_') ? TQConta.subsDoGrupo(k).map(([x]) => x) : [])]; return { rot: TQConta.roteiroConta(), falta: TQTour.semTutorial('eq_areas', ks) }; });
      ok(r.rot === 'eq_areas' && !r.falta.length, `tutorial da área Marketing: cobre o menu inteiro${r.falta.length ? ' (faltam ' + r.falta.join(', ') + ')' : ''}`); }
    await ir('hoje');
    const menu = await p.$$eval('#tabs [data-aba]', (xs) => xs.map((x) => x.dataset.aba));
    ok(JSON.stringify(menu) === JSON.stringify(['g_hoje', 'g_campanhas', 'convites', 'materiais', 'base', 'metodo', 'conta']), `menu simples: Hoje, Campanhas, Materiais e Conta (${menu.join(', ')})`);
    ok(/Oi/.test(await p.textContent('#app')) && /em Marketing/.test(await p.textContent('#app')), 'A fazer mostra o que é da área de Marketing');
    await ir('geral'); ok(/Próximas datas da rede/.test(await p.textContent('#app')) && /pra você se situar/.test(await p.textContent('#app')), 'Visão geral (só leitura) abre');
    await ir('feito'); ok(/Seu histórico/.test(await p.textContent('#app')), 'Feito abre');
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
    ok((ag[0] === 'hoje' && ['datas_portal', 'curadoria', 'agenda_casas', 'documentos', 'convites'].every((k) => ag.includes(k)) && !ag.includes('campanhas') && !ag.includes('casas_cad')), `Agenda (Isa): Hoje, Criar datas, Curadoria, Agenda das casas, Documentos e Convites (${ag.join(', ')})`);
    { const r = await p.evaluate(() => { const ks = [...TQConta.abas().map(([k]) => k), ...TQConta.abas().flatMap(([k]) => k.startsWith('g_') ? TQConta.subsDoGrupo(k).map(([x]) => x) : [])]; return { rot: TQConta.roteiroConta(), falta: TQTour.semTutorial('eq_areas', ks) }; });
      ok(r.rot === 'eq_areas' && !r.falta.length, `tutorial da área Agenda: cobre o menu inteiro${r.falta.length ? ' (faltam ' + r.falta.join(', ') + ')' : ''}`); }
    await ir('materiais'); const tm = await p.textContent('#app');
    ok(!/Publicar/.test(tm), 'Materiais: Agenda só lê (sem publicar)');
    await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('tq-demo-v1')); d.usuarios[d.sessao].perfil.areas = ['operacoes']; localStorage.setItem('tq-demo-v1', JSON.stringify(d)); });
    await p.reload(); await p.waitForTimeout(800); await pular();
    const op = await abas();
    ok(op.includes('documentos') && !op.includes('datas_portal') && !op.includes('campanhas'), `Operações: Documentos e contratos (contrato com a casa), sem Criar datas e Campanhas (${op.join(', ')})`);
    { const r = await p.evaluate(() => { const ks = [...TQConta.abas().map(([k]) => k), ...TQConta.abas().flatMap(([k]) => k.startsWith('g_') ? TQConta.subsDoGrupo(k).map(([x]) => x) : [])]; return { rot: TQConta.roteiroConta(), falta: TQTour.semTutorial('eq_areas', ks) }; });
      ok(r.rot === 'eq_areas' && !r.falta.length, `tutorial da área Operações: cobre o menu inteiro${r.falta.length ? ' (faltam ' + r.falta.join(', ') + ')' : ''}`); }
    await ir('casas_cad'); await p.click('[data-click^="casacad:"]'); await p.waitForTimeout(500);
    ok(!!(await p.$('#dlg [data-decisao="habilitada"]')) && !!(await p.$('#dlg [data-editar-ficha]')), 'Operações: Habilitar e Editar a Ficha');
    await p.evaluate(() => document.querySelector('#dlg').close());
    await sair();
    // 6. Administração vê tudo.
    await entrar('adm'); const ad = await abas();
    ok(['datas_portal', 'documentos', 'campanhas', 'prontidao', 'relatos', 'pessoas', 'historico'].every((k) => ad.includes(k)), 'Administração vê tudo, com Pessoas e Histórico');
    const titulos = await p.$$eval('#tabs .nav-t', (xs) => xs.map((x) => x.textContent));
    ok(['Seu trabalho', 'Ajuda'].every((t) => titulos.includes(t)) && (await abas()).includes('pessoas'), 'menu da administração no mesmo padrão do time: ' + titulos.join(' · '));
    // Conta: mudar a senha (com Cancelar) e salvar.
    await ir('conta'); await p.click('[data-mudar-senha]'); await p.waitForTimeout(300);
    ok(await p.isVisible('#nsdepois') && /Cancelar/.test(await p.textContent('#nsdepois')), 'Conta: Mudar a senha abre com Cancelar');
    await p.click('#nsdepois'); await p.waitForTimeout(300);
    ok(!(await p.evaluate(() => document.querySelector('#dlg').open)), 'Cancelar fecha a troca de senha');
    await p.click('[data-mudar-senha]'); await p.fill('#ns1', 'tranquilo-nova-1'); await p.fill('#ns2', 'tranquilo-nova-1'); await p.click('#nsok'); await p.waitForTimeout(400);
    { const m = await p.textContent('#nserr'); ok(/✓ Feito: senha salva/.test(m), 'senha nova salva com ✓ Feito ' + m); }
    await p.waitForTimeout(1300);
    await p.screenshot({ path: (process.argv[2] || '/tmp') + '/menu-adm.png', clip: { x: 0, y: 0, width: 300, height: 1400 } });
  } catch (e) { ok(false, 'quebrou: ' + e.message.split('\n')[0]); }
  ok(!erros.length, 'sem erro JS ' + erros.join(' | '));
  console.log(res.join('\n')); await b.close();
})();
