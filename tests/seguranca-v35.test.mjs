// v35: correções de segurança da rodada de testes de 21/11/2026 (pedido da Marina).
// 1 casa que copia o nome de outra · 2 proposta aceita por casa sem vínculo · 3 áreas da equipe no banco e dados de repasse
// 4 links com caracteres de controle · 5 IP da assinatura com a cadeia inteira · 6 funcionário da casa vê as datas da casa.
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
const como = async (uid, fn) => { await db.exec(`set role authenticated; select set_config('tq.uid', '${uid}', false);`); try { return await fn(); } finally { await db.exec(`reset role; select set_config('tq.uid', '', false); select set_config('request.headers', '', false);`); } };
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALHA') + ' ' + m); if (!c) process.exitCode = 1; };
const tenta = async (fn) => { try { await fn(); return null; } catch (e) { return e.message || String(e); } };
const um = async (s, p) => (await q(s, p)).rows[0];
const FICHA = { cidade_uf: 'São Paulo/SP', endereco: 'Rua X, 1', dono_nome: 'Dono', whatsapp: '(11) 90000-0000', capacidade_sentado: '50' };
const equipe = async (email, areas) => { const id = await novo(email, 'artista'); await q(`update perfis set tipo = 'equipe', areas = $2 where id = $1`, [id, areas]); return id; };

const adm = await novo('adm@x.com', 'artista'); await q(`update perfis set tipo = 'adm' where id = $1`, [adm]);
const eqOp = await equipe('op@x.com', ['operacoes']), eqAg = await equipe('ag@x.com', ['agenda']);
const eqMk = await equipe('mk@x.com', ['marketing']), eqSem = await equipe('sem@x.com', null);
// Casa enviada para análise (pela própria conta), pronta para habilitar.
const fichaEnviada = async (email, nome, extra = {}) => {
  const u = await novo(email, 'casa');
  await como(u, () => q(`insert into cadastros_casas (user_id, dados, status) values ($1, $2, 'em_analise')`, [u, { ...FICHA, nome, ...extra }]));
  return u;
};
const habilitar = (quem, u) => como(quem, () => q(`update cadastros_casas set status = 'habilitada' where user_id = $1`, [u]));
const vinculo = async (u) => (await um(`select vinculo_nome v from perfis where id = $1`, [u])).v;
const statusCasa = async (u) => (await um(`select status::text s from cadastros_casas where user_id = $1`, [u])).s;

