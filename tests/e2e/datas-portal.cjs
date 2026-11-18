// Criar datas no portal (Central) e ver a data na casa e no contrato.
const { chromium } = require('playwright');
const B = process.env.BASE || 'http://localhost:8790/'; const res = []; const ok = (c, m) => { res.push((c ? 'OK    ' : 'FALHA ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch(); const erros = [];
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route('**/config.js*', (r) => r.fulfill({ contentType: 'application/javascript', body: 'window.TQ_CONFIG = {};' }));
  await ctx.addInitScript(() => { try { localStorage.setItem('tq-consentimento', 'tudo'); localStorage.setItem('tq-sem-trilha', '1'); } catch {} });
  const p = await ctx.newPage(); p.on('pageerror', (e) => erros.push(e.message)); p.on('dialog', (d) => d.accept());
  const ir = async (k) => { await p.evaluate((k) => { const a = TQConta.areaDe?.(k); if (a) { S.sub = S.sub || {}; S.sub[a] = k; S.aba = a; } else S.aba = k; render(); }, k); await p.waitForTimeout(600); };
  try {
    await p.goto(B); await p.waitForSelector('.cidade'); await p.keyboard.press('Escape');
    // casa se cadastra
    await p.click('#entrar'); await p.click('[data-entrada="criar"]'); await p.waitForSelector('#enome');
    await p.click('label:has(input[name="tipoNovo"][value="casa"])'); await p.waitForTimeout(200);
    await p.fill('#enome', 'Casa Agenda'); await p.fill('#email', 'agenda@teste.com'); await p.fill('#esenha', 'segredo123'); await p.press('#esenha', 'Enter');
    await p.waitForSelector('[data-aba="ficha"]', { timeout: 8000 }); await p.click('[data-tour="pular"]').catch(() => {});
    await p.fill('[data-k="nome"]', 'Casa Agenda'); await p.fill('[data-k="cidade_uf"]', 'Recife/PE'); await p.waitForTimeout(1600);
    await p.click('#sair'); await p.waitForTimeout(500);
    // equipe cria a data
    await p.click('#entrar'); await p.waitForSelector('[data-demo="equipe"]'); await p.click('[data-demo="equipe"]'); await p.waitForTimeout(900); await p.keyboard.press('Escape');
    ok((await p.evaluate(() => TQConta.areaDe('datas_portal'))) === 'g_datas', 'Central tem "Criar datas" (em Datas) no menu');
    await ir('datas_portal'); await p.waitForSelector('#dpDia', { timeout: 5000 });
    await p.click('[data-dp-salvar]'); await p.waitForTimeout(200);
    ok(/^✕ Erro: Não salvou: falta o dia, a casa, pelo menos um artista/.test(await p.textContent('#dpErr')), 'sem dia, casa e artista não salva e diz o que falta');
    const dia = new Date(Date.now() + 10 * 864e5).toISOString().slice(0, 10);
    await p.fill('#dpDia', dia); await p.dispatchEvent('#dpDia', 'change'); await p.waitForTimeout(400);
    ok(/Nenhuma casa livre neste dia/.test(await p.textContent('#dpCasa')), 'sem disponibilidade marcada, a Nova data não oferece casa nenhuma');
    // Casa e artistas confirmaram por fora (sem conta no portal): Exceção libera todos.
    await p.check('[data-dp-exc]'); await p.waitForTimeout(400);
    ok(await p.inputValue('#dpDia') === dia, 'ligar a exceção não perde o dia');
    await p.fill('#dpAbre', '20:00'); await p.selectOption('#dpProd', 'Descubra');
    ok(/Casa Agenda · Recife\/PE · não marcou este dia como livre/.test(await p.textContent('#dpCasa')), 'com a Exceção, a casa aparece com o motivo de não estar livre');
    await p.selectOption('#dpCasa', await p.$eval('#dpCasa', (s) => [...s.options].find((o) => o.textContent.startsWith('Casa Agenda · Recife/PE')).value)); await p.waitForTimeout(300);
    await p.fill('[data-dp-art="0"]', 'Ana Teste'); await p.fill('[data-dp-art="1"]', 'Banda Dois'); await p.check('[data-dp-prod="1"]');
    await p.click('[data-dp-salvar]'); await p.waitForTimeout(800);
    ok(/^✓ Feito: Data criada/.test(await p.textContent('#dpErr')) && /Ana Teste, Banda Dois ainda não tem conta/.test(await p.textContent('#dpErr')), 'data criada; avisa quem ainda não tem conta');
    ok(/Casa Agenda/.test(await p.innerText('#app')) && /Abertura 20:00/.test(await p.innerText('#app')), 'data aparece na lista com casa e abertura');
    await p.click('[data-dp-contrato]'); await p.waitForTimeout(600);
    ok(await p.$eval('#ctEv', (s) => s.value.startsWith('p:')), '"Preparar contrato" abre o contrato já com a data');
    await p.click('#sair'); await p.waitForTimeout(500);
    // a casa vê a data
    await p.click('#entrar'); await p.fill('#email', 'agenda@teste.com'); await p.fill('#esenha', 'segredo123'); await p.press('#esenha', 'Enter'); await p.waitForSelector('#side:not([hidden])', { timeout: 10000 }).catch(() => {}); await p.waitForTimeout(600);
    await p.click('[data-tour="pular"]').catch(() => {});
    await ir('cronograma');
    const t = await p.innerText('#app');
    ok(/Ana Teste/.test(t) && /Banda Dois/.test(t), 'a casa vê a data nos Cronogramas, com o line-up ' + (/Ana Teste/.test(t) ? '' : JSON.stringify([await p.evaluate(() => [S.aba, S.sub, TQConta.areaDe('cronograma')]), t.slice(0, 300)])));
    ok(/20h/.test(t) && /Quem toca por último passa o som primeiro/.test(t), 'mensagem de cronograma sai com a abertura das 20h');
    ok(!erros.length, 'sem erro JS ' + erros.join(' | '));
  } catch (e) { ok(false, 'erro no teste: ' + e.message); }
  finally { await b.close(); console.log(res.join('\n')); }
})();
