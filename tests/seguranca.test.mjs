// Testes adversariais de RBAC/RLS do schema da Rede Tranquilo em PGlite.
// Uso: node ataques.test.mjs [caminho/schema.sql] [--supabase]
//   --supabase simula os privilégios padrão do Supabase (ALL em tabelas/funções do schema public para anon e
//   authenticated, via ALTER DEFAULT PRIVILEGES), que o mock do teste original não tem.
// Convenção da saída: "ESPERADO" = o comportamento correto; "OK" quando o observado bate, "FALHA" quando não bate.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire('/home/user/tranquilo-rede/package.json');
const { PGlite } = await import(require.resolve('@electric-sql/pglite'));

const SCHEMA = process.argv.find((a) => a.endsWith('.sql')) || '/home/user/tranquilo-rede/supabase/schema.sql';
const SUPA = process.argv.includes('--supabase');
const db = new PGlite();
const q = (s, p) => db.query(s, p);
await db.exec(`
create role anon nologin; create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb, encrypted_password text default 'hash', email_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('tq.uid', true), '')::uuid $$;
grant usage on schema auth to authenticated, anon; grant execute on function auth.uid() to authenticated, anon;
`);
if (SUPA) await db.exec(`
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
`);
await db.exec(readFileSync(SCHEMA, 'utf8'));

const res = [];
const reg = (id, desc, esperado, observado, ok) => { res.push({ id, desc, esperado, observado, ok }); console.log(`${ok ? 'OK   ' : 'FALHA'} [${id}] ${desc}\n        esperado: ${esperado}\n        observado: ${observado}`); };
const tenta = async (fn) => { try { const r = await fn(); return { ok: true, r }; } catch (e) { return { ok: false, e: e.message }; } };
const como = async (uid, fn) => { await db.exec(`set role authenticated; select set_config('tq.uid', '${uid}', false);`); try { return await fn(); } finally { await db.exec(`reset role; select set_config('tq.uid', '', false); select set_config('tq.sistema', '', false);`); } };
const anon = async (fn) => { await db.exec(`set role anon; select set_config('tq.uid', '', false);`); try { return await fn(); } finally { await db.exec(`reset role;`); } };
// confirmado: true = cadastro e depois confirmação pelo link (fluxo real); 'auto' = já nasce confirmado (confirmação automática ligada).
const novo = async (email, meta = {}, confirmado = true) => {
  const id = (await q(`insert into auth.users (email, raw_user_meta_data, email_confirmed_at) values ($1, $2, ${confirmado === 'auto' ? 'now()' : 'null'}) returning id`, [email, meta])).rows[0].id;
  if (confirmado === true) await q(`update auth.users set email_confirmed_at = now() where id = $1`, [id]);
  return id;
};
const sys = async (sql, p) => { await db.exec(`select set_config('tq.sistema', '1', false)`); try { return await q(sql, p); } finally { await db.exec(`select set_config('tq.sistema', '', false)`); } };
// Leitura de observação (o teste vê o estado real, inclusive as colunas que a API esconde).
await db.exec(`create function t_perfil(uuid) returns setof perfis language sql security definer as 'select * from perfis where id = $1'; grant execute on function t_perfil(uuid) to authenticated, anon;`);
const perfil = async (id) => (await q(`select * from t_perfil($1)`, [id])).rows[0];
const n = (r) => (r.ok ? `${r.r.affectedRows ?? r.r.rows?.length} linha(s)` : `erro: ${r.e}`);

// ---------- cenário ----------
await q(`insert into admins_iniciais values ('dona@x.com')`);
const adm = await novo('dona@x.com');
const art = await novo('art@x.com', { tipo: 'artista', nome: 'Art' });
const art2 = await novo('art2@x.com', { tipo: 'artista', nome: 'Art2' });
const casa = await novo('casa@x.com', { tipo: 'casa', nome: 'Casa' });
const casa2 = await novo('casa2@x.com', { tipo: 'casa', nome: 'Casa2' });
const eq = await novo('eq@x.com', { tipo: 'artista' });
await sys(`update perfis set tipo = 'equipe' where id = $1`, [eq]);
await q(`insert into chaves_internas values ('equipe', 'EQEQ-EQEQ-EQEQ'), ('adm', 'ADMA-DMAD-MADM')`);
await como(art2, () => q(`insert into inscricoes_artistas (user_id, dados) values ($1, '{"nome_artistico":"Outra"}')`, [art2]));
await como(casa2, () => q(`insert into cadastros_casas (user_id, dados) values ($1, '{"nome":"Casa 2"}')`, [casa2]));
await como(casa2, () => q(`insert into checklist (user_id, evento_id, item) values ($1, 'ev1', 'x')`, [casa2]));
await como(casa2, () => q(`insert into registros_noite (user_id, evento_id, publico) values ($1, 'ev1', 100)`, [casa2]));

