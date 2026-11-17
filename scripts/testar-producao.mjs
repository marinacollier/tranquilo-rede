// Teste de fumaça em PRODUÇÃO (Supabase de verdade), pelo navegador, ponta a ponta. Só roda à mão no GitHub Actions.
// Cria contas descartáveis já confirmadas (adm, equipe, casa e artista: teste-e2e-<execução>-<papel>@<domínio>),
// percorre os fluxos do portal como uma pessoa faria e, no fim, apaga tudo o que criou (MODO=limpar apaga sozinho).
// O repositório é público e o log também: imprime só OK/FALHA por passo, sem e-mail, chave, token ou conteúdo.
//
//   SUPABASE_ACCESS_TOKEN  token da Management API (secret do repositório)
//   BASE                   endereço do site testado (o build local desta versão ou o site no ar)
//   EXECUCAO               identificador desta execução (entra no e-mail das contas descartáveis)
//   DOMINIO                domínio dos e-mails descartáveis (padrão teste-e2e.invalid)
//   MODO                   testar (padrão) ou limpar
import { readFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';

const tok = process.env.SUPABASE_ACCESS_TOKEN, MODO = process.env.MODO || 'testar';
const RUN = (process.env.EXECUCAO || Date.now().toString(36)).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
const DOM = process.env.DOMINIO || 'teste-e2e.invalid';
const BASE = process.env.BASE || 'http://localhost:8080/';
const SHOTS = process.env.CAPTURAS || '/tmp/capturas';
if (!tok) { console.error('::error::Falta SUPABASE_ACCESS_TOKEN.'); process.exit(1); }
const cfg = await readFile(new URL('../src/config.js', import.meta.url), 'utf8');
const ref = cfg.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1], URL_SB = `https://${ref}.supabase.co`;
const limpo = (s) => String(s ?? '').replace(/[^\s@"']+@[^\s@"']+/g, '[e-mail]').replace(/eyJ[\w.-]{20,}|sb_(secret|publishable)_[\w-]+/g, '[chave]').slice(0, 300);

async function sql(q) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, { method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q }) });
  const t = await r.text();
  if (!r.ok) throw new Error(`SQL HTTP ${r.status}: ${limpo(t)}`);
  return JSON.parse(t);
}
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;

// ---------- limpeza: tudo o que tem teste-e2e- no e-mail (desta e de execuções anteriores que caíram no meio) ----------
async function limpar() {
  const r = await sql(`drop table if exists e2e_ids, e2e_reg, e2e_casas;
create temp table e2e_ids as select id from auth.users where email like 'teste-e2e-%';
create temp table e2e_reg as
  select id::text rid from e2e_ids union select id::text from cadastros_casas where user_id in (select id from e2e_ids)
  union select id::text from inscricoes_artistas where user_id in (select id from e2e_ids) union select id::text from contratos where user_id in (select id from e2e_ids);
create temp table e2e_casas as select dados->>'nome' nome from cadastros_casas where user_id in (select id from e2e_ids) and dados->>'nome' is not null
  union select vinculo_nome from perfis where id in (select id from e2e_ids) and vinculo_nome is not null;
delete from notas_internas where alvo_id::text in (select rid from e2e_reg);
delete from disponibilidade_casa where lower(casa_ref) in (select lower(nome) from e2e_casas);
do $$ declare fk record; n int; begin
  for fk in select c.conrelid::regclass tabela, a.attname coluna, a.attnotnull obrig
            from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
            where c.contype = 'f' and c.confrelid in ('public.perfis'::regclass, 'auth.users'::regclass)
              and c.confdeltype in ('a', 'r') and array_length(c.conkey, 1) = 1 loop
    if fk.obrig then execute format('delete from %s where %I in (select id from e2e_ids)', fk.tabela, fk.coluna);
    else execute format('update %s set %I = null where %I in (select id from e2e_ids)', fk.tabela, fk.coluna, fk.coluna); end if;
  end loop;
end $$;
delete from auth.users where id in (select id from e2e_ids);
delete from convites where email like 'teste-e2e-%';
delete from modelos_contrato where nome like 'Teste E2E%';
delete from auditoria where quem_email like 'teste-e2e-%' or registro in (select rid from e2e_reg) or registro like 'teste-e2e-%'
  or lower(registro) in (select lower(nome) from e2e_casas) or antes::text like '%teste-e2e-%' or depois::text like '%teste-e2e-%' or depois::text like '%Teste E2E%' or antes::text like '%Teste E2E%';
drop table e2e_ids, e2e_reg, e2e_casas;
select (select count(*) from auth.users where email like 'teste-e2e-%') contas, (select count(*) from convites where email like 'teste-e2e-%') convites;`);
  const sobra = r[r.length - 1] || r[0] || {};
  return sobra;
}
if (MODO === 'limpar') {
  try { const s = await limpar(); const ok = Number(s.contas) === 0 && Number(s.convites) === 0; console.log(`${ok ? 'OK   ' : 'FALHA'} limpeza: contas de teste restantes ${s.contas ?? '?'}, convites ${s.convites ?? '?'}`); process.exit(ok ? 0 : 1); }
  catch (e) { console.log(`FALHA limpeza: ${limpo(e.message)}`); process.exit(1); }
}

