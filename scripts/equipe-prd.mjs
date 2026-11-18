// Copia para a PRODUÇÃO as contas reais da equipe e da administração que existem no ambiente de teste (pedido da
// Marina, 18/11/2026: "usa tudo a mesma coisa de homolog"): mesmo e-mail, mesma senha (o hash), mesmo tipo e áreas.
// Contas de teste nunca vão. ADM_SHA256 (opcional): impressão SHA-256 de um e-mail que deve entrar como administração.
// O log é público: só imprime tipos e contagens, nunca e-mails ou nomes.
import { readFile } from 'node:fs/promises';

const tok = process.env.SUPABASE_ACCESS_TOKEN, ADM = (process.env.ADM_SHA256 || '').trim().toLowerCase();
if (!tok) { console.error('::error::Falta SUPABASE_ACCESS_TOKEN.'); process.exit(1); }
const refDe = async (arq) => (await readFile(new URL(`../src/${arq}`, import.meta.url), 'utf8')).match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
const TESTE = await refDe('config.js'), PRD = await refDe('config.prd.js');
const limpo = (s) => String(s ?? '').replace(/[^\s@"']+@[^\s@"']+/g, '[e-mail]').replace(/\$2[aby]\$[^\s"']+/g, '[hash]').slice(0, 300);
async function sql(ref, q) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, { method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q }) });
  const t = await r.text(); if (!r.ok) throw new Error(`SQL ${r.status}: ${limpo(t)}`); return JSON.parse(t);
}
const lit = (s) => (s == null ? 'null' : `'${String(s).replace(/'/g, "''")}'`);
const NAO_TESTE = `u.email not ilike '%teste%' and u.email not ilike '%demo%' and u.email not like '%.invalid' and u.email not like '%.teste' and u.email not like 'central.%'`;
const contas = await sql(TESTE, `select u.email, u.encrypted_password, p.nome, p.tipo::text tipo, p.areas, p.whatsapp,
    (${ADM ? `encode(extensions.digest(lower(u.email), 'sha256'), 'hex') = ${lit(ADM)}` : 'false'}) eh_adm
  from auth.users u join perfis p on p.id = u.id
  where ${NAO_TESTE} and (p.tipo in ('equipe', 'adm') ${ADM ? `or encode(extensions.digest(lower(u.email), 'sha256'), 'hex') = ${lit(ADM)}` : ''})`);
const chaves = await (await fetch(`https://api.supabase.com/v1/projects/${PRD}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${tok}` } })).json();
const serv = (chaves.find?.((k) => k.name === 'service_role') || chaves.find?.((k) => k.type === 'secret'))?.api_key;
if (!serv) { console.error('::error::chave de serviço da produção não encontrada'); process.exit(1); }
console.log(`::add-mask::${serv}`);
const H = { apikey: serv, 'Content-Type': 'application/json', ...(serv.startsWith('eyJ') ? { Authorization: `Bearer ${serv}` } : {}) };
let novas = 0, ja = 0; const resumo = {};
for (const c of contas) {
  const tipo = c.eh_adm ? 'adm' : c.tipo;
  let id = (await sql(PRD, `select id from auth.users where lower(email) = lower(${lit(c.email)})`))[0]?.id;
  if (!id) {
    const r = await fetch(`https://${PRD}.supabase.co/auth/v1/admin/users`, { method: 'POST', headers: H, body: JSON.stringify({ email: c.email, email_confirm: true, user_metadata: { nome: c.nome || '', tipo: tipo === 'casa' ? 'casa' : 'artista', senha_portal: true } }) });
    const j = await r.json(); if (!r.ok) throw new Error(`criar conta: HTTP ${r.status} ${limpo(j.msg || j.message || '')}`);
    id = j.id; novas++;
  } else ja++;
  await sql(PRD, `update auth.users set encrypted_password = ${lit(c.encrypted_password)}, email_confirmed_at = coalesce(email_confirmed_at, now()) where id = ${lit(id)};
update perfis set tipo = ${lit(tipo)}::tipo_perfil, nome = ${lit(c.nome)}, whatsapp = ${lit(c.whatsapp)}, areas = ${c.areas ? lit(`{${c.areas.join(',')}}`) : 'null'}, senha_definida = true where id = ${lit(id)};`);
  const k = tipo + (c.areas?.length ? `(${c.areas.join('+')})` : ''); resumo[k] = (resumo[k] || 0) + 1;
}
console.log(`OK    ${contas.length} contas reais copiadas para a produção (${novas} novas, ${ja} já existiam), com a mesma senha do teste: ${Object.entries(resumo).map(([k, n]) => `${n} ${k}`).join(', ')}`);
if (ADM && !contas.some((c) => c.eh_adm)) console.log('AVISO o e-mail de administração pedido não tem conta no ambiente de teste: crie a conta nele (ou na produção) e rode de novo.');
const p = await sql(PRD, `select tipo::text, count(*)::int n from perfis group by 1 order by 1`);
console.log(`OK    contas na produção agora: ${p.map((x) => `${x.n} ${x.tipo}`).join(', ')}`);