// ---------- artista × inscrições ----------
await como(art, async () => {
  const r = await q(`select * from inscricoes_artistas`);
  reg('A01', 'artista lê inscrição de outra', '0 linhas', `${r.rows.length} linha(s)`, r.rows.length === 0);
  const u = await tenta(() => q(`update inscricoes_artistas set dados = '{"x":1}' where user_id = $1`, [art2]));
  reg('A02', 'artista altera inscrição de outra', '0 linhas afetadas', n(u), u.ok && u.r.affectedRows === 0);
  const i = await tenta(() => q(`insert into inscricoes_artistas (user_id, dados) values ($1, '{}')`, [art2]));
  reg('A03', 'artista cria inscrição em nome de outra (user_id alheio)', 'recusado', n(i), !i.ok);
  await q(`insert into inscricoes_artistas (user_id, dados, status, score, faixa, avaliado_por, avaliado_em) values ($1, '{}', 'aprovada', 100, 'Prioridade', $2, now())`, [art, eq]);
  const m = (await q(`select status, score, faixa, avaliado_por, avaliado_em from inscricoes_artistas where user_id = $1`, [art])).rows[0];
  reg('A04', 'artista se autoaprova/forja score no INSERT', 'status rascunho, score calculado', `status ${m.status}, score ${m.score}, faixa ${m.faixa}`, m.status === 'rascunho' && m.score === 0);
  reg('A05', 'artista forja avaliado_por/avaliado_em no INSERT', 'avaliado_por = null', `avaliado_por = ${m.avaliado_por}, avaliado_em = ${m.avaliado_em ? 'preenchido' : 'null'}`, m.avaliado_por === null);
  await q(`update inscricoes_artistas set status = 'aprovada', parecer = 'eu mesma', nota_interna = 'x' where user_id = $1`, [art]);
  const m2 = (await q(`select status, parecer, nota_interna from inscricoes_artistas where user_id = $1`, [art])).rows[0];
  reg('A06', 'artista se autoaprova no UPDATE / escreve parecer', 'status rascunho, parecer null', `status ${m2.status}, parecer ${m2.parecer}, nota ${m2.nota_interna}`, m2.status === 'rascunho' && m2.parecer === null && m2.nota_interna === null);
  const d = await tenta(() => q(`delete from inscricoes_artistas where user_id = $1`, [art2]));
  reg('A07', 'artista apaga inscrição de outra', 'recusado ou 0 linhas', n(d), !d.ok || d.r.affectedRows === 0);
  const uid = await tenta(() => q(`update inscricoes_artistas set user_id = $2 where user_id = $1`, [art, art2]));
  reg('A08', 'artista transfere a própria inscrição para outro user_id', 'recusado', n(uid), !uid.ok || uid.r.affectedRows === 0);
});
await como(eq, () => q(`update inscricoes_artistas set status = 'ajustes', parecer = 'ajuste o release', nota_interna = 'INTERNO: cachê alto, só se faltar gente' where user_id = $1`, [art]));
await como(art, async () => {
  const r = (await q(`select nota_interna, avaliado_por from inscricoes_artistas where user_id = $1`, [art])).rows[0];
  reg('A09', 'artista lê nota_interna da própria inscrição ("só a equipe vê")', 'nota_interna oculta', `nota_interna = "${r.nota_interna}", avaliado_por = ${r.avaliado_por}`, r.nota_interna === null);
  await q(`update inscricoes_artistas set status = 'em_curadoria' where user_id = $1`, [art]);
  const s = (await q(`select status from inscricoes_artistas where user_id = $1`, [art])).rows[0].status;
  reg('A10', 'artista reenvia após ajustes (transição legítima)', 'em_curadoria', s, s === 'em_curadoria');
  const t = await tenta(() => q(`update inscricoes_artistas set dados = '{}' where user_id = $1`, [art]));
  reg('A11', 'artista edita inscrição em análise', 'recusado', n(t), !t.ok);
});

