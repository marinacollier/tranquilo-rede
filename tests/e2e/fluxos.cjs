// Gerado a partir dos testes manuais da sessão de QA. Rode com: scripts/testar-e2e.sh
const BASE = process.env.BASE || 'http://localhost:8077/';
const COD = Object.fromEntries(require('fs').readFileSync(process.env.ACESSOS || '/tmp/tq-acessos.tsv', 'utf8').trim().split('\n').map((l) => l.split('\t')).filter((c) => ['adm', 'equipe'].includes(c[0]) || ['Joyce Alane', 'Coringa Madá'].includes(c[2])).map((c) => [c[0] === 'artista' || c[0] === 'casa' ? c[0] : c[0], c[1].replace(/-/g, '')]));
const { chromium } = require('playwright');
const out = process.argv[2] || '/tmp', URL = BASE;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALHA') + ' ' + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } });
  await ctx.route(/supabase\.co/, (r) => r.abort()); await ctx.addInitScript(() => { try { localStorage.setItem('tq-consentimento', 'tudo'); } catch {} });
  const p = await ctx.newPage(); const erros = []; p.on('pageerror', (e) => erros.push(e.message));
  p.on('dialog', (d) => d.accept());
  // 1. Público: tutorial abre na primeira visita
  await p.goto(URL); await p.waitForSelector('.tour-caixa', { timeout: 15000 });
  ok(/Tutorial · Visitante/.test(await p.textContent('.tour-caixa')), 'público: tutorial abre na primeira visita');
  await p.screenshot({ path: `${out}/1-publico-tutorial.png` });
  await p.click('[data-tour="avancar"]'); await p.click('[data-tour="avancar"]');
  ok(/Avise-me/.test(await p.textContent('#tourTit')), 'público: avança para o passo do aviso');
  ok(await p.$('#avise.tour-foco') !== null, 'público: destaca o bloco "Me avise" na página');
  await p.click('[data-tour="voltar"]'); ok(/Agenda e ingressos/.test(await p.textContent('#tourTit')), 'público: voltar funciona');
  await p.keyboard.press('Escape'); ok(await p.$('.tour') === null, 'público: Esc fecha (pausa) o tutorial');
  await p.reload(); await p.waitForSelector('.tour-caixa', { timeout: 8000 });
  ok(/Continuando/.test(await p.textContent('.tour-caixa .tag')) && /Agenda e ingressos/.test(await p.textContent('#tourTit')), 'público: depois de fechar, a próxima visita continua do mesmo passo');
  await p.click('[data-tour="pular"]'); await p.reload(); await p.waitForTimeout(1500);
  ok(await p.$('.tour') === null, 'público: depois de "Pular tutorial", não reabre');
  await p.click('[data-como-funciona]'); ok(await p.$('.tour') !== null, 'público: "Como funciona" reabre'); await p.click('[data-tour="pular"]');
  // 2. Me avise
  await p.selectOption('#avCidade', '__outra'); ok(await p.isVisible('#avOutra'), 'aviso: "Outra cidade" abre campo');
  await p.fill('#avOutra', 'Recife'); await p.fill('#avContato', '81 9'); await p.click('#avOk');
  ok(/WhatsApp com DDD/.test(await p.textContent('#averr')), 'aviso: valida contato');
  await p.fill('#avContato', '(81) 99999-0000'); await p.click('#avOk');
  ok(/autorização/.test(await p.textContent('#averr')), 'aviso: exige autorização');
  await p.check('#avOk2'); await p.click('#avOk'); await p.waitForSelector('#avForm .alert.good');
  ok(/Recife/.test(await p.textContent('#avForm')), 'aviso: pedido registrado');
  await p.screenshot({ path: `${out}/2-aviso.png`, fullPage: false });
  // 3. Artista nova: cadastro → tutorial de artista na hora
  await p.click('#entrar'); await p.waitForTimeout(150); await p.click('[data-entrada="criar"]');
  await p.fill('#enome', 'Artista Teste'); await p.fill('#email', 'nova@teste.com'); await p.fill('#esenha', 'senha123'); await p.click('#eok');
  await p.waitForSelector('.tour-caixa'); ok(/Tutorial · Artista/.test(await p.textContent('.tour-caixa')), 'artista: tutorial abre no primeiro acesso');
  await p.screenshot({ path: `${out}/3-artista-tutorial.png` });
  await p.click('[data-tour="avancar"]'); await p.click('[data-tour="ir"]');
  ok(await p.$('.tour') === null && /Inscreva-se na rede/.test(await p.textContent('#app')), 'artista: atalho do tutorial abre a inscrição');
  await p.click('#sair'); await p.waitForTimeout(300);
  await p.click('#entrar'); await p.waitForTimeout(150); await p.fill('#email', 'nova@teste.com'); await p.fill('#esenha', 'senha123'); await p.click('#eok'); await p.waitForTimeout(800);
  ok(/^Continuando/.test(await p.textContent('.tour-caixa .tag').catch(() => '')), 'artista: no segundo login o tutorial continua de onde o atalho parou');
  await p.click('[data-tour="pular"]'); await p.click('#sair'); await p.waitForTimeout(300);
  await p.click('#entrar'); await p.waitForTimeout(150); await p.fill('#email', 'nova@teste.com'); await p.fill('#esenha', 'senha123'); await p.click('#eok'); await p.waitForTimeout(800);
  ok(await p.$('.tour') === null, 'artista: depois de pular, não reabre no login seguinte');
  await p.click('[data-aba="conta"]'); await p.click('[data-rever-tutorial]'); ok(await p.$('.tour') !== null, 'artista: "Ver o tutorial de novo" reabre');
  const nPassos = await p.$$eval('.tour-pontos button', (x) => x.length);   // o roteiro cresce quando entram abas novas
  for (let i = 0; i < nPassos; i++) await p.click('[data-tour="avancar"]');
  ok(await p.$('.tour') === null, 'artista: "Concluir" no último passo fecha');
  await p.click('#sairConta'); await p.waitForTimeout(300);
  // 4. Equipe: convite, tutorial, demanda
  await p.click('#entrar'); await p.waitForTimeout(150); await p.click('[data-demo="equipe"]'); await p.waitForSelector('.tour-caixa');
  ok(/Tutorial · Equipe/.test(await p.textContent('.tour-caixa')), 'equipe: tutorial próprio no primeiro acesso');
  await p.click('[data-tour="pular"]');
  await p.click('[data-aba="convites"]'); await p.waitForSelector('#cvOk');
  ok(!(await p.$$eval('#cvTipo option', (o) => o.map((x) => x.value))).includes('adm'), 'equipe: não pode convidar administração');
  await p.fill('#cvNome', 'Casa Convidada'); await p.selectOption('#cvTipo', 'casa'); await p.waitForTimeout(200);
  await p.fill('#cvNome', 'Casa Convidada'); await p.fill('#cvEmail', 'casa.convidada@teste.com'); await p.fill('#cvWa', '31 98888-7777'); await p.click('#cvOk');
  await p.waitForSelector('#envTxt'); const msg = await p.inputValue('#envTxt');
  ok(/casa\.convidada%40teste\.com|casa.convidada@teste.com/.test(msg) && /#criar&email=/.test(msg), 'equipe: convite gera mensagem com link de criar senha');
  ok((await p.getAttribute('[data-envio]', 'href')).startsWith('https://wa.me/31988887777'), 'equipe: WhatsApp já vai para o número da casa');
  await p.screenshot({ path: `${out}/4-convite.png` });
  await p.click('#dlg button:has-text("Fechar")');
  ok(/Casa Convidada/.test(await p.textContent('#app')) && /aguardando/.test(await p.textContent('#app')), 'equipe: convite aparece na lista como aguardando');
  await p.click('[data-enviar-tutorial^="casa|casa.convidada"]'); await p.waitForSelector('#envTxt');
  ok(/#tutorial-casa/.test(await p.inputValue('#envTxt')), 'equipe: tutorial da casa vai com o link certo');
  await p.click('#dlg [data-envio]'); await p.click('#dlg button:has-text("Fechar")'); await p.click('[data-aba="convites"]');
  ok(/enviado em/.test(await p.textContent('#app')), 'equipe: registra que o tutorial foi enviado');
  await p.click('[data-aba="demanda"]'); await p.waitForTimeout(300);
  const dem = await p.textContent('#app'); ok(/Recife/.test(dem) && /nenhuma/.test(dem), 'equipe: demanda mostra Recife pedida e sem data');
  await p.screenshot({ path: `${out}/5-demanda.png`, fullPage: true });
  await p.click('#sair'); await p.waitForTimeout(300);
  // 5. Convidada abre o link do WhatsApp: formulário já preenchido; ao criar conta, entra como casa
  const p2 = await ctx.newPage(); p2.on('pageerror', (e) => erros.push(e.message));
  await p2.goto(URL + '#criar&email=casa.convidada%40teste.com&tipo=casa'); await p2.waitForSelector('#enome');
  ok(await p2.inputValue('#email') === 'casa.convidada@teste.com' && await p2.isChecked('input[name="tipoNovo"][value="casa"]'), 'convite: link abre o cadastro preenchido como casa');
  await p2.fill('#enome', 'Responsável'); await p2.fill('#esenha', 'senha123'); await p2.click('#eok'); await p2.waitForSelector('.tour-caixa');
  ok(/Tutorial · Casa/.test(await p2.textContent('.tour-caixa')), 'convite: casa convidada vê o tutorial de casa');
  await p2.click('[data-tour="pular"]');
  ok(/Casa/.test(await p2.textContent('#quem')), 'convite: casa convidada entra na área da casa');
  // 6. Link direto de tutorial e celular
  const m = await b.newPage({ viewport: { width: 390, height: 844 } }); await m.route(/supabase\.co/, (r) => r.abort());
  await m.goto(URL + '#tutorial-artista'); await m.waitForSelector('.tour-caixa');
  ok(/Tutorial · Artista/.test(await m.textContent('.tour-caixa')), 'link #tutorial-artista abre sem login');
  const box = await m.$eval('.tour-caixa', (e) => { const r = e.getBoundingClientRect(); return { w: r.width, b: r.bottom, sw: document.documentElement.scrollWidth }; });
  ok(box.w <= 390 && box.sw <= 390, `celular: tutorial cabe na tela (${Math.round(box.w)}px, página ${box.sw}px)`);
  await m.screenshot({ path: `${out}/6-celular.png` });
  ok(erros.length === 0, 'sem erros de JavaScript' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await b.close();
})();
