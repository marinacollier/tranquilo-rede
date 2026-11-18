// Cruzar datas (pedido da Marina, 17/11/2026): o artista marca os dias livres (banco v24) e, em Criar datas, a equipe
// escolhe período e cidade e vê, por dia, as casas e os artistas livres; tocar num nome já preenche a Nova data.
const { chromium } = require('playwright');
const B = process.env.BASE || 'http://localhost:8790/'; const res = []; const ok = (c, m) => { res.push((c ? 'OK    ' : 'FALHA ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch(); const erros = [];
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route('**/config.js*', (r) => r.fulfill({ contentType: 'application/javascript', body: 'window.TQ_CONFIG = {};' }));
  await ctx.addInitScript(() => { try { localStorage.setItem('tq-consentimento', 'tudo'); localStorage.setItem('tq-sem-trilha', '1'); localStorage.setItem('tq-tutorial-publico', '1'); } catch {} });
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
  const dia2 = new Date(Date.now() + 4 * 864e5 - 3 * 3600e3).toISOString().slice(0, 10), dia3 = new Date(Date.now() + 5 * 864e5 - 3 * 3600e3).toISOString().slice(0, 10);
  const br = (d) => d.split('-').reverse().join('/');
  const db = () => p.evaluate(() => JSON.parse(localStorage.getItem('tq-demo-v1')));
  // "Ajustar uma data": escolhe o dia (o formulário sugere Bloquear ou Liberar pelo padrão), motivo e salva.
  const ajustar = async (alvo, d, tipo, motivo) => {
    if (!(await p.$('#excForm'))) { await p.click(`[data-exc-abrir="${alvo}"]`); await p.waitForSelector('#excForm'); }
    await p.fill('#excDia', d); await p.dispatchEvent('#excDia', 'change'); await p.waitForTimeout(100);
    const sugerido = await p.$eval('input[name="excTipo"]:checked', (x) => x.value).catch(() => null);
    if (tipo) await p.check(`input[name="excTipo"][value="${tipo}"]`);
    if (motivo) await p.fill('#excMotivo', motivo);
    await p.click(`[data-exc-ok="${alvo}"]`); await p.waitForTimeout(400); return sugerido;
  };
  try {
    await p.goto(B); await p.waitForSelector('.cidade'); await p.keyboard.press('Escape');
    // Casa com Ficha e um dia livre.
    await criar('casa', 'Casa Cruza', 'cruza@casa.com');
    await p.click('[data-aba="ficha"]').catch(() => {}); await p.waitForSelector('[data-k="nome"]');
    await p.fill('[data-k="nome"]', 'Casa Cruza'); await p.fill('[data-k="cidade_uf"]', 'Recife/PE'); await p.waitForTimeout(1700);
    await p.evaluate((dia) => { const d = JSON.parse(localStorage.getItem('tq-demo-v1')); d.usuarios[d.sessao].perfil.vinculo_nome = 'Casa Cruza'; d.sem = [{ casa_ref: 'Casa Cruza', dias: [0, 1, 2, 3, 4, 5, 6] }]; d.casas[d.sessao].status = 'habilitada'; localStorage.setItem('tq-demo-v1', JSON.stringify(d)); }, dia);
    await p.reload(); await p.waitForTimeout(700); await pular();
    await ir('agenda_casa');
    ok((await p.$$('[data-sem="casa"]:checked')).length === 7 && (await p.$$eval('.cal-dia', (xs) => xs.filter((x) => /toda semana/.test(x.textContent)).length)) > 0, 'casa: dias fixos da semana no checklist e verdes no calendário');
    // Exceções ao padrão (18/11): bloquear um dia que estaria livre, com motivo; a lista mostra e o calendário destaca.
    ok(/Nenhuma exceção marcada/.test(await p.textContent('#excCaixa')) && !(await p.$('#excForm')), 'casa: sem exceções, só o botão "Ajustar uma data"');
    const sug = await ajustar('casa', dia2, null, 'Feriado');
    ok(sug === 'bloquear', 'dia do padrão: o formulário já sugere Bloquear');
    let d0 = await db();
    ok(d0.disp.some((x) => x.dia === dia2 && x.situacao === 'indisponivel' && x.nota === 'Feriado') && /bloqueado \(Feriado\)/.test(await p.textContent('#excErr')), 'exceção grava na tabela por data (indisponível, com motivo) e confirma');
    ok(/Bloqueado/.test(await p.textContent(`[data-exc-item="${dia2}"]`)) && /Feriado/.test(await p.textContent(`[data-exc-item="${dia2}"]`)), 'a exceção aparece na lista, com o motivo');
    await p.evaluate((m) => { S.dispMes = m; render(); }, dia2.slice(0, 7)); await p.waitForTimeout(200);
    ok(await p.$eval(`[data-disp-dia="${dia2}"]`, (x) => x.classList.contains('exc') && x.classList.contains('ocupado') && /bloqueado · Feriado/.test(x.textContent))
      && await p.$eval(`[data-disp-dia="${dia3}"]`, (x) => !x.classList.contains('exc') && /toda semana/.test(x.textContent)), 'calendário diferencia exceção (destacada) e padrão ("toda semana")');
    await ajustar('casa', dia3, 'liberar');
    ok(/já está livre pelo padrão/.test(await p.textContent('#excErr')) && !(await db()).disp.some((x) => x.dia === dia3), 'liberar um dia que já é do padrão: avisa e não grava');
    await ajustar('casa', dia3, 'bloquear');
    await p.click(`[data-exc-rm="casa|${dia3}"]`); await p.waitForTimeout(400);
    ok(!(await db()).disp.some((x) => x.dia === dia3) && !(await p.$(`[data-exc-item="${dia3}"]`)) && /volta a seguir o padrão/.test(await p.textContent('#excErr')), 'remover a exceção: o dia volta ao padrão');
    await sair();
    // Artista marca a disponibilidade na própria área.
    await criar('artista', 'Ana Cruza', 'ana@cruza.com');
    await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('tq-demo-v1')); d.insc = d.insc || {}; d.insc[d.sessao] = { ...(d.insc[d.sessao] || { id: 'i-ana', user_id: d.sessao }), dados: { nome_artistico: 'Ana Cruza', cidade_base: 'Recife', estado: 'PE', cidades_interesse: ['Recife'] }, status: 'aprovada' }; localStorage.setItem('tq-demo-v1', JSON.stringify(d)); });
    await p.reload(); await p.waitForTimeout(700); await pular();
    ok((await p.evaluate(() => TQConta.abas().some(([k]) => k === 'disp_artista'))), 'artista tem a aba Disponibilidade');
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
    await p.click('#dispFicha [data-dispa-mes="limpar"]'); await p.click('#dispFicha [data-conf-sim]'); await p.waitForTimeout(800);
    dA = await p.evaluate(() => JSON.parse(localStorage.getItem('tq-demo-v1')).dispA || []);
    ok(!dA.length, 'limpar o mês tira tudo');
    // Dias fixos da semana (v27): marcar sábado e domingo deixa todos os sábados e domingos verdes.
    await p.check('[data-sem="artista"][data-cid=""][value="6"]'); await p.waitForTimeout(500); await p.check('[data-sem="artista"][data-cid=""][value="0"]'); await p.waitForTimeout(500);
    const semA = await p.evaluate(() => (JSON.parse(localStorage.getItem('tq-demo-v1')).sem || []).find((x) => x.user_id));
    ok(JSON.stringify(semA?.dias) === '[0,6]' && /toda semana: sábado, domingo/i.test(await p.textContent('#semErr')), 'artista marca os dias fixos da semana (checklist)');
    const cel = await p.$$eval('#dispFicha .cal-dia', (xs) => xs.filter((x) => /toda semana/.test(x.textContent)).length);
    ok(cel >= 1, `os sábados e domingos ficam verdes no calendário (${cel} dias)`);
    await p.uncheck('[data-sem="artista"][data-cid=""][value="6"]'); await p.waitForTimeout(500); await p.uncheck('[data-sem="artista"][data-cid=""][value="0"]'); await p.waitForTimeout(500);
    // Sem dias fixos, o artista libera dias avulsos por "Ajustar uma data" (vale para todas as cidades).
    await ir('disp_artista');
    const sugA = await ajustar('artista', dia, null);
    await ajustar('artista', dia2, 'liberar', 'Show extra');
    const dA2 = (await db()).dispA || [];
    ok(sugA === 'liberar' && dA2.length === 2 && dA2.every((x) => x.situacao === 'disponivel') && dA2.find((x) => x.dia === dia2)?.nota === 'Show extra', 'artista: fora do padrão o formulário sugere Liberar, e grava os dias com motivo');
    ok((await p.$$('#excCaixa [data-exc-item]')).length === 2 && /todas as cidades/.test(await p.textContent('#excCaixa')), 'artista: as duas exceções na lista');
    await sair();
    // Léo mora em outra cidade e não marcou o dia: não pode aparecer entre os livres (bug do 18/11).
    await criar('artista', 'Leo Vento', 'leo@cruza.com');
    // (e a Ana também fica livre em dia3, para a sugestão de outro dia mais abaixo)
    await p.evaluate((d3) => { const d = JSON.parse(localStorage.getItem('tq-demo-v1')); d.dispA.push({ user_id: d.dispA[0].user_id, dia: d3, situacao: 'disponivel' }); d.insc = d.insc || {}; d.insc[d.sessao] = { id: 'i-leo', user_id: d.sessao, dados: { nome_artistico: 'Leo Vento', cidade_base: 'Belo Horizonte', estado: 'MG', cidades_interesse: ['Recife'] }, status: 'aprovada' }; localStorage.setItem('tq-demo-v1', JSON.stringify(d)); }, dia3);
    await p.reload(); await p.waitForTimeout(700); await pular();
    await sair();
    // Equipe cruza.
    await p.click('#entrar'); await p.click('[data-demo="equipe"]'); await pular(); await p.waitForTimeout(500);
    await ir('datas_portal'); await p.waitForSelector('#dpBusca');
    const txt = await p.textContent('#dpBusca');
    ok(/1 casa livre · 1 artista livre/.test(txt) && /Casa Cruza/.test(txt) && /Ana Cruza/.test(txt) && txt.includes(br(dia)), 'Criar datas mostra o dia com a casa e o artista livres');
    ok(!txt.includes(br(dia2)), 'exceção vale no cruzamento: o dia que a casa bloqueou (feriado) não aparece, mesmo com o artista livre');
    await p.click('[data-dpb-casa]'); await p.waitForTimeout(500);
    ok(await p.inputValue('#dpDia') === dia && (await p.$eval('#dpCasa', (s) => s.options[s.selectedIndex].text)).includes('Casa Cruza') && await p.inputValue('#dpCidade') === 'Recife' && await p.$eval('#dpCidade', (e) => e.closest('[data-fcid]').querySelector('[data-fcid-uf]').value) === 'PE', 'tocar na casa preenche dia, casa e cidade da Nova data');
    await p.click('[data-dpb-art]'); await p.waitForTimeout(500);
    ok(await p.inputValue('[data-dp-art="0"]') === 'Ana Cruza' && await p.inputValue('#dpDia') === dia, 'tocar no artista coloca no line-up sem perder a casa');
    ok(/Com match em .*: 1 casa e 1 artista/.test(await p.textContent('#dpForm')) && (await p.$$eval('[data-dp-art="0"] option', (o) => o.map((x) => x.value).filter((v) => v && !v.startsWith('__')))).join() === 'Ana Cruza' && !(await p.$$eval('[data-dp-art="1"] option', (o) => o.map((x) => x.value).filter((v) => v && !v.startsWith('__')))).length, 'Nova data: a lista de artistas é só de quem marcou o dia como livre, e quem já está no line-up não aparece nas outras linhas');
    const rot = await p.$$eval('[data-dp-art="0"] optgroup option', (o) => o.map((x) => x.textContent));
    ok(rot.length === 1 && /^Ana Cruza · mora em Recife\/PE · livre \S+ \d\d\/\d\d$/.test(rot[0]), 'rótulo diz onde mora e que está livre no dia: ' + rot[0]);
    ok(!(await p.$$eval('[data-dp-art="1"] option', (o) => o.some((x) => /Leo Vento/.test(x.textContent)))) && /Não marcaram este dia \(precisa confirmar por fora\): ver 1/.test(await p.textContent('[data-dp-art="1"]')), 'quem não marcou o dia fica recolhido em "Não marcaram este dia"');
    await p.selectOption('[data-dp-art="1"]', '__outros'); await p.waitForTimeout(400);
    const fora = await p.$$eval('[data-dp-art="1"] optgroup[label^="Não marcaram"] option', (o) => o.map((x) => x.textContent));
    ok(fora.length === 1 && /Leo Vento · mora em Belo Horizonte\/MG · não marcou este dia como livre para Recife/.test(fora[0]) && await p.inputValue('[data-dp-art="0"]') === 'Ana Cruza', 'abrir o grupo mostra quem não marcou, com o motivo, sem perder o 1º artista');
    await p.selectOption('[data-dp-art="1"]', 'Leo Vento'); await p.waitForTimeout(400);
    ok(await p.isChecked('[data-dp-exc]') && /Exceção marcada automaticamente/.test(await p.textContent('#dpAvisoExc')) && /Leo Vento: não marcou este dia/.test(await p.textContent('#dpAvisoExc')) && await p.inputValue('[data-dp-art="1"]') === 'Leo Vento', 'escolher quem não marcou liga a Exceção com aviso');
    await p.uncheck('[data-dp-exc]'); await p.waitForTimeout(400);
    ok(/Não está livre para Recife neste dia/.test(await p.textContent('#dpForm')), 'sem a Exceção, avisa que o escolhido não está livre');
    await p.selectOption('[data-dp-art="1"]', ''); await p.waitForTimeout(400);
    await p.click('[data-dp-salvar]'); await p.waitForTimeout(800);
    ok(/✓ Feito: Data criada/.test(await p.textContent('#dpErr')), 'a data criada pela busca salva');
    ok(!(await p.textContent('#dpBusca')).includes(br(dia)) && (await p.textContent('#dpBusca')).includes(br(dia3)), 'depois de criada, casa e artista saem dos livres desse dia (e seguem livres em outro)');
    // Ninguém livre (o dia que a casa bloqueou): diz isso e sugere outro dia com gente livre.
    await p.fill('#dpDia', dia2); await p.dispatchEvent('#dpDia', 'change'); await p.waitForTimeout(500);
    const semC = await p.textContent('#dpSemCasa').catch(() => '');
    ok(/Nenhuma casa livre/.test(semC) && /Ver as outras casas \(1\)/.test(await p.textContent('#dpCasa')) && !!(await p.$('#dpSemCasa [data-dp-dia-sug]')), 'nenhuma casa livre: diz, recolhe a casa com o motivo e sugere outro dia');
    await p.selectOption('#dpCasa', '__outrasC'); await p.waitForTimeout(400);
    ok(/Casa Cruza · Recife\/PE · não marcou este dia como livre/.test(await p.textContent('#dpCasa')), 'a casa recolhida mostra o motivo');
    const sd = await p.getAttribute('#dpSemCasa [data-dp-dia-sug]', 'data-dp-dia-sug');
    await p.click('#dpSemCasa [data-dp-dia-sug]'); await p.waitForTimeout(400);
    ok(sd === dia3 && await p.inputValue('#dpDia') === dia3 && /Com match em .*: 1 casa e 1 artista/.test(await p.textContent('#dpForm')), 'tocar na sugestão troca o dia para um com casa e artista livres');
    await p.selectOption('[data-dpb="cid"]', 'Recife/PE'); await p.waitForTimeout(400);
    ok(!!(await p.$('[data-dpb="cid"]')), 'filtro por cidade');
  } catch (e) { ok(false, 'quebrou: ' + e.message.split('\n')[0]); }
  ok(!erros.length, 'sem erro JS ' + erros.join(' | '));
  console.log(res.join('\n')); await b.close();
})();
