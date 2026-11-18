// Rodada final (18/11/2026): curadoria aprovando e reprovando, e o pedido de suporte "Algo deu errado?".
const { chromium } = require('playwright');
const B = process.env.BASE || 'http://localhost:8790/'; const res = []; const ok = (c, m) => { res.push((c ? 'OK    ' : 'FALHA ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch(); const erros = [];
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route('**/config.js*', (r) => r.fulfill({ contentType: 'application/javascript', body: 'window.TQ_CONFIG = {};' }));
  await ctx.addInitScript(() => { try { localStorage.setItem('tq-consentimento', 'tudo'); localStorage.setItem('tq-tutorial-publico', '1'); localStorage.setItem('tq-sem-trilha', '1'); localStorage.setItem('tq-dp-aberto', '1'); } catch {} });
  const p = await ctx.newPage(); p.on('pageerror', (e) => erros.push(e.message)); p.on('dialog', (d) => d.accept());
  const pular = async () => { try { await p.waitForSelector('.tour-caixa', { timeout: 2500 }); await p.click('[data-tour="pular"]'); } catch {} };
  const sair = async () => { await p.evaluate(() => document.querySelector('#sair')?.click()); await p.waitForTimeout(500); };
  const criar = async (nome, email) => {
    await p.click('#entrar'); await p.click('[data-entrada="criar"]'); await p.waitForSelector('#enome');
    await p.click('label:has(input[name="tipoNovo"][value="artista"])'); await p.fill('#enome', nome); await p.fill('#email', email); await p.fill('#esenha', 'segredo123'); await p.press('#esenha', 'Enter');
    await p.waitForSelector('#side:not([hidden])', { timeout: 10000 }); await pular();
    // Inscrição enviada para a curadoria (direto no banco de demonstração).
    await p.evaluate((nome) => { const d = JSON.parse(localStorage.getItem('tq-demo-v1')); d.insc = d.insc || {};
      d.insc[d.sessao] = { id: 'i-' + d.sessao, user_id: d.sessao, status: 'em_curadoria', criado_em: new Date().toISOString(), enviado_em: new Date().toISOString(),
        dados: { nome_artistico: nome, cidade_base: 'Recife', estado: 'PE', generos: 'MPB', release: 'x'.repeat(220), cidades_interesse: ['Recife'], formacao: 'solo', formato_interesse: 'descubra', rider_tipo: 'circulavel', aceita_bonus: 'true', aceite: 'true', whatsapp: '(81) 99999-1111' } };
      localStorage.setItem('tq-demo-v1', JSON.stringify(d)); }, nome);
    await p.reload(); await p.waitForTimeout(800); await pular();
    await sair();
  };
  const statusDe = (nome) => p.evaluate((nome) => Object.values(JSON.parse(localStorage.getItem('tq-demo-v1')).insc || {}).find((i) => i.dados?.nome_artistico === nome)?.status, nome);
  try {
    await p.goto(B); await p.waitForSelector('.cidade'); await p.keyboard.press('Escape');
    // Suporte: visitante conta o que aconteceu.
    await p.click('#relatar'); await p.waitForSelector('#relTxt'); await p.fill('#relTxt', 'Teste da rodada final: o botão de suporte abre e envia.'); await p.click('#relOk'); await p.waitForTimeout(800);
    { const t = await p.textContent('#dlgIn'); ok(/Recebido, obrigado|Não deu para enviar daqui/.test(t), '"Algo deu errado?" abre, envia e responde com clareza (' + t.slice(0, 60).replace(/\s+/g, ' ') + ')'); }
    await p.evaluate(() => document.querySelector('#dlg').open && document.querySelector('#dlg').close());
    await criar('Aprova Teste', 'aprova@cur.com');
    await criar('Reprova Teste', 'reprova@cur.com');
    // Isa (equipe) decide na curadoria.
    await p.click('#entrar'); await p.click('[data-demo="equipe"]'); await pular(); await p.waitForTimeout(500);
    for (const [nome, dec] of [['Aprova Teste', 'aprovada'], ['Reprova Teste', 'reprovada']]) {
      await p.evaluate(() => { const a = TQConta.areaDe('curadoria') || 'curadoria'; S.sub = S.sub || {}; S.sub[a] = 'curadoria'; S.aba = a; render(); }); await p.waitForTimeout(700);
      const linha = await p.$(`tr:has-text("${nome}")`); if (linha) await linha.click(); await p.waitForTimeout(600);
      const parecer = await p.$('#dlg textarea'); if (parecer) await parecer.fill(dec === 'aprovada' ? 'Bem-vinda à rede!' : 'Agora não é o momento, obrigado pela inscrição.');
      await p.click(`#dlg [data-decisao="${dec}"]`).catch(() => {}); if (dec === 'reprovada') await p.click('#dlg [data-conf-sim]').catch(() => {}); await p.waitForTimeout(800);
      ok(await statusDe(nome) === dec, `curadoria: ${nome} fica ${dec} (${await statusDe(nome)} · linha ${!!linha} · ${(await p.textContent('#dlgIn').catch(() => '')).slice(0, 80).replace(/\s+/g, ' ')})`);
      await p.evaluate(() => document.querySelector('#dlg')?.open && document.querySelector('#dlg').close());
    }
  } catch (e) { ok(false, 'quebrou: ' + e.message.split('\n')[0]); }
  ok(!erros.length, 'sem erro JS ' + erros.join(' | '));
  console.log(res.join('\n')); await b.close();
})();