// ---------- 1. nome de casa que já tem dona ----------
const roof = await fichaEnviada('roof@x.com', 'Rooftap', { rep_pix: 'pix-da-rooftap', rep_banco: 'Banco A', rep_agencia: '0001', rep_conta: '123-4' });
await habilitar(eqOp, roof);
ok(await vinculo(roof) === 'Rooftap', '1: Operações habilita casa nova e a conta fica ligada à casa');
await como(roof, async () => {
  await q(`insert into disponibilidade_semanal (casa_ref, dias) values ('Rooftap', '{5,6}')`);
  await q(`insert into equipe_casa (casa_ref, nome, funcoes) values ('Rooftap', 'Lia', '{bar}')`);
});
const imitaA = await fichaEnviada('imita1@x.com', 'Rooftap (teste)');
const e1 = await tenta(() => habilitar(eqOp, imitaA));
ok(/Já existe uma casa com esse nome na rede/.test(e1 || ''), '1: "Rooftap (teste)" (mesma chave) não é habilitada enquanto a Rooftap tem dona');
ok(await vinculo(imitaA) === null && await statusCasa(imitaA) === 'em_analise', '1: e a conta continua sem vínculo e em análise');
const imitaB = await fichaEnviada('imita2@x.com', 'ROOFTAP');
ok(/Já existe uma casa com esse nome/.test(await tenta(() => habilitar(adm, imitaB)) || ''), '1: nem a administração habilita "ROOFTAP" por cima da Rooftap');
const errCod = await (async () => { await db.exec(`set role authenticated; select set_config('tq.uid', '${eqOp}', false);`); try { await q(`update cadastros_casas set status = 'habilitada' where user_id = $1`, [imitaB]); return null; } catch (e) { return e.code; } finally { await db.exec(`reset role; select set_config('tq.uid', '', false);`); } })();
ok(errCod === '23514', '1: erro de check_violation');
await como(imitaB, async () => {
  ok((await q(`select * from equipe_casa`)).rows.length === 0 && (await q(`select * from disponibilidade_semanal`)).rows.length === 0, '1: a conta que imitou o nome não vê equipe nem disponibilidade da Rooftap');
});
// Rastro de outra conta de casa (disponibilidade marcada por ela) também bloqueia, mesmo sem vínculo ativo.
const velho = await novo('velho@x.com', 'casa');
await db.exec(`set session_replication_role = replica`);
await q(`insert into disponibilidade_casa (casa_ref, dia, situacao, atualizado_por) values ('Bar Velho', current_date + 3, 'disponivel', $1)`, [velho]);
await db.exec(`set session_replication_role = origin`);
const imitaC = await fichaEnviada('imita3@x.com', 'bar  velho');
ok(/Já existe uma casa com esse nome/.test(await tenta(() => habilitar(eqOp, imitaC)) || ''), '1: nome com disponibilidade marcada por outra conta de casa também é recusado');
// Trilha criada pela Central antes da habilitação (sem dona ainda) não bloqueia a casa nova.
await como(eqOp, () => q(`insert into trilhas (casa_ref, inicio) values ('Casa Nova', current_date)`));
const nova = await fichaEnviada('nova@x.com', 'Casa Nova');
ok(!(await tenta(() => habilitar(eqOp, nova))) && await vinculo(nova) === 'Casa Nova', '1: casa nova com trilha já criada pela Central é habilitada normalmente');
// A mesma dona habilitada de novo continua com o próprio vínculo; renomear a Ficha não muda o vínculo.
await como(eqOp, () => q(`update cadastros_casas set status = 'suspensa' where user_id = $1`, [nova]));
ok(!(await tenta(() => habilitar(eqOp, nova))) && await vinculo(nova) === 'Casa Nova', '1: a mesma conta suspensa e habilitada de novo mantém o vínculo');
await como(eqOp, () => q(`update cadastros_casas set status = 'suspensa', dados = dados || '{"nome":"Rooftap"}' where user_id = $1`, [nova]));
const eRen = await tenta(() => habilitar(eqOp, nova));
ok(!eRen && await vinculo(nova) === 'Casa Nova', '1: conta já ligada não é apontada para outra casa ao renomear a Ficha');
await como(eqOp, () => q(`update cadastros_casas set dados = dados || '{"nome":"Casa Nova"}' where user_id = $1`, [nova]));

// ---------- 2. proposta aceita por casa sem vínculo ----------
const solta = await novo('solta@x.com', 'casa');
await como(solta, () => q(`insert into cadastros_casas (user_id, dados) values ($1, '{"nome":"Rooftap"}')`, [solta]));
let pid;
await como(eqOp, async () => {
  pid = (await um(`insert into propostas_atualizacao (alvo_tipo, alvo_user, alvo_ref, campos, disponibilidade) values ('casa', $1, 'Rooftap', '{"instagram":"@solta"}', '[{"dias":[0,1,2,3,4]}]') returning id`, [solta])).id;
});
const e2 = await como(solta, () => tenta(() => q(`select responder_proposta($1, true)`, [pid])));
const dRoof = (await um(`select dias from disponibilidade_semanal where lower(casa_ref) = 'rooftap'`)).dias;
ok(JSON.stringify(dRoof) === '[5,6]', `2: casa sem vínculo não muda a disponibilidade da Rooftap (${JSON.stringify(dRoof)}${e2 ? ' · ' + e2 : ''})`);
const pAceita = await um(`select status, aplicado from propostas_atualizacao where id = $1`, [pid]);
ok(!e2 && pAceita.status !== 'pendente' && /não está ligada/.test(pAceita.aplicado?.aviso || ''), '2: a proposta é aceita sem a disponibilidade, com o aviso no registro');
ok((await um(`select dados->>'instagram' i from cadastros_casas where user_id = $1`, [solta])).i === '@solta', '2: os campos da Ficha propostos continuam aplicados');
// Casa ligada continua recebendo a disponibilidade da proposta.
await como(eqOp, async () => { pid = (await um(`insert into propostas_atualizacao (alvo_tipo, alvo_user, campos, disponibilidade) values ('casa', $1, '{}', '[{"dias":[1]}]') returning id`, [roof])).id; });
await como(roof, () => q(`select responder_proposta($1, true)`, [pid]));
ok(JSON.stringify((await um(`select dias from disponibilidade_semanal where lower(casa_ref) = 'rooftap'`)).dias) === '[1,5,6]', '2: casa ligada aceita a proposta e os dias somam aos dela');

