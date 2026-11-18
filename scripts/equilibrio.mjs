// Dados de teste equilibrados (pedido da Marina, 18/11/2026): poucos casos, mas 2 em cada status de cada fluxo,
// para a Isa (curadoria, datas e contratos de artista), o Gui (casas, equipe e contrato de parceria) e o Bruno (campanhas).
// Roda pelo workflow "vitrine" (MODO=equilibrio) e pelo teste tests/equilibrio.test.mjs (PGlite, sem auth nem storage).
//
// 1. Apaga os dados de teste antigos: contas @tranquilo.teste (vitrine e esta leva), teste.* e curadoria.* @teste-e2e.invalid
//    e tudo o que é delas (Ficha, inscrição, contratos, datas, disponibilidade, equipe, campanhas de teste, arquivos).
//    Nunca apaga: MANTER (caso pronto e a Central de teste), contas da equipe ou da administração, nem contas reais.
// 2. Cria casas, artistas, datas, contratos, campanhas e passos (e-mails <papel>.<status>N@tranquilo.teste, nomes "(teste)").
// 3. Confere a coerência e imprime o resumo por status. Nada vai ao Notion.
//
// ctx: { sql(q) → linhas do último comando, ok(cond, msg), log(msg), criarConta(email, nome, tipo) → id,
//        subirArquivo(caminho, bytes), apagarArquivos(caminhos), HASH, hoje? (AAAA-MM-DD, padrão: hoje em São Paulo) }
import { readFile } from 'node:fs/promises';

export const DOM = 'tranquilo.teste';
export const MANTER = ['central.caso-teste@teste-e2e.invalid', 'casa.teste@tranquilo.com.br', 'artista.teste@tranquilo.com.br'];
// Contas de teste que esta leva apaga (u = auth.users).
// E-mail base da Marina (EMAIL_BASE_B64, opcional): as contas viram <base>+<papel>-<etapa>@<domínio>, que chegam na caixa dela.
const BASE = (() => { try { const e = Buffer.from(process.env.EMAIL_BASE_B64 || '', 'base64').toString('utf8').trim().toLowerCase(); return /^[^@\s+]+@[^@\s]+$/.test(e) ? e.split('@') : null; } catch { return null; } })();
if (BASE) console.log(`::add-mask::${BASE[0]}`);
export const emailDe = (tipo, user) => BASE ? `${BASE[0]}+${tipo}-${user}@${BASE[1]}` : `${tipo}.${user}@${DOM}`;
const DE_BASE = BASE ? ` or (u.email like '${BASE[0]}+%@${BASE[1]}' and u.email !~ '\\+(maritaka|analu|ratazana)@')` : '';
export const E_TESTE = `(u.email like '%@${DOM}' or u.email like 'teste.%@teste-e2e.invalid' or u.email like 'curadoria.%@teste-e2e.invalid'${DE_BASE})`;

const lit = (s) => (s == null ? 'null' : `'${String(s).replace(/'/g, "''")}'`);
const js = (o) => `${lit(JSON.stringify(o))}::jsonb`;
const soma = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const wd = (iso) => new Date(iso + 'T12:00:00Z').getUTCDay();
const k = (x) => String(x || '').trim().toLowerCase();
const c1 = (x) => k(String(x || '').split('/')[0]);
export const hojeSP = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
/** k-ésimo dia da semana `dia` (0 = dom) depois de hoje (k = 0: o primeiro). */
const proximo = (hoje, dia, n) => { let d = soma(hoje, 1); while (wd(d) !== dia) d = soma(d, 1); return soma(d, 7 * n); };

// ---------- quem é quem ----------
const CID = {
  SP: { cidade: 'São Paulo', uf: 'SP', ddd: '11', rua: 'Rua Augusta', bairro: 'Consolação', cep: '01304-001' },
  CPS: { cidade: 'Campinas', uf: 'SP', ddd: '19', rua: 'Rua Barão de Jaguara', bairro: 'Centro', cep: '13015-001' },
  SAN: { cidade: 'Santos', uf: 'SP', ddd: '13', rua: 'Avenida Ana Costa', bairro: 'Gonzaga', cep: '11060-001' },
};
// [usuário, nome da casa, dono, cidade, etapa]. Etapa: status da Ficha, ou o estado do contrato de parceria (casa habilitada,
// equipe completa e qui/sex/sáb): dados (aguardando dados) · assinar (preenchido, falta assinar) · recebido (arquivo assinado
// esperando conferir) · devolvido (pedido de novo) · conferido (pronta). "equipe" = habilitada com equipe incompleta, sem contrato.
export const CASAS = [
  ['rascunho1', 'Casa Jabuticaba (teste)', 'Rita Campos', 'SP', 'rascunho'],
  ['rascunho2', 'Bar Pitanga (teste)', 'Paulo Neri', 'CPS', 'rascunho'],
  ['analise1', 'Casa Ipê Roxo (teste)', 'Marcos Lemos', 'SP', 'em_analise'],
  ['analise2', 'Varanda Caiçara (teste)', 'Lúcia Mar', 'SAN', 'em_analise'],
  ['ajustes1', 'Sobrado Cambuci (teste)', 'Tânia Reis', 'SP', 'ajustes'],
  ['ajustes2', 'Porão Bela Vista (teste)', 'Hugo Sales', 'SP', 'ajustes'],
  ['equipe1', 'Casa Maracujá (teste)', 'Joana Prado', 'SP', 'equipe'],
  ['equipe2', 'Galpão Taquaral (teste)', 'Davi Couto', 'CPS', 'equipe'],
  ['dados1', 'Armazém Cambuí (teste)', 'Sílvia Torres', 'CPS', 'dados'],
  ['dados2', 'Casa Gonzaga (teste)', 'Renato Faria', 'SAN', 'dados'],
  ['assinar1', 'Quintal Barão (teste)', 'Celso Dias', 'CPS', 'assinar'],
  ['assinar2', 'Casa Lua Cheia (teste)', 'Carla Duarte', 'SP', 'assinar'],
  ['conferir1', 'Sala Pompeia (teste)', 'Beto Arantes', 'SP', 'recebido'],
  ['conferir2', 'Terraço Liberdade (teste)', 'Mina Okada', 'SP', 'recebido'],
  ['devolvido1', 'Bar do Bixiga (teste)', 'Nando Pires', 'SP', 'devolvido'],
  ['devolvido2', 'Casa Ponta da Praia (teste)', 'Vera Lopes', 'SAN', 'devolvido'],
  ['pronta1', 'Casa Vila Madá (teste)', 'Ivo Mattos', 'SP', 'conferido'],
  ['pronta2', 'Casa Estação Sete (teste)', 'Olga Pena', 'CPS', 'conferido'],
];
// [usuário, nome artístico, etapa, formato_interesse, cidades de interesse (a primeira é a base), formação].
// Etapa: status da inscrição, "livre" (aprovada sem data), "sem" (aprovada, no line-up, contrato a preparar) ou o estado do
// contrato da data (dados, assinar, recebido, devolvido, conferido), como nas casas.
export const ARTISTAS = [
  ['rascunho1', 'Lina Rocha (teste)', 'rascunho', 'descubra', ['SP'], 'solo'],
  ['rascunho2', 'Duo Vagalume (teste)', 'rascunho', 'nao_sei', ['CPS'], 'duo'],
  ['curadoria1', 'Caio Bento (teste)', 'em_curadoria', 'apresenta', ['SP', 'SAN'], 'solo'],
  ['curadoria2', 'Trio Ventania (teste)', 'em_curadoria', 'descubra', ['CPS', 'SP'], 'trio'],
  ['ajustes1', 'Mel Ferraz (teste)', 'ajustes', 'turne', ['SP', 'CPS', 'SAN'], 'solo'],
  ['ajustes2', 'Banda Quintal (teste)', 'ajustes', 'descubra', ['SP'], 'banda'],
  ['reprovada1', 'Zé Trovão (teste)', 'reprovada', 'apresenta', ['SAN'], 'solo'],
  ['reprovada2', 'Coletivo Ruído (teste)', 'reprovada', 'nao_sei', ['SP'], 'banda'],
  ['livre1', 'Clara Lis (teste)', 'livre', 'descubra', ['SP', 'CPS'], 'solo'],
  ['livre2', 'Tom Aurélio (teste)', 'livre', 'apresenta', ['SP', 'SAN'], 'duo'],
  ['conferido1', 'Nina Brisa (teste)', 'conferido', 'descubra', ['SP'], 'solo'],
  ['conferido2', 'Rui Campos (teste)', 'conferido', 'nao_sei', ['SP', 'CPS'], 'duo'],
  ['conferir1', 'Bia Serra (teste)', 'recebido', 'descubra', ['SP'], 'solo'],
  ['conferir2', 'Téo Lima (teste)', 'recebido', 'descubra', ['SP', 'SAN'], 'trio'],
  ['devolvido1', 'Duo Maré Alta (teste)', 'devolvido', 'nao_sei', ['SP'], 'duo'],
  ['devolvido2', 'Iara Sol (teste)', 'devolvido', 'apresenta', ['SP', 'SAN'], 'solo'],
  ['assinar1', 'Juca Vento (teste)', 'assinar', 'descubra', ['SP', 'CPS'], 'solo'],
  ['assinar2', 'Luiza Prata (teste)', 'assinar', 'apresenta', ['SP'], 'duo'],
  ['dados1', 'Dani Areia (teste)', 'dados', 'nao_sei', ['SAN', 'SP'], 'solo'],
  ['dados2', 'Gil Maresia (teste)', 'dados', 'turne', ['SAN', 'CPS'], 'trio'],
  ['semcontrato1', 'Trio Cambuí (teste)', 'sem', 'descubra', ['CPS', 'SP'], 'trio'],
  ['semcontrato2', 'Vic Andrade (teste)', 'sem', 'nao_sei', ['CPS', 'SP'], 'solo'],
  ['turne1', 'Leo Estrada (teste)', 'sem', 'turne', ['SP', 'CPS', 'SAN'], 'duo'],
];
const APROVADA = new Set(['livre', 'sem', 'dados', 'assinar', 'recebido', 'devolvido', 'conferido']);
const CONTRATO = new Set(['dados', 'assinar', 'recebido', 'devolvido', 'conferido']);
export const ROT_CT = { dados: 'aguardando dados', assinar: 'preenchido, falta assinar', recebido: 'assinado recebido, conferir', devolvido: 'devolvido (pedido de novo)', conferido: 'conferido (pronta)' };
// Dias da semana do artista em cada cidade (0 = dom): São Paulo sex e sáb; Campinas e Santos sáb.
const SEM_CID = { SP: [5, 6], CPS: [6], SAN: [6] };

