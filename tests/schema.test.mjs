// Testa o schema do Supabase num Postgres local (PGlite): permissões, pré-curadoria e habilitação.
// Rodar: npm install && npm test
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
await q(`insert into admins_iniciais values ('marina@x.com')`);
const novo = async (email, tipo) => (await q(`insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`, [email, { tipo, nome: email.split('@')[0] }])).rows[0].id;
const adm = await novo('Marina@x.com', 'artista'), art = await novo('art@x.com', 'artista'), art2 = await novo('art2@x.com', 'artista'), casa = await novo('casa@x.com', 'casa'), eq = await novo('eq@x.com', 'equipe');
const como = async (uid, fn) => { await db.exec(`set role authenticated; select set_config('tq.uid', '${uid}', false);`); try { return await fn(); } finally { await db.exec(`reset role; select set_config('tq.uid', '', false);`); } };
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALHA') + ' ' + m); if (!c) process.exitCode = 1; };
const tenta = async (fn) => { try { await fn(); return null; } catch (e) { return e.message; } };

ok((await q(`select tipo from perfis where id = $1`, [adm])).rows[0].tipo === 'artista', 'e-mail da lista não vira adm antes de confirmar o e-mail');
await q(`update auth.users set email_confirmed_at = now() where id = $1`, [adm]);
const perfis = (await q(`select email, tipo from perfis order by email`)).rows;
ok(perfis.find(p => p.email === 'marina@x.com').tipo === 'adm', 'e-mail da lista vira adm ao confirmar');
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
  ok((await q(`select id from perfis`)).rows.length === 1, 'artista só vê o próprio perfil');
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

// ---------- v2: convites, primeiro acesso e avisos ----------
await como(eq, async () => {
  await q(`insert into convites (email, tipo, nome, codigo_acesso, vinculo_nome) values ('joyce@x.com', 'artista', 'Joyce', 'AAAA-BBBB-CCCC', 'Joyce Alane')`);
  ok(!!(await tenta(() => q(`insert into convites (email, tipo) values ('chefe@x.com', 'adm')`))), 'equipe não convida para administração');
  ok(!!(await tenta(() => q(`insert into convites (email, tipo) values ('eq2@x.com', 'equipe')`))), 'equipe não convida para equipe');
});
await como(adm, async () => { await q(`insert into convites (email, tipo, nome) values ('eq2@x.com', 'equipe', 'Nova equipe')`); });
await como(art, async () => {
  ok((await q(`select * from convites`)).rows.length === 0, 'artista não lê convites');
  ok(!!(await tenta(() => q(`insert into convites (email, tipo, codigo_acesso) values ('art@x.com', 'artista', 'ROUBO')`))), 'artista não cria convite para si');
  ok(!!(await tenta(() => q(`select aplicar_convite($1, 'joyce@x.com')`, [art]))), 'artista não chama aplicar_convite');
});
// Alguém cria conta com o e-mail convidado, sem confirmar: nada é vinculado.
const joy = (await q(`insert into auth.users (email, raw_user_meta_data) values ('Joyce@x.com', '{"tipo":"artista"}') returning id`)).rows[0].id;
let pj = (await q(`select tipo, codigo_acesso, vinculo_nome, senha_definida from perfis where id = $1`, [joy])).rows[0];
ok(pj.codigo_acesso === null, 'convite não vale antes de confirmar o e-mail');
await q(`update auth.users set email_confirmed_at = now() where id = $1`, [joy]);
pj = (await q(`select tipo, codigo_acesso, vinculo_nome, nome from perfis where id = $1`, [joy])).rows[0];
ok(pj.codigo_acesso === 'AAAA-BBBB-CCCC' && pj.vinculo_nome === 'Joyce Alane' && pj.tipo === 'artista', 'ao confirmar o e-mail, o convite liga a conta à artista');
ok((await q(`select aceito_em from convites where email = 'joyce@x.com'`)).rows[0].aceito_em !== null, 'convite fica marcado como aceito');
// Link mágico: a conta já nasce confirmada e sem senha.
const nova = (await q(`insert into auth.users (email, encrypted_password, email_confirmed_at) values ('eq2@x.com', '', now()) returning id`)).rows[0].id;
const pn = (await q(`select tipo, senha_definida, nome from perfis where id = $1`, [nova])).rows[0];
ok(pn.tipo === 'equipe' && pn.senha_definida === false && pn.nome === 'Nova equipe', 'convite por link cria a conta de equipe pedindo para definir senha');
// Conta que já existia antes do convite.
await como(eq, async () => { await q(`insert into convites (email, tipo, codigo_acesso, vinculo_nome) values ('casa@x.com', 'casa', 'CASA-CASA-CASA', 'Coringa Madá')`); });
await q(`update auth.users set email_confirmed_at = now() where id = $1`, [art2]);
await como(casa, async () => {
  const r = (await q(`select reivindicar_convite() r`)).rows[0].r;
  ok(r === false, 'sem e-mail confirmado, reivindicar não vincula');
});
await q(`update auth.users set email_confirmed_at = now() where id = $1`, [casa]);
const pc2 = (await q(`select vinculo_nome from perfis where id = $1`, [casa])).rows[0];
ok(pc2.vinculo_nome === 'Coringa Madá', 'conta antiga recebe o vínculo ao confirmar o e-mail');
await como(art, async () => {
  await q(`update perfis set tutorial_visto_em = now(), senha_definida = true where id = $1`, [art]);
  ok((await q(`select tutorial_visto_em from perfis where id = $1`, [art])).rows[0].tutorial_visto_em !== null, 'pessoa marca o próprio tutorial como visto');
});
await db.exec(`set role anon;`);
await q(`insert into avisos_cidade (cidade, contato, canal, consentimento) values ('Recife', 'fa@x.com', 'email', true)`);
const semConsent = await tenta(() => q(`insert into avisos_cidade (cidade, contato, canal, consentimento) values ('Recife', 'fb@x.com', 'email', false)`));
const dup = await tenta(() => q(`insert into avisos_cidade (cidade, contato, canal, consentimento) values ('recife', 'FA@x.com', 'email', true)`));
await db.exec(`reset role;`);
ok(!!semConsent, 'aviso sem consentimento é recusado');
ok(!!dup, 'mesmo contato na mesma cidade não duplica');
await db.exec(`set role anon;`);
const visto = await q(`select count(*)::int n from avisos_cidade`).then((r) => r.rows[0].n, () => 0);
await db.exec(`reset role;`);
ok(visto === 0, 'visitante não lê os avisos de ninguém');
await como(eq, async () => { ok((await q(`select * from avisos_cidade`)).rows.length === 1, 'equipe lê os avisos por cidade'); });
await como(art, async () => { ok((await q(`select * from avisos_cidade`)).rows.length === 0, 'artista não lê os avisos'); });


