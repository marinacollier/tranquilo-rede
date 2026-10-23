// Aplica o supabase/schema.sql em produção numa transação única (tudo ou nada). Só roda à mão, pelo GitHub Actions.
// O schema é idempotente: rodar de novo não apaga dados. Precisa do segredo SUPABASE_ACCESS_TOKEN.
import { readFile } from 'node:fs/promises';

const tok = process.env.SUPABASE_ACCESS_TOKEN;
if (!tok) { console.error('::error::SUPABASE_ACCESS_TOKEN não configurado.'); process.exit(1); }
const cfg = await readFile(new URL('../src/config.js', import.meta.url), 'utf8');
const ref = cfg.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
const schema = await readFile(new URL('./schema.sql', import.meta.url), 'utf8');
const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, { method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: `begin;\n${schema}\n;commit;` }) });
if (!r.ok) { console.error(`::error::HTTP ${r.status} ${(await r.text()).slice(0, 600)}`); process.exit(1); }
console.log('schema.sql aplicado.');
