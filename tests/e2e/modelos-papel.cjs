// Modelo de cada papel (pedido da Marina, 18/11/2026): padrão por data, ação funcionando, SOS com ação pronta,
// acompanhamento e método, para Gui, Isa, Bruno, adm, casa e artista. Modo demonstração com dados semeados.
const { chromium } = require('playwright');
const B = process.env.BASE || 'http://localhost:8790/'; const res = []; const ok = (c, m) => { res.push((c ? 'OK    ' : 'FALHA ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch(); const erros = [];
  const dia = (n) => new Date(Date.now() - 3 * 3600e3 + n * 864e5).toISOString().slice(0, 10);
  const antes = new Date(Date.now() - 864e5).toISOString(), dezDias = new Date(Date.now() - 10 * 864e5).toISOString();
  const U = (id, tipo, nome, extra = {}) => [id, { senha: 'segredo123', perfil: { id, email: id + '@teste.invalid', nome, tipo, codigo_acesso: null, vinculo_nome: extra.vinculo || null, criado_em: antes, tutorial_visto_em: antes, senha_definida: true, ...(extra.areas ? { areas: extra.areas } : {}) } }];
  const casa = (uid, nome, status, extra = {}) => [uid, { id: 'c-' + uid, user_id: uid, dados: { nome, cidade_uf: 'Recife/PE', whatsapp: '81988887777' }, status, pendencias: { habilitacao: [], match: [], enriquecimento: [] }, criado_em: antes, enviado_em: antes, ...extra }];
  const ct = (id, uid, titulo) => ({ id, user_id: uid, evento_id: 'p:dp1', titulo, texto: 'Contrato de teste '.repeat(10), campos: [], dados: {}, status: 'enviado', criado_por: 'gui', criado_em: antes });
  const db = { sessao: null, insc: {}, reg: [], conv: {}, avisos: [], modContr: [], arqs: [], eqc: [],
    usuarios: Object.fromEntries([U('gui', 'equipe', 'Gui Teste', { areas: ['operacoes'] }), U('isa', 'equipe', 'Isa Teste', { areas: ['agenda'] }), U('bruno', 'equipe', 'Bruno Teste', { areas: ['marketing'] }), U('adm', 'adm', 'Adm Teste'),
      U('cx', 'casa', 'Casa Modelo', { vinculo: 'Casa Modelo' }), U('parada', 'casa', 'Casa Parada', { vinculo: 'Casa Parada' }), U('a1', 'artista', 'Artista Um', { vinculo: 'Artista Um' }), U('a2', 'artista', 'Artista Dois', { vinculo: 'Artista Dois' })]),
    casas: Object.fromEntries([casa('cx', 'Casa Modelo', 'habilitada'), casa('parada', 'Casa Parada', 'em_analise', { enviado_em: dezDias })]),
    datasP: [{ id: 'dp1', dia: dia(8), casa_id: 'c-cx', casa_nome: 'Casa Modelo', produto: 'Descubra', cidade: 'Recife/PE', abertura: '19:00', status: 'confirmada', criado_em: antes,
      artistas: [{ nome: 'Artista Um', user_id: 'a1', ordem: 1 }, { nome: 'Artista Dois', user_id: 'a2', ordem: 2 }] }],
    contr: [ct('ct-casa', 'cx', 'Parceria Casa Modelo'), ct('ct-a1', 'a1', 'Show Artista Um')],
    chk: [{ user_id: 'cx', evento_id: 'p:dp1', item: 'handoff', feito: true, atualizado_em: antes }] };
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route('**/config.js*', (r) => r.fulfill({ contentType: 'application/javascript', body: 'window.TQ_CONFIG = {};' }));
  await ctx.addInitScript((d) => { try { localStorage.setItem('tq-consentimento', 'tudo'); localStorage.setItem('tq-sem-trilha', '1'); localStorage.setItem('tq-dp-aberto', '1'); localStorage.setItem('tq-tutorial-publico', '1'); if (!localStorage.getItem('tq-demo-v1')) localStorage.setItem('tq-demo-v1', d); } catch {} }, JSON.stringify(db));
  const q = await ctx.newPage(); q.on('pageerror', (e) => erros.push(e.message)); q.on('dialog', (d) => d.accept());
  const entrar = async (uid) => { await q.goto(B); await q.waitForSelector('.cidade'); await q.click('#entrar'); await q.waitForSelector('#esenha'); await q.waitForTimeout(300); await q.fill('#email', uid + '@teste.invalid'); await q.fill('#esenha', 'segredo123'); await q.click('#eok'); await q.waitForTimeout(800); try { await q.click('[data-tour="pular"]', { timeout: 1500 }); } catch {} };
  const sair = async () => { await q.click('#sair'); await q.waitForTimeout(300); };
  const ir = (k) => q.evaluate((k) => { const a = TQConta.areaDe(k); if (a) { S.sub = S.sub || {}; S.sub[a] = k; S.aba = a; } else S.aba = k; render(); }, k);
  const app = () => q.textContent('#app');
  try {
    // 1. Gui: "Para você" com o painel do modelo, fechadinho, e os SOS de Operações com a ação pronta.
    await entrar('gui'); await ir('hoje'); await q.waitForSelector('details[data-dobra="md-painel"]', { timeout: 6000 });
    ok(!(await q.$eval('details[data-dobra="md-painel"]', (d) => d.open)), 'Gui: o painel "Seu modelo de trabalho" começa fechado');
    const st = await q.textContent('details[data-dobra="md-painel"] summary');
    ok(/Gui · Operações/.test(st) && /% feito/.test(st) && /\d+ SOS/.test(st), `Gui: o resumo diz % feito, atrasados e SOS (${st.replace(/\s+/g, ' ').trim()})`);
    await q.click('details[data-dobra="md-painel"] summary'); await q.waitForTimeout(200);
    const pv = await q.textContent('details[data-dobra="md-painel"]');
    ok(/Contrato da casa sem assinar/.test(pv) && /Equipe da casa incompleta/.test(pv) && /Ficha de Casa Parada sem habilitar há 10 dias/.test(pv), 'Gui: SOS de contrato da casa (D-10), equipe incompleta (D-14) e Ficha parada há 7+ dias');
    const wa = await q.$eval('details[data-dobra="md-painel"] a[href*="wa.me/5581988887777"]', (a) => decodeURIComponent(a.href));
    ok(/contrato da data de/.test(wa) || /equipe da casa ainda está sem/.test(wa), 'Gui: "Cobrar a casa no WhatsApp" abre com o número da casa e a mensagem pronta');
    ok(/Ação funcionando/.test(pv) && (await q.$$('details[data-dobra="md-painel"] [data-passo-eq]')).length > 0, 'Gui: "Ação funcionando" traz o próximo passo de cada data, com Feito');
    // 2. Acompanhamento: papéis, data fechada que abre, Feito com quem e quando, método.
    await ir('acompanhamento'); await q.waitForSelector('.md-kpis');
    const kpis = await q.$$eval('.md-kpi b', (xs) => xs.map((x) => x.textContent));
    ok(kpis.join('|') === 'Gui · Operações|Isa · Agenda|Bruno · Marketing|Casa|Artistas', `Acompanhamento: um painel por papel (${kpis.join(', ')})`);
    ok(!(await q.$eval('details[data-dobra="md-data:p:dp1"]', (d) => d.open)) && /Isa\s*\d+%/.test(await q.textContent('details[data-dobra="md-data:p:dp1"] summary')), 'a data começa fechada, com o % de cada papel na linha');
    await q.click('details[data-dobra="md-data:p:dp1"] summary'); await q.waitForTimeout(200);
    await q.click('details[data-dobra="md-eq:p:dp1:operacoes"] summary'); await q.waitForTimeout(200);
    await q.check('[data-passo-eq="p:dp1|op:porta"]'); await q.waitForTimeout(700);
    ok(/feito por você em \d\d\/\d\d/.test(await q.$eval('[data-passo-eq="p:dp1|op:porta"]', (x) => x.closest('li').textContent)), 'Gui marca "Porta liberada na Ingresse": fica "feito por você em dd/mm"');
    ok(/conferido pelo portal/.test(await q.textContent('details[data-dobra="md-eq:p:dp1:operacoes"]')), 'o que o portal confere sozinho (Ficha habilitada) aparece "conferido pelo portal"');
    ok(/Conta como feito/.test(await app()) && (await q.$$('details[data-dobra="md-data:p:dp1"] [data-metodo-sec], details[data-dobra="md-data:p:dp1"] [data-ler], details[data-dobra="md-data:p:dp1"] [data-manual]')).length > 3, 'cada ação diz o que conta como feito e tem o "Como fazer"');
    await q.click('details[data-dobra="md-data:p:dp1"] [data-metodo-sec]'); await q.waitForTimeout(400);
    ok(!!(await q.$('#app h2.foco')), 'o "Como fazer: Método" abre o Método no trecho certo');
    await ir('acompanhamento'); await q.click('[data-dobra="md-padrao"] > summary'); await q.waitForTimeout(150);
    const pad = await q.textContent('[data-dobra="md-padrao"]');
    ok(/Isa · Agenda/.test(pad) && /Bruno · Marketing/.test(pad) && /Casa \(dono e equipe da casa\)/.test(pad) && /Regras do SOS/.test(pad), 'o padrão de cada papel e as regras do SOS ficam numa dobra');
    await sair();
    // 3. Isa: SOS de line-up incompleto (D-21) e de contratos, com escalar para a adm.
    await entrar('isa'); await ir('hoje'); await q.waitForSelector('details[data-dobra="md-painel"]', { timeout: 6000 });
    await q.click('details[data-dobra="md-painel"] summary'); await q.waitForTimeout(200);
    const pi = await q.textContent('details[data-dobra="md-painel"]');
    ok(/Line-up incompleto: 2 de 3/.test(pi) && /Contrato de Artista Um sem assinar/.test(pi) && /Contrato de Artista Dois não enviado/.test(pi) && !/Contrato da casa/.test(pi), 'Isa: SOS de line-up, contrato sem assinar e não enviado (só o que é da Agenda)');
    await q.click('details[data-dobra="md-painel"] [data-sos-escalar$="|lineup"]'); await q.waitForTimeout(700);
    ok(/escalado por você/.test(await app()), 'Isa escala o line-up para a adm: fica "escalado por você"');
    await sair();
    // 4. Bruno: SOS de data sem campanha.
    await entrar('bruno'); await ir('hoje'); await q.waitForSelector('details[data-dobra="md-painel"]', { timeout: 6000 }); await q.waitForTimeout(500);
    await q.click('details[data-dobra="md-painel"] summary'); await q.waitForTimeout(200);
    ok(/Data sem campanha carregada/.test(await q.textContent('details[data-dobra="md-painel"]')), 'Bruno: SOS de data a 21 dias sem campanha, com "Carregar a campanha"');
    await sair();
    // 5. Adm: vê o escalado e o Feito do Gui.
    await entrar('adm'); await ir('acompanhamento'); await q.waitForSelector('.md-kpis', { timeout: 6000 });
    const ad = await app();
    ok(/Escalado para a adm \(1\)/.test(ad) && /Line-up incompleto/.test(ad), 'adm: o SOS escalado aparece em destaque');
    await q.click('details[data-dobra="md-data:p:dp1"] summary'); await q.click('details[data-dobra="md-eq:p:dp1:operacoes"] summary'); await q.waitForTimeout(200);
    ok(/feito por Gui em \d\d\/\d\d/.test(await q.textContent('details[data-dobra="md-eq:p:dp1:operacoes"]')), 'adm: vê "feito por Gui" na hora');
    await sair();
    // 6. Casa: acompanhamento, SOS dela e passos com quem faz, conta como feito e como fazer.
    await entrar('cx'); await ir('passos'); await q.waitForTimeout(500);
    const pc = await app();
    ok(/Seu acompanhamento/.test(pc) && /SOS: algo está atrasado ou travado/.test(pc) && /Equipe da casa incompleta/.test(pc) && !!(await q.$('.md-sos-conta [data-ir="equipe_casa"]')), 'casa: acompanhamento e SOS com "Completar a equipe"');
    ok(/Contrato sem assinar/.test(pc) && !!(await q.$('.md-sos-conta [data-ct-abrir="ct-casa"]')), 'casa: SOS do contrato com "Abrir o contrato"');
    await q.click('details[data-dobra="pp-todos:p:dp1"] > summary'); await q.waitForTimeout(150);
    const todos = await q.textContent('details[data-dobra="pp-todos:p:dp1"]');
    ok(/quem faz: Líder Local/.test(todos) && /Conta como feito/.test(todos) && /Como fazer: Manual do Descubra/.test(todos) && /feito por você em/.test(todos), 'casa: cada passo com quem faz (função), o que conta como feito, o método e quem marcou');
    ok(!/Artista Um sem assinar|Line-up incompleto/.test(pc), 'casa vê só o que é dela');
    await sair();
    // 7. Artista: o SOS do próprio contrato.
    await entrar('a1'); await ir('passos'); await q.waitForTimeout(500);
    const pa = await app();
    ok(/Seu acompanhamento/.test(pa) && /Contrato sem assinar/.test(pa) && !!(await q.$('.md-sos-conta [data-ct-abrir="ct-a1"]')) && !/Equipe da casa/.test(pa), 'artista: SOS do contrato dele, sem o que é da casa');
  } catch (e) { ok(false, 'quebrou: ' + e.message.split('\n')[0]); }
  ok(!erros.length, 'sem erro JS ' + erros.join(' | '));
  console.log(res.join('\n')); await b.close();
})();
