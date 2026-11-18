// Sugestão POR HISTÓRICO (pedido da Marina, 18/11/2026): a partir das bases do Notion (retrato não sensível em
// data/casas.psv e data/artistas.psv) e dos eventos/line-up já retratados, gera src/bases.json com, para cada casa,
// os dias da semana em que ela mais recebeu o Tranquilo e, para cada artista, cidades, praça preferida, se já tocou,
// formatos e bloqueio de concorrência. Só campos públicos (nada de contato, documento ou valores).
import { readFile, writeFile } from 'node:fs/promises';
const ler = async (a) => (await readFile(new URL(`../data/${a}`, import.meta.url), 'utf8')).split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.split('|'));
const k = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\(teste\)/g, '').replace(/\s+/g, ' ').trim();
const ref = JSON.parse(await readFile(new URL('../data/referencias.json', import.meta.url), 'utf8'));
const TIPOS = Object.fromEntries(Object.entries(ref).flatMap(([, v]) => (v && typeof v === 'object' ? Object.entries(v) : [])).filter(([id, n]) => /^[0-9a-f]{32}$/.test(id) && typeof n === 'string'));
const casasL = await ler('casas.psv'), artL = await ler('artistas.psv'), evL = await ler('eventos.psv'), luL = await ler('lineup.psv');
// Pré-ficha da casa (18/11/2026): capacidade em pé e sentado, menores, site e rider também vão (campos públicos do espaço).
const casas = new Map(casasL.map(([id, nome, cidade, uf, cap_pe, cap_sentado, , , menores, avaliacao, instagram, site, rider]) => [id, { id, nome, cidade: cidade.split('/')[0], uf, cap: +cap_sentado || +cap_pe || null,
  cap_pe: +cap_pe || null, cap_sentado: +cap_sentado || null, menores: /^(Permite|Não permite)/.test(menores || '') ? menores : '', site: site || '', rider: rider || '', avaliacao, instagram, dias: [0, 0, 0, 0, 0, 0, 0], noites: 0, ultima: '' }]));
const evs = evL.map(([id, nome, status, data, , , , , , , casa, tipo]) => ({ id, status, data, casa, tipo: TIPOS[tipo] || (/descubra/i.test(nome) ? 'Descubra' : /apresenta/i.test(nome) ? 'Apresenta' : '') }));
const evPorId = new Map(evs.map((e) => [e.id, e]));
for (const e of evs) {
  const c = casas.get(e.casa); if (!c || !/realizado|vendas|confirmad|pré|andamento/i.test(e.status) || !/^\d{4}-\d{2}-\d{2}$/.test(e.data)) continue;
  c.dias[new Date(e.data + 'T12:00:00Z').getUTCDay()]++; c.noites++; if (e.data > c.ultima) c.ultima = e.data;
}
const tocou = new Map();
for (const [ev, nome] of luL) {
  const e = evPorId.get(ev); if (!e) continue; const c = casas.get(e.casa), x = tocou.get(k(nome)) || { vezes: 0, cidades: new Set(), formatos: new Set(), ultima: '' };
  x.vezes++; if (c?.cidade) x.cidades.add(c.cidade); if (e.tipo) x.formatos.add(e.tipo); if (e.data > x.ultima) x.ultima = e.data; tocou.set(k(nome), x);
}
const artistas = artL.map(([id, nome, mora, generos, status, instagram, spotify, , , , , , ja, vezes, praca, bloqueio]) => {
  const t = tocou.get(k(nome));
  return { id, nome, mora: (mora || '').split('/')[0], generos, status, instagram, spotify, ja_tocou: ja === 'sim' || !!t, vezes: Math.max(+vezes || 0, t?.vezes || 0),
    cidades: [...(t?.cidades || [])], formatos: [...(t?.formatos || [])], ultima: t?.ultima || '', praca: praca || '', bloqueio_ate: bloqueio || '' };
}).filter((a) => a.nome && !/reprovad|nao seguiu|não seguiu/i.test(a.status) && (a.ja_tocou || a.praca || a.mora));
const lista = [...casas.values()].filter((c) => c.nome);
// Fila de curadoria do Notion (status da base Artistas e bandas): o que ainda espera decisão, para a Isa ver no portal.
const FILA = ['Avaliando (curadoria)', 'Para avaliar (curadoria)', 'Para avaliar (pré-curadoria)', 'Pré-aprovado', 'Falta link / dados (completar)', 'Duplicata / ambíguo (revisar desambiguação)', 'Novo (sem triagem)'];
const fila = artL.filter((c) => FILA.includes(c[4])).map(([id, nome, mora, generos, status, instagram, spotify]) => ({ id, nome, mora: (mora || '').split('/')[0], generos, status, instagram, spotify }))
  .sort((a, b) => FILA.indexOf(a.status) - FILA.indexOf(b.status) || a.nome.localeCompare(b.nome, 'pt-BR'));
await writeFile(new URL('../src/bases.json', import.meta.url), JSON.stringify({ gerado: new Date().toISOString().slice(0, 10), casas: lista, artistas, fila, ordemFila: FILA }));
console.log(`fila de curadoria do Notion: ${fila.length}`);
console.log(`bases.json: ${lista.length} casas (${lista.filter((c) => c.noites).length} com noites) · ${artistas.length} artistas (${artistas.filter((a) => a.ja_tocou).length} já tocaram, ${artistas.filter((a) => a.praca).length} com praça preferida)`);