/** As datas, relativas a hoje: F(n) = n-ésima sexta depois de hoje, S(n) = o sábado seguinte. Line-up na ordem da noite
 *  (no Apresenta e na Turnê, a abertura primeiro e a atração por último). Uma campanha por casa com data. */
export function plano(hoje) {
  const F = (n) => proximo(hoje, 5, n), S = (n) => soma(F(n), 1);
  return [
    { chave: 'descubra1', produto: 'Descubra', casa: 'conferir1', dia: F(0), artistas: ['conferido1', 'conferido2', 'conferir1'], campanha: 'concluída' },
    { chave: 'apresenta2', produto: 'Apresenta', casa: 'devolvido2', dia: S(0), artistas: ['dados1', 'dados2'], campanha: 'concluída' },
    { chave: 'descubra2', produto: 'Descubra', casa: 'conferir2', dia: F(1), artistas: ['conferir2', 'devolvido1', 'assinar1'], campanha: 'em dia' },
    { chave: 'apresenta1', produto: 'Apresenta', casa: 'devolvido1', dia: S(1), artistas: ['assinar2', 'devolvido2'], campanha: 'em dia' },
    { chave: 'noite', produto: 'Noite Tranquilo', casa: 'assinar1', dia: S(1), artistas: ['semcontrato1', 'semcontrato2', { nome: 'Coral da Vila (teste, sem conta)' }], campanha: 'atrasada' },
    { chave: 'turne-sp', produto: 'Turnê', casa: 'assinar2', dia: F(2), artistas: ['turne1'], campanha: 'atrasada' },
    { chave: 'turne-campinas', produto: 'Turnê', casa: 'dados1', dia: S(2), artistas: ['turne1'], campanha: 'começando' },
    { chave: 'turne-santos', produto: 'Turnê', casa: 'dados2', dia: S(3), artistas: ['turne1'], campanha: 'começando' },
    { chave: 'incompleta1', produto: 'Descubra', casa: 'conferir2', dia: F(3), artistas: ['semcontrato1'], incompleta: true },
    { chave: 'incompleta2', produto: 'Noite Tranquilo', casa: 'devolvido1', dia: S(2), artistas: ['semcontrato2', { nome: 'Ana Lume (teste, sem conta)' }], incompleta: true },
  ];
}

// ---------- documentos fictícios válidos ----------
const dv = (d, w) => { const s = d.reduce((a, x, i) => a + x * w[i], 0) % 11; return s < 2 ? 0 : 11 - s; };
const cpf = (n) => { const d = String(300000000 + n * 7919).slice(0, 9).split('').map(Number); d.push(dv(d, [10, 9, 8, 7, 6, 5, 4, 3, 2])); d.push(dv(d, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2])); const t = d.join(''); return `${t.slice(0, 3)}.${t.slice(3, 6)}.${t.slice(6, 9)}-${t.slice(9)}`; };
const cnpj = (n) => { const d = (String(30000000 + n * 104729).slice(0, 8) + '0001').split('').map(Number); d.push(dv(d, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])); d.push(dv(d, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])); const t = d.join(''); return `${t.slice(0, 2)}.${t.slice(2, 5)}.${t.slice(5, 8)}/${t.slice(8, 12)}-${t.slice(12)}`; };
const tel = (ddd, i, base) => `(${ddd}) 9${String(base + i).padStart(4, '0')}-${String(1000 + i * 37).slice(-4)}`;

