// Copia os registros do Supabase (login, chamadas à API e erros do banco) para a tabela diario_servidor,
// antes que sumam (no plano gratuito duram cerca de um dia). Roda no GitHub Actions a cada 4 horas.
// Precisa do segredo SUPABASE_ACCESS_TOKEN (token pessoal do Supabase, em supabase.com/dashboard/account/tokens).
// O log desta rotina mostra só contagens: o repositório é público e os registros têm e-mails e IPs.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const token = process.env.SUPABASE_ACCESS_TOKEN;
// Sem o segredo, falha em vermelho (o GitHub avisa por e-mail): terminar "com sucesso" sem copiar nada esconderia
// que os registros estão se perdendo.
if (!token) { console.error('::error::SUPABASE_ACCESS_TOKEN não configurado: nenhum registro foi copiado. Crie o token em supabase.com/dashboard/account/tokens e guarde como segredo do repositório.'); process.exit(1); }
const cfg = await readFile(new URL('../src/config.js', import.meta.url), 'utf8');
const ref = cfg.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
const API = `https://api.supabase.com/v1/projects/${ref}`;
const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
const HORAS = Number(process.env.HORAS || 26), JANELA = 6;   // olha 26 h para trás em janelas de 6 h (a API limita a consulta a 24 h)
const PAUSA = Number(process.env.PAUSA_MS ?? 2500);           // a API de registros recusa (429) chamadas seguidas demais
const FONTES = ['auth_logs', 'edge_logs', 'postgres_logs'];

const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));
async function chamar(url, init = {}) {
  for (let t = 1; ; t++) {
    const r = await fetch(url, { ...init, headers: H });
    if (r.ok) return r.json();
    if ((r.status === 429 || r.status >= 500) && t < 7) { await esperar(Number(r.headers.get('retry-after')) * 1000 || 10000 * t); continue; }
    throw new Error(`${r.status} em ${url.replace(API, '').split('?')[0]}: ${(await r.text()).slice(0, 200)}`);
  }
}
const sql = (query) => chamar(`${API}/database/query`, { method: 'POST', body: JSON.stringify({ query }) });

// A tabela vem do supabase/schema.sql; sem ela, avisa e para.
const existe = await sql(`select to_regclass('public.diario_servidor') is not null as ok`);
if (!existe?.[0]?.ok) { console.log('Tabela diario_servidor não existe: rode o supabase/schema.sql no SQL Editor.'); process.exit(1); }
// Procura o primeiro valor de uma chave em qualquer profundidade dos metadados (o formato varia por fonte).
// Vale para os dois formatos: metadados aninhados (antigo) e mapa plano com chaves como "request.method" (novo).
const achar = (o, chaves) => { if (!o || typeof o !== 'object') return null; for (const [k, v] of Object.entries(o)) { if (chaves.includes(k.split('.').pop()) && v != null && typeof v !== 'object') return v; const r = achar(v, chaves); if (r != null) return r; } return null; };
// Desde 23/09/2026 o Supabase consulta registros numa tabela única "logs" (SQL do ClickHouse), filtrada pela fonte.
// A documentação diverge no nome da coluna da fonte (source ou source_name): tenta as variantes e guarda a que funcionou.
const VARIANTES = [
  (f) => `select id, timestamp, event_message, log_attributes from logs where source = '${f}' order by timestamp asc limit 1000`,
  (f) => `select id, timestamp, event_message, log_attributes from logs where source_name = '${f}' order by timestamp asc limit 1000`,
  (f) => `select timestamp, event_message, log_attributes from logs where source = '${f}' order by timestamp asc limit 1000`,
  (f) => `select timestamp, event_message from logs where source = '${f}' order by timestamp asc limit 1000`,
];
let variante = null;
async function consultar(fonte, ini, fim) {
  const ordem = variante == null ? VARIANTES.map((_, i) => i) : [variante];
  let ultimo = null;
  for (const i of ordem) {
    await esperar(PAUSA);
    const r = await chamar(`${API}/analytics/endpoints/logs?${new URLSearchParams({ sql: VARIANTES[i](fonte), iso_timestamp_start: ini, iso_timestamp_end: fim })}`);
    if (!r.error) { if (variante == null) { variante = i; console.log(`consulta que funcionou: variante ${i + 1}`); } return r.result || []; }
    ultimo = r.error;
  }
  throw new Error(`${fonte}: ${JSON.stringify(ultimo).slice(0, 300)}`);
}
// Carimbo de tempo em microssegundos (formato antigo) ou texto de data (formato novo).
const micros = (t) => typeof t === 'number' || /^\d+$/.test(String(t)) ? Number(t) : Date.parse(String(t).replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(String(t)) ? '' : 'Z')) * 1000;
const idDe = (x, fonte) => x.id ? `${fonte}:${x.id}` : `${fonte}:${micros(x.timestamp)}:${createHash('sha1').update(String(x.event_message)).digest('hex').slice(0, 16)}`;

const agora = Date.now(), total = {};
const falhas = [];
for (const fonte of FONTES) {
  total[fonte] = { lidos: 0, novos: 0 };
  try { await copiarFonte(fonte); } catch (e) { falhas.push(`${fonte}: ${e.message}`); }
}
async function copiarFonte(fonte) {
  const janelas = [];
  for (let h = HORAS; h > 0; h -= JANELA) janelas.push([agora - h * 3600e3, agora - Math.max(h - JANELA, 0) * 3600e3]);
  while (janelas.length) {
    const [a, b] = janelas.shift();
    const brutas = await consultar(fonte, new Date(a).toISOString(), new Date(b).toISOString());
    // Bateu no limite de 1000 linhas: divide a janela ao meio para não perder registros.
    if (brutas.length >= 1000 && b - a > 10 * 60e3) { janelas.unshift([a, (a + b) / 2], [(a + b) / 2, b]); continue; }
    const linhas = brutas.map((x) => { const meta = x.log_attributes ?? x.metadata ?? null; return { id: idDe(x, fonte), fonte, timestamp: micros(x.timestamp), event_message: x.event_message, metadata: meta,
      status: Number(achar(meta, ['status_code', 'status'])) || null, metodo: achar(meta, ['method']), caminho: achar(meta, ['path']) }; });
    total[fonte].lidos += linhas.length;
    for (let i = 0; i < linhas.length; i += 200) {
      const json = JSON.stringify(linhas.slice(i, i + 200)).replaceAll('$tqreg$', '$ tqreg$');
      const res = await sql(`with novos as (insert into diario_servidor (id, fonte, quando, status, metodo, caminho, mensagem, dados)
        select x->>'id', x->>'fonte', to_timestamp((x->>'timestamp')::double precision / 1000000), (x->>'status')::int, left(x->>'metodo', 20),
               left(x->>'caminho', 300), left(x->>'event_message', 4000), x->'metadata'
        from jsonb_array_elements($tqreg$${json}$tqreg$::jsonb) x on conflict (id) do nothing returning 1) select count(*)::int n from novos`);
      total[fonte].novos += res?.[0]?.n || 0;
    }
  }
}
for (const [f, t] of Object.entries(total)) console.log(`${f}: ${t.lidos} lidos, ${t.novos} novos guardados`);
if (falhas.length) { for (const f of falhas) console.error('::error::' + f.slice(0, 400)); process.exit(1); }
