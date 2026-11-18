// Propostas de atualização (v34): a equipe propõe pelo histórico, a pessoa aceita, ajusta ou recusa.
// Isa (Agenda) → artistas; Gui (Operações) → casas; administração → todos. Aceita = Ficha e disponibilidade na hora,
// mesmo com a Ficha já enviada (a exceção autorizada às travas). Convite aceito leva a proposta para a conta nova.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import '../src/propostas.js';
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
await db.exec(schema);
await db.exec(schema); // idempotente (teste e produção recebem o mesmo arquivo)
const novo = async (email, tipo) => (await q(`insert into auth.users (email, raw_user_meta_data, email_confirmed_at) values ($1, $2, now()) returning id`, [email, { tipo, nome: email.split('@')[0] }])).rows[0].id;
const como = async (uid, fn) => { await db.exec(`set role authenticated; select set_config('tq.uid', '${uid}', false);`); try { return await fn(); } finally { await db.exec(`reset role; select set_config('tq.uid', '', false);`); } };
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALHA') + ' ' + m); if (!c) process.exitCode = 1; };
const tenta = async (fn) => { try { await fn(); return null; } catch (e) { return e.message; } };

const art = await novo('art@x.com', 'artista'), art2 = await novo('art2@x.com', 'artista'), casa = await novo('casa@x.com', 'casa');
const isa = await novo('isa@x.com', 'artista'), gui = await novo('gui@x.com', 'artista'), adm = await novo('adm@x.com', 'artista');
await q(`update perfis set tipo = 'equipe', areas = array['agenda'] where id = $1`, [isa]);
await q(`update perfis set tipo = 'equipe', areas = array['operacoes'] where id = $1`, [gui]);
await q(`update perfis set tipo = 'adm' where id = $1`, [adm]);
await q(`update perfis set vinculo_nome = 'Casa Um' where id = $1`, [casa]);
// Cenário: inscrição já enviada (travada) e casa habilitada.
await db.exec(`set session_replication_role = replica`);
await q(`insert into inscricoes_artistas (user_id, dados, status) values ($1, '{"nome_artistico":"Ana","cidade_base":"São Paulo","instagram":"@ana"}', 'em_curadoria')`, [art]);
await q(`insert into cadastros_casas (user_id, dados, status) values ($1, '{"nome":"Casa Um","cidade_uf":"Recife/PE","capacidade_sentado":80}', 'habilitada')`, [casa]);
await db.exec(`set session_replication_role = origin`);

