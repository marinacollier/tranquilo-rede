// Leitura e normalização dos dados do Notion.
// Fonte 1: API oficial do Notion (quando NOTION_TOKEN existe).
// Fonte 2: retrato versionado em data/*.psv (atualizado pela rotina noturna).
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ref = JSON.parse(await readFile(path.join(RAIZ, 'data/referencias.json'), 'utf8'));

// Dia do show no horário de Brasília: "2026-11-08T00:30Z" é 07/11 às 21h30, não 08/11.
const diaSP = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
export const diaEmSP = (iso) => (/T\d/.test(iso || '') ? diaSP.format(new Date(iso)) : (iso || '').slice(0, 10));

export const EVENTOS_DS = '84c63e67-7b36-407c-9310-681ebc120393';
export const BASE_DS = '32d83bbf-4e84-8062-bf81-000b12eb93fb';

const semHifen = (id) => (id || '').replace(/-/g, '');
const num = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v));

// ---------- retrato .psv ----------
async function lerPsv(arquivo, campos) {
  const txt = await readFile(path.join(RAIZ, arquivo), 'utf8');
  const linhas = txt.split('\n').filter((l) => l.trim() && !l.startsWith('#'));
  return linhas.map((l, i) => {
    const partes = l.split('|');
    if (partes.length !== campos.length) {
      throw new Error(`${arquivo}: linha ${i + 1} tem ${partes.length} campos (esperado ${campos.length})`);
    }
    return Object.fromEntries(campos.map((c, j) => [c, partes[j].trim()]));
  });
}

export const CAMPOS_EVENTO = ['id', 'nome', 'status', 'data', 'geral', 'antecipada', 'porta', 'vip', 'cap', 'link', 'casa', 'tipo', 'praca', 'clima'];

export async function eventosDoRetrato(arquivo = 'data/eventos.psv') {
  return (await lerPsv(arquivo, CAMPOS_EVENTO)).map((r) => ({
    id: r.id, nome: r.nome, status: r.status || null, data: diaEmSP(r.data),
    geral: num(r.geral), antecipada: num(r.antecipada), porta: num(r.porta), vip: num(r.vip),
    publicoNotion: null, cap: num(r.cap), link: r.link || null,
    casa: r.casa || null, tipo: r.tipo || null, praca: r.praca || null, clima: r.clima || null,
  }));
}

export async function baseDoRetrato() {
  return lerPsv('data/base.psv', ['id', 'pergunta', 'status']);
}

