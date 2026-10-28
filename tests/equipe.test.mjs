// Equipe da casa por função e Trilha da Nova Casa: regras do site (src/equipe.js) iguais às do banco (schema v11)
// e permissões no Postgres local (PGlite). Rodar: npm test
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import '../src/equipe.js';
import '../src/regras.js';
const E = globalThis.TQEquipe, R = globalThis.TQRegras;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALHA') + ' ' + m); if (!c) process.exitCode = 1; };
const tenta = async (fn) => { try { await fn(); return null; } catch (e) { return e.message; } };
const schema = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');

// ---------- regras no site ----------
const subconjuntos = [];
for (let m = 1; m < 1 << E.CHAVES.length; m++) subconjuntos.push(E.CHAVES.filter((_, i) => m & (1 << i)));
ok(E.funcoesErro(['anfitriao', 'social_media']) && E.funcoesErro(['som', 'bar']) && !E.funcoesErro(['som', 'lider']) && !E.funcoesErro(['produtor', 'porta']), 'acúmulos: anfitrião ≠ social media; som só com Líder Local; produtor com porta pode');
ok(E.funcoesAvisos(['produtor', 'anfitriao']).length === 1 && !E.funcoesAvisos(['produtor', 'bar', 'lider']).length, 'combinação fora do Guia vira aviso (não bloqueia)');
const cheia = [{ nome: 'A', funcoes: ['lider', 'produtor', 'porta'] }, { nome: 'B', funcoes: ['anfitriao'] }, { nome: 'C', funcoes: ['social_media'] }, { nome: 'D', funcoes: ['som'] }, { nome: 'E', funcoes: ['bar'] }, { nome: 'F', funcoes: ['bar'], reserva: true }];
ok(E.cobertura(cheia).completa, 'equipe com as 7 funções, 5 pessoas e 1 reserva está completa');
const c2 = E.cobertura(cheia.slice(0, 4));
ok(!c2.completa && c2.faltam.join() === 'bar' && c2.pend.some((p) => /mínimo é 5/.test(p)) && c2.pend.some((p) => /reserva/.test(p)), 'equipe incompleta: mostra função sem titular, mínimo de 5 e reserva');
ok(E.diaUtil('2027-01-04', 7) === '2027-01-12' && E.diaUtil('2027-01-01', 1) === '2027-01-04' && E.diaUtil('2026-11-19', 2) === '2026-11-23', 'dias úteis: 04/01/2027 fecha em 12/01 (como na simulação), pula feriado e fim de semana');
const a = E.andamento('2027-01-04', { nota: { em: 'x' }, msg1: {} }, '2027-01-06');
ok(a.feitas === 2 && a.com === 'casa' && a.proxima.chave === 'resp_espaco' && a.atrasadas === 2 && a.fim === '2027-01-12', `andamento: bastão com a casa, ${a.atrasadas} etapas atrasadas`);
ok(R.PASSOS_CASA.every(([k]) => E.PASSO_FUNCOES[k]), 'todo passo da casa tem função responsável');
ok(E.vePasso(['bar'], 'estoque') && !E.vePasso(['bar'], 'pacote_grupo') && E.vePasso(['lider'], 'pacote_grupo') && E.vePasso(null, 'fechamento'), 'cada função vê os passos dela; dono e Líder Local veem todos');
const lista = schema.match(/etapa_ not in \(([^)]*)\)/)[1].match(/'([a-z_]+)'/g).map((x) => x.slice(1, -1));
ok(lista.join() === E.ETAPAS_CASA.join(), 'etapas que a casa marca: iguais no site e no banco');
const ts = (await import('node:fs')).readFileSync(new URL('../supabase/functions/lembretes/index.ts', import.meta.url), 'utf8');
ok(R.PASSOS_CASA.every(([k, d]) => ts.includes(`["${k}", ${d},`)), 'lembretes por e-mail têm os mesmos passos da casa');
ok(ts.includes(JSON.stringify(E.PASSO_FUNCOES)), 'lembretes por e-mail usam o mesmo mapa de passos por função');

