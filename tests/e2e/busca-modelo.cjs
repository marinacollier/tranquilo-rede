// Busca rápida por modelo em Criar datas (pedido da Marina, 18/11/2026): escolhido o formato, cartões "casa + dia com
// match" com o line-up já escolhido na quantidade do formato (com troca) e "Criar este evento" com confirmação na
// página; Turnê: o artista e a sequência de casas e dias livres em cidades diferentes. Nova data com todos os formatos.
const { chromium } = require('playwright');
const B = process.env.BASE || 'http://localhost:8790/'; const res = []; const ok = (c, m) => { res.push((c ? 'OK    ' : 'FALHA ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch(); const erros = [], dialogos = [];
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route('**/config.js*', (r) => r.fulfill({ contentType: 'application/javascript', body: 'window.TQ_CONFIG = {};' }));
  await ctx.addInitScript(() => { try { localStorage.setItem('tq-consentimento', 'tudo'); localStorage.setItem('tq-sem-trilha', '1'); localStorage.setItem('tq-dp-aberto', '1'); localStorage.setItem('tq-tutorial-publico', '1'); } catch {} });
  const p = await ctx.newPage(); p.on('pageerror', (e) => erros.push(e.message)); p.on('dialog', (d) => { dialogos.push(d.message()); d.accept(); });
  const pular = async () => { try { await p.waitForSelector('.tour-caixa', { timeout: 2500 }); await p.click((await p.$('[data-tour="pular"]')) ? '[data-tour="pular"]' : '[data-tour="avancar"]'); } catch {} };
  const ir = async (k) => { await p.evaluate((k) => { const a = TQConta.areaDe?.(k); if (a && a !== k) { S.sub = S.sub || {}; S.sub[a] = k; S.aba = a; } else S.aba = k; render(); }, k); await p.waitForTimeout(600); };
  const db = () => p.evaluate(() => JSON.parse(localStorage.getItem('tq-demo-v1')));
  try {
    await p.goto(B); await p.waitForSelector('.cidade');
    // Cenário: duas casas habilitadas (Recife e BH) livres todos os dias; artistas livres todos os dias, cada um com o formato que topa.
    await p.evaluate(() => {
      const agora = new Date().toISOString(), u = {}, insc = {};
      const conta = (id, email, nome, tipo) => { u[id] = { senha: tipo === 'equipe' ? 'demo123' : 'segredo123', perfil: { id, email, nome, tipo, codigo_acesso: null, vinculo_nome: tipo === 'equipe' ? null : nome, criado_em: agora, senha_portal: true } }; };
      conta('eq', 'equipe@demo.tranquilo', 'Equipe (demo)', 'equipe'); conta('casa1', 'c1@modelo.com', 'Casa Mar', 'casa'); conta('casa2', 'c2@modelo.com', 'Casa Serra', 'casa');
      const arts = [['ana', 'Ana Mod', 'descubra', 'Recife', 'PE', ['Recife']], ['bia', 'Bia Mod', 'descubra', 'Recife', 'PE', ['Recife']], ['caio', 'Caio Mod', 'descubra', 'Recife', 'PE', ['Recife']],
        ['eva', 'Eva Mod', 'nao_sei', 'Recife', 'PE', ['Recife']], ['duda', 'Duda Mod', 'apresenta', 'Recife', 'PE', ['Recife']], ['tuca', 'Tuca Mod', 'turne', 'São Paulo', 'SP', ['Recife', 'Belo Horizonte']]];
      arts.forEach(([id, nome, fi, cid, uf, quer]) => { conta(id, id + '@modelo.com', nome, 'artista'); insc[id] = { id: 'i-' + id, user_id: id, status: 'aprovada', dados: { nome_artistico: nome, formato_interesse: fi, cidade_base: cid, estado: uf, cidades_interesse: quer, whatsapp: '81 99999-0000' }, criado_em: agora }; });
      const todos = [0, 1, 2, 3, 4, 5, 6];
      const d = { usuarios: u, insc, sessao: 'eq', chk: [], reg: [], contr: [], datasP: [], modContr: [], dispA: [], disp: [],
        casas: { casa1: { id: 'c1', user_id: 'casa1', status: 'habilitada', dados: { nome: 'Casa Mar', cidade_uf: 'Recife/PE' }, criado_em: agora }, casa2: { id: 'c2', user_id: 'casa2', status: 'habilitada', dados: { nome: 'Casa Serra', cidade_uf: 'Belo Horizonte/MG' }, criado_em: agora } },
        sem: [{ casa_ref: 'Casa Mar', dias: todos }, { casa_ref: 'Casa Serra', dias: todos }, ...arts.map(([id]) => ({ user_id: id, dias: todos }))] };
      localStorage.setItem('tq-demo-v1', JSON.stringify(d));
    });
    await p.reload(); await p.waitForTimeout(800); await pular(); await p.keyboard.press('Escape');
    await ir('datas_portal'); await p.waitForSelector('#dpBusca', { timeout: 6000 });
    // 1. Descubra: cartões só da casa com 3 livres que topam; line-up já escolhido; troca.
    ok(await p.getAttribute('[data-dpb-modo="Descubra"]', 'aria-pressed') === 'true' && (await p.$$('[data-dpb-modo]')).length === 5, 'busca abre no Descubra, com os 4 formatos e "Todos os dias"');
    ok(/3 artistas em ascensão/.test(await p.textContent('#dpbRegra')), 'a regra do formato aparece embaixo do seletor');
    const cards = await p.$$eval('[data-dpb-card]', (xs) => xs.map((x) => x.textContent));
    ok(cards.length === 12 && cards.every((t) => /Casa Mar/.test(t)) && !cards.some((t) => /Casa Serra/.test(t)) && !!(await p.$('[data-dpb-mais]')), 'cartões casa + dia: só a casa com 3 artistas livres que topam o Descubra (12 por vez, "Ver mais")');
    const k1 = await p.getAttribute('[data-dpb-card]', 'data-dpb-card'), dia1 = k1.split('|')[2], sel = `[data-dpb-card="${k1}"]`;
    const vals = () => p.$$eval(`${sel} [data-dpb-troca]`, (xs) => xs.map((x) => x.value));
    ok((await vals()).join() === 'Ana Mod,Bia Mod,Caio Mod', 'line-up sugerido na quantidade do formato: quem escolheu Descubra primeiro');
    ok(!(await p.$$eval(`${sel} [data-dpb-troca]`, (xs) => xs.some((x) => [...x.options].some((o) => /Duda Mod|Tuca Mod/.test(o.textContent))))), 'quem escolheu outro formato não entra no Descubra');
    await p.selectOption(`${sel} [data-dpb-troca$="|2"]`, 'Eva Mod'); await p.waitForTimeout(300);
    ok((await vals()).join() === 'Ana Mod,Bia Mod,Eva Mod' && /ainda não escolheu formato/.test(await p.textContent(`${sel} [data-dpb-troca$="|2"]`)), 'troca de artista no cartão ("ainda não escolheu formato" também topa)');
    ok(!(await p.$$eval(`${sel} [data-dpb-troca$="|0"] option`, (o) => o.some((x) => x.value === 'Bia Mod' || x.value === 'Eva Mod'))), 'quem já está no cartão não aparece nas outras vagas');
    const nDlg = dialogos.length;
    await p.click(`${sel} [data-dpb-criar]`); await p.waitForTimeout(300);
    ok(/Criar Descubra em .*Casa Mar\?/.test(await p.textContent(`${sel} .dpb-conf`)) && !(await db()).datasP.length && dialogos.length === nDlg, '"Criar este evento" pede confirmação na própria página e ainda não criou');
    await p.click(`[data-dpb-ok="${k1}"]`); await p.waitForTimeout(1000);
    let d0 = await db(), x = d0.datasP[0];
    ok(d0.datasP.length === 1 && x.produto === 'Descubra' && x.dia === dia1 && x.casa_id === 'c1' && x.cidade === 'Recife/PE' && x.artistas.map((a) => `${a.ordem}.${a.nome}.${a.user_id}`).join() === '1.Ana Mod.ana,2.Bia Mod.bia,3.Eva Mod.eva', 'cria a data com o line-up de uma vez (ordem, contas)');
    ok(/✓ Feito: Descubra criado/.test(await p.textContent('#dpbMsg')) && !(await p.$(`[data-dpb-card="${k1}"]`)), 'confirma e o cartão sai (a casa não está mais livre nesse dia)');
    ok(await p.$eval(`[data-lp-det="${x.id}"]`, (d) => d.open) && /contratos 0\/4/.test(await p.textContent(`[data-lp-det="${x.id}"] [data-dp-resumo]`)), 'a data nova aparece aberta em "Datas criadas no portal", com "contratos 0/4"');
    // 2. Apresenta: 1 principal (quem escolheu Apresenta) e abertura opcional; na data, a abertura vem primeiro.
    await p.click('[data-dpb-modo="Apresenta"]'); await p.waitForTimeout(400);
    ok(/abertura opcional/.test(await p.textContent('#dpbRegra')) && /Casa Serra/.test(await p.textContent('#dpBusca')), 'Apresenta: regra com abertura opcional; a casa de BH entra (Tuca topa Apresenta e quer tocar lá)');
    const k2 = await p.getAttribute('[data-dpb-card*="|c1|"]', 'data-dpb-card'), s2 = `[data-dpb-card="${k2}"]`;
    const v2 = await p.$$eval(`${s2} [data-dpb-troca]`, (xs) => xs.map((x) => x.value));
    ok(k2.split('|')[2] !== dia1 && v2[0] === 'Duda Mod' && v2.length === 2 && v2[1] && (await p.textContent(`${s2}`)).includes('Atração') && (await p.textContent(`${s2}`)).includes('Abertura (opcional)'), 'Apresenta: atração é quem escolheu Apresenta, com abertura sugerida');
    await p.click(`${s2} [data-dpb-criar]`); await p.waitForTimeout(200); await p.fill('#dpbAbre', '20:00'); await p.click(`[data-dpb-ok="${k2}"]`); await p.waitForTimeout(1000);
    d0 = await db(); x = d0.datasP.find((y) => y.produto === 'Apresenta');
    ok(x && x.abertura === '20:00' && x.artistas.map((a) => a.nome).join() === `${v2[1]},Duda Mod`, 'Apresenta criado: abertura primeiro, atração por último, com o horário escolhido');
    // 3. Turnê: escolher o artista e ver a sequência de casas/dias em cidades diferentes; cria várias datas.
    await p.click('[data-dpb-modo="Turnê"]'); await p.waitForTimeout(400);
    ok(/mesmo artista principal em várias cidades/.test(await p.textContent('#dpbRegra')) && /a validar/.test(await p.textContent('#dpbRegra')), 'Turnê: regra e o que falta validar');
    ok(/Tuca Mod · mora em São Paulo\/SP · escolheu Turnê/.test(await p.textContent('[data-dpb-tur-art]')), 'lista de artistas da turnê (quem escolheu Turnê primeiro)');
    await p.selectOption('[data-dpb-tur-art]', 'tuca'); await p.waitForTimeout(400);
    const cids = await p.$$eval('[data-dpb-tur-cid]', (xs) => xs.map((x) => x.querySelector('b').textContent));
    const esc = await p.$$eval('[data-dpb-tur]', (xs) => xs.map((x) => x.value));
    ok(cids.length === 2 && cids.some((c) => /Recife/.test(c)) && cids.some((c) => /Belo Horizonte/.test(c)) && esc.every(Boolean) && esc[0].split('|')[0] !== esc[1].split('|')[0], 'sequência: uma casa por cidade, em dias diferentes');
    await p.click('[data-dpb-tur-criar]'); await p.waitForTimeout(200);
    ok(/Criar 2 datas da turnê de Tuca Mod/.test(await p.textContent('#dpbTurConf')) && (await db()).datasP.length === 2, 'confirmação na página antes de criar as datas');
    await p.click('[data-dpb-tur-ok]'); await p.waitForTimeout(1200);
    d0 = await db(); const tur = d0.datasP.filter((y) => y.produto === 'Turnê');
    ok(tur.length === 2 && tur.every((y) => y.artistas[y.artistas.length - 1].nome === 'Tuca Mod' && y.artistas[y.artistas.length - 1].user_id === 'tuca') && new Set(tur.map((y) => y.cidade)).size === 2 && /2 datas da turnê/.test(await p.textContent('#dpbMsg')), 'Turnê: 2 datas, o mesmo artista por último em cada uma, em cidades diferentes');
    if (process.env.SHOT) { await p.click('[data-dpb-modo="Descubra"]'); await p.waitForTimeout(300); await p.screenshot({ path: process.env.SHOT + '.png', fullPage: true }); }
    // 4. Nova data: todos os formatos, a regra numa linha e o line-up no tamanho do formato.
    ok((await p.$$eval('#dpProd option', (o) => o.map((x) => x.value))).join() === 'Descubra,Apresenta,Turnê,Noite Tranquilo' && (await p.$$('[data-dp-art]')).length === 3, 'Nova data: os 4 formatos; o Descubra começa com 3 artistas');
    await p.selectOption('#dpProd', 'Apresenta'); await p.waitForTimeout(300);
    ok(/Apresenta:.*abertura opcional/.test(await p.textContent('#dpRegra')) && (await p.$$('[data-dp-art]')).length === 2, 'trocar para Apresenta mostra a regra e ajusta o line-up (abertura e atração)');
    await p.selectOption('#dpProd', 'Noite Tranquilo'); await p.waitForTimeout(300);
    ok(/a validar/.test(await p.textContent('#dpRegra')), 'Noite Tranquilo: marcado "a validar"');
    // 5. Celular: nada estoura a largura.
    await p.setViewportSize({ width: 390, height: 800 }); await p.click('[data-dpb-modo="Descubra"]'); await p.waitForTimeout(400);
    const larg = await p.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    if (process.env.SHOT) { await p.screenshot({ path: process.env.SHOT + '-cel.png', fullPage: false }); }
    ok(larg[0] <= larg[1], `celular: sem rolagem lateral (${larg.join(' x ')})`);
  } catch (e) { ok(false, 'quebrou: ' + e.message.split('\n')[0]); }
  ok(!erros.length, 'sem erro JS ' + erros.join(' | '));
  console.log(res.join('\n')); await b.close();
})();
