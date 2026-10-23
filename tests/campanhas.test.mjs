// Campanhas com "feito" compartilhado, usando a campanha real do Rooftap importada da página do Bruno.
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
await db.exec(schema); await db.exec(schema);
await q(`insert into admins_iniciais values ('adm@x.com')`);
// Fluxo real: cadastro e depois confirmação pelo link do e-mail.
const novo = async (email, tipo) => { const id = (await q(`insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`, [email, { tipo, nome: email.split('@')[0] }])).rows[0].id; await q(`update auth.users set email_confirmed_at = now() where id = $1`, [id]); return id; };
const adm = await novo('adm@x.com', 'artista'), roof1 = await novo('roof1@x.com', 'casa'), roof2 = await novo('roof2@x.com', 'casa'), outra = await novo('outra@x.com', 'casa'), art = await novo('art@x.com', 'artista');
const convite = async (uid, casa) => { const e = (await q(`select email from auth.users where id = $1`, [uid])).rows[0].email; await q(`insert into convites (email, tipo, vinculo_nome, aceito_em) values (lower($1), 'casa', $2, now()) on conflict (email) do update set vinculo_nome = excluded.vinculo_nome, aceito_em = now()`, [e, casa]); };
const como = async (uid, fn) => { await db.exec(`set role authenticated; select set_config('tq.uid', '${uid}', false);`); try { return await fn(); } finally { await db.exec(`reset role; select set_config('tq.uid', '', false);`); } };
await convite(roof1, 'Rooftap'); await convite(roof2, 'Rooftap');
await convite(outra, 'Outra Casa');
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALHA') + ' ' + m); if (!c) process.exitCode = 1; };
const tenta = async (fn) => { try { await fn(); return null; } catch (e) { return e.message; } };
const camp = JSON.parse(readFileSync(new URL('./fixtures-campanha-rooftap.json', import.meta.url), 'utf8'));

ok(!!(await como(roof1, () => tenta(() => q(`select importar_campanha($1)`, [camp]))))?.match(/equipe/), 'casa não importa campanha');
await como(adm, async () => {
  await q(`select importar_campanha($1)`, [camp]);
  ok((await q(`select count(*)::int n from campanha_itens`)).rows[0].n === 10, 'importa os 10 dias da campanha real do Rooftap');
  ok(!!(await tenta(() => q(`select importar_campanha($1)`, [{ ...camp, itens: [] }]))), 'campanha vazia não é importada');
});
const item = async (k) => (await q(`select id from campanha_itens where chave = $1`, [k])).rows[0]?.id;

await como(roof1, async () => {
  ok((await q(`select * from campanhas`)).rows.length === 1, 'casa vê a própria campanha');
  const acoes = (await q(`select acoes from campanha_itens where chave = 'd1020'`)).rows[0].acoes;
  ok(acoes.length === 3 && acoes[1].links.some((l) => l.url === 'https://trnql.app/rooftap-05nov'), 'links rastreados do Bruno preservados');
  await q(`insert into campanha_feitos (item_id, feito_em) values ($1, '2001-01-01')`, [await item('d1020')]);
  ok(new Date((await q(`select feito_em from campanha_feitos`)).rows[0].feito_em).getFullYear() > 2001, 'data do feito não pode ser forjada');
});
await como(roof2, async () => {
  const f = (await q(`select feito_por from campanha_feitos`)).rows;
  ok(f.length === 1 && f[0].feito_por === roof1, 'outra pessoa da mesma casa vê o feito (não é por aparelho)');
});
const intrusa = await novo('intrusa@x.com', 'casa');
await como(intrusa, async () => {
  await tenta(() => q(`update perfis set vinculo_nome = 'Rooftap', codigo_acesso = 'X' where id = $1`, [intrusa]));
  ok((await q(`select * from campanhas`)).rows.length === 0, 'casa que se declara Rooftap no próprio perfil não vê a campanha (achado P02)');
});
await como(outra, async () => {
  ok((await q(`select * from campanhas`)).rows.length === 0, 'outra casa não vê a campanha do Rooftap');
  ok((await q(`select * from campanha_itens`)).rows.length === 0, 'outra casa não vê os dias');
  const id = (await q(`select id from campanha_itens limit 1`)).rows[0]?.id;
  ok(!id, 'outra casa não descobre ids dos itens');
});
const idD1022 = await item('d1022');
ok(!!(await como(outra, () => tenta(() => q(`insert into campanha_feitos (item_id) values ($1)`, [idD1022])))), 'outra casa não marca feito na campanha alheia');
ok(!!(await como(art, () => tenta(() => q(`insert into campanha_feitos (item_id) values ($1)`, [idD1022])))), 'artista não marca feito de casa');
await como(roof1, () => tenta(() => q(`update campanha_itens set acoes = '[]'`)));
ok((await q(`select acoes from campanha_itens where chave = 'd1020'`)).rows[0].acoes.length === 3, 'casa não altera o texto da campanha');

await como(adm, async () => {
  const a = (await q(`select * from andamento_campanhas()`)).rows[0];
  ok(a.dias === 10 && a.feitos === 1, `matriz vê o andamento (${a.feitos} de ${a.dias})`);
  // Bruno republica: muda um texto e tira o último dia
  const nova = structuredClone(camp); nova.itens[1].acoes[0].texto = 'Texto revisado pelo Bruno'; nova.itens.pop();
  await q(`select importar_campanha($1)`, [nova]);
  ok((await q(`select count(*)::int n from campanha_feitos`)).rows[0].n === 1, 'reimportar não apaga o que já foi feito');
  ok((await q(`select acoes->0->>'texto' t from campanha_itens where chave = 'd1022'`)).rows[0].t === 'Texto revisado pelo Bruno', 'reimportar atualiza o texto');
  ok((await q(`select ativo from campanha_itens where chave = 'd1115'`)).rows[0].ativo === false, 'dia retirado pelo Bruno sai da campanha');
  ok((await q(`select dias from andamento_campanhas()`)).rows[0].dias === 9, 'andamento conta só os dias ativos');
});
await como(roof2, async () => {
  await q(`delete from campanha_feitos where item_id = $1`, [await item('d1020')]);
  const retirado = await item('d1115');
  ok(!!(await tenta(() => q(`insert into campanha_feitos (item_id) values ($1)`, [retirado]))), 'não marca dia retirado da campanha');
  ok((await q(`select * from campanha_historico`)).rows.length === 0, 'casa não lê o histórico interno');
});
await como(adm, async () => {
  const h = (await q(`select acao, por from campanha_historico order by id`)).rows;
  ok(h.length === 2 && h[0].acao === 'feito' && h[0].por === roof1 && h[1].acao === 'desfeito' && h[1].por === roof2, 'histórico registra quem marcou e quem desmarcou');
});