// ---------- perfis ----------
await como(art, async () => {
  await q(`update perfis set tipo = 'adm', email = 'outro@x.com' where id = $1`, [art]);
  let p = await perfil(art);
  reg('P01', 'artista muda o próprio tipo para adm e o e-mail', 'tipo artista, e-mail inalterado', `tipo ${p.tipo}, email ${p.email}`, p.tipo === 'artista' && p.email === 'art@x.com');
  await q(`update perfis set codigo_acesso = 'QUAL-QUER-COIS', vinculo_nome = 'Joyce Alane', senha_definida = true where id = $1`, [art]);
  p = await perfil(art);
  reg('P02', 'artista sem vínculo grava codigo_acesso/vinculo_nome arbitrários direto na API ("só adm muda vínculos")', 'recusado (vínculo só por adm ou convite)', `codigo_acesso=${p.codigo_acesso}, vinculo_nome=${p.vinculo_nome}`, p.codigo_acesso === null);
  // O caminho legítimo: o código colado vira pedido, e a adm (ou um convite) confirma.
  await q(`update perfis set vinculo_pedido = 'QUAL-QUER-COIS', vinculo_pedido_nome = 'Joyce Alane' where id = $1`, [art]);
  const ped = (await q(`select * from meu_acesso()`)).rows[0];
  reg('P02b', 'artista pede vínculo colando o código', 'pedido guardado, vínculo vazio', `pedido=${ped?.vinculo_pedido}, codigo=${ped?.codigo_acesso}`, ped?.vinculo_pedido === 'QUAL-QUER-COIS' && ped?.codigo_acesso === null);
  await db.exec(`reset role`); await q(`update perfis set codigo_acesso = vinculo_pedido, vinculo_nome = vinculo_pedido_nome, vinculo_pedido = null where id = $1`, [art]);
  await db.exec(`set role authenticated`);
  await q(`update perfis set vinculo_nome = 'Djonga' where id = $1`, [art]);
  p = await perfil(art);
  reg('P03', 'artista já vinculada troca só vinculo_nome (mantendo o código)', 'vinculo_nome inalterado', `vinculo_nome=${p.vinculo_nome}`, p.vinculo_nome === 'Joyce Alane');
  await q(`update perfis set codigo_acesso = 'OUTR-OCOD-IGOX' where id = $1`, [art]);
  p = await perfil(art);
  reg('P04', 'artista vinculada troca codigo_acesso', 'inalterado', `codigo_acesso=${p.codigo_acesso}`, p.codigo_acesso === 'QUAL-QUER-COIS');
  const o = await tenta(() => q(`update perfis set nome = 'hack' where id = $1`, [art2]));
  reg('P05', 'artista altera perfil de outra', '0 linhas', n(o), o.ok && o.r.affectedRows === 0);
  const l = await q(`select id from perfis`);
  reg('P06', 'artista lista perfis', 'só o próprio', `${l.rows.length} linha(s)`, l.rows.length === 1);
  const ins = await tenta(() => q(`insert into perfis (id, email, tipo) values (gen_random_uuid(), 'x@x', 'adm')`));
  reg('P07', 'artista insere perfil adm novo', 'recusado', n(ins), !ins.ok);
  const del = await tenta(() => q(`delete from perfis where id = $1`, [art]));
  reg('P08', 'artista apaga o próprio perfil (direito de exclusão LGPD)', 'informativo: não há caminho de autoexclusão', n(del), true);
  // bypass do gatilho pela GUC tq.sistema (só possível com SQL arbitrário na sessão; não pela API REST)
  await q(`select set_config('tq.sistema', '1', false)`);
  await q(`update perfis set tipo = 'adm' where id = $1`, [art]);
  p = await perfil(art);
  reg('P09', 'artista com sessão SQL seta tq.sistema=1 e vira adm (gatilho confia numa GUC que o próprio usuário define)', 'tipo artista', `tipo ${p.tipo}`, p.tipo === 'artista');
});
await sys(`update perfis set tipo = 'artista' where id = $1`, [art]);   // desfaz P09 para seguir
await como(eq, async () => {
  await q(`update perfis set tipo = 'adm' where id = $1`, [eq]);
  const p = await perfil(eq);
  reg('P10', 'equipe se promove a adm', 'tipo equipe', `tipo ${p.tipo}`, p.tipo === 'equipe');
  const o = await tenta(() => q(`update perfis set tipo = 'adm' where id = $1`, [art2]));
  reg('P11', 'equipe muda tipo de outra conta', '0 linhas', n(o), o.ok && o.r.affectedRows === 0);
  const lc = await tenta(() => q(`select email, codigo_acesso from perfis where codigo_acesso is not null`));
  const cods = lc.ok ? lc.r.rows : [];
  reg('P12', 'equipe lê codigo_acesso de artistas/casas em perfis (o pacote de equipe não traz a lista de códigos; só o de adm)', 'códigos não expostos à equipe', `${cods.length} código(s) lidos: ${cods.map((c) => c.email + '=' + c.codigo_acesso).join(', ')}`, cods.length === 0);
});
// adm que vinculou o código interno pela aba Conta (fluxo previsto na tela "use o código interno de vocês")
await sys(`update perfis set codigo_acesso = 'ADMA-DMAD-MADM' where id = $1`, [adm]);
await como(eq, async () => {
  const lr = await tenta(() => q(`select codigo_acesso from perfis where id = $1`, [adm]));
  const r = lr.ok ? lr.r.rows[0] : null;
  reg('P13', 'equipe lê o código do pacote de adm guardado em perfis.codigo_acesso da adm', 'oculto (chave adm é só para adm)', `codigo_acesso adm = ${r?.codigo_acesso}`, !r?.codigo_acesso);
  const c = (await q(`select tipo from chaves_internas`)).rows.map((x) => x.tipo);
  reg('P14', 'equipe lê chaves_internas', 'só equipe', c.join(','), c.length === 1 && c[0] === 'equipe');
});
await sys(`update perfis set codigo_acesso = null where id = $1`, [adm]);
await como(art, async () => {
  const c = await tenta(() => q(`select * from chaves_internas`));
  reg('P15', 'artista lê chaves_internas', '0 linhas', n(c), c.ok && c.r.rows.length === 0);
  const a = await tenta(() => q(`select * from admins_iniciais`));
  reg('P16', 'artista lê admins_iniciais', '0 linhas ou negado', n(a), !a.ok || a.r.rows.length === 0);
});