export function ficha([, nome, dono, cid], i, completa = true) {
  const C = CID[cid], sem = nome.replace(' (teste)', '');
  const base = { nome, cidade_uf: `${C.cidade}/${C.uf}`, dono_nome: `${dono} (teste)`, whatsapp: tel(C.ddd, i, 8100) };
  if (!completa) return { ...base, razao_social: `${sem} Ltda.`, endereco: `${C.rua}, ${300 + i * 10}, ${C.bairro}, ${C.cidade}/${C.uf}` };
  return { ...base,
    razao_social: `${sem} Bar e Música Ltda.`, cnpj: cnpj(i + 1), emite_nf: 'sim', endereco: `${C.rua}, ${1200 + i * 40}, ${C.bairro}, ${C.cidade}/${C.uf}, ${C.cep}`,
    complemento: 'Portão azul', instagram: `@${sem.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '')}.teste`, telefone: `(${C.ddd}) 3333-${String(4000 + i).slice(-4)}`,
    funcionamento: 'Quarta a sábado, 18h à 1h', como_chegar: 'Transporte público a 5 minutos. Estacionamento na rua de trás. Rua iluminada à noite.',
    dono_cpf: cpf(i + 1), dono_rg: `12.345.${String(600 + i)}-9`, dono_nascimento: '15/03/1985', dono_endereco: `Rua das Acácias, ${100 + i}, ${C.cidade}/${C.uf}`,
    rep_titular: `${sem} Bar e Música Ltda.`, rep_documento: cnpj(i + 1), rep_banco: 'Banco Exemplo (000)', rep_tipo: 'corrente', rep_agencia: '1234', rep_conta: `5678${i}-0`, rep_pix: cnpj(i + 1),
    capacidade_sentado: String(60 + i * 5), capacidade: String(100 + i * 8), conforto: '60 almofadas, 4 tapetes, 20 banquetas', palco: '4 x 3 m, 30 cm de altura', camarim: 'tem',
    acessibilidade: ['rampa', 'banheiro'], menores: 'responsavel', som: '2 caixas ativas + sub', mesa: 'Mesa de 16 canais', microfones: 'sim', pedestais: 'sim',
    ligar_palco: '4 cabos XLR, 2 direct box, 2 retornos, 2 banquetas.', luz: '4 PAR LED; plateia em penumbra', bar_cozinha: 'Drinks, cerveja e petiscos.',
    ticket_medio: 'R$ 60', caixa_sistema: 'Maquininha com relatório por noite', exclusividade_bebida: 'Não tem', ticketeira: 'Não usa',
    dias_semana: ['quinta', 'sexta', 'sabado'], duvidas_guia: 'Cadastro fictício para teste.' };
}
export function inscricao([, nome, , formato, cids, formacao], i, completa = true) {
  const B = CID[cids[0]], integ = { solo: 1, duo: 2, trio: 3, banda: 5 }[formacao];
  const base = { nome_artistico: nome, cidade_base: B.cidade, estado: B.uf, generos: ['MPB, folk', 'Samba, soul', 'Indie, rock', 'MPB, jazz', 'Pop, R&B'][i % 5] + '.', formato_interesse: formato, whatsapp: tel(B.ddd, i, 7100) };
  if (!completa) return { ...base, release: 'Projeto de música autoral (teste).' };
  return { ...base,
    release: `${nome.replace(' (teste)', '')} faz canções autorais com arranjos delicados, falando de cidade, afeto e saudade. Já tocou em bares e saraus de ${B.cidade}, tem um EP lançado e prepara o primeiro disco. Cadastro fictício para teste do portal.`,
    spotify: 'https://open.spotify.com/artist/teste123', instagram: `@artista${i + 1}.teste`, ouvintes_mensais: String(1500 + i * 700), seguidores_instagram: String(3000 + i * 500),
    formacao, integrantes: String(integ), rider_tipo: 'circulavel', tecnico_proprio: 'nao', necessidades: '2 microfones de voz, 1 direct box, 1 banqueta.',
    cidades_interesse: cids.map((c) => CID[c].cidade), equipe_viagem: String(integ + 1), aceita_bonus: 'true', cache_minimo: String(500 + i * 20),
    contato_producao: 'Produção (teste)', aceite: 'true' };
}
const pessoa = (nome, i, cidade) => ({ nome_completo: nome.replace(' (teste)', ' da Silva (teste)'), cpf: cpf(100 + i), rg: `98.765.${String(400 + i)}-1`, nacionalidade: 'brasileira',
  profissao: 'musicista', endereco: `Rua dos Ipês, ${50 + i}, ${cidade}`, chave_pix: cpf(100 + i), telefone: `(11) 91234-${String(5600 + i)}`, estado_civil: 'solteira', quantidade: '2' });
const COMB = { bilheteria: { casa: 30, artista: 50, tranquilo: 20 }, aeb: { casa: 88, tranquilo: 12 }, bonificacao: { tem: 'nao' } };
const EQ_COMPLETA = [['lider', false], ['anfitriao', false], ['social_media', false], ['som', false], ['porta', false], ['anfitriao', true]];
const EQ_INCOMPLETA = [['lider', false], ['anfitriao', false], ['social_media', false]];
const PESSOAS_EQ = ['Pedro Alves', 'Júlia Reis', 'Rafa Nunes', 'Léo Som', 'Ana Porta', 'Bia Reserva'];

// ---------- 1. apagar ----------
async function apagar(ctx) {
  const { sql, ok } = ctx;
  await sql(`drop table if exists eq_ids;
create unlogged table eq_ids as select u.id from auth.users u left join perfis p on p.id = u.id
  where ${E_TESTE} and lower(u.email) not in (${MANTER.map(lit).join(', ')}) and coalesce(p.tipo::text, '') not in ('equipe', 'adm');
drop table if exists eq_casas;
create unlogged table eq_casas as select distinct lower(x) ref from (
  select dados->>'nome' x from cadastros_casas where user_id in (select id from eq_ids)
  union select vinculo_nome from perfis where id in (select id from eq_ids) and tipo = 'casa') t
  where x is not null and x ilike '%teste%';
select count(*)::int n from eq_ids`);
  const temStorage = (await sql(`select to_regclass('storage.objects') is not null t`))[0]?.t;
  if (temStorage && ctx.apagarArquivos) {
    const arqs = await sql(`select name from storage.objects where bucket_id = 'materiais' and split_part(name, '/', 1) in (select id::text from eq_ids)`);
    if (arqs.length) await ctx.apagarArquivos(arqs.map((x) => x.name));
    ok(true, `${arqs.length} arquivos de teste apagados do armazenamento`);
  }
  const r = await sql(`do $$ begin
  alter table contratos disable trigger trg_contrato_apagar;
  delete from contratos where user_id in (select id from eq_ids);
  alter table contratos enable trigger trg_contrato_apagar;
end $$;
delete from datas_portal where casa_id in (select id from cadastros_casas where user_id in (select id from eq_ids))
  or lower(casa_nome) in (select ref from eq_casas) or criado_por in (select id from eq_ids);
-- Data de casa que fica (real ou o caso pronto) com artista de teste no line-up: o nome fica, a conta sai.
update datas_portal d set artistas = (select coalesce(jsonb_agg(case when x->>'user_id' in (select id::text from eq_ids) then x - 'user_id' else x end order by n), '[]'::jsonb)
  from jsonb_array_elements(d.artistas) with ordinality t(x, n))
  where exists (select 1 from jsonb_array_elements(d.artistas) x where x->>'user_id' in (select id::text from eq_ids));
delete from campanhas where slug like 'teste-%' and lower(casa_ref) in (select ref from eq_casas);
delete from disponibilidade_casa where lower(casa_ref) in (select ref from eq_casas);
delete from disponibilidade_semanal where lower(casa_ref) in (select ref from eq_casas) or user_id in (select id from eq_ids);
delete from disponibilidade_artista where user_id in (select id from eq_ids);
delete from equipe_casa where lower(casa_ref) in (select ref from eq_casas);
delete from trilhas where lower(casa_ref) in (select ref from eq_casas);
delete from checklist where user_id in (select id from eq_ids);
delete from solicitacoes_ficha where casa_id in (select id from cadastros_casas where user_id in (select id from eq_ids));
delete from inscricoes_artistas where user_id in (select id from eq_ids);
delete from cadastros_casas where user_id in (select id from eq_ids);
delete from convites where email in (select lower(email) from auth.users where id in (select id from eq_ids));
do $$ declare fk record; begin
  for fk in select c.conrelid::regclass tabela, a.attname coluna, a.attnotnull obrig
            from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
            where c.contype = 'f' and c.confrelid in ('public.perfis'::regclass, 'auth.users'::regclass)
              and c.confdeltype in ('a', 'r') and array_length(c.conkey, 1) = 1 loop
    if fk.obrig then execute format('delete from %s where %I in (select id from eq_ids)', fk.tabela, fk.coluna);
    else execute format('update %s set %I = null where %I in (select id from eq_ids)', fk.tabela, fk.coluna, fk.coluna); end if;
  end loop;
end $$;
delete from auth.users where id in (select id from eq_ids);
drop table if exists eq_ids; drop table if exists eq_casas;
select count(*)::int n from auth.users u left join perfis p on p.id = u.id where ${E_TESTE} and lower(u.email) not in (${MANTER.map(lit).join(', ')}) and coalesce(p.tipo::text, '') not in ('equipe', 'adm')`);
  ok(r[0]?.n === 0, 'dados de teste antigos apagados (@tranquilo.teste, teste.* e curadoria.* @teste-e2e.invalid)');
}

