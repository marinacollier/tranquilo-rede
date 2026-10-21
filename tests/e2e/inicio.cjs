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
    await c.addInitScript(() => { try { localStorage.setItem('tq-tutorial-publico', '1'); localStorage.setItem('tq-consentimento', 'tudo'); } catch {} });
    const p = await c.newPage(); p.on('pageerror', (e) => erros.push(e.message));
    await p.goto(U); await p.waitForTimeout(1200); await p.click('#entrar'); await p.waitForTimeout(200);
    await p.click('[data-demo="' + demo + '"]'); await p.waitForSelector('.tour-caixa'); await p.click('[data-tour="pular"]');
    ok(/Comece por aqui/.test(await p.textContent('#app')), nome + ': entra no Comece por aqui');
    // em produção a equipe recebe o pacote de métricas pelo código interno; aqui simulamos com o código
    await p.evaluate(async (cod) => { S.pac = await abrirPacote(cod); render(); }, cod); await p.waitForTimeout(400);
    ok(/de 50 datas este mês/.test(await p.textContent('#app')), nome + ': mostra datas do mês e alertas');
    await p.screenshot({ path: out + '/inicio-' + nome + '.png', fullPage: true });
    await p.click('.atalho:nth-child(3)'); await p.waitForTimeout(300);
    ok(/Chamar quem já está na rede/.test(await p.textContent('#app')), nome + ': atalho abre Convites');
    await c.close();
  }
  ok(erros.length === 0, 'sem erros de JavaScript ' + erros.join(' | '));
  await b.close();
})();
