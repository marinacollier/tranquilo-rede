// Bases do Notion no portal (pedido da Marina, 18/11/2026: "tudo"): Casas de Shows (Gui) e Artistas e bandas (Isa) inteiras,
// com busca, filtro por cidade e status, lista compacta que cresce, ficha com histórico, "Abrir no Notion" e a
// "Sugestão POR HISTÓRICO". Nada sensível no pacote da equipe nem no público; vínculo com as contas do portal.
const { chromium } = require('playwright');
const fs = require('fs');
const B = process.env.BASE || 'http://localhost:8790/'; const res = []; const ok = (c, m) => { res.push((c ? 'OK    ' : 'FALHA ') + m); if (!c) process.exitCode = 1; };
const COD = {}; for (const [t, c] of fs.readFileSync(process.env.ACESSOS || '/tmp/tq-acessos.tsv', 'utf8').trim().split('\n').map((l) => l.split('\t'))) COD[t] ||= c;
(async () => {
  const b = await chromium.launch(); const erros = [];
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route('**/config.js*', (r) => r.fulfill({ contentType: 'application/javascript', body: 'window.TQ_CONFIG = {};' }));
  await ctx.addInitScript(() => { try { localStorage.setItem('tq-consentimento', 'tudo'); localStorage.setItem('tq-sem-trilha', '1'); localStorage.setItem('tq-tutorial-publico', '1'); localStorage.setItem('tq-tutorial-codigo-equipe', '1'); localStorage.setItem('tq-tutorial-codigo-adm', '1'); } catch {} });
  const p = await ctx.newPage(); p.on('pageerror', (e) => erros.push(e.message)); p.on('dialog', (d) => d.accept());
  const app = () => p.textContent('#app');
  try {
    // 1. Equipe pelo código: Casas.
    await p.goto(B + '#c=' + COD.equipe); await p.waitForFunction(() => window.S?.pac?.notion || (typeof S !== 'undefined' && S.pac?.notion), null, { timeout: 20000 });
    await p.evaluate(() => { S.aba = 'base_casas'; render(); }); await p.waitForSelector('#bnLista');
    const pac = await p.evaluate(() => S.pac.notion);
    ok(pac.casas.length > 200 && pac.artistas.length > 1000, `pacote da equipe traz as bases inteiras (${pac.casas.length} casas, ${pac.artistas.length} artistas)`);
    ok(!pac.casas.some((c) => c.priv) && !pac.artistas.some((a) => a.priv || a.alt), 'pacote da equipe sem campos sensíveis (priv) nem grafias alternativas');
    ok(/226 casas na base/.test(await app()) && (await p.$$('#bnLista [data-bn]')).length === 30, 'Casas: base inteira, começa compacta (30 linhas)');
    await p.click('[data-bn-mais="casas"]'); await p.waitForTimeout(200);
    ok((await p.$$('#bnLista [data-bn]')).length === 60, '"Mostrar mais" cresce a lista');
    await p.selectOption('#bnCid', 'Florianópolis/SC'); await p.waitForTimeout(200);
    const cids = await p.$$eval('#bnLista [data-bn]', (xs) => xs.map((x) => x.textContent));
    ok(cids.length > 5 && cids.every((t) => /Florianópolis\/SC/.test(t)), `filtro por cidade (${cids.length} em Florianópolis)`);
    await p.selectOption('#bnCid', ''); await p.selectOption('#bnSt', 'A avaliar'); await p.waitForTimeout(200);
    ok((await p.$$eval('#bnLista [data-bn] .badge', (xs) => xs.map((x) => x.textContent))).every((t) => t === 'A avaliar'), 'filtro por status (Avaliação padrão Tranquilo)');
    await p.selectOption('#bnSt', ''); await p.fill('#bnQ', 'rooftap'); await p.waitForTimeout(500);
    ok((await p.$$('#bnLista [data-bn]')).length >= 1 && /ROOFTAP/i.test(await p.textContent('#bnLista')), 'busca por nome');
    await p.click('#bnLista [data-bn]'); await p.waitForTimeout(300);
    const dlg = await p.textContent('#dlgIn');
    ok(/Sugestão POR HISTÓRICO — confirmar com a casa/.test(dlg) && /recebeu mais eventos em/.test(dlg), 'ficha da casa: sugestão POR HISTÓRICO (dias da semana)');
    ok((await p.$$('#dlgIn [data-ev]')).length > 0 && /notion\.so\//.test(await p.getAttribute('#dlgIn [data-bn-notion]', 'href')), 'ficha da casa: histórico de eventos clicável e "Abrir no Notion"');
    ok(!/Só administração/.test(dlg), 'equipe não vê bloco de dados sensíveis');
    await p.click('#dlgIn [data-ev]'); await p.waitForTimeout(300);
    ok(/Line-up/.test(await p.textContent('#dlgIn')), 'evento do histórico abre o detalhe da data');
    await p.keyboard.press('Escape');
    // 2. Artistas.
    await p.evaluate(() => { S.aba = 'base_artistas'; render(); }); await p.waitForSelector('#bnLista');
    ok(/1\.158 artistas na base|1158 artistas na base/.test(await app()), 'Artistas: base inteira (1158)');
    const prim = await p.$$eval('#bnLista [data-bn]', (xs) => xs.slice(0, 3).map((x) => x.textContent));
    ok(prim.every((t) => /\d+ eventos?/.test(t)), 'quem tem eventos na rede aparece primeiro');
    await p.click('#bnLista [data-bn]'); await p.waitForTimeout(300);
    const da = await p.textContent('#dlgIn');
    ok(/Sugestão POR HISTÓRICO — confirmar com a artista/.test(da) && /já tocou em .*formatos:/.test(da), 'ficha da artista: cidades e formatos em que já tocou');
    await p.keyboard.press('Escape');
    // 3. Público: nada das bases.
    const pub = await (await p.request.get(B + 'public.json')).text();
    ok(!/open\.spotify\.com|Status de curadoria|Avaliação \(padrão/.test(pub), 'public.json não leva nada das bases');
    // 4. Criar datas: grupo recolhido da sugestão por histórico, separado da disponibilidade do portal.
    await p.evaluate(() => {
      const agora = new Date().toISOString();
      const d = { usuarios: { eq: { senha: 'demo123', perfil: { id: 'eq', email: 'equipe@demo.tranquilo', nome: 'Equipe (demo)', tipo: 'equipe', codigo_acesso: null, vinculo_nome: null, criado_em: agora, senha_portal: true } },
        a1: { senha: 'x', perfil: { id: 'a1', email: 'a1@modelo.com', nome: 'YOÙN', tipo: 'artista', codigo_acesso: null, vinculo_nome: 'YOÙN', criado_em: agora, senha_portal: true } } },
        insc: { a1: { id: 'i-a1', user_id: 'a1', status: 'aprovada', dados: { nome_artistico: 'YOÙN', cidade_base: 'São Paulo', estado: 'SP' }, criado_em: agora } },
        sessao: 'eq', chk: [], reg: [], contr: [], datasP: [], modContr: [], dispA: [], disp: [], casas: {}, sem: [] };
      localStorage.setItem('tq-demo-v1', JSON.stringify(d));
    });
    const pacEq = await p.evaluate(() => S.pac);
    await p.goto(B); await p.waitForTimeout(1200); try { await p.click('[data-tour="pular"]', { timeout: 2000 }); } catch {} await p.keyboard.press('Escape');
    await p.evaluate((pac) => { S.pac = pac; const a = TQConta.areaDe('datas_portal'); S.sub = S.sub || {}; S.sub[a] = 'datas_portal'; S.aba = a; render(); }, pacEq);
    await p.waitForSelector('#dpBusca', { timeout: 8000 });
    const sug = await p.$('#dpSugHist');
    ok(!!sug && !(await p.$eval('#dpSugHist', (d) => d.open)) && /Sugestão POR HISTÓRICO/.test(await p.textContent('#dpSugHist summary')), 'Criar datas: grupo "Sugestão POR HISTÓRICO" separado e recolhido');
    ok(!/Sugestão POR HISTÓRICO/.test(await p.$eval('#dpBusca', (el) => el.textContent)), 'a sugestão não se mistura com a busca de quem está livre');
    // 5. Vínculo com as contas do portal.
    await p.evaluate(() => { S.aba = 'base_artistas'; S.sub = {}; const a = TQConta.areaDe('base_artistas'); if (a) { S.sub[a] = 'base_artistas'; S.aba = a; } S.bn = { artistas: { q: 'YOÙN', cid: '', st: '', n: 30 } }; render(); });
    await p.waitForSelector('#bnLista [data-bn]'); await p.click('#bnLista [data-bn]'); await p.waitForTimeout(800);
    await p.keyboard.press('Escape'); await p.click('#bnLista [data-bn]'); await p.waitForTimeout(400);
    ok(/Vínculo com o portal/.test(await p.textContent('#dlgIn')) && !!(await p.$('#dlgIn [data-click="insc:i-a1"]')), 'vínculo: a artista da base abre a ficha dela no portal (nome bate)');
    await p.keyboard.press('Escape');
    // 6. Administração pelo código: mesma base (sensíveis só com a API; o retrato não tem).
    await p.evaluate(() => { localStorage.removeItem('tq-demo-v1'); });
    await p.goto(B + '#c=' + COD.adm); await p.waitForFunction(() => window.S?.pac?.notion || (typeof S !== 'undefined' && S.pac?.notion), null, { timeout: 20000 });
    ok((await p.evaluate(() => S.pac.notion.casas.length)) === pac.casas.length, 'administração também recebe a base');
  } catch (e) { ok(false, 'erro: ' + e.message); }
  ok(!erros.length, 'sem erros de página' + (erros.length ? ': ' + erros.join(' | ') : ''));
  console.log(res.join('\n')); await b.close();
})();
