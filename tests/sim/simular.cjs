// Simulador de operação (pedido da Marina, 24/11/2026): repete no portal o último mês real do Notion (25/10 a 24/11),
// deslocado 31 dias para a frente, com cada papel se comportando como o Thales descreveu. Roda no modo demonstração
// (localStorage, sem banco), com o relógio do navegador avançando. Gera o relatório de 1 semana e de 1 mês: números do
// Desempenho, o "Para você" de cada um, SOS, erros de JS e atritos de uso. Não toca em homolog nem em produção.
// Uso: BASE=http://localhost:PORTA/ node tests/sim/simular.cjs <pasta-de-saida>
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), vm = require('vm');
const RAIZ = path.join(__dirname, '..', '..'), B = process.env.BASE || 'http://localhost:8790/', OUT = process.argv[2] || '/tmp/sim';
fs.mkdirSync(OUT, { recursive: true });
const ctxR = { window: {} }; vm.createContext(ctxR); vm.runInContext(fs.readFileSync(path.join(RAIZ, 'src/regras.js'), 'utf8'), ctxR);
vm.runInContext(fs.readFileSync(path.join(RAIZ, 'src/modelos.js'), 'utf8'), ctxR);
const R = ctxR.window.TQRegras, MD = ctxR.window.TQModelos;

// ---------- 1. O mês real do Notion ----------
const ler = (a) => fs.readFileSync(path.join(RAIZ, 'data', a), 'utf8').split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.split('|'));
const casasN = new Map(ler('casas.psv').map(([id, nome, cidade, uf]) => [id, { nome, cidade: `${cidade.split('/')[0]}/${uf || ''}` }]));
const lineup = {}; for (const [ev, nome] of ler('lineup.psv')) (lineup[ev] ||= []).push(nome);
const DE = '2026-10-25', ATE = '2026-11-24', DESLOC = 31;
const mais = (iso, n) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const evsN = ler('eventos.psv').filter(([, nome, , d]) => d >= DE && d <= ATE && !/teste/i.test(nome)).map(([id, nome, status, data, , , , , , , casa]) => ({
  id: 'n' + id.slice(0, 8), nome, status, dia: mais(data, DESLOC), casa: casasN.get(casa) || { nome: (nome.split(' — ')[1] || 'Casa').trim(), cidade: '' },
  produto: /descubra/i.test(nome) ? 'Descubra' : 'Apresenta', artistas: lineup[id] || (nome.split(' — ')[2] ? [nome.split(' — ')[2]] : []) }));
const HOJE0 = mais(ATE, 0);   // dia 0 da simulação = 24/11; os eventos caem de 25/11 a 25/12

