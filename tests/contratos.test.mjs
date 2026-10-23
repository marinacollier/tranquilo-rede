// Contrato automático (schema v7): quem cria, quem preenche, leitura até o fim, assinatura e trava depois de assinado.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
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
// Fluxo real: cadastro e depois confirmação pelo link do e-mail.
const novo = async (email, tipo) => { const id = (await q(`insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`, [email, { tipo, nome: email.split('@')[0] }])).rows[0].id; await q(`update auth.users set email_confirmed_at = now() where id = $1`, [id]); return id; };
const adm = await novo('adm@x.com', 'artista'), art = await novo('art@x.com', 'artista'), art2 = await novo('art2@x.com', 'artista');
const como = async (uid, fn) => { await db.exec(`set role authenticated; select set_config('tq.uid', '${uid}', false);`); try { return await fn(); } finally { await db.exec(`reset role; select set_config('tq.uid', '', false);`); } };
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALHA') + ' ' + m); if (!c) process.exitCode = 1; };
const tenta = async (fn) => { try { await fn(); return null; } catch (e) { return e.message; } };
const sha = (t) => createHash('sha256').update(t, 'utf8').digest('hex');

const TEXTO = 'CONTRATO DE APRESENTAÇÃO. Artista: Joyce Alane, CPF {{cpf}}, residente em {{endereco}}. Cachê de R$ 3.000,00 em 05/11/2026, Belo Horizonte. Assinam as partes.';
const CAMPOS = [{ chave: 'cpf', rotulo: 'CPF' }, { chave: 'endereco', rotulo: 'Endereço' }];
let cid;
await como(art, async () => {
  ok(!!(await tenta(() => q(`insert into contratos (user_id, titulo, texto) values ($1, 'Meu contrato', $2)`, [art, TEXTO]))), 'artista não cria contrato');
  ok(!!(await tenta(() => q(`insert into modelos_contrato (nome, texto) values ('Modelo', $1)`, [TEXTO]))), 'artista não cria modelo');
});
await como(adm, async () => {
  await q(`insert into modelos_contrato (nome, texto) values ('Apresenta', $1)`, [TEXTO]);
  ok(!!(await tenta(() => q(`insert into contratos (user_id, titulo, texto, status) values ($1, 'x', $2, 'assinado')`, [art, TEXTO]))), 'equipe não cria contrato já assinado');
  cid = (await q(`insert into contratos (user_id, evento_id, titulo, texto, campos) values ($1, 'ev1', 'Contrato Joyce · BH 05/11', $2, $3) returning id`, [art, TEXTO, JSON.stringify(CAMPOS)])).rows[0].id;
});
await como(art2, async () => {
  ok((await q(`select * from contratos`)).rows.length === 0, 'outra artista não vê o contrato');
  ok(!!(await tenta(() => q(`select contrato_salvar_dados($1, $2)`, [cid, { cpf: '1' }]))), 'outra artista não preenche o contrato');
});
await como(art, async () => {
  ok((await q(`select * from contratos`)).rows.length === 1, 'artista vê o próprio contrato');
  ok(!!(await tenta(() => q(`update contratos set texto = 'outro texto qualquer com mais de cinquenta caracteres para passar' where id = $1`, [cid]))), 'artista não altera o texto');
  ok(!!(await tenta(() => q(`select contrato_salvar_dados($1, $2)`, [cid, { cache: '99999' }]))), 'artista não preenche campo que não é dela');
  ok(!!(await tenta(() => q(`select contrato_salvar_dados($1, $2)`, [cid, { cpf: '{{endereco}}' }]))), 'valor não pode trazer {{campo}}');
  await q(`select contrato_salvar_dados($1, $2)`, [cid, { cpf: '123.456.789-00' }]);
  ok(/preencha antes de assinar: Endereço/.test(await tenta(() => q(`select assinar_contrato($1, 'Joyce Alane', 'x')`, [cid]))), 'não assina com campo vazio');
  await q(`select contrato_salvar_dados($1, $2)`, [cid, { cpf: '123.456.789-00', endereco: 'Rua A, 10, Recife' }]);
  ok(/até o fim/.test(await tenta(() => q(`select assinar_contrato($1, 'Joyce Alane', 'x')`, [cid]))), 'não assina sem ler até o fim');
  await q(`select contrato_li_ate_o_fim($1)`, [cid]);
  const final = TEXTO.replace('{{cpf}}', '123.456.789-00').replace('{{endereco}}', 'Rua A, 10, Recife');
  ok(/nome completo/.test(await tenta(() => q(`select assinar_contrato($1, 'Joyce', $2)`, [cid, sha(final)]))), 'exige nome completo');
  ok(/mudou/.test(await tenta(() => q(`select assinar_contrato($1, 'Joyce Alane', $2)`, [cid, sha(final + ' ')]))), 'não assina se o texto da tela for outro');
  const r = (await q(`select * from assinar_contrato($1, '  Joyce   Alane ', $2)`, [cid, sha(final)])).rows[0];
  ok(r.status === 'assinado' && r.texto_final === final && r.hash === sha(final) && r.assinado_nome === 'Joyce Alane' && r.assinado_em, 'assinatura guarda o texto final, o hash, o nome e a hora');
  ok(!!(await tenta(() => q(`select contrato_salvar_dados($1, $2)`, [cid, { cpf: '000' }]))), 'depois de assinado, os dados não mudam');
  ok(!!(await tenta(() => q(`select assinar_contrato($1, 'Outra Pessoa', $2)`, [cid, sha(final)]))), 'não assina duas vezes');
});
await como(adm, async () => {
  await tenta(() => q(`update contratos set status = 'cancelado' where id = $1`, [cid]));
  ok((await q(`select status from contratos where id = $1`, [cid])).rows[0].status === 'assinado', 'nem a equipe cancela um contrato assinado');
  ok((await q(`delete from contratos where id = $1`, [cid]).catch(() => ({ affectedRows: 0 }))).affectedRows === 0, 'contrato assinado não é apagado');
  const c2 = (await q(`insert into contratos (user_id, titulo, texto, campos) values ($1, 'Outro', $2, '[]') returning id`, [art, TEXTO])).rows[0].id;
  await q(`update contratos set status = 'cancelado' where id = $1`, [c2]);
  ok((await q(`select status from contratos where id = $1`, [c2])).rows[0].status === 'cancelado', 'equipe cancela contrato ainda não assinado');
  ok(!!(await tenta(() => q(`update contratos set texto = $2 where id = $1`, [c2, TEXTO + ' alterado']))), 'equipe não reescreve o texto depois de enviado');
});