// ---------- 2. criar ----------
export async function equilibrio(ctx) {
  const { sql, ok } = ctx, hoje = ctx.hoje || hojeSP();
  const contar = async () => (await sql(`select (select count(*)::int from auth.users u where not ${E_TESTE}) fora,
    (select count(*)::int from auth.users where lower(email) in (${MANTER.map(lit).join(', ')})) manter,
    (select count(*)::int from datas_portal d where not exists (select 1 from cadastros_casas c join auth.users u on u.id = c.user_id where c.id = d.casa_id and ${E_TESTE})
       and lower(d.casa_nome) not in (select lower(c.dados->>'nome') from cadastros_casas c join auth.users u on u.id = c.user_id where ${E_TESTE} and c.dados->>'nome' is not null)) datas_fora`))[0];
  const antes = await contar();
  await apagar(ctx);
  const meio = await contar();
  ok(meio.fora === antes.fora && meio.manter === antes.manter && meio.datas_fora === antes.datas_fora,
    `contas reais, equipe, caso pronto e Central intactos (${meio.fora} contas fora dos testes, ${meio.manter} de ${MANTER.length} protegidas existem, ${meio.datas_fora} datas reais)`);

  const central = (await sql(`select p.id from perfis p join auth.users u on u.id = p.id where lower(u.email) = ${lit(MANTER[0])} and p.tipo in ('equipe', 'adm')`))[0]?.id
    || (await sql(`select id from perfis where tipo = 'adm' order by criado_em limit 1`))[0]?.id;
  if (!central) { ok(false, 'sem conta da Central de teste nem de administração para aprovar e conferir'); return; }
  const como = (id) => `select set_config('request.jwt.claims', ${lit(JSON.stringify({ sub: id, role: 'authenticated' }))}, true), set_config('request.jwt.claim.sub', ${lit(id)}, true);`;
  const imp = como(central);

  const TQ = new Function((await readFile(new URL('../src/contrato.js', import.meta.url), 'utf8')) + ';return TQContrato;')();
  await import('../src/regras.js'); const R = globalThis.TQRegras || globalThis.window?.TQRegras;
  const datas = plano(hoje);

  // Contas: <papel>.<usuário>@tranquilo.teste, com a senha comum (SENHA_HASH) e o tutorial já visto.
  const C = Object.fromEntries(CASAS.map((x, i) => [x[0], { linha: x, i, user: x[0], nome: x[1], dono: x[2], cid: x[3], etapa: x[4], email: emailDe('casa', x[0]) }]));
  const A = Object.fromEntries(ARTISTAS.map((x, i) => [x[0], { linha: x, i, user: x[0], nome: x[1], etapa: x[2], formato: x[3], cids: x[4], email: emailDe('artista', x[0]) }]));
  for (const c of Object.values(C)) c.id = await ctx.criarConta(c.email, `${c.dono} (teste)`, 'casa');
  for (const a of Object.values(A)) a.id = await ctx.criarConta(a.email, a.nome, 'artista');
  const todos = [...Object.values(C), ...Object.values(A)], ids = todos.map((x) => lit(x.id)).join(', ');
  await sql(`update auth.users set encrypted_password = ${lit(ctx.HASH)}, email_confirmed_at = coalesce(email_confirmed_at, now()) where id in (${ids});
update perfis set senha_definida = true, tutorial_visto_em = now() where id in (${ids});
${Object.values(C).map((c) => `update perfis set tipo = 'casa', nome = ${lit(c.dono + ' (teste)')} where id = ${lit(c.id)};`).join('\n')}
${Object.values(A).map((a) => `update perfis set tipo = 'artista', nome = ${lit(a.nome)}, vinculo_nome = ${lit(a.nome)} where id = ${lit(a.id)};`).join('\n')}`);
  ok(true, `${todos.length} contas criadas (${CASAS.length} casas e ${ARTISTAS.length} artistas), com a senha comum`);

  // Casas: Ficha por etapa; habilitadas com combinados, equipe, qui/sex/sáb e um dia bloqueado.
  const habil = Object.values(C).filter((c) => !['rascunho', 'em_analise', 'ajustes'].includes(c.etapa));
  await sql(`insert into cadastros_casas (user_id, dados, status, enviado_em) values ${Object.values(C).map((c) => `(${lit(c.id)}, ${js(ficha(c.linha, c.i, c.etapa !== 'rascunho'))}, ${c.etapa === 'rascunho' ? "'rascunho', null" : `'em_analise', now() - interval '${3 + c.i} days'`})`).join(',\n')};`);
  await sql(`${imp}
${Object.values(C).filter((c) => c.etapa === 'ajustes').map((c, j) => `update cadastros_casas set status = 'ajustes', classificacao = 'correcao', parecer = ${lit(['Faltou a foto do palco e a medida do camarim. Corrija e envie de novo, por favor.', 'O CNPJ não bate com a razão social. Confira e envie de novo.'][j])} where user_id = ${lit(c.id)};`).join('\n')}
update cadastros_casas set status = 'habilitada', classificacao = 'confiavel', parecer = 'Ficha completa. Casa habilitada (teste).', combinados = ${js(COMB)} where user_id in (${habil.map((c) => lit(c.id)).join(', ')});`);
  await sql(habil.map((c) => `update perfis set vinculo_nome = ${lit(c.nome)} where id = ${lit(c.id)};`).join('\n'));
  await sql(`insert into equipe_casa (casa_ref, nome, whatsapp, funcoes, reserva, criado_por) values ${habil.flatMap((c) => (c.etapa === 'equipe' ? EQ_INCOMPLETA : EQ_COMPLETA)
    .map(([f, r], j) => `(${lit(c.nome)}, ${lit(`${PESSOAS_EQ[j]} (teste)`)}, ${lit(tel(CID[c.cid].ddd, c.i * 10 + j, 6100))}, '{${f}}', ${r}, ${lit(c.id)})`)).join(',\n')};
insert into disponibilidade_semanal (casa_ref, dias, atualizado_por) values ${habil.map((c) => `(${lit(c.nome)}, '{4,5,6}', ${lit(c.id)})`).join(', ')};
insert into disponibilidade_casa (casa_ref, dia, situacao, nota, atualizado_por) values ${habil.map((c) => `(${lit(c.nome)}, ${lit(soma(proximo(hoje, 5, 4), 1))}, 'indisponivel', 'Evento privado (teste)', ${lit(c.id)})`).join(', ')},
  ${habil.filter((c) => c.etapa === 'conferido').map((c) => `(${lit(c.nome)}, ${lit(soma(proximo(hoje, 5, 1), -2))}, 'disponivel', 'Abre nesta quarta (teste)', ${lit(c.id)})`).join(', ')};`);
  ok(true, `casas: ${habil.length} habilitadas (2 com equipe incompleta), equipe e qui/sex/sáb; 2 em rascunho, 2 em análise, 2 em ajustes`);

  // Artistas: inscrição por etapa; aprovadas com dias por cidade (sex/sáb em SP, sáb em Campinas e Santos) e por data.
  const arts = Object.values(A), aprov = arts.filter((a) => APROVADA.has(a.etapa));
  await sql(`insert into inscricoes_artistas (user_id, dados, status) values ${arts.map((a) => `(${lit(a.id)}, ${js(inscricao(a.linha, a.i, a.etapa !== 'rascunho'))}, ${a.etapa === 'rascunho' ? "'rascunho'" : "'em_curadoria'"})`).join(',\n')};`);
  const PARECER = { ajustes: ['Gostamos do som! Falta o link de um vídeo ao vivo. Complete e envie de novo.', 'Mande o rider atualizado e a formação que vai ao palco.'],
    reprovada: ['Obrigado pela inscrição. Neste momento o formato não combina com a rede.', 'O repertório ainda não tem músicas autorais suficientes. Tente de novo mais à frente.'] };
  const n = { ajustes: 0, reprovada: 0 };
  await sql(`${imp}
${arts.filter((a) => PARECER[a.etapa]).map((a) => `update inscricoes_artistas set status = ${lit(a.etapa)}, parecer = ${lit(PARECER[a.etapa][n[a.etapa]++])} where user_id = ${lit(a.id)};`).join('\n')}
update inscricoes_artistas set status = 'aprovada', parecer = 'Aprovada! Bem-vinda à rede (teste).' where user_id in (${aprov.map((a) => lit(a.id)).join(', ')});`);
  const quinta = soma(proximo(hoje, 5, 1), -1), bloqueado = soma(proximo(hoje, 5, 4), 1);
  await sql(`insert into disponibilidade_semanal (user_id, cidade, dias, atualizado_por) values ${aprov.flatMap((a) => a.cids.map((c) => `(${lit(a.id)}, ${lit(CID[c].cidade)}, '{${SEM_CID[c]}}', ${lit(a.id)})`)).join(',\n')};
insert into disponibilidade_artista (user_id, dia, situacao, nota) values ${aprov.flatMap((a) => [`(${lit(a.id)}, ${lit(quinta)}, 'disponivel', 'Livre nesta quinta (teste)')`, `(${lit(a.id)}, ${lit(bloqueado)}, 'indisponivel', 'Viagem (teste)')`]).join(',\n')};`);
  ok(true, `artistas: ${aprov.length} aprovados com dias por cidade e por data; 2 em rascunho, 2 na curadoria, 2 em ajustes, 2 reprovados`);

  // Datas (criadas pela Central), com o line-up na ordem da noite.
  const linhaLineup = (x, j) => typeof x === 'string' ? { nome: A[x].nome, user_id: A[x].id, ordem: j + 1, producao: false, whatsapp: inscricao(A[x].linha, A[x].i).whatsapp } : { nome: x.nome, ordem: j + 1, producao: false };
  const casaId = Object.fromEntries((await sql(`select user_id, id from cadastros_casas where user_id in (${Object.values(C).map((c) => lit(c.id)).join(', ')})`)).map((r) => [r.user_id, r.id]));
  const ins = await sql(`${imp} insert into datas_portal (dia, abertura, produto, casa_id, casa_nome, cidade, artistas, observacao, criado_por) values ${datas.map((d) => { const c = C[d.casa];
    return `(${lit(d.dia)}, '19:00', ${lit(d.produto)}, ${lit(casaId[c.id])}, ${lit(c.nome)}, ${lit(`${CID[c.cid].cidade}/SP`)}, ${js(d.artistas.map(linhaLineup))}, ${lit(`Teste: ${d.incompleta ? 'line-up incompleto' : d.produto}`)}, ${lit(central)})`; }).join(',\n')} returning id, dia::text dia, casa_nome;`);
  for (const d of datas) { d.id = ins.find((r) => r.dia === d.dia && r.casa_nome === C[d.casa].nome)?.id; d.ev = 'p:' + d.id; }
  ok(datas.every((d) => d.id), `${datas.length} datas criadas (2 Descubra, 2 Apresenta, Turnê em 3 cidades, 1 Noite Tranquilo, 2 com line-up incompleto)`);

  // Contratos a partir dos modelos: um de parceria por casa (exceto as de equipe incompleta) e um por artista do line-up com conta.
  const modelos = await sql(`select id, nome, texto from modelos_contrato where ativo order by criado_em desc`);
  const achar = (re) => modelos.find((m) => re.test(m.nome)) || null;
  const mDesc = achar(/artista.*descubra/i) || achar(/artista/i), mApr = achar(/artista.*apresenta/i) || mDesc, mCasa = achar(/^casa|parceria/i);
  const hojeBR = new Date(hoje + 'T12:00:00Z').toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
  const conferir = [];
  async function contrato(m, x, tipo, cad, data) {
    if (!m) { ok(false, `modelo de contrato ${tipo} não encontrado (modelos_contrato)`); return null; }
    const { texto, campos } = TQ.campos(m.texto), cidade = data ? CID[C[data.casa].cid].cidade : null;
    const evento = data ? { d: data.dia, c: cidade, h: C[data.casa].nome, m: data.produto, n: `Tranquilo ${data.produto} — ${cidade}`, noite: { inicio: '19:00' } } : null;
    const sug = TQ.sugestoes(evento, { vinculo_nome: x.nome });
    const eqv = {}; for (const c of campos) { const v = sug[c.chave] || (/cache|valor/.test(c.chave) ? '600,00' : ''); if (v) eqv[c.chave] = v; }
    const daEquipe = campos.filter((c) => eqv[c.chave]), daPessoa = campos.filter((c) => !eqv[c.chave]);
    const val = TQ.doCadastro(daPessoa, tipo, cad, { combinados: tipo === 'casa' ? COMB : null, email: x.email });
    if (x.etapa === 'dados') { if (daPessoa.length && daPessoa.every((c) => val[c.chave])) delete val[daPessoa.at(-1).chave]; }
    else { const p = pessoa(tipo === 'casa' ? `${x.dono} (teste)` : x.nome, x.i, cidade || CID[x.cid || x.cids[0]].cidade);
      for (const c of daPessoa) if (!val[c.chave]) val[c.chave] = p[c.chave] || p[Object.keys(p).find((q) => c.chave.includes(q))] || (/data|nascimento/.test(c.chave) ? hojeBR : 'Conforme combinado'); }
    const titulo = `${m.nome} · ${x.nome}${data ? ` · ${cidade} ${data.dia.slice(8, 10)}/${data.dia.slice(5, 7)}` : ''}`.slice(0, 160);
    const r = await sql(`insert into contratos (user_id, evento_id, titulo, modelo_id, texto, campos, dados, status, lido_fim_em, criado_por, criado_em)
values (${lit(x.id)}, ${lit(data ? data.ev : null)}, ${lit(titulo)}, ${lit(m.id)}, ${lit(TQ.preencher(texto, daEquipe, eqv))}, ${js(daPessoa)}, ${js(val)}, 'enviado', ${x.etapa === 'dados' ? 'null' : "now() - interval '1 day'"}, ${lit(central)}, now() - interval '3 days') returning id;`);
    const cid = r.at(-1).id;
    if (['recebido', 'devolvido', 'conferido'].includes(x.etapa)) {
      await ctx.subirArquivo(`${x.id}/contrato_${cid}/${Date.now()}-contrato-assinado.pdf`, pdf);
      if (x.etapa === 'conferido') conferir.push(`select conferir_contrato(${lit(cid)}, true);`);
      if (x.etapa === 'devolvido') conferir.push(`select conferir_contrato(${lit(cid)}, false, ${lit(tipo === 'casa' ? 'A página de assinatura veio sem a rubrica do sócio. Envie de novo, por favor.' : 'O arquivo veio sem a última página assinada. Envie de novo, por favor.')});`);
    }
    return cid;
  }
  for (const c of Object.values(C).filter((c) => CONTRATO.has(c.etapa))) await contrato(mCasa, c, 'casa', ficha(c.linha, c.i), null);
  for (const d of datas) for (const u of d.artistas.filter((x) => typeof x === 'string' && CONTRATO.has(A[x].etapa)))
    await contrato(R.produtoBase(d.produto) === 'Apresenta' ? mApr : mDesc, A[u], 'artista', inscricao(A[u].linha, A[u].i), d);
  // Conferir e pedir de novo pela função do banco (exige o arquivo no armazenamento), como a Isa e o Gui fazem na tela.
  if (conferir.length) await sql(`${imp}\n${conferir.join('\n')}`);
  ok(true, `contratos: casas e artistas com 2 em cada estado (${Object.values(ROT_CT).join(' · ')}); ${conferir.length} conferidos ou devolvidos pela Central`);

  // Passos de cada data: o que vencia até hoje está feito (casa em campanha atrasada: metade). O passo "contrato" do artista
  // só conta feito com o assinado recebido ou conferido.
  const chk = [];
  for (const d of datas) {
    const casa = C[d.casa], atrasada = d.campanha === 'atrasada';
    R.passosDaData('casa', d.dia, {}, hoje, d.produto).filter((p) => p.prazo <= hoje).forEach((p, j) => { if (!atrasada || j % 2 === 0) chk.push([casa.id, d.ev, p.chave]); });
    for (const u of d.artistas.filter((x) => typeof x === 'string')) {
      const a = A[u], ctOk = ['recebido', 'conferido'].includes(a.etapa);
      for (const p of R.passosDaData('artista', d.dia, {}, hoje, d.produto)) if (p.prazo <= hoje && (p.chave !== 'contrato' || ctOk)) chk.push([a.id, d.ev, p.chave]);
    }
  }
  if (chk.length) await sql(`insert into checklist (user_id, evento_id, item, feito, atualizado_em) values ${chk.map(([u, e, i]) => `(${lit(u)}, ${lit(e)}, ${lit(i)}, true, now() - interval '1 day')`).join(', ')} on conflict do nothing;`);
  ok(true, `${chk.length} passos das datas marcados (o que vencia até hoje)`);

  // Campanhas do Bruno: uma por casa com data, ligada pelo nome da casa (o vínculo da conta, que a casa também vê).
  const ACOES = [
    [{ canal: 'Instagram', texto: 'Post de anúncio da noite com o flyer (sem revelar o line-up).', links: [] }],
    [{ canal: 'WhatsApp', texto: 'Convite no grupo da comunidade e em 15 conversas no privado.', links: [] }],
    [{ canal: 'Stories', texto: 'Caixinha: "que música você quer ouvir ao vivo?"', links: [] }],
    [{ canal: 'Instagram', texto: 'Reel de bastidores da casa preparando a noite.', links: [] }],
    [{ canal: 'Stories', texto: 'Contagem regressiva com o link de ingresso.', links: [] }],
  ];
  const SEM = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'], INI = { 'concluída': -11, 'em dia': -5, 'atrasada': -6, 'começando': 0 };
  const campanhas = datas.filter((d) => d.campanha);
  for (const [j, d] of campanhas.entries()) {
    const casa = C[d.casa], dias = Array.from({ length: 10 }, (_, q) => soma(hoje, INI[d.campanha] + q));
    const its = await sql(`with c as (insert into campanhas (slug, titulo, casa_ref) values (${lit(`teste-eq-${j + 1}`)}, ${lit(`Campanha ${R.produtoBase(d.produto)} · ${casa.nome}`)}, ${lit(casa.nome)}) returning id)
insert into campanha_itens (campanha_id, chave, dia, rotulo, acoes) select c.id, v.chave, v.dia::date, v.rotulo, v.acoes from c, (values ${dias.map((x, q) => `(${lit('d' + x.replace(/-/g, ''))}, ${lit(x)}, ${lit(`${SEM[wd(x)]} ${x.slice(8, 10)}/${x.slice(5, 7)}`)}, ${js(ACOES[q % 5].map((a) => ({ ...a, show: R.produtoBase(d.produto) })))})`).join(', ')}) v(chave, dia, rotulo, acoes) returning id, dia::text dia;`);
    const passados = its.filter((x) => x.dia < hoje).sort((a, b) => a.dia.localeCompare(b.dia));
    const feitos = d.campanha === 'atrasada' ? passados.filter((_, q) => q % 2 === 0) : d.campanha === 'começando' ? [] : passados;
    if (feitos.length) await sql(`${como(casa.id)} insert into campanha_feitos (item_id) values ${feitos.map((x) => `(${lit(x.id)})`).join(', ')};`);
  }
  ok(true, `${campanhas.length} campanhas (2 em dia, 2 atrasadas, 2 começando, 2 concluídas)`);

  await verificar(ctx, { C, A, datas, hoje, R, como });
}