// ---------- 2. Gente ----------
const slug = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 20) || 'x';
const antes = new Date(Date.parse(HOJE0 + 'T12:00:00Z') - 20 * 864e5).toISOString();
const U = {}; const usuario = (id, tipo, nome, extra = {}) => { U[id] = { senha: 'segredo123', perfil: { id, email: id + '@sim.invalid', nome, tipo, codigo_acesso: null, vinculo_nome: extra.vinculo || null, criado_em: antes, tutorial_visto_em: antes, senha_definida: true, ...(extra.areas ? { areas: extra.areas } : {}) } }; return id; };
usuario('isa', 'equipe', 'Isa Sim', { areas: ['agenda'] }); usuario('bruno', 'equipe', 'Bruno Sim', { areas: ['marketing'] }); usuario('gui', 'equipe', 'Gui Sim', { areas: ['operacoes'] }); usuario('adm', 'adm', 'Adm Sim');
const casas = {}, casaDe = {};
for (const e of evsN) { const n = e.casa.nome; if (!casaDe[n]) { const uid = usuario('c_' + slug(n), 'casa', n, { vinculo: n }); casaDe[n] = uid; casas[uid] = { id: 'cs_' + uid, user_id: uid, dados: { nome: n, cidade_uf: e.casa.cidade, whatsapp: '11999990000' }, status: 'habilitada', pendencias: { habilitacao: [], match: [], enriquecimento: [] }, criado_em: antes, enviado_em: antes }; } }
const artDe = {}; for (const e of evsN) for (const a of e.artistas) artDe[a] ||= usuario('a_' + slug(a), 'artista', a, { vinculo: a });
// Novidades do mês: 2 casas novas (Ficha em análise), 3 artistas novos (inscrição na curadoria), 1 pessoa nova na equipe.
for (const [n, c] of [['Bar Novo Simulado', 'Recife/PE'], ['Casa Nova Simulada', 'Salvador/BA']]) { const uid = usuario('c_' + slug(n), 'casa', n, { vinculo: n }); casas[uid] = { id: 'cs_' + uid, user_id: uid, dados: { nome: n, cidade_uf: c }, status: 'em_analise', pendencias: { habilitacao: [], match: [], enriquecimento: [] }, criado_em: antes, enviado_em: mais(HOJE0, 2) + 'T12:00:00Z' }; }
const insc = {}; for (const n of ['Artista Novo Um', 'Artista Novo Dois', 'Artista Novo Três']) { const uid = usuario('a_' + slug(n), 'artista', n); insc[uid] = { id: 'i_' + uid, user_id: uid, dados: { nome_artistico: n, cidade: 'São Paulo/SP' }, status: 'em_curadoria', score: 60, faixa: 'Avaliar', enviado_em: mais(HOJE0, 3) + 'T12:00:00Z', criado_em: antes }; }

