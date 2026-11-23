// Quem usou homolog e produção (pedido da Marina, 23/11/2026): logins e sessões por aparelho, sem e-mail nem IP
// (o repositório é público). Contas da Marina aparecem pelo apelido depois do "+"; qualquer outra conta aparece
// como "OUTRA PESSOA" com tipo e primeiro nome. O IP vira um código curto (hash) só para agrupar aparelhos.
import { createHash } from 'node:crypto';
const token = process.env.SUPABASE_ACCESS_TOKEN, base = (process.env.EMAIL_BASE || '').toLowerCase();
if (!token || !base) { console.error('::error::faltam SUPABASE_ACCESS_TOKEN ou EMAIL_BASE'); process.exit(1); }
const [usr, dom] = base.split('@');
const sql = async (ref, query) => { const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) }); if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`); return r.json(); };
const rot = (email, tipo, nome) => { const e = String(email || '').toLowerCase(); const m = e.match(/^([^@+]+)(\+([^@]+))?@(.+)$/);
  if (m && m[1] === usr && m[4] === dom) return m[3] ? '+' + m[3] : 'Marina (principal)';
  if (/teste|\.invalid$/.test(e)) return 'conta de teste'; return `OUTRA PESSOA (${tipo || '?'}, ${String(nome || '').split(' ')[0] || 'sem nome'})`; };
const ip = (x) => x ? createHash('sha256').update(String(x)).digest('hex').slice(0, 6) : '------';
const ua = (s) => { s = String(s || ''); const os = /iPhone|iPad/.test(s) ? 'iPhone/iPad' : /Android/.test(s) ? 'Android' : /Mac OS X/.test(s) ? 'Mac' : /Windows/.test(s) ? 'Windows' : /Linux/.test(s) ? 'Linux' : s ? 'outro' : '?';
  const nav = /HeadlessChrome|Playwright/.test(s) ? 'robô de teste' : /Edg\//.test(s) ? 'Edge' : /CriOS|Chrome\//.test(s) ? 'Chrome' : /Safari\//.test(s) ? 'Safari' : /Firefox/.test(s) ? 'Firefox' : /node|undici|supabase|Go-http|python/i.test(s) ? 'script' : s ? 'outro' : '?'; return `${os} · ${nav}`; };
const hora = (t) => t ? new Date(t).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '–';
for (const [nome, ref] of [['HOMOLOG', 'edespqdbxhthzcmygake'], ['PRODUÇÃO', 'cgujgstuviuolzcpkakl']]) {
  console.log(`\n# ${nome}`);
  const ss = await sql(ref, `select u.email, p.tipo, p.nome, s.ip::text ip, s.user_agent, s.created_at, s.updated_at from auth.sessions s join auth.users u on u.id = s.user_id left join public.perfis p on p.id = u.id order by s.created_at`);
  const lg = await sql(ref, `select payload->>'actor_username' email, ip_address ip, created_at from auth.audit_log_entries where payload->>'action' = 'login' order by created_at`);
  const g = {};
  for (const s of ss) { const k = `${ip(s.ip)} | ${ua(s.user_agent)}`; (g[k] ||= { contas: new Set(), n: 0, de: s.created_at, ate: s.updated_at }); const x = g[k]; x.contas.add(rot(s.email, s.tipo, s.nome)); x.n++; if (s.updated_at > x.ate) x.ate = s.updated_at; }
  console.log(`## Sessões por aparelho (código do IP | sistema · navegador): ${ss.length} sessões`);
  for (const [k, x] of Object.entries(g).sort((a, b) => String(b[1].ate).localeCompare(String(a[1].ate)))) console.log(`- ${k}: ${x.n} sessão(ões), ${hora(x.de)} a ${hora(x.ate)} · contas: ${[...x.contas].join(', ')}`);
  const pl = {}; for (const l of lg) { const k = `${rot(l.email)} @ ${ip(l.ip)}`; (pl[k] ||= { n: 0, ult: l.created_at }); pl[k].n++; pl[k].ult = l.created_at; }
  console.log(`## Logins (conta @ código do IP): ${lg.length}`);
  for (const [k, x] of Object.entries(pl).sort((a, b) => String(b[1].ult).localeCompare(String(a[1].ult)))) console.log(`- ${k}: ${x.n}x, último ${hora(x.ult)}`);
  // Diário do site (o próprio portal registra cada uso): últimos 14 dias, por conta, aparelho e dia.
  const di = await sql(ref, `select u.email, p.tipo, p.nome, d.navegador, to_char(d.criado_em at time zone 'America/Sao_Paulo', 'DD/MM') dia, count(distinct d.sessao) sessoes, count(*) acoes, min(d.criado_em) de, max(d.criado_em) ate
    from diario d left join auth.users u on u.id = d.user_id left join public.perfis p on p.id = d.user_id
    where d.criado_em > now() - interval '14 days' group by 1, 2, 3, 4, 5 order by max(d.criado_em) desc limit 120`);
  console.log(`## Uso registrado pelo site, últimos 14 dias (conta · aparelho · dia)`);
  for (const d of di) console.log(`- ${d.dia} · ${d.email ? rot(d.email, d.tipo, d.nome) : 'sem login (visitante)'} · ${ua(d.navegador)}: ${d.sessoes} sessão(ões), ${d.acoes} ações, ${hora(d.de).slice(-5)} a ${hora(d.ate).slice(-5)}`);
  const outros = ss.filter((s) => rot(s.email, s.tipo, s.nome).startsWith('OUTRA'));
  console.log(`## Contas que não são da Marina nem de teste com sessão: ${new Set(outros.map((s) => s.email)).size}`);
}