// Isa propõe para artista; não para casa.
let pa;
await como(isa, async () => {
  pa = (await q(`insert into propostas_atualizacao (alvo_tipo, alvo_user, campos, disponibilidade, motivo) values ('artista', $1, $2, $3, 'pelo histórico: tocou 3x em Campinas às sextas') returning id, status, antes`,
    [art, { cidades_interesse: ['São Paulo', 'Campinas'], formato_interesse: 'descubra', instagram: '@ana.musica' }, [{ cidade: 'Campinas', dias: [5, 6] }]])).rows[0];
  ok(pa.status === 'pendente' && pa.antes.instagram === '@ana' && pa.antes.formato_interesse === null, 'Isa cria proposta para artista (status pendente e "antes" guardado)');
  ok(!!(await tenta(() => q(`insert into propostas_atualizacao (alvo_tipo, alvo_user, campos) values ('casa', $1, '{"capacidade_sentado":100}')`, [casa]))), 'Isa não propõe para casa');
  ok(!!(await tenta(() => q(`insert into propostas_atualizacao (alvo_tipo, alvo_user, campos) values ('artista', $1, '{"site":"javascript:alert(1)"}')`, [art]))), 'link perigoso é recusado');
  ok(!!(await tenta(() => q(`insert into propostas_atualizacao (alvo_tipo, alvo_user, campos) values ('artista', $1, '{"Nome Ruim":"x"}')`, [art]))), 'nome de campo inválido é recusado');
  ok(!!(await tenta(() => q(`insert into propostas_atualizacao (alvo_tipo, alvo_user, campos, disponibilidade) values ('artista', $1, '{}', '[{"cidade":"X","dias":[9]}]')`, [art]))), 'dia da semana inválido é recusado');
  ok(!!(await tenta(() => q(`insert into propostas_atualizacao (alvo_tipo, alvo_user, campos) values ('artista', $1, '{"instagram":"@x"}')`, [casa]))), 'conta de casa não recebe proposta de artista');
  ok(!!(await tenta(() => q(`update propostas_atualizacao set status = 'aceita' where id = $1`, [pa.id]))) || (await q(`select status from propostas_atualizacao where id = $1`, [pa.id])).rows[0].status === 'pendente', 'equipe não muda o status direto');
});
await como(gui, async () => {
  ok((await q(`select id from propostas_atualizacao`)).rows.length === 0, 'Gui não vê propostas de artista');
  const pc = (await q(`insert into propostas_atualizacao (alvo_tipo, alvo_user, campos, disponibilidade, motivo) values ('casa', $1, '{"capacidade_sentado":100,"instagram":"@casaum"}', '[{"dias":[5,6]}]', 'pelo histórico: recebeu 4x às sextas') returning id`, [casa])).rows[0];
  ok(!!pc.id, 'Gui propõe para casa');
});
await como(art2, async () => { ok((await q(`select id from propostas_atualizacao`)).rows.length === 0, 'outra artista não vê a proposta'); });
await como(art, async () => {
  ok((await q(`select id from propostas_atualizacao`)).rows.length === 1, 'a artista vê a proposta dela');
  ok(!!(await tenta(() => q(`insert into propostas_atualizacao (alvo_tipo, alvo_user, campos) values ('artista', $1, '{"instagram":"@eu"}')`, [art]))), 'artista não cria proposta');
  ok(/Inscrição em análise/.test((await tenta(() => q(`update inscricoes_artistas set dados = dados || '{"instagram":"@outro"}' where user_id = $1`, [art]))) || ''), 'sem proposta, a ficha enviada continua travada');
});
await como(art2, async () => { ok(/não encontrada/.test((await tenta(() => q(`select responder_proposta($1, true)`, [pa.id]))) || ''), 'outra artista não responde a proposta'); });
await como(art, async () => {
  const r = (await q(`select (responder_proposta($1, true)).status`, [pa.id])).rows[0];
  ok(r.status === 'aceita', 'artista aceita tudo');
  ok(/já foi respondida/.test((await tenta(() => q(`select responder_proposta($1, true)`, [pa.id]))) || ''), 'não responde duas vezes');
});
const ia = (await q(`select dados, status from inscricoes_artistas where user_id = $1`, [art])).rows[0];
ok(ia.dados.instagram === '@ana.musica' && ia.dados.formato_interesse === 'descubra' && ia.dados.nome_artistico === 'Ana' && ia.status === 'em_curadoria', 'ficha da artista atualizada na hora, status mantido (exceção autorizada à trava)');
const sem = (await q(`select cidade, dias from disponibilidade_semanal where user_id = $1`, [art])).rows;
ok(sem.length === 1 && sem[0].cidade === 'Campinas' && JSON.stringify(sem[0].dias) === '[5,6]', 'disponibilidade semanal por cidade gravada');
ok((await q(`select aplicando from propostas_atualizacao where id = $1`, [pa.id])).rows[0].aplicando === false, '"aplicando" volta a falso');
ok((await q(`select count(*)::int n from auditoria where tabela = 'propostas_atualizacao'`)).rows[0].n >= 2, 'criar e responder ficam no histórico de alterações');
ok((await q(`select count(*)::int n from auditoria where tabela = 'inscricoes_artistas' and registro is not null and depois ? 'dados'`)).rows[0].n >= 1, 'a mudança na ficha fica no histórico de alterações');