// ---------- 3. Comportamento de cada papel (diagnóstico do Thales, 21/11/2026) ----------
let semente = 7; const rnd = () => ((semente = (semente * 16807) % 2147483647) / 2147483647);
const PERFIL = {
  operacoes: { noPrazo: 0.85, atrasa: 0.10 },                                      // Gui: em geral no prazo
  agenda: { noPrazo: 0.70, atrasa: 0.20, incompleto: 0.30 },                       // Isa: corre atrás, mas passa adiante incompleto
  marketing: { noPrazo: 0.80, atrasa: 0.10, larga: 0.55, resgate: 0.30 },          // Bruno: começa bem, não fecha o pós-evento
};
const datasP = [], contr = [], chk = [], eventosLog = [];
// Campanhas (tq-demo-hub), dias feitos pela casa (db.campFeitos), equipe da casa (db.eqc) e quem usa o portal entre os artistas.
const hub = { campanhas: [], itens: [] }, campFeitos = [], eqc = [], usaPortal = {}, eqcFeita = new Set();
let anaEntrou = false;
for (const e of evsN) {
  datasP.push({ id: e.id, dia: e.dia, casa_id: casas[casaDe[e.casa.nome]].id, casa_nome: e.casa.nome, produto: e.produto, cidade: e.casa.cidade, abertura: '19:00', status: 'confirmada', criado_em: antes,
    artistas: e.artistas.map((a, i) => ({ nome: a, user_id: artDe[a], ordem: i + 1 })) });
}
const marcar = (uid, ev, item, dia) => chk.push({ user_id: uid, evento_id: 'p:' + ev, item, feito: true, atualizado_em: dia + 'T15:00:00.000Z' });
/** Aplica tudo o que acontece no dia D (em ordem). */
function pronto(chave, e) {
  if (chave === 'op:contrato') return contr.some((c) => c.casa && c.evento_id === 'p:' + e.id && c.status === 'assinado');
  if (chave === 'op:equipe') return eqc.filter((m) => m.casa_ref === e.casa.nome && !m.reserva).length >= 5 && eqc.some((m) => m.casa_ref === e.casa.nome && m.reserva);
  if (chave === 'mk:campanha') return hub.campanhas.some((c) => c.casa_ref === e.casa.nome);
  return true;
}
function simularDia(D) {
  simularDia.adiados = simularDia.adiados.filter((a) => { if (datasP.find((x) => x.id === a.e.id)?.status === 'cancelada' || !pronto(a.chave, a.e)) return true; marcar(a.uid, a.e.id, a.chave, D); return false; });
  for (const e of evsN) {
    const dp = datasP.find((x) => x.id === e.id); if (dp.status === 'cancelada') continue;
    // Cancelado no Notion: cancela 10 dias antes da data (como aconteceu com os Apresenta de dezembro).
    if (/cancelad|adiad/i.test(e.status) && D === mais(e.dia, -10)) { dp.status = 'cancelada'; eventosLog.push(`${D}: cancelada ${e.dia} ${e.casa.nome}`); continue; }
    for (const papel of ['operacoes', 'agenda', 'marketing']) {
      for (const [chave, dias] of MD.PASSOS_EQUIPE[papel]) {
        const prazo = mais(e.dia, dias), P = PERFIL[papel], quem = { operacoes: 'gui', agenda: anaEntrou && rnd() < 0.4 ? 'ana' : 'isa', marketing: 'bruno' }[papel];
        const k = `${e.id}|${chave}`; if (simularDia.feito.has(k)) continue;
        let quando = null, porQuem = quem;
        const r = rnd(), pos = dias > 0;
        if (papel === 'marketing' && pos) { if (r < 1 - P.larga) quando = prazo; else if (rnd() < P.resgate) { quando = mais(prazo, 3); porQuem = 'adm'; } }
        else if (r < P.noPrazo) quando = prazo; else if (r < P.noPrazo + P.atrasa) quando = mais(prazo, 1 + Math.floor(rnd() * 3));
        if (quando !== D) { if (quando && quando < D) simularDia.feito.add(k); continue; }
        // Contratos: a Isa gera os contratos no dia; com chance de esquecer um artista e marcar Feito mesmo assim.
        if (chave === 'ag:contratos') { const arts = dp.artistas.slice(0, papel === 'agenda' && rnd() < P.incompleto && dp.artistas.length > 1 ? -1 : undefined);
          for (const a of arts) contr.push({ id: `ct_${e.id}_${a.user_id}`, user_id: a.user_id, evento_id: 'p:' + e.id, titulo: `Show ${a.nome}`, texto: 'Contrato simulado '.repeat(10), campos: [], dados: {}, status: 'enviado', criado_por: 'isa', criado_em: D + 'T14:00:00.000Z' }); }
        if (chave === 'ag:assinados' && contr.some((c) => c.evento_id === 'p:' + e.id && c.status !== 'assinado') && rnd() > P.incompleto) continue;   // espera assinar
        // Gente cuidadosa espera o dado chegar: contrato da casa assinado, equipe completa, campanha carregada.
        if (!pronto(chave, e)) { simularDia.adiados.push({ k, uid: porQuem, e, chave }); simularDia.feito.add(k); continue; }
        marcar(porQuem, e.id, chave, D); simularDia.feito.add(k);
      }
    }
    // Campanha: o Bruno carrega a campanha da casa no D-30 em 80% das datas; a casa marca cada dia com 70% de chance.
    if (D === (mais(e.dia, -30) < HOJE0 ? HOJE0 : mais(e.dia, -30)) && rnd() < 0.8) {
      let c = hub.campanhas.find((x) => x.casa_ref === e.casa.nome);
      if (!c) { c = { id: 'camp_' + casaDe[e.casa.nome], slug: ('sim-' + slug(e.casa.nome)).slice(0, 40).padEnd(3, 'x'), titulo: `Campanha ${e.casa.nome}`, casa_ref: e.casa.nome, importada_em: D + 'T12:00:00Z', importada_por: 'bruno' }; hub.campanhas.push(c); }
      for (const n of [-14, -10, -7, -3, -1]) if (mais(e.dia, n) >= D) hub.itens.push({ id: `it_${e.id}_${-n}`, campanha_id: c.id, chave: `d${-n}_${e.id}`, dia: mais(e.dia, n), rotulo: `D${n}`, acoes: [{ canal: 'Instagram', texto: 'Post simulado' }], ativo: true });
      hub.itens.sort((a, b) => a.dia.localeCompare(b.dia));
    }
    for (const it of hub.itens) if (it.id.startsWith(`it_${e.id}_`) && it.dia === D && rnd() < 0.7) campFeitos.push({ item_id: it.id, feito_por: casaDe[e.casa.nome], feito_em: D + 'T20:00:00.000Z', nota: null });
    // Contrato da casa: o Gui gera no D-10; a casa assina 1 a 5 dias depois (85%).
    if (D === mais(e.dia, -10)) contr.push({ id: `ctc_${e.id}`, user_id: casaDe[e.casa.nome], evento_id: 'p:' + e.id, titulo: `Parceria ${e.casa.nome}`, texto: 'Contrato da casa simulado '.repeat(8), campos: [], dados: {}, status: 'enviado', criado_por: 'gui', criado_em: D + 'T14:00:00.000Z', casa: true });
    // Equipe da casa: 70% das casas cadastram a equipe completa até o D-14 da primeira data; 30% ficam incompletas.
    const cuid = casaDe[e.casa.nome];
    if (!eqcFeita.has(cuid) && D === mais(e.dia, -16)) { eqcFeita.add(cuid); const completa = rnd() < 0.7;
      for (const f of completa ? ['lider', 'anfitriao', 'social_media', 'som', 'porta'] : ['lider', 'anfitriao']) eqc.push({ id: `eq_${cuid}_${f}`, casa_ref: e.casa.nome, nome: `${f} da ${e.casa.nome}`, funcoes: [f], reserva: false, criado_por: cuid, criado_em: D + 'T12:00:00Z' });
      if (completa) eqc.push({ id: `eq_${cuid}_res`, casa_ref: e.casa.nome, nome: `Reserva da ${e.casa.nome}`, funcoes: ['porta'], reserva: true, criado_por: cuid, criado_em: D + 'T12:00:00Z' }); }
    // Artistas: 60% usam o portal (OK do briefing no D-18 e assinam 1 a 6 dias depois de receber); o resto não usa.
    for (const a of dp.artistas) { if (!(a.user_id in usaPortal)) usaPortal[a.user_id] = rnd() < 0.6; if (usaPortal[a.user_id] && D === mais(e.dia, -18)) marcar(a.user_id, e.id, 'camp_ok', D); }
    // Assinaturas (artistas que usam o portal e casas).
    for (const c of contr) if (c.evento_id === 'p:' + e.id && c.status === 'enviado' && !c.nunca) { const dEnv = c.criado_em.slice(0, 10); if (!c.alvo) { c.alvo = c.casa ? (rnd() < 0.85 ? mais(dEnv, 1 + Math.floor(rnd() * 5)) : null) : usaPortal[c.user_id] ? mais(dEnv, 1 + Math.floor(rnd() * 6)) : null; if (!c.alvo) c.nunca = true; }
      if (c.alvo === D) { c.status = 'assinado'; c.assinado_em = D + 'T18:00:00.000Z'; c.assinado_nome = c.titulo.replace('Show ', '') + ' Sim'; } }
    for (const [chave, dias] of R.PASSOS_CASA) { const prazo = mais(e.dia, dias), k = `${e.id}|casa|${chave}`; if (simularDia.feito.has(k) || prazo !== D) continue; simularDia.feito.add(k); if (rnd() < 0.75) marcar(casaDe[e.casa.nome], e.id, chave, D); }
  }
}
simularDia.feito = new Set(); simularDia.adiados = [];

