// Piloto com parceiros (Thales e Marina, 24/11/2026) e começo do relógio: a adm vê as casas com data nas próximas
// 3 semanas, escolhe as do piloto, convida a casa e os artistas sem conta com tudo pronto; prazo vencido antes do começo
// do relógio não aparece como atrasado.
const { chromium } = require('playwright');
const B = process.env.BASE || 'http://localhost:8790/'; const res = []; const ok = (c, m) => { res.push((c ? 'OK    ' : 'FALHA ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch(); const erros = [];
  const dia = (n) => new Date(Date.now() - 3 * 3600e3 + n * 864e5).toISOString().slice(0, 10);
  const antes = new Date(Date.now() - 864e5).toISOString();
  const U = (id, tipo, nome, extra = {}) => [id, { senha: 'segredo123', perfil: { id, email: id + '@teste.invalid', nome, tipo, codigo_acesso: null, vinculo_nome: extra.vinculo || null, criado_em: antes, tutorial_visto_em: antes, senha_definida: true, ...(extra.areas ? { areas: extra.areas } : {}) } }];
  const db = { sessao: null, insc: {}, reg: [], conv: {}, avisos: [], modContr: [], arqs: [], eqc: [], chk: [], contr: [],
    usuarios: Object.fromEntries([U('adm', 'adm', 'Adm Teste'), U('gui', 'equipe', 'Gui Teste', { areas: ['operacoes'] }), U('cx', 'casa', 'Casa Com Conta', { vinculo: 'Casa Com Conta' }), U('a1', 'artista', 'Artista Com Conta', { vinculo: 'Artista Com Conta' })]),
    casas: { cx: { id: 'c-cx', user_id: 'cx', dados: { nome: 'Casa Com Conta', whatsapp: '81988887777' }, status: 'habilitada', pendencias: { habilitacao: [], match: [], enriquecimento: [] }, criado_em: antes, enviado_em: antes } },
    datasP: [
      { id: 'd1', dia: dia(6), casa_id: 'c-cx', casa_nome: 'Casa Com Conta', produto: 'Descubra', cidade: 'Recife/PE', abertura: '19:00', status: 'confirmada', criado_em: antes, artistas: [{ nome: 'Artista Com Conta', user_id: 'a1', ordem: 1 }, { nome: 'Artista Sem Conta', user_id: null, ordem: 2 }] },
      { id: 'd2', dia: dia(12), casa_id: null, casa_nome: 'Casa Sem Conta', produto: 'Apresenta', cidade: 'Santos/SP', abertura: '19:00', status: 'confirmada', criado_em: antes, artistas: [{ nome: 'Artista Dois', user_id: null, ordem: 1 }] },
      { id: 'd3', dia: dia(40), casa_id: null, casa_nome: 'Casa Distante', produto: 'Apresenta', cidade: 'Santos/SP', abertura: '19:00', status: 'confirmada', criado_em: antes, artistas: [] }] };
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  // Começo do relógio amanhã: tudo o que venceu antes não é atraso.
  await ctx.route('**/config.js*', (r) => r.fulfill({ contentType: 'application/javascript', body: `window.TQ_CONFIG = {}; window.TQ_INICIO_MODELO = "${dia(1)}";` }));
  await ctx.addInitScript((d) => { try { localStorage.setItem('tq-consentimento', 'tudo'); localStorage.setItem('tq-sem-trilha', '1'); localStorage.setItem('tq-tutorial-publico', '1'); if (!localStorage.getItem('tq-demo-v1')) localStorage.setItem('tq-demo-v1', d); } catch {} }, JSON.stringify(db));
  const q = await ctx.newPage(); q.on('pageerror', (e) => erros.push(e.message)); q.on('dialog', (d) => d.accept());
  const entrar = async (uid) => { await q.goto(B); await q.waitForSelector('.cidade'); await q.click('#entrar'); await q.waitForSelector('#esenha'); await q.waitForTimeout(300); await q.fill('#email', uid + '@teste.invalid'); await q.fill('#esenha', 'segredo123'); await q.click('#eok'); await q.waitForTimeout(800); try { await q.click('[data-tour="pular"]', { timeout: 1500 }); } catch {} };
  const sair = async () => { await q.click('#sair'); await q.waitForTimeout(300); };
  const ir = (k) => q.evaluate((k) => { const a = TQConta.areaDe(k); if (a) { S.sub = S.sub || {}; S.sub[a] = k; S.aba = a; } else S.aba = k; render(); }, k);
  try {
    await entrar('gui'); await ir('hoje'); await q.waitForSelector('details[data-dobra="md-painel"]', { timeout: 6000 });
    ok(/· 0 atrasados ·/.test(await q.textContent('details[data-dobra="md-painel"] summary')), 'começo do relógio: prazo vencido antes do início não aparece como atrasado');
    ok(!/piloto/.test(await q.evaluate(() => [...document.querySelectorAll('[data-sub]')].map((x) => x.dataset.sub).join(' '))), 'equipe não vê o Piloto (só a adm)');
    await sair();
    await entrar('adm'); await ir('piloto'); await q.waitForSelector('[data-piloto]', { timeout: 6000 });
    const t = await q.textContent('#app');
    ok(/Piloto com parceiros/.test(t) && /Casa Com Conta/.test(t) && /Casa Sem Conta/.test(t) && !/Casa Distante/.test(t), 'adm: candidatas são as casas com data nas próximas 3 semanas');
    ok(/✅ casa já tem conta/.test(t) && /casa ainda sem conta/.test(t), 'adm: mostra quem já tem conta');
    await q.click('[data-piloto="Casa Sem Conta"]'); await q.waitForTimeout(300);
    ok(/1 casa escolhida/.test(await q.textContent('#app')) && !!(await q.$('[data-piloto-convidar="casa|Casa Sem Conta"]')), 'adm: escolhe a casa do piloto e aparecem os convites');
    const wa = await q.$eval('a[href*="wa.me"]', (a) => decodeURIComponent(a.href));
    ok(/piloto da Rede Tranquilo/.test(wa) && /dias livres/.test(wa), 'adm: boas-vindas da casa prontas no WhatsApp');
    ok(!!(await q.$('[data-piloto-convidar="artista|Artista Dois"]')), 'adm: artista sem conta tem "Convidar"');
    await q.click('[data-piloto-convidar="casa|Casa Sem Conta"]'); await q.waitForSelector('#cvNome', { timeout: 6000 });
    ok((await q.inputValue('#cvNome')) === 'Casa Sem Conta' && (await q.inputValue('#cvTipo')) === 'casa', 'adm: "Convidar a casa" abre o convite já preenchido (casa e nome)');
    await ir('piloto'); await q.waitForTimeout(300); await q.click('details[data-dobra="piloto-equipe"] summary'); await q.waitForTimeout(150);
    ok(/economizar tempo desde o primeiro dia/.test(await q.inputValue('#pilotoMsgEq')), 'adm: mensagem para a equipe pronta para copiar');
    await sair();
  } catch (e) { ok(false, 'quebrou: ' + e.message.split('\n')[0]); }
  ok(!erros.length, 'sem erro JS ' + erros.join(' | '));
  console.log(res.join('\n')); await b.close();
})();