// ---------- casas ----------
await como(casa, async () => {
  await q(`insert into cadastros_casas (user_id, dados, status, classificacao, parecer, nota_interna, pendencias, avaliado_por, ja_parceira, notion_casa_id)
           values ($1, '{"nome":"Minha"}', 'habilitada', 'confiavel', 'ok', 'x', '{"habilitacao":[],"match":[],"enriquecimento":[]}', $2, true, 'id-notion-da-casa-de-outra-pessoa')`, [casa, eq]);
  const c = (await q(`select status, classificacao, parecer, nota_interna, jsonb_array_length(pendencias->'habilitacao') h, avaliado_por, ja_parceira, notion_casa_id from cadastros_casas where user_id = $1`, [casa])).rows[0];
  reg('C01', 'casa se autohabilita no INSERT (status/classificacao/parecer/pendencias)', 'rascunho, sem classificação, pendências recalculadas', `status ${c.status}, classe ${c.classificacao}, parecer ${c.parecer}, pend.hab ${c.h}`, c.status === 'rascunho' && c.classificacao === null && c.parecer === null && c.h > 0);
  reg('C02', 'casa forja avaliado_por no INSERT', 'null', `avaliado_por = ${c.avaliado_por}`, c.avaliado_por === null);
  reg('C03', 'casa se declara já parceira e aponta notion_casa_id de outra casa', 'informativo (validação manual da equipe)', `ja_parceira=${c.ja_parceira}, notion_casa_id=${c.notion_casa_id}`, true);
  await q(`update cadastros_casas set status = 'habilitada', classificacao = 'confiavel', pendencias = '{"habilitacao":[]}' where user_id = $1`, [casa]);
  const c2 = (await q(`select status, classificacao, jsonb_array_length(pendencias->'habilitacao') h from cadastros_casas where user_id = $1`, [casa])).rows[0];
  reg('C04', 'casa se autohabilita no UPDATE', 'rascunho', `status ${c2.status}, classe ${c2.classificacao}, pend.hab ${c2.h}`, c2.status === 'rascunho' && c2.classificacao === null && c2.h > 0);
  const r = await q(`select * from cadastros_casas`);
  reg('C05', 'casa lê cadastro de outra', 'só o próprio', `${r.rows.length} linha(s)`, r.rows.length === 1);
  const u = await tenta(() => q(`update cadastros_casas set dados = '{}' where user_id = $1`, [casa2]));
  reg('C06', 'casa altera cadastro de outra', '0 linhas', n(u), u.ok && u.r.affectedRows === 0);
  const i = await tenta(() => q(`insert into inscricoes_artistas (user_id) values ($1)`, [casa]));
  reg('C07', 'casa cria inscrição de artista', 'recusado', n(i), !i.ok);
});
const completa = { responsavel: 'Ana', whatsapp: '81', endereco: 'Rua', cidade: 'Recife', capacidade: '150', som: 'pa_proprio', aceite_responsabilidades: 'true' };
await como(casa, () => q(`update cadastros_casas set dados = $2, status = 'em_analise' where user_id = $1`, [casa, completa]));
await como(eq, () => q(`update cadastros_casas set status = 'habilitada', nota_interna = 'INTERNO: dono atrasa pagamento' where user_id = $1`, [casa]));
await como(casa, async () => {
  const r = (await q(`select nota_interna from cadastros_casas where user_id = $1`, [casa])).rows[0];
  reg('C08', 'casa lê nota_interna do próprio cadastro', 'oculta', `nota_interna = "${r.nota_interna}"`, r.nota_interna === null);
  await q(`update cadastros_casas set dados = '{}' where user_id = $1`, [casa]);
  const c = (await q(`select status, jsonb_array_length(pendencias->'habilitacao') h from cadastros_casas where user_id = $1`, [casa])).rows[0];
  reg('C09', 'casa habilitada apaga os dados mínimos e continua habilitada', 'volta para análise/incompleto', `status ${c.status}, pendências de habilitação ${c.h}`, c.status !== 'habilitada');
});

