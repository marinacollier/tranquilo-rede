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
// v22: a própria conta de equipe não muda as áreas direto na tabela; o convite aceito leva as áreas para a conta.
await como(eq, async () => { await tenta(() => q(`update perfis set areas = null where id = $1`, [eq])); });
ok(JSON.stringify((await q(`select areas from perfis where id = $1`, [eq])).rows[0].areas) === '["agenda","marketing"]', 'equipe não apaga as próprias áreas pela tabela');
const eq2 = await novo('eq2@x.com', 'artista');
await q(`update perfis set tipo = 'equipe' where id = $1`, [eq2]);
await q(`insert into convites (email, tipo, nome, areas) values ('eq2@x.com', 'equipe', 'Eq Dois', array['operacoes'])`);
await q(`update convites set aceito_em = now() where email = 'eq2@x.com'`);
ok(JSON.stringify((await q(`select areas from perfis where id = $1`, [eq2])).rows[0].areas) === '["operacoes"]', 'convite aceito leva a área para a conta de equipe');
// v24: disponibilidade do artista
await como(art, async () => { await q(`insert into disponibilidade_artista (dia, situacao) values ('2026-12-20', 'disponivel')`); });
await como(eq, async () => { ok((await q(`select user_id from disponibilidade_artista where dia = '2026-12-20'`)).rows.length === 1, 'equipe vê a disponibilidade da artista'); });
await como(art2, async () => {
  ok((await q(`select * from disponibilidade_artista`)).rows.length === 0, 'outra artista não vê a disponibilidade de ninguém');
  ok(!!(await tenta(() => q(`insert into disponibilidade_artista (user_id, dia, situacao) values ($1, '2026-12-21', 'disponivel')`, [art]))), 'artista não marca dia por outra');
});
await como(casa, async () => { ok(!!(await tenta(() => q(`insert into disponibilidade_artista (dia, situacao) values ('2026-12-21', 'disponivel')`))), 'casa não usa a disponibilidade de artista'); });
await como(art, async () => { ok(!!(await tenta(() => q(`insert into disponibilidade_artista (dia, situacao) values ('2020-01-01', 'disponivel')`))), 'artista não marca dia passado'); });
// v25: depois de enviada, a casa e a artista preenchem campos vazios; o que já tinha resposta não muda direto.
await db.exec(`set session_replication_role = replica`);   // só para montar o cenário: casa já habilitada
await q(`update cadastros_casas set status = 'habilitada', dados = '{"nome":"Casa Um","luz":"sim","cidade_uf":"Recife/PE","endereco":"Rua A, 1","dono_nome":"Dona Um","whatsapp":"81999990000","capacidade_sentado":80}' where id = $1`, [cid]);
await db.exec(`set session_replication_role = origin`);
await como(casa, async () => {
  await q(`update cadastros_casas set dados = dados || '{"som":"mesa 8 canais"}' where id = $1`, [cid]);
  ok(/Solicitar atualização/.test((await tenta(() => q(`update cadastros_casas set dados = dados || '{"luz":"nao"}' where id = $1`, [cid]))) || ''), 'casa enviada não muda o que já tinha resposta');
});
const dCasa = (await q(`select dados, status::text s from cadastros_casas where id = $1`, [cid])).rows[0];
ok(dCasa.dados.som === 'mesa 8 canais' && dCasa.dados.luz === 'sim' && dCasa.s === 'habilitada', 'casa habilitada preenche campo vazio e continua habilitada');
await q(`insert into inscricoes_artistas (user_id, dados, status) values ($1, '{"nome_artistico":"Ana","release":""}', 'em_curadoria') on conflict (user_id) do update set dados = excluded.dados, status = excluded.status`, [art]);
await como(art, async () => {
  await q(`update inscricoes_artistas set dados = dados || '{"release":"Texto novo de release"}' where user_id = $1`, [art]);
  ok(!!(await tenta(() => q(`update inscricoes_artistas set dados = dados || '{"nome_artistico":"Outra"}' where user_id = $1`, [art]))), 'artista em curadoria não muda o que já tinha resposta');
  ok(!!(await tenta(() => q(`update inscricoes_artistas set dados = dados || '{"x":"1"}', status = 'aprovada' where user_id = $1`, [art]))) || (await q(`select status::text s from inscricoes_artistas where user_id = $1`, [art])).rows[0].s === 'em_curadoria', 'preencher vazio não muda o status da inscrição');
});
const dArt = (await q(`select dados, status::text s from inscricoes_artistas where user_id = $1`, [art])).rows[0];
ok(dArt.dados.release === 'Texto novo de release' && dArt.dados.nome_artistico === 'Ana' && dArt.s === 'em_curadoria', 'artista em curadoria preenche campo vazio');
// v26: Operações edita a Ficha da casa direto; Agenda e equipe sem área não.
const op = await novo('op@x.com', 'artista'); await q(`update perfis set tipo = 'equipe', areas = array['operacoes'] where id = $1`, [op]);
await como(op, async () => { await q(`update cadastros_casas set dados = dados || '{"palco":"pela operacoes"}' where id = $1`, [cid]); });
ok((await q(`select dados->>'palco' p from cadastros_casas where id = $1`, [cid])).rows[0].p === 'pela operacoes', 'Operações edita a Ficha da casa direto');
await como(eq, async () => { await q(`update cadastros_casas set dados = dados || '{"palco":"pela agenda"}' where id = $1`, [cid]); });
ok((await q(`select dados->>'palco' p from cadastros_casas where id = $1`, [cid])).rows[0].p === 'pela operacoes', 'Agenda/Marketing não editam a Ficha da casa');
// v27: dias fixos da semana. O dono da casa e a artista marcam; a equipe lê; ninguém marca pelos outros.
await q(`update perfis set vinculo_nome = 'Casa Um' where id = $1`, [casa]);
await como(casa, async () => { await q(`insert into disponibilidade_semanal (casa_ref, dias) values ('Casa Um', '{1,5,5}')`); });
ok(JSON.stringify((await q(`select dias from disponibilidade_semanal where casa_ref = 'Casa Um'`)).rows[0]?.dias) === '[1,5]', 'dono da casa marca os dias da semana (sem repetir)');
await como(art, async () => {
  await q(`insert into disponibilidade_semanal (user_id, dias) values ($1, '{0,6}')`, [art]);
  ok(!!(await tenta(() => q(`insert into disponibilidade_semanal (casa_ref, dias) values ('Casa Um', '{2}')`))), 'artista não marca pela casa');
  ok((await q(`select * from disponibilidade_semanal`)).rows.length === 1, 'artista vê só a própria semana');
});
await como(art2, async () => { ok(!!(await tenta(() => q(`insert into disponibilidade_semanal (user_id, dias) values ($1, '{3}')`, [art]))), 'artista não marca pela outra'); });
await como(casa2, async () => { ok((await q(`select * from disponibilidade_semanal`)).rows.length === 0, 'outra casa não vê'); });
await como(eq, async () => { ok((await q(`select * from disponibilidade_semanal`)).rows.length === 2, 'equipe vê a semana de todos'); });
ok(!!(await tenta(() => q(`insert into disponibilidade_semanal (user_id, dias) values ($1, '{7}')`, [art2]))), 'só dias de 0 a 6');