// ---------- banco ----------
const db = new PGlite();
const q = (s, p) => db.query(s, p);
await db.exec(`
create role anon nologin; create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb, encrypted_password text default 'hash', email_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('tq.uid', true), '')::uuid $$;
grant usage on schema auth to authenticated, anon; grant execute on function auth.uid() to authenticated, anon;`);
await db.exec(schema);
const novo = async (email, tipo) => (await q(`insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`, [email, { tipo, nome: email.split('@')[0] }])).rows[0].id;
const como = async (uid, fn) => { await db.exec(`set role authenticated; select set_config('tq.uid', '${uid}', false);`); try { return await fn(); } finally { await db.exec(`reset role; select set_config('tq.uid', '', false);`); } };
const dono = await novo('dono@aurora.com', 'casa'), outra = await novo('dono@outra.com', 'casa'), eq = await novo('gui@x.com', 'artista');
await q(`update perfis set codigo_acesso = 'AAAA-BBBB-CCCC', vinculo_nome = 'Casa Aurora' where id = $1`, [dono]);
await q(`update perfis set codigo_acesso = 'DDDD-EEEE-FFFF', vinculo_nome = 'Casa Outra' where id = $1`, [outra]);
await q(`update perfis set tipo = 'equipe' where id = $1`, [eq]);
const sql = (r) => r.rows;

