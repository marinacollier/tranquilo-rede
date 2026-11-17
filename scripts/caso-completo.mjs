// Caso completo de demonstração em PRODUÇÃO (pedido da Marina, 17/11/2026): uma casa e uma artista fictícias que já
// passaram pelo fluxo inteiro — inscrição e curadoria aprovada, Ficha completa e habilitada, combinados, equipe da casa,
// treinamento, disponibilidade, data criada no portal para 20/11/2026, contratos assinados hoje e passos em dia.
// Todos os dados são inventados. Só roda à mão no GitHub Actions (workflow caso-completo).
//
//   SUPABASE_ACCESS_TOKEN  token da Management API (secret do repositório)
//   SENHA_HASH             hash bcrypt da senha das duas contas (a senha não passa pelo repositório nem pelo log)
//   MODO                   criar (padrão: apaga o caso anterior e cria de novo) ou apagar
// O log imprime só OK/FALHA por passo.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const tok = process.env.SUPABASE_ACCESS_TOKEN, MODO = process.env.MODO || 'criar', HASH = (process.env.SENHA_HASH || '').trim();
if (!tok) { console.error('::error::Falta SUPABASE_ACCESS_TOKEN.'); process.exit(1); }
if (MODO === 'criar' && !/^\$2[aby]\$\d{2}\$.{53}$/.test(HASH)) { console.error('::error::SENHA_HASH precisa ser um hash bcrypt.'); process.exit(1); }
const cfg = await readFile(new URL('../src/config.js', import.meta.url), 'utf8');
const ref = cfg.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1], URL_SB = `https://${ref}.supabase.co`;
const limpo = (s) => String(s ?? '').replace(/[^\s@"']+@[^\s@"']+/g, '[e-mail]').replace(/eyJ[\w.-]{20,}|sb_(secret|publishable)_[\w-]+|\$2[aby]\$[^\s"']+/g, '[chave]').slice(0, 300);
async function sql(q) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, { method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q }) });
  const t = await r.text();
  if (!r.ok) throw new Error(`SQL HTTP ${r.status}: ${limpo(t)}`);
  return JSON.parse(t);
}
const lit = (s) => (s == null ? 'null' : `'${String(s).replace(/'/g, "''")}'`);
const js = (o) => `${lit(JSON.stringify(o))}::jsonb`;
const res = []; const ok = (c, m) => { res.push((c ? 'OK    ' : 'FALHA ') + m); if (!c) process.exitCode = 1; };

// ---------- o caso ----------
const EMAIL = { casa: 'casa.teste@tranquilo.com.br', artista: 'artista.teste@tranquilo.com.br', central: 'central.caso-teste@teste-e2e.invalid' };
const CASA = 'Casa Aurora (teste)', ARTISTA = 'Lia Moreno (teste)', DIA = '2026-11-20';
const FICHA = {
  nome: CASA, cidade_uf: 'São Paulo/SP', razao_social: 'Aurora Bar e Música Ltda.', cnpj: '12.345.678/0001-95', inscricao: '123.456.789.110',
  emite_nf: 'sim', endereco: 'Rua das Flores, 120, Vila Madalena, São Paulo/SP, 05435-010', complemento: 'Portão azul, ao lado da padaria',
  instagram: '@casaaurora.teste', site: 'https://casaaurora.example.com', telefone: '11 3333-4444', funcionamento: 'Quarta a domingo, 18h à 1h',
  como_chegar: 'Metrô Fradique Coutinho a 8 minutos a pé. Estacionamento conveniado na esquina (R$ 25). Rua iluminada e movimentada à noite.',
  dono_nome: 'Helena Duarte Ribeiro', dono_cpf: '123.456.789-09', dono_rg: '12.345.678-9', dono_nascimento: '14/03/1986',
  dono_email: EMAIL.casa, whatsapp: '(11) 98888-7777', dono_endereco: 'Rua Harmonia, 455, ap. 32, Vila Madalena, São Paulo/SP, 05435-000',
  rep_titular: 'Aurora Bar e Música Ltda.', rep_documento: '12.345.678/0001-95', rep_banco: 'Banco do Brasil', rep_tipo: 'corrente',
  rep_agencia: '1234-5', rep_conta: '98765-4', rep_pix: '12.345.678/0001-95',
  capacidade_sentado: '90', capacidade: '140', conforto: '60 almofadas, 20 tapetes, 30 banquetas e 10 mesas baixas', palco: '4 x 3 m, 40 cm de altura',
  camarim: 'tem', acessibilidade: ['rampa', 'banheiro', 'cadeirante'], acessibilidade_obs: 'Entrada com rampa pela lateral.', menores: 'responsavel',
  rider: 'Rider técnico da casa: PA Yamaha DXR12 (2), sub DXS15 (1), mesa Behringer X32 Compact, 4 retornos, 6 microfones SM58, 2 DI, 6 pedestais.',
  som: 'Yamaha DXR12 + sub DXS15', mesa: 'Behringer X32 Compact, 16 canais', microfones: 'sim', pedestais: 'sim',
  ligar_palco: '2 DI ativas, 4 retornos, 1 amplificador de baixo, 2 banquetas e cabos P10/XLR suficientes para trio.', luz: 'Luz de palco com 4 PAR LED e plateia em penumbra.',
  bar_cozinha: 'Bar com drinks e cerveja; cozinha com petiscos até 23h. Atendimento no balcão.', ticket_medio: 'R$ 75', caixa_sistema: 'Stone, com relatório por noite',
  exclusividade_bebida: 'Sem exclusividade', ticketeira: 'Usa a Ingresse, sem exclusividade', dias_semana: ['quinta', 'sexta', 'sabado'],
  duvidas_guia: 'Li o Guia inteiro. Quero conversar sobre a divisão do bar nas noites de sábado.',
};
const COMBINADOS = { bilheteria: { casa: 30, artista: 50, tranquilo: 20 }, aeb: { casa: 88, tranquilo: 12 },
  contatos: { gui: '11 90000-0001', isa: '11 90000-0002', bruno: '11 90000-0003' },
  bonificacao: { tem: 'sim', marca: 'Estrella Galicia', periodo: '3 meses a partir da primeira data', combinados: '2 caixas por noite Tranquilo' } };