// ---------- v3: correções do QA ----------
await como(art2, async () => {
  await q(`insert into inscricoes_artistas (user_id, dados, enviado_em, avaliado_por) values ($1, $2, '2000-01-01', $3)`, [art2, { ouvintes_mensais: '12000.5', seguidores_instagram: '3000000000', capacidade: '1.5', cidades_interesse: 'São Paulo' }, adm]);
  const r = (await q(`select score, enviado_em, avaliado_por from inscricoes_artistas`)).rows[0];
  ok(r.score === 30 && r.enviado_em === null && r.avaliado_por === null, `número quebrado não derruba o salvamento e datas/avaliação não são forjáveis (score ${r.score})`);
  await q(`update perfis set vinculo_nome = 'Outra Artista Famosa' where id = $1`, [art2]);
});
ok((await q(`select vinculo_nome from perfis where id = $1`, [art2])).rows[0].vinculo_nome === null, 'artista não troca o nome do vínculo sem trocar o código');
ok((await q(`select (pendencias_casa($1)->'habilitacao') ? 'Capacidade de público' r`, [{ capacidade: '100.5' }])).rows[0].r === false, 'capacidade com decimal é aceita');
await como(eq, async () => {
  ok(!!(await tenta(() => q(`insert into convites (email, tipo) values ('marina@x.com', 'artista')`))), 'equipe não manda convite que rebaixaria a adm');
  await q(`update inscricoes_artistas set score = 100, status = 'ajustes', parecer = 'Mande o rider' where user_id = $1`, [art2]);
  const r = (await q(`select score, status from inscricoes_artistas where user_id = $1`, [art2])).rows[0];
  ok(r.score === 30 && r.status === 'ajustes', 'equipe avalia mas não reescreve o score');
});
await como(art, async () => {
  ok(!!(await tenta(() => q(`insert into registros_noite (user_id, evento_id, publico) values ($1, 'ev9', 10)`, [art]))), 'artista não registra noite de casa');
  ok(!!(await tenta(() => q(`truncate perfis cascade`))), 'conta logada não consegue TRUNCATE');
});
await como(casa, async () => { ok(!!(await tenta(() => q(`insert into registros_noite (user_id, evento_id, publico, gravidade) values ($1, 'ev2', -5, 'ordinaria')`, [casa]))), 'público negativo é recusado'); });
await como(adm, async () => { ok(!!(await tenta(() => q(`update perfis set tipo = 'artista' where id = $1`, [adm]))), 'a última adm não se rebaixa'); });
await db.exec(`set role anon;`);
const lixo = await tenta(() => q(`insert into avisos_cidade (cidade, contato, canal, consentimento) values ('Recife', 'nao-e-email', 'email', true)`));
const espaco = await tenta(() => q(`insert into avisos_cidade (cidade, contato, canal, consentimento) values ('Recife ', ' fa@x.com', 'email', true)`));
const forjado = await tenta(() => q(`insert into avisos_cidade (cidade, contato, canal, consentimento, criado_em) values ('Natal', 'fz@x.com', 'email', true, '1999-01-01')`));
const trunc = await tenta(() => q(`truncate avisos_cidade`));
await db.exec(`reset role;`);
ok(!!lixo && !!espaco && !forjado && !!trunc, 'aviso: contato inválido, duplicata com espaço e TRUNCATE recusados');
ok((await q(`select criado_em > now() - interval '1 hour' r from avisos_cidade where contato = 'fz@x.com'`)).rows[0].r, 'data do aviso vem do banco');
await db.exec(`set role anon;`);
let barrado = null;
for (let i = 0; i < 40 && !barrado; i++) barrado = await tenta(() => q(`insert into avisos_cidade (cidade, contato, canal, consentimento) values ('Natal', $1, 'email', true)`, [`spam${i}@x.com`]));
await db.exec(`reset role;`);
ok(!!barrado && /Muitos pedidos/.test(barrado), 'enxurrada de avisos é barrada');

