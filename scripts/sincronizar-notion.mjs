// Sincroniza as datas criadas no portal com o Notion (pedido da Marina, 24/11/2026: "se no Notion tá cancelado, cancela").
// Lê data/eventos.psv e data/lineup.psv (retrato do Notion) e a tabela datas_portal do ambiente (ALVO=prd|homolog).
// Sem APLICAR=1 só mostra as diferenças. Com APLICAR=1 cancela no portal as datas cujo evento no Notion está Cancelado.
// O log é público: só datas, casas, cidades e artistas (dados que já estão no site), nunca contato.
import { readFile } from 'node:fs/promises';
const token = process.env.SUPABASE_ACCESS_TOKEN; if (!token) { console.error('::error::SUPABASE_ACCESS_TOKEN ausente'); process.exit(1); }
const ALVO = process.env.ALVO === 'prd' ? 'prd' : 'homolog', APLICAR = process.env.APLICAR === '1';
const cfg = await readFile(new URL(`../src/${ALVO === 'prd' ? 'config.prd.js' : 'config.js'}`, import.meta.url), 'utf8');
const ref = cfg.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)[1];
const sql = async (query) => { const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) }); if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`); return r.json(); };
const k = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const ler = async (a) => (await readFile(new URL(`../data/${a}`, import.meta.url), 'utf8')).split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.split('|'));
const hoje = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const lineup = {}; for (const [ev, nome] of await ler('lineup.psv')) (lineup[ev] ||= []).push(nome);
// Título do Notion: "AAAA-MM-DD: Cidade — Artistas" ou "Tranquilo Apresenta — Cidade — Artista"
const evs = (await ler('eventos.psv')).map(([id, nome, status, data]) => ({ id, nome, status, data, cidade: (nome.split(' — ')[0].replace(/^\d{4}-\d{2}-\d{2}: ?/, '').replace(/^Tranquilo (Apresenta|Descubra)/i, '').trim()) || (nome.split(' — ')[1] || ''), artistas: lineup[id] || [] }))
  .filter((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.data) && e.data >= hoje && !/teste/i.test(e.nome));
const dps = await sql(`select id, dia::text, casa_nome, cidade, produto, status, artistas from datas_portal where dia >= '${hoje}' order by dia`);
console.log(`# ${ALVO.toUpperCase()}: ${dps.length} datas criadas no portal a partir de hoje; ${evs.length} eventos futuros no Notion`);
const casa = (d) => (dps.length, d);
const achar = (d) => evs.filter((e) => e.data === d.dia && (k(e.nome).includes(k(d.casa_nome)) || k(e.nome).includes(k((d.cidade || '').split('/')[0])) || (d.artistas || []).some((a) => k(e.nome).includes(k(a.nome)) || e.artistas.some((x) => k(x) === k(a.nome)))));
const cancelar = [];
for (const d of dps) {
  const m = achar(d), arts = (d.artistas || []).map((a) => a.nome).join(', ');
  const linha = `${d.dia} · ${d.produto} · ${d.casa_nome} (${d.cidade || '?'}) · ${arts || 'sem line-up'} · portal: ${d.status}`;
  if (!m.length) { console.log(`- SEM EVENTO NO NOTION: ${linha}`); continue; }
  const st = m.map((e) => e.status).join(' / ');
  if (d.status !== 'cancelada' && m.every((e) => /cancelad/i.test(e.status))) { console.log(`- CANCELAR (Notion: ${st}): ${linha}`); cancelar.push(d.id); }
  else console.log(`- ok (Notion: ${st}): ${linha}`);
}
console.log(`\n## Eventos futuros do Notion (${evs.length})`);
for (const e of evs) console.log(`- ${e.data} · ${e.status} · ${e.nome}${e.artistas.length ? ' · line-up: ' + e.artistas.join(', ') : ''}`);
if (APLICAR && cancelar.length) { await sql(`update datas_portal set status = 'cancelada', observacao = left(coalesce(observacao || ' ', '') || 'Cancelada no Notion (sincronizado em ${hoje}).', 2000) where id in (${cancelar.map((x) => `'${x}'`).join(',')})`); console.log(`\nCANCELADAS no portal: ${cancelar.length}`); }
else console.log(`\n${cancelar.length} para cancelar${APLICAR ? '' : ' (rode com aplicar=sim para cancelar)'}`);