const INSC = {
  nome_artistico: ARTISTA, cidade_base: 'São Paulo', estado: 'SP', generos: 'MPB, neo-soul. Referências: Luedji Luna, Tim Bernardes, Céu.',
  formato_interesse: 'descubra', release: 'Lia Moreno é cantora e compositora paulistana. Mistura MPB e neo-soul em canções sobre cidade e afeto. Lançou o EP "Janela Aberta" em 2025 e circula por casas de música autoral de São Paulo.',
  foto: 'https://picsum.photos/seed/liamoreno/1200/800', spotify: 'https://open.spotify.com/artist/0000000000000000000000', youtube: 'https://www.youtube.com/@liamoreno-teste',
  outro_link: 'https://liamoreno.bandcamp.com', instagram: '@liamoreno.teste', ouvintes_mensais: '18500', seguidores_instagram: '24300',
  formacao: 'trio', integrantes: '3', rider_tipo: 'circulavel', rider_link: 'https://example.com/rider-lia-moreno.pdf', tecnico_proprio: 'nao',
  necessidades: 'Teclado 88 teclas com estante (a artista leva), 2 DI, 3 retornos.', cidades_interesse: ['São Paulo', 'Campinas', 'Santos'],
  outras_cidades: 'Sorocaba', disponibilidade: 'Quintas, sextas e sábados à noite.', equipe_viagem: '3', aceita_bonus: 'true', cache_minimo: '600',
  contato_producao: 'Rafa Prado (produção) · 11 97777-6666', whatsapp: '(11) 96666-5555', aceite: 'true', restricoes: 'Uma pessoa vegetariana',
};
const DADOS_ARTISTA_CONTRATO = { nome_completo: 'Lia Moreno Santos', cpf: '987.654.321-00', rg: '98.765.432-1', nacionalidade: 'brasileira', profissao: 'musicista',
  endereco: 'Rua Girassol, 88, Pinheiros, São Paulo/SP, 05433-001', chave_pix: 'lia.moreno.teste@example.com', email: EMAIL.artista, telefone: '11 96666-5555',
  restricoes: 'Uma pessoa vegetariana', quantidade: '3', estado_civil: 'solteira' };

// ---------- apagar (o caso anterior, se existir) ----------
async function apagar() {
  await sql(`drop table if exists caso_ids;
create temp table caso_ids as select id from auth.users where email in (${Object.values(EMAIL).map(lit).join(', ')});
do $$ begin
  alter table contratos disable trigger trg_contrato_apagar;
  delete from contratos where user_id in (select id from caso_ids);
  alter table contratos enable trigger trg_contrato_apagar;
end $$;
delete from datas_portal where casa_nome = ${lit(CASA)};
delete from disponibilidade_casa where casa_ref = ${lit(CASA)};
delete from disponibilidade_semanal where casa_ref = ${lit(CASA)} or user_id in (select id from caso_ids);
delete from equipe_casa where casa_ref = ${lit(CASA)};
delete from trilhas where casa_ref = ${lit(CASA)};
delete from checklist where user_id in (select id from caso_ids);
delete from inscricoes_artistas where user_id in (select id from caso_ids);
delete from cadastros_casas where user_id in (select id from caso_ids);
do $$ declare fk record; begin
  for fk in select c.conrelid::regclass tabela, a.attname coluna, a.attnotnull obrig
            from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
            where c.contype = 'f' and c.confrelid in ('public.perfis'::regclass, 'auth.users'::regclass)
              and c.confdeltype in ('a', 'r') and array_length(c.conkey, 1) = 1 loop
    if fk.obrig then execute format('delete from %s where %I in (select id from caso_ids)', fk.tabela, fk.coluna);
    else execute format('update %s set %I = null where %I in (select id from caso_ids)', fk.tabela, fk.coluna, fk.coluna); end if;
  end loop;
end $$;
delete from auth.users where id in (select id from caso_ids);`);
  const r = await sql(`select count(*)::int n from auth.users where email in (${Object.values(EMAIL).map(lit).join(', ')})`);
  ok(r[0].n === 0, 'caso anterior apagado');
}

