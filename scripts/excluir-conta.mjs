// Exclui uma conta do portal (login, perfil e convite antigo) para a pessoa poder entrar de novo por convite.
// A conta é achada pela impressão SHA-256 do e-mail (minúsculo): o e-mail nunca aparece no repositório nem no log.
// MODO=ensaio mostra o que seria afetado e desfaz; MODO=excluir grava. Não exclui a última conta de administração.
// Uso (Actions): EMAIL_SHA256=<hash> MODO=ensaio|excluir node scripts/excluir-conta.mjs · precisa do SUPABASE_ACCESS_TOKEN.
import { readFile } from 'node:fs/promises';

const tok = process.env.SUPABASE_ACCESS_TOKEN, hash = (process.env.EMAIL_SHA256 || '').trim().toLowerCase(), modo = process.env.MODO || 'ensaio';
if (!tok || !/^[0-9a-f]{64}$/.test(hash) || !['ensaio', 'excluir'].includes(modo)) { console.error('::error::Falta o token, a impressão do e-mail (64 caracteres) ou o modo.'); process.exit(1); }
const cfg = await readFile(new URL('../src/config.js', import.meta.url), 'utf8');
const ref = cfg.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
const fim = modo === 'excluir' ? 'commit' : 'rollback';
const sql = `begin;
create temp table relato (passo text, n int) on commit drop;
do $$
declare uid uuid; mail text; tipo_conta text; fk record; n int;
begin
  select id, email into uid, mail from auth.users where encode(extensions.digest(lower(email), 'sha256'), 'hex') = '${hash}';
  if uid is null then raise exception 'Nenhuma conta com esse e-mail.'; end if;
  select tipo::text into tipo_conta from perfis where id = uid;
  insert into relato values ('conta encontrada: ' || coalesce(tipo_conta, 'sem perfil'), 1);
  if tipo_conta = 'adm' and not exists (select 1 from perfis where tipo = 'adm' and id <> uid) then
    raise exception 'É a última conta de administração: convide outra pessoa como adm antes.';
  end if;
  -- Registros que apontam para a conta sem "on delete": soltam a referência (o registro fica, sem autor).
  for fk in select c.conrelid::regclass tabela, a.attname coluna, a.attnotnull obrig
            from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
            where c.contype = 'f' and c.confrelid in ('public.perfis'::regclass, 'auth.users'::regclass)
              and c.confdeltype in ('a', 'r') and array_length(c.conkey, 1) = 1 loop
    if fk.obrig then
      execute format('select count(*) from %s where %I = $1', fk.tabela, fk.coluna) into n using uid;
      if n > 0 then raise exception 'A conta tem % registro(s) obrigatórios em %.%; não dá para excluir sem apagá-los.', n, fk.tabela, fk.coluna; end if;
    else
      execute format('update %s set %I = null where %I = $1', fk.tabela, fk.coluna, fk.coluna) using uid;
      get diagnostics n = row_count;
      if n > 0 then insert into relato values ('autor removido em ' || fk.tabela || '.' || fk.coluna, n); end if;
    end if;
  end loop;
  delete from convites where email = lower(mail); get diagnostics n = row_count; insert into relato values ('convite antigo apagado', n);
  delete from auth.users where id = uid; get diagnostics n = row_count; insert into relato values ('login e perfil excluídos', n);
end $$;
select passo, n from relato;
${fim};`;
const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, { method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: sql }) });
const t = await r.text();
if (!r.ok) { console.error(`::error::Não excluiu (HTTP ${r.status}): ${t.replace(/[^\s@]+@[^\s@]+/g, '[e-mail]').slice(0, 400)}`); process.exit(1); }
let linhas = []; try { linhas = JSON.parse(t); } catch {}
console.log(modo === 'excluir' ? 'EXCLUÍDO. O que mudou:' : 'ENSAIO (nada foi gravado). O que mudaria:');
for (const l of linhas) console.log(`- ${l.passo}: ${l.n}`);