// ---------- preparação ----------
const res = [];
const reg = (nome, ok, detalhe = '') => { res.push({ nome, ok }); console.log(`${ok ? 'OK   ' : 'FALHA'} ${nome}${detalhe ? ` (${limpo(detalhe)})` : ''}`); };
const inicio = new Date().toISOString();
const SENHA = `E2e-${crypto.randomUUID()}`;
const email = (papel) => `teste-e2e-${RUN}-${papel}@${DOM}`;
const CASA = `Casa Teste E2E ${RUN}`, ARTISTA = `Artista Teste E2E ${RUN}`;

// Configuração do login (só o que não é segredo, e sem endereços pessoais).
try {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, { headers: { Authorization: `Bearer ${tok}` } });
  const a = await r.json();
  const lista = String(a.uri_allow_list || '').split(',').map((s) => s.trim()).filter(Boolean);
  const cobre = (u) => lista.some((x) => x === u || (x.endsWith('**') && u.startsWith(x.slice(0, -2))) || (x.endsWith('*') && u.startsWith(x.slice(0, -1))));
  console.log(`info  login: site_url=${a.site_url} · redirecionamentos permitidos=${lista.length} · github.io coberto=${cobre('https://marinacollier.github.io/tranquilo-rede/')} · tranquilomusica.com.br/rede coberto=${cobre('https://tranquilomusica.com.br/rede/')}`);
  console.log(`info  e-mail: smtp próprio=${!!a.smtp_host} (${a.smtp_host || 'padrão do Supabase'}:${a.smtp_port || ''}) · limite/hora=${a.rate_limit_email_sent} · confirmação obrigatória=${!a.mailer_autoconfirm} · intervalo mínimo entre e-mails=${a.smtp_max_frequency}s`);
} catch (e) { console.log(`info  configuração do login indisponível: ${limpo(e.message)}`); }

