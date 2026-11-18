// "Seu histórico" (pedido da Marina, 18/11/2026: "fiz coisa e meu histórico continuou sem nada"), no modo demonstração:
// uma ação feita pela equipe, pela casa e pela artista aparece no histórico de cada um, agrupada por dia, com filtro por
// tipo, e a linha abre o item.
const { chromium } = require('playwright');
const B = process.env.BASE || 'http://localhost:8790/'; const res = []; const ok = (c, m) => { res.push((c ? 'OK    ' : 'FALHA ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch(); const erros = [];
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route('**/config.js*', (r) => r.fulfill({ contentType: 'application/javascript', body: 'window.TQ_CONFIG = {};' }));
  await ctx.addInitScript(() => { try { localStorage.setItem('tq-consentimento', 'tudo'); localStorage.setItem('tq-sem-trilha', '1'); localStorage.setItem('tq-dp-aberto', '1'); localStorage.setItem('tq-tutorial-publico', '1'); } catch {} });
  const p = await ctx.newPage(); p.on('pageerror', (e) => erros.push(e.message)); p.on('dialog', (d) => d.accept());
  const pular = async () => { try { await p.waitForSelector('.tour-caixa', { timeout: 3000 }); await p.click((await p.$('[data-tour="pular"]')) ? '[data-tour="pular"]' : '[data-tour="avancar"]'); } catch {} };
  const ir = async (k) => { await p.evaluate((k) => { const a = TQConta.areaDe?.(k) || k; S.sub = S.sub || {}; if (a !== k) S.sub[a] = k; S.aba = a; render(); }, k); await p.waitForTimeout(400); };
  const sair = async () => { await p.click('#sair'); await p.waitForTimeout(300); };
  const app = () => p.textContent('#app');
  const historico = async (k) => { await ir(k); await p.waitForSelector('[data-hist-linha], .vazio', { timeout: 5000 }); };
  const criar = async (tipo, nome, email) => {
    await p.goto(B); await p.waitForSelector('.cidade');
    await p.click('#entrar'); await p.click('[data-entrada="criar"]'); await p.waitForSelector('#enome');
    await p.click(`label:has(input[name="tipoNovo"][value="${tipo}"])`); await p.fill('#enome', nome); await p.fill('#email', email); await p.fill('#esenha', 'segredo123'); await p.press('#esenha', 'Enter'); await pular();
    await p.waitForTimeout(400);
  };
  try {
    // 1. Artista: salva a ficha e vê no histórico (aba própria no menu); a linha volta para a ficha.
    await criar('artista', 'Ana Histórico', 'ana@historico.com');
    ok(!!(await p.$('[data-aba="meu_hist"]')), 'artista tem "Seu histórico" no menu');
    await ir('inscricao'); await p.waitForSelector('#form');
    await p.fill('[data-k="nome_artistico"]', 'Ana Histórico'); await p.click('[data-salvar-parte="0"]'); await p.waitForTimeout(800);
    await historico('meu_hist');
    let t = await app();
    ok(/Seu histórico/.test(t) && /Hoje/.test(t) && /Começou a sua ficha de artista/.test(t), 'artista: salvar a ficha aparece no histórico, em "Hoje"');
    ok(!!(await p.$('details.hist-dia[open]')) && !!(await p.$('select[data-hist-f]')), 'agrupado por dia (aberto) e com filtro por tipo');
    await p.click('[data-hist-linha="ficha"][data-ir="inscricao"]'); await p.waitForTimeout(400);
    ok(!!(await p.$('#form')) && await p.evaluate(() => S.aba) === 'inscricao', 'clicar na linha abre a ficha');
    await sair();

    // 2. Casa: salva o cadastro; o histórico fica em Próximos passos › Seu histórico.
    await criar('casa', 'Casa Histórico', 'casa@historico.com');
    await p.waitForSelector('#form'); await p.fill('[data-k="nome"]', 'Casa Histórico'); await p.fill('[data-k="cidade_uf"]', 'Recife/PE'); await p.waitForTimeout(1600);
    await p.click('[data-salvar-parte="0"]'); await p.waitForTimeout(800);
    await p.click('[data-aba="datas_casa"]'); await p.waitForTimeout(300);
    ok(!!(await p.$('[data-sub="datas_casa|meu_hist"]')), 'casa: "Seu histórico" dentro de Próximos passos');
    await p.click('[data-sub="datas_casa|meu_hist"]'); await p.waitForSelector('[data-hist-linha], .vazio', { timeout: 5000 });
    t = await app();
    ok(/Começou o cadastro da casa/.test(t), 'casa: salvar o cadastro aparece no histórico');
    await p.selectOption('select[data-hist-f]', 'ficha'); await p.waitForTimeout(300);
    ok((await p.$$('[data-hist-linha]')).length > 0 && (await p.$$eval('[data-hist-linha]', (xs) => xs.every((x) => x.dataset.histLinha === 'ficha'))), 'filtro por tipo mostra só aquele tipo');
    await p.click('[data-hist-linha="ficha"][data-ir="cadastro_casa"]'); await p.waitForTimeout(400);
    ok(!!(await p.$('#form')), 'clicar na linha abre o cadastro da casa');
    await sair();

    // 3. Equipe: convida uma artista; o convite aparece em Início › Seu histórico e a linha abre o convite.
    await p.click('#entrar'); await p.click('[data-demo="equipe"]'); await pular(); await p.waitForTimeout(300);
    await ir('convites'); await p.waitForSelector('#cvOk');
    await p.fill('#cvNome', 'Bia Convidada'); await p.fill('#cvEmail', 'bia.convidada@teste.com'); await p.click('#cvOk'); await p.waitForTimeout(700);
    await p.evaluate(() => document.querySelector('#dlg')?.open && document.querySelector('#dlg').close());
    await p.evaluate(() => { S.eq = null; }); await historico('feito');
    t = await app();
    ok(!!(await p.$('[data-sub="g_hoje|feito"]')), 'equipe sem área também vê "Seu histórico" em Início');
    ok(/Convidou Bia Convidada/.test(t) && /Convites e equipe/.test(t), 'equipe: o convite aparece no histórico, com o tipo');
    await p.click('[data-hist-linha="convites"]'); await p.waitForTimeout(600);
    ok(await p.evaluate(() => S.aba) === 'convites' && /bia\.convidada@teste\.com/.test(await app()), 'clicar na linha abre o convite');
    // Ação de outra conta não entra no histórico de quem está logado.
    ok(!/Começou o cadastro da casa/.test(t), 'o histórico é só de quem está logado');
    ok(!erros.length, 'sem erros de JavaScript' + (erros.length ? ': ' + erros.join(' | ') : ''));
  } catch (e) { ok(false, 'erro: ' + e.message); }
  finally { console.log(res.join('\n')); await b.close(); }
})();