// ---------- checklist e registros ----------
await como(art, async () => {
  const s = await q(`select * from checklist`);
  reg('K01', 'artista lê checklist de outra conta', '0 linhas', `${s.rows.length}`, s.rows.length === 0);
  const i = await tenta(() => q(`insert into checklist (user_id, evento_id, item) values ($1, 'ev1', 'y')`, [casa2]));
  reg('K02', 'artista grava checklist em nome de outra', 'recusado', n(i), !i.ok);
  const u = await tenta(() => q(`update checklist set feito = false where user_id = $1`, [casa2]));
  reg('K03', 'artista altera checklist de outra', '0 linhas', n(u), u.ok && u.r.affectedRows === 0);
  const d = await tenta(() => q(`delete from checklist where user_id = $1`, [casa2]));
  reg('K04', 'artista apaga checklist de outra', '0 linhas', n(d), d.ok && d.r.affectedRows === 0);
  const r = await q(`select * from registros_noite`);
  reg('K05', 'artista lê registros da noite de casa', '0 linhas', `${r.rows.length}`, r.rows.length === 0);
  const ri = await tenta(() => q(`insert into registros_noite (user_id, evento_id, publico, ocorrencia) values ($1, 'ev1', 9999, 'falso')`, [art]));
  reg('K06', 'artista (não casa) grava "registro da noite" com público', 'recusado (é função da casa)', n(ri), !ri.ok);
  const rd = await tenta(() => q(`delete from registros_noite where user_id = $1`, [casa2]));
  reg('K07', 'artista apaga registro de casa', 'recusado/0', n(rd), !rd.ok || rd.r.affectedRows === 0);
});

