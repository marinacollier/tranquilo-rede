// Demonstração com casos REAIS na produção (Marina, 18/11/2026, reunião com o Thales): uma casa (Café Maritaka, Campinas)
// e uma artista (Analu Sampaio) que têm data real juntas (Tranquilo Apresenta — Campinas, 04/12/2026), com contas de acesso
// em e-mails da Marina. Ficha e inscrição com o que o Notion tem (sem dados sensíveis), data no portal e contratos enviados.
// E-mails chegam em base64 (EMAILS_B64 = "casa,artista") e não aparecem no log.
import { readFile } from 'node:fs/promises';
const tok = process.env.SUPABASE_ACCESS_TOKEN, HASH = (process.env.SENHA_HASH || '').trim();
const [EC, EA] = Buffer.from(process.env.EMAILS_B64 || '', 'base64').toString('utf8').split(',').map((x) => x.trim().toLowerCase());
if (!tok || !EC || !EA || !/^\$2[aby]\$/.test(HASH)) { console.error('::error::faltam parâmetros'); process.exit(1); }
console.log(`::add-mask::${EC}`); console.log(`::add-mask::${EA}`);
const ref = (await readFile(new URL('../src/config.prd.js', import.meta.url), 'utf8')).match(/https:\/\/([a-z0-9]+)\.supabase\.co/)[1];
const limpo = (s) => String(s ?? '').replace(/[^\s@"']+@[^\s@"']+/g, '[e-mail]').replace(/\$2[aby]\$[^\s"']+/g, '[h]').slice(0, 400);
async function sql(q) { const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, { method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q }) }); const t = await r.text(); if (!r.ok) throw new Error(limpo(t)); return JSON.parse(t); }
const lit = (s) => (s == null ? 'null' : `'${String(s).replace(/'/g, "''")}'`), js = (o) => `${lit(JSON.stringify(o))}::jsonb`;
const ok = (m) => console.log('OK    ' + m);
const ks = await (await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${tok}` } })).json();
const sv = (ks.find((k) => k.name === 'service_role') || ks.find((k) => k.type === 'secret')).api_key; console.log(`::add-mask::${sv}`);
const H = { apikey: sv, 'Content-Type': 'application/json', ...(sv.startsWith('eyJ') ? { Authorization: `Bearer ${sv}` } : {}) };
const CASA = 'Café Maritaka', ART = 'Analu Sampaio', DIA = '2026-12-04';
// recria do zero
await sql(`delete from contratos where user_id in (select id from auth.users where lower(email) in (${lit(EC)}, ${lit(EA)}));
delete from datas_portal where casa_nome = ${lit(CASA)} and dia = ${lit(DIA)};
delete from disponibilidade_semanal where casa_ref = ${lit(CASA)} or user_id in (select id from auth.users where lower(email) in (${lit(EC)}, ${lit(EA)}));
delete from equipe_casa where casa_ref = ${lit(CASA)};
delete from inscricoes_artistas where user_id in (select id from auth.users where lower(email) in (${lit(EC)}, ${lit(EA)}));
delete from cadastros_casas where user_id in (select id from auth.users where lower(email) in (${lit(EC)}, ${lit(EA)}));
delete from auth.users where lower(email) in (${lit(EC)}, ${lit(EA)});`).catch((e) => console.log('aviso limpeza: ' + e.message.slice(0, 120)));
const id = {};
for (const [k, email, nome, tipo] of [['casa', EC, 'Café Maritaka', 'casa'], ['art', EA, ART, 'artista']]) {
  const r = await fetch(`https://${ref}.supabase.co/auth/v1/admin/users`, { method: 'POST', headers: H, body: JSON.stringify({ email, email_confirm: true, user_metadata: { nome, tipo, senha_portal: true } }) });
  const j = await r.json(); if (!r.ok) throw new Error('conta: ' + r.status + ' ' + limpo(j.msg || j.message)); id[k] = j.id;
}
await sql(`update auth.users set encrypted_password = ${lit(HASH)} where id in (${lit(id.casa)}, ${lit(id.art)});
update perfis set tipo = 'casa', nome = 'Café Maritaka', vinculo_nome = ${lit(CASA)}, senha_definida = true, tutorial_visto_em = now() where id = ${lit(id.casa)};
update perfis set tipo = 'artista', nome = ${lit(ART)}, vinculo_nome = ${lit(ART)}, senha_definida = true, tutorial_visto_em = now() where id = ${lit(id.art)};`);
ok('contas da casa e da artista criadas (senha comum)');
const adm = (await sql(`select id from perfis where tipo = 'adm' limit 1`))[0].id;
const imp = `select set_config('request.jwt.claims', ${lit(JSON.stringify({ sub: adm, role: 'authenticated' }))}, true), set_config('request.jwt.claim.sub', ${lit(adm)}, true);`;
const FICHA = { nome: CASA, cidade_uf: 'Campinas/SP', capacidade_sentado: '100', capacidade: '150', menores: 'responsavel', instagram: '@cafemaritaka',
  funcionamento: 'Recebe o Tranquilo principalmente às sextas e sábados (histórico do Notion: 8 noites)', duvidas_guia: '' };
