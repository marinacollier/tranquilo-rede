// Bases "Casas de Shows" e "Artistas e bandas" do Notion dentro do portal (pedido da Marina, 18/11/2026: "tudo").
//
// Duas fontes, o mesmo formato:
//   1. API do Notion (NOTION_TOKEN): TODOS os campos. Cada campo é classificado por nome:
//      - campos da lista EQUIPE (e que não parecem sensíveis) vão no pacote da equipe;
//      - todo o resto (inclusive campo novo que alguém criar no Notion) vai SÓ no pacote cifrado da administração (priv).
//   2. Retrato data/casas.psv e data/artistas.psv: só campos não sensíveis (o repositório é público).
// Nada daqui vai para a camada pública (public.json). Nenhum valor é escrito em log: só contagens.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { consultarTudo, valor, titulosDaApi, chave } from './dados.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CASAS_DS = '31e83bbf-4e84-8013-b34e-000b5103d685';
export const ARTISTAS_DS = 'ba4e8a02-f73a-4f8d-b055-49e2e495dbd1';

// Qualquer campo cujo nome bata aqui é sensível, mesmo que esteja numa lista da equipe (trava dupla).
export const SENSIVEL = /cnpj|cpf|raz[aã]o social|e-?mail|telefone|whats|contato|dono|franqueado|aluguel|incluso no aluguel|pix|banc|conta e dv|conta banc|ag[eê]ncia|cach[eê]|pagamento|\brg\b|nome completo|\bidades? (\(|da equipe)|nasceu|identidade de g|orienta[cç][aã]o sexual|\bra[cç]a\b|pronome|restri[cç]|notas internas|consentimento|grafias alternativas e varia|integrantes|contratos/i;

// Campo do Notion -> chave curta do registro (usada nas telas). Os demais campos da equipe vão em x (rótulo: valor).
const CASA_CURTO = {
  'Nome fantasia': 'n', 'Capacidade máxima em pé (informada)': 'cp', 'Capacidade máxima sentado (informada)': 'cs', 'Metragem (m²)': 'm2',
  'Andares': 'and', 'Menores de idade': 'men', 'Avaliação (padrão Tranquilo)': 'av', 'Instagram': 'ig', 'Site': 'site', 'Link do rider técnico': 'rider',
};
const CASA_EQUIPE = new Set([...Object.keys(CASA_CURTO), 'Cidade', 'Eventos nesta venue', 'Descrição da casa de shows (venue)', 'Observações importantes sobre capacidade',
  'Como chegar (p/ público)', 'Endereço e ref.', 'Complemento do endereço', 'Localização', 'Porte do espaço', 'Capacidade consolidada de pessoas sentadas',
  'Tiqueteira exclusiva (texto)', 'Nome da tiqueteira exclusiva', 'Padrão do link exclusivo (texto)', 'Padrão do link da tiqueteira exclusiva',
  'Aeroporto mais próximo com voos comerciais', 'Nomes e grafias alternativas para desambiguação', 'Observações de duplicidade', 'Dados verificados',
  'Ultima revisão pela IA', 'Fotos do local', 'Arquivo do rider técnico']);
const ART_CURTO = {
  'Nome artístico': 'n', 'Onde reside (texto)': 'mora', 'Gênero musical': 'gen', 'Status de curadoria': 'st', 'Link do Instagram': 'ig', 'Link de Spotify': 'sp',
  'Link do YouTube': 'yt', 'Link do Deezer': 'dz', 'Website oficial': 'site', 'Slug no site': 'slug', 'Tempo de show': 'tempo',
  'Já se apresentou no Tranquilo antes? (manual)': 'ja', '# vezes em que se apresentou no Tranquilo (manual)': 'vz',
  'Praça preferencial do Tranquilo': 'praca', 'Concorrência — bloqueio até': 'bloq',
};
const ART_EQUIPE = new Set([...Object.keys(ART_CURTO), 'Mini release / Mini bio', 'Observação importante (sem métricas)', 'Estágio de carreira', 'Onde reside (relação)',
  'Praça preferencial do Tranquilo', 'Praças do Tranquilo sugeridas', 'Link das necessidades técnicas', 'Link do Ferve', 'Spotify Artist ID', 'Chartmetric Artist ID',
  'Chartmetric stage score', 'Chartmetric career trend', 'Instagram - Seguidores', 'Spotify - Seguidores', 'S4A - Seguidores', 'Perfil no S4A', 'Score interno de relevância',
  '# vezes em que se apresentou no Tranquilo', '# vezes que se apresentou no Tranquilo (inferido)', 'Voz (qtd)', 'Violão (qtd)', 'Piano/teclado (qtd)', 'Outros instrumentos',
  'Tem lançamento autoral previsto?', 'Data prevista do lançamento', 'Status concorrência (cópia)', 'Concorrência — bloqueio até', 'Concorrência — notas e evidências',
  'Data do cadastro original', 'Por onde ficou sabendo do Tranquilo', 'Link da artista no site do Tranquilo', 'Label ou empresa responsável', 'Cadastro no Notion feito em',
  'Verificado', 'Histórico de line-ups', 'Músicas de trabalho', 'Materiais de divulgação', 'Status do link Instagram', 'Status do link Spotify', 'Canais nas redes sociais']);
// Relações cujo título vale buscar (poucas páginas); as outras viram "N itens".
const REL_TITULO = new Set(['Cidade', 'Onde reside (relação)', 'Estágio de carreira', 'Praça preferencial do Tranquilo', 'Label ou empresa responsável', 'Aeroporto mais próximo com voos comerciais', 'Tiqueteira com exclusividade']);

/** 'equipe' ou 'adm' para um campo da base ('casas' | 'artistas'). Campo desconhecido = adm. */
export function classificarCampo(base, nome) {
  const lista = base === 'casas' ? CASA_EQUIPE : ART_EQUIPE;
  if (SENSIVEL.test(nome) && !/^(Gênero musical|Nome fantasia|Nome artístico)$/.test(nome)) return 'adm';
  return lista.has(nome) ? 'equipe' : 'adm';
}

const semHifen = (id) => String(id || '').replace(/-/g, '');
const ufs = new Set('AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' '));
// "Rua X, 10, Bairro, Florianópolis - SC, 88015-400, Brazil" -> ["Florianópolis", "SC"]
export function cidadeDoEndereco(end) {
  const partes = String(end || '').split(',').map((s) => s.trim()).filter((s) => s && !/^\d{5}-?\d{3}$/.test(s) && !/^bra[sz]il$/i.test(s));
  for (let i = partes.length - 1; i >= 0; i--) {
    const m = partes[i].match(/^(.+?)\s*[-–/]\s*([A-Z]{2})$/); if (m && ufs.has(m[2])) return [m[1].trim(), m[2]];
    if (ufs.has(partes[i]) && i > 0) return [partes[i - 1], partes[i]];
  }
  return [null, null];
}
const texto = (v) => (Array.isArray(v) ? v.join(', ') : v == null ? '' : String(v));
const vazio = (v) => v == null || v === '' || (Array.isArray(v) && !v.length);

// ---------- API ----------
async function lerBase(token, ds, base) {
  const paginas = (await consultarTudo(token, ds)).filter((pg) => !pg.in_trash && !pg.archived);
  const ids = new Set();
  for (const pg of paginas) for (const [nome, p] of Object.entries(pg.properties)) if (p.type === 'relation' && REL_TITULO.has(nome)) p.relation.forEach((r) => ids.add(semHifen(r.id)));
  const titulos = await titulosDaApi(token, [...ids]);
  const curto = base === 'casas' ? CASA_CURTO : ART_CURTO;
  return paginas.map((pg) => {
    const r = { id: semHifen(pg.id), x: {}, priv: {} };
    for (const [nome, p] of Object.entries(pg.properties)) {
      if (p.type === 'button') continue;
      let v = valor(p);
      if (p.type === 'relation') {
        if (nome === 'Eventos nesta venue') { r.evN = v; continue; }
        v = REL_TITULO.has(nome) ? v.map((id) => titulos[id]?.nome).filter(Boolean) : v.length ? `${v.length} ${v.length === 1 ? 'item' : 'itens'}` : null;
        if (nome === 'Cidade' && v?.length) r.cid = v[0];
      }
      if (vazio(v)) continue;
      if (classificarCampo(base, nome) === 'adm') { r.priv[nome] = v; continue; }
      if (curto[nome]) r[curto[nome]] = v; else r.x[nome] = v;
    }
    if (base === 'casas') {
      const [c, uf] = cidadeDoEndereco(r.x['Localização'] || r.x['Endereço e ref.']);
      r.cid = (r.cid || c || '').replace(/\s*[-/]\s*[A-Z]{2}$/, '') || null; r.uf = uf;
    } else {
      r.ja = r.ja === true; if (!r.mora && r.x['Onde reside (relação)']) r.mora = texto(r.x['Onde reside (relação)']); r.alt = String(pg.properties['Grafias alternativas e variações'] ? valor(pg.properties['Grafias alternativas e variações']) || '' : '')
        .split(/[;\n•]+/).map((s) => s.replace(/["“”-]/g, '').trim()).filter((s) => s.length > 1 && !/\d{3}/.test(s));
    }
    r.n = texto(r.n);
    return r;
  });
}
export const casasDaApi = (token) => lerBase(token, CASAS_DS, 'casas');
export const artistasDaApi = (token) => lerBase(token, ARTISTAS_DS, 'artistas');

// ---------- retrato ----------
async function lerPsv(arquivo, campos) {
  let txt; try { txt = await readFile(path.join(RAIZ, arquivo), 'utf8'); } catch (e) { if (e.code === 'ENOENT') return []; throw e; }
  return txt.split('\n').filter((l) => l.trim() && !l.startsWith('#')).map((l, i) => {
    const p = l.split('|'); if (p.length !== campos.length) throw new Error(`${arquivo}: linha ${i + 1} tem ${p.length} campos (esperado ${campos.length})`);
    return Object.fromEntries(campos.map((c, j) => [c, p[j].trim()]));
  });
}
const n = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v));
export const CAMPOS_CASA = ['id', 'nome', 'cidade', 'uf', 'cap_pe', 'cap_sentado', 'metragem', 'andares', 'menores', 'avaliacao', 'instagram', 'site', 'rider', 'eventos'];
export const CAMPOS_ARTISTA = ['id', 'nome', 'mora', 'generos', 'status', 'instagram', 'spotify', 'youtube', 'deezer', 'site', 'slug', 'tempo_show', 'ja_tocou', 'vezes_manual', 'praca_preferencial', 'bloqueio_ate'];
export async function casasDoRetrato(arquivo = 'data/casas.psv') {
  return (await lerPsv(arquivo, CAMPOS_CASA)).map((r) => ({
    id: r.id, n: r.nome, cid: r.cidade || null, uf: r.uf || null, cp: n(r.cap_pe), cs: n(r.cap_sentado), m2: n(r.metragem), and: n(r.andares),
    men: r.menores || null, av: r.avaliacao || null, ig: r.instagram || null, site: r.site || null, rider: r.rider || null,
    evN: r.eventos ? r.eventos.split(',') : [], x: {}, priv: {},
  }));
}
export async function artistasDoRetrato(arquivo = 'data/artistas.psv') {
  return (await lerPsv(arquivo, CAMPOS_ARTISTA)).map((r) => ({
    id: r.id, n: r.nome, mora: r.mora || null, gen: r.generos ? r.generos.split(',') : [], st: r.status || null, ig: r.instagram || null, sp: r.spotify || null,
    yt: r.youtube || null, dz: r.deezer || null, site: r.site || null, slug: r.slug || null, tempo: r.tempo_show || null, ja: r.ja_tocou === 'sim', vz: n(r.vezes_manual),
    praca: r.praca_preferencial ? r.praca_preferencial.split(',') : [], bloq: r.bloqueio_ate || null, alt: [], x: {}, priv: {},
  }));
}

// ---------- montagem dos pacotes ----------
const SEM = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const wd = (iso) => new Date(iso + 'T12:00:00Z').getUTCDay();
const top = (cont, max = 4) => Object.entries(cont).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, max);

/**
 * Liga as bases aos eventos e calcula a disponibilidade SUGERIDA pelo histórico.
 * Devolve { equipe, adm }: o mesmo conteúdo, mas só adm leva priv (campos sensíveis).
 * ev = ids dos eventos (os eventos completos já estão no pacote).
 * sug (casa) = dias da semana com mais eventos; sug (artista) = cidades e formatos em que já tocou.
 */
export function montarBases(casas, artistas, eventos, apelidos = {}) {
  const porId = new Map(eventos.map((e) => [e.id, e]));
  const casaRegs = casas.map((c) => {
    const ids = new Set([...(c.evN || []).filter((id) => porId.has(id)), ...eventos.filter((e) => e.casaId === c.id).map((e) => e.id)]);
    const evs = [...ids].map((id) => porId.get(id)).sort((a, b) => a.data.localeCompare(b.data));
    const dias = {}; for (const e of evs) if (!e.cancelado) dias[SEM[wd(e.data)]] = (dias[SEM[wd(e.data)]] || 0) + 1;
    const cid = c.cid || evs.find((e) => e.cidade !== 'Sem praça')?.cidade || null;
    const { evN, priv, ...resto } = c;
    return { reg: { ...resto, cid, ev: evs.map((e) => e.id), sug: Object.keys(dias).length ? { dias: top(dias, 3) } : null }, priv };
  });
  const k = (s) => chave(apelidos[chave(s)] || s);
  const porArtista = new Map();
  for (const e of eventos) for (const a of e.artistas) { const kk = k(a); if (!porArtista.has(kk)) porArtista.set(kk, []); porArtista.get(kk).push(e); }
  const artRegs = artistas.map((a) => {
    const evs = [...new Map([a.n, ...(a.alt || [])].flatMap((nome) => porArtista.get(k(nome)) || []).map((e) => [e.id, e])).values()].sort((x, y) => x.data.localeCompare(y.data));
    const cids = {}, forms = {}; for (const e of evs) if (!e.cancelado) { if (e.cidade !== 'Sem praça') cids[e.cidade] = (cids[e.cidade] || 0) + 1; forms[e.modelo] = (forms[e.modelo] || 0) + 1; }
    const { alt, priv, ...resto } = a;
    return { reg: { ...resto, ev: evs.map((e) => e.id), sug: evs.some((e) => !e.cancelado) ? { cidades: top(cids, 5), formatos: top(forms, 4) } : null }, priv };
  });
  const pub = (L) => L.map((x) => x.reg);
  const comPriv = (L) => L.map((x) => (Object.keys(x.priv || {}).length ? { ...x.reg, priv: x.priv } : x.reg));
  const resumo = { casas: casas.length, artistas: artistas.length, casasComEventos: casaRegs.filter((x) => x.reg.ev.length).length, artistasComEventos: artRegs.filter((x) => x.reg.ev.length).length };
  return {
    equipe: { casas: pub(casaRegs), artistas: pub(artRegs) },
    adm: { casas: comPriv(casaRegs), artistas: comPriv(artRegs) },
    resumo,
  };
}
