// Portal da casa (alinhamento com o Gui, 11/2026), no modo demonstração (sem banco):
// quatro áreas no menu; Ficha da Casa igual ao modelo v1 (contrato com docs/gui/ficha-unidade-v1.inventario.json);
// campos vazios visíveis; ficha enviada muda só por pedido de atualização; disponibilidade de datas; Central aprova o pedido.
const { chromium } = require('playwright');
const INV = require('../../docs/gui/ficha-unidade-v1.inventario.json');
const B = process.env.BASE || 'http://localhost:8790/'; const res = []; const ok = (c, m) => { res.push((c ? 'OK    ' : 'FALHA ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch(); const erros = [];
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route('**/config.js', (r) => r.fulfill({ contentType: 'application/javascript', body: 'window.TQ_CONFIG = {};' }));
  await ctx.addInitScript(() => { try { localStorage.setItem('tq-consentimento', 'tudo'); localStorage.setItem('tq-tutorial-publico', '1'); } catch {} });
  const p = await ctx.newPage(); p.on('pageerror', (e) => erros.push(e.message)); p.on('dialog', (d) => d.accept());
  const pular = async () => { try { await p.waitForSelector('.tour-caixa', { timeout: 3000 }); await p.click((await p.$('[data-tour="pular"]')) ? '[data-tour="pular"]' : '[data-tour="avancar"]'); } catch {} };
  const db = () => p.evaluate(() => JSON.parse(localStorage.getItem('tq-demo-v1')));
  try {
    await p.goto(B); await p.waitForSelector('.cidade');
    await p.click('#entrar'); await p.click('[data-entrada="criar"]'); await p.waitForSelector('#enome');
    await p.click('label:has(input[name="tipoNovo"][value="casa"])'); await p.fill('#enome', 'Dona Teste'); await p.fill('#email', 'dona@portal.com'); await p.fill('#esenha', 'segredo123'); await p.press('#esenha', 'Enter');
    await pular();
    await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('tq-demo-v1')); Object.assign(d.usuarios[d.sessao].perfil, { vinculo_nome: 'Casa Portal', codigo_acesso: 'AAAA-BBBB-CCCC' }); localStorage.setItem('tq-demo-v1', JSON.stringify(d)); });
    await p.reload(); await pular(); await p.waitForSelector('[data-aba="ficha"]');
    // 1. Menu: exatamente quatro áreas, nesta ordem; a conta fica no rodapé.
    const menu = await p.$$eval('nav.tabs .nav-g:not(.nav-rodape) button[data-aba]', (xs) => xs.map((x) => x.textContent.trim()));
    ok(JSON.stringify(menu) === JSON.stringify(['Operações', 'Datas', 'Cronogramas', 'Marketing', 'Bonificações', 'Ficha da Casa']), `menu da casa no formato do Gui (11/11): ${menu.join(' · ')}`);
    ok(!!(await p.$('nav.tabs .nav-rodape [data-aba="conta"]')), 'Minha conta no rodapé, fora das quatro áreas');
    // 2. Ficha da Casa = modelo v1: seções, ordem, campos e opções.
    await p.click('[data-aba="ficha"]'); await p.waitForSelector('#form');
    const tela = await p.evaluate(() => [...document.querySelectorAll('#form section.fsec')].map((s) => ({ titulo: s.querySelector('h3').textContent.trim(), desc: s.querySelector('h3 + p')?.textContent.trim() || '',
      campos: [...s.querySelectorAll('.fcampo, .card > b')].map((c) => ({ rot: (c.querySelector('b') || c).textContent.replace(/\s*\*$/, '').trim(), ops: [...c.querySelectorAll('option')].filter((o) => o.value).map((o) => o.textContent.trim()).concat([...c.querySelectorAll('label')].map((l) => l.textContent.trim())) })) })));
    ok(JSON.stringify(tela.map((s) => s.titulo)) === JSON.stringify(INV.secoes.map((s) => s.titulo)), `seções na ordem do modelo: ${tela.map((s) => s.titulo).join(' · ')}`);
    const dif = [];
    for (const sec of INV.secoes) {
      const t = tela.find((x) => x.titulo === sec.titulo); if (!t) { dif.push('falta seção ' + sec.titulo); continue; }
      if (sec.descricao && t.desc !== sec.descricao) dif.push(`texto da seção ${sec.titulo}`);
      for (const [rot, ops] of sec.campos || []) { const c = t.campos.find((x) => x.rot === rot); if (!c) dif.push(`falta ${sec.titulo} > ${rot}`); else if (ops && JSON.stringify(c.ops) !== JSON.stringify(ops)) dif.push(`opções de ${rot}: ${c.ops.join('/')}`); }
      const ordem = (sec.campos || []).map(([r]) => r), naTela = t.campos.map((c) => c.rot).filter((r) => ordem.includes(r));
      if (JSON.stringify(ordem) !== JSON.stringify(naTela)) dif.push(`ordem dos campos em ${sec.titulo}`);
      for (const [bloco, cs] of sec.blocos || []) if (!t.campos.some((c) => c.rot === bloco)) dif.push(`falta bloco ${bloco}`); else void cs;
    }
    ok(!dif.length, `todos os campos, textos e opções do modelo v1 na tela${dif.length ? ' (' + dif.join('; ') + ')' : ''}`);
    const txt = await p.innerText('#app');
    ok(INV.parte1.every((h) => txt.includes(h)) && /Ainda não registrado pela Operações/.test(txt) && txt.includes(INV.rodape), 'Parte 1 com combinados vazios (sem valor de exemplo) e o rodapé do modelo');
    ok((await p.$$('#form [data-k]')).length >= 45 && (await p.$$eval('#form [data-k]', (xs) => xs.every((x) => x.value === ''))), 'ficha nova: todos os campos aparecem, vazios');
    // 3. Enviar: a ficha trava e muda só por pedido de atualização.
    for (const [k, v] of [['nome', 'Casa Portal'], ['cidade_uf', 'Recife/PE'], ['endereco', 'Rua A, 1'], ['dono_nome', 'Dona Teste'], ['whatsapp', '81 99999-0000'], ['capacidade_sentado', '80']]) await p.fill(`#form [data-k="${k}"]`, v);
    await p.click('#enviar'); await p.waitForTimeout(600);
    await p.click('[data-aba="ficha"]'); await p.waitForSelector('#solPedir');
    ok(await p.$eval('#form [data-k="luz"]', (x) => x.disabled), 'ficha enviada fica só para leitura');
    await p.click('#solPedir'); await p.fill('#form [data-k="luz"]', 'Frontal e contra'); await p.fill('#solMsg', 'Instalamos luz nova'); await p.click('#solEnviar'); await p.waitForTimeout(500);
    const d1 = await db(); const sol = (d1.sol || [])[0];
    ok(sol && sol.status === 'pendente' && sol.proposto.luz === 'Frontal e contra' && Object.keys(sol.proposto).length === 1 && d1.casas[d1.sessao].dados.luz !== 'Frontal e contra', 'pedido guarda só o que mudou e a ficha ainda não muda');
    ok(/Pedido de atualização com a Central/.test(await p.innerText('#app')), 'a casa vê o pedido aberto');
    // 4. Datas: disponibilidade.
    await p.click('[data-aba="datas_casa"]'); await p.waitForSelector('[data-cal-mes]');
    const dia = await p.$eval('[data-disp-dia]', (x) => x.dataset.dispDia);
    await p.click(`[data-disp-dia="${dia}"]`); await p.waitForTimeout(300); await p.click(`[data-disp-dia="${dia}"]`); await p.waitForTimeout(300);
    const disp = (await db()).disp || [];
    ok(disp.length === 1 && disp[0].dia === dia && disp[0].situacao === 'indisponivel' && disp[0].casa_ref === 'Casa Portal', 'disponibilidade: sem informação → disponível → indisponível, guardada para a casa');
    // 5. Central: aprova o pedido; vê a agenda das casas e o painel.
    await p.click('[data-aba="conta"]'); await p.click('#sairConta'); await p.waitForTimeout(400);
    await p.click('#entrar'); await p.click('[data-demo="equipe"]'); await pular(); await p.waitForTimeout(400);
    await p.click('[data-aba="casas_cad"]'); await p.waitForSelector('table[data-tbl="casc"] tbody tr'); await p.click('table[data-tbl="casc"] tbody tr'); await p.waitForSelector('[data-sol-responder]');
    ok(/Instalamos luz nova/.test(await p.innerText('#dlgIn')) && /Frontal e contra/.test(await p.innerText('#dlgIn')), 'Central vê o pedido com o antes e o proposto');
    ok(/só a administração vê/.test(await p.innerText('#dlgIn')), 'equipe não vê dados pessoais e bancários do Dono A');
    await p.click('[data-sol-responder$="|1"]'); await p.waitForTimeout(500);
    const d2 = await db(), casa = Object.values(d2.casas)[0];
    ok(casa.dados.luz === 'Frontal e contra' && d2.sol[0].status === 'aprovada', 'pedido aprovado atualiza a ficha');
    await p.click('[data-aba="agenda_casas"]'); await p.waitForSelector('.cal');
    ok(/Casa Portal/.test(await p.innerText('#app')), 'Agenda das casas mostra a casa que informou a disponibilidade');
    await p.click('[data-aba="painel"]'); await p.waitForTimeout(400);
    ok(/Eventos por data/.test(await p.innerText('#app')), 'Painel da operação abre para a equipe');
  } catch (e) { ok(false, 'quebrou: ' + e.message.split('\n')[0]); }
  ok(!erros.length, 'sem erro JS ' + erros.join(' | '));
  console.log(res.join('\n')); await b.close();
})();
