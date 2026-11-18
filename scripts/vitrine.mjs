// Vitrine para demonstração (pedido da Marina, 18/11/2026): uma conta pronta em cada etapa do fluxo, para mostrar ao vivo
// sem preencher nada. Todos os dados são inventados. Só roda à mão (workflow vitrine).
//   SUPABASE_ACCESS_TOKEN  token da Management API
//   SENHA_HASH             hash bcrypt da senha comum das contas (a senha não passa pelo repositório)
//   MODO                   criar (apaga a vitrine anterior e os testes manuais "TESTE …" de hoje e cria de novo), apagar ou
//                          equilibrio (apaga todos os dados de teste antigos e cria 2 casos em cada status de cada fluxo:
//                          casas do Gui, artistas e datas da Isa, campanhas do Bruno; ver scripts/equilibrio.mjs)
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const tok = process.env.SUPABASE_ACCESS_TOKEN, MODO = process.env.MODO || 'criar', HASH = (process.env.SENHA_HASH || '').trim();
if (!tok) { console.error('::error::Falta SUPABASE_ACCESS_TOKEN.'); process.exit(1); }
if ((MODO === 'criar' || MODO === 'equilibrio') && !/^\$2[aby]\$\d{2}\$.{53}$/.test(HASH)) { console.error('::error::SENHA_HASH precisa ser um hash bcrypt.'); process.exit(1); }
const cfg = await readFile(new URL('../src/config.js', import.meta.url), 'utf8');
const ref = cfg.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1], URL_SB = `https://${ref}.supabase.co`;
const limpo = (s) => String(s ?? '').replace(/[^\s@"']+@[^\s@"']+/g, '[e-mail]').replace(/eyJ[\w.-]{20,}|sb_(secret|publishable)_[\w-]+|\$2[aby]\$[^\s"']+/g, '[chave]').slice(0, 300);
async function sql(q, tentativa = 0) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, { method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q }) });
  const t = await r.text();
  if (r.status === 429 && tentativa < 5) { await new Promise((ok) => setTimeout(ok, 5000 * (tentativa + 1))); return sql(q, tentativa + 1); }
  if (!r.ok) throw new Error(`SQL HTTP ${r.status}: ${limpo(t)}`);
  return JSON.parse(t);
}
const lit = (s) => (s == null ? 'null' : `'${String(s).replace(/'/g, "''")}'`);
const js = (o) => `${lit(JSON.stringify(o))}::jsonb`;
const res = []; const ok = (c, m) => { res.push((c ? 'OK    ' : 'FALHA ') + m); if (!c) process.exitCode = 1; };

const DOM = 'tranquilo.teste', DIA = '2026-11-27', CIDADE = 'São Paulo';
const C = {
  ficha: { email: `casa.ficha@${DOM}`, nome: 'Casa Jabuticaba (teste)', dono: 'Rita Campos' },
  analise: { email: `casa.analise@${DOM}`, nome: 'Casa Ipê Roxo (teste)', dono: 'Marcos Lemos' },
  equipe: { email: `casa.equipe@${DOM}`, nome: 'Casa Maracujá (teste)', dono: 'Joana Prado' },
  contrato: { email: `casa.contrato@${DOM}`, nome: 'Casa Lua Cheia (teste)', dono: 'Carla Duarte' },
};
const A = {
  ficha: { email: `artista.ficha@${DOM}`, nome: 'Duo Maré Alta (teste)' },
  curadoria: { email: `artista.curadoria@${DOM}`, nome: 'Nina Brisa (teste)' },
  conferir: { email: `artista.conferir@${DOM}`, nome: 'Rui Campos (teste)' },
  assinar: { email: `artista.assinar@${DOM}`, nome: 'Bia Serra (teste)' },
  dados: { email: `artista.dados@${DOM}`, nome: 'Téo Lima (teste)' },
};
const TODOS = [...Object.values(C), ...Object.values(A)].map((x) => x.email);