// ---------- 4. Ver o portal como cada pessoa, no dia D ----------
async function olhar(b, D, rotulo) {
  const db = { sessao: null, insc, reg: [], conv: {}, avisos: [], modContr: [], arqs: [], eqc, usuarios: U, casas, datasP, contr: contr.map(({ alvo, nunca, casa, ...c }) => c), chk, campFeitos, autoav: { isa: D + 'T10:00:00Z', bruno: D + 'T10:00:00Z' } };
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } }); const erros = [];
  await ctx.route('**/config.js*', (r) => r.fulfill({ contentType: 'application/javascript', body: 'window.TQ_CONFIG = {}; window.TQ_INICIO_MODELO = "2000-01-01";' }));
  await ctx.addInitScript((d) => { try { localStorage.setItem('tq-consentimento', 'tudo'); localStorage.setItem('tq-sem-trilha', '1'); localStorage.setItem('tq-tutorial-publico', '1'); localStorage.setItem('tq-demo-v1', d[0]); localStorage.setItem('tq-demo-hub', d[1]); } catch {} }, [JSON.stringify(db), JSON.stringify(hub)]);
  const q = await ctx.newPage(); await q.setViewportSize({ width: 1440, height: 900 }); await q.clock.install({ time: new Date(D + 'T13:00:00-03:00') });
  q.on('pageerror', (e) => erros.push(e.message)); q.on('dialog', (d) => d.accept());
  const entrar = async (uid) => { await q.goto(B); await q.waitForSelector('.cidade'); await q.click('#entrar'); await q.waitForSelector('#esenha'); await q.waitForTimeout(300); await q.fill('#email', uid + '@sim.invalid'); await q.fill('#esenha', 'segredo123'); await q.click('#eok'); await q.waitForTimeout(900); try { await q.click('[data-tour="pular"]', { timeout: 1200 }); } catch {} };
  const sair = async () => { try { await q.click('#sair'); await q.waitForTimeout(300); } catch {} };
  const ir = (k) => q.evaluate((k) => { const a = TQConta.areaDe(k); if (a) { S.sub = S.sub || {}; S.sub[a] = k; S.aba = a; } else S.aba = k; render(); }, k);
  const txt = async (sel) => (await q.$(sel)) ? (await q.textContent(sel)).replace(/\s+/g, ' ').trim() : '(não apareceu)';
  const r = { dia: D, rotulo, papeis: {}, desempenho: {}, erros };
  for (const uid of ['isa', 'bruno', 'gui', ...(U.ana ? ['ana'] : [])]) {
    await entrar(uid); await ir('hoje'); await q.waitForTimeout(1200);
    r.papeis[uid] = { painel: await txt('details[data-dobra="md-painel"] summary') };
    await q.screenshot({ path: path.join(OUT, `${rotulo}-${uid}-para-voce.png`), fullPage: false });
    r.papeis[uid].sos = Number(((r.papeis[uid].painel.match(/(\d+) SOS/) || [])[1]) || 0);
    if (uid === 'isa' || uid === 'bruno') { await ir('evolucao'); await q.waitForTimeout(800); r.papeis[uid].evolucao = await txt('#app details.card summary'); }
    await sair();
  }
  await entrar('adm'); await ir('desempenho'); await q.waitForTimeout(1500);
  for (const p of ['agenda', 'marketing', 'operacoes']) {
    r.desempenho[p] = { resumo: await txt(`details[data-dobra="dsp-${p}"] summary`) };
    if ((await q.$(`details[data-dobra="dsp-${p}"] summary`))) { await q.click(`details[data-dobra="dsp-${p}"] summary`); await q.waitForTimeout(150); r.desempenho[p].leitura = await txt(`details[data-dobra="dsp-${p}"] .dsp-leitura`); r.desempenho[p].proximo = (await txt(`details[data-dobra="dsp-${p}"] .dsp-evoluir`)).slice(0, 400);
      r.desempenho[p].incompletosPorPasso = await q.$$eval(`details[data-dobra="dsp-${p}-inc"] li:not(.md-data) b`, (bs) => bs.reduce((o, b) => { o[b.textContent] = (o[b.textContent] || 0) + 1; return o; }, {})); }
  }
  await q.screenshot({ path: path.join(OUT, `${rotulo}-adm-desempenho.png`), fullPage: true });
  await ir('acompanhamento'); await q.waitForTimeout(1200); r.acompanhamento = await txt('.md-kpis');
  // Prints para a apresentação da habilitação (PRINTS=1, só na semana 1): telas reais do portal com os dados simulados.
  if (process.env.PRINTS && rotulo === 'semana1') {
    const P = path.join(OUT, 'prints'); fs.mkdirSync(P, { recursive: true });
    const shot = async (nome, sel) => { await q.waitForTimeout(700); const el = sel ? await q.$(sel) : null; if (el) await el.screenshot({ path: path.join(P, nome + '.png') }); else await q.screenshot({ path: path.join(P, nome + '.png') }); };
    const abrir = async (sel) => { const el = await q.$(sel); if (el) { await el.click(); await q.waitForTimeout(300); } };
    await ir('piloto'); await q.waitForTimeout(800); await abrir('[data-piloto]'); await shot('adm-piloto', '#app');
    await sair();
    // Isa: Para você aberto (SOS com foco, artistas fora do portal) e Criar datas.
    await entrar('isa'); await ir('hoje'); await q.waitForTimeout(1200); await abrir('details[data-dobra="md-painel"] summary'); await shot('isa-para-voce', 'details[data-dobra="md-painel"]');
    await abrir('details[data-dobra="md-art-fora"] summary'); const af = await q.$('details[data-dobra="md-art-fora"]'); if (af) await af.screenshot({ path: path.join(P, 'isa-artistas-fora.png') });
    await ir('datas_portal'); await q.waitForTimeout(1200); await shot('isa-criar-datas', '#app'); await sair();
    // Bruno: Para você (acompanhar até o fim, fechar a data).
    await entrar('bruno'); await ir('hoje'); await q.waitForTimeout(1200); await abrir('details[data-dobra="md-painel"] summary'); await shot('bruno-para-voce', 'details[data-dobra="md-painel"]'); await sair();
    // Gui: Para você.
    await entrar('gui'); await ir('hoje'); await q.waitForTimeout(1200); await abrir('details[data-dobra="md-painel"] summary'); await shot('gui-para-voce', 'details[data-dobra="md-painel"]'); await sair();
    // Casa: próximos passos (campanha) e disponibilidade.
    const casaUid = Object.keys(casas).find((u) => casas[u].status === 'habilitada');
    await entrar(casaUid); await ir('datas_casa'); await q.waitForTimeout(1200); await shot('casa-proximos-passos', '#app'); await ir('disp_g'); await q.waitForTimeout(1200); await shot('casa-disponibilidade', '#app'); await sair();
    // Artista: contrato.
    const artUid = Object.keys(U).find((u) => U[u].perfil.tipo === 'artista' && contr.some((c) => c.user_id === u && c.status === 'enviado'));
    if (artUid) { await entrar(artUid); await ir('contratos_meus'); await q.waitForTimeout(1200); await shot('artista-contrato', '#app'); await sair(); }
    // Primeiro acesso: "Crie a sua senha".
    const dd = JSON.parse(await q.evaluate(() => localStorage.getItem('tq-demo-v1'))); dd.usuarios.gui.perfil.senha_definida = false; await q.evaluate((d) => localStorage.setItem('tq-demo-v1', d), JSON.stringify(dd));
    await entrar('gui'); await q.waitForTimeout(800); await shot('senha-nova', '#app'); await entrar('adm');
  }
  await sair(); await ctx.close(); return r;
}