// ---------- convites ----------
await como(eq, async () => {
  const a = await tenta(() => q(`insert into convites (email, tipo) values ('novo-adm@x.com', 'adm')`));
  reg('V01', 'equipe convida adm', 'recusado', n(a), !a.ok);
});
await como(adm, () => q(`insert into convites (email, tipo, nome) values ('futura-eq@x.com', 'equipe', 'Futura')`));
await como(eq, async () => {
  const u = await tenta(() => q(`update convites set email = 'eq-alt@x.com' where email = 'futura-eq@x.com'`));
  reg('V02', 'equipe redireciona convite de equipe (criado pela adm) para outro e-mail', 'recusado', n(u), !u.ok || u.r.affectedRows === 0);
  const d = await tenta(() => q(`update convites set tipo = 'artista' where email = 'futura-eq@x.com'`));
  reg('V03', 'equipe rebaixa convite de equipe criado pela adm para artista', 'recusado', n(d), !d.ok || d.r.affectedRows === 0);
  const x = await tenta(() => q(`delete from convites where email = 'futura-eq@x.com'`));
  reg('V04', 'equipe apaga convite de equipe criado pela adm', 'recusado', n(x), !x.ok || x.r.affectedRows === 0);
  // rebaixar a adm: convite para o e-mail dela
  const c = await tenta(() => q(`insert into convites (email, tipo, nome) values ('dona@x.com', 'artista', 'rebaixada')`));
  reg('V05a', 'equipe cria convite de artista para o e-mail de uma conta adm existente', 'recusado (convite não deve mudar conta existente de perfil)', n(c), !c.ok);
  // mudar vínculo de artista existente
  await tenta(() => q(`insert into convites (email, tipo, codigo_acesso, vinculo_nome) values ('art2@x.com', 'casa', 'CASA-ALHE-IAXX', 'Casa alheia')`));
});
await como(adm, () => q(`select reivindicar_convite()`));   // o site chama isto em carregar() a cada login
let pa = await perfil(adm);
reg('V05', 'adm faz login depois do convite da equipe: reivindicar_convite() a rebaixa', 'adm continua adm', `tipo ${pa.tipo}, nome ${pa.nome}`, pa.tipo === 'adm');
await sys(`update perfis set tipo = 'adm' where id = $1`, [adm]);
await como(art2, () => q(`select reivindicar_convite()`));
const p2 = await perfil(art2);
reg('V06', 'equipe troca perfil e vínculo de conta artista existente via convite ("só adm muda perfis/vínculos")', 'perfil/vínculo inalterados', `tipo ${p2.tipo}, codigo ${p2.codigo_acesso}, vinculo ${p2.vinculo_nome}`, p2.tipo === 'artista' && p2.codigo_acesso === null);
await como(eq, async () => {
  const u = await tenta(() => q(`update convites set aceito_em = null, codigo_acesso = 'OUTR-AVEZ-XXXX' where email = 'art2@x.com'`));
  reg('V07', 'equipe "reabre" convite já aceito (aceito_em = null) para reaplicar', 'recusado', n(u), !u.ok || u.r.affectedRows === 0);
});
// reivindicar convite de outro e-mail
await como(eq, () => q(`insert into convites (email, tipo, codigo_acesso, vinculo_nome) values ('joyce@x.com', 'artista', 'JOYC-EJOY-CEJO', 'Joyce')`));
await como(art, async () => {
  const r = await tenta(() => q(`select reivindicar_convite()`));
  const p = await perfil(art);
  reg('V08', 'artista reivindica convite de outro e-mail (função sem parâmetro usa auth.users.email)', 'false, sem vínculo Joyce', `${r.ok ? JSON.stringify(r.r.rows[0]) : r.e}; vinculo ${p.vinculo_nome}`, p.vinculo_nome !== 'Joyce');
  const a = await tenta(() => q(`select aplicar_convite($1, 'joyce@x.com')`, [art]));
  reg('V09', 'authenticated chama aplicar_convite(uid, e-mail alheio) direto', 'permissão negada', n(a), !a.ok);
  const t = await tenta(() => q(`select proteger_perfil()`));
  reg('V10', 'authenticated chama função de gatilho direto', 'erro', n(t), !t.ok);
  const l = await q(`select * from convites`);
  reg('V11', 'artista lê convites', '0 linhas', `${l.rows.length}`, l.rows.length === 0);
});
// e-mail não confirmado
const joyU = await novo('joyce@x.com', { tipo: 'artista' }, false);
let pj = await perfil(joyU);
await como(joyU, () => q(`select reivindicar_convite()`));
pj = await perfil(joyU);
reg('V12', 'conta com e-mail convidado mas NÃO confirmado tenta reivindicar', 'sem vínculo', `vinculo ${pj.vinculo_nome}`, pj.vinculo_nome === null);
// confirmação automática (Supabase com "Confirm email" desligado): o cadastro já nasce confirmado
await como(adm, () => q(`insert into convites (email, tipo, nome) values ('nova-adm@x.com', 'adm', 'Nova adm')`));
const atacante = await novo('nova-adm@x.com', { tipo: 'artista', nome: 'atacante' }, 'auto');
const pat = await perfil(atacante);
reg('V13', 'com confirmação de e-mail desligada, quem se cadastra primeiro com o e-mail convidado herda o convite de adm', 'depende da configuração; só o dono da caixa deveria herdar', `tipo ${pat.tipo}`, pat.tipo !== 'adm');
// admins_iniciais sem confirmação
await q(`insert into admins_iniciais values ('socia@x.com')`);
const socia = await novo('socia@x.com', { tipo: 'artista' }, false);
reg('V14', 'cadastro NÃO confirmado com e-mail de admins_iniciais já nasce adm', 'adm só após confirmar o e-mail', `tipo ${(await perfil(socia)).tipo}`, (await perfil(socia)).tipo !== 'adm');