// ---------- 3. áreas da equipe ----------
ok((await como(eqAg, () => um(`select area_ok('operacoes') a, area_ok('agenda') b`))).a === false && (await como(eqSem, () => um(`select area_ok('operacoes') a`))).a === true
  && (await como(adm, () => um(`select area_ok('marketing') a`))).a === true && (await como(roof, () => um(`select area_ok('agenda') a`))).a === false, '3: area_ok: adm sempre, equipe sem área tudo, equipe só a própria, casa nunca');
const c3 = await fichaEnviada('c3@x.com', 'Casa Três');
ok(/Operações/.test(await tenta(() => habilitar(eqAg, c3)) || ''), '3: Agenda não habilita casa');
ok(/Operações/.test(await tenta(() => como(eqMk, () => q(`update cadastros_casas set parecer = 'oi' where user_id = $1`, [c3]))) || ''), '3: Marketing não escreve parecer da casa');
ok(/Operações/.test(await tenta(() => como(eqAg, () => q(`update cadastros_casas set classificacao = 'confiavel' where user_id = $1`, [c3]))) || ''), '3: Agenda não classifica a casa');
ok(!(await tenta(() => habilitar(eqSem, c3))) && await statusCasa(c3) === 'habilitada', '3: equipe sem área marcada habilita (como antes)');
await como(eqOp, () => q(`update cadastros_casas set status = 'suspensa', parecer = 'pausa' where user_id = $1`, [c3]));
ok(await statusCasa(c3) === 'suspensa', '3: Operações suspende a casa');
await como(eqAg, () => q(`update cadastros_casas set nota_interna = 'só leitura' where user_id = $1`, [c3]));
ok((await como(eqAg, () => q(`select id from cadastros_casas`))).rows.length > 0, '3: Agenda continua vendo as casas');
const c3id = (await um(`select id from cadastros_casas where user_id = $1`, [c3])).id;
ok(/Operações/.test(await tenta(() => como(eqAg, () => q(`select definir_combinados($1, '{"repasse":"50%"}')`, [c3id]))) || ''), '3: Agenda não registra combinados');
ok(!(await tenta(() => como(eqOp, () => q(`select definir_combinados($1, '{"repasse":"50%"}')`, [c3id])))), '3: Operações registra combinados');
// Pedido de atualização da Ficha: só Operações (ou adm, ou equipe sem área) responde.
await como(roof, () => q(`select solicitar_atualizacao_ficha('{"rep_pix":"nova-chave-pedida","som":"mesa"}')`));
const sid = (await um(`select id from solicitacoes_ficha where user_id = $1 and status = 'pendente'`, [roof])).id;
ok(/Operações/.test(await tenta(() => como(eqMk, () => q(`select responder_solicitacao_ficha($1, true)`, [sid]))) || ''), '3: Marketing não responde pedido de atualização da Ficha');
// Dados de repasse: Operações edita a Ficha, mas não a conta que recebe o dinheiro.
await como(eqOp, () => q(`update cadastros_casas set dados = (dados - 'rep_agencia') || '{"rep_pix":"pix-do-golpe","rep_banco":"Banco Golpe","rep_titular":"Fulano","luz":"sim"}' where user_id = $1`, [roof]));
let dR = (await um(`select dados from cadastros_casas where user_id = $1`, [roof])).dados;
ok(dR.luz === 'sim' && dR.rep_pix === 'pix-da-rooftap' && dR.rep_banco === 'Banco A' && dR.rep_agencia === '0001' && !('rep_titular' in dR), '3: Operações muda a Ficha, mas os dados de repasse ficam como estavam');
await como(eqOp, () => q(`select responder_solicitacao_ficha($1, true)`, [sid]));
dR = (await um(`select dados from cadastros_casas where user_id = $1`, [roof])).dados;
ok(dR.rep_pix === 'nova-chave-pedida' && dR.som === 'mesa', '3: pedido da própria casa aprovado pela Operações muda a chave Pix');
await como(adm, () => q(`update cadastros_casas set dados = dados || '{"rep_pix":"corrigida-pela-adm"}' where user_id = $1`, [roof]));
ok((await um(`select dados->>'rep_pix' p from cadastros_casas where user_id = $1`, [roof])).p === 'corrigida-pela-adm', '3: a administração corrige os dados de repasse');
// Inscrição da artista: decisão e parecer só pela Agenda.
const art = await novo('art@x.com', 'artista');
await como(art, () => q(`insert into inscricoes_artistas (user_id, dados, status) values ($1, '{"nome_artistico":"Ana"}', 'em_curadoria')`, [art]));
ok(/Agenda/.test(await tenta(() => como(eqOp, () => q(`update inscricoes_artistas set status = 'aprovada' where user_id = $1`, [art]))) || ''), '3: Operações não aprova artista');
ok(/Agenda/.test(await tenta(() => como(eqMk, () => q(`update inscricoes_artistas set parecer = 'oi' where user_id = $1`, [art]))) || ''), '3: Marketing não escreve parecer da artista');
await como(eqAg, () => q(`update inscricoes_artistas set status = 'aprovada', parecer = 'bem-vinda' where user_id = $1`, [art]));
ok((await um(`select status::text s from inscricoes_artistas where user_id = $1`, [art])).s === 'aprovada', '3: Agenda aprova artista');
// Datas do portal: só Agenda cria e muda.
const roofId = (await um(`select id from cadastros_casas where user_id = $1`, [roof])).id;
const novaData = (quem) => como(quem, () => q(`insert into datas_portal (dia, produto, casa_id, casa_nome, artistas) values (current_date + 10, 'Descubra', $1, 'Rooftap', $2) returning id`, [roofId, JSON.stringify([{ nome: 'Ana', user_id: art }])]));
ok(!!(await tenta(() => novaData(eqOp))), '3: Operações não cria data');
ok(!!(await tenta(() => novaData(eqMk))), '3: Marketing não cria data');
const dpId = (await novaData(eqAg)).rows[0].id;
ok(!!dpId && !(await tenta(() => novaData(eqSem))), '3: Agenda e equipe sem área criam data');
await como(eqMk, () => tenta(() => q(`update datas_portal set abertura = '22:00' where id = $1`, [dpId])));
ok((await um(`select abertura::text a from datas_portal where id = $1`, [dpId])).a === '19:00:00', '3: Marketing não muda a data');
// Contratos: de casa → Operações; de artista → Agenda.
const contrato = (quem, uid) => como(quem, () => q(`insert into contratos (user_id, evento_id, titulo, texto) values ($1, $2, 'Contrato', $3) returning id`, [uid, 'p:' + dpId, 'x'.repeat(60)]));
ok(!!(await tenta(() => contrato(eqOp, art))), '3: Operações não gera contrato de artista');
ok(!!(await tenta(() => contrato(eqAg, roof))), '3: Agenda não gera contrato de casa');
const ctArt = (await contrato(eqAg, art)).rows[0].id, ctCasa = (await contrato(eqOp, roof)).rows[0].id;
ok(!!ctArt && !!ctCasa && !(await tenta(() => contrato(eqSem, art))), '3: Agenda gera o da artista, Operações o da casa, equipe sem área os dois');
await como(eqOp, () => tenta(() => q(`update contratos set status = 'cancelado' where id = $1`, [ctArt])));
await como(eqAg, () => tenta(() => q(`update contratos set status = 'cancelado' where id = $1`, [ctCasa])));
ok((await um(`select count(*)::int n from contratos where id in ($1, $2) and status = 'enviado'`, [ctArt, ctCasa])).n === 2, '3: cada área só cancela os contratos dela');
await como(eqOp, () => q(`update contratos set status = 'cancelado' where id = $1`, [ctCasa]));
ok((await um(`select status from contratos where id = $1`, [ctCasa])).status === 'cancelado', '3: Operações cancela contrato de casa');

