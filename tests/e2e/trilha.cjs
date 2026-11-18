// Trilha da casa e do artista (pedido da Marina, 17/11/2026): o menu libera cada parte conforme o caminho anda.
const { chromium } = require('playwright');
const B = process.env.BASE || 'http://localhost:8790/'; const res = []; const ok = (c, m) => { res.push((c ? 'OK    ' : 'FALHA ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch(); const erros = [];
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route('**/config.js*', (r) => r.fulfill({ contentType: 'application/javascript', body: 'window.TQ_CONFIG = {};' }));
  await ctx.addInitScript(() => { try { localStorage.setItem('tq-consentimento', 'tudo'); localStorage.setItem('tq-tutorial-publico', '1'); } catch {} });
  const p = await ctx.newPage(); p.on('pageerror', (e) => erros.push(e.message)); p.on('dialog', (d) => d.accept());
  const pular = async () => { try { await p.waitForSelector('.tour-caixa', { timeout: 2500 }); await p.click('[data-tour="pular"]'); } catch {} };
  const criar = async (tipo, nome, email) => { await p.click('#entrar'); await p.click('[data-entrada="criar"]'); await p.waitForSelector('#enome'); await p.click(`label:has(input[name="tipoNovo"][value="${tipo}"])`); await p.fill('#enome', nome); await p.fill('#email', email); await p.fill('#esenha', 'segredo123'); await p.press('#esenha', 'Enter'); await p.waitForSelector('#side:not([hidden])', { timeout: 10000 }); await pular(); await p.waitForTimeout(400); };
  const travados = () => p.$$eval('#tabs button.trava', (xs) => xs.map((x) => x.dataset.aba));
  try {
    await p.goto(B); await p.waitForSelector('.cidade'); await p.keyboard.press('Escape');
    // Casa nova: só Próximos passos e Cadastro liberados.
    await criar('casa', 'Casa Trilha', 'trilha@casa.com');
    ok(JSON.stringify(await travados()) === JSON.stringify(['equipe_g', 'disp_g', 'contr_g']), 'casa nova: Equipe, Disponibilidade e Contrato travados');
    await p.evaluate(() => { S.aba = 'datas_casa'; S.sub = { datas_casa: 'passos' }; render(); }); await p.waitForTimeout(300);
    ok(/Sua trilha/.test(await p.innerText('#app')) && /Preencher e enviar o cadastro da casa/.test(await p.innerText('#app')), 'Próximos passos mostra a trilha da casa');
    await p.click('[data-aba="disp_g"]'); await p.waitForTimeout(300);
    ok(/Essa parte vem depois/.test(await p.innerText('#app')) && /libera quando o Gui habilitar a casa/.test(await p.innerText('#app')), 'parte travada explica o que falta');
    await p.evaluate(() => { S.conta.casa = { ...(S.conta.casa || {}), status: 'habilitada' }; render(); }); await p.waitForTimeout(200);
    ok(!(await travados()).includes('equipe_g') && (await travados()).includes('disp_g'), 'casa habilitada: Equipe liberada; Disponibilidade espera a equipe completa');
    await p.click('[data-aba="disp_g"]'); await p.waitForTimeout(300);
    ok(/libera quando a equipe da casa estiver completa \(faltam: Líder Local, Anfitrião, Social Media, Técnico de som, Porta e Reserva\)/.test(await p.innerText('#app')), 'Disponibilidade travada diz o motivo: o que falta na equipe');
    await p.evaluate(() => { S.conta.equipe = [['lider', 'Lia'], ['anfitriao', 'Ari'], ['social_media', 'Sol'], ['som', 'Sam']].map(([f, n], i) => ({ id: 'm' + i, nome: n, funcoes: [f], reserva: false })); render(); }); await p.waitForTimeout(200);
    await p.click('[data-aba="disp_g"]'); await p.waitForTimeout(300);
    ok((await travados()).includes('disp_g') && /faltam: Porta e Reserva/.test(await p.innerText('#app')), 'equipe quase completa: ainda travada, com "faltam: Porta e Reserva"');
    await p.evaluate(() => { S.conta.equipe = [...S.conta.equipe, { id: 'm8', nome: 'Pó', funcoes: ['porta'], reserva: false }, { id: 'm9', nome: 'Res', funcoes: ['porta'], reserva: true }]; render(); }); await p.waitForTimeout(200);
    ok(!(await travados()).includes('disp_g') && !(await travados()).includes('equipe_g'), 'equipe completa libera a Disponibilidade');
    await p.evaluate(() => document.querySelector('#sair')?.click()); await p.waitForTimeout(400);
    // Artista nova: Disponibilidade e Contrato travados até a curadoria.
    await criar('artista', 'Artista Trilha', 'trilha@art.com');
    { const t = await travados(); ok(t.includes('disp_artista') && t.includes('contratos_meus'), 'artista nova: Disponibilidade e Contrato travados (' + t.join(', ') + ')'); }
    await p.evaluate(() => { S.conta.insc = { ...(S.conta.insc || {}), status: 'aprovada', dados: {} }; render(); }); await p.waitForTimeout(200);
    ok(!(await travados()).includes('disp_artista'), 'curadoria aprovada libera a Disponibilidade');
  } catch (e) { ok(false, 'quebrou: ' + e.message.split('\n')[0]); }
  ok(!erros.length, 'sem erro JS ' + erros.join(' | '));
  console.log(res.join('\n')); await b.close();
})();
