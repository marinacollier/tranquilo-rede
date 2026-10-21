// Materiais, versões e ciência de leitura (Partner Hub A6), num Postgres local (PGlite).
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
const db = new PGlite();
const q = (s, p) => db.query(s, p);
await db.exec(`
create role anon nologin; create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb, encrypted_password text default 'hash', email_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('tq.uid', true), '')::uuid $$;
grant usage on schema auth to authenticated, anon; grant execute on function auth.uid() to authenticated, anon;
`);
const schema = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
await db.exec(schema); await db.exec(schema); // idempotente
await q(`insert into admins_iniciais values ('adm@x.com')`);
const novo = async (email, tipo) => (await q(`insert into auth.users (email, raw_user_meta_data, email_confirmed_at) values ($1, $2, now()) returning id`, [email, { tipo, nome: email.split('@')[0] }])).rows[0].id;
const adm = await novo('adm@x.com', 'artista'), casa = await novo('casa@x.com', 'casa'), casa2 = await novo('casa2@x.com', 'casa'), art = await novo('art@x.com', 'artista');
const convite = async (uid, casa) => { const e = (await q(`select email from auth.users where id = $1`, [uid])).rows[0].email; await q(`insert into convites (email, tipo, vinculo_nome, aceito_em) values (lower($1), 'casa', $2, now()) on conflict (email) do update set vinculo_nome = excluded.vinculo_nome, aceito_em = now()`, [e, casa]); };
const como = async (uid, fn) => { await db.exec(`set role authenticated; select set_config('tq.uid', '${uid}', false);`); try { return await fn(); } finally { await db.exec(`reset role; select set_config('tq.uid', '', false);`); } };
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALHA') + ' ' + m); if (!c) process.exitCode = 1; };
const tenta = async (fn) => { try { await fn(); return null; } catch (e) { return e.message; } };

let doc, v1, v2, docArt;
await como(adm, async () => {
  doc = (await q(`insert into materiais (slug, titulo, area, tipo_material, publico, fonte_url, fonte_tipo, responsavel)
    values ('manual-anfitriao', 'Manual do anfitrião', 'operacoes', 'guia', '{casa}', 'https://exemplo.org/manual', 'site_bruno', 'Bruno') returning id`)).rows[0].id;
  v1 = (await q(`insert into material_versoes (material_id, versao, exige_ciencia, publicada_por, publicada_em) values ($1, '1.0', true, $2, '2020-01-01') returning id, publicada_por, publicada_em`, [doc, casa])).rows[0];
  docArt = (await q(`insert into materiais (slug, titulo, publico, fonte_url) values ('guia-artista', 'Guia da artista', '{artista}', 'https://exemplo.org/artista') returning id`)).rows[0].id;
  await q(`insert into material_versoes (material_id, versao, exige_ciencia) values ($1, '1', true)`, [docArt]);
  ok(!!(await tenta(() => q(`insert into materiais (slug, titulo, fonte_url) values ('inseguro', 'Link inseguro', 'http://x.org')`))), 'fonte precisa ser https');
});
ok(v1.publicada_por === adm && new Date(v1.publicada_em).getFullYear() > 2020, 'quem publicou e quando vêm do servidor, não do navegador');
v1 = v1.id;