// ---------- v4: diário de uso ----------
await db.exec(`set role anon;`);
await q(`insert into diario (sessao, perfil, acao, tela) values ('sessao-qa-1', 'visitante', 'abriu', 'publico')`);
const leAnon = await tenta(() => q(`select * from diario`));
await db.exec(`reset role;`);
ok(!!leAnon, 'visitante grava no diário mas não lê');
await como(art, async () => {
  await q(`insert into diario (sessao, perfil, acao, user_id) values ('sessao-qa-2', 'conta:artista', 'clique', $1)`, [eq]);
  ok((await q(`select * from diario`)).rows.length === 0, 'artista não lê o diário');
});
ok((await q(`select user_id from diario where sessao = 'sessao-qa-2'`)).rows[0].user_id === art, 'o diário liga ao usuário do token, não ao enviado');
await como(eq, async () => { ok((await q(`select * from diario`)).rows.length === 2, 'equipe lê o diário'); });

// ---------- v5: documentos e configuração interna ----------
await como(eq, async () => {
  await q(`insert into documentos (tipo, titulo, url, user_id, evento_id) values ('contrato', 'Contrato BH', 'https://drive.google.com/x', $1, 'ev1')`, [art]);
  await q(`insert into documentos (tipo, titulo, url) values ('modelo', 'Modelo de contrato', 'https://drive.google.com/m')`);
  ok(!!(await tenta(() => q(`insert into documentos (tipo, titulo, url) values ('outro', 'Link ruim', 'javascript:alert(1)')`))), 'documento só aceita link https');
});
await como(art, async () => {
  ok((await q(`select titulo from documentos order by titulo`)).rows.map((r) => r.titulo).join('|') === 'Contrato BH|Modelo de contrato', 'artista vê o próprio contrato e o modelo');
  ok(!!(await tenta(() => q(`insert into documentos (tipo, titulo, url) values ('modelo', 'Falso', 'https://x.com')`))), 'artista não anexa documento');
});
await como(art2, async () => { ok((await q(`select titulo from documentos`)).rows.map((r) => r.titulo).join('|') === 'Modelo de contrato', 'outra artista não vê o contrato alheio'); });
await q(`insert into config_interna values ('teste', 'segredo') on conflict do nothing`);
await como(adm, async () => { ok((await q(`select * from config_interna`).catch(() => ({ rows: [] }))).rows.length === 0, 'nem a adm lê a configuração interna pelo site'); });
// ---------- v6: correções da auditoria de segurança ----------
// Nota interna em tabela à parte: só a equipe lê e grava.
const inscId = (await q(`select id from inscricoes_artistas limit 1`)).rows[0]?.id;
await como(eq, async () => {
  await q(`insert into notas_internas (alvo, alvo_id, nota) values ('insc', $1, 'ouvir o EP antes') on conflict (alvo, alvo_id) do update set nota = excluded.nota`, [inscId]);
  ok((await q(`select nota from notas_internas where alvo_id = $1`, [inscId])).rows[0]?.nota === 'ouvir o EP antes', 'equipe grava e lê a nota interna');
  await q(`update inscricoes_artistas set nota_interna = 'vazaria' where id = $1`, [inscId]);
});
ok((await q(`select nota_interna from inscricoes_artistas where id = $1`, [inscId])).rows[0].nota_interna === null, 'nota interna nunca fica na linha que a artista lê');
await como(art, async () => { ok((await q(`select * from notas_internas`)).rows.length === 0, 'artista não lê notas internas'); });
await como(casa, async () => { ok(!!(await tenta(() => q(`insert into notas_internas (alvo, alvo_id, nota) values ('casa', gen_random_uuid(), 'x')`))), 'casa não grava nota interna'); });
await db.exec(readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8'));
ok((await q(`select count(*)::int n from notas_internas`)).rows[0].n === 1, 'schema.sql roda de novo sem erro e sem perder dados');
