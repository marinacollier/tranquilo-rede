// Limpeza dos testes (pedido da Marina, 17/11/2026). Só roda à mão no GitHub Actions (workflow limpar-testes).
//   MODO=listar   lista as contas e quanto cada uma tem no banco; a saída sai CIFRADA com a chave pública recebida
//                 (CHAVE_PUBLICA, PEM em base64), porque o log é público. Só quem tem a chave privada lê.
//   MODO=ensaio   apaga os dados das contas em IDS dentro de uma transação desfeita e mostra só contagens.
//   MODO=limpar   apaga de verdade os dados das contas em IDS (inscrição, Ficha, contratos, datas, disponibilidade,
//                 passos, equipe da casa, treinamento). As contas (login) ficam, zeradas. Nada vai ao Notion.
// IDS: uuids separados por vírgula. Nunca apaga as contas do caso completo (casa.teste / artista.teste).
import { readFile } from 'node:fs/promises';
import { publicEncrypt, randomBytes, createCipheriv, constants } from 'node:crypto';

const tok = process.env.SUPABASE_ACCESS_TOKEN, MODO = process.env.MODO || 'listar';
if (!tok) { console.error('::error::Falta SUPABASE_ACCESS_TOKEN.'); process.exit(1); }
const cfg = await readFile(new URL('../src/config.js', import.meta.url), 'utf8');
const ref = cfg.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
async function sql(q) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, { method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q }) });
  const t = await r.text();
  if (!r.ok) throw new Error(`SQL HTTP ${r.status}: ${t.replace(/[^\s@"']+@[^\s@"']+/g, '[e-mail]').slice(0, 300)}`);
  return JSON.parse(t);
}
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
const PROTEGIDOS = ['casa.teste@tranquilo.com.br', 'artista.teste@tranquilo.com.br'];

if (MODO === 'listar') {
  const pem = Buffer.from(process.env.CHAVE_PUBLICA || '', 'base64').toString('utf8');
  if (!/BEGIN PUBLIC KEY/.test(pem)) { console.error('::error::CHAVE_PUBLICA ausente.'); process.exit(1); }
  const linhas = await sql(`select p.id, u.email, p.nome, p.tipo, p.vinculo_nome, u.created_at::date criado, u.last_sign_in_at::date ultimo,
    (select count(*) from inscricoes_artistas where user_id = p.id) insc, (select count(*) from cadastros_casas where user_id = p.id) ficha,
    (select count(*) from contratos where user_id = p.id) contratos, (select count(*) from checklist where user_id = p.id) passos,
    (select count(*) from disponibilidade_artista where user_id = p.id) disp_art,
    (select count(*) from datas_portal d where d.criado_por = p.id) datas_criadas
    from perfis p join auth.users u on u.id = p.id order by u.created_at`);
  const extra = await sql(`select (select count(*) from datas_portal) datas, (select count(*) from disponibilidade_casa) disp_casa, (select count(*) from equipe_casa) equipe_casa,
    (select count(*) from trilhas) trilhas, (select count(*) from convites) convites, (select count(*) from modelos_contrato) modelos, (select json_agg(casa_nome) from datas_portal) datas_casas,
    (select json_agg(distinct casa_ref) from disponibilidade_casa) disp_casas, (select json_agg(distinct casa_ref) from equipe_casa) eq_casas`);
  const claro = Buffer.from(JSON.stringify({ linhas, extra }));
  const k = randomBytes(32), iv = randomBytes(12), c = createCipheriv('aes-256-gcm', k, iv);
  const corpo = Buffer.concat([c.update(claro), c.final(), c.getAuthTag()]);
  const chave = publicEncrypt({ key: pem, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, k);
  console.log(`OK    ${linhas.length} contas listadas (saída cifrada abaixo)`);
  console.log('CIFRADO ' + [chave, iv, corpo].map((b) => b.toString('base64')).join('.'));
  process.exit(0);
}

const ids = String(process.env.IDS || '').split(',').map((x) => x.trim()).filter((x) => /^[0-9a-f-]{36}$/.test(x));
if (!ids.length) { console.error('::error::IDS vazio.'); process.exit(1); }
const lista = ids.map(lit).join(', ');
const prot = await sql(`select count(*)::int n from auth.users where id in (${lista}) and email in (${PROTEGIDOS.map(lit).join(', ')})`);
if (prot[0].n) { console.error('::error::A lista inclui uma conta do caso completo. Nada foi apagado.'); process.exit(1); }
const passo = `
create temp table lim_ids on commit drop as select id from perfis where id in (${lista});
create temp table lim_casas on commit drop as select distinct lower(x) ref from (
  select dados->>'nome' x from cadastros_casas where user_id in (select id from lim_ids)
  union select vinculo_nome from perfis where id in (select id from lim_ids) and tipo = 'casa') t where x is not null
  and lower(x) not in (select lower(dados->>'nome') from cadastros_casas c join auth.users u on u.id = c.user_id where u.email in (${PROTEGIDOS.map(lit).join(', ')}));
alter table contratos disable trigger trg_contrato_apagar;
delete from contratos where user_id in (select id from lim_ids);
alter table contratos enable trigger trg_contrato_apagar;
delete from checklist where user_id in (select id from lim_ids);
delete from disponibilidade_artista where user_id in (select id from lim_ids);
delete from disponibilidade_semanal where user_id in (select id from lim_ids) or lower(casa_ref) in (select ref from lim_casas);
delete from disponibilidade_casa where lower(casa_ref) in (select ref from lim_casas);
delete from equipe_casa where lower(casa_ref) in (select ref from lim_casas);
delete from trilhas where lower(casa_ref) in (select ref from lim_casas);
delete from datas_portal where criado_por in (select id from lim_ids) or casa_id in (select id from cadastros_casas where user_id in (select id from lim_ids));
delete from solicitacoes_ficha where casa_id in (select id from cadastros_casas where user_id in (select id from lim_ids));
delete from inscricoes_artistas where user_id in (select id from lim_ids);
delete from cadastros_casas where user_id in (select id from lim_ids);
select (select count(*) from lim_ids) contas, (select count(*) from lim_casas) casas;`;
const r = await sql(MODO === 'limpar' ? `begin; ${passo} commit;` : `begin; ${passo} rollback;`);
console.log(`OK    ${MODO === 'limpar' ? 'apagado' : 'ensaio (desfeito)'}: ${JSON.stringify(r.at?.(-1) ?? r)}`);
