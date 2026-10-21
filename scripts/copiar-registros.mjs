// Copia os registros do Supabase (login, chamadas à API e erros do banco) para a tabela registros_supabase,
// antes que sumam (no plano gratuito duram cerca de um dia). Roda no GitHub Actions a cada 4 horas.
// Precisa do segredo SUPABASE_ACCESS_TOKEN (token pessoal do Supabase, em supabase.com/dashboard/account/tokens).
// O log desta rotina mostra só contagens: o repositório é público e os registros têm e-mails e IPs.
import { readFile } from 'node:fs/promises';

const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) { console.log('SUPABASE_ACCESS_TOKEN não configurado: nada copiado.'); process.exit(0); }
const cfg = await readFile(new URL('../src/config.js', import.meta.url), 'utf8');
const ref = cfg.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
const API = `https://api.supabase.com/v1/projects/${ref}`;
const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
const HORAS = Number(process.env.HORAS || 26), JANELA = 2;   // olha 26 h para trás em janelas de 2 h (a API limita a consulta)
const FONTES = ['auth_logs', 'edge_logs', 'postgres_logs'];

async function chamar(url, init = {}) {
  for (let t = 1; ; t++) {
    const r = await fetch(url, { ...init, headers: H });
    if (r.ok) return r.json();
    if ((r.status === 429 || r.status >= 500) && t < 5) { await new Promise((ok) => setTimeout(ok, 3000 * t)); continue; }
    throw new Error(`${r.status} em ${url.replace(API, '').split('?')[0]}: ${(await r.text()).slice(0, 200)}`);
  }
}
const sql = (query) => chamar(`${API}/database/query`, { method: 'POST', body: JSON.stringify({ query }) });

// A tabela vem do supabase/schema.sql; sem ela, avisa e para.
const existe = await sql(`select to_regclass('public.registros_supabase') is not null as ok`);
if (!existe?.[0]?.ok) { console.log('Tabela registros_supabase não existe: rode o supabase/schema.sql no SQL Editor.'); process.exit(1); }

const agora = Date.now(), total = {};
for (const fonte of FONTES) {
  total[fonte] = { lidos: 0, novos: 0 };
  for (let h = HORAS; h > 0; h -= JANELA) {
    const ini = new Date(agora - h * 3600e3).toISOString(), fim = new Date(agora - Math.max(h - JANELA, 0) * 3600e3).toISOString();
    const q = `select id, timestamp, event_message, metadata from ${fonte} order by timestamp asc limit 1000`;
    const r = await chamar(`${API}/analytics/endpoints/logs.all?${new URLSearchParams({ sql: q, iso_timestamp_start: ini, iso_timestamp_end: fim })}`);
    if (r.error) throw new Error(`${fonte}: ${JSON.stringify(r.error).slice(0, 200)}`);
    const linhas = (r.result || []).map((x) => ({ id: `${fonte}:${x.id}`, fonte, timestamp: x.timestamp, event_message: x.event_message, metadata: x.metadata ?? null }));
    total[fonte].lidos += linhas.length;
    for (let i = 0; i < linhas.length; i += 200) {
      const json = JSON.stringify(linhas.slice(i, i + 200)).replaceAll('$tqreg$', '$ tqreg$');
      const res = await sql(`with novos as (insert into registros_supabase (id, fonte, quando, mensagem, dados)
        select x->>'id', x->>'fonte', to_timestamp((x->>'timestamp')::double precision / 1000000), left(x->>'event_message', 4000), x->'metadata'
        from jsonb_array_elements($tqreg$${json}$tqreg$::jsonb) x on conflict (id) do nothing returning 1) select count(*)::int n from novos`);
      total[fonte].novos += res?.[0]?.n || 0;
    }
  }
}
for (const [f, t] of Object.entries(total)) console.log(`${f}: ${t.lidos} lidos, ${t.novos} novos guardados`);
