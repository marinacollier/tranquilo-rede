// Relatório de uso dos testes: quem entrou, o que abriu, erros e relatos ("Algo deu errado?").
// Roda à mão no GitHub Actions (Actions > Relatório de uso). O repositório é público, então o log mostra só
// totais e nomes: as contas de teste pelo e-mail (já estão no guia do time), as demais pelo primeiro nome ou
// pelo nome da artista/casa, nunca e-mail, telefone ou IP. Precisa do segredo SUPABASE_ACCESS_TOKEN.
import { readFile } from 'node:fs/promises';

const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) { console.error('::error::SUPABASE_ACCESS_TOKEN não configurado.'); process.exit(1); }
const cfg = await readFile(new URL('../src/config.js', import.meta.url), 'utf8');
const ref = cfg.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
const DIAS = Number(process.env.DIAS || 3);
const sql = async (query) => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) });
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r.json();
};
const desde = `now() - interval '${DIAS} days'`;
const hora = (t) => t ? new Date(t).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '–';
const limpa = (s, n = 160) => String(s ?? '').replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, (e) => (/^teste-[^@]*@gmail\.com$/i.test(e) ? e : '[e-mail]')).replace(/\+?\d[\d\s().-]{8,}\d/g, '[telefone]').replace(/\s+/g, ' ').slice(0, n);

// Quem é cada conta, do jeito que pode aparecer num log público.
const quem = (p) => {
  if (!p) return 'sem conta (visitante ou código)';
  if (/^teste-[^@]*@gmail\.com$/i.test(p.email)) return `${p.email} (${p.tipo})`;
  const nome = ['artista', 'casa'].includes(p.tipo) ? (p.vinculo_nome || (p.nome || '').split(' ')[0]) : (p.nome || '').split(' ')[0];
  return `${nome || 'sem nome'} (${p.tipo}, conta pessoal)`;
};

const linhas = [];
const log = (s = '') => { linhas.push(s); console.log(s); };
log(`# Relatório de uso, últimos ${DIAS} dias (gerado ${hora(new Date())}, horário de Brasília)`);

// 1. Contas que entraram (pelo diário do site e pelos logins do servidor)
const contas = await sql(`
  with d as (
    select user_id, count(*) eventos, count(distinct sessao) sessoes, min(criado_em) primeiro, max(criado_em) ultimo,
           count(*) filter (where acao ~ '^(erro_|falha_)') erros, count(*) filter (where acao = 'relato') relatos,
           count(distinct tela) telas, array_agg(distinct tela) filter (where tela is not null) lista_telas
    from diario where criado_em > ${desde} and user_id is not null group by user_id)
  select p.email, p.nome, p.tipo, p.vinculo_nome, d.* from d join perfis p on p.id = d.user_id order by d.ultimo desc`);
log(`\n## Contas que usaram o site: ${contas.length}`);
for (const c of contas) {
  log(`- ${quem(c)}: ${c.sessoes} sessão(ões), ${c.eventos} ações, ${c.telas} telas, de ${hora(c.primeiro)} a ${hora(c.ultimo)}${c.erros ? `, ${c.erros} erro(s)` : ''}${c.relatos ? `, ${c.relatos} relato(s)` : ''}`);
  log(`    telas: ${(c.lista_telas || []).filter(Boolean).slice(0, 25).join(', ')}`);
}

// 2. Sessões sem conta (visitantes e quem entrou por código)
const anon = await sql(`
  select count(distinct sessao) sessoes, count(*) eventos,
         count(distinct sessao) filter (where acao = 'entrou_codigo') por_codigo,
         array_agg(distinct (detalhe->>'perfil') || ': ' || (detalhe->>'nome')) filter (where acao = 'entrou_codigo') codigos
  from diario where criado_em > ${desde} and user_id is null`);
const a = anon[0] || {};
log(`\n## Sem conta: ${a.sessoes || 0} sessões (${a.eventos || 0} ações); ${a.por_codigo || 0} entraram por código${a.codigos?.length ? ': ' + a.codigos.filter(Boolean).join('; ') : ''}`);

