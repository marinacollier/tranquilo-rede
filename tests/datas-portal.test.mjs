// Datas criadas no portal (v21): só a equipe cria e muda; a casa e as artistas da data veem; outras contas não.
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
await db.exec(readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8'));
await db.exec(readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8')); // idempotente
const novo = async (email, tipo) => (await q(`insert into auth.users (email, raw_user_meta_data, email_confirmed_at) values ($1, $2, now()) returning id`, [email, { tipo, nome: email.split('@')[0] }])).rows[0].id;
const art = await novo('art@x.com', 'artista'), art2 = await novo('art2@x.com', 'artista'), casa = await novo('casa@x.com', 'casa'), casa2 = await novo('casa2@x.com', 'casa'), eq = await novo('eq@x.com', 'artista');
await q(`update perfis set tipo = 'equipe' where id = $1`, [eq]);
const como = async (uid, fn) => { await db.exec(`set role authenticated; select set_config('tq.uid', '${uid}', false);`); try { return await fn(); } finally { await db.exec(`reset role; select set_config('tq.uid', '', false);`); } };
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALHA') + ' ' + m); if (!c) process.exitCode = 1; };
const tenta = async (fn) => { try { await fn(); return null; } catch (e) { return e.message; } };
const cid = (await q(`insert into cadastros_casas (user_id, dados) values ($1, '{"nome":"Casa Um"}') returning id`, [casa])).rows[0].id;

let id;
await como(eq, async () => {
  id = (await q(`insert into datas_portal (dia, produto, casa_id, casa_nome, cidade, artistas) values ('2026-12-20', 'Descubra', $1, 'Casa Um', 'Recife/PE', $2) returning id, criado_por`,
    [cid, JSON.stringify([{ nome: 'Ana', user_id: art, ordem: 1 }, { nome: 'Banda sem conta', ordem: 2 }])])).rows[0].id;
  ok(!!id, 'equipe cria a data com casa e artistas');
  await q(`update datas_portal set abertura = '20:00' where id = $1`, [id]);
  ok((await q(`select abertura::text from datas_portal where id = $1`, [id])).rows[0].abertura === '20:00:00', 'equipe muda o horário');
});
await como(casa, async () => { ok((await q(`select id from datas_portal`)).rows.length === 1, 'a casa da data vê a data'); });
await como(art, async () => { ok((await q(`select id from datas_portal`)).rows.length === 1, 'a artista da data vê a data'); });
await como(casa2, async () => { ok((await q(`select id from datas_portal`)).rows.length === 0, 'outra casa não vê'); });
await como(art2, async () => { ok((await q(`select id from datas_portal`)).rows.length === 0, 'outra artista não vê'); });
await como(art, async () => {
  ok(!!(await tenta(() => q(`insert into datas_portal (dia, produto, casa_nome) values ('2026-12-21', 'Descubra', 'X')`))), 'artista não cria data');
  await q(`update datas_portal set status = 'cancelada' where id = $1`, [id]);
});
ok((await q(`select status from datas_portal where id = $1`, [id])).rows[0].status === 'confirmada', 'artista não cancela a data');
await como(eq, async () => {
  ok(!!(await tenta(() => q(`insert into datas_portal (dia, produto, casa_nome) values ('2026-12-21', 'Show', 'X')`))), 'formato só Apresenta ou Descubra');
  ok(!!(await tenta(() => q(`insert into datas_portal (dia, produto, casa_nome, link_ingressos) values ('2026-12-21', 'Descubra', 'X', 'javascript:alert(1)')`))), 'link de ingressos só https');
  // contrato para a artista na data do portal
  await q(`insert into contratos (user_id, evento_id, titulo, texto) values ($1, $2, 'Contrato Ana', $3)`, [art, 'p:' + id, 'x'.repeat(60)]);
  ok((await q(`select count(*)::int n from contratos where evento_id = $1`, ['p:' + id])).rows[0].n === 1, 'equipe gera contrato ligado à data do portal');
});
ok((await q(`select count(*)::int n from auditoria where tabela = 'datas_portal'`)).rows[0].n >= 2, 'criar e mudar data fica no histórico de alterações');

// v22: áreas da equipe
const adm = await novo('adm2@x.com', 'artista'); await q(`update perfis set tipo = 'adm' where id = $1`, [adm]);
await como(eq, async () => { ok(!!(await tenta(() => q(`select definir_areas($1, array['agenda'])`, [eq]))), 'equipe não define as próprias áreas'); });
await como(adm, async () => { await q(`select definir_areas($1, array['agenda','marketing'])`, [eq]); });
ok(JSON.stringify((await q(`select areas from perfis where id = $1`, [eq])).rows[0].areas) === '["agenda","marketing"]', 'adm define as áreas da equipe');
ok(!!(await tenta(() => q(`update perfis set areas = array['financeiro'] where id = $1`, [eq]))), 'só áreas conhecidas');