// ---------- 4. links com caracteres de controle ----------
const artL = await novo('artl@x.com', 'artista');
await como(artL, () => q(`insert into inscricoes_artistas (user_id, dados) values ($1, '{}')`, [artL]));
const salvaLink = (v) => como(artL, () => tenta(() => q(`update inscricoes_artistas set dados = jsonb_build_object('site', $1::text) where user_id = $2`, [v, artL])));
for (const [v, nome] of [['java\tscript:alert(1)', 'tab no meio'], ['\u0001javascript:alert(1)', 'controle no começo'], ['java\nscript:alert(1)', 'quebra de linha no meio'],
  ['  JaVaScRiPt:alert(1)', 'maiúsculas e espaços'], ['vbscript:x', 'vbscript'], ['data:text/html,<b>', 'data:'], ['https://ok.com/\u0007', 'controle no fim']]) {
  ok(/Link inválido/.test(await salvaLink(v) || ''), `4: recusa ${nome} (${JSON.stringify(v)})`);
}
for (const v of ['https://rooftap.com.br', 'http://x.com', 'mailto:casa@x.com', 'tel:+5511999990000', 'Sexta: 20h às 2h', 'Rua A, 1\nPerto da praça', '20:00', 'Obs:texto', 'Sexta:20h']) {
  ok(!(await salvaLink(v)), `4: aceita ${JSON.stringify(v)}`);
}