const ficha = (x, i, tudo = true) => ({
  nome: x.nome, cidade_uf: 'São Paulo/SP', ...(tudo ? {
    razao_social: `${x.nome.replace(' (teste)', '')} Bar e Música Ltda.`, cnpj: ['11.222.333/0001-81', '12.345.678/0001-95', '11.444.777/0001-61', '45.723.174/0001-10'][i],
    emite_nf: 'sim', endereco: `Rua Augusta, ${1200 + i * 100}, Consolação, São Paulo/SP, 01304-001`, complemento: 'Sobrado com portão azul',
    instagram: '@casa.teste', telefone: '(11) 3333-4444', funcionamento: 'Quarta a sábado, 18h à 1h',
    como_chegar: 'Metrô Consolação a 5 minutos. Estacionamento na rua de trás. Rua iluminada à noite.',
    dono_nome: `${x.dono} (teste)`, dono_cpf: '529.982.247-25', dono_rg: '12.345.678-9', dono_nascimento: '15/03/1985', whatsapp: `(11) 9876${i}-4321`,
    dono_endereco: 'Rua Haddock Lobo, 200, ap. 31, São Paulo/SP, 01414-000',
    rep_titular: `${x.nome.replace(' (teste)', '')} Bar e Música Ltda.`, rep_documento: '11.222.333/0001-81', rep_banco: 'Itaú (341)', rep_tipo: 'corrente', rep_agencia: '1234', rep_conta: '56789-0', rep_pix: '11.222.333/0001-81',
    capacidade_sentado: '80', capacidade: '120', conforto: '60 almofadas, 4 tapetes, 20 banquetas', palco: '4 x 3 m, 30 cm de altura', camarim: 'tem',
    acessibilidade: ['rampa', 'banheiro'], menores: 'responsavel', som: '2 JBL PRX 712 + sub PRX 718', mesa: 'Yamaha MG16, 16 canais', microfones: 'sim', pedestais: 'sim',
    ligar_palco: '4 cabos XLR, 2 direct box, 2 retornos, 2 banquetas.', luz: '4 PAR LED; plateia em penumbra',
    bar_cozinha: 'Drinks, cerveja e petiscos. Cozinha até 23h.', ticket_medio: 'R$ 60', caixa_sistema: 'Stone, com relatório por noite', exclusividade_bebida: 'Não tem',
    ticketeira: 'Não usa', dias_semana: ['quinta', 'sexta', 'sabado'], duvidas_guia: 'Como funciona o repasse da bilheteria na primeira data?',
  } : { razao_social: `${x.nome.replace(' (teste)', '')} Ltda.`, endereco: 'Rua Fradique Coutinho, 900, Pinheiros, São Paulo/SP', dono_nome: `${x.dono} (teste)`, whatsapp: '(11) 98700-1111' }),
});
const insc = (x, i, tudo = true) => ({
  nome_artistico: x.nome, cidade_base: 'São Paulo', estado: 'SP', generos: ['MPB, folk', 'Samba, soul', 'Indie, rock', 'MPB, jazz', 'Pop, R&B'][i] + '. Referências: Anavitória, Tim Bernardes.',
  formato_interesse: 'descubra', ...(tudo ? {
    release: `${x.nome.replace(' (teste)', '')} nasceu em São Paulo e mistura canções autorais com arranjos delicados, falando de cidade, afeto e saudade. Já tocou em bares e saraus da capital, tem um EP lançado e prepara o primeiro disco. Cadastro fictício para demonstração.`,
    spotify: 'https://open.spotify.com/artist/teste123', instagram: '@artista.teste', ouvintes_mensais: String(1500 + i * 900), seguidores_instagram: String(3000 + i * 700),
    formacao: ['duo', 'solo', 'trio', 'solo', 'duo'][i], integrantes: String([2, 1, 3, 1, 2][i]), rider_tipo: 'circulavel', tecnico_proprio: 'nao',
    necessidades: '2 microfones de voz, 1 direct box, 1 banqueta.', cidades_interesse: ['São Paulo', 'Campinas'], equipe_viagem: '2',
    aceita_bonus: 'true', cache_minimo: '800', contato_producao: 'Produção (teste) · (11) 96666-1111', whatsapp: `(11) 9123${i}-5678`, aceite: 'true',
  } : { release: 'Duo de violão e voz.', whatsapp: '(11) 91234-5678' }),
});
const PESSOA = (nome, i) => ({ nome_completo: nome.replace(' (teste)', ' da Silva'), cpf: '123.456.789-09', rg: `98.765.43${i}-1`, nacionalidade: 'brasileira', profissao: 'musicista',
  endereco: 'Rua Teodoro Sampaio, 800, Pinheiros, São Paulo/SP, 05406-000', chave_pix: '123.456.789-09', telefone: '(11) 91234-5678', estado_civil: 'solteira', quantidade: '2' });