// ---------- 3. conferir e resumir ----------
export async function verificar(ctx, { C, A, datas, hoje, R, como }) {
  const { sql, ok } = ctx, log = ctx.log || console.log;
  const casas = await sql(`select c.id, c.user_id, c.status::text status, c.parecer, c.dados, u.email, p.vinculo_nome from cadastros_casas c join perfis p on p.id = c.user_id join auth.users u on u.id = c.user_id where u.email like '%@${DOM}'`);
  const insc = await sql(`select i.user_id, i.status::text status, i.parecer, i.dados, u.email, p.vinculo_nome from inscricoes_artistas i join perfis p on p.id = i.user_id join auth.users u on u.id = i.user_id where u.email like '%@${DOM}'`);
  const temSt = (await sql(`select to_regclass('storage.objects') is not null t`))[0]?.t;
  const cts = await sql(`select k.id, k.user_id, k.evento_id, u.email,
      case when k.status = 'assinado' then 'assinado' when k.status = 'cancelado' then 'cancelado' when k.conferido_em is not null then 'conferido'
        when arq.em is not null and (k.devolvido_em is null or arq.em > k.devolvido_em) then 'recebido'
        when k.devolvido_em is not null then 'devolvido'
        when exists (select 1 from jsonb_array_elements(k.campos) x where coalesce(btrim(k.dados->>(x->>'chave')), '') = '') then 'dados' else 'assinar' end etapa
    from contratos k join auth.users u on u.id = k.user_id
    left join lateral (select ${temSt ? `max(o.created_at) em from storage.objects o where o.bucket_id = 'materiais' and left(o.name, length(k.user_id::text || '/contrato_' || k.id::text || '/')) = k.user_id::text || '/contrato_' || k.id::text || '/'` : 'null::timestamptz em'}) arq on true
    where ${E_TESTE}`);
  const eqc = await sql(`select casa_ref, funcoes, reserva from equipe_casa`);
  const sem = await sql(`select casa_ref, user_id, cidade, dias from disponibilidade_semanal`);
  const disp = await sql(`select casa_ref, dia::text dia, situacao from disponibilidade_casa where dia >= ${lit(hoje)}`);
  const dispA = await sql(`select user_id, dia::text dia, situacao from disponibilidade_artista where dia >= ${lit(hoje)}`);
  const dps = await sql(`select id, dia::text dia, produto, casa_id, casa_nome, cidade, artistas from datas_portal where status = 'confirmada' and dia >= ${lit(hoje)}`);
  const camps = await sql(`select c.slug, c.casa_ref, count(*)::int itens, count(*) filter (where i.dia < ${lit(hoje)})::int passados,
      count(f.item_id) filter (where i.dia < ${lit(hoje)})::int feitos_passados, count(f.item_id)::int feitos
    from campanhas c join campanha_itens i on i.campanha_id = c.id left join campanha_feitos f on f.item_id = i.id where c.slug like 'teste-eq-%' group by c.slug, c.casa_ref`);
  const chk = await sql(`select user_id, evento_id, item from checklist where evento_id like 'p:%' and feito`);

  const contaN = (lista) => lista.reduce((m, x) => (m[x] = (m[x] || 0) + 1, m), {});
  const linha = (titulo, o) => log(`RESUMO ${titulo.padEnd(26)} ${Object.entries(o).map(([s, n]) => `${s} ${n}`).join(' · ')}`);
  const doisEmCada = (o, nome) => { const ruins = Object.entries(o).filter(([, n]) => n < 2 || n > 3); ok(!ruins.length, `${nome}: 2 (no máximo 3) em cada status${ruins.length ? ' — fora: ' + ruins.map(([s, n]) => `${s}=${n}`).join(', ') : ''}`); };
  const equipeCompleta = (ref) => { const m = eqc.filter((x) => k(x.casa_ref) === k(ref)), tit = m.filter((x) => !x.reserva);
    return ['lider', 'anfitriao', 'social_media', 'som', 'porta'].every((f) => tit.some((x) => (x.funcoes || []).includes(f))) && m.some((x) => x.reserva); };
  const ctDe = (uid) => cts.filter((x) => x.user_id === uid && x.etapa !== 'cancelado');

  // Casas por etapa (Ficha; depois de habilitada, contrato e equipe).
  const etapaCasa = (c) => c.status !== 'habilitada' ? c.status : ctDe(c.user_id).length ? 'contrato ' + ROT_CT[ctDe(c.user_id)[0].etapa] : equipeCompleta(c.vinculo_nome) ? 'habilitada sem contrato' : 'equipe incompleta';
  const sc = contaN(casas.map(etapaCasa)); linha('casas (Gui)', sc); doisEmCada(sc, 'casas');
  const etapaArt = (i) => { if (i.status !== 'aprovada') return i.status; const c = ctDe(i.user_id);
    return c.length ? 'contrato ' + ROT_CT[c[0].etapa] : dps.some((d) => (d.artistas || []).some((a) => a.user_id === i.user_id)) ? 'no line-up, contrato a preparar' : 'aprovada sem data'; };
  const sa = contaN(insc.map(etapaArt)); linha('artistas (Isa)', sa);
  const { 'no line-up, contrato a preparar': _prep, ...saSem } = sa; doisEmCada(saSem, 'artistas'); ok((_prep || 0) >= 2, `${_prep || 0} artistas no line-up com o contrato a preparar (inclui o da Turnê)`);

  // Coerência de contrato: casa com contrato está habilitada com equipe completa; artista com contrato está aprovado, no line-up
  // daquela data e livre naquele dia e cidade; ninguém tem duas datas no mesmo dia.
  for (const c of casas.filter((c) => ctDe(c.user_id).length)) ok(c.status === 'habilitada' && equipeCompleta(c.vinculo_nome), `casa com contrato está habilitada e com equipe completa: ${c.vinculo_nome || c.dados?.nome}`);
  for (const c of casas.filter((c) => ['ajustes', 'reprovada'].includes(c.status))) ok(!!c.parecer, `casa em ajustes tem o parecer: ${c.dados?.nome}`);
  for (const i of insc.filter((i) => ['ajustes', 'reprovada'].includes(i.status))) ok(!!i.parecer, `artista em ${i.status} tem o parecer: ${i.vinculo_nome}`);
  const semanaArt = (uid, cid) => [...new Set(sem.filter((x) => x.user_id === uid && (!x.cidade || c1(x.cidade) === c1(cid))).flatMap((x) => (x.dias || []).map(Number)))];
  const livreArt = (uid, nome, dia, cid, ignorar) => {
    if (dps.some((d) => d.id !== ignorar && d.dia === dia && (d.artistas || []).some((a) => a.user_id === uid || k(a.nome) === k(nome)))) return false;
    const ex = dispA.find((x) => x.user_id === uid && x.dia === dia); if (ex) return ex.situacao === 'disponivel';
    return semanaArt(uid, cid).includes(wd(dia));
  };
  const livreCasa = (c, dia, ignorar) => {
    if (dps.some((d) => d.id !== ignorar && d.dia === dia && (d.casa_id === c.id || k(d.casa_nome) === k(c.vinculo_nome)))) return false;
    const ex = disp.find((x) => k(x.casa_ref) === k(c.vinculo_nome) && x.dia === dia); if (ex) return ex.situacao === 'disponivel';
    const s = sem.find((x) => x.casa_ref && k(x.casa_ref) === k(c.vinculo_nome));
    return (s ? s.dias.map(Number) : []).includes(wd(dia));
  };
  for (const ct of cts.filter((x) => x.evento_id)) {
    const d = dps.find((x) => 'p:' + x.id === ct.evento_id), i = insc.find((x) => x.user_id === ct.user_id);
    ok(!!d && i?.status === 'aprovada' && (d.artistas || []).some((a) => a.user_id === ct.user_id) && livreArt(ct.user_id, i.vinculo_nome, d.dia, d.cidade, d.id),
      `artista com contrato de data está aprovado, no line-up e livre no dia: ${i?.vinculo_nome} em ${d?.dia}`);
  }
  for (const d of dps.filter((d) => casas.some((c) => c.id === d.casa_id))) {
    const c = casas.find((x) => x.id === d.casa_id);
    ok(c.status === 'habilitada' && livreCasa(c, d.dia, d.id), `casa da data está habilitada e com o dia livre: ${d.casa_nome} em ${d.dia}`);
    for (const a of (d.artistas || []).filter((a) => a.user_id)) ok(livreArt(a.user_id, a.nome, d.dia, d.cidade, d.id) && insc.find((x) => x.user_id === a.user_id)?.status === 'aprovada', `${a.nome} aprovado e livre no dia da data (${d.dia}, ${d.cidade})`);
  }

  // Datas: formatos e line-up.
  const nossas = dps.filter((d) => casas.some((c) => c.id === d.casa_id));
  const completa = (d) => { const F = R.formatoDe(d.produto); return (d.artistas || []).length >= F.artistas + (F.abertura && d.produto !== 'Turnê' ? 1 : 0); };
  const sd = contaN(nossas.map((d) => completa(d) ? d.produto : 'line-up incompleto')); linha('datas (Isa)', sd);
  ok(sd.Descubra === 2 && sd.Apresenta === 2 && sd['Noite Tranquilo'] === 1 && sd['line-up incompleto'] === 2, 'datas: 2 Descubra, 2 Apresenta, 1 Noite Tranquilo e 2 com line-up incompleto');
  const tur = nossas.filter((d) => d.produto === 'Turnê'), turArt = new Set(tur.map((d) => d.artistas[0]?.user_id));
  ok(tur.length >= 2 && turArt.size === 1 && new Set(tur.map((d) => c1(d.cidade))).size === tur.length && new Set(tur.map((d) => d.dia)).size === tur.length, `Turnê: o mesmo artista em ${tur.length} cidades, em dias diferentes`);
  const hab = casas.filter((c) => c.status === 'habilitada'), ate30 = soma(hoje, 30);
  const semData = hab.filter((c) => !nossas.some((d) => d.casa_id === c.id && d.dia <= ate30));
  ok(semData.length >= 2, `${semData.length} casas habilitadas sem data nos próximos 30 dias (${semData.filter((c) => ctDe(c.user_id)[0]?.etapa === 'conferido').length} prontas)`);

  // Busca rápida por formato (mesma regra da tela Criar datas): casa habilitada livre no dia e artistas livres para a cidade
  // dela, que moram ou querem tocar ali e topam o formato, em número suficiente. Conta só as casas prontas (contrato conferido).
  const artistas = insc.map((i) => ({ id: i.user_id, nome: i.vinculo_nome || i.dados?.nome_artistico, interesse: i.dados?.formato_interesse || '', cidades: (i.dados?.cidades_interesse || []).map(k), mora: k(i.dados?.cidade_base) }));
  const prontas = hab.filter((c) => ctDe(c.user_id)[0]?.etapa === 'conferido' && equipeCompleta(c.vinculo_nome));
  const dias = Array.from({ length: 31 }, (_, q) => soma(hoje, q));
  const candidatos = (c, dia, produto) => { const cid = c.dados?.cidade_uf || '', ck = c1(cid);
    return artistas.filter((a) => (a.cidades.some((x) => x.includes(ck)) || a.mora.includes(ck)) && R.topaFormato(a.interesse, produto) > 0 && livreArt(a.id, a.nome, dia, cid)); };
  const busca = {};
  for (const produto of ['Descubra', 'Apresenta', 'Noite Tranquilo']) {
    const F = R.formatoDe(produto); let n = 0, primeiro = null;
    for (const dia of dias) for (const c of prontas) if (livreCasa(c, dia) && candidatos(c, dia, produto).length >= F.artistas) { n++; primeiro ||= `${c.vinculo_nome} ${dia}`; }
    busca[produto] = n; ok(n >= 2, `busca rápida ${produto}: ${n} casas prontas e dias com artistas livres que topam (ex.: ${primeiro || '-'})`);
  }
  const turneOk = artistas.filter((a) => R.topaFormato(a.interesse, 'Turnê') > 0).filter((a) => new Set(hab.flatMap((c) => dias.some((dia) => livreCasa(c, dia) && candidatos(c, dia, 'Turnê').some((x) => x.id === a.id)) ? [c1(c.dados?.cidade_uf)] : [])).size >= 2);
  busca['Turnê (artistas com 2+ cidades)'] = turneOk.length; ok(turneOk.length >= 2, `busca rápida Turnê: ${turneOk.length} artistas com casas livres em 2 ou mais cidades`);
  linha('busca rápida (30 dias)', busca);

  // Campanhas: situação, ligação com a casa (a casa vê) e data da casa.
  const sitC = (c) => c.passados === 0 ? 'começando' : c.feitos === c.itens ? 'concluída' : c.feitos_passados === c.passados ? 'em dia' : 'atrasada';
  const scp = contaN(camps.map(sitC)); linha('campanhas (Bruno)', scp);
  ok(['em dia', 'atrasada', 'começando', 'concluída'].every((s) => scp[s] === 2), 'campanhas: 2 em dia, 2 atrasadas, 2 começando e 2 concluídas');
  for (const cp of camps) {
    const c = casas.find((x) => k(x.vinculo_nome) === k(cp.casa_ref));
    const ve = c ? (await sql(`${como(c.user_id)} select posso_casa(${lit(cp.casa_ref)}) ve`)).at(-1)?.ve : false;
    ok(!!c && ve === true && nossas.some((d) => d.casa_id === c.id), `campanha ${sitC(cp)} ligada à casa com data, e a casa vê: ${cp.casa_ref}`);
  }

  // Passos: quem está em dia não tem passo vencido em aberto.
  const vencidos = (uid, d, modelo) => { const f = Object.fromEntries(chk.filter((x) => x.user_id === uid && x.evento_id === 'p:' + d.id).map((x) => [x.item, true]));
    if (modelo === 'artista' && ctDe(uid).some((x) => ['recebido', 'conferido'].includes(x.etapa))) f.contrato = true;
    return R.passosDaData(modelo, d.dia, f, hoje, d.produto).filter((p) => p.atrasado).map((p) => p.chave); };
  let emDia = 0, atras = 0;
  for (const d of nossas) {
    const c = casas.find((x) => x.id === d.casa_id), cp = camps.find((x) => k(x.casa_ref) === k(c.vinculo_nome)), v = vencidos(c.user_id, d, 'casa');
    if (cp && sitC(cp) === 'atrasada') { atras++; continue; }
    ok(!v.length, `passos da casa em dia: ${d.casa_nome} ${d.dia}${v.length ? ' (vencidos: ' + v.join(', ') + ')' : ''}`); emDia++;
    for (const a of (d.artistas || []).filter((a) => a.user_id)) { const va = vencidos(a.user_id, d, 'artista').filter((x) => x !== 'contrato');
      ok(!va.length, `passos de ${a.nome} em dia (${d.dia})${va.length ? ': vencidos ' + va.join(', ') : ''}`); }
  }
  linha('passos', { 'datas com a casa em dia': emDia, 'datas com a casa atrasada (campanha atrasada)': atras, 'passos feitos': chk.filter((x) => nossas.some((d) => x.evento_id === 'p:' + d.id)).length });

  // E-mails fictícios por etapa, para a Marina distribuir.
  const porEtapa = (lista, f) => Object.entries(lista.reduce((m, x) => ((m[f(x)] ||= []).push(x.email.split('@')[0]), m), {})).sort();
  for (const [s, es] of porEtapa(casas, etapaCasa)) log(`CASA    ${s.padEnd(40)} ${es.sort().join(', ')}`);
  for (const [s, es] of porEtapa(insc, etapaArt)) log(`ARTISTA ${s.padEnd(40)} ${es.sort().join(', ')}`);
  log(`(todos @${DOM}, com a senha comum)`);
}
