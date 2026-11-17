// Cruzar datas (pedido da Marina, 17/11/2026): o artista marca os dias livres (banco v24) e, em Criar datas, a equipe
// escolhe período e cidade e vê, por dia, as casas e os artistas livres; tocar num nome já preenche a Nova data.
const { chromium } = require('playwright');
const B = process.env.BASE || 'http://localhost:8790/'; const res = []; const ok = (c, m) => { res.push((c ? 'OK    ' : 'FALHA ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch(); const erros = [];
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route('**/config.js*', (r) => r.fulfill({ contentType: 'application/javascript', body: 'window.TQ_CONFIG = {};' }));
  await ctx.addInitScript(() => { try { localStorage.setItem('tq-consentimento', 'tudo'); localStorage.setItem('tq-tutorial-publico', '1'); } catch {} });
  const p = await ctx.newPage(); p.on('pageerror', (e) => erros.push(e.message)); p.on('dialog', (d) => d.accept());
  const pular = async () => { try { await p.waitForSelector('.tour-caixa', { timeout: 2500 }); await p.click((await p.$('[data-tour="pular"]')) ? '[data-tour="pular"]' : '[data-tour="avancar"]'); } catch {} };
  const ir = async (k) => { await p.evaluate((k) => { S.aba = k; render(); }, k); await p.waitForTimeout(700); };
  const sair = async () => { await ir('conta'); await p.click('#sairConta'); await p.waitForTimeout(400); };
  const criar = async (tipo, nome, email) => {
    await p.click('#entrar'); await p.click('[data-entrada="criar"]'); await p.waitForSelector('#enome');
    await p.click(`label:has(input[name="tipoNovo"][value="${tipo}"])`); await p.waitForTimeout(200);
    await p.fill('#enome', nome); await p.fill('#email', email); await p.fill('#esenha', 'segredo123'); await p.press('#esenha', 'Enter'); await p.waitForTimeout(800); await pular();
  };
  const dia = new Date(Date.now() + 3 * 864e5 - 3 * 3600e3).toISOString().slice(0, 10);
  try {
    await p.goto(B); await p.waitForSelector('.cidade'); await p.keyboard.press('Escape');
    // Casa com Ficha e um dia livre.
    await criar('casa', 'Casa Cruza', 'cruza@casa.com');
    await p.click('[data-aba="ficha"]').catch(() => {}); await p.waitForSelector('[data-k="nome"]');
    await p.fill('[data-k="nome"]', 'Casa Cruza'); await p.fill('[data-k="cidade_uf"]', 'Recife/PE'); await p.waitForTimeout(1700);
    await p.evaluate((dia) => { const d = JSON.parse(localStorage.getItem('tq-demo-v1')); d.usuarios[d.sessao].perfil.vinculo_nome = 'Casa Cruza'; d.sem = [{ casa_ref: 'Casa Cruza', dias: [0, 1, 2, 3, 4, 5, 6] }]; localStorage.setItem('tq-demo-v1', JSON.stringify(d)); }, dia);
    await p.reload(); await p.waitForTimeout(700); await pular();
    await ir('agenda_casa');
    ok((await p.$$('[data-sem="casa"]:checked')).length === 7 && (await p.$$eval('.cal-dia', (xs) => xs.filter((x) => /toda semana/.test(x.textContent)).length)) > 0, 'casa: dias fixos da semana no checklist e verdes no calendário');
    await sair();
    // Artista marca a disponibilidade na própria área.
    await criar('artista', 'Ana Cruza', 'ana@cruza.com');
    ok((await p.evaluate(() => TQConta.areaDe('disp_artista'))) === 'art_datas', 'artista tem a aba Disponibilidade');
    await ir('disp_artista');
    const primeiro = await p.getAttribute('[data-dispa-dia]', 'data-dispa-dia');
    await p.click(`[data-dispa-dia="${primeiro}"]`); await p.waitForTimeout(400);
    let dA = await p.evaluate(() => JSON.parse(localStorage.getItem('tq-demo-v1')).dispA || []);
    ok(dA.some((x) => x.dia === primeiro && x.situacao === 'disponivel'), 'tocar no dia marca disponível');
    await p.click(`[data-dispa-dia="${primeiro}"]`); await p.click(`[data-dispa-dia="${primeiro}"]`); await p.waitForTimeout(400);
    dA = await p.evaluate(() => JSON.parse(localStorage.getItem('tq-demo-v1')).dispA || []);
    ok(!dA.some((x) => x.dia === primeiro), 'terceiro toque limpa o dia');
    // Na Ficha (inscrição) o mesmo calendário, com "todos os dias do mês".
    await ir('inscricao'); await p.waitForSelector('#dispFicha .cal');
    await p.click('#dispFicha [data-dispa-mes="todos"]'); await p.waitForTimeout(800);
    const hojeSP = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10), [aa, mm] = hojeSP.split('-').map(Number), fim = new Date(Date.UTC(aa, mm, 0)).getUTCDate();
    const esperado = fim - Number(hojeSP.slice(8)) + 1;
    dA = await p.evaluate(() => JSON.parse(localStorage.getItem('tq-demo-v1')).dispA || []);
    ok(dA.filter((x) => x.situacao === 'disponivel').length === esperado && /✓ Feito: Todos os dias/.test(await p.textContent('#dispaErr')), `Ficha do artista: calendário marca todos os dias que faltam no mês (${esperado})`);
    await p.click('#dispFicha [data-dispa-mes="limpar"]'); await p.waitForTimeout(800);
    dA = await p.evaluate(() => JSON.parse(localStorage.getItem('tq-demo-v1')).dispA || []);
    ok(!dA.length, 'limpar o mês tira tudo');
    // Dias fixos da semana (v27): marcar sábado e domingo deixa todos os sábados e domingos verdes.
    await p.check('[data-sem="artista"][value="6"]'); await p.waitForTimeout(500); await p.check('[data-sem="artista"][value="0"]'); await p.waitForTimeout(500);
    const semA = await p.evaluate(() => (JSON.parse(localStorage.getItem('tq-demo-v1')).sem || []).find((x) => x.user_id));
    ok(JSON.stringify(semA?.dias) === '[0,6]' && /Toda semana: sábado, domingo/.test(await p.textContent('#semErr')), 'artista marca os dias fixos da semana (checklist)');
    const cel = await p.$$eval('#dispFicha .cal-dia', (xs) => xs.filter((x) => /toda semana/.test(x.textContent)).length);
    ok(cel >= 1, `os sábados e domingos ficam verdes no calendário (${cel} dias)`);
    await p.uncheck('[data-sem="artista"][value="6"]'); await p.waitForTimeout(500); await p.uncheck('[data-sem="artista"][value="0"]'); await p.waitForTimeout(500);
    await p.evaluate((dia) => { const d = JSON.parse(localStorage.getItem('tq-demo-v1')); d.dispA = [{ user_id: d.sessao, dia, situacao: 'disponivel' }]; localStorage.setItem('tq-demo-v1', JSON.stringify(d)); }, dia);
    await p.reload(); await p.waitForTimeout(700); await pular();
    await sair();
    // Equipe cruza.
    await p.click('#entrar'); await p.click('[data-demo="equipe"]'); await pular(); await p.waitForTimeout(500);
    await ir('datas_portal'); await p.waitForSelector('#dpBusca');
    const txt = await p.textContent('#dpBusca');
    ok(/1 casa livre · 1 artista livre/.test(txt) && /Casa Cruza/.test(txt) && /Ana Cruza/.test(txt), 'Criar datas mostra o dia com a casa e o artista livres');
    await p.click('[data-dpb-casa]'); await p.waitForTimeout(500);
    ok(await p.inputValue('#dpDia') === dia && (await p.$eval('#dpCasa', (s) => s.options[s.selectedIndex].text)).includes('Casa Cruza') && await p.inputValue('#dpCidade') === 'Recife/PE', 'tocar na casa preenche dia, casa e cidade da Nova data');
    await p.click('[data-dpb-art]'); await p.waitForTimeout(500);
    ok(await p.inputValue('[data-dp-art="0"]') === 'Ana Cruza' && await p.inputValue('#dpDia') === dia, 'tocar no artista coloca no line-up sem perder a casa');
    ok(/Livres em .*: 1 casa e 1 artista/.test(await p.textContent('#dpForm')) && (await p.$$eval('[data-dp-art="1"] option', (o) => o.map((x) => x.value).filter(Boolean))).join() === 'Ana Cruza', 'Nova data: a lista de artistas é só de quem marcou o dia como livre');
    await p.click('[data-dp-salvar]'); await p.waitForTimeout(800);
    ok(/✓ Feito: Data criada/.test(await p.textContent('#dpErr')), 'a data criada pela busca salva');
    ok(!/Casa Cruza/.test(await p.textContent('#dpBusca')), 'depois de criada, casa e artista saem dos livres desse dia');
    await p.selectOption('[data-dpb="cid"]', 'Recife/PE'); await p.waitForTimeout(400);
    ok(!!(await p.$('[data-dpb="cid"]')), 'filtro por cidade');
  } catch (e) { ok(false, 'quebrou: ' + e.message.split('\n')[0]); }
  ok(!erros.length, 'sem erro JS ' + erros.join(' | '));
  console.log(res.join('\n')); await b.close();
})();
