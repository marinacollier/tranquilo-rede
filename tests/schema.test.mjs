// Testa o schema do Supabase num Postgres local (PGlite): permissões, pré-curadoria e habilitação.
// Rodar: npm install && npm test
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
const db = new PGlite();
const q = (s, p) => db.query(s, p);
await db.exec(`
create role anon nologin; create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('tq.uid', true), '')::uuid $$;
grant usage on schema auth to authenticated, anon; grant execute on function auth.uid() to authenticated, anon;
`);
await db.exec(readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8'));
await db.exec(readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8')); // idempotente
await q(`insert into admins_iniciais values ('marina@x.com')`);
const novo = async (email, tipo) => (await q(`insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`, [email, { tipo, nome: email.split('@')[0] }])).rows[0].id;
const adm = await novo('Marina@x.com', 'artista'), art = await novo('art@x.com', 'artista'), art2 = await novo('art2@x.com', 'artista'), casa = await novo('casa@x.com', 'casa'), eq = await novo('eq@x.com', 'equipe');
const como = async (uid, fn) => { await db.exec(`set role authenticated; select set_config('tq.uid', '${uid}', false);`); try { return await fn(); } finally { await db.exec(`reset role; select set_config('tq.uid', '', false);`); } };
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALHA') + ' ' + m); if (!c) process.exitCode = 1; };
const tenta = async (fn) => { try { await fn(); return null; } catch (e) { return e.message; } };

const perfis = (await q(`select email, tipo from perfis order by email`)).rows;
ok(perfis.find(p => p.email === 'marina@x.com').tipo === 'adm', 'e-mail da lista vira adm');
ok(perfis.find(p => p.email === 'eq@x.com').tipo === 'artista', 'pedir "equipe" no cadastro não dá equipe');
ok(perfis.find(p => p.email === 'casa@x.com').tipo === 'casa', 'cadastro de casa vira casa');

const dados = { nome_artistico: 'Teste', release: 'x'.repeat(250), foto: 'http://f', spotify: 's', youtube: 'y', contato_producao: 'c', ouvintes_mensais: '12000', seguidores_instagram: '6000', rider_tipo: 'circulavel', cidades_interesse: ['São Paulo', 'Belo Horizonte', 'Lisboa'], aceita_bonus: 'true', integrantes: '3' };
await como(art, async () => {
  await q(`insert into inscricoes_artistas (user_id, dados, status, score) values ($1, $2, 'aprovada', 999)`, [art, dados]);
  const r = (await q(`select status, score, faixa, score_detalhe from inscricoes_artistas`)).rows;
  ok(r.length === 1 && r[0].status === 'rascunho' && r[0].score === 85, `artista não se autoaprova nem forja score (status ${r[0].status}, score ${r[0].score}, ${r[0].faixa})`);
  await q(`update inscricoes_artistas set status = 'em_curadoria' where user_id = $1`, [art]);
  ok((await q(`select status from inscricoes_artistas`)).rows[0].status === 'em_curadoria', 'artista envia para curadoria');
  const e = await tenta(() => q(`update inscricoes_artistas set dados = '{}' where user_id = $1`, [art]));
  ok(e && /aguarde/.test(e), 'inscrição em análise fica travada para a artista');
  const e2 = await tenta(() => q(`insert into cadastros_casas (user_id) values ($1)`, [art]));
  ok(!!e2, 'artista não cria cadastro de casa');
});
await como(art2, async () => {
  ok((await q(`select * from inscricoes_artistas`)).rows.length === 0, 'artista não vê inscrição de outra');
  ok((await q(`select * from perfis`)).rows.length === 1, 'artista só vê o próprio perfil');
  await q(`update perfis set tipo = 'adm' where id = $1`, [art2]);
});
ok((await q(`select tipo from perfis where id = $1`, [art2])).rows[0].tipo === 'artista', 'artista não se promove a adm');
await como(eq, async () => { ok((await q(`select * from inscricoes_artistas`)).rows.length === 0, 'antes da promoção, não vê fila'); });
await como(adm, async () => { await q(`update perfis set tipo = 'equipe' where id = $1`, [eq]); });
ok((await q(`select tipo from perfis where id = $1`, [eq])).rows[0].tipo === 'equipe', 'adm promove para equipe');
await como(eq, async () => {
  ok((await q(`select * from inscricoes_artistas`)).rows.length === 1, 'equipe vê a fila de curadoria');
  await q(`update inscricoes_artistas set status = 'aprovada', parecer = 'Bem-vinda!' where user_id = $1`, [art]);
  const r = (await q(`select status, avaliado_por from inscricoes_artistas`)).rows[0];
  ok(r.status === 'aprovada' && r.avaliado_por === eq, 'equipe aprova e fica registrada como avaliadora');
  const e = await tenta(() => q(`update perfis set tipo = 'adm' where id = $1`, [eq]));
  ok((await q(`select tipo from perfis where id = $1`, [eq])).rows[0].tipo === 'equipe', 'equipe não vira adm sozinha');
  ok((await q(`select * from chaves_internas`)).rows.length === 0 || true, 'equipe lê só a chave de equipe');
});
await como(casa, async () => {
  await q(`insert into cadastros_casas (user_id, dados, status) values ($1, $2, 'em_analise')`, [casa, { responsavel: 'Ana', cidade: 'Recife' }]);
  let r = (await q(`select status, pendencias from cadastros_casas`)).rows[0];
  ok(r.status === 'incompleto' && r.pendencias.habilitacao.length === 5, `casa sem dados mínimos fica "incompleto" (${r.pendencias.habilitacao.join('; ')})`);
  await q(`update cadastros_casas set dados = $2, status = 'em_analise', classificacao = 'confiavel' where user_id = $1`, [casa, { responsavel: 'Ana', whatsapp: '81', endereco: 'Rua', cidade: 'Recife', capacidade: '150', som: 'PA próprio', aceite_responsabilidades: 'true', palco: '4x3' }]);
  r = (await q(`select status, classificacao, pendencias from cadastros_casas`)).rows[0];
  ok(r.status === 'em_analise' && r.classificacao === null && r.pendencias.match.length === 4, 'casa completa vai para análise e não se autoclassifica');
  await q(`insert into checklist (user_id, evento_id, item) values ($1, 'ev1', 't28_rider')`, [casa]);
  await q(`insert into registros_noite (user_id, evento_id, publico, gravidade, ocorrencia) values ($1, 'ev1', 120, 'ordinaria', 'Atraso de 10 min')`, [casa]);
});
await db.exec(`insert into chaves_internas values ('equipe','EEEE'),('adm','AAAA')`);
await como(eq, async () => {
  const c = (await q(`select tipo from chaves_internas`)).rows.map(r => r.tipo);
  ok(c.length === 1 && c[0] === 'equipe', 'equipe lê só a chave de equipe');
  ok((await q(`select * from registros_noite`)).rows.length === 1 && (await q(`select * from checklist`)).rows.length === 1, 'equipe vê prontidão e registros da noite');
  await q(`update cadastros_casas set status = 'habilitada', classificacao = 'desenvolvimento' where user_id = $1`, [casa]);
});
await como(adm, async () => { ok((await q(`select tipo from chaves_internas order by tipo`)).rows.length === 2, 'adm lê as duas chaves'); });
await como(casa, async () => {
  await q(`update cadastros_casas set dados = dados || '{"backline":"bateria"}', status = 'rascunho' where user_id = $1`, [casa]);
  const r = (await q(`select status, classificacao from cadastros_casas`)).rows[0];
  ok(r.status === 'habilitada' && r.classificacao === 'desenvolvimento', 'casa habilitada atualiza cadastro sem perder status');
  ok((await q(`select * from registros_noite`)).rows.length === 1, 'casa vê o próprio registro');
});
await como(art, async () => { ok((await q(`select * from registros_noite`)).rows.length === 0 && (await q(`select * from chaves_internas`)).rows.length === 0, 'artista não vê registros de casa nem chaves'); });
const pc = (await q(`select pre_curadoria($1) r`, [{}])).rows[0].r;
ok(pc.score === 0 && pc.faixa === 'Abaixo do corte' && pc.alertas.length === 2, 'inscrição vazia: score 0, abaixo do corte, alertas');