function relatorioMd(rel) {
  const n = (t, re) => (String(t || '').match(re) || [])[1] ?? '–';
  const linhas = ['# Simulação de operação · mês real do Notion (25/10 a 24/11) repetido de 25/11 a 25/12', '',
    `${evsN.length} eventos · ${Object.keys(casaDe).length} casas · ${Object.keys(artDe).length} artistas · ${hub.campanhas.length} campanhas · ${contr.filter((c) => c.casa).length} contratos de casa · ${contr.filter((c) => !c.casa).length} contratos de artista (${contr.filter((c) => c.status === 'assinado').length} assinados no total) · equipe da casa: ${eqcFeita.size} casas cadastraram · ${Object.values(usaPortal).filter(Boolean).length} de ${Object.keys(usaPortal).length} artistas usam o portal · Ana entrou no dia 15.`, ''];
  for (const r of rel) {
    linhas.push(`## ${r.rotulo === 'semana1' ? '1 semana' : '1 mês'} (${r.dia})`, '', '| Papel | No prazo | Datas fechadas | Incompletos | SOS no Para você |', '|---|---|---|---|---|');
    for (const [p, uid] of [['agenda', 'isa'], ['marketing', 'bruno'], ['operacoes', 'gui']]) { const t = r.desempenho[p]?.resumo; linhas.push(`| ${p} | ${n(t, /(\d+)% no prazo/)}% | ${n(t, /(\d+)% das datas/)}% | ${n(t, /(\d+) incompleto/)} | ${r.papeis[uid]?.sos ?? '–'} |`); }
    linhas.push('', 'Repasses incompletos por passo: ' + ['agenda', 'marketing', 'operacoes'].map((p) => `${p}: ${Object.entries(r.desempenho[p]?.incompletosPorPasso || {}).map(([t, q]) => `${t} ${q}`).join(', ') || 'nenhum'}`).join(' · '));
    if (r.papeis.ana) linhas.push('', `Ana (nova na agenda): ${r.papeis.ana.painel}`);
    linhas.push('', `Erros de JS: ${r.erros.length ? r.erros.join(' | ') : 'nenhum'}`, '');
  }
  const m = rel[rel.length - 1], atr = [];
  for (const [uid, x] of Object.entries(m.papeis)) { const ab = +n(x.painel, /(\d+) abertos em datas passadas/), sc = +n(x.painel, /(\d+) sem conferir/); if (ab > 20) atr.push(`${uid}: ${ab} passos abertos em datas que já passaram depois de 1 mês (lista longa sem "fechar a data").`); if (sc > 10) atr.push(`${uid}: ${sc} passos "sem conferir".`); }
  const s1 = rel[0]; for (const [uid, x] of Object.entries(s1.papeis)) if (x.sos > 15) atr.push(`${uid}: ${x.sos} SOS na primeira semana (muito para uma pessoa).`);
  linhas.push('## Atritos', '', ...(atr.length ? atr.map((a) => '- ' + a) : ['- nenhum acima dos limites']), '');
  return linhas.join('\n');
}

