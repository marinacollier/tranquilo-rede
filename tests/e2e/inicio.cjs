// Gerado a partir dos testes manuais da sessão de QA. Rode com: scripts/testar-e2e.sh
const BASE = process.env.BASE || 'http://localhost:8077/';
const COD = Object.fromEntries(require('fs').readFileSync(process.env.ACESSOS || '/tmp/tq-acessos.tsv', 'utf8').trim().split('\n').map((l) => l.split('\t')).filter((c) => ['adm', 'equipe'].includes(c[0]) || ['Joyce Alane', 'Coringa Madá'].includes(c[2])).map((c) => [c[0] === 'artista' || c[0] === 'casa' ? c[0] : c[0], c[1].replace(/-/g, '')]));
const { chromium } = require('playwright');
const out = (process.argv[2] || '/tmp'), U = BASE;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALHA') + ' ' + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch(); const erros = [];
  for (const [nome, vp, cod, demo] of [['adm-d', { width: 1366, height: 860 }, COD.adm, 'adm'], ['eq-m', { width: 390, height: 844 }, COD.equipe, 'equipe']]) {
    const c = await b.newContext({ viewport: vp }); await c.route(/supabase\.co/, (r) => r.abort());
    await c.addInitScript(() => { try { localStorage.setItem('tq-tutorial-publico', '1'); localStorage.setItem('tq-consentimento', 'tudo'); localStorage.setItem('tq-sem-trilha', '1'); } catch {} });
    const p = await c.newPage(); p.on('pageerror', (e) => erros.push(e.message));
    await p.goto(U); await p.waitForTimeout(1200); await p.click('#entrar'); await p.waitForTimeout(200);
    await p.click('[data-demo="' + demo + '"]'); await p.waitForSelector('.tour-caixa'); await p.click('[data-tour="pular"]');
    ok(/Comece por aqui/.test(await p.textContent('#app')), nome + ': entra no Comece por aqui');
    // em produção a equipe recebe o pacote de métricas pelo código interno; aqui simulamos com o código
    await p.evaluate(async (cod) => { S.pac = await abrirPacote(cod); render(); }, cod); await p.waitForTimeout(400);
    ok(/de 50 datas este mês/.test(await p.textContent('#app')), nome + ': mostra datas do mês e alertas');
    await p.screenshot({ path: out + '/inicio-' + nome + '.png', fullPage: true });
    if (demo === 'adm') {
      // Por ação (Marina, 18/11/2026): o que trava o evento mais próximo vem primeiro; cada linha abre o item.
      await p.evaluate(() => { const ag = new Date().toISOString(), h = ag.slice(0, 10), ev = [...(S.pac?.eventos || []).filter((e) => !e.z && e.d >= h), ...(S.eq.datasP || []).filter((x) => x.status !== 'cancelada' && String(x.dia).slice(0, 10) >= h).map((x) => ({ id: 'p:' + x.id, d: String(x.dia).slice(0, 10) }))].sort((a, b) => a.d.localeCompare(b.d))[0];
        S.eq.contr = [{ id: 'ct-x', user_id: 'u-x', titulo: 'Contrato X', status: 'enviado', campos: [], dados: {}, evento_id: ev?.id || null }]; S.eq.arqs = [{ evento_id: 'contrato_ct-x', nome: '1-a.pdf', caminho: 'a', em: ag }]; render(); });
      const prim = await p.$$eval('#filaPrimeiro .bloco-acao h3', (xs) => xs.map((x) => x.textContent));
      ok(/Conferir contrato assinado \(1\)/.test(prim[0] || ''), nome + ': "Vale olhar primeiro" por ação, começando pelo que trava o evento mais próximo (' + prim.join(' | ') + ')');
      const linha = await p.$('#filaPrimeiro button.pend-linha[data-abrir="ct:ct-x"]');
      ok(!!linha && (await linha.evaluate((x) => getComputedStyle(x).cursor)) === 'pointer', nome + ': a linha do contrato é um botão com cursor de mão');
      await linha.focus(); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
      ok(await p.evaluate(() => S.ctFoco === 'ct-x' && S.sub[S.aba] === 'documentos'), nome + ': Enter na linha abre Contratos com aquele contrato em foco');
      await p.evaluate(() => { S.aba = 'inicio'; (S.sub ||= {})[TQConta.areaDe('inicio')] = 'inicio'; S.aba = TQConta.areaDe('inicio'); render(); });
      // Linhas do mesmo evento ficam juntas: cabeçalho da data (abre o line-up e contratos) e, com mais de 3, recolhidas.
      await p.evaluate(() => { const d = new Date().toISOString().slice(0, 10); S.eq.contr = []; S.eq.arqs = [];
        S.eq.datasP = [...(S.eq.datasP || []), { id: 'dp-grupo', dia: d, casa_nome: 'TESTE Sala Jabuticaba', cidade: 'Recife/PE', produto: 'Descubra', status: 'confirmada', abertura: '19:00:00', artistas: ['Duo Maré Alta', 'Nina Sol', 'Duo Brisa', 'Lia Mar'].map((nome, i) => ({ nome, ordem: i + 1, user_id: 'u-g' + i })) }];
        S.aba = TQConta.areaDe('inicio') || 'inicio'; render(); });
      const bloco = '#filaPrimeiro .bloco-acao:has(h3:has-text("Preparar contrato de artista"))';
      await p.$$eval(bloco + ' details.pend-mais', (xs) => xs.forEach((x) => (x.open = true)));
      const grupo = await p.$(bloco + ' .pend-grupo:has(.pend-ev[data-abrir="lp:dp-grupo"])');
      ok(!!grupo && /Sala Jabuticaba · Descubra · 4 artistas sem contrato/.test(await grupo.textContent()) && !!(await grupo.$('details.pend-exp')) && !(await grupo.$('details.pend-exp[open]')), nome + ': artistas da mesma data juntos sob um cabeçalho ("4 artistas sem contrato"), recolhidos por ter mais de 3');
      await grupo.$eval('.pend-ev', (x) => x.click()); await p.waitForTimeout(300);
      ok(await p.evaluate(() => S.lpAberto === 'dp-grupo' && S.sub[S.aba] === 'documentos'), nome + ': o cabeçalho do evento abre o quadro Line-up e contratos da data');
      await p.evaluate(() => { S.eq.datasP = S.eq.datasP.filter((x) => x.id !== 'dp-grupo'); S.aba = TQConta.areaDe('inicio') || 'inicio'; render(); });
    }
    await p.click('.atalho:nth-child(3)'); await p.waitForTimeout(300);
    ok(/Chamar quem já está na rede/.test(await p.textContent('#app')), nome + ': atalho abre Convites');
    await c.close();
  }
  ok(erros.length === 0, 'sem erros de JavaScript ' + erros.join(' | '));
  await b.close();
})();