async function apagar() {
  // A vitrine anterior e os testes feitos à mão hoje ("TESTE …" com e-mail real), sem tocar no caso pronto nem nas contas da equipe.
  await sql(`drop table if exists vit_ids;
create temp table vit_ids as select u.id from auth.users u left join perfis p on p.id = u.id
  where u.email in (${TODOS.map(lit).join(', ')})
     or (u.email not like '%@teste-e2e.invalid' and u.email not like '%@tranquilo.com.br' and coalesce(p.tipo::text, '') in ('casa', 'artista')
         and (coalesce(p.nome, '') ilike 'TESTE %' or coalesce(p.vinculo_nome, '') ilike 'TESTE %' or coalesce(u.raw_user_meta_data->>'nome', '') ilike 'TESTE %'));
drop table if exists vit_casas;
create temp table vit_casas as select distinct lower(x) ref from (
  select dados->>'nome' x from cadastros_casas where user_id in (select id from vit_ids)
  union select vinculo_nome from perfis where id in (select id from vit_ids) and tipo = 'casa'
  union select unnest(array[${Object.values(C).map((x) => lit(x.nome)).join(', ')}])) t where x is not null;
do $$ begin
  alter table contratos disable trigger trg_contrato_apagar;
  delete from contratos where user_id in (select id from vit_ids);
  alter table contratos enable trigger trg_contrato_apagar;
end $$;
delete from datas_portal where lower(casa_nome) in (select ref from vit_casas) or criado_por in (select id from vit_ids);
delete from disponibilidade_casa where lower(casa_ref) in (select ref from vit_casas);
delete from disponibilidade_semanal where lower(casa_ref) in (select ref from vit_casas) or user_id in (select id from vit_ids);
delete from disponibilidade_artista where user_id in (select id from vit_ids);
delete from equipe_casa where lower(casa_ref) in (select ref from vit_casas);
delete from trilhas where lower(casa_ref) in (select ref from vit_casas);
delete from checklist where user_id in (select id from vit_ids);
delete from solicitacoes_ficha where casa_id in (select id from cadastros_casas where user_id in (select id from vit_ids));
delete from inscricoes_artistas where user_id in (select id from vit_ids);
delete from cadastros_casas where user_id in (select id from vit_ids);
delete from convites where email in (select email from auth.users where id in (select id from vit_ids));
delete from convites where aceito_em is null and (nome ilike 'TESTE%' or nome ilike '%(teste)%' or email like '%@tranquilo.teste');
delete from datas_portal where casa_nome ilike 'TESTE%' and criado_por not in (select id from perfis where tipo in ('equipe', 'adm')) ;
do $$ declare fk record; begin
  for fk in select c.conrelid::regclass tabela, a.attname coluna, a.attnotnull obrig
            from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
            where c.contype = 'f' and c.confrelid in ('public.perfis'::regclass, 'auth.users'::regclass)
              and c.confdeltype in ('a', 'r') and array_length(c.conkey, 1) = 1 loop
    if fk.obrig then execute format('delete from %s where %I in (select id from vit_ids)', fk.tabela, fk.coluna);
    else execute format('update %s set %I = null where %I in (select id from vit_ids)', fk.tabela, fk.coluna, fk.coluna); end if;
  end loop;
end $$;
delete from auth.users where id in (select id from vit_ids);`);
  const r = await sql(`select count(*)::int n from auth.users where email in (${TODOS.map(lit).join(', ')})`);
  ok(r[0].n === 0, 'vitrine anterior e testes manuais "TESTE …" apagados');
}

