// Troca da senha comum (24/11/2026): a senha usada nas contas de demonstração apareceu em logs públicos. Marca todas as
// contas do ambiente (ALVO=prd|homolog) com senha_definida = false: no próximo acesso, cada pessoa cai em "Crie a sua
// senha" antes de usar o portal (o Supabase recusa repetir a senha atual). Não muda nenhuma senha e não imprime e-mails.
import { readFile } from 'node:fs/promises';
const token = process.env.SUPABASE_ACCESS_TOKEN; if (!token) { console.error('::error::SUPABASE_ACCESS_TOKEN ausente'); process.exit(1); }
const ALVO = process.env.ALVO === 'prd' ? 'prd' : 'homolog';
const ref = (await readFile(new URL(`../src/${ALVO === 'prd' ? 'config.prd.js' : 'config.js'}`, import.meta.url), 'utf8')).match(/https:\/\/([a-z0-9]+)\.supabase\.co/)[1];
const sql = async (query) => { const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) }); if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`); return r.json(); };
const r = await sql(`select set_config('tq.sistema', '1', true); with u as (update perfis set senha_definida = false where senha_definida is distinct from false returning tipo) select tipo, count(*)::int n from u group by tipo order by tipo`);
const tot = await sql(`select tipo, count(*)::int n, count(*) filter (where not senha_definida)::int pendentes from perfis group by tipo order by tipo`);
console.log(`# ${ALVO.toUpperCase()}: marcadas agora ${JSON.stringify(r)}; situação: ${tot.map((x) => `${x.tipo} ${x.pendentes}/${x.n} vão criar senha nova`).join(' · ')}`);
