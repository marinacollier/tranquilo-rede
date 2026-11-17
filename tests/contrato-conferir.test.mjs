// Conferir o contrato assinado que a pessoa enviou (schema v28): quem pode, "Conferir e confirmar", "Pedir de novo",
// trava depois de conferido e registro na auditoria.
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
// Armazenamento do Supabase, só o que a função consulta (a pasta <conta>/contrato_<id>/ no "materiais").
await db.exec(`create schema storage; create table storage.objects (bucket_id text, name text, created_at timestamptz not null default clock_timestamp());`);
await q(`insert into admins_iniciais values ('adm@x.com')`);
const novo = async (email, tipo) => { const id = (await q(`insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`, [email, { tipo, nome: email.split('@')[0] }])).rows[0].id; await q(`update auth.users set email_confirmed_at = now() where id = $1`, [id]); return id; };
const adm = await novo('adm@x.com', 'artista'), isa = await novo('isa@x.com', 'artista'), gui = await novo('gui@x.com', 'artista'), eqLivre = await novo('eq@x.com', 'artista');
const art = await novo('art@x.com', 'artista'), casa = await novo('casa@x.com', 'casa');
await q(`update perfis set tipo = 'equipe', areas = array['agenda'] where id = $1`, [isa]);
await q(`update perfis set tipo = 'equipe', areas = array['operacoes'] where id = $1`, [gui]);
await q(`update perfis set tipo = 'equipe' where id = $1`, [eqLivre]);
await q(`update perfis set tipo = 'casa' where id = $1`, [casa]);
const como = async (uid, fn) => { await db.exec(`set role authenticated; select set_config('tq.uid', '${uid}', false);`); try { return await fn(); } finally { await db.exec(`reset role; select set_config('tq.uid', '', false);`); } };
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALHA') + ' ' + m); if (!c) process.exitCode = 1; };
const tenta = async (fn) => { try { await fn(); return null; } catch (e) { return e.message; } };
const enviar = (uid, cid, nome = 'assinado.pdf') => q(`insert into storage.objects (bucket_id, name) values ('materiais', $1)`, [`${uid}/contrato_${cid}/${Date.now()}-${nome}`]);
const linha = async (cid) => (await q(`select * from contratos where id = $1`, [cid])).rows[0];

const TEXTO = 'CONTRATO DE APRESENTAÇÃO. Artista: Joyce Alane, CPF {{cpf}}. Cachê de R$ 3.000,00 em 05/11/2026, Belo Horizonte. Assinam as partes.';
let cArt, cCasa, cArt2;
await como(adm, async () => {
  ok(!!(await tenta(() => q(`insert into contratos (user_id, titulo, texto, conferido_em) values ($1, 'Já conferido', $2, now())`, [art, TEXTO]))), 'equipe não cria contrato já conferido');
  cArt = (await q(`insert into contratos (user_id, evento_id, titulo, texto, campos) values ($1, 'ev1', 'Contrato artista', $2, '[{"chave":"cpf","rotulo":"CPF"}]') returning id`, [art, TEXTO])).rows[0].id;
  cCasa = (await q(`insert into contratos (user_id, titulo, texto) values ($1, 'Contrato casa', $2) returning id`, [casa, TEXTO])).rows[0].id;
  cArt2 = (await q(`insert into contratos (user_id, titulo, texto) values ($1, 'Contrato artista 2', $2) returning id`, [art, TEXTO])).rows[0].id;
});
await como(art, async () => {
  await q(`select contrato_salvar_dados($1, $2)`, [cArt, { cpf: '123.456.789-09' }]);
  await q(`insert into checklist (user_id, evento_id, item) values ($1, 'ev1', 'contrato')`, [art]);   // o envio marca o passo
  ok(/equipe/.test(await tenta(() => q(`select conferir_contrato($1, true)`, [cArt]))), 'artista não confere o próprio contrato');
});
ok(/ainda não chegou/.test(await como(isa, () => tenta(() => q(`select conferir_contrato($1, true)`, [cArt])))), 'sem arquivo enviado, não há o que conferir');
await enviar(art, cArt); await enviar(casa, cCasa);

// Áreas: Isa (Agenda) confere artista, Gui (Operações) confere casa.
ok(/Agenda/.test(await como(gui, () => tenta(() => q(`select conferir_contrato($1, true)`, [cArt])))), 'Operações não confere contrato de artista');
ok(/Operações/.test(await como(isa, () => tenta(() => q(`select conferir_contrato($1, true)`, [cCasa])))), 'Agenda não confere contrato de casa');