// ---------- anon ----------
await anon(async () => {
  for (const t of ['perfis', 'inscricoes_artistas', 'cadastros_casas', 'checklist', 'registros_noite', 'chaves_internas', 'admins_iniciais', 'convites', 'avisos_cidade', 'diario', 'diario_servidor', 'notas_internas']) {
    const r = await tenta(() => q(`select * from ${t}`));
    if (r.ok === false && /does not exist/.test(r.e)) continue;
    reg('N01', `anon lê ${t}`, '0 linhas ou negado', n(r), !r.ok || r.r.rows.length === 0);
  }
  const f = await tenta(() => q(`insert into avisos_cidade (cidade, contato, canal, consentimento) values ('Recife', 'a@x.com', 'email', false)`));
  reg('N02', 'anon insere aviso com consentimento=false', 'recusado', n(f), !f.ok);
  const g = await tenta(() => q(`insert into avisos_cidade (cidade, contato, canal, consentimento) values ($1, 'b@x.com', 'email', true)`, ['x'.repeat(10000)]));
  reg('N03', 'anon insere aviso com campo enorme', 'recusado', n(g), !g.ok);
  const t0 = Date.now(); let aceitos = 0;
  for (let i = 0; i < 2000; i++) { const r = await tenta(() => q(`insert into avisos_cidade (cidade, contato, canal, consentimento) values ('Recife', $1, 'email', true)`, [`spam${i}@x.com`])); if (r.ok) aceitos++; }
  reg('N04', 'anon insere 2000 avisos com contatos distintos em sequência (limite de taxa?)', 'limitado', `${aceitos}/2000 aceitos em ${Date.now() - t0} ms`, aceitos < 2000);
  const h = await tenta(() => q(`insert into avisos_cidade (cidade, contato, canal, consentimento, criado_em) values ('<img src=x onerror=alert(1)>', 'nao-e-email', 'email', true, '2001-01-01')`));
  reg('N05', 'anon insere aviso com contato inválido, HTML na cidade e criado_em forjado', 'recusado (validação de formato e data do servidor)', n(h), !h.ok);
  const v = await tenta(() => q(`insert into avisos_cidade (cidade, contato, canal, consentimento) values ('Recife', 'vitima@empresa.com', 'email', true)`));
  reg('N06', 'anon cadastra o e-mail de terceiro no "me avise" (sem dupla confirmação)', 'informativo: aceito sem prova de posse', n(v), true);
  const d = await tenta(() => q(`delete from avisos_cidade`));
  reg('N07', 'anon apaga avisos', 'negado/0', n(d), !d.ok || d.r.affectedRows === 0);
  const fx = await tenta(() => q(`select aplicar_convite(gen_random_uuid(), 'joyce@x.com')`));
  reg('N08', 'anon chama aplicar_convite', 'negado', n(fx), !fx.ok);
  const rv = await tenta(() => q(`select reivindicar_convite()`));
  reg('N09', 'anon chama reivindicar_convite', 'negado', n(rv), !rv.ok);
  const ea = await tenta(() => q(`select eh_adm(), eh_equipe(), pre_curadoria('{}'::jsonb), pendencias_casa('{}'::jsonb)`));
  reg('N10', 'anon chama eh_adm/eh_equipe/pre_curadoria/pendencias_casa', 'informativo', ea.ok ? 'executou' : `negado: ${ea.e}`, true);
  await tenta(() => q(`insert into diario (sessao, acao, user_id, perfil) values ('abcdefgh12', 'erro_js', $1, 'adm')`, [adm]));
  reg('N11', 'anon grava no diário um evento atribuído à conta da adm', 'a conta vem do token (fica sem conta)', 'ver N15', true);
  let dd = 0; for (let i = 0; i < 1000; i++) { const r = await tenta(() => q(`insert into diario (sessao, acao, detalhe) values ('abcdefgh12', 'clique', $1)`, [{ lixo: 'x'.repeat(3500) }])); if (r.ok && r.r?.affectedRows !== 0) dd++; }
  reg('N12', 'anon grava 1000 eventos de ~3,5 KB no diário (limite de taxa/volume?)', 'limitado', `${dd}/1000 aceitos`, dd < 1000);
  const pi = await tenta(() => q(`insert into perfis (id, email) values (gen_random_uuid(), 'x')`));
  reg('N13', 'anon insere perfil', 'negado', n(pi), !pi.ok);
  const ci = await tenta(() => q(`insert into convites (email, tipo) values ('a@b.c', 'adm')`));
  reg('N14', 'anon cria convite', 'negado', n(ci), !ci.ok);
});
const dv = (await q(`select count(*)::int n from diario where user_id = $1`, [adm])).rows[0].n;
reg('N15', 'diário tem evento atribuído à adm sem ela estar logada', 'nenhum', String(dv), dv === 0);

