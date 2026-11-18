// Dados de teste equilibrados (scripts/equilibrio.mjs, MODO=equilibrio do workflow vitrine) contra o schema real no PGlite.
// Auth e armazenamento são simulados: auth.users e storage.objects são tabelas simples; criar conta e enviar arquivo gravam nelas.
// Confere que apaga só o que é teste, que cria 2 em cada status sem FALHA na verificação do próprio script e que rodar 2x recria.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { equilibrio, verificar, MANTER, DOM, CASAS, ARTISTAS, hojeSP } from '../scripts/equilibrio.mjs';

const db = new PGlite();
const q = (s, p) => db.query(s, p);
await db.exec(`
create role anon nologin; create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb, encrypted_password text default 'hash', email_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), nullif(current_setting('tq.uid', true), ''))::uuid $$;
grant usage on schema auth to authenticated, anon; grant execute on function auth.uid() to authenticated, anon;
create schema storage;
create table storage.objects (bucket_id text, name text, created_at timestamptz not null default clock_timestamp());
`);
await db.exec(readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8'));

const res = [];
const ok = (c, m) => { res.push(c); if (!c) { console.log('FALHA ' + m); process.exitCode = 1; } };
const teste = (c, m) => { console.log((c ? 'OK    ' : 'FALHA ') + m); if (!c) process.exitCode = 1; };
const novo = async (email, tipo, nome = email.split('@')[0]) => (await q(`insert into auth.users (email, raw_user_meta_data, email_confirmed_at) values ($1, $2, now()) returning id`, [email, { tipo, nome }])).rows[0].id;
const um = async (s, p) => (await q(s, p)).rows[0];

// ---------- o banco antes: equipe, caso pronto, conta real e testes antigos ----------
const central = await novo(MANTER[0], 'artista', 'Central (caso de teste)');
await q(`update perfis set tipo = 'equipe', areas = '{agenda,operacoes}' where id = $1`, [central]);
const adm = await novo('adm@exemplo.com.br', 'artista'); await q(`update perfis set tipo = 'adm' where id = $1`, [adm]);
const staffTeste = await novo(`isa.agenda@${DOM}`, 'artista'); await q(`update perfis set tipo = 'equipe' where id = $1`, [staffTeste]);
const FICHA = { cidade_uf: 'São Paulo/SP', endereco: 'Rua X, 1', dono_nome: 'Dono', whatsapp: '(11) 90000-0000', capacidade_sentado: '50' };
const casaPronto = await novo(MANTER[1], 'casa'); await novo(MANTER[2], 'artista');
await q(`insert into cadastros_casas (user_id, dados, status) values ($1, $2, 'habilitada')`, [casaPronto, { ...FICHA, nome: 'Casa Aurora (teste)' }]);
await q(`insert into campanhas (slug, titulo, casa_ref) values ('teste-campanha-4', 'Aurora', 'Casa Aurora (teste)')`);
const real = await novo('dona.real@exemplo.com.br', 'casa');
const realCasa = (await um(`insert into cadastros_casas (user_id, dados, status) values ($1, $2, 'habilitada') returning id`, [real, { ...FICHA, nome: 'Bar Real' }])).id;
await q(`insert into disponibilidade_semanal (casa_ref, dias) values ('Bar Real', '{5}')`);
const velhaC = await novo('teste.casa1@teste-e2e.invalid', 'casa'), velhaA = await novo('teste.artista1@teste-e2e.invalid', 'artista');
await novo('curadoria.forte@teste-e2e.invalid', 'artista'); await novo(`artista.ficha@${DOM}`, 'artista');
await q(`insert into cadastros_casas (user_id, dados, status) values ($1, $2, 'habilitada')`, [velhaC, { ...FICHA, nome: 'TESTE · Bar do Farol' }]);
await q(`update perfis set vinculo_nome = 'TESTE · Bar do Farol' where id = $1`, [velhaC]);
await q(`insert into disponibilidade_semanal (casa_ref, dias) values ('TESTE · Bar do Farol', '{5,6}')`);
await q(`insert into campanhas (slug, titulo, casa_ref) values ('teste-campanha-1', 'Farol', 'TESTE · Bar do Farol')`);
const dReal = (await um(`insert into datas_portal (dia, produto, casa_id, casa_nome, artistas) values ('2026-12-04', 'Descubra', $1, 'Bar Real', $2) returning id`,
  [realCasa, JSON.stringify([{ nome: 'TESTE · Clara Neves', user_id: velhaA, ordem: 1 }, { nome: 'Banda de verdade', ordem: 2 }])])).id;
const ctVelho = (await um(`insert into contratos (user_id, evento_id, titulo, texto, status, criado_por) values ($1, $2, 'Velho', $3, 'enviado', $4) returning id`, [velhaA, 'p:' + dReal, 'x'.repeat(60), central])).id;
await q(`update contratos set conferido_em = now() where id = $1`, [ctVelho]);   // conferido: só sai com o gatilho desligado
await q(`insert into storage.objects (bucket_id, name) values ('materiais', $1)`, [`${velhaA}/contrato_${ctVelho}/a.pdf`]);
const MOD = (n) => `Contrato ${n} (modelo de teste). Contratada: [PREENCHER NOME COMPLETO], CPF [PREENCHER CPF], endereço [PREENCHER ENDEREÇO], Pix [PREENCHER CHAVE PIX]. Show de {{artista}} em {{data}} na {{casa}}, {{cidade}}, às {{horario}}. Cachê {{cache}}.`;
await q(`insert into modelos_contrato (nome, texto) values ('Artista · Descubra', $1), ('Artista · Apresenta', $2), ('Casa · Parceria', $3)`, [MOD('Descubra'), MOD('Apresenta'),
  'Contrato de parceria (modelo de teste). Casa: [RAZÃO SOCIAL], CNPJ [CNPJ], representada por [PREENCHER NOME COMPLETO], CPF [PREENCHER CPF], RG [PREENCHER RG]. Bilheteria da casa: [BILHETERIA] %. Assinado em {{data_assinatura}}.']);

const ctx = (hoje) => ({
  hoje, ok, log: () => {}, HASH: '$2a$10$' + 'a'.repeat(53),
  sql: async (s) => (await db.exec(s)).at(-1)?.rows ?? [],
  criarConta: novo,
  subirArquivo: async (caminho) => { await q(`insert into storage.objects (bucket_id, name) values ('materiais', $1)`, [caminho]); },
  apagarArquivos: async (caminhos) => { await q(`delete from storage.objects where name = any($1)`, [caminhos]); },
});
const linhas = [];
const ctxLog = (hoje) => ({ ...ctx(hoje), log: (m) => linhas.push(m) });

// ---------- 1ª rodada ----------
const H1 = hojeSP();
res.length = 0; await equilibrio(ctxLog(H1));
teste(res.length > 40 && res.every(Boolean), `1ª rodada (hoje ${H1}): ${res.length} verificações do script, nenhuma FALHA`);
const conta = async () => (await um(`select (select count(*)::int from auth.users where email like '%@${DOM}') teste,
  (select count(*)::int from auth.users where email like 'teste.%' or email like 'curadoria.%' or email = 'artista.ficha@${DOM}') velhas,
  (select count(*)::int from auth.users where email in ('${MANTER.join("','")}', 'dona.real@exemplo.com.br', 'adm@exemplo.com.br', 'isa.agenda@${DOM}')) ficam,
  (select count(*)::int from datas_portal) datas, (select count(*)::int from contratos) contratos, (select count(*)::int from campanhas) campanhas,
  (select count(*)::int from storage.objects) arquivos`));
const n1 = await conta();
teste(n1.teste === CASAS.length + ARTISTAS.length + 1 && n1.velhas === 0, `contas: ${n1.teste - 1} criadas @${DOM} (+ a da equipe, que fica); testes antigos apagados`);
teste(n1.ficam === MANTER.length + 3, 'ficam o caso pronto, a Central, a conta real, a administração e a conta da equipe @tranquilo.teste');
const dr = await um(`select artistas from datas_portal where id = $1`, [dReal]);
teste(dr && dr.artistas.length === 2 && !dr.artistas.some((a) => a.user_id), 'data da casa real fica; o artista de teste apagado sai do line-up só como conta (o nome fica)');
teste((await um(`select count(*)::int n from campanhas where slug = 'teste-campanha-4'`)).n === 1 && (await um(`select count(*)::int n from campanhas where slug = 'teste-campanha-1'`)).n === 0,
  'campanha do caso pronto fica; a da casa de teste antiga sai');
teste((await um(`select count(*)::int n from storage.objects where name like $1`, [velhaA + '/%'])).n === 0, 'arquivos da conta de teste antiga apagados');
teste((await um(`select count(*)::int n from disponibilidade_semanal where casa_ref = 'Bar Real'`)).n === 1, 'disponibilidade da casa real fica');
teste(n1.datas === 11 && n1.contratos === 20 && n1.campanhas === 9, `${n1.datas - 1} datas, ${n1.contratos} contratos e ${n1.campanhas - 1} campanhas de teste`);

// O que cada pessoa vê pelo banco (RLS), como no portal.
const como = async (uid, fn) => { await db.exec(`set role authenticated; select set_config('tq.uid', '${uid}', false);`); try { return await fn(); } finally { await db.exec(`reset role; select set_config('tq.uid', '', false);`); } };
const id = async (email) => (await um(`select id from auth.users where email = $1`, [email])).id;
await como(await id(`casa.conferir1@${DOM}`), async () => {
  teste((await q(`select slug from campanhas`)).rows.length === 1, 'a casa vê a campanha dela (e só a dela)');
  teste((await q(`select id from datas_portal`)).rows.length === 1, 'a casa vê a data dela');
});
await como(await id(`artista.dados1@${DOM}`), async () => {
  const c = (await q(`select campos, dados from contratos`)).rows;
  teste(c.length === 1 && c[0].campos.some((x) => !String(c[0].dados[x.chave] ?? '').trim()), 'a artista em "aguardando dados" vê o contrato com campo em branco');
});
await como(await id(`artista.turne1@${DOM}`), async () => { teste((await q(`select id from datas_portal`)).rows.length === 3, 'o artista da Turnê vê as 3 datas'); });
const dev = await um(`select devolvido_motivo, conferido_em from contratos k join auth.users u on u.id = k.user_id where u.email = $1`, [`casa.devolvido1@${DOM}`]);
teste(!!dev.devolvido_motivo && !dev.conferido_em, 'contrato devolvido pela função conferir_contrato, com o motivo');

// ---------- 2ª rodada: recria (idempotente), numa sexta ----------
let sexta = H1; while (new Date(sexta + 'T12:00:00Z').getUTCDay() !== 5) sexta = new Date(Date.parse(sexta + 'T12:00:00Z') + 864e5).toISOString().slice(0, 10);
res.length = 0; linhas.length = 0; await equilibrio(ctxLog(sexta));
teste(res.length > 40 && res.every(Boolean), `2ª rodada (hoje ${sexta}, sexta): nenhuma FALHA`);
const n2 = await conta();
teste(JSON.stringify({ ...n2, arquivos: 0 }) === JSON.stringify({ ...n1, arquivos: 0 }) && n2.arquivos === n1.arquivos, 'rodar de novo recria a mesma quantidade (contas, datas, contratos, campanhas, arquivos)');
console.log(linhas.filter((l) => l.startsWith('RESUMO')).join('\n'));

// ---------- a verificação pega incoerência ----------
await db.exec(`select set_config('request.jwt.claim.sub', '${central}', true); update inscricoes_artistas set status = 'reprovada' where user_id = (select id from auth.users where email = 'artista.conferido1@${DOM}');
delete from equipe_casa where casa_ref = 'Casa Lua Cheia (teste)' and 'porta' = any(funcoes);
delete from campanha_feitos where item_id in (select i.id from campanha_itens i join campanhas c on c.id = i.campanha_id where c.slug = 'teste-eq-3');`);
await import('../src/regras.js');
const falhas = [];
await verificar({ ...ctx(sexta), ok: (c, m) => { if (!c) falhas.push(m); } }, { hoje: sexta, R: globalThis.TQRegras, como: (u) => `select set_config('request.jwt.claim.sub', '${u}', true);` });
teste(falhas.some((m) => /Nina Brisa/.test(m)) && falhas.some((m) => /Casa Lua Cheia/.test(m) && /equipe completa/.test(m)) && falhas.some((m) => /campanhas: 2 em dia/.test(m)),
  `a verificação marca FALHA quando algo não bate (${falhas.length}: artista reprovado com contrato, casa com contrato sem equipe completa, campanha fora do lugar)`);
