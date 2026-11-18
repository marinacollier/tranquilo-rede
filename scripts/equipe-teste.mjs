// Contas de equipe para TESTAR cada papel no ambiente de teste (homolog): uma por área, com a senha comum (hash).
import { readFile } from 'node:fs/promises';
const tok = process.env.SUPABASE_ACCESS_TOKEN, HASH = (process.env.SENHA_HASH || '').trim();
const ref = (await readFile(new URL('../src/config.js', import.meta.url), 'utf8')).match(/https:\/\/([a-z0-9]+)\.supabase\.co/)[1];
async function sql(q) { const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, { method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q }) }); const t = await r.text(); if (!r.ok) throw new Error(t.slice(0, 200)); return JSON.parse(t); }
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
const ks = await (await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${tok}` } })).json();
const sv = (ks.find((k) => k.name === 'service_role') || ks.find((k) => k.type === 'secret')).api_key; console.log(`::add-mask::${sv}`);
const H = { apikey: sv, 'Content-Type': 'application/json', ...(sv.startsWith('eyJ') ? { Authorization: `Bearer ${sv}` } : {}) };
const B = (() => { const e = Buffer.from(process.env.EMAIL_BASE_B64 || '', 'base64').toString('utf8').trim().toLowerCase(); return e.includes('@') ? e.split('@') : null; })();
if (B) console.log(`::add-mask::${B[0]}`);
const em = (k, padrao) => B ? `${B[0]}+${k}@${B[1]}` : padrao;
// Caso pronto (Casa Aurora e Lia Moreno) também passa a entrar pelo e-mail base.
if (B) for (const [de, k] of [['casa.teste@tranquilo.com.br', 'aurora'], ['artista.teste@tranquilo.com.br', 'lia']]) { const r = await sql(`update auth.users set email = ${lit(em(k))} where email = ${lit(de)} returning id`); if (r.length) { await sql(`update perfis set email = ${lit(em(k))} where id = ${lit(r[0].id)}`).catch(() => {}); console.log(`OK    caso pronto ${k} com o e-mail base`); } }
for (const [email, nome, tipo, areas] of [[em('gui', 'papel.gui@tranquilo.teste'), 'Papel Gui (operações)', 'equipe', '{operacoes}'], [em('isa', 'papel.isa@tranquilo.teste'), 'Papel Isa (agenda)', 'equipe', '{agenda}'], [em('bruno', 'papel.bruno@tranquilo.teste'), 'Papel Bruno (marketing)', 'equipe', '{marketing}'], [em('adm', 'papel.adm@tranquilo.teste'), 'Papel Administração', 'adm', null]]) {
  let id = (await sql(`select id from auth.users where email = ${lit(email)}`))[0]?.id;
  if (!id) { const r = await fetch(`https://${ref}.supabase.co/auth/v1/admin/users`, { method: 'POST', headers: H, body: JSON.stringify({ email, email_confirm: true, user_metadata: { nome, tipo: 'artista' } }) }); const j = await r.json(); if (!r.ok) throw new Error('conta ' + r.status); id = j.id; }
  await sql(`update auth.users set encrypted_password = ${lit(HASH)} where id = ${lit(id)}; update perfis set tipo = ${lit(tipo)}::tipo_perfil, nome = ${lit(nome)}, areas = ${areas ? lit(areas) : 'null'}, senha_definida = true, tutorial_visto_em = now() where id = ${lit(id)};`);
  console.log(`OK    ${B ? email.split('+')[1].split('@')[0] : email.split('@')[0]} pronta (${tipo}${areas ? ' ' + areas : ''})`);
}
