// Desempenho da equipe (pedido do Thales e da Marina, 23/11/2026): métricas só para a adm; a equipe vê, no "Para você",
// o que ficou aberto em datas que passaram (acompanhar até o fim) e o que marcou como feito sem estar completo.
const { chromium } = require('playwright');
const B = process.env.BASE || 'http://localhost:8790/'; const res = []; const ok = (c, m) => { res.push((c ? 'OK    ' : 'FALHA ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch(); const erros = [];
  const dia = (n) => new Date(Date.now() - 3 * 3600e3 + n * 864e5).toISOString().slice(0, 10);
  const antes = new Date(Date.now() - 864e5).toISOString();
  const U = (id, tipo, nome, extra = {}) => [id, { senha: 'segredo123', perfil: { id, email: id + '@teste.invalid', nome, tipo, codigo_acesso: null, vinculo_nome: extra.vinculo || null, criado_em: antes, tutorial_visto_em: antes, senha_definida: true, ...(extra.areas ? { areas: extra.areas } : {}) } }];
  const casa = (uid, nome) => [uid, { id: 'c-' + uid, user_id: uid, dados: { nome, cidade_uf: 'Recife/PE', whatsapp: '81988887777' }, status: 'habilitada', pendencias: { habilitacao: [], match: [], enriquecimento: [] }, criado_em: antes, enviado_em: antes }];
  const ct = (id, uid, ev, titulo) => ({ id, user_id: uid, evento_id: ev, titulo, texto: 'Contrato de teste '.repeat(10), campos: [], dados: {}, status: 'enviado', criado_por: 'isa', criado_em: antes });
  const data = (id, n) => ({ id, dia: dia(n), casa_id: 'c-cx', casa_nome: 'Casa Modelo', produto: 'Descubra', cidade: 'Recife/PE', abertura: '19:00', status: 'confirmada', criado_em: antes,
    artistas: [{ nome: 'Artista Um', user_id: 'a1', ordem: 1 }, { nome: 'Artista Dois', user_id: 'a2', ordem: 2 }] });
  const db = { sessao: null, insc: {}, reg: [], conv: {}, avisos: [], modContr: [], arqs: [], eqc: [],
    usuarios: Object.fromEntries([U('gui', 'equipe', 'Gui Teste', { areas: ['operacoes'] }), U('isa', 'equipe', 'Isa Teste', { areas: ['agenda'] }), U('bruno', 'equipe', 'Bruno Teste', { areas: ['marketing'] }), U('adm', 'adm', 'Adm Teste'),
      U('cx', 'casa', 'Casa Modelo', { vinculo: 'Casa Modelo' }), U('a1', 'artista', 'Artista Um', { vinculo: 'Artista Um' }), U('a2', 'artista', 'Artista Dois', { vinculo: 'Artista Dois' })]),
    casas: Object.fromEntries([casa('cx', 'Casa Modelo')]),
    // dp0 já passou (há 3 dias): o "Material da noite" do Bruno (D+2) venceu ontem e ninguém marcou.
    // dp1 é daqui a 12 dias: a Isa marcou "Contratos enviados" (D-14), mas a Artista Dois está sem contrato no portal.
    datasP: [data('dp0', -3), data('dp1', 12)],
    contr: [ct('ct-a1', 'a1', 'p:dp1', 'Show Artista Um')],
    chk: [{ user_id: 'isa', evento_id: 'p:dp1', item: 'ag:contratos', feito: true, atualizado_em: new Date(Date.now() - 4 * 864e5).toISOString() }] };
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route('**/config.js*', (r) => r.fulfill({ contentType: 'application/javascript', body: 'window.TQ_CONFIG = {};' }));
  await ctx.addInitScript((d) => { try { localStorage.setItem('tq-consentimento', 'tudo'); localStorage.setItem('tq-sem-trilha', '1'); localStorage.setItem('tq-dp-aberto', '1'); localStorage.setItem('tq-tutorial-publico', '1'); if (!localStorage.getItem('tq-demo-v1')) localStorage.setItem('tq-demo-v1', d); } catch {} }, JSON.stringify(db));
  const q = await ctx.newPage(); q.on('pageerror', (e) => erros.push(e.message)); q.on('dialog', (d) => d.accept());
  const entrar = async (uid) => { await q.goto(B); await q.waitForSelector('.cidade'); await q.click('#entrar'); await q.waitForSelector('#esenha'); await q.waitForTimeout(300); await q.fill('#email', uid + '@teste.invalid'); await q.fill('#esenha', 'segredo123'); await q.click('#eok'); await q.waitForTimeout(800); try { await q.click('[data-tour="pular"]', { timeout: 1500 }); } catch {} };
  const sair = async () => { await q.click('#sair'); await q.waitForTimeout(300); };
  const ir = (k) => q.evaluate((k) => { const a = TQConta.areaDe(k); if (a) { S.sub = S.sub || {}; S.sub[a] = k; S.aba = a; } else S.aba = k; render(); }, k);
  const menu = () => q.evaluate(() => [...document.querySelectorAll('[data-sub]')].map((x) => x.dataset.sub).join(' '));
  try {
    // 1. Isa: aviso de repasse incompleto no "Para você"; não vê o Desempenho.
    await entrar('isa'); await ir('hoje'); await q.waitForSelector('details[data-dobra="md-painel"]', { timeout: 6000 });
    ok(/1 sem conferir/.test(await q.textContent('details[data-dobra="md-painel"] summary')), 'Isa: o resumo do painel conta "1 sem conferir"');
    await q.click('details[data-dobra="md-painel"] summary'); await q.waitForTimeout(200);
    const pi = await q.textContent('details[data-dobra="md-painel"]');
    ok(/Marcado como feito, mas o portal ainda não confere \(1\)/.test(pi) && /Contratos dos artistas enviados/.test(pi), 'Isa: "Contratos enviados" marcado sem contrato da Artista Dois aparece como repasse incompleto');
    ok(!/desempenho/.test(await menu()) && !/Desempenho da equipe/.test(await q.textContent('body')), 'Isa: não vê "Desempenho da equipe"');
    await ir('desempenho'); await q.waitForTimeout(300);
    ok(!/no prazo \(/.test(await q.textContent('#app')), 'Isa: mesmo forçando a tela, não aparece nenhuma métrica');
    await sair();
    // 2. Bruno: acompanhar até o fim (data passada com passo aberto); não vê o Desempenho.
    await entrar('bruno'); await ir('hoje'); await q.waitForSelector('details[data-dobra="md-painel"]', { timeout: 6000 }); await q.waitForTimeout(400);
    await q.click('details[data-dobra="md-painel"] summary'); await q.waitForTimeout(200);
    const pb = await q.textContent('details[data-dobra="md-painel"]');
    ok(/Acompanhar até o fim: ficou aberto em datas que já passaram/.test(pb) && /Material da noite recebido/.test(pb), 'Bruno: o "Material da noite" da data que passou aparece para fechar');
    const caixa = await q.$('details[data-dobra="md-painel"] [data-passo-eq="p:dp0|mk:material"]');
    ok(!!caixa, 'Bruno: o passo aberto tem o Feito para fechar ali mesmo');
    ok(!/desempenho/.test(await menu()), 'Bruno: não vê "Desempenho da equipe"');
    await sair();
    // 3. Adm: vê o Desempenho com os números de cada papel, tudo fechado.
    await entrar('adm'); await ir('desempenho'); await q.waitForSelector('details[data-dobra="dsp-agenda"]', { timeout: 6000 });
    ok(/Desempenho da equipe/.test(await q.textContent('#app')) && /só a adm vê/.test(await q.textContent('#app')), 'adm: abre "Desempenho da equipe", marcado como só da adm');
    ok(!(await q.$eval('details[data-dobra="dsp-agenda"]', (d) => d.open)), 'adm: cada papel começa fechado');
    const sa = await q.textContent('details[data-dobra="dsp-agenda"] summary');
    ok(/1 incompleto/.test(sa) && /qualidade do repasse/.test(sa), `adm: Isa com 1 repasse incompleto e o foco em qualidade (${sa.replace(/\s+/g, ' ').trim()})`);
    await q.click('details[data-dobra="dsp-marketing"] summary'); await q.waitForTimeout(200);
    const sm = await q.textContent('details[data-dobra="dsp-marketing"]');
    ok(/Fechou 0 de 1 datas que já passaram/.test(sm) && /datas fechadas até o fim \(0 de 1\)/.test(sm), 'adm: Bruno fechou 0 de 1 datas que passaram');
    ok(/Como cada número é calculado/.test(await q.textContent('#app')), 'adm: explica como cada número é calculado');
    ok(/desempenho/.test(await menu()), 'adm: "Desempenho da equipe" está no menu da Administração');
    await sair();
  } catch (e) { ok(false, 'quebrou: ' + e.message.split('\n')[0]); }
  ok(!erros.length, 'sem erro JS ' + erros.join(' | '));
  console.log(res.join('\n')); await b.close();
})();