try {
  if (MODO === 'equilibrio') {
    // Dados de teste equilibrados (Marina, 18/11/2026): 2 casos em cada status, para Isa, Gui e Bruno. Nada vai ao Notion.
    const { equilibrio } = await import('./equilibrio.mjs');
    const chaves = await (await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${tok}` } })).json();
    const serv = (chaves.find?.((k) => k.name === 'service_role') || chaves.find?.((k) => k.type === 'secret'))?.api_key;
    if (!serv) throw new Error('chave de serviço não encontrada');
    console.log(`::add-mask::${serv}`);
    const H = { apikey: serv, ...(serv.startsWith('eyJ') ? { Authorization: `Bearer ${serv}` } : {}) };
    await equilibrio({
      sql, ok, log: console.log, HASH,
      async criarConta(email, nome, tipo) {
        const r = await fetch(`${URL_SB}/auth/v1/admin/users`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password_hash: HASH, email_confirm: true, user_metadata: { nome, tipo, senha_portal: true } }) });
        const j = await r.json(); if (!r.ok) throw new Error(`criar conta ${tipo}: HTTP ${r.status} ${j.msg || j.message || j.error_code || ''}`);
        return j.id;
      },
      async subirArquivo(caminho, bytes) {
        const r = await fetch(`${URL_SB}/storage/v1/object/materiais/${caminho}`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/pdf', 'x-upsert': 'true' }, body: bytes });
        if (!r.ok) throw new Error(`enviar arquivo de contrato: HTTP ${r.status}`);
      },
      async apagarArquivos(caminhos) {
        for (let i = 0; i < caminhos.length; i += 100) {
          const r = await fetch(`${URL_SB}/storage/v1/object/materiais`, { method: 'DELETE', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: caminhos.slice(i, i + 100) }) });
          if (!r.ok) throw new Error(`apagar arquivos de teste: HTTP ${r.status}`);
        }
      },
    });
  }
  if (MODO === 'criar' || MODO === 'apagar') await apagar();
  if (MODO === 'criar') {
    const chaves = await (await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${tok}` } })).json();
    const serv = (chaves.find?.((k) => k.name === 'service_role') || chaves.find?.((k) => k.type === 'secret'))?.api_key;
    if (!serv) throw new Error('chave de serviço não encontrada');
    console.log(`::add-mask::${serv}`);
    const H = { apikey: serv, ...(serv.startsWith('eyJ') ? { Authorization: `Bearer ${serv}` } : {}) };
    const conta = async (x, tipo) => {
      const r = await fetch(`${URL_SB}/auth/v1/admin/users`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: x.email, password_hash: HASH, email_confirm: true, user_metadata: { nome: x.nome, tipo, senha_portal: true } }) });
      const j = await r.json(); if (!r.ok) throw new Error(`criar conta ${tipo}: HTTP ${r.status} ${j.msg || j.message || j.error_code || ''}`);
      x.id = j.id; return j.id;
    };
    for (const x of Object.values(C)) await conta(x, 'casa');
    for (const x of Object.values(A)) await conta(x, 'artista');
    const ids = [...Object.values(C), ...Object.values(A)].map((x) => lit(x.id)).join(', ');
    await sql(`update auth.users set encrypted_password = ${lit(HASH)} where id in (${ids});
update perfis set senha_definida = true, tutorial_visto_em = now() where id in (${ids});
${Object.values(C).map((x) => `update perfis set tipo = 'casa', nome = ${lit(x.dono + ' (teste)')} where id = ${lit(x.id)};`).join('\n')}
${Object.values(A).map((x) => `update perfis set tipo = 'artista', nome = ${lit(x.nome)}, vinculo_nome = ${lit(x.nome)} where id = ${lit(x.id)};`).join('\n')}`);
    // As 20 contas TESTE da variedade (teste.casaN / teste.artistaN) passam a entrar com a mesma senha (pedido da Marina).
    const vr = await sql(`update auth.users set encrypted_password = ${lit(HASH)}, email_confirmed_at = coalesce(email_confirmed_at, now()) where email like 'teste.%@teste-e2e.invalid' returning id`);
    if (vr.length) await sql(`update perfis set senha_definida = true where id in (${vr.map((x) => lit(x.id)).join(', ')})`);
    ok(true, `${vr.length} contas TESTE da variedade com a senha comum`);
    ok(true, `${TODOS.length} contas criadas (4 casas e 5 artistas), já com senha e tutorial visto`);

    const central = (await sql(`select p.id from perfis p join auth.users u on u.id = p.id where p.tipo in ('equipe', 'adm') and u.email like 'central.%' limit 1`))[0]?.id
      || (await sql(`select id from perfis where tipo = 'adm' limit 1`))[0].id;
    const imp = `select set_config('request.jwt.claims', ${lit(JSON.stringify({ sub: central, role: 'authenticated' }))}, true), set_config('request.jwt.claim.sub', ${lit(central)}, true);`;

    // Casas: rascunho pela metade · enviada esperando o Gui · habilitada com equipe incompleta · pronta com data e contrato para assinar.
    const cs = Object.values(C);
    await sql(`insert into cadastros_casas (user_id, dados, status) values (${lit(C.ficha.id)}, ${js(ficha(C.ficha, 0, false))}, 'rascunho');
insert into cadastros_casas (user_id, dados, status, enviado_em) values (${lit(C.analise.id)}, ${js(ficha(C.analise, 1))}, 'em_analise', now() - interval '1 day'),
  (${lit(C.equipe.id)}, ${js(ficha(C.equipe, 2))}, 'em_analise', now() - interval '6 days'), (${lit(C.contrato.id)}, ${js(ficha(C.contrato, 3))}, 'em_analise', now() - interval '10 days');`);
    const COMB = { bilheteria: { casa: 30, artista: 50, tranquilo: 20 }, aeb: { casa: 88, tranquilo: 12 }, bonificacao: { tem: 'nao' } };
    await sql(`${imp} update cadastros_casas set status = 'habilitada', classificacao = 'confiavel', parecer = 'Ficha completa. Casa habilitada.', combinados = ${js(COMB)} where user_id in (${lit(C.equipe.id)}, ${lit(C.contrato.id)});`);
    await sql(`update perfis set vinculo_nome = ${lit(C.equipe.nome)} where id = ${lit(C.equipe.id)}; update perfis set vinculo_nome = ${lit(C.contrato.nome)} where id = ${lit(C.contrato.id)};`);
    const casaId = (await sql(`select id from cadastros_casas where user_id = ${lit(C.contrato.id)}`))[0].id;
    const eq = (casa, dono, lista) => `insert into equipe_casa (casa_ref, nome, whatsapp, funcoes, reserva, criado_por) values ${lista.map(([n, f, r], i) => `(${lit(casa.nome)}, ${lit(n)}, ${lit(`(11) 9777${i}-${1000 + i}`)}, ${lit(`{${f}}`)}, ${r}, ${lit(dono)})`).join(', ')};`;
    await sql(eq(C.equipe, C.equipe.id, [['Pedro Alves (teste)', 'lider', false], ['Júlia Reis (teste)', 'anfitriao', false], ['Rafa Nunes (teste)', 'social_media', false]])
      + eq(C.contrato, C.contrato.id, [['Pedro Teste', 'lider', false], ['Júlia Teste', 'anfitriao', false], ['Rafa Teste', 'social_media', false], ['Léo Som (teste)', 'som', false], ['Ana Porta (teste)', 'porta', false], ['Bia Reserva (teste)', 'anfitriao', true]]));
    const dias = Array.from({ length: 50 }, (_, i) => { const d = new Date('2026-11-18T12:00:00Z'); d.setUTCDate(d.getUTCDate() + i); return d.toISOString().slice(0, 10); });
    const livre = (ws) => dias.filter((d) => ws.includes(new Date(`${d}T12:00:00Z`).getUTCDay()));
    await sql(`insert into disponibilidade_semanal (casa_ref, dias, atualizado_por) values (${lit(C.contrato.nome)}, '{4,5,6}', ${lit(C.contrato.id)});
insert into disponibilidade_casa (casa_ref, dia, situacao, atualizado_por) values ${livre([4, 5, 6]).map((d) => `(${lit(C.contrato.nome)}, ${lit(d)}, ${d === '2026-11-21' ? "'indisponivel'" : "'disponivel'"}, ${lit(C.contrato.id)})`).join(', ')};`);
    await sql(`update disponibilidade_casa set nota = 'Evento privado' where casa_ref = ${lit(C.contrato.nome)} and dia = '2026-11-21';`).catch(() => null);
    ok(true, 'casas: Jabuticaba em rascunho, Ipê Roxo esperando habilitação, Maracujá habilitada com equipe incompleta, Lua Cheia pronta (equipe completa, qui/sex/sáb, 21/11 bloqueado)');

    // Artistas: rascunho · na curadoria · três aprovadas no line-up de 27/11 na Lua Cheia.
    const as = Object.values(A);
    await sql(`insert into inscricoes_artistas (user_id, dados, status) values (${lit(A.ficha.id)}, ${js(insc(A.ficha, 0, false))}, 'rascunho');
insert into inscricoes_artistas (user_id, dados, status, enviado_em) values ${as.slice(1).map((x, i) => `(${lit(x.id)}, ${js(insc(x, i + 1))}, 'em_curadoria', now() - interval '${3 - Math.min(i, 2)} days')`).join(', ')};`);
    const lineup = [A.conferir, A.assinar, A.dados];
    await sql(`${imp} update inscricoes_artistas set status = 'aprovada', parecer = 'Aprovada! Bem-vinda à rede.' where user_id in (${lineup.map((x) => lit(x.id)).join(', ')});`);
    await sql(lineup.map((x) => `insert into disponibilidade_semanal (user_id, cidade, dias, atualizado_por) values (${lit(x.id)}, ${lit(CIDADE)}, '{5,6}', ${lit(x.id)}), (${lit(x.id)}, 'Campinas', '{6}', ${lit(x.id)});
insert into disponibilidade_artista (user_id, dia, situacao) values ${livre([5, 6]).map((d) => `(${lit(x.id)}, ${lit(d)}, 'disponivel')`).join(', ')};`).join('\n'));
    ok(true, 'artistas: Duo Maré Alta em rascunho, Nina Brisa na curadoria, Rui Campos, Bia Serra e Téo Lima aprovados e livres sex/sáb em SP');

    // A data: Descubra sexta 27/11 na Lua Cheia, line-up de 3.
    const arts = lineup.map((x, i) => ({ nome: x.nome, user_id: x.id, ordem: i + 1, producao: false, whatsapp: `(11) 9123${i + 2}-5678` }));
    const dp = await sql(`${imp} insert into datas_portal (dia, abertura, produto, casa_id, casa_nome, cidade, artistas, link_ingressos, observacao, criado_por) values (${lit(DIA)}, '19:00', 'Descubra', ${lit(casaId)}, ${lit(C.contrato.nome)}, 'São Paulo/SP', ${js(arts)}, 'https://www.ingresse.com/tranquilo-descubra-teste', 'Data de demonstração', ${lit(central)}) returning id;`);
    const ev = 'p:' + dp.at(-1).id;
    ok(!!dp.at(-1)?.id, `data criada: Descubra sexta 27/11 na ${C.contrato.nome} com 3 artistas`);

    // Contratos: Rui com o assinado recebido (Isa confere), Bia com dados completos (falta assinar), Téo aguardando dados, casa com dados completos.
    global.window = {}; eval((await readFile(new URL('../src/contrato.js', import.meta.url), 'utf8')) + ';global.TQC = TQContrato;');
    const TQ = global.TQC;
    const modelos = await sql(`select id, nome, texto from modelos_contrato order by criado_em desc`);
    const achar = (re) => modelos.find((m) => re.test(m.nome)) || null;
    const mArt = achar(/artista.*descubra/i) || achar(/artista/i), mCasa = achar(/^casa|parceria/i);
    const evento = { d: DIA, c: CIDADE, h: C.contrato.nome, m: 'Descubra', n: 'Tranquilo Descubra — São Paulo', noite: { inicio: '19:00' } };
    const criados = {};
    async function contrato(m, x, tipo, dados, pessoa, evId, titulo) {
      if (!m) { ok(false, `modelo de contrato ${tipo} não encontrado`); return; }
      const { texto, campos } = TQ.campos(m.texto);
      const sug = TQ.sugestoes(evId ? evento : null, { vinculo_nome: x.nome });
      const eqv = {}; for (const c of campos) { const v = sug[c.chave] || (/cache|valor/.test(c.chave) ? '600,00' : ''); if (v) eqv[c.chave] = v; }
      const daEquipe = campos.filter((c) => eqv[c.chave]), daPessoa = campos.filter((c) => !eqv[c.chave]);
      const cad = TQ.doCadastro(daPessoa, tipo, dados, { combinados: tipo === 'casa' ? COMB : null, email: x.email });
      const val = {}; for (const c of daPessoa) { const v = cad[c.chave] || (pessoa ? pessoa[c.chave] || pessoa[Object.keys(pessoa).find((k) => c.chave.includes(k))] || (/data/.test(c.chave) ? '' : 'Conforme combinado') : ''); if (v) val[c.chave] = v; }
      const r = await sql(`insert into contratos (user_id, evento_id, titulo, modelo_id, texto, campos, dados, status, lido_fim_em, criado_por, criado_em)
values (${lit(x.id)}, ${lit(evId)}, ${lit(titulo.slice(0, 160))}, ${lit(m.id)}, ${lit(TQ.preencher(texto, daEquipe, eqv))}, ${js(daPessoa)}, ${js(val)}, 'enviado', ${pessoa ? 'now()' : 'null'}, ${lit(central)}, now() - interval '1 day') returning id;`);
      criados[x.email] = r.at(-1).id;
      const falta = daPessoa.filter((c) => !val[c.chave]).length;
      ok(true, `contrato de ${x.nome} enviado (${daPessoa.length} campos da pessoa, ${falta} em branco)`);
    }
    await contrato(mArt, A.conferir, 'artista', insc(A.conferir, 2), PESSOA(A.conferir.nome, 2), ev, `${mArt?.nome || 'Artista'} · ${A.conferir.nome} · São Paulo 27/11`);
    await contrato(mArt, A.assinar, 'artista', insc(A.assinar, 3), PESSOA(A.assinar.nome, 3), ev, `${mArt?.nome || 'Artista'} · ${A.assinar.nome} · São Paulo 27/11`);
    await contrato(mArt, A.dados, 'artista', insc(A.dados, 4), null, ev, `${mArt?.nome || 'Artista'} · ${A.dados.nome} · São Paulo 27/11`);
    await contrato(mCasa, C.contrato, 'casa', ficha(C.contrato, 3), { nome_completo: 'Carla Duarte (teste)', cpf: '529.982.247-25', rg: '12.345.678-9', nacionalidade: 'brasileira', profissao: 'empresária', endereco: 'Rua Haddock Lobo, 200, São Paulo/SP', telefone: '(11) 98763-4321', estado_civil: 'casada' }, null, `${mCasa?.nome || 'Casa'} · ${C.contrato.nome}`);

    // O assinado do Rui chega como arquivo (como se ele tivesse baixado, assinado e enviado de volta).
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
    const caminho = `${A.conferir.id}/contrato_${criados[A.conferir.email]}/${Date.now()}-contrato-assinado-rui-campos.pdf`;
    const up = await fetch(`${URL_SB}/storage/v1/object/materiais/${caminho}`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/pdf', 'x-upsert': 'true' }, body: pdf });
    ok(up.ok, `contrato assinado do Rui recebido como arquivo (${up.status})`);

    // Passos em dia para quem está no line-up (o que vencia até hoje).
    const regras = await readFile(new URL('../src/regras.js', import.meta.url), 'utf8');
    const lista = (nome) => [...regras.slice(regras.indexOf(`const ${nome} = [`)).split('];')[0].matchAll(/\["([a-z_0-9]+)",\s*(-?\d+)/g)].map(([, k, d]) => [k, +d]);
    const feitos = (pid, l) => l.filter(([, d]) => d <= -10).map(([k]) => `(${lit(pid)}, ${lit(ev)}, ${lit(k)}, true, now() - interval '1 day')`);
    const linhas = [...feitos(A.conferir.id, lista('PASSOS_ARTISTA')), ...feitos(A.assinar.id, lista('PASSOS_ARTISTA')), ...feitos(C.contrato.id, lista('PASSOS_CASA'))];
    if (linhas.length) await sql(`insert into checklist (user_id, evento_id, item, feito, atualizado_em) values ${linhas.join(', ')} on conflict do nothing;`);
    ok(true, `${linhas.length} passos da data já feitos (os que venciam até hoje)`);

    // Conferência: o que cada conta tem, para não haver caso incoerente.
    const v = await sql(`select u.email, p.tipo, coalesce(c.status::text, i.status::text, '-') etapa,
      (select count(*) from contratos k where k.user_id = u.id and k.status <> 'cancelado') contratos,
      (select count(*) from disponibilidade_semanal s where s.user_id = u.id or lower(s.casa_ref) = lower(coalesce(p.vinculo_nome, '#'))) semana,
      (select count(*) from equipe_casa e where lower(e.casa_ref) = lower(coalesce(p.vinculo_nome, '#'))) equipe
      from auth.users u join perfis p on p.id = u.id left join cadastros_casas c on c.user_id = u.id left join inscricoes_artistas i on i.user_id = u.id
      where u.email in (${TODOS.map(lit).join(', ')}) order by p.tipo, u.email`);
    for (const x of v) console.log(`CONTA ${x.email.split('@')[0].padEnd(18)} ${x.tipo.padEnd(8)} etapa=${x.etapa} contratos=${x.contratos} semana=${x.semana} equipe=${x.equipe}`);
  }
} catch (e) { ok(false, 'quebrou: ' + limpo(e.message)); }
console.log(res.join('\n'));