let prod;
await como(dono, async () => {
  prod = sql(await q(`insert into equipe_casa (casa_ref, nome, whatsapp, email, funcoes) values ('Casa Aurora', ' Ana ', '11 9999-0000', 'Ana@Aurora.com', '{produtor,porta,produtor}') returning id, nome, email, funcoes`))[0];
  ok(prod.nome === 'Ana' && prod.email === 'ana@aurora.com' && prod.funcoes.join() === 'porta,produtor', 'dono cadastra pessoa da equipe (nome, e-mail e funções normalizados)');
  const e = await tenta(() => q(`insert into equipe_casa (casa_ref, nome, funcoes) values ('Casa Aurora', 'Bia', '{anfitriao,social_media}')`));
  ok(/nunca são a mesma pessoa/.test(e || ''), 'banco recusa anfitrião e social media na mesma pessoa');
  const e2 = await tenta(() => q(`insert into equipe_casa (casa_ref, nome, funcoes) values ('Casa Outra', 'Intrusa', '{bar}')`));
  ok(!!e2, 'dono não mexe na equipe de outra casa');
  ok(sql(await q(`select convidar_equipe_casa($1) r`, [prod.id]))[0].r === 'convidado', 'dono convida a pessoa para a plataforma');
});
const cv = sql(await q(`select tipo, vinculo_nome, codigo_acesso, funcoes from convites where email = 'ana@aurora.com'`))[0];
ok(cv?.tipo === 'casa' && cv.vinculo_nome === 'Casa Aurora' && cv.codigo_acesso === 'AAAA-BBBB-CCCC' && cv.funcoes.join() === 'porta,produtor', 'convite sai ligado à casa e com as funções');
await como(outra, async () => {
  ok(!sql(await q(`select * from equipe_casa`)).length, 'outra casa não vê a equipe da Aurora');
  ok(!!(await tenta(() => q(`select convidar_equipe_casa($1)`, [prod.id]))), 'outra casa não convida pela Aurora');
});
const ana = await novo('ana@aurora.com', 'artista');
await q(`update auth.users set email_confirmed_at = now() where id = $1`, [ana]);   // o convite vale ao confirmar o e-mail
const pa = sql(await q(`select tipo, vinculo_nome, codigo_acesso, funcoes from perfis where id = $1`, [ana]))[0];
ok(pa.tipo === 'casa' && pa.vinculo_nome === 'Casa Aurora' && pa.funcoes.join() === 'porta,produtor', 'ao criar a conta, a pessoa entra na casa com a função');
await como(ana, async () => {
  await q(`update perfis set funcoes = '{lider}' where id = $1`, [ana]);
  ok(sql(await q(`select equipe_da_casa()`)).length === 1, 'pessoa da equipe vê a equipe da casa');
  ok(!!(await tenta(() => q(`insert into equipe_casa (casa_ref, nome, funcoes) values ('Casa Aurora', 'X', '{bar}')`))), 'pessoa da equipe não mexe na equipe (só o dono)');
  await q(`insert into checklist (user_id, evento_id, item) values ($1, 'ev1', 'pacote_grupo')`, [ana]);
  ok(!!(await tenta(() => q(`select trilha_marcar_casa('leitura', true)`))), 'pessoa da equipe não confirma etapa da trilha');
});
ok(sql(await q(`select funcoes from perfis where id = $1`, [ana]))[0].funcoes.join() === 'porta,produtor', 'pessoa da equipe não muda a própria função');
await como(dono, async () => {
  ok(sql(await q(`select * from equipe_da_casa()`))[0].acesso === 'ativo', 'dono vê que a pessoa já tem acesso');
  ok(sql(await q(`select * from checklist_da_casa()`)).some((c) => c.item === 'pacote_grupo'), 'passo marcado pelo produtor aparece para o dono');
  await q(`select desmarcar_passo_casa('ev1', 'pacote_grupo')`);
  await q(`update equipe_casa set funcoes = '{bar}' where id = $1`, [prod.id]);
});
ok(!sql(await q(`select * from checklist where item = 'pacote_grupo'`)).length, 'dono desmarca o passo que o produtor marcou');
ok(sql(await q(`select funcoes from perfis where id = $1`, [ana]))[0].funcoes.join() === 'bar', 'dono muda a função e a conta da pessoa acompanha');
await como(outra, async () => { ok(!sql(await q(`select * from checklist_da_casa()`)).length, 'outra casa não vê o checklist da Aurora'); });
await como(dono, async () => { await q(`delete from equipe_casa where id = $1`, [prod.id]); });
const pa2 = sql(await q(`select vinculo_nome, codigo_acesso, funcoes from perfis where id = $1`, [ana]))[0];
ok(!pa2.vinculo_nome && !pa2.codigo_acesso && !pa2.funcoes, 'tirar da equipe desliga a conta da casa');
await como(dono, async () => { await q(`update perfis set funcoes = '{bar}' where id = $1`, [dono]); });
ok(!sql(await q(`select funcoes from perfis where id = $1`, [dono]))[0].funcoes, 'dono não vira pessoa da equipe por conta própria');

// Trilha
await como(eq, async () => {
  await q(`insert into trilhas (casa_ref, inicio, nota_passagem) values ('Casa Aurora', '2027-01-04', 'combinado financeiro: 70/30')`);
  await q(`insert into trilha_marcos (casa_ref, etapa) values ('Casa Aurora', 'nota')`);
});
await como(dono, async () => {
  ok(!sql(await q(`select * from trilhas`)).length, 'casa não lê a nota de passagem (interna)');
  const t = sql(await q(`select * from minha_trilha()`))[0];
  ok(t && t.inicio && t.marcos.nota && !('nota_passagem' in t), 'casa vê a própria trilha, sem a nota');
  await q(`select trilha_marcar_casa('leitura', true)`);
  ok(!!(await tenta(() => q(`select trilha_marcar_casa('campanha', true)`))), 'casa não marca etapa da Central');
  ok(!!(await tenta(() => q(`insert into trilha_marcos (casa_ref, etapa) values ('Casa Aurora', 'proposta')`))), 'casa não grava marco direto na tabela');
});
await como(outra, async () => { ok(!sql(await q(`select * from minha_trilha()`)).length, 'outra casa não vê a trilha da Aurora'); });
ok(sql(await q(`select etapa from trilha_marcos order by etapa`)).map((r) => r.etapa).join() === 'leitura,nota', 'confirmação de leitura da casa registrada');
