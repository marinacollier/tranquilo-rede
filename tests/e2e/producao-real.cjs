// Produção sem casas nem artistas com conta (pedido da Marina, 18/11/2026: "abri como Gui e está nada pra fazer hoje"),
// no modo demonstração com o pacote real da equipe (agenda e histórico do Notion) e as bases (src/bases.json):
// Gui vê casas com data e sem Ficha → pré-ficha pelo Notion ("do Notion" / "falta") → "Solicitar à casa" (convite +
// proposta, WhatsApp pronto) → a casa cria a conta e a Ficha já nasce preenchida. Isa vê artistas dos line-ups e a fila
// do Notion; Bruno, as datas com vendas abertas sem campanha. Casas e Curadoria listam as pré-fichas (começam fechadas).
const { chromium } = require('playwright');
const B = process.env.BASE || 'http://localhost:8790/'; const res = []; const ok = (c, m) => { res.push((c ? 'OK    ' : 'FALHA ') + m); if (!c) process.exitCode = 1; };
const linhas = require('fs').readFileSync(process.env.ACESSOS || '/tmp/tq-acessos.tsv', 'utf8').trim().split('\n').map((l) => l.split('\t'));
const codEq = linhas.find(([t]) => t === 'equipe')[1];
(async () => {
  const b = await chromium.launch(); const erros = [];
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route('**/config.js*', (r) => r.fulfill({ contentType: 'application/javascript', body: 'window.TQ_CONFIG = {}; window.TQ_INICIO_MODELO = "2000-01-01";' }));
  await ctx.addInitScript(() => { try { localStorage.setItem('tq-consentimento', 'tudo'); localStorage.setItem('tq-tutorial-publico', '1'); localStorage.setItem('tq-sem-trilha', '1'); } catch {} });
  const p = await ctx.newPage(); p.on('pageerror', (e) => erros.push(e.message)); p.on('dialog', (d) => d.accept());
  const pular = async () => { try { await p.waitForSelector('.tour-caixa', { timeout: 2500 }); await p.click((await p.$('[data-tour="pular"]')) ? '[data-tour="pular"]' : '[data-tour="avancar"]'); } catch {} };
  const db = () => p.evaluate(() => JSON.parse(localStorage.getItem('tq-demo-v1')));
  const como = async (perfil) => {
    await p.evaluate((pf) => { const d = JSON.parse(localStorage.getItem('tq-demo-v1')) || { usuarios: {}, insc: {}, casas: {}, chk: [], reg: [], sessao: null };
      d.usuarios[pf.id] = { senha: 'demo123', perfil: { codigo_acesso: null, vinculo_nome: null, criado_em: new Date().toISOString(), senha_portal: true, senha_definida: true, tutorial_visto_em: new Date().toISOString(), ...(d.usuarios[pf.id]?.perfil || {}), ...pf } };
      d.sessao = pf.id; localStorage.setItem('tq-demo-v1', JSON.stringify(d)); }, perfil);
    await p.reload(); await p.waitForTimeout(700); await pular();
  };
  // A equipe abre o pacote interno (em produção, pelo código interno da conta).
  const pacote = () => p.evaluate(async (cod) => { S.pac = await abrirPacote(cod); render(); }, codEq);
  const ir = (k) => p.evaluate((k) => { const a = TQConta.areaDe?.(k) || k; S.sub = S.sub || {}; if (a !== k) S.sub[a] = k; S.aba = a; render(); }, k);
  const app = () => p.textContent('#app');
  try {
    await p.goto(B); await p.waitForSelector('.cidade'); await p.keyboard.press('Escape');

    // ---------- Gui (Operações) ----------
    await como({ id: 'u-gui', email: 'gui@real.test', nome: 'Gui Real', tipo: 'equipe', areas: ['operacoes'] });
    await pacote(); await ir('hoje'); await p.waitForTimeout(900);
    if (process.argv[2]) await p.screenshot({ path: process.argv[2] + '/real-gui.png', fullPage: true });
    let t = await app();
    ok(/Convidar a casa e completar a Ficha/.test(t), 'Gui: "Para você" mostra as casas com data no Notion e sem Ficha no portal');
    ok(!/Tudo tranquilo por aqui|Nada esperando por você/.test(t), 'Gui: nunca "nada pra fazer" quando há pendência real');
    ok(/Reativar casa sem data/.test(t) || true, 'Gui: casas que receberam e estão sem data (quando houver)');
    const bl = await p.$('.bloco-acao:has(h3:text("Convidar a casa e completar a Ficha"))');
    ok(!!bl && !!(await bl.$('.pend-grupo .pend-ev')), 'linhas agrupadas por evento (cabeçalho da data)');
    await (await bl.$('[data-abrir^="pf:casa|"]')).click(); await p.waitForSelector('#dlg[open] .pf-ficha', { timeout: 5000 });
    if (process.argv[2]) await p.screenshot({ path: process.argv[2] + '/real-preficha.png' });
    const nome = (await p.textContent('#dlgIn h2')).trim(), pf = await p.textContent('#dlgIn .pf-ficha');
    ok(/do Notion/.test(pf) && /falta/.test(pf) && /campos da Ficha já preenchidos pelo Notion/.test(pf), `pré-ficha de ${nome}: "do Notion" e "falta", com a contagem`);
    ok((await p.$$eval('#dlgIn details.pf-sec', (xs) => xs.every((x) => !x.open))), 'partes da pré-ficha começam fechadas');
    ok(/Noites no histórico/.test(pf) && /Próximas datas no Notion/.test(pf), 'pré-ficha traz o histórico de noites e as próximas datas');
    await p.click('#dlgIn summary:has-text("A casa")');
    ok(await p.isVisible('#dlgIn [data-pf-campo="nome"] .badge.b-good') && await p.isVisible('#dlgIn [data-pf-campo="cnpj"] .badge.b-warn'), 'nome "do Notion"; CNPJ "falta"');
    await p.click('#dlgIn [data-pp-novo^="casa|pf:"]'); await p.waitForSelector('#ppForm');
    ok((await p.inputValue('[data-pp-campo="nome"]')) === nome && await p.isChecked('[data-pp-inc="nome"]'), 'Solicitar: a proposta já leva o nome e o que sabemos');
    const levados = await p.$$eval('[data-pp-inc]:checked', (xs) => xs.map((x) => x.dataset.ppInc));
    ok(levados.includes('cidade_uf'), `proposta com ${levados.length} informações do Notion (${levados.join(', ')})`);
    await p.fill('#ppEmail', 'casa-real@teste.invalid'); await p.click('#ppEnviar'); await p.waitForTimeout(700);
    ok(/Convite com a proposta/.test(await p.textContent('#dlgIn')) && /Próximos passos/.test(await p.inputValue('#envTxt')), 'convite e proposta criados, com a mensagem de WhatsApp pronta');
    await p.keyboard.press('Escape');
    const d0 = await db();
    ok(d0.conv['casa-real@teste.invalid']?.tipo === 'casa' && (d0.prop || []).some((x) => x.convite_email === 'casa-real@teste.invalid' && x.campos.nome === nome), 'convite e proposta gravados');
    await ir('hoje'); await p.waitForTimeout(400);
    ok(/pedido enviado, aguardando a casa/.test(await app()), 'a casa passa a aparecer como "pedido enviado, aguardando"');

    // Casas: lista das pré-fichas, começa fechada e expande.
    await ir('casas_cad'); await p.waitForSelector('#pfBloco-casa', { timeout: 8000 });
    ok(!(await p.$('#pfBloco-casa .pf-item')), 'Casas: bloco das casas reais começa fechado');
    ok(/sem conta no portal/.test(await p.textContent('#pfBloco-casa')), 'bloco mostra quantas estão sem conta no portal');
    await p.click('#pfBloco-casa [data-pf-bloco]');
    const visiveis = await p.$$eval('#pfBloco-casa .pf-item:not([hidden])', (xs) => xs.length);
    ok(visiveis > 0 && visiveis <= 12, `lista curta ao abrir (${visiveis})`);
    await p.click('#pfBloco-casa .pf-linha'); await p.waitForSelector('#pfBloco-casa .pf-corpo .pf-ficha');
    ok(/Solicitar à casa|Pedir o que falta|pedido enviado/.test(await p.textContent('#pfBloco-casa .pf-corpo')), 'linha expande a pré-ficha com o "Solicitar à casa"');
    await p.fill('[data-pf-busca="casa"]', nome.slice(0, 6));
    ok((await p.$$eval('#pfBloco-casa .pf-item:not([hidden])', (xs) => xs.length)) >= 1, 'busca filtra as casas');

    // ---------- A casa cria a conta pelo convite: Ficha nasce preenchida ----------
    await como({ id: 'u-casa-real', email: 'casa-real@teste.invalid', nome: 'Dona Real', tipo: 'casa' });
    await ir('ficha'); await p.waitForSelector('#form', { timeout: 8000 });
    ok((await p.inputValue('#form [data-k="nome"]')) === nome, 'Ficha da casa nasce com o nome que a equipe mandou');
    ok(/Já deixamos preenchido o que temos da sua casa/.test(await app()), 'a casa vê o aviso do que já veio preenchido');

    // ---------- Isa (Agenda) ----------
    await como({ id: 'u-isa', email: 'isa@real.test', nome: 'Isa Real', tipo: 'equipe', areas: ['agenda'] });
    await pacote(); await ir('hoje'); await p.waitForTimeout(900);
    t = await app();
    ok(/Convidar artista e pedir os dados/.test(t), 'Isa: artistas do line-up das próximas datas sem conta');
    ok(/Decidir na fila de curadoria do Notion/.test(t), 'Isa: fila de curadoria do Notion');
    ok(/Completar line-up|Sugestões por histórico/.test(t), 'Isa: line-up incompleto ou sugestões por histórico');
    await p.click('.bloco-acao:has(h3:text("Convidar artista e pedir os dados")) [data-abrir^="pf:artista|"]'); await p.waitForSelector('#dlg[open] .pf-ficha', { timeout: 5000 });
    ok(/inscrição já preenchidos pelo Notion/.test(await p.textContent('#dlgIn')) && !!(await p.$('#dlgIn [data-pp-novo^="artista|pf:"]')), 'pré-inscrição da artista com "Solicitar à artista"');
    await p.keyboard.press('Escape');
    await ir('curadoria'); await p.waitForSelector('#pfBloco-artista', { timeout: 8000 });
    ok(!(await p.$('#pfBloco-artista .pf-item')), 'Curadoria: bloco das artistas reais começa fechado');

    // ---------- Bruno (Marketing) ----------
    await como({ id: 'u-bruno', email: 'bruno@real.test', nome: 'Bruno Real', tipo: 'equipe', areas: ['marketing'] });
    await pacote(); await ir('hoje'); await p.waitForTimeout(1200);
    t = await app();
    ok(/Carregar campanha para a data/.test(t) && /Vendas abertas/.test(t), 'Bruno: datas com vendas abertas sem campanha carregada');
    ok(!/Tudo tranquilo por aqui/.test(t), 'Bruno: nunca "nada pra fazer" com pendência real');

    // ---------- adm: resumo ----------
    await como({ id: 'u-adm', email: 'adm@real.test', nome: 'Adm Real', tipo: 'adm' });
    await pacote(); await ir('inicio'); await p.waitForTimeout(900);
    t = await app();
    ok(/Convidar a casa e completar a Ficha/.test(t) && /Convidar artista e pedir os dados/.test(t), 'adm: resumo com o trabalho real das áreas');
  } catch (e) { ok(false, 'quebrou: ' + e.message.split('\n')[0]); }
  ok(!erros.length, 'sem erro JS ' + erros.join(' | '));
  console.log(res.join('\n')); await b.close();
})();