try {
  if (MODO === 'criar' || MODO === 'apagar') await apagar();
  if (MODO === 'criar') {
    const chaves = await (await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${tok}` } })).json();
    const serv = (chaves.find?.((k) => k.name === 'service_role') || chaves.find?.((k) => k.type === 'secret'))?.api_key;
    if (!serv) throw new Error('chave de serviço não encontrada');
    console.log(`::add-mask::${serv}`);
    const H = { apikey: serv, 'Content-Type': 'application/json', ...(serv.startsWith('eyJ') ? { Authorization: `Bearer ${serv}` } : {}) };
    const id = {};
    for (const [papel, nome, tipo] of [['central', 'Central (caso de teste)', 'artista'], ['casa', 'Helena Duarte Ribeiro', 'casa'], ['artista', ARTISTA, 'artista']]) {
      const r = await fetch(`${URL_SB}/auth/v1/admin/users`, { method: 'POST', headers: H, body: JSON.stringify({ email: EMAIL[papel], ...(papel === 'central' ? { password: createHash('sha256').update(String(Math.random()) + Date.now()).digest('hex') } : { password_hash: HASH }), email_confirm: true, user_metadata: { nome, tipo } }) });
      const j = await r.json();
      if (!r.ok) throw new Error(`criar conta ${papel}: HTTP ${r.status} ${j.msg || j.message || j.error_code || ''}`);
      id[papel] = j.id;
    }
    // A senha das duas contas vem do hash (garante mesmo se a API ignorar password_hash).
    await sql(`update auth.users set encrypted_password = ${lit(HASH)} where id in (${lit(id.casa)}, ${lit(id.artista)})`);
    await sql(`update perfis set tipo = 'equipe', areas = '{agenda,operacoes}', tutorial_visto_em = now() where id = ${lit(id.central)};
update perfis set nome = 'Helena Duarte Ribeiro', whatsapp = '11 98888-7777', senha_definida = true, tutorial_visto_em = now() where id = ${lit(id.casa)};
update perfis set nome = ${lit(ARTISTA)}, whatsapp = '11 96666-5555', senha_definida = true, tutorial_visto_em = now(), vinculo_nome = ${lit(ARTISTA)} where id = ${lit(id.artista)};`);
    ok(true, 'contas da casa e da artista criadas (e a conta da Central que aprova)');

    // Curadoria: a artista envia; a Central aprova.
    const imp = `select set_config('request.jwt.claims', ${lit(JSON.stringify({ sub: id.central, role: 'authenticated' }))}, true), set_config('request.jwt.claim.sub', ${lit(id.central)}, true);`;
    await sql(`insert into inscricoes_artistas (user_id, dados, status) values (${lit(id.artista)}, ${js(INSC)}, 'em_curadoria');`);
    await sql(`${imp} update inscricoes_artistas set status = 'aprovada', parecer = 'Inscrição aprovada! Repertório autoral forte e rider circulável. Bem-vinda à Rede Tranquilo 🌿' where user_id = ${lit(id.artista)};`);
    const ins = await sql(`select status, score from inscricoes_artistas where user_id = ${lit(id.artista)}`);
    ok(ins[0]?.status === 'aprovada', `inscrição enviada e aprovada na curadoria (pré-curadoria ${ins[0]?.score ?? '?'})`);

    // Ficha da casa completa e habilitada, com combinados.
    await sql(`insert into cadastros_casas (user_id, dados, status, enviado_em) values (${lit(id.casa)}, ${js(FICHA)}, 'em_analise', now() - interval '12 days');`);
    await sql(`${imp} update cadastros_casas set status = 'habilitada', classificacao = 'confiavel', parecer = 'Ficha completa. Casa habilitada para receber o Tranquilo.', combinados = ${js(COMBINADOS)} where user_id = ${lit(id.casa)};`);
    const ca = await sql(`select c.id, c.status, p.vinculo_nome from cadastros_casas c join perfis p on p.id = c.user_id where c.user_id = ${lit(id.casa)}`);
    if (ca[0] && !ca[0].vinculo_nome) await sql(`update perfis set vinculo_nome = ${lit(CASA)} where id = ${lit(id.casa)}`);
    ok(ca[0]?.status === 'habilitada', 'Ficha da casa completa, habilitada e com combinados');
    const casaId = ca[0].id;

    // Equipe da casa, treinamento e disponibilidade.
    const eq = [['Helena Duarte Ribeiro', ['lider'], false], ['Caio Mendes', ['anfitriao'], false], ['Bia Lopes', ['social_media'], false], ['Davi Rocha', ['som'], false], ['Nina Alves', ['porta'], false], ['Téo Santos', ['anfitriao'], true]];
    await sql(`insert into equipe_casa (casa_ref, nome, whatsapp, funcoes, reserva, criado_por) values ${eq.map(([n, f, r], i) => `(${lit(CASA)}, ${lit(n)}, ${lit(`11 9${String(1000 + i).padStart(4, '0')}-${String(2000 + i)}`)}, ${lit(`{${f.join(',')}}`)}, ${r}, ${lit(id.casa)})`).join(', ')};`);
    const etapas = ['nota', 'resp_espaco', 'docs', 'leitura', 'duvidas_ops', 'proposta', 'data_aprovada', 'ingresse', 'campanha', 'duvidas_mkt', 'tripe', 'equipe_ok', 'porta_ingresse', 'planilhas', 'homologacao', 'conferido'];
    await sql(`insert into trilhas (casa_ref, inicio, nota_passagem, criado_por) values (${lit(CASA)}, '2026-11-03', 'Casa organizada, equipe completa e muita vontade de começar. Atenção ao som do baixo no palco pequeno.', ${lit(id.central)});
insert into trilha_marcos (casa_ref, etapa, feito_por, feito_em) values ${etapas.map((e, i) => `(${lit(CASA)}, ${lit(e)}, ${lit(id.central)}, timestamp '2026-11-03 14:00' + interval '${i * 12} hours')`).join(', ')};`);
    const dias = (inicio, n) => Array.from({ length: n }, (_, i) => { const d = new Date(`${inicio}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + i); return d.toISOString().slice(0, 10); });
    const livres = dias('2026-11-18', 45).filter((d) => [4, 5, 6].includes(new Date(`${d}T12:00:00Z`).getUTCDay()));
    await sql(`insert into disponibilidade_casa (casa_ref, dia, situacao, atualizado_por) values ${livres.map((d) => `(${lit(CASA)}, ${lit(d)}, ${d === '2026-12-24' || d === '2026-12-25' ? "'indisponivel'" : "'disponivel'"}, ${lit(id.casa)})`).join(', ')};
insert into disponibilidade_semanal (casa_ref, dias, atualizado_por) values (${lit(CASA)}, '{4,5,6}', ${lit(id.casa)});
insert into disponibilidade_artista (user_id, dia, situacao) values ${livres.map((d) => `(${lit(id.artista)}, ${lit(d)}, 'disponivel')`).join(', ')};
insert into disponibilidade_semanal (user_id, dias, atualizado_por) values (${lit(id.artista)}, '{4,5,6}', ${lit(id.artista)});`);
    ok(true, `equipe da casa (6 pessoas, com reserva), treinamento concluído e ${livres.length} dias livres de casa e artista`);

    // A data do show, criada no portal pela Isa (Central).
    const arts = [{ nome: 'Duo Maré (teste)', user_id: null, ordem: 1, producao: false, whatsapp: '(11) 95555-1111' }, { nome: 'Joca Vidal (teste)', user_id: null, ordem: 2, producao: false, whatsapp: '(11) 95555-2222' }, { nome: ARTISTA, user_id: id.artista, ordem: 3, producao: false, whatsapp: '(11) 96666-5555' }];
    const dp = await sql(`${imp} insert into datas_portal (dia, abertura, produto, casa_id, casa_nome, cidade, artistas, link_ingressos, observacao, criado_por) values (${lit(DIA)}, '19:00', 'Descubra', ${lit(casaId)}, ${lit(CASA)}, 'São Paulo/SP', ${js(arts)}, 'https://www.ingresse.com/tranquilo-descubra-teste', 'Caso de teste: noite Descubra completa, com três artistas.', ${lit(id.central)}) returning id;`);
    const ev = 'p:' + dp.at(-1).id;
    ok(!!dp.at(-1)?.id, `data criada no portal: Tranquilo Descubra em ${DIA.split('-').reverse().join('/')} na ${CASA}`);

    // Contratos, assinados hoje: o da artista para a data e o da parceria da casa.
    global.window = {}; eval((await readFile(new URL('../src/contrato.js', import.meta.url), 'utf8')) + ';global.TQC = TQContrato;');
    const TQ = global.TQC;
    const modelos = await sql(`select id, nome, texto from modelos_contrato order by criado_em desc`);
    const achar = (re) => modelos.find((m) => re.test(m.nome)) || null;
    const mArt = achar(/artista.*descubra/i) || achar(/artista/i), mCasa = achar(/^casa|parceria/i);
    const hoje = new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' });
    const evento = { d: DIA, c: 'São Paulo', h: CASA, m: 'Descubra', n: `Tranquilo Descubra — São Paulo`, noite: { inicio: '19:00' } };
    async function contrato(m, conta, tipo, dados, extraDados, evId, titulo, nome) {
      if (!m) { ok(false, `modelo de contrato ${tipo} não encontrado`); return; }
      const { texto, campos } = TQ.campos(m.texto);
      const sug = TQ.sugestoes(evId ? evento : null, { vinculo_nome: tipo === 'artista' ? ARTISTA : CASA });
      const cad = TQ.doCadastro(campos, tipo, dados, { combinados: tipo === 'casa' ? COMBINADOS : null, email: EMAIL[tipo] });
      const valores = {};
      for (const c of campos) valores[c.chave] = sug[c.chave] || cad[c.chave] || extraDados[c.chave] || extraDados[Object.keys(extraDados).find((k) => c.chave.includes(k))] || (/cache/.test(c.chave) ? '600,00' : /data/.test(c.chave) ? hoje : 'Conforme combinado');
      valores.data_assinatura = hoje;
      const final = TQ.preencher(texto, campos, valores);
      const hash = createHash('sha256').update(final).digest('hex');
      await sql(`insert into contratos (user_id, evento_id, titulo, modelo_id, texto, campos, dados, status, lido_fim_em, texto_final, hash, assinado_nome, assinado_em, ip, navegador, criado_por, criado_em)
values (${lit(conta)}, ${lit(evId)}, ${lit(titulo.slice(0, 160))}, ${lit(m.id)}, ${lit(final)}, '[]'::jsonb, ${js(valores)}, 'assinado', now() - interval '20 minutes', ${lit(final)}, ${lit(hash)}, ${lit(nome)}, now(), '200.100.50.25', 'Caso de teste (navegador simulado)', ${lit(id.central)}, now() - interval '2 hours');`);
      ok(true, `contrato ${tipo === 'artista' ? 'da artista para a data' : 'de parceria da casa'} assinado hoje (${campos.length} campos preenchidos)`);
    }
    await contrato(mArt, id.artista, 'artista', INSC, DADOS_ARTISTA_CONTRATO, ev, `${mArt?.nome || 'Artista'} · ${ARTISTA} · São Paulo 20/11`, 'Lia Moreno Santos');
    await contrato(mCasa, id.casa, 'casa', FICHA, { ...DADOS_ARTISTA_CONTRATO, nome_completo: FICHA.dono_nome, cpf: FICHA.dono_cpf, rg: FICHA.dono_rg, nacionalidade: 'brasileira', profissao: 'empresária', endereco: FICHA.dono_endereco, email: EMAIL.casa, telefone: FICHA.whatsapp }, null, `${mCasa?.nome || 'Casa'} · ${CASA}`, FICHA.dono_nome);

    // Passos em dia: tudo o que vencia até hoje está feito (o da véspera e o do dia ainda não).
    const regras = await readFile(new URL('../src/regras.js', import.meta.url), 'utf8');
    const lista = (nome) => [...regras.slice(regras.indexOf(`const ${nome} = [`)).split('];')[0].matchAll(/\["([a-z_0-9]+)",\s*(-?\d+)/g)].map(([, k, d]) => [k, +d]);
    const feitos = (pid, l) => l.filter(([, d]) => d <= -3).map(([k]) => `(${lit(pid)}, ${lit(ev)}, ${lit(k)}, true, now() - interval '1 day')`);
    const linhas = [...feitos(id.artista, lista('PASSOS_ARTISTA')), ...feitos(id.casa, lista('PASSOS_CASA'))];
    await sql(`insert into checklist (user_id, evento_id, item, feito, atualizado_em) values ${linhas.join(', ')} on conflict do nothing;`);
    ok(linhas.length > 10, `${linhas.length} passos da data marcados como feitos (casa e artista)`);
  }
  // Variedade para Gui e Isa testarem (pedido da Marina, 17/11/2026): 10 casas e 10 artistas de TESTE, fichas completas,
  // cidades e dias diferentes. Metade das casas espera a habilitação (Gui), metade habilitada; metade dos artistas espera
  // a curadoria (Isa), metade aprovada com disponibilidade. Recriar apaga a leva anterior (e-mails teste.*@teste-e2e.invalid).
  if (MODO === 'variedade') {
    const chaves = await (await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${tok}` } })).json();
    const serv = (chaves.find?.((k) => k.name === 'service_role') || chaves.find?.((k) => k.type === 'secret'))?.api_key;
    console.log(`::add-mask::${serv}`);
    const H = { apikey: serv, 'Content-Type': 'application/json', ...(serv.startsWith('eyJ') ? { Authorization: `Bearer ${serv}` } : {}) };
    const dv = (d, w) => { const s = d.reduce((a, x, i) => a + x * w[i], 0) % 11; return s < 2 ? 0 : 11 - s; };
    const cpf = (n) => { const d = String(100000000 + n * 7919).slice(0, 9).split('').map(Number); d.push(dv(d, [10, 9, 8, 7, 6, 5, 4, 3, 2])); d.push(dv(d, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2])); const t = d.join(''); return `${t.slice(0, 3)}.${t.slice(3, 6)}.${t.slice(6, 9)}-${t.slice(9)}`; };
    const cnpj = (n) => { const d = (String(10000000 + n * 104729).slice(0, 8) + '0001').split('').map(Number); d.push(dv(d, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])); d.push(dv(d, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])); const t = d.join(''); return `${t.slice(0, 2)}.${t.slice(2, 5)}.${t.slice(5, 8)}/${t.slice(8, 12)}-${t.slice(12)}`; };
    const CID = [['São Paulo', 'SP', '11'], ['Campinas', 'SP', '19'], ['Santos', 'SP', '13'], ['Belo Horizonte', 'MG', '31'], ['Recife', 'PE', '81'], ['Florianópolis', 'SC', '48'], ['Curitiba', 'PR', '41'], ['Salvador', 'BA', '71'], ['Rio de Janeiro', 'RJ', '21'], ['Porto Alegre', 'RS', '51']];
    const DIAS = [['quinta', 'sexta', 'sabado'], ['sexta', 'sabado'], ['quarta', 'quinta'], ['sabado', 'domingo'], ['terca', 'quarta', 'quinta'], ['sexta'], ['quinta', 'sabado'], ['domingo'], ['quarta', 'sexta'], ['sabado']];
    const NUM = { domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6 };
    const CASAS = ['Bar do Farol', 'Quintal Azul', 'Sala Jabuticaba', 'Varanda 21', 'Galpão Maré', 'Casa Ipê', 'Porão da Serra', 'Terraço Aurora', 'Armazém 9', 'Lume Bar'];
    const ARTS = [['Clara Neves', 'MPB, bossa nova', 'solo'], ['Duo Brisa', 'folk, indie', 'duo'], ['Trio Caju', 'samba, choro', 'trio'], ['Léo Vento', 'soul, R&B', 'solo'], ['Mari Ramos', 'pop, MPB', 'solo'], ['Banda Lua Nova', 'rock alternativo', 'banda'], ['Tom Serra', 'violão, instrumental', 'solo'], ['Ana Céu', 'jazz, MPB', 'duo'], ['Juca Mar', 'forró, xote', 'trio'], ['Bia Sol', 'indie pop', 'solo']];
    await sql(`create temp table if not exists var_ids as select id from auth.users where email like 'teste.%@teste-e2e.invalid';
do $$ begin alter table contratos disable trigger trg_contrato_apagar; delete from contratos where user_id in (select id from auth.users where email like 'teste.%@teste-e2e.invalid'); alter table contratos enable trigger trg_contrato_apagar; end $$;
delete from disponibilidade_casa where casa_ref like 'TESTE · %'; delete from disponibilidade_semanal where casa_ref like 'TESTE · %' or user_id in (select id from auth.users where email like 'teste.%@teste-e2e.invalid');
delete from disponibilidade_artista where user_id in (select id from auth.users where email like 'teste.%@teste-e2e.invalid');
delete from inscricoes_artistas where user_id in (select id from auth.users where email like 'teste.%@teste-e2e.invalid');
delete from cadastros_casas where user_id in (select id from auth.users where email like 'teste.%@teste-e2e.invalid');
delete from auth.users where email like 'teste.%@teste-e2e.invalid';`);
    const conta = async (user, nome, tipo) => { const r = await fetch(`${URL_SB}/auth/v1/admin/users`, { method: 'POST', headers: H, body: JSON.stringify({ email: `${user}@teste-e2e.invalid`, password: createHash('sha256').update(String(Math.random())).digest('hex'), email_confirm: true, user_metadata: { nome, tipo } }) }); const j = await r.json(); if (!r.ok) throw new Error(`criar ${user}: HTTP ${r.status}`); await sql(`update perfis set nome = ${lit(nome)}, tutorial_visto_em = now(), senha_definida = true where id = ${lit(j.id)}`); return j.id; };
    const central = (await sql(`select id from perfis where nome = 'Central (caso de teste)' limit 1`))[0]?.id;
    const imp = central ? `select set_config('request.jwt.claims', ${lit(JSON.stringify({ sub: central, role: 'authenticated' }))}, true), set_config('request.jwt.claim.sub', ${lit(central)}, true);` : '';
    const proximos = (dias) => { const out = []; for (let i = 1; i <= 42; i++) { const d = new Date(Date.now() + i * 864e5); if (dias.some((x) => NUM[x] === d.getUTCDay())) out.push(d.toISOString().slice(0, 10)); } return out; };
    let nc = 0, na = 0;
    for (let i = 0; i < 10; i++) {
      const [cid, uf, ddd] = CID[i], nome = `TESTE · ${CASAS[i]}`, dias = DIAS[i];
      const id = await conta(`teste.casa${i + 1}`, `TESTE · Dona ${CASAS[i]}`, 'casa');
      const d = { ...FICHA, nome, cidade_uf: `${cid}/${uf}`, cnpj: cnpj(i + 1), rep_documento: cnpj(i + 1), rep_pix: cnpj(i + 1), razao_social: `${CASAS[i]} Música Ltda. (TESTE)`, endereco: `Rua de Teste, ${100 + i * 7}, Centro, ${cid}/${uf}`, instagram: `@teste.${CASAS[i].toLowerCase().replace(/[^a-z]/g, '')}`,
        dono_nome: `TESTE Dona ${CASAS[i]}`, dono_cpf: cpf(i + 1), dono_email: `teste.casa${i + 1}@teste-e2e.invalid`, whatsapp: `(${ddd}) 9${String(8000 + i)}-${String(1000 + i)}`, telefone: `(${ddd}) 3${String(300 + i)}-${String(4000 + i)}`,
        capacidade_sentado: String(60 + i * 15), capacidade: String(100 + i * 20), dias_semana: dias };
      const hab = i % 2 === 0;
      await sql(`insert into cadastros_casas (user_id, dados, status, enviado_em) values (${lit(id)}, ${js(d)}, 'em_analise', now() - interval '${2 + i} days');`);
      if (hab) await sql(`${imp} update cadastros_casas set status = 'habilitada', parecer = 'Ficha completa (TESTE).', combinados = ${js(COMBINADOS)} where user_id = ${lit(id)};`);
      await sql(`update perfis set vinculo_nome = ${lit(nome)} where id = ${lit(id)} and vinculo_nome is null;
insert into disponibilidade_semanal (casa_ref, dias, atualizado_por) values (${lit(nome)}, '{${dias.map((x) => NUM[x]).join(',')}}', ${lit(id)});
insert into disponibilidade_casa (casa_ref, dia, situacao, atualizado_por) values ${proximos(dias).map((x) => `(${lit(nome)}, ${lit(x)}, 'disponivel', ${lit(id)})`).join(', ')};`);
      nc++;
      const [an, gen, form] = ARTS[i], anome = `TESTE · ${an}`, adias = DIAS[(i + 3) % 10];
      const aid = await conta(`teste.artista${i + 1}`, anome, 'artista');
      const ins = { ...INSC, nome_artistico: anome, cidade_base: cid, estado: uf, generos: `${gen}.`, formacao: form, integrantes: String(form === 'solo' ? 1 : form === 'duo' ? 2 : form === 'trio' ? 3 : 5),
        instagram: `@teste.${an.toLowerCase().replace(/[^a-z]/g, '')}`, ouvintes_mensais: String(500 + i * 4800), seguidores_instagram: String(900 + i * 3700), cidades_interesse: [cid, CID[(i + 1) % 10][0]], outras_cidades: '',
        cache_minimo: String(400 + i * 60), whatsapp: `(${ddd}) 9${String(7000 + i)}-${String(2000 + i)}`, disponibilidade: `Prefere ${adias.join(', ')}.`,
        release: `${anome} é um projeto de ${gen} criado para testes do portal da Rede Tranquilo. Toca em casas de música autoral de ${cid} e região, com repertório próprio e releituras, e quer circular pela rede para encontrar público novo em outras cidades.` };
      const apr = i % 2 === 0;
      await sql(`insert into inscricoes_artistas (user_id, dados, status) values (${lit(aid)}, ${js(ins)}, 'em_curadoria');`);
      if (apr) await sql(`${imp} update inscricoes_artistas set status = 'aprovada', parecer = 'Aprovada (TESTE).' where user_id = ${lit(aid)};
update perfis set vinculo_nome = ${lit(anome)} where id = ${lit(aid)};
insert into disponibilidade_semanal (user_id, dias, atualizado_por) values (${lit(aid)}, '{${adias.map((x) => NUM[x]).join(',')}}', ${lit(aid)});
insert into disponibilidade_artista (user_id, dia, situacao) values ${proximos(adias).map((x) => `(${lit(aid)}, ${lit(x)}, 'disponivel')`).join(', ')};`);
      na++;
    }
    ok(nc === 10 && na === 10, `${nc} casas e ${na} artistas TESTE criados (5 casas esperando habilitação, 5 habilitadas; 5 artistas esperando curadoria, 5 aprovados com disponibilidade)`);
  }
  // Curadoria para a Isa testar (pedido da Marina, 17/11/2026): 3 inscrições fake esperando a curadoria.
  if (MODO === 'curadoria') {
    const chaves = await (await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${tok}` } })).json();
    const serv = (chaves.find?.((k) => k.name === 'service_role') || chaves.find?.((k) => k.type === 'secret'))?.api_key;
    console.log(`::add-mask::${serv}`);
    const H = { apikey: serv, 'Content-Type': 'application/json', ...(serv.startsWith('eyJ') ? { Authorization: `Bearer ${serv}` } : {}) };
    const BASE = { estado: 'SP', formato_interesse: 'descubra', tecnico_proprio: 'nao', aceite: 'true', rider_tipo: 'circulavel', aceita_bonus: 'true' };
    const casos = [
      ['curadoria.forte', 'Nina Sol (teste)', { ...BASE, nome_artistico: 'Nina Sol (teste)', cidade_base: 'São Paulo', generos: 'MPB, soul. Referências: Liniker, Céu, Xênia França.', release: 'Nina Sol é cantora e compositora paulistana que mistura MPB e soul em canções sobre afeto e cidade. Lançou dois EPs, circula por casas de música autoral de São Paulo e Campinas e tem uma comunidade fiel que acompanha cada show de perto.', foto: 'https://picsum.photos/seed/ninasol/1200/800', spotify: 'https://open.spotify.com/artist/1111111111111111111111', youtube: 'https://www.youtube.com/@ninasol-teste', instagram: '@ninasol.teste', ouvintes_mensais: '42000', seguidores_instagram: '38000', formacao: 'duo', integrantes: '2', cidades_interesse: ['São Paulo', 'Campinas', 'Santos'], equipe_viagem: '2', cache_minimo: '500', whatsapp: '(11) 97777-1111' }],
      ['curadoria.media', 'Rafa Tom (teste)', { ...BASE, nome_artistico: 'Rafa Tom (teste)', cidade_base: 'Belo Horizonte', estado: 'MG', generos: 'Indie, folk.', release: 'Rafa Tom faz indie folk em português, com violão e voz. Começou tocando em bares de Belo Horizonte e lançou o primeiro single em 2025. Quer circular pela rede para encontrar público novo nas cidades do interior e na capital paulista.', spotify: 'https://open.spotify.com/artist/2222222222222222222222', instagram: '@rafatom.teste', ouvintes_mensais: '3200', seguidores_instagram: '5100', formacao: 'solo', integrantes: '1', cidades_interesse: ['Belo Horizonte'], equipe_viagem: '1', cache_minimo: '400', whatsapp: '(31) 98888-2222' }],
      ['curadoria.fraca', 'Banda Eco (teste)', { ...BASE, nome_artistico: 'Banda Eco (teste)', cidade_base: 'Recife', estado: 'PE', generos: 'Rock.', release: 'A Banda Eco é um quinteto de rock de Recife com guitarras, bateria completa e metais. Ensaia há dois anos, tem um show autoral de uma hora e meia e quer estrear fora do estado tocando em casas grandes com estrutura completa de palco e luz.', instagram: '@bandaeco.teste', ouvintes_mensais: '150', seguidores_instagram: '900', formacao: 'banda', integrantes: '5', rider_tipo: 'especial', cidades_interesse: ['Recife'], equipe_viagem: '7', cache_minimo: '3000', aceita_bonus: 'false', whatsapp: '(81) 99999-3333' }],
    ];
    await sql(`do $$ begin alter table contratos disable trigger trg_contrato_apagar; delete from contratos where user_id in (select id from auth.users where email like 'curadoria.%@teste-e2e.invalid'); alter table contratos enable trigger trg_contrato_apagar; end $$;
delete from inscricoes_artistas where user_id in (select id from auth.users where email like 'curadoria.%@teste-e2e.invalid');
delete from auth.users where email like 'curadoria.%@teste-e2e.invalid';`);
    for (const [user, nome, dados] of casos) {
      const r = await fetch(`${URL_SB}/auth/v1/admin/users`, { method: 'POST', headers: H, body: JSON.stringify({ email: `${user}@teste-e2e.invalid`, password: createHash('sha256').update(String(Math.random())).digest('hex'), email_confirm: true, user_metadata: { nome, tipo: 'artista' } }) });
      const j = await r.json(); if (!r.ok) throw new Error(`criar ${user}: HTTP ${r.status}`);
      await sql(`update perfis set nome = ${lit(nome)}, tutorial_visto_em = now() where id = ${lit(j.id)};
insert into inscricoes_artistas (user_id, dados, status) values (${lit(j.id)}, ${js(dados)}, 'em_curadoria');`);
    }
    const n = await sql(`select count(*)::int n from inscricoes_artistas where status = 'em_curadoria'`);
    ok(n[0].n >= 3, `${n[0].n} inscrições esperando a curadoria (3 de teste: forte, média e fraca)`);
    const isa = await sql(`update perfis set areas = '{agenda}' where tipo = 'equipe' and nome ilike 'Isabella%' and (areas is null or areas = '{}') returning id`);
    const isa2 = await sql(`select coalesce(array_to_string(areas, ','), '') a from perfis where tipo = 'equipe' and nome ilike 'Isabella%'`);
    ok(isa2.length === 1, `conta da Isa com área: ${isa2[0]?.a || '(nenhuma)'}${isa.length ? ' (marcada agora)' : ''}`);
  }
  // Nome da conta de administração da Marina (pedido dela, 17/11/2026).
  if (MODO === 'arrumar') { const r = await sql(`update perfis set nome = 'Marina Collier' where tipo = 'adm' and lower(nome) = 'marina teste artista' returning id`); ok(r.length === 1, `nome da administração atualizado (${r.length})`); }
  // Arrumação pedida pela Marina: sai o modelo de contrato de teste dela; contratos pendentes ganham os dados da Ficha/inscrição.
  if (MODO === 'criar' || MODO === 'arrumar') {
    const r = await sql(`do $$ begin
  alter table contratos disable trigger trg_contrato_travado;
  update contratos set modelo_id = null where modelo_id in (select id from modelos_contrato where nome ilike 'Artista teste%');
  alter table contratos enable trigger trg_contrato_travado;
end $$;
delete from modelos_contrato where nome ilike 'Artista teste%' returning id;`);
    ok(true, `modelo de contrato de teste removido (${r.length})`);
    global.window = {}; if (!global.TQC) eval((await readFile(new URL('../src/contrato.js', import.meta.url), 'utf8')) + ';global.TQC = TQContrato;');
    const pend = await sql(`select c.id, c.campos, c.dados, p.tipo, p.email, i.dados ins, k.dados ficha, k.combinados
      from contratos c join perfis p on p.id = c.user_id left join inscricoes_artistas i on i.user_id = c.user_id left join cadastros_casas k on k.user_id = c.user_id
      where c.status = 'enviado' and (c.titulo ilike '%teste%' or p.email like '%teste%')`);  // só contratos de teste: nada real é mexido
    let n = 0;
    for (const c of pend) {
      const tipo = c.tipo === 'casa' ? 'casa' : 'artista', campos = c.campos || [];
      const cad = global.TQC.doCadastro(campos, tipo, tipo === 'casa' ? c.ficha : c.ins, { combinados: c.combinados, email: c.email });
      const novos = Object.fromEntries(Object.entries(cad).filter(([k]) => !String(c.dados?.[k] ?? '').trim()));
      if (!Object.keys(novos).length) continue;
      await sql(`update contratos set dados = dados || ${js(novos)} where id = ${lit(c.id)} and status = 'enviado'`); n++;
    }
    ok(true, `${n} de ${pend.length} contratos pendentes preenchidos com a Ficha ou a inscrição`);
  }
} catch (e) { ok(false, 'quebrou: ' + limpo(e.message)); }
console.log(res.join('\n'));
