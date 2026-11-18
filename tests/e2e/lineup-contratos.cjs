// Line-up com 3 artistas e um contrato para cada um (pedido da Marina, 18/11/2026), no modo demonstração:
// line-up editável (adicionar, tirar, sem repetir), "Preparar contratos do line-up" (um por artista e o da casa, sem
// duplicar, com a Ficha de cada um), quadro "Line-up e contratos", passos de cada artista e tirar artista cancela o contrato.
const { chromium } = require('playwright');
const B = process.env.BASE || 'http://localhost:8790/'; const res = []; const ok = (c, m) => { res.push((c ? 'OK    ' : 'FALHA ') + m); if (!c) process.exitCode = 1; };
const MODELO_ART = `CONTRATO DE APRESENTAÇÃO ARTÍSTICA · TRANQUILO DESCUBRA

Contratada: {{artista}}, nome completo [PREENCHER NOME COMPLETO], CPF/CNPJ [PREENCHER CPF/CNPJ], WhatsApp [PREENCHER WHATSAPP], cidade de origem [PREENCHER CIDADE DE ORIGEM].
Apresentação em {{data}}, {{casa}}, {{cidade}}. Cachê: R$ {{cache}}, pago por Pix na chave [PREENCHER CHAVE PIX].
E por estarem de acordo, assinam.`;
const MODELO_CASA = `CONTRATO DE PARCERIA DA CASA · TRANQUILO

Casa: [PREENCHER RAZÃO SOCIAL], CNPJ [PREENCHER CNPJ]. Data {{data}}, cidade {{cidade}}. As partes acertam a noite do Tranquilo.`;
(async () => {
  const b = await chromium.launch(); const erros = [], dialogos = [];
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route('**/config.js*', (r) => r.fulfill({ contentType: 'application/javascript', body: 'window.TQ_CONFIG = {};' }));
  await ctx.addInitScript(() => { try { localStorage.setItem('tq-consentimento', 'tudo'); localStorage.setItem('tq-sem-trilha', '1'); localStorage.setItem('tq-tutorial-publico', '1'); } catch {} });
  const p = await ctx.newPage(); p.on('pageerror', (e) => erros.push(e.message)); p.on('dialog', (d) => { dialogos.push(d.message()); d.accept(); });
  const pular = async () => { try { await p.waitForSelector('.tour-caixa', { timeout: 2500 }); await p.click((await p.$('[data-tour="pular"]')) ? '[data-tour="pular"]' : '[data-tour="avancar"]'); } catch {} };
  const ir = async (k) => { await p.evaluate((k) => { const a = TQConta.areaDe?.(k); if (a && a !== k) { S.sub = S.sub || {}; S.sub[a] = k; S.aba = a; } else S.aba = k; render(); }, k); await p.waitForTimeout(600); };
  const db = () => p.evaluate(() => JSON.parse(localStorage.getItem('tq-demo-v1')));
  const dia = new Date(Date.now() + 10 * 864e5).toISOString().slice(0, 10);
  try {
    await p.goto(B); await p.waitForSelector('.cidade');
    // Cenário: equipe, casa habilitada, quatro artistas com Ficha e os modelos de contrato.
    await p.evaluate(([MA, MC]) => {
      const agora = new Date().toISOString(), u = {}, insc = {};
      const conta = (id, email, nome, tipo, extra = {}) => { u[id] = { senha: tipo === 'equipe' ? 'demo123' : 'segredo123', perfil: { id, email, nome, tipo, codigo_acesso: null, vinculo_nome: tipo === 'equipe' ? null : nome, criado_em: agora, senha_portal: true, ...extra } }; };
      conta('eq', 'equipe@demo.tranquilo', 'Equipe (demo)', 'equipe');
      conta('casa', 'casa@line.com', 'Casa Line', 'casa');
      [['ana', 'Ana Line', '81 99999-1111', 'Recife'], ['bia', 'Bia Line', '81 98888-2222', 'Olinda'], ['caio', 'Caio Line', '', 'Recife'], ['duda', 'Duda Line', '81 97777-4444', 'Recife']].forEach(([id, nome, w, cid]) => {
        conta(id, id + '@line.com', nome, 'artista', id === 'caio' ? { whatsapp: '81 96666-3333' } : {});
        insc[id] = { id: 'i-' + id, user_id: id, status: 'aprovada', dados: { nome_artistico: nome, whatsapp: w, cidade_base: cid, estado: 'PE' }, criado_em: agora };
      });
      const d = { usuarios: u, insc, casas: { casa: { id: 'c1', user_id: 'casa', status: 'habilitada', dados: { nome: 'Casa Line', cidade_uf: 'Recife/PE', razao_social: 'Casa Line Ltda', cnpj: '12.345.678/0001-90' }, criado_em: agora } },
        chk: [], reg: [], sessao: 'eq', modContr: [{ id: 'm-art', nome: 'Descubra artista', texto: MA, ativo: true }, { id: 'm-casa', nome: 'Casa parceria', texto: MC, ativo: true }], contr: [], datasP: [] };
      localStorage.setItem('tq-demo-v1', JSON.stringify(d));
    }, [MODELO_ART, MODELO_CASA]);
    await p.reload(); await p.waitForTimeout(800); await pular(); await p.keyboard.press('Escape');
    await ir('datas_portal'); await p.waitForSelector('#dpDia', { timeout: 6000 });
    // 1. Line-up editável: 3 linhas por padrão, adicionar, sem repetir, tirar.
    ok((await p.$$('[data-dp-art]')).length === 3, 'Nova data começa com 3 artistas no line-up (padrão do Descubra)');
    await p.fill('#dpDia', dia); await p.dispatchEvent('#dpDia', 'change'); await p.waitForTimeout(300);
    await p.check('[data-dp-exc]'); await p.waitForTimeout(300);
    await p.selectOption('#dpCasa', 'c1'); await p.waitForTimeout(300);
    await p.fill('[data-dp-art="0"]', 'Ana Line'); await p.fill('[data-dp-art="1"]', 'Bia Line'); await p.fill('[data-dp-art="2"]', 'Caio Line');
    await p.click('[data-dp-add]'); await p.waitForTimeout(200);
    ok((await p.$$('[data-dp-art]')).length === 4 && await p.inputValue('[data-dp-art="2"]') === 'Caio Line' && await p.inputValue('#dpDia') === dia, '"+ Adicionar artista" abre a 4ª linha sem perder o que já estava escrito');
    await p.fill('[data-dp-art="3"]', 'ana line'); await p.click('[data-dp-salvar]'); await p.waitForTimeout(300);
    ok(/aparece duas vezes no line-up/.test(await p.textContent('#dpErr')) && !(await db()).datasP.length, 'o mesmo artista duas vezes não salva e diz quem repetiu');
    await p.click('[data-dp-rem="3"]'); await p.waitForTimeout(200);
    ok((await p.$$('[data-dp-art]')).length === 3, '"Tirar" remove a linha do line-up');
    await p.click('[data-dp-salvar]'); await p.waitForTimeout(900);
    let d0 = await db(); const dp = d0.datasP[0];
    ok(dp && dp.artistas.map((a) => `${a.ordem}.${a.nome}.${a.user_id}`).join() === '1.Ana Line.ana,2.Bia Line.bia,3.Caio Line.caio', 'data salva com 3 artistas, na ordem e ligados às contas');
    // 2. Quadro "Line-up e contratos" na data e "Preparar contratos do line-up".
    await p.click(`[data-lp-det="${dp.id}"] > summary`); await p.waitForTimeout(200);
    const quadro = () => p.textContent(`[data-lp-det="${dp.id}"]`);
    ok(/Falta(m)? 4/.test(await quadro()) && (await p.$$(`[data-lp-det="${dp.id}"] [data-lp-linha]`)).length === 4 && /Sem contrato/.test(await quadro()), 'quadro da data: os 3 artistas e a casa, todos "Sem contrato"');
    await p.click(`[data-lp-abrir="${dp.id}"]`); await p.waitForSelector('[data-lp-gerar]');
    ok(/o artista completa: Nome completo, CPF\/CNPJ, Chave PIX/.test(await quadro()) && /Ana Line[^]*?dados vieram da Ficha/.test(await quadro()), 'preparar: cada artista com os dados da Ficha; nome completo, CPF/CNPJ e Pix ficam para o artista');
    await p.fill('[data-lp-campo="ana|cache"]', '800,00'); await p.fill('[data-lp-campo="bia|cache"]', '700,00'); await p.fill('[data-lp-campo="caio|cache"]', '600,00');
    await p.click(`[data-lp-gerar="${dp.id}"]`); await p.waitForTimeout(1200);
    d0 = await db(); const cts = d0.contr.filter((c) => c.evento_id === 'p:' + dp.id && c.status !== 'cancelado'), de = (u) => cts.find((c) => c.user_id === u);
    ok(cts.length === 4 && ['ana', 'bia', 'caio', 'casa'].every((u) => cts.filter((c) => c.user_id === u).length === 1), 'um contrato para cada artista do line-up e o da casa');
    ok(/81 99999-1111/.test(de('ana').texto) && /Recife\/PE/.test(de('ana').texto) && /R\$ 800,00/.test(de('ana').texto) && /81 98888-2222/.test(de('bia').texto) && /Olinda\/PE/.test(de('bia').texto), 'cada contrato vem com a Ficha daquele artista (WhatsApp, cidade) e o cachê dele');
    ok(/96666-3333/.test(de('caio').texto), 'sem WhatsApp na inscrição, vale o da conta');
    ok(['nome_completo', 'cpf_cnpj', 'chave_pix'].every((k) => de('ana').campos.some((c) => c.chave === k)) && !de('ana').campos.some((c) => c.chave === 'whatsapp'), 'o artista preenche no contrato só o que a Ficha não tem');
    ok(/Casa Line Ltda/.test(de('casa').texto), 'o contrato da casa sai com o modelo da casa e a Ficha da casa');
    ok(/4 contratos preparados/.test(await p.textContent(`#lpMsg-${dp.id}`)) && !(await p.$(`[data-lp-abrir="${dp.id}"]`)), 'confirma quantos preparou e o botão some: não duplica');
    ok(/Aguardando dados/.test(await quadro()) && (await p.getAttribute(`[data-lp-det="${dp.id}"] [data-lp-linha="ana"] a[href*="wa.me"]`, 'href')).startsWith('https://wa.me/5581999991111?text='), 'quadro: "Aguardando dados" e "Cobrar no WhatsApp" com o número da artista');
    // 3. Passos por artista: Ana marca um passo; cada um vê os seus.
    await p.click('#sair'); await p.waitForTimeout(400);
    await p.click('#entrar'); await p.waitForSelector('#esenha'); await p.waitForTimeout(300);
    await p.fill('#email', 'ana@line.com'); await p.fill('#esenha', 'segredo123'); await p.click('#eok'); await p.waitForTimeout(900); await pular();
    const contrAna = await p.evaluate(() => (S.conta.contr || []).map((c) => c.user_id));
    ok(contrAna.length === 1 && contrAna[0] === 'ana' && /Contrato para assinar/.test(await p.textContent('#app')), 'Ana vê só o contrato dela da data');
    await p.evaluate(() => { document.querySelectorAll('details').forEach((d) => { if (d.querySelector('[data-passo]')) d.open = true; }); });
    await p.check(`[data-passo="p:${dp.id}|formacao"]`); await p.waitForTimeout(500);
    ok((await db()).chk.some((c) => c.user_id === 'ana' && c.evento_id === 'p:' + dp.id && c.item === 'formacao'), 'Ana marca o passo dela na data');
    await p.click('#sair'); await p.waitForTimeout(400);
    // 4. Isa (Agenda): Contratos e documentos agrupado por data, com os passos de cada artista.
    await p.click('#entrar'); await p.click('[data-demo="equipe"]'); await p.waitForTimeout(700); await pular();
    await p.evaluate(() => { S.conta.perfil.areas = ['agenda']; }); await ir('documentos'); await p.waitForSelector('#lineups');
    await p.click(`[data-lp-det="${dp.id}"] > summary`); await p.waitForTimeout(200);
    const linha = (u) => p.textContent(`[data-lp-det="${dp.id}"] [data-lp-linha="${u}"]`);
    ok(/passos: 1\/\d+ feitos/.test(await linha('ana')) && /passos: 0\/\d+ feitos/.test(await linha('bia')), 'cada artista com os próprios passos no quadro (Ana 1 feito, Bia 0)');
    ok(!(await p.$(`[data-lp-det="${dp.id}"] [data-lp-linha="casa"]`)), 'Agenda vê os artistas; o contrato da casa fica com a Operações');
    // 5. Tirar artista do line-up cancela o contrato dela, com confirmação na página.
    await ir('datas_portal'); await p.click(`[data-dp-editar="${dp.id}"]`); await p.waitForTimeout(300);
    const nDialogos = dialogos.length;
    await p.click('[data-dp-rem="1"]'); await p.waitForTimeout(200); await p.click('[data-dp-salvar]'); await p.waitForTimeout(300);
    ok(await p.$('#dpConf') && /Bia Line/.test(await p.textContent('#dpConf')) && dialogos.length === nDialogos && (await db()).datasP[0].artistas.length === 3, 'tirar a Bia pede confirmação na própria página (sem janela do navegador) e ainda não salvou');
    await p.click('[data-dp-conf-ok]'); await p.waitForTimeout(900);
    d0 = await db();
    ok(d0.datasP[0].artistas.map((a) => a.nome).join() === 'Ana Line,Caio Line' && d0.contr.find((c) => c.user_id === 'bia' && c.evento_id === 'p:' + dp.id).status === 'cancelado', 'confirmado: a Bia sai do line-up e o contrato dela é cancelado');
    ok(d0.contr.filter((c) => c.evento_id === 'p:' + dp.id && c.status === 'enviado').length === 3 && /Contrato cancelado: Bia Line/.test(await p.textContent('#dpErr')), 'os outros contratos continuam e a mensagem diz o que foi cancelado');
    if (process.env.SHOT) await p.screenshot({ path: process.env.SHOT, fullPage: true });
  } catch (e) { ok(false, 'quebrou: ' + e.message.split('\n')[0]); await p.screenshot({ path: '/tmp/lineup-falha.png' }).catch(() => {}); }
  ok(!erros.length, 'sem erro JS ' + erros.join(' | '));
  console.log(res.join('\n')); await b.close();
})();