await como(casa, async () => {
  const docs = (await q(`select slug from materiais order by slug`)).rows.map((r) => r.slug);
  ok(docs.length === 1 && docs[0] === 'manual-anfitriao', `casa vê só documentos para casa (${docs})`);
  ok((await q(`select * from minhas_ciencias_pendentes()`)).rows.length === 1, 'casa vê 1 ciência pendente');
  ok(!!(await tenta(() => q(`insert into materiais (slug, titulo, fonte_url) values ('meu-doc', 'Meu doc', 'https://x.org')`))), 'casa não cria documento');
  ok(!!(await tenta(() => q(`insert into ciencias (versao_id, user_id) values ($1, $2)`, [v1, casa2]))), 'casa não registra ciência em nome de outra pessoa');
  await q(`insert into ciencias (versao_id, registrada_em) values ($1, '2001-01-01')`, [v1]);
  const c = (await q(`select registrada_em from ciencias`)).rows[0];
  ok(new Date(c.registrada_em).getFullYear() > 2001, 'data da ciência não pode ser forjada');
  ok((await q(`select * from minhas_ciencias_pendentes()`)).rows.length === 0, 'depois da ciência, nada pendente');
  ok(!!(await tenta(() => q(`delete from ciencias where versao_id = $1`, [v1]))), 'casa não apaga a própria ciência');
  ok(!!(await tenta(() => q(`update ciencias set evento_id = 'x' where versao_id = $1`, [v1]))), 'casa não edita a própria ciência');
  ok(!!(await tenta(() => q(`update material_versoes set versao = '9' where id = $1`, [v1]))), 'casa não edita versão');
});
await como(art, async () => {
  ok((await q(`select * from materiais where id = $1`, [doc])).rows.length === 0, 'artista não vê documento de casa');
  ok(!!(await tenta(() => q(`insert into ciencias (versao_id) values ($1)`, [v1]))), 'artista não dá ciência em documento que não pode ler');
  ok((await q(`select * from minhas_ciencias_pendentes()`)).rows.length === 1, 'artista vê a própria pendência (guia da artista)');
});

await como(adm, async () => {
  v2 = (await q(`insert into material_versoes (material_id, versao, resumo, exige_ciencia) values ($1, '1.1', 'Novo horário de abertura', true) returning id`, [doc])).rows[0].id;
  ok(!!(await tenta(() => q(`update material_versoes set resumo = 'outro' where id = $1`, [v1]))), 'nem a equipe reescreve uma versão publicada');
});
await como(casa, async () => {
  const p = (await q(`select versao from minhas_ciencias_pendentes()`)).rows;
  ok(p.length === 1 && p[0].versao === '1.1', 'nova versão volta a pedir ciência');
  ok((await q(`select * from ciencias where versao_id = $1`, [v1])).rows.length === 1, 'ciência da versão antiga continua no histórico');
  await q(`insert into ciencias (versao_id) values ($1)`, [v2]);
});
await como(casa2, async () => {
  ok(!!(await tenta(() => q(`insert into ciencias (versao_id) values ($1)`, [v1]))), 'ninguém dá ciência em versão que não é mais a vigente');
  ok((await q(`select * from ciencias`)).rows.length === 0, 'casa não vê ciências de outra casa');
});
await convite(casa, 'Rooftap');
let docRoof;
await como(adm, async () => {
  docRoof = (await q(`insert into materiais (slug, titulo, publico, fonte_url, casa_ref) values ('plano-rooftap', 'Plano de Ação do Rooftap', '{casa}', 'https://trnql.app/area-rooftap', 'Rooftap') returning id`)).rows[0].id;
  await q(`insert into material_versoes (material_id, versao, exige_ciencia) values ($1, '1', true)`, [docRoof]);
});
await como(casa, async () => { ok((await q(`select * from materiais where id = $1`, [docRoof])).rows.length === 1, 'casa vê o documento da própria casa'); });
await como(casa2, async () => {
  ok((await q(`select * from materiais where id = $1`, [docRoof])).rows.length === 0, 'outra casa não vê o documento do Rooftap');
  const v = (await q(`select id from material_versoes where material_id = $1`, [docRoof])).rows;
  ok(v.length === 0, 'outra casa não vê as versões do documento do Rooftap');
});
await como(adm, async () => {
  ok((await q(`select * from ciencias`)).rows.length === 2, 'equipe vê todas as ciências');
  await q(`update materiais set ativo = false where id = $1`, [doc]);
});
await como(casa2, async () => {
  ok((await q(`select * from materiais`)).rows.length === 0, 'documento desativado some para a casa');
  ok((await q(`select * from minhas_ciencias_pendentes()`)).rows.length === 0, 'documento desativado e de outra casa não geram pendência');
});