// Casa: ajusta (muda a capacidade e tira o Instagram) e os dias somam aos que já tinha.
await como(casa, async () => { await q(`insert into disponibilidade_semanal (casa_ref, dias) values ('Casa Um', '{2}')`); });
const pc = (await q(`select id from propostas_atualizacao where alvo_tipo = 'casa'`)).rows[0];
await como(casa, async () => {
  ok(!!(await tenta(() => q(`select responder_proposta($1, true, '{"campos":{"cnpj":"1"}}')`, [pc.id]))), 'ajuste não inclui campo fora da proposta');
  const r = (await q(`select (responder_proposta($1, true, '{"campos":{"capacidade_sentado":90,"instagram":""}}')).status`, [pc.id])).rows[0];
  ok(r.status === 'ajustada', 'casa aceita com ajustes (status "ajustada")');
});
const cc = (await q(`select dados, status from cadastros_casas where user_id = $1`, [casa])).rows[0];
ok(cc.dados.capacidade_sentado === 90 && !('instagram' in cc.dados) && cc.status === 'habilitada', 'ficha da casa habilitada atualizada com o ajuste');
ok(JSON.stringify((await q(`select dias from disponibilidade_semanal where casa_ref = 'Casa Um'`)).rows[0].dias) === '[2,5,6]', 'dias propostos somam aos que a casa já tinha');

// Recusar não muda nada.
let pr;
await como(isa, async () => { pr = (await q(`insert into propostas_atualizacao (alvo_tipo, alvo_user, campos) values ('artista', $1, '{"cidade_base":"Campinas"}') returning id`, [art])).rows[0].id; });
await como(art, async () => { ok((await q(`select (responder_proposta($1, false)).status`, [pr])).rows[0].status === 'recusada', 'artista recusa'); });
ok((await q(`select dados->>'cidade_base' c from inscricoes_artistas where user_id = $1`, [art])).rows[0].c === 'São Paulo', 'recusada não muda a ficha');

// Sem conta: proposta com alvo_ref e convite; ao aceitar o convite, a proposta é da conta nova.
let pn;
await como(isa, async () => {
  pn = (await q(`insert into propostas_atualizacao (alvo_tipo, alvo_ref, convite_email, campos) values ('artista', 'Bia Sem Conta', 'Bia@X.com', '{"cidade_base":"Recife"}') returning id, alvo_user, convite_email`)).rows[0];
  ok(pn.alvo_user === null && pn.convite_email === 'bia@x.com', 'proposta para quem ainda não tem conta (nome e e-mail do convite)');
  await q(`insert into convites (email, tipo, nome, vinculo_nome) values ('bia@x.com', 'artista', 'Bia', 'Bia Sem Conta')`);
});
const bia = await novo('bia@x.com', 'artista');
await q(`update convites set aceito_em = now() where email = 'bia@x.com' and aceito_em is null`);
ok((await q(`select alvo_user from propostas_atualizacao where id = $1`, [pn.id])).rows[0].alvo_user === bia, 'convite aceito leva a proposta para a conta nova');
await como(bia, async () => { ok((await q(`select (responder_proposta($1, true)).status`, [pn.id])).rows[0].status === 'aceita', 'conta nova aceita'); });
ok((await q(`select dados->>'cidade_base' c, status from inscricoes_artistas where user_id = $1`, [bia])).rows[0].c === 'Recife', 'sem inscrição ainda: a proposta aceita cria o rascunho da ficha');

// Adm vê tudo; equipe sem área também.
await como(adm, async () => { ok((await q(`select id from propostas_atualizacao`)).rows.length === 4, 'administração vê todas as propostas'); });

// Regras do site (src/propostas.js) batem com o banco: chaves válidas e dias de 0 a 6.
const P = globalThis.TQPropostas;
ok(['artista', 'casa'].every((t) => P.CAMPOS[t].every(([k]) => /^[a-z_0-9]+$/.test(k) && k.length <= 60)), 'campos propostos pelo site têm nomes aceitos pelo banco');
ok(P.podePropor({ tipo: 'equipe', areas: ['agenda'] }, 'artista') && !P.podePropor({ tipo: 'equipe', areas: ['agenda'] }, 'casa') && P.podePropor({ tipo: 'adm' }, 'casa') && P.podePropor({ tipo: 'equipe', areas: null }, 'casa'), 'site e banco: quem propõe para quem');
