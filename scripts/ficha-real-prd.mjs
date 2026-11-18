// Copia para a PRODUÇÃO uma Ficha real que a equipe preencheu no teste (ex.: Ratazana, preenchida pelo Gui), com a conta de
// acesso num e-mail da Marina. PARES_B64 = "trecho do nome|email;..." em base64. O log não mostra e-mails nem dados.
import { readFile } from 'node:fs/promises';
const tok = process.env.SUPABASE_ACCESS_TOKEN, HASH = (process.env.SENHA_HASH || '').trim();
const pares = Buffer.from(process.env.PARES_B64 || '', 'base64').toString('utf8').split(';').map((x) => x.split('|').map((y) => y.trim())).filter((x) => x[0] && x[1]);
for (const [, e] of pares) console.log(`::add-mask::${e}`);
const refDe = async (a) => (await readFile(new URL(`../src/${a}`, import.meta.url), 'utf8')).match(/https:\/\/([a-z0-9]+)\.supabase\.co/)[1];
const TESTE = await refDe('config.js'), PRD = await refDe('config.prd.js');
const limpo = (s) => String(s ?? '').replace(/[^\s@"']+@[^\s@"']+/g, '[e-mail]').slice(0, 300);
async function sql(ref, q) { const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, { method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q }) }); const t = await r.text(); if (!r.ok) throw new Error(limpo(t)); return JSON.parse(t); }
const lit = (s) => (s == null ? 'null' : `'${String(s).replace(/'/g, "''")}'`), js = (o) => `${lit(JSON.stringify(o))}::jsonb`;
const ks = await (await fetch(`https://api.supabase.com/v1/projects/${PRD}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${tok}` } })).json();
const sv = (ks.find((k) => k.name === 'service_role') || ks.find((k) => k.type === 'secret')).api_key; console.log(`::add-mask::${sv}`);
const H = { apikey: sv, 'Content-Type': 'application/json', ...(sv.startsWith('eyJ') ? { Authorization: `Bearer ${sv}` } : {}) };
const adm = (await sql(PRD, `select id from perfis where tipo = 'adm' limit 1`))[0].id;
for (const [trecho, email] of pares) {
  const f = (await sql(TESTE, `select c.dados, c.status::text status, c.combinados, c.classificacao, c.parecer, p.vinculo_nome, (select json_agg(e) from equipe_casa e where lower(e.casa_ref) = lower(coalesce(p.vinculo_nome, c.dados->>'nome'))) equipe
    from cadastros_casas c join perfis p on p.id = c.user_id where c.dados->>'nome' ilike ${lit('%' + trecho + '%')} or p.vinculo_nome ilike ${lit('%' + trecho + '%')} order by c.atualizado_em desc limit 1`))[0];
  if (!f) { console.log(`FALHA nenhuma Ficha com "${trecho}" no teste`); continue; }
  const nome = f.dados?.nome || f.vinculo_nome, preench = Object.values(f.dados || {}).filter((v) => v && String(v).trim()).length;
  await sql(PRD, `delete from cadastros_casas where user_id in (select id from auth.users where lower(email) = ${lit(email)}); delete from equipe_casa where lower(casa_ref) = lower(${lit(nome)}); delete from auth.users where lower(email) = ${lit(email)};`).catch(() => {});
  const r = await fetch(`https://${PRD}.supabase.co/auth/v1/admin/users`, { method: 'POST', headers: H, body: JSON.stringify({ email, email_confirm: true, user_metadata: { nome, tipo: 'casa' } }) });
  const j = await r.json(); if (!r.ok) { console.log('FALHA conta: ' + r.status); continue; }
  await sql(PRD, `update auth.users set encrypted_password = ${lit(HASH)} where id = ${lit(j.id)};
update perfis set tipo = 'casa', nome = ${lit(nome)}, vinculo_nome = ${lit(nome)}, senha_definida = true, tutorial_visto_em = now() where id = ${lit(j.id)};
set session_replication_role = replica;
insert into cadastros_casas (user_id, dados, status, enviado_em, combinados, classificacao, parecer) values (${lit(j.id)}, ${js(f.dados)}, ${lit(f.status)}::status_casa, now(), ${f.combinados ? js(f.combinados) : 'null'}, ${lit(f.classificacao)}, ${lit(f.parecer)});
set session_replication_role = origin;`);
  if (f.equipe?.length) await sql(PRD, `insert into equipe_casa (casa_ref, nome, whatsapp, email, funcoes, reserva, criado_por) values ${f.equipe.map((e) => `(${lit(nome)}, ${lit(e.nome)}, ${lit(e.whatsapp)}, ${lit(e.email)}, ${lit(`{${(e.funcoes || []).join(',')}}`)}, ${!!e.reserva}, ${lit(j.id)})`).join(', ')};`);
  console.log(`OK    Ficha "${nome}" copiada para a produção (${preench} campos preenchidos, situação ${f.status}, equipe ${f.equipe?.length || 0})`);
}