// ---------- API do Notion ----------
const NOTION_VERSAO = '2025-09-03';
async function notion(token, metodo, rota, corpo) {
  for (let tentativa = 1; ; tentativa++) {
    const r = await fetch(`https://api.notion.com/v1/${rota}`, {
      method: metodo,
      headers: { Authorization: `Bearer ${token}`, 'Notion-Version': NOTION_VERSAO, 'Content-Type': 'application/json' },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    if (r.ok) return r.json();
    if ((r.status === 429 || r.status >= 500) && tentativa < 5) {
      await new Promise((ok) => setTimeout(ok, 2000 * tentativa));
      continue;
    }
    const erro = new Error(`Notion ${metodo} ${rota}: ${r.status} ${await r.text()}`);
    erro.status = r.status;
    throw erro;
  }
}

async function consultarTudo(token, dataSource) {
  const linhas = [];
  let cursor;
  do {
    const r = await notion(token, 'POST', `data_sources/${dataSource}/query`, { page_size: 100, start_cursor: cursor });
    linhas.push(...r.results);
    cursor = r.has_more ? r.next_cursor : undefined;
  } while (cursor);
  return linhas;
}

const texto = (p) => (p?.title || p?.rich_text || []).map((t) => t.plain_text).join('').trim();
function valor(p) {
  if (!p) return null;
  switch (p.type) {
    case 'title': case 'rich_text': return texto(p) || null;
    case 'number': return p.number;
    case 'url': return p.url;
    case 'select': return p.select?.name ?? null;
    case 'status': return p.status?.name ?? null;
    case 'date': return p.date?.start ?? null;
    case 'relation': return p.relation.map((x) => semHifen(x.id));
    case 'formula': return p.formula[p.formula.type] ?? null;
    default: return null;
  }
}

export async function eventosDaApi(token) {
  const paginas = await consultarTudo(token, EVENTOS_DS);
  return paginas.filter((pg) => !pg.in_trash && !pg.archived).map((pg) => {
    const P = pg.properties;
    const v = (nome) => valor(P[nome]);
    return {
      id: semHifen(pg.id), nome: v('Nome') || '', status: v('Status'), data: diaEmSP(v('Data') || ''),
      geral: v('Geral público (manual)'), antecipada: v('Ticketeira antecipada (manual)'),
      porta: v('Vendas na porta (manual)'), vip: v('Pessoas na lista VIP ou cortesias (manual)'),
      publicoNotion: typeof v('Público total (preferir automático)') === 'number' ? v('Público total (preferir automático)') : null,
      cap: v('Expectativa de público / Capacidade trabalhada - manual'), link: v('Link público de ingressos'),
      casa: (v('Casa (Venue)') || [])[0] || null, tipo: (v('Tipo de evento') || [])[0] || null,
      praca: (v('Realizado por') || [])[0] || null, clima: v('Tempo e clima'),
    };
  }).filter((e) => e.data);
}

export async function baseDaApi(token) {
  const paginas = await consultarTudo(token, BASE_DS);
  return paginas.filter((pg) => !pg.in_trash && !pg.archived).map((pg) => ({
    id: semHifen(pg.id), pergunta: valor(pg.properties['Pergunta']) || '', status: valor(pg.properties['Status da redação']) || '',
  }));
}

// Títulos de páginas relacionadas (casas, praças, modelos). Quando o banco não foi
// compartilhado com a integração, a API devolve 404 e usamos o que dá para inferir.
export async function titulosDaApi(token, ids) {
  const nomes = {};
  for (const id of ids) {
    try {
      const pg = await notion(token, 'GET', `pages/${id}`);
      const t = Object.values(pg.properties).find((p) => p.type === 'title');
      const cap = Object.entries(pg.properties).find(([k, p]) => p.type === 'number' && /capacidade/i.test(k));
      nomes[id] = { nome: texto(t), capacidade: cap ? cap[1].number : null };
    } catch (e) {
      if (e.status !== 404 && e.status !== 403) throw e;
    }
  }
  return nomes;
}

export async function textoDaPaginaApi(token, id) {
  const blocos = [];
  let cursor;
  do {
    const r = await notion(token, 'GET', `blocks/${id}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ''}`);
    blocos.push(...r.results);
    cursor = r.has_more ? r.next_cursor : undefined;
  } while (cursor);
  return blocos.map((b) => {
    const t = (b[b.type]?.rich_text || []).map((x) => x.plain_text).join('');
    if (b.type.startsWith('heading_1')) return `# ${t}`;
    if (b.type.startsWith('heading_2')) return `## ${t}`;
    if (b.type.startsWith('heading_3')) return `### ${t}`;
    if (b.type === 'quote') return `> ${t}`;
    if (b.type === 'bulleted_list_item' || b.type === 'numbered_list_item' || b.type === 'to_do') return `- ${t}`;
    if (b.type === 'divider') return '---';
    return t;
  }).join('\n');
}

// ---------- normalização ----------
const CIDADES_TITULO = [
  ['São Paulo', /s[ãa]o paulo|\bsp\b/i], ['Belo Horizonte', /belo horizonte|\bbh\b/i], ['Florianópolis', /floripa|florian[óo]polis/i],
  ['Rio de Janeiro', /rio de janeiro/i], ['Salvador', /salvador/i], ['Recife', /recife/i], ['Curitiba', /curitiba/i],
  ['Brasília', /bras[íi]lia/i], ['Santo André', /santo andr[ée]/i], ['Campinas', /campinas/i], ['Santos', /\bsantos\b/i],
  ['Sorocaba', /sorocaba/i], ['Porto Alegre', /porto alegre/i], ['Itajaí', /itaja[íi]/i],
];
const NAO_ARTISTA = /line-up|pendente|registrad|^tranquilo|^semana \d|^#|evento secreto|novo evento/i;
export const chave = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function cidadeDoTitulo(nome) {
  for (const [cidade, re] of CIDADES_TITULO) if (re.test(nome)) return cidade;
  return null;
}

// Extrai casa (entre parênteses no fim) e line-up do título do evento.
export function lerTitulo(nome) {
  let resto = nome.replace(/^\d{4}-\d{2}-\d{2}:\s*/, '').replace(/^\d{2}\/\d{2}\/\d{4}\s*—\s*/, '');
  let casa = null;
  const m = resto.match(/\(([^()]*)\)\s*$/);
  if (m) {
    if (!/pendente|registrad|^(sp|mg|rj|df|pr|sc|rs|ba|pe)$/i.test(m[1].trim())) casa = m[1].trim();
    resto = resto.slice(0, m.index).trim();
  }
  const partes = resto.split(/\s+—\s+/).map((s) => s.trim()).filter(Boolean);
  const ultimo = partes.length > 1 ? partes[partes.length - 1] : (/^semana|^#/i.test(partes[0] || '') ? '' : partes[0] || '');
  let candidatos = partes.length > 1 ? ultimo : '';
  if (partes.length === 2 && /^semana \d|^#descubra/i.test(partes[0])) candidatos = partes[1];
  if (!candidatos || cidadeDoTitulo(candidatos) === candidatos || CIDADES_TITULO.some(([c, re]) => re.test(candidatos) && candidatos.length < 25 && !/,| e /.test(candidatos))) {
    return { casa, artistas: [] };
  }
  const itens = candidatos.split(/\s*,\s*/);
  const ultimoItem = itens.pop();
  const sep = ultimoItem.match(/\s+e\s+(?![a-zà-ú]{1,3}\s)(?=[A-ZÀ-Úa-zà-ú0-9])/);
  if (sep && !/^(o|a|os|as|eu)$/i.test(ultimoItem.slice(sep.index + sep[0].length).split(' ')[0])) {
    itens.push(ultimoItem.slice(0, sep.index), ultimoItem.slice(sep.index + sep[0].length));
  } else itens.push(ultimoItem);
  const artistas = itens.flatMap((s) => s.split(/\s*\+\s*/)).map((s) => s.trim().replace(/^e\s+|\s+e$/g, '').trim()).filter((s) => s && !NAO_ARTISTA.test(s));
  return { casa, artistas };
}

function modeloDe(e) {
  if (e.tipo && ref.modelos[e.tipo]) return ref.modelos[e.tipo];
  if (/descubra/i.test(e.nome)) return 'Descubra';
  if (/apresenta/i.test(e.nome)) return 'Apresenta';
  if (e.data < '2026-01-01') return 'Clássico (2023–25)';
  return 'Sem modelo';
}

const ENCERRADO = new Set(['Cancelado', 'Adiado', 'Duplicado']);

export function normalizar(eventosBrutos, titulos = {}, hoje = diaEmSP(new Date().toISOString())) {
  const nomesCasa = {};
  for (const e of eventosBrutos) {
    const { casa } = lerTitulo(e.nome);
    if (e.casa && casa) (nomesCasa[e.casa] ||= {})[casa] = ((nomesCasa[e.casa] || {})[casa] || 0) + 1;
  }
  const nomeCasa = (id, cidade) => {
    if (!id) return null;
    if (titulos[id]?.nome) return titulos[id].nome;
    if (ref.casas[id]) return ref.casas[id];
    const op = nomesCasa[id];
    if (op) return Object.entries(op).sort((a, b) => b[1] - a[1])[0][0];
    return `Casa em ${cidade || 'cidade a definir'} · ${id.slice(0, 4)}`;
  };

  const eventos = eventosBrutos
    .filter((e) => !/^novo evento \(modelo\)$/i.test(e.nome.trim()))
    .map((e) => {
      const cidade = (e.praca && (titulos[e.praca]?.nome || ref.pracas[e.praca])) || cidadeDoTitulo(e.nome) || 'Sem praça';
      const { artistas } = lerTitulo(e.nome);
      // Vendidos = antecipada + porta. VIP/cortesia não é venda e não entra na estimativa de público.
      const soma = [e.antecipada, e.porta].some((x) => x != null) ? (e.antecipada || 0) + (e.porta || 0) : null;
      const publico = e.publicoNotion ?? e.geral ?? soma;
      const passado = e.data < hoje;
      const status = e.status || (passado ? 'Realizado' : 'Sem status');
      const cap = e.cap ?? titulos[e.casa]?.capacidade ?? null;
      return {
        id: e.id, nome: e.nome, data: e.data, status, cidade,
        modelo: modeloDe(e), casaId: e.casa, casa: nomeCasa(e.casa, cidade), artistas,
        publico: publico != null && publico > 0 ? publico : null, vendidos: soma, cap,
        link: e.link && !/linkdesativado|linkinutilizado/.test(e.link) ? e.link : null, clima: e.clima,
        realizado: passado && !ENCERRADO.has(status),
        cancelado: ENCERRADO.has(status) && status !== 'Duplicado',
        futuro: !passado && !ENCERRADO.has(status),
      };
    })
    .sort((a, b) => a.data.localeCompare(b.data));
  // Uma grafia só por artista (YOÚN / YOÙN, Giovanni / Giovani Cidreira): a dos apelidos em
  // referencias.json ou, sem apelido, a mais recente. Assim painel, pacotes e códigos contam igual.
  const apelidos = ref.artistas || {};
  const chaveDe = (nome) => chave(apelidos[chave(nome)] || nome);
  const exibido = {};
  for (const e of eventos) for (const nome of e.artistas) exibido[chaveDe(nome)] = apelidos[chave(nome)] || nome;
  for (const e of eventos) e.artistas = [...new Set(e.artistas.map((n) => exibido[chaveDe(n)]))];
  return eventos;
}
