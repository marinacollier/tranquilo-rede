// Controles do tutorial: Avançar/Voltar, × (fecha e continua depois), "Pular tutorial", "Concluir", "Ver de novo" e novidades.
const { chromium } = require('playwright');
const B = process.env.BASE || 'http://localhost:8790/'; const res = []; const ok = (c, m) => { res.push((c ? 'OK    ' : 'FALHA ') + m); if (!c) process.exitCode = 1; };
const COD = {}; for (const [t, c] of require('fs').readFileSync(process.env.ACESSOS || '/tmp/tq-acessos.tsv', 'utf8').trim().split('\n').map((l) => l.split('\t'))) COD[t] ||= c;
async function novo(b, largura = 1280) {
  const ctx = await b.newContext({ viewport: { width: largura, height: 860 } });
  await ctx.route('**/config.js', (r) => r.fulfill({ contentType: 'application/javascript', body: 'window.TQ_CONFIG = {};' }));
  await ctx.addInitScript(() => { try { localStorage.setItem('tq-consentimento', 'tudo'); } catch {} });
  const p = await ctx.newPage(); p.erros = []; p.on('pageerror', (e) => p.erros.push(e.message)); p.on('dialog', (d) => d.accept()); return p;
}
const tit = (p) => p.textContent('#tourTit');
const tag = (p) => p.textContent('.tour-caixa .tag');
const aberto = async (p, ms = 1500) => { try { await p.waitForSelector('.tour-caixa', { timeout: ms }); return true; } catch { return false; } };
(async () => {
  const b = await chromium.launch();
  try {
    // 1. Código de casa: primeiro acesso, ×, retomada, segundo ×, e o tutorial para de voltar.
    {
      const p = await novo(b); const url = B + '#c=' + COD.casa;
      await p.goto(url); ok(await aberto(p, 8000), 'código casa: tutorial abre sozinho no primeiro acesso');
      const t1 = await tit(p);
      ok(await p.isDisabled('[data-tour="voltar"]'), 'código casa: "Voltar" desabilitado no primeiro passo');
      await p.click('[data-tour="avancar"]'); const t2 = await tit(p);
      await p.keyboard.press('ArrowRight'); await p.keyboard.press('ArrowLeft');
      ok(t2 !== t1 && (await tit(p)) === t2, 'código casa: Avançar e setas do teclado mudam de passo');
      await p.mouse.click(5, 5); ok(await p.$('.tour-caixa') !== null, 'código casa: clicar fora da caixa não fecha');
      ok(await p.$('[data-tour="pular"]') !== null && await p.$('[data-tour="fechar"]') !== null, 'código casa: tem "Pular tutorial" e ×');
      await p.click('[data-tour="fechar"]');
      ok(!(await p.$('.tour-caixa')) && /pausado.*passo 2/.test(await p.textContent('.tour-aviso')), 'código casa: × fecha e avisa que continua do passo 2');
      await p.goto('about:blank'); await p.goto(url);
      ok(await aberto(p, 8000) && /^Continuando/.test(await tag(p)) && (await tit(p)) === t2, 'código casa: no acesso seguinte continua do mesmo passo');
      await p.keyboard.press('Escape');
      await p.goto('about:blank'); await p.goto(url); await p.waitForSelector('.quem, #app', { timeout: 8000 });
      ok(!(await aberto(p)), 'código casa: fechado de novo, não volta sozinho (conta como visto)');
      await p.click('#comoFunciona').catch(async () => { await p.click('#abrirMenu'); await p.click('#comoFunciona'); });
      ok(await aberto(p) && /^Tutorial/.test(await tag(p)) && (await p.$$eval('.tour-pontos button.on', (x) => x.length)) === 1 && (await tit(p)) === t1, '"Como funciona" abre o tutorial inteiro, do primeiro passo');
      ok(!p.erros.length, 'código casa: sem erro JS ' + p.erros.join(' | ')); await p.context().close();
    }
    // 2. Código de artista: "Pular tutorial" mostra onde rever e não volta mais.
    {
      const p = await novo(b); const url = B + '#c=' + COD.artista;
      await p.goto(url); await aberto(p, 8000); await p.click('[data-tour="pular"]');
      ok(/pulado.*Como funciona/.test(await p.textContent('.tour-aviso')), 'código artista: "Pular tutorial" avisa onde ver de novo');
      await p.goto('about:blank'); await p.goto(url); await p.waitForTimeout(1500);
      ok(!(await p.$('.tour-caixa')), 'código artista: depois de pular, não abre sozinho');
      ok(!p.erros.length, 'código artista: sem erro JS ' + p.erros.join(' | ')); await p.context().close();
    }
    // 3. Conta de artista: "Concluir", "Ver o tutorial de novo" (fechar no meio não muda nada) e o atalho que leva a uma aba.
    {
      const p = await novo(b); await p.goto(B); await p.waitForSelector('.cidade'); await p.keyboard.press('Escape');
      await p.click('#entrar'); await p.click('[data-entrada="criar"]'); await p.waitForSelector('#enome');
      await p.click('label:has(input[name="tipoNovo"][value="artista"])'); await p.fill('#enome', 'Ana Teste'); await p.fill('#email', 'ana@controles.com'); await p.fill('#esenha', 'segredo123'); await p.press('#esenha', 'Enter');
      ok(await aberto(p, 8000), 'conta artista: tutorial abre no primeiro acesso');
      const n = await p.$$eval('.tour-pontos button', (x) => x.length);
      for (let i = 1; i < n; i++) await p.click('[data-tour="avancar"]');
      ok(/Concluir/.test(await p.textContent('[data-tour="avancar"]')) && !(await p.$('[data-tour="pular"]')) && /Para ver de novo/.test(await p.textContent('.tour-caixa')), 'conta artista: último passo tem "Concluir" e diz onde ver de novo');
      await p.evaluate(() => document.querySelector('.tour-aviso')?.remove());   // aviso do tutorial de visitante, fechado no início
      await p.click('[data-tour="avancar"]'); ok(!(await p.$('.tour-caixa')) && !(await p.$('.tour-aviso')), 'conta artista: "Concluir" fecha sem aviso');
      await p.reload(); await p.waitForTimeout(1500); ok(!(await p.$('.tour-caixa')), 'conta artista: concluído, não abre de novo');
      await p.click('[data-aba="conta"]'); await p.click('[data-rever-tutorial]');
      ok(await aberto(p) && /^Tutorial/.test(await tag(p)), 'conta artista: "Ver o tutorial de novo" abre do começo');
      await p.click('[data-tour="avancar"]'); await p.click('[data-tour="fechar"]');
      ok(!(await p.$('.tour-aviso')), 'conta artista: fechar o "ver de novo" não mostra aviso de pausa');
      await p.reload(); await p.waitForTimeout(1500); ok(!(await p.$('.tour-caixa')), 'conta artista: fechar o "ver de novo" não faz o tutorial voltar sozinho');
      await p.click('[data-aba="conta"]'); await p.click('[data-rever-tutorial]'); await aberto(p);
      await p.click('[data-tour="avancar"]'); await p.click('[data-tour="ir"]');
      ok(!(await p.$('.tour-caixa')) && /Inscreva-se na rede/.test(await p.textContent('#app')), 'conta artista: atalho do passo leva para a aba');
      ok(!p.erros.length, 'conta artista: sem erro JS ' + p.erros.join(' | ')); await p.context().close();
    }
    // 4. Novidades: oferece o tutorial completo.
    {
      const p = await novo(b); await p.goto(B); await p.waitForSelector('.cidade'); await p.keyboard.press('Escape');
      await p.click('#entrar'); await p.click('[data-demo="equipe"]'); await aberto(p, 8000); await p.click('[data-tour="pular"]');
      await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('tq-demo-v1')); d.usuarios[d.sessao].perfil.tutorial_visto_em = '2026-10-01T10:00:00Z'; localStorage.setItem('tq-demo-v1', JSON.stringify(d)); });
      await p.reload(); ok(await aberto(p, 8000) && /^Novidades/.test(await tag(p)), 'novidades: abre só o que é novo');
      const nNov = await p.$$eval('.tour-pontos button', (x) => x.length);
      await p.click('[data-tour="completo"]');
      const nTudo = await p.$$eval('.tour-pontos button', (x) => x.length);
      ok(/^Tutorial/.test(await tag(p)) && nTudo > nNov, `novidades: "Ver o tutorial completo" abre os ${nTudo} passos`);
      ok(!p.erros.length, 'novidades: sem erro JS ' + p.erros.join(' | ')); await p.context().close();
    }
    // 5. Celular: botões cabem e têm área de toque.
    {
      const p = await novo(b, 360); await p.goto(B + '#c=' + COD.casa); await aberto(p, 8000);
      const r = await p.evaluate(() => { const q = (s) => document.querySelector(s).getBoundingClientRect(); return { sw: document.documentElement.scrollWidth, x: q('[data-tour="fechar"]').height, pular: q('[data-tour="pular"]').height, av: q('[data-tour="avancar"]').right }; });
      ok(r.sw <= 360 && r.av <= 360 && r.x >= 44 && r.pular >= 44, `celular: botões cabem na tela e têm 44px de toque (×${Math.round(r.x)}, pular ${Math.round(r.pular)})`);
      await p.context().close();
    }
  } catch (e) { ok(false, 'quebrou: ' + e.message.split('\n')[0]); }
  console.log(res.join('\n')); await b.close();
})();