// ---------- equipe: XSS armazenado em campos que o cliente renderiza sem esc() ----------
await como(eq, async () => {
  const x = await tenta(() => q(`update inscricoes_artistas set faixa = '<img src=x onerror=alert(document.domain)>', score_detalhe = '{"completude":"<svg onload=alert(1)>","tracao":0,"tecnica":0,"circulacao":0,"condicoes":0}' where user_id = $1`, [art2]));
  globalThis.__x01 = x;
});
{ const f = (await q(`select faixa, score_detalhe::text d from inscricoes_artistas where user_id = $1`, [art2])).rows[0];
  reg('X01', 'equipe grava HTML em faixa/score_detalhe de inscrição (renderizados sem esc() em conta.js medidor/curadoria)', 'recusado ou recalculado no servidor', JSON.stringify(f), !/</.test((f?.faixa || '') + (f?.d || ''))); }
await como(art2, async () => {
  const r = (await q(`select faixa from inscricoes_artistas where user_id = $1`, [art2])).rows[0];
  reg('X02', 'a artista recebe a faixa com HTML do banco (passosArtista → medidor)', 'texto controlado', r.faixa, !/</.test(r.faixa || ''));
});
await como(eq, () => q(`update inscricoes_artistas set status = 'ajustes' where user_id = $1`, [art]));
await como(art, async () => {
  const j = await tenta(() => q(`update inscricoes_artistas set dados = '{"spotify":"javascript:alert(document.domain)","nome_artistico":"x"}' where user_id = $1`, [art]));
  reg('X03', 'artista grava spotify = "javascript:..." (vira <a href> na ficha da equipe)', 'recusado (só http/https)', n(j), !j.ok);
});

// ---------- delete por adm (LGPD) ----------
await como(adm, async () => {
  const d = await tenta(() => q(`delete from inscricoes_artistas where user_id = $1`, [art2]));
  reg('L01', 'adm apaga inscrição a pedido do titular', 'informativo', n(d), true);
  const p = await tenta(() => q(`delete from perfis where id = $1`, [art2]));
  reg('L02', 'adm apaga perfil a pedido do titular', 'informativo', n(p), true);
});

const falhas = res.filter((r) => !r.ok);
console.log(`\n${SUPA ? '[modo privilégios padrão do Supabase]' : '[modo mock do teste original]'} ${res.length} verificações, ${falhas.length} falha(s): ${falhas.map((f) => f.id).join(', ')}`);