await sql(`insert into cadastros_casas (user_id, dados, status, enviado_em) values (${lit(id.casa)}, ${js(FICHA)}, 'em_analise', now() - interval '3 days');`);
await sql(`${imp} set session_replication_role = replica; update cadastros_casas set status = 'habilitada', avaliado_em = now(), classificacao = 'confiavel', parecer = 'Casa parceira com 8 noites no histórico. Faltam CNPJ, Dono A e dados de repasse: pedir à casa.' where user_id = ${lit(id.casa)}; set session_replication_role = origin;`);
await sql(`update perfis set vinculo_nome = ${lit(CASA)} where id = ${lit(id.casa)};`);
const casaId = (await sql(`select id from cadastros_casas where user_id = ${lit(id.casa)}`))[0].id;
ok('Ficha do Café Maritaka (do Notion: nome, cidade, capacidade, Instagram, histórico) habilitada; o resto fica para pedir');
const INSC = { nome_artistico: ART, cidade_base: 'São Paulo', estado: 'SP', generos: 'MPB', formato_interesse: 'turne',
  release: 'Analu Sampaio já fez 8 noites no Tranquilo, em turnê por Campinas, Santo André, Limeira e Sorocaba. Dados do histórico do Notion; a artista completa o release, os links e os dados de contrato pelo portal.',
  instagram: '@analusampaiooficial', spotify: 'https://open.spotify.com/artist/5aCfRvMvtnPnXbQiPRMVWc', formacao: 'solo', integrantes: '1', rider_tipo: 'circulavel',
  cidades_interesse: ['Campinas', 'São Paulo'], aceita_bonus: 'true', aceite: 'true' };
await sql(`insert into inscricoes_artistas (user_id, dados, status, enviado_em) values (${lit(id.art)}, ${js(INSC)}, 'em_curadoria', now() - interval '20 days');`);
await sql(`${imp} update inscricoes_artistas set status = 'aprovada', parecer = 'Artista da casa: 8 noites no Tranquilo.' where user_id = ${lit(id.art)};`).catch(async () => { await sql(`set session_replication_role = replica; update inscricoes_artistas set status = 'aprovada', avaliado_em = now() where user_id = ${lit(id.art)}; set session_replication_role = origin;`); });
await sql(`insert into disponibilidade_semanal (casa_ref, dias, atualizado_por) values (${lit(CASA)}, '{5,6}', ${lit(id.casa)});
insert into disponibilidade_semanal (user_id, cidade, dias, atualizado_por) values (${lit(id.art)}, 'Campinas', '{5,6}', ${lit(id.art)}), (${lit(id.art)}, 'São Paulo', '{4,5,6}', ${lit(id.art)});
insert into equipe_casa (casa_ref, nome, funcoes, reserva, criado_por) values (${lit(CASA)}, 'Responsável do Café Maritaka', '{lider}', false, ${lit(id.casa)});`);
ok('inscrição da Analu aprovada, disponibilidade pelo histórico, equipe da casa começada (falta completar)');
const arts = [{ nome: ART, user_id: id.art, ordem: 1, producao: false }];
const dp = await sql(`${imp} insert into datas_portal (dia, abertura, produto, casa_id, casa_nome, cidade, artistas, link_ingressos, observacao, criado_por) values (${lit(DIA)}, '19:00', 'Apresenta', ${lit(casaId)}, ${lit(CASA)}, 'Campinas/SP', ${js(arts)}, 'https://www.ingresse.com/tranquilocampinas-2026-12-04', 'Data real do Notion: Tranquilo Apresenta — Campinas — Analu Sampaio', ${lit(adm)}) returning id;`);
const ev = 'p:' + dp.at(-1).id; ok('data real 04/12 (Apresenta — Campinas — Analu Sampaio) no portal');
global.window = {}; eval((await readFile(new URL('../src/contrato.js', import.meta.url), 'utf8')) + ';global.TQC = TQContrato;'); const TQ = global.TQC;
const ms = await sql(`select id, nome, texto from modelos_contrato order by criado_em desc`);
const mArt = ms.find((m) => /artista.*apresenta/i.test(m.nome)) || ms.find((m) => /artista/i.test(m.nome)), mCasa = ms.find((m) => /^casa|parceria/i.test(m.nome));
const evento = { d: DIA, c: 'Campinas', h: CASA, m: 'Apresenta', n: 'Tranquilo Apresenta — Campinas', noite: { inicio: '19:00' } };
for (const [m, uid, tipo, dados, titulo, evId] of [[mArt, id.art, 'artista', INSC, `${mArt?.nome} · ${ART} · Campinas 04/12`, ev], [mCasa, id.casa, 'casa', FICHA, `${mCasa?.nome} · ${CASA}`, null]]) {
  if (!m) { console.log('FALHA modelo de contrato ' + tipo); continue; }
  const { texto, campos } = TQ.campos(m.texto), sug = TQ.sugestoes(evId ? evento : null, { vinculo_nome: tipo === 'casa' ? CASA : ART });
  const eqv = {}; for (const c of campos) { const v = sug[c.chave] || (/cache|valor/.test(c.chave) ? 'conforme combinado' : ''); if (v) eqv[c.chave] = v; }
  const daEq = campos.filter((c) => eqv[c.chave]), daPessoa = campos.filter((c) => !eqv[c.chave]);
  const cad = TQ.doCadastro(daPessoa, tipo, dados, {}); const val = {}; for (const c of daPessoa) if (cad[c.chave]) val[c.chave] = cad[c.chave];
  await sql(`insert into contratos (user_id, evento_id, titulo, modelo_id, texto, campos, dados, status, criado_por) values (${lit(uid)}, ${lit(evId)}, ${lit(titulo.slice(0, 160))}, ${lit(m.id)}, ${lit(TQ.preencher(texto, daEq, eqv))}, ${js(daPessoa)}, ${js(val)}, 'enviado', ${lit(adm)});`);
  ok(`contrato de ${tipo} enviado (${Object.keys(val).length} de ${daPessoa.length} campos já preenchidos pela ficha)`);
}
