// Publica no banco os documentos que abrem dentro do portal (material_versoes.conteudo_html, banco v18).
// Lê os .html já decifrados de uma pasta temporária do GitHub Actions: o conteúdo nunca fica no repositório.
// Uso (Actions): node scripts/publicar-docs.mjs <pasta>   · precisa do segredo SUPABASE_ACCESS_TOKEN.
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const tok = process.env.SUPABASE_ACCESS_TOKEN, dir = process.argv[2];
if (!tok || !dir) { console.error('::error::Falta o SUPABASE_ACCESS_TOKEN ou a pasta.'); process.exit(1); }
const cfg = await readFile(new URL('../src/config.js', import.meta.url), 'utf8');
const ref = cfg.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
// Mesmo catálogo de src/conta.js (DOCS).
const DOCS = {
  'guia-do-franqueado': ['Guia do Franqueado', 'operacoes', null, 'guia'],
  'comece-por-aqui': ['Comece por aqui · O que é o Tranquilo', 'marketing', null, 'guia'],
  'semana-social-media': ['#Descubra · A semana do social media', 'marketing', 'social_media', 'playbook'],
  'semana-lideranca-local': ['#Descubra · A semana da liderança local', 'marketing', 'lider', 'playbook'],
  'briefing-anfitriao': ['Briefing · Anfitrião da noite', 'marketing', 'anfitriao', 'briefing'],
  'briefing-fotografo': ['Briefing · Fotógrafo da noite', 'marketing', null, 'briefing'],
  'modelos-marketing': ['Modelos · artes, briefings e mensagens prontas', 'marketing', null, 'template'],
  'como-briefar-artistas': ['Artistas · como briefar cada um', 'marketing', null, 'guia'],
};
const APOSENTADOS = ['plano-acao-rooftap', 'playbook-descubra', 'playbook-apresenta', 'semana-lideranca-local-sp', 'semana-social-media-sp'];
const VERSAO_PADRAO = process.env.VERSAO_PADRAO || new Date().toISOString().slice(0, 10).split('-').reverse().join('/');
const lit = (s) => (s == null ? 'null' : `'${String(s).replace(/'/g, "''")}'`);
async function q(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, { method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) });
  const t = await r.text(); if (!r.ok) throw new Error(`HTTP ${r.status} ${t.slice(0, 300)}`); return JSON.parse(t);
}
let n = 0;
for (const arq of (await readdir(dir)).filter((f) => f.endsWith('.html')).sort()) {
  const slug = arq.replace(/\.html$/, ''), d = DOCS[slug];
  if (!d) { console.log(`ignorado: ${arq} (nome fora do catálogo)`); continue; }
  const html = await readFile(path.join(dir, arq), 'utf8');
  const versao = html.match(/Vers[ãa]o\s+(\d+(?:\.\d+)+)/i)?.[1] || VERSAO_PADRAO;
  const tag = '$tqdoc' + Math.random().toString(36).slice(2, 8) + '$';
  if (html.includes(tag)) throw new Error('marcador repetido no conteúdo');
  await q(`begin;
insert into materiais (slug, titulo, area, funcao, tipo_material, publico, fonte_url)
  values (${lit(slug)}, ${lit(d[0])}, ${lit(d[1])}, ${lit(d[2])}, ${lit(d[3])}, '{casa}', 'https://marinacollier.github.io/tranquilo-rede/#/materiais')
  on conflict (slug) do update set ativo = true, titulo = excluded.titulo;
insert into material_versoes (material_id, versao, resumo, conteudo_html)
  select id, case when exists (select 1 from material_versoes v where v.material_id = m.id and v.versao = ${lit(versao)}) then ${lit(versao)} || ' (' || to_char(now() at time zone 'America/Sao_Paulo', 'HH24:MI') || ')' else ${lit(versao)} end,
    'Abre dentro do portal', ${tag}${html}${tag}
  from materiais m where slug = ${lit(slug)};
${d[1] === 'marketing' ? `update materiais set ativo = false where slug in (${APOSENTADOS.map(lit).join(', ')});` : ''}
commit;`);
  console.log(`OK: ${d[0]} (versão ${versao}, ${Math.round(html.length / 1024)} KB)`); n++;
}
console.log(`${n} documento(s) publicados.`);