// ---------- 5. IP da assinatura ----------
const artC = await novo('artc@x.com', 'artista');
const ctId = (await contrato(eqAg, artC)).rows[0].id;
const cadeia = '1.2.3.4, 10.0.0.9, 177.10.20.30';
await como(artC, async () => {
  await q(`select contrato_li_ate_o_fim($1)`, [ctId]);
  const h = (await um(`select encode(sha256(convert_to(contrato_texto(texto, campos, dados), 'UTF8')), 'hex') h from contratos where id = $1`, [ctId])).h;
  await q(`select set_config('request.headers', $1, false)`, [JSON.stringify({ 'x-forwarded-for': cadeia, 'user-agent': 'teste' })]);
  await q(`select assinar_contrato($1, 'Ana Maria Souza', $2)`, [ctId, h]);
});
const ass = await um(`select ip, navegador, status from contratos where id = $1`, [ctId]);
ok(ass.status === 'assinado' && ass.ip === cadeia && ass.navegador === 'teste', `5: guarda a cadeia inteira do X-Forwarded-For (${ass.ip})`);

// ---------- 6. funcionário da casa vê as datas da casa ----------
const func = await novo('func@x.com', 'casa');
await q(`update perfis set vinculo_nome = 'Rooftap', funcoes = '{bar}' where id = $1`, [func]);
const funcOutra = await novo('func2@x.com', 'casa');
await q(`update perfis set vinculo_nome = 'Casa Nova', funcoes = '{bar}' where id = $1`, [funcOutra]);
await como(eqAg, () => q(`insert into datas_portal (dia, produto, casa_id, casa_nome, artistas) values (current_date + 12, 'Descubra', null, 'Rooftap', '[{"nome":"Bia"}]')`));
const nRoof = (await um(`select count(*)::int n from datas_portal where casa_nome = 'Rooftap'`)).n;
await como(func, async () => { ok(nRoof === 3 && (await q(`select id from datas_portal`)).rows.length === nRoof, '6: funcionário da Rooftap vê as datas da Rooftap (pela casa e pelo nome)'); });
await como(funcOutra, async () => { ok((await q(`select id from datas_portal`)).rows.length === 0, '6: funcionário de outra casa não vê'); });
await como(roof, async () => { ok((await q(`select id from datas_portal`)).rows.length === nRoof, '6: a dona continua vendo'); });
await como(imitaA, async () => { ok((await q(`select id from datas_portal`)).rows.length === 0, '6: casa sem vínculo não vê'); });

// ---------- extra: encerrar casa sem vínculo não desliga funcionários de outra casa com o mesmo nome ----------
await como(eqOp, () => q(`update cadastros_casas set status = 'encerrada' where user_id = $1`, [solta]));
ok(await vinculo(func) === 'Rooftap', 'encerrar a Ficha "Rooftap" de uma conta sem vínculo não desliga a equipe da Rooftap');
