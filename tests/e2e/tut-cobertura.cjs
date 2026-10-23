// Regra: todo primeiro acesso abre o tutorial, e ele passa por TODAS as abas daquele acesso.
const { chromium } = require('playwright');
const B = process.env.BASE || 'http://localhost:8790/'; const res = []; const ok = (c, m) => { res.push((c ? 'OK    ' : 'FALHA ') + m); if (!c) process.exitCode = 1; };
// Códigos do build local (scripts/testar-e2e.sh gera o arquivo): o primeiro de cada perfil.
const COD = {}; for (const [t, c] of require('fs').readFileSync(process.env.ACESSOS || '/tmp/tq-acessos.tsv', 'utf8').trim().split('\n').map((l) => l.split('\t'))) COD[t] ||= c;
async function novo(b, largura = 1280) {
  const ctx = await b.newContext({ viewport: { width: largura, height: 860 } });
  await ctx.route('**/config.js', (r) => r.fulfill({ contentType: 'application/javascript', body: 'window.TQ_CONFIG = {};' }));
  const p = await ctx.newPage(); p.erros = []; p.on('pageerror', (e) => p.erros.push(e.message)); p.on('dialog', (d) => d.accept()); return p;
}
// Lê as abas do menu e confere: tutorial aberto, todas as abas explicadas, número de passos igual ao roteiro.
async function confere(p, roteiro, rotulo) {
  await p.waitForSelector('.tour-caixa', { timeout: 8000 });
  const r = await p.evaluate((roteiro) => {
    const abas = [...new Set([...document.querySelectorAll('[data-aba]')].map((b) => b.dataset.aba))];
    const passos = TQTour.passosDe(roteiro, (a) => abas.includes(a));
    const explicadas = new Set(passos.flatMap((x) => [...(x.cobre || []), ...(x.ir ? [x.ir[0]] : []), ...(x.soSe ? [x.soSe] : [])]));
    return { abas, faltam: abas.filter((a) => !explicadas.has(a)), n: passos.length, pontos: document.querySelectorAll('.tour-pontos button').length, tag: document.querySelector('.tour-caixa .tag').textContent };
  }, roteiro);
  ok(r.faltam.length === 0 && r.abas.length > 1, `${rotulo}: tutorial cobre as ${r.abas.length} abas${r.faltam.length ? ' (faltam: ' + r.faltam.join(', ') + ')' : ''}`);
  ok(r.pontos === r.n && /^Tutorial/.test(r.tag), `${rotulo}: abre sozinho no primeiro acesso com ${r.n} passos`);
  // Percorre até o fim: todo atalho "Abrir…" leva para uma aba que existe.
  for (let i = 0; i < r.n; i++) {
    const ir = await p.$('.tour-caixa [data-tour="ir"]'); if (ir) { const aba = await ir.getAttribute('data-aba-tour'); if (!r.abas.includes(aba)) ok(false, `${rotulo}: atalho para aba inexistente ${aba}`); }
    await p.click('.tour-caixa [data-tour="avancar"]'); await p.waitForTimeout(60);
  }
  ok(!(await p.$('.tour-caixa')), `${rotulo}: "Concluir" fecha o tutorial`);
  return r;
}
(async () => {
  const b = await chromium.launch();
  try {
    for (const tipo of ['artista', 'casa']) {
      const p = await novo(b); await p.goto(B); await p.waitForSelector('.cidade'); await p.keyboard.press('Escape');
      await p.click('#entrar'); await p.click('[data-entrada="criar"]'); await p.waitForSelector('#enome');
      await p.click(`label:has(input[name="tipoNovo"][value="${tipo}"])`); await p.waitForTimeout(150);
      await p.fill('#enome', 'Teste ' + tipo); await p.fill('#email', tipo + '@tut.com'); await p.fill('#esenha', 'segredo123'); await p.press('#esenha', 'Enter');
      await confere(p, tipo, 'conta ' + tipo);
      ok(!p.erros.length, 'conta ' + tipo + ': sem erro JS ' + p.erros.join(' | ')); await p.context().close();
    }
    for (const tipo of ['equipe', 'adm']) {
      const p = await novo(b); await p.goto(B); await p.waitForSelector('.cidade'); await p.keyboard.press('Escape');
      await p.click('#entrar'); await p.click(`[data-demo="${tipo}"]`);
      await confere(p, tipo, 'conta ' + tipo);
      if (tipo === 'equipe') {
        // Quem viu o tutorial antes das partes novas recebe só as novidades.
        await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('tq-demo-v1')); d.usuarios[d.sessao].perfil.tutorial_visto_em = '2026-10-01T10:00:00Z'; localStorage.setItem('tq-demo-v1', JSON.stringify(d)); });
        await p.reload(); await p.waitForSelector('.tour-caixa', { timeout: 8000 });
        const tag = await p.textContent('.tour-caixa .tag'), n = await p.$$eval('.tour-pontos button', (x) => x.length), tit = await p.textContent('#tourTit');
        ok(/^Novidades/.test(tag) && n === 4 && /Documentos/.test(tit), `conta equipe: quem já tinha visto recebe só as novidades (${n} passos, começa em "${tit}")`);
        await p.click('[data-tour="pular"]'); await p.reload(); await p.waitForTimeout(1500);
        ok(!(await p.$('.tour-caixa')), 'conta equipe: depois de ver as novidades, não abre de novo');
      }
      {
        // Conta de equipe/administração com o código interno colado: as abas do painel interno entram no menu e também precisam estar no tutorial.
        const r = await p.evaluate((tipo) => { const abas = [...new Set([...document.querySelectorAll('[data-aba]')].map((b) => b.dataset.aba).concat(PERFIS[tipo].abas.map((x) => x[0])))];
          const ps = TQTour.passosDe(tipo, (a) => abas.includes(a)); const ex = new Set(ps.flatMap((x) => [...(x.cobre || []), ...(x.ir ? [x.ir[0]] : [])]));
          return { n: abas.length, faltam: abas.filter((a) => !ex.has(a)) }; }, tipo);
        ok(!r.faltam.length, `conta ${tipo} com código interno: tutorial cobre as ${r.n} abas${r.faltam.length ? ' (faltam: ' + r.faltam.join(', ') + ')' : ''}`);
      }
      ok(!p.erros.length, 'conta ' + tipo + ': sem erro JS ' + p.erros.join(' | ')); await p.context().close();
    }
    for (const [tipo, roteiro] of [['artista', 'codigo_artista'], ['casa', 'codigo_casa'], ['equipe', 'codigo_interno'], ['adm', 'codigo_interno']]) {
      const p = await novo(b); await p.goto(B + '#c=' + COD[tipo]);
      await confere(p, roteiro, 'código ' + tipo);
      if (tipo === 'casa') {
        await p.evaluate(() => localStorage.setItem('tq-tutorial-codigo-casa', '2026-10-01T10:00:00Z')); await p.goto('about:blank'); await p.goto(B + '#c=' + COD[tipo]);
        await p.waitForSelector('.tour-caixa', { timeout: 8000 });
        ok(/^Novidades/.test(await p.textContent('.tour-caixa .tag')) && /Dúvidas/.test(await p.textContent('#tourTit')), 'código casa: novidades para quem já tinha visto');
      }
      ok(!p.erros.length, 'código ' + tipo + ': sem erro JS ' + p.erros.join(' | ')); await p.context().close();
    }
  } catch (e) { ok(false, 'quebrou: ' + e.message.split('\n')[0]); }
  console.log(res.join('\n')); await b.close();
})();
