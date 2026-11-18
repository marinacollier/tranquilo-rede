// Modelo de cada papel (src/modelos.js): padrão por data, ação funcionando, SOS e acompanhamento.
import '../src/regras.js';
import '../src/equipe.js';
import '../src/modelos.js';
const M = globalThis.TQModelos, R = globalThis.TQRegras;
let falhas = 0; const ok = (c, m) => { console.log((c ? 'OK    ' : 'FALHA ') + m); if (!c) falhas++; };
const hoje = '2026-11-18', mais = (n) => new Date(Date.parse(hoje + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);

// 1. Padrão: cada papel da equipe tem ações com prazo, quem faz, o que conta como feito e método.
for (const p of M.PAPEIS_EQUIPE) {
  const ls = M.PASSOS_EQUIPE[p];
  ok(ls.length >= 5 && ls.every((l) => /^(op|ag|mk):/.test(l[0]) && Number.isInteger(l[1]) && l[2] && l[3] && l[4] && l[5]), `${p}: ${ls.length} ações completas (prazo, o que fazer, conta como feito, método)`);
  ok(new Set(ls.map((l) => l[0])).size === ls.length, `${p}: chaves sem repetir`);
}
ok(R.PASSOS_CASA.every(([k]) => M.FEITO_CASA[k] && k in M.METODO_CASA), 'casa: todo passo tem "conta como feito" e método');
ok([...R.PASSOS_ARTISTA, ...R.CAMPANHA_ARTISTA.Descubra, ...R.CAMPANHA_ARTISTA.Apresenta].every(([k]) => M.FEITO_ARTISTA[k]), 'artista: todo passo (e da campanha) tem "conta como feito"');
ok(M.quemNaCasa('briefing_anfitriao') === 'Anfitrião' && M.quemNaCasa('rider').includes('Técnico de som'), 'casa: quem faz vem das funções da equipe');

// 2. Passos com conferência automática, Feito manual (quem e quando) e ação funcionando.
const dia = mais(12);
let ps = M.passos('operacoes', dia, { 'op:porta': { por: 'gui', em: '2026-11-18T10:00:00Z' } }, hoje, 'Descubra', { ficha: true });
ok(ps.find((p) => p.chave === 'op:ficha').feito && ps.find((p) => p.chave === 'op:ficha').marca.auto, 'Ficha habilitada: o portal confere sozinho');
ok(ps.find((p) => p.chave === 'op:porta').marca.por === 'gui', 'Feito manual guarda quem marcou e quando');
ok(M.proximo(ps).chave === 'op:treino' && ps.find((p) => p.chave === 'op:treino').atrasado, 'ação funcionando: o primeiro passo que ainda dá para fazer (o atrasado primeiro)');
const r = M.resumo(ps); ok(r.total === ps.length && r.feitos === 2 && r.pct === Math.round(200 / ps.length), `resumo: ${r.feitos}/${r.total} = ${r.pct}%`);
const casaPs = M.passos('casa', dia, {}, hoje, 'Apresenta');
ok(casaPs.length === R.PASSOS_CASA.length && casaPs[0].quem && casaPs[0].metodo, 'casa: reaproveita PASSOS_CASA com quem faz e método');
ok(M.passos('artista', dia, {}, hoje, 'Apresenta').some((p) => p.chave === 'camp_reel'), 'artista: reaproveita a campanha do formato');

// 3. SOS: limites de cada regra.
const base = { id: 'e1', hoje, casa: 'Casa X', produto: 'Descubra', whatsCasa: '81999990000' };
const regras = (ctx) => M.sosDaData({ ...base, ...ctx }).map((s) => s.regra);
ok(regras({ dia: mais(21), lineup: { n: 2, minimo: 3 } }).includes('lineup') && !regras({ dia: mais(22), lineup: { n: 2, minimo: 3 } }).includes('lineup'), 'line-up incompleto: dispara a 21 dias, não a 22');
ok(regras({ dia: mais(10), contratoCasa: 'enviado' }).includes('ct_casa') && !regras({ dia: mais(11), contratoCasa: 'enviado' }).includes('ct_casa') && !regras({ dia: mais(3), contratoCasa: 'assinado' }).includes('ct_casa'), 'contrato da casa: dispara a 10 dias e some quando assina');
ok(regras({ dia: mais(14), equipe: { completa: false, falta: 'Porta' } }).includes('equipe') && !regras({ dia: mais(15), equipe: { completa: false } }).includes('equipe'), 'equipe da casa incompleta: dispara a 14 dias');
const art = M.sosDaData({ ...base, dia: mais(4), artistas: [{ nome: 'Ana', whatsapp: '11988887777', contrato: 'enviado', atrasados: [] }] })[0];
ok(art.regra === 'ct:Ana' && art.acoes.some((a) => a.tipo === 'whatsapp' && /Ana/.test(a.texto) && /4 dias/.test(a.texto)) && art.acoes.some((a) => a.rotulo === 'Trocar o artista') && art.acoes.some((a) => a.tipo === 'escalar'), 'contrato de artista a 4 dias: cobrar no WhatsApp com mensagem pronta, trocar artista e escalar');
ok(!M.sosDaData({ ...base, dia: mais(8), artistas: [{ nome: 'Ana', contrato: 'enviado' }] })[0].acoes.some((a) => a.tipo === 'escalar'), 'a 8 dias ainda não escala');
ok(regras({ dia: mais(20), campanha: { existe: false, atrasados: 0 } }).includes('sem_campanha') && regras({ dia: mais(30), campanha: { existe: true, atrasados: 2 } }).includes('campanha'), 'marketing: data sem campanha a 21 dias e campanha atrasada');
ok(regras({ dia: mais(5), casaAtrasados: ['a', 'b'] }).includes('casa_atrasada') && !regras({ dia: mais(5), casaAtrasados: ['a'] }).includes('casa_atrasada'), 'casa com 2 passos atrasados vira SOS');
ok(!M.sosDaData({ ...base, dia: mais(-1), lineup: { n: 0, minimo: 3 } }).length, 'data que já passou não abre SOS');
const fichas = M.sosFichas([{ id: 'c1', nome: 'Casa A', status: 'em_analise', enviado_em: mais(-7) + 'T10:00:00Z' }, { id: 'c2', nome: 'Casa B', status: 'em_analise', enviado_em: mais(-6) + 'T10:00:00Z' }, { id: 'c3', nome: 'Casa C', status: 'habilitada', enviado_em: mais(-30) }], hoje);
ok(fichas.length === 1 && /Casa A/.test(fichas[0].titulo) && fichas[0].acoes[0].alvo === 'casa:c1', 'Ficha sem habilitar há 7 dias: SOS com "Abrir a Ficha"');
ok(M.REGRAS_SOS.every((x) => M.PAPEIS[x.papel] && x.quando && x.acao), 'regras do SOS descritas com papel, quando e ação');

// 4. feitosDe: a marca mais recente, sem os desmarcados.
const f = M.feitosDe([{ user_id: 'a', evento_id: 'e1', item: 'x', feito: true, atualizado_em: '2026-11-01' }, { user_id: 'b', evento_id: 'e1', item: 'x', feito: true, atualizado_em: '2026-11-02' }, { user_id: 'a', evento_id: 'e2', item: 'y', feito: true }, { user_id: 'a', evento_id: 'e1', item: 'z', feito: false }], 'e1');
ok(f.x.por === 'b' && !f.y && !f.z, 'feitosDe: quem marcou por último, só do evento, sem desmarcados');
ok(M.rotuloD(-14) === 'D-14' && M.rotuloD(0) === 'no dia' && M.rotuloD(2) === 'D+2', 'prazo legível: D-14, no dia, D+2');

console.log(falhas ? `${falhas} FALHA(S)` : 'Modelos por papel: tudo certo.');
process.exit(falhas ? 1 : 0);
