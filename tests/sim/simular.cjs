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
for (const e of evsN) {
  datasP.push({ id: e.id, dia: e.dia, casa_id: casas[casaDe[e.casa.nome]].id, casa_nome: e.casa.nome, produto: e.produto, cidade: e.casa.cidade, abertura: '19:00', status: 'confirmada', criado_em: antes,
    artistas: e.artistas.map((a, i) => ({ nome: a, user_id: artDe[a], ordem: i + 1 })) });
}
const marcar = (uid, ev, item, dia) => chk.push({ user_id: uid, evento_id: 'p:' + ev, item, feito: true, atualizado_em: dia + 'T15:00:00.000Z' });
/** Aplica tudo o que acontece no dia D (em ordem). */
function simularDia(D) {
  for (const e of evsN) {
    const dp = datasP.find((x) => x.id === e.id); if (dp.status === 'cancelada') continue;
    // Cancelado no Notion: cancela 10 dias antes da data (como aconteceu com os Apresenta de dezembro).
    if (/cancelad|adiad/i.test(e.status) && D === mais(e.dia, -10)) { dp.status = 'cancelada'; eventosLog.push(`${D}: cancelada ${e.dia} ${e.casa.nome}`); continue; }
    for (const papel of ['operacoes', 'agenda', 'marketing']) {
      for (const [chave, dias] of MD.PASSOS_EQUIPE[papel]) {
        const prazo = mais(e.dia, dias), P = PERFIL[papel], quem = { operacoes: 'gui', agenda: 'isa', marketing: 'bruno' }[papel];
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
        marcar(porQuem, e.id, chave, D); simularDia.feito.add(k);
      }
    }
    // Artistas assinam 1 a 6 dias depois de receber (80%); a casa faz os passos dela (75% no prazo).
    for (const c of contr) if (c.evento_id === 'p:' + e.id && c.status === 'enviado' && !c.nunca) { const dEnv = c.criado_em.slice(0, 10); if (!c.alvo) { c.alvo = rnd() < 0.8 ? mais(dEnv, 1 + Math.floor(rnd() * 6)) : null; if (!c.alvo) c.nunca = true; }
      if (c.alvo === D) { c.status = 'assinado'; c.assinado_em = D + 'T18:00:00.000Z'; c.assinado_nome = c.titulo.replace('Show ', '') + ' Sim'; } }
    for (const [chave, dias] of R.PASSOS_CASA) { const prazo = mais(e.dia, dias), k = `${e.id}|casa|${chave}`; if (simularDia.feito.has(k) || prazo !== D) continue; simularDia.feito.add(k); if (rnd() < 0.75) marcar(casaDe[e.casa.nome], e.id, chave, D); }
  }
}
simularDia.feito = new Set();

// ---------- 4. Ver o portal como cada pessoa, no dia D ----------
async function olhar(b, D, rotulo) {
  const db = { sessao: null, insc, reg: [], conv: {}, avisos: [], modContr: [], arqs: [], eqc: [], usuarios: U, casas, datasP, contr, chk, autoav: { isa: D + 'T10:00:00Z', bruno: D + 'T10:00:00Z' } };
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } }); const erros = [];
  await ctx.route('**/config.js*', (r) => r.fulfill({ contentType: 'application/javascript', body: 'window.TQ_CONFIG = {};' }));
  await ctx.addInitScript((d) => { try { localStorage.setItem('tq-consentimento', 'tudo'); localStorage.setItem('tq-sem-trilha', '1'); localStorage.setItem('tq-tutorial-publico', '1'); localStorage.setItem('tq-demo-v1', d); } catch {} }, JSON.stringify(db));
  const q = await ctx.newPage(); await q.clock.install({ time: new Date(D + 'T13:00:00-03:00') });
  q.on('pageerror', (e) => erros.push(e.message)); q.on('dialog', (d) => d.accept());
  const entrar = async (uid) => { await q.goto(B); await q.waitForSelector('.cidade'); await q.click('#entrar'); await q.waitForSelector('#esenha'); await q.waitForTimeout(300); await q.fill('#email', uid + '@sim.invalid'); await q.fill('#esenha', 'segredo123'); await q.click('#eok'); await q.waitForTimeout(900); try { await q.click('[data-tour="pular"]', { timeout: 1200 }); } catch {} };
  const sair = async () => { try { await q.click('#sair'); await q.waitForTimeout(300); } catch {} };
  const ir = (k) => q.evaluate((k) => { const a = TQConta.areaDe(k); if (a) { S.sub = S.sub || {}; S.sub[a] = k; S.aba = a; } else S.aba = k; render(); }, k);
  const txt = async (sel) => (await q.$(sel)) ? (await q.textContent(sel)).replace(/\s+/g, ' ').trim() : '(não apareceu)';
  const r = { dia: D, rotulo, papeis: {}, desempenho: {}, erros };
  for (const uid of ['isa', 'bruno', 'gui']) {
    await entrar(uid); await ir('hoje'); await q.waitForTimeout(1200);
    r.papeis[uid] = { painel: await txt('details[data-dobra="md-painel"] summary') };
    await q.screenshot({ path: path.join(OUT, `${rotulo}-${uid}-para-voce.png`), fullPage: false });
    if (uid !== 'gui') { await ir('evolucao'); await q.waitForTimeout(800); r.papeis[uid].evolucao = await txt('#app details.card summary'); }
    await sair();
  }
  await entrar('adm'); await ir('desempenho'); await q.waitForTimeout(1500);
  for (const p of ['agenda', 'marketing', 'operacoes']) {
    r.desempenho[p] = { resumo: await txt(`details[data-dobra="dsp-${p}"] summary`) };
    if ((await q.$(`details[data-dobra="dsp-${p}"] summary`))) { await q.click(`details[data-dobra="dsp-${p}"] summary`); await q.waitForTimeout(150); r.desempenho[p].leitura = await txt(`details[data-dobra="dsp-${p}"] .dsp-leitura`); r.desempenho[p].proximo = (await txt(`details[data-dobra="dsp-${p}"] .dsp-evoluir`)).slice(0, 400); }
  }
  await q.screenshot({ path: path.join(OUT, `${rotulo}-adm-desempenho.png`), fullPage: true });
  await ir('acompanhamento'); await q.waitForTimeout(1200); r.acompanhamento = await txt('.md-kpis');
  await sair(); await ctx.close(); return r;
}

(async () => {
  const b = await chromium.launch(), rel = [];
  console.log(`Mês do Notion: ${evsN.length} eventos (${evsN.filter((e) => /realizado/i.test(e.status)).length} realizados, ${evsN.filter((e) => /cancelad|adiad/i.test(e.status)).length} cancelados/adiados) · ${Object.keys(casaDe).length} casas · ${Object.keys(artDe).length} artistas`);
  for (let d = 0; d <= 31; d++) { const D = mais(HOJE0, d); simularDia(D); if (d === 7) rel.push(await olhar(b, D, 'semana1')); if (d === 31) rel.push(await olhar(b, D, 'mes1')); }
  fs.writeFileSync(path.join(OUT, 'relatorio.json'), JSON.stringify({ eventos: evsN.length, contratos: contr.length, assinados: contr.filter((c) => c.status === 'assinado').length, marcas: chk.length, cancelamentos: eventosLog, olhares: rel }, null, 1));
  console.log(JSON.stringify(rel, null, 1)); await b.close();
})();