// Pedir de novo
ok(/motivo/.test(await como(isa, () => tenta(() => q(`select conferir_contrato($1, false, '  ')`, [cArt])))), 'pedir de novo exige o motivo');
const dev = await como(isa, async () => (await q(`select * from conferir_contrato($1, false, $2)`, [cArt, 'Faltou   a assinatura na página 2.'])).rows[0]);
ok(dev.devolvido_em && dev.devolvido_por === isa && dev.devolvido_motivo === 'Faltou a assinatura na página 2.' && !dev.conferido_em, 'pedir de novo guarda quem, quando e o motivo');
ok((await q(`select count(*)::int n from checklist where user_id = $1 and evento_id = 'ev1' and item = 'contrato'`, [art])).rows[0].n === 0, 'pedir de novo volta o passo "contrato" da data para pendente');
await como(art, async () => {
  const r = (await q(`select devolvido_motivo from contratos where id = $1`, [cArt])).rows[0];
  ok(r?.devolvido_motivo === 'Faltou a assinatura na página 2.', 'a artista lê o motivo no próprio contrato');
});
ok(/arquivo novo ainda não chegou/.test(await como(isa, () => tenta(() => q(`select conferir_contrato($1, true)`, [cArt])))), 'depois de pedir de novo, só confere quando chegar o arquivo novo');
ok(/arquivo novo ainda não chegou/.test(await como(isa, () => tenta(() => q(`select conferir_contrato($1, false, 'De novo, por favor.')`, [cArt])))), 'não pede de novo duas vezes sem arquivo novo');
await enviar(art, cArt, 'assinado-v2.pdf');

// Conferir e confirmar
const conf = await como(isa, async () => (await q(`select * from conferir_contrato($1, true)`, [cArt])).rows[0]);
ok(conf.conferido_em && conf.conferido_por === isa && !conf.devolvido_em && !conf.devolvido_motivo && conf.status === 'enviado', 'conferir guarda quem e quando e limpa o pedido de novo');
ok(/já foi conferido/.test(await como(isa, () => tenta(() => q(`select conferir_contrato($1, true)`, [cArt])))), 'não confere duas vezes');
ok(/conferido/.test(await como(art, () => tenta(() => q(`select contrato_salvar_dados($1, $2)`, [cArt, { cpf: '000' }])))), 'depois de conferido, os dados da artista não mudam');
await como(isa, () => tenta(() => q(`update contratos set status = 'cancelado' where id = $1`, [cArt])));
ok((await linha(cArt)).status === 'enviado', 'contrato conferido não é cancelado');
await como(isa, () => tenta(() => q(`update contratos set conferido_em = null where id = $1`, [cArt])));
ok(!!(await linha(cArt)).conferido_em, 'a equipe não desfaz a conferência pela tabela');
ok(!!(await tenta(() => q(`delete from contratos where id = $1`, [cArt]))), 'contrato conferido não é apagado');
const aud = (await q(`select quem, depois from auditoria where tabela = 'contratos' and registro = $1 and operacao = 'UPDATE' order by id`, [cArt])).rows;
ok(aud.some((a) => a.quem === isa && a.depois?.conferido_por === isa) && aud.some((a) => a.depois?.devolvido_motivo), 'conferir e pedir de novo ficam na auditoria');

// Casa: Gui confere; equipe sem área e administração também podem.
const cc = await como(gui, async () => (await q(`select * from conferir_contrato($1, true)`, [cCasa])).rows[0]);
ok(cc.conferido_por === gui, 'Operações confere o contrato da casa');
await enviar(art, cArt2);
ok((await como(eqLivre, async () => (await q(`select * from conferir_contrato($1, false, 'Arquivo ilegível, mande de novo.')`, [cArt2])).rows[0])).devolvido_por === eqLivre, 'equipe sem área marcada também confere (como na tela)');
await enviar(art, cArt2, 'nitido.pdf');
ok((await como(adm, async () => (await q(`select * from conferir_contrato($1, true)`, [cArt2])).rows[0])).conferido_por === adm, 'administração confere qualquer contrato');
ok(/cancelado/.test(await como(adm, async () => { const c = (await q(`insert into contratos (user_id, titulo, texto) values ($1, 'Cancelado', $2) returning id`, [art, TEXTO])).rows[0].id; await q(`update contratos set status = 'cancelado' where id = $1`, [c]); return tenta(() => q(`select conferir_contrato($1, true)`, [c])); })), 'contrato cancelado não é conferido');