// Chave de serviço só na memória (mascarada no log por precaução).
const chaves = await (await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${tok}` } })).json();
const serv = (chaves.find?.((k) => k.name === 'service_role') || chaves.find?.((k) => k.type === 'secret'))?.api_key;
if (!serv) { console.log('FALHA chave de serviço não encontrada'); process.exit(1); }
console.log(`::add-mask::${serv}`);
const H = { apikey: serv, 'Content-Type': 'application/json', ...(serv.startsWith('eyJ') ? { Authorization: `Bearer ${serv}` } : {}) };

const contas = {};
async function criarConta(papel, nome, tipoMeta, tipoFinal) {
  const r = await fetch(`${URL_SB}/auth/v1/admin/users`, { method: 'POST', headers: H, body: JSON.stringify({ email: email(papel), password: SENHA, email_confirm: true, user_metadata: { nome, tipo: tipoMeta } }) });
  const j = await r.json();
  if (!r.ok) throw new Error(`criar conta ${papel}: HTTP ${r.status} ${j.msg || j.message || j.error_code || ''}`);
  contas[papel] = j.id;
  // Tutorial já visto (o teste não é sobre ele); equipe e adm recebem o tipo direto no banco.
  await sql(`update perfis set tutorial_visto_em = now()${tipoFinal ? `, tipo = ${lit(tipoFinal)}` : ''} where id = ${lit(j.id)}`);
}
try {
  await criarConta('adm', 'Adm Teste E2E', 'artista', 'adm');
  await criarConta('equipe', 'Equipe Teste E2E', 'artista', 'equipe');
  await criarConta('casa', 'Dona Teste E2E', 'casa');
  await criarConta('artista', ARTISTA, 'artista');
  const t = await sql(`select tipo::text, count(*)::int n from perfis where id in (${Object.values(contas).map(lit).join(',')}) group by 1 order by 1`);
  reg('contas descartáveis criadas e confirmadas (adm, equipe, casa, artista)', t.map((x) => `${x.tipo}:${x.n}`).join(',') === 'adm:1,artista:1,casa:1,equipe:1', t.map((x) => `${x.tipo}:${x.n}`).join(','));
} catch (e) { reg('contas descartáveis criadas', false, e.message); await limpar().catch(() => {}); process.exit(1); }

// ---------- navegador ----------
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
await mkdir(SHOTS, { recursive: true });
const nav = await chromium.launch();
const errosJs = [];
async function abrir(papel) {
  const ctx = await nav.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('tq-consentimento', 'tudo'); localStorage.setItem('tq-tutorial-publico', '1'); } catch {} });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errosJs.push(`${papel}: ${e.message}`)); p.on('dialog', (d) => d.accept());
  p.setDefaultTimeout(20000);
  await p.goto(BASE); await p.waitForSelector('#entrar');
  await p.waitForFunction(() => window.TQConta?.REAL === true, null, { timeout: 20000 });
  return p;
}
async function entrar(papel) {
  const p = await abrir(papel);
  await p.click('#entrar'); await p.waitForSelector('#esenha'); await p.waitForTimeout(300);
  await p.fill('#email', email(papel)); await p.fill('#esenha', SENHA); await p.click('#eok');
  await p.waitForSelector('[data-aba="conta"]', { timeout: 25000 });
  await p.waitForTimeout(600);
  if (await p.$('.tour-caixa')) await p.click((await p.$('[data-tour="pular"]')) ? '[data-tour="pular"]' : '[data-tour="avancar"]').catch(() => {});
  await p.keyboard.press('Escape').catch(() => {});
  return p;
}
const abrirAba = async (p, k) => {
  if (await p.$(`[data-aba="${k}"]`)) { await p.click(`[data-aba="${k}"]`); await p.waitForTimeout(400); return; }
  const a = await p.evaluate((k) => window.TQConta?.areaDe?.(k), k);
  if (!a) throw new Error(`a tela ${k} não está no menu desta conta`);
  await p.click(`[data-aba="${a}"]`); await p.waitForTimeout(300);
  if (await p.$(`[data-sub="${a}|${k}"]`)) await p.click(`[data-sub="${a}|${k}"]`);
  await p.waitForTimeout(400);
};
const texto = (p, s = '#app') => p.textContent(s).then((t) => t || '');
const um = async (q) => (await sql(q))[0] || {};
async function passo(nome, fn, p) {
  try { await fn(); } catch (e) { reg(nome, false, e.message.split('\n')[0]); if (p) await p.screenshot({ path: `${SHOTS}/${nome.replace(/[^\w]+/g, '-').slice(0, 60)}.png`, fullPage: true }).catch(() => {}); }
}

try {
  // 1. Esqueci minha senha
  await passo('"Esqueci minha senha" envia o pedido sem erro', async () => {
    const p = await abrir('anonimo');
    await p.click('#entrar'); await p.waitForSelector('#esenha'); await p.waitForTimeout(300);
    await p.fill('#email', email('casa')); await p.click('#esqueci');
    await p.waitForFunction(() => /✓|✕|⚠/.test(document.querySelector('#eerr')?.textContent || ''), null, { timeout: 20000 });
    const m = await texto(p, '#eerr');
    reg('"Esqueci minha senha" responde sem erro na tela', /^✓/.test(m), m.slice(0, 120));
    await p.waitForTimeout(3000);
    const a = await sql(`select payload->>'action' acao, count(*)::int n from auth.audit_log_entries where created_at >= ${lit(inicio)} and lower(payload->>'actor_username') = ${lit(email('casa'))} group by 1`);
    reg('pedido de troca de senha aceito pelo servidor (registro de auditoria do login)', a.some((x) => x.acao === 'user_recovery_requested'), a.map((x) => `${x.acao}:${x.n}`).join(',') || 'nenhum registro');
    await p.context().close();
  });

  // 2. Casa: Ficha barrada sem obrigatórios e enviada completa
  let casaId = null;
  await passo('casa envia a Ficha', async () => {
    const p = await entrar('casa');
    await abrirAba(p, 'cadastro_casa'); await p.waitForSelector('#enviar');
    await p.fill('[data-k="nome"]', ''); await p.click('#enviar'); await p.waitForTimeout(600);
    reg('Ficha sem obrigatórios é barrada e diz o que falta', /Não enviado: falta preencher/.test(await texto(p, '#ferr')));
    const campos = { nome: CASA, cidade_uf: 'Recife/PE', endereco: 'Rua de Teste, 100, Recife, 50000-000', dono_nome: 'Dona Teste E2E', whatsapp: '81 99999-0000', capacidade_sentado: '80' };
    for (const [k, v] of Object.entries(campos)) await p.fill(`[data-k="${k}"]`, v);
    await p.click('#enviar');
    await p.waitForFunction(() => !/Salvando/.test(document.querySelector('#ferr')?.textContent || '') && !document.querySelector('#enviar'), null, { timeout: 20000 }).catch(() => {});
    const c = await um(`select id, status from cadastros_casas where user_id = ${lit(contas.casa)}`);
    casaId = c.id;
    reg('Ficha completa enviada (status em análise no banco)', c.status === 'em_analise', `status ${c.status || 'sem ficha'}${(await p.$('#ferr')) ? ' · ' + (await texto(p, '#ferr')).slice(0, 120) : ''}`);
    await p.context().close();
  });

  // 3. Adm habilita a casa
  await passo('adm habilita a casa', async () => {
    const p = await entrar('adm');
    await abrirAba(p, 'casas_cad'); await p.waitForSelector(`[data-click="casacad:${casaId}"]`);
    await p.click(`[data-click="casacad:${casaId}"]`); await p.waitForSelector('[data-decisao="habilitada"]');
    await p.click('[data-decisao="habilitada"]'); await p.waitForTimeout(2500);
    const c = await um(`select status from cadastros_casas where id = ${lit(casaId)}`);
    reg('adm habilita a casa (status habilitada no banco)', c.status === 'habilitada', `status ${c.status}${(await p.$('#derr')) ? ' · ' + (await texto(p, '#derr')).slice(0, 160) : ''}`);
    await p.context().close();
  });

  // 4. Vínculo da conta à casa e disponibilidade
  await passo('casa altera a disponibilidade', async () => {
    const v = await um(`select (vinculo_nome is not null) ligada, lower(coalesce(vinculo_nome, '')) = lower(${lit(CASA)}) mesma from perfis where id = ${lit(contas.casa)}`);
    reg('conta da casa fica ligada à casa ao ser habilitada', v.ligada === true && v.mesma === true, `ligada=${v.ligada} nome da Ficha=${v.mesma}`);
    const p = await entrar('casa');
    await abrirAba(p, 'agenda_casa'); await p.waitForTimeout(800);
    const t = await texto(p);
    if (/ainda não está ligada/.test(t)) throw new Error('tela diz "A conta ainda não está ligada à casa"');
    // Um dia livre (sem evento) de hoje em diante, no mês mostrado; se o mês acabou, o próximo.
    let dia = await p.$$eval('[data-disp-dia]', (xs) => xs.map((x) => x.dataset.dispDia)).then((xs) => xs[xs.length - 1]);
    if (!dia) { await p.click('[data-cal-mes] >> nth=1'); await p.waitForTimeout(400); dia = await p.$eval('[data-disp-dia]', (x) => x.dataset.dispDia); }
    await p.click(`[data-disp-dia="${dia}"]`); await p.waitForTimeout(1500);
    const d = await um(`select situacao from disponibilidade_casa where lower(casa_ref) = lower(${lit(CASA)}) and dia = ${lit(dia)}`);
    reg('casa marca um dia como disponível (gravado no banco)', d.situacao === 'disponivel', `situação ${d.situacao || 'nada gravado'}${(await p.$('#dispErr')) ? ' · ' + (await texto(p, '#dispErr')).slice(0, 160) : ''}`);
    await p.context().close();
  });

  // 5. Equipe gera contratos para a artista e para a casa
  const MODELO = `CONTRATO DE TESTE AUTOMÁTICO\n\nContratada: {{artista}}, CPF [PREENCHER CPF].\nApresentação em {{data}}, cidade de {{cidade}}. Cachê: R$ {{cache}}.\n${'Cláusula de exemplo para o texto precisar rolar até o fim. '.repeat(60)}\nE por estarem de acordo, assinam.`;
  const gerar = async (p, alvoId, rotulo) => {
    await p.selectOption('#ctConta', alvoId); await p.selectOption('#ctMod', { label: `Teste E2E ${RUN}` }); await p.click('#ctPrep');
    await p.waitForSelector('#ctEnviar');
    if (await p.$('[data-ct-campo="cache"]')) await p.fill('[data-ct-campo="cache"]', '1.000,00');
    await p.fill('#ctTit', `Teste E2E ${RUN} ${rotulo}`);
    await p.click('#ctEnviar'); await p.waitForTimeout(2500);
    const n = await um(`select count(*)::int n from contratos where user_id = ${lit(alvoId)} and status = 'enviado'`);
    const lista = await texto(p);
    reg(`equipe gera contrato para ${rotulo} (gravado e na lista da tela)`, n.n === 1 && lista.includes(`Teste E2E ${RUN} ${rotulo}`) && !/Nenhum contrato gerado ainda/.test(lista),
      `no banco ${n.n} · na lista ${lista.includes(`Teste E2E ${RUN} ${rotulo}`)}${(await p.$('#ctErr')) ? ' · ' + (await texto(p, '#ctErr')).slice(0, 160) : ''}`);
  };
  await passo('equipe gera contratos', async () => {
    const p = await entrar('equipe');
    await abrirAba(p, 'documentos'); await p.waitForSelector('#contrAuto');
    await p.click('#contrAuto summary'); await p.fill('#mcNome', `Teste E2E ${RUN}`); await p.fill('#mcTexto', MODELO); await p.click('#mcOk');
    await p.waitForTimeout(2000);
    const m = await um(`select count(*)::int n from modelos_contrato where nome = ${lit(`Teste E2E ${RUN}`)}`);
    reg('equipe salva modelo de contrato', m.n === 1, `${m.n} no banco${(await p.$('#mcErr')) ? ' · ' + (await texto(p, '#mcErr')).slice(0, 160) : ''}`);
    const ops = await p.$$eval('#ctConta option', (os) => os.map((o) => [o.value, o.textContent]));
    reg('casa habilitada aparece na lista de contas do contrato, pelo nome da casa', ops.some(([v, t]) => v === contas.casa && t.includes(CASA)), ops.some(([v]) => v === contas.casa) ? 'aparece com outro nome' : 'não aparece');
    reg('artista aparece na lista de contas do contrato', ops.some(([v]) => v === contas.artista));
    await gerar(p, contas.artista, 'artista');
    await gerar(p, contas.casa, 'casa');
    await p.context().close();
  });

  // 6. Artista lê até o fim e assina
  await passo('artista assina o contrato', async () => {
    const p = await entrar('artista');
    await abrirAba(p, 'passos'); await p.waitForSelector('[data-ct-abrir]', { timeout: 10000 });
    await p.click('[data-ct-abrir]'); await p.waitForSelector('#ctTexto');
    if (await p.$('[data-ct-dado="cpf"]')) { await p.fill('[data-ct-dado="cpf"]', '000.000.000-00'); await p.click('#ctSalvarDados'); await p.waitForSelector('#ctTexto'); await p.waitForTimeout(800); }
    await p.$eval('#ctTexto', (el) => { el.scrollTop = el.scrollHeight; el.dispatchEvent(new Event('scroll')); }); await p.waitForTimeout(1500);
    await p.fill('#ctNome', 'Artista Teste Ponta A Ponta'); await p.check('#ctConcordo'); await p.click('#ctAssinar');
    await p.waitForSelector('[data-ct-voltar]').catch(() => {}); await p.waitForTimeout(1500);
    const c = await um(`select status, (lido_fim_em is not null) lido, (hash is not null) h from contratos where user_id = ${lit(contas.artista)}`);
    reg('artista vê, lê até o fim e assina (assinado no banco, com hash)', c.status === 'assinado' && c.lido && c.h, `status ${c.status} lido=${c.lido}${(await p.$('#ctErr')) ? ' · ' + (await texto(p, '#ctErr')).slice(0, 160) : ''}`);
    await p.context().close();
  });

  // 7. Casa recebe o contrato; documentos dentro da página
  await passo('casa recebe o contrato e lê os documentos', async () => {
    const p = await entrar('casa');
    await abrirAba(p, 'passos'); await p.waitForTimeout(800);
    reg('casa vê o contrato para assinar', await p.$('[data-ct-abrir]') !== null && /Contrato para assinar/.test(await texto(p)));
    await abrirAba(p, 'guia'); await p.waitForSelector('[data-ler]', { timeout: 10000 }).catch(() => {});
    const lerGuia = await p.$('[data-ler="guia-do-franqueado"]') || await p.$('[data-ler]');
    if (!lerGuia) reg('Operações › Guia abre dentro da página', false, 'nenhum documento para ler');
    else {
      await lerGuia.click(); await p.waitForSelector('#leitorDoc', { timeout: 10000 });
      const n = await p.frameLocator('#leitorDoc').locator('body').innerText({ timeout: 10000 }).then((t) => t.length).catch(() => 0);
      reg('Operações › Guia abre dentro da página', n > 500, `${n} caracteres`);
    }
    await abrirAba(p, 'mkt_produtor'); await p.waitForTimeout(600);
    const lerMkt = await p.$('[data-ler]');
    if (!lerMkt) reg('Marketing: documento abre dentro da página', false, 'nenhum documento para ler');
    else {
      await lerMkt.click(); await p.waitForSelector('#leitorDoc', { timeout: 10000 });
      const n = await p.frameLocator('#leitorDoc').locator('body').innerText({ timeout: 10000 }).then((t) => t.length).catch(() => 0);
      reg('Marketing: documento abre dentro da página', n > 200, `${n} caracteres`);
    }
    await p.context().close();
  });

  // 8. Convite pela Central
  await passo('convite pela Central', async () => {
    const p = await entrar('adm');
    await abrirAba(p, 'convites'); await p.waitForSelector('#cvEmail');
    await p.selectOption('#cvTipo', 'artista'); await p.waitForTimeout(300);
    await p.fill('#cvNome', 'Convidada Teste E2E'); await p.fill('#cvEmail', email('convite')); await p.click('#cvOk');
    await p.waitForTimeout(3000);
    const c = await um(`select count(*)::int n from convites where email = ${lit(email('convite'))}`);
    const aviso = await p.$eval('dialog[open]', (d) => d.textContent).catch(() => '');
    reg('convite enviado pela Central fica registrado', c.n === 1, `${c.n} no banco${(await p.$('#cverr')) ? ' · ' + (await texto(p, '#cverr')).slice(0, 120) : ''}`);
    console.log(`info  aviso do envio do convite: ${limpo((aviso.match(/(✓|✕|⚠)[^.]*\./) || [''])[0]).slice(0, 160) || '(sem aviso)'}`);
    await p.context().close();
  });
} finally {
  reg('sem erro de JavaScript nas páginas', !errosJs.length, errosJs.map(limpo).join(' | ').slice(0, 300));
  await nav.close();
  // Erros recentes do login (sem e-mail): ajudam a achar a causa de envio que não sai.
  try {
    const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/analytics/endpoints/logs.all?sql=${encodeURIComponent("select timestamp, event_message from auth_logs where regexp_contains(event_message, '\"level\":\"error\"') order by timestamp desc limit 15")}&iso_timestamp_start=${encodeURIComponent(inicio)}`, { headers: { Authorization: `Bearer ${tok}` } });
    const j = await r.json();
    for (const l of j.result || []) { let m = l.event_message; try { const o = JSON.parse(m); m = `${o.path || ''} ${o.msg || ''} ${o.error || ''}`; } catch {} console.log(`info  erro do login: ${limpo(m)}`); }
    if (!(j.result || []).length) console.log(`info  nenhum erro do login nesta execução${j.error ? ` (consulta: ${limpo(JSON.stringify(j.error))})` : ''}`);
  } catch (e) { console.log(`info  registros do login indisponíveis: ${limpo(e.message)}`); }
  try { const s = await limpar(); reg('limpeza: nenhuma conta ou convite de teste sobrou', Number(s.contas) === 0 && Number(s.convites) === 0, `contas ${s.contas}, convites ${s.convites}`); }
  catch (e) { reg('limpeza', false, e.message); }
  const f = res.filter((x) => !x.ok).length;
  console.log(`\n${res.length - f} OK · ${f} FALHA`);
  process.exitCode = f ? 1 : 0;
}
