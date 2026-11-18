// Leva para a PRODUÇÃO o que é da operação e não de teste (Marina, 18/11/2026): códigos internos (abrem o pacote do
// Notion para equipe e adm), configuração interna, materiais e documentos publicados (com versões), modelos de contrato e
// campanhas de casas reais. Contas e dados de teste nunca vão. O log só mostra contagens.
import { readFile } from 'node:fs/promises';
const tok = process.env.SUPABASE_ACCESS_TOKEN; if (!tok) { console.error('::error::Falta SUPABASE_ACCESS_TOKEN.'); process.exit(1); }
const refDe = async (a) => (await readFile(new URL(`../src/${a}`, import.meta.url), 'utf8')).match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
const TESTE = await refDe('config.js'), PRD = await refDe('config.prd.js');
const limpo = (s) => String(s ?? '').replace(/[^\s@"']+@[^\s@"']+/g, '[e-mail]').slice(0, 300);
async function sql(ref, q) { const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, { method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q }) }); const t = await r.text(); if (!r.ok) throw new Error(`SQL ${r.status}: ${limpo(t)}`); return JSON.parse(t); }
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
const TESTE_CASA = `casa_ref !~* 'teste'`;
const TABELAS = [['chaves_internas', 'true'], ['config_interna', 'true'], ['materiais', 'true'], ['material_versoes', 'true'], ['modelos_contrato', `nome !~* 'teste'`],
  ['campanhas', TESTE_CASA], ['campanha_itens', `campanha_id in (select id from campanhas where ${TESTE_CASA})`]];
for (const [t, onde] of TABELAS) {
  try {
    const cols = (await sql(PRD, `select column_name c, is_nullable n from information_schema.columns where table_schema = 'public' and table_name = ${lit(t)}`));
    if (!cols.length) { console.log(`--    ${t}: não existe na produção`); continue; }
    // Quem criou/atualizou é de outro banco: o vínculo com a pessoa fica vazio (a linha continua igual).
    const pessoa = cols.filter((x) => /(_por|^user_id)$/.test(x.c)).map((x) => x.c);
    const linhas = (await sql(TESTE, `select coalesce(json_agg(t), '[]'::json) j from (select * from ${t} where ${onde}) t`))[0].j;
    for (const l of linhas) for (const c of pessoa) l[c] = null;
    if (!linhas.length) { console.log(`OK    ${t}: nada a copiar`); continue; }
    await sql(PRD, `alter table ${t} disable trigger user; insert into ${t} select * from json_populate_recordset(null::${t}, ${lit(JSON.stringify(linhas))}::json) on conflict do nothing; alter table ${t} enable trigger user;`);
    const n = (await sql(PRD, `select count(*)::int n from ${t}`))[0].n;
    console.log(`OK    ${t}: ${linhas.length} no teste → ${n} na produção`);
  } catch (e) { console.log(`FALHA ${t}: ${e.message}`); process.exitCode = 1; }
}