// 3. Tutoriais: como as pessoas usaram (concluiu, pulou, fechou)
const tut = await sql(`
  select detalhe->>'roteiro' roteiro, detalhe->>'modo' modo, detalhe->>'motivo' motivo, count(*) n
  from diario where criado_em > ${desde} and acao = 'tutorial' group by 1, 2, 3 order by 1, 2, 4 desc`);
log(`\n## Tutoriais (${tut.reduce((s, x) => s + Number(x.n), 0)} vezes)`);
for (const t of tut) log(`- ${t.roteiro} · ${t.modo}: ${t.motivo} ${t.n}x`);

// 4. Erros do navegador e chamadas que falharam (agrupados)
const erros = await sql(`
  select acao, coalesce(detalhe->>'msg', detalhe->>'alvo', '') o_que, detalhe->>'status' status, tela, count(*) n, count(distinct sessao) sessoes, max(criado_em) ultimo
  from diario where criado_em > ${desde} and acao ~ '^(erro_|falha_|chamada_lenta)'
  group by 1, 2, 3, 4 order by n desc limit 40`);
log(`\n## Erros e falhas no navegador: ${erros.reduce((s, x) => s + Number(x.n), 0)}`);
for (const e of erros) log(`- ${e.acao}${e.status ? ' ' + e.status : ''} em "${e.tela || '?'}": ${limpa(e.o_que, 140)} (${e.n}x, ${e.sessoes} sessão(ões), última ${hora(e.ultimo)})`);

// 5. Mensagens de erro mostradas na tela (formulários e avisos)
const msgs = await sql(`
  select detalhe->>'tipo' tipo, detalhe->>'texto' texto, count(*) n from diario
  where criado_em > ${desde} and acao = 'mensagem' and (detalhe->>'tipo' in ('formulario', 'crit') or detalhe->>'texto' ~* 'erro|não foi possível|falhou|errado')
  group by 1, 2 order by n desc limit 25`);
log(`\n## Mensagens de erro que apareceram na tela: ${msgs.length} diferentes`);
for (const m of msgs) log(`- [${m.tipo}] ${limpa(m.texto, 150)} (${m.n}x)`);

// 6. Relatos pelo botão "Algo deu errado?"
const rel = await sql(`
  select d.criado_em, d.tela, d.detalhe->>'texto' texto, p.email, p.nome, p.tipo, p.vinculo_nome
  from diario d left join perfis p on p.id = d.user_id where d.criado_em > ${desde} and d.acao = 'relato' order by d.criado_em desc limit 30`);
log(`\n## Relatos ("Algo deu errado?"): ${rel.length}`);
for (const r of rel) log(`- ${hora(r.criado_em)} · ${quem(r.email ? r : null)} · tela "${r.tela || '?'}": ${limpa(r.texto, 300)}`);

// 7. Servidor: logins e erros (diario_servidor)
const srv = await sql(`
  select fonte, coalesce(status::text, '-') status, count(*) n from diario_servidor
  where quando > ${desde} and (status >= 400 or fonte = 'auth_logs') group by 1, 2 order by 1, 3 desc`);
log(`\n## Servidor (logins e respostas com erro)`);
for (const s of srv) log(`- ${s.fonte} ${s.status}: ${s.n}`);
const logins = await sql(`
  select p.email, p.nome, p.tipo, p.vinculo_nome, count(*) n, max(s.quando) ultimo
  from diario_servidor s join perfis p on p.id::text = coalesce(s.dados->>'actor_id', s.dados->>'auth.actor_id', s.dados->>'user_id')
  where s.fonte = 'auth_logs' and s.quando > ${desde} group by 1, 2, 3, 4 order by ultimo desc`).catch(() => []);
if (logins.length) { log(`\nLogins no servidor:`); for (const l of logins) log(`- ${quem(l)}: ${l.n} evento(s) de login, último ${hora(l.ultimo)}`); }