(async () => {
  const b = await chromium.launch(), rel = [];
  console.log(`Mês do Notion: ${evsN.length} eventos (${evsN.filter((e) => /realizado/i.test(e.status)).length} realizados, ${evsN.filter((e) => /cancelad|adiad/i.test(e.status)).length} cancelados/adiados) · ${Object.keys(casaDe).length} casas · ${Object.keys(artDe).length} artistas`);
  for (let d = 0; d <= 31; d++) { const D = mais(HOJE0, d); if (d === 15) { usuario('ana', 'equipe', 'Ana Sim', { areas: ['agenda'] }); U.ana.perfil.criado_em = D + 'T09:00:00Z'; anaEntrou = true; } simularDia(D); if (d === 7) rel.push(await olhar(b, D, 'semana1')); if (d === 31) rel.push(await olhar(b, D, 'mes1')); }
  fs.writeFileSync(path.join(OUT, 'relatorio.json'), JSON.stringify({ eventos: evsN.length, contratos: contr.length, assinados: contr.filter((c) => c.status === 'assinado').length, marcas: chk.length, cancelamentos: eventosLog, olhares: rel }, null, 1));
  fs.writeFileSync(path.join(OUT, 'relatorio.md'), relatorioMd(rel));
  console.log(JSON.stringify(rel, null, 1)); await b.close();
})();
