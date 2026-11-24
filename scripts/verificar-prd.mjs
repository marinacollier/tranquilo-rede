// Teste ponta a ponta em PRODUÇÃO com uma conta de equipe temporária (pedido da Marina, 24/11/2026).
// Cria a conta (e-mail .invalid, senha aleatória que nunca aparece), entra no portal de produção como equipe das 3 áreas,
// confere o Para você e o Acompanhamento contra o Notion (nenhuma data cancelada, pacote interno abrindo com a chave
// nova, SOS com foco, sem tela de adm, sem erro de JS) e APAGA a conta no fim, mesmo se algo falhar.
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
const tok = process.env.SUPABASE_ACCESS_TOKEN, ref = 'cgujgstuviuolzcpkakl', SB = `https://${ref}.supabase.co`, SITE = 'https://marinacollier.github.io/tranquilo-rede/prd/';
const sql = async (query) => { const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, { method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) }); if (!r.ok) throw new Error(`SQL ${r.status}: ${(await r.text()).slice(0, 200)}`); return r.json(); };
const chaves = await (await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${tok}` } })).json();
const serv = (chaves.find?.((k) => k.name === 'service_role') || chaves.find?.((k) => k.type === 'secret'))?.api_key; console.log(`::add-mask::${serv}`);
const H = { apikey: serv, Authorization: `Bearer ${serv}`, 'Content-Type': 'application/json' };
const email = `verificacao-${Date.now()}@tranquilo.invalid`, senha = randomBytes(18).toString('base64url'); console.log(`::add-mask::${senha}`);
const res = []; const ok = (c, m) => { res.push((c ? 'OK    ' : 'FALHA ') + m); if (!c) process.exitCode = 1; };
let uid = null;
try {
  const r = await fetch(`${SB}/auth/v1/admin/users`, { method: 'POST', headers: H, body: JSON.stringify({ email, password: senha, email_confirm: true, user_metadata: { nome: 'Verificação Automática', tipo: 'equipe' } }) });
  const u = await r.json(); uid = u.id || u.user?.id; if (!uid) throw new Error('não criou a conta: ' + JSON.stringify(u).slice(0, 120));
  await sql(`select set_config('tq.sistema', '1', true); update perfis set tipo = 'equipe', nome = 'Verificação Automática', areas = array['operacoes','agenda','marketing'], senha_definida = true, tutorial_visto_em = now() where id = '${uid}'`);
  // Datas canceladas no Notion (retrato de hoje), futuras.
  const hoje = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
  const b = await chromium.launch(), p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage(), erros = [];
  p.on('pageerror', (e) => erros.push(e.message));
  await p.addInitScript(() => { try { localStorage.setItem('tq-consentimento', 'tudo'); localStorage.setItem('tq-tutorial-publico', '1'); localStorage.setItem('tq-sem-trilha', '1'); } catch {} });
  await p.goto(SITE + '?x=' + Date.now()); await p.waitForSelector('#entrar', { timeout: 30000 }); await p.click('#entrar'); await p.waitForSelector('#esenha'); await p.waitForTimeout(1500);
  await p.fill('#email', email); await p.fill('#esenha', senha); await p.click('#eok');
  for (let i = 0; i < 30 && !(await p.evaluate(() => !!window.S?.pac)); i++) await p.waitForTimeout(1000);
  const pac = await p.evaluate(() => ({ perfil: S.pac?.perfil, gerado: S.pac?.geradoEm, total: (S.pac?.eventos || []).length, cancFut: (S.pac?.eventos || []).filter((e) => e.z && e.d >= new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10)).map((e) => e.id) }));
  ok(pac.perfil === 'equipe' && pac.total > 200, `pacote interno da equipe abre com a chave nova (${pac.total} eventos, gerado ${String(pac.gerado).slice(0, 10)})`);
  try { await p.click('[data-tour="pular"]', { timeout: 1500 }); } catch {}
  await p.evaluate(() => { const a = TQConta.areaDe('hoje'); if (a) { S.sub = S.sub || {}; S.sub[a] = 'hoje'; S.aba = a; } else S.aba = 'hoje'; render(); });
  await p.waitForSelector('details[data-dobra="md-painel"]', { timeout: 20000 }); await p.waitForTimeout(2500);
  const resumo = (await p.textContent('details[data-dobra="md-painel"] summary')).replace(/\s+/g, ' ').trim();
  ok(/Seu modelo de trabalho/.test(resumo), `Para você abre o painel do modelo (${resumo})`);
  await p.click('details[data-dobra="md-painel"] summary'); await p.waitForTimeout(400);
  const painel = await p.textContent('details[data-dobra="md-painel"]');
  ok(/SOS: os \d+ mais urgentes|Nenhum SOS aberto/.test(painel), 'SOS com foco (os mais urgentes) ou nenhum SOS');
  await p.evaluate(() => { const a = TQConta.areaDe('acompanhamento'); if (a) { S.sub = S.sub || {}; S.sub[a] = 'acompanhamento'; S.aba = a; } else S.aba = 'acompanhamento'; render(); });
  await p.waitForSelector('.md-kpis', { timeout: 20000 }); await p.waitForTimeout(1500);
  const datas = await p.$$eval('details[data-dobra^="md-data:"]', (xs) => xs.map((x) => x.dataset.dobra.slice(8)));
  const canc = datas.filter((d) => pac.cancFut.includes(d));
  ok(datas.length > 0 && !canc.length, `Acompanhamento: ${datas.length} datas, nenhuma das ${pac.cancFut.length} canceladas no Notion aparece`);
  ok(!/Desempenho da equipe/.test(await p.textContent('body')), 'equipe não vê o Desempenho (só a adm)');
  ok(!erros.length, 'sem erro de JS ' + erros.join(' | ').slice(0, 200));
  await b.close();
} catch (e) { ok(false, 'quebrou: ' + String(e.message).split('\n')[0].slice(0, 200)); }
finally {
  if (uid) { await sql(`delete from diario where user_id = '${uid}'`).catch(() => {}); const d = await fetch(`${SB}/auth/v1/admin/users/${uid}`, { method: 'DELETE', headers: H }); ok(d.ok, `conta temporária apagada (HTTP ${d.status})`); }
  const sobra = await sql(`select count(*)::int n from perfis where email like 'verificacao-%@tranquilo.invalid'`); ok(sobra[0].n === 0, 'nenhuma conta de verificação sobrou em produção');
  console.log(res.join('\n'));
}
