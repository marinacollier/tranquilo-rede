// Formulários longos em partes (pedido da Marina, 18/11/2026), no modo demonstração (sem banco):
// Ficha da casa e Minha ficha do artista com partes recolhíveis (abre a primeira incompleta), ✓ e progresso,
// "Salvar esta parte", rascunho salvo sozinho com cópia local no navegador, "Enviar" desabilitado dizendo o que falta
// (com link para o campo) e sem a pergunta duplicada de disponibilidade (vai no calendário).
const { chromium } = require('playwright');
const B = process.env.BASE || 'http://localhost:8790/'; const res = []; const ok = (c, m) => { res.push((c ? 'OK    ' : 'FALHA ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch(); const erros = [];
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route('**/config.js*', (r) => r.fulfill({ contentType: 'application/javascript', body: 'window.TQ_CONFIG = {};' }));
  await ctx.addInitScript(() => { try { localStorage.setItem('tq-consentimento', 'tudo'); localStorage.setItem('tq-sem-trilha', '1'); localStorage.setItem('tq-dp-aberto', '1'); localStorage.setItem('tq-tutorial-publico', '1'); } catch {} });
  const p = await ctx.newPage(); p.on('pageerror', (e) => erros.push(e.message)); p.on('dialog', (d) => d.accept());
  const pular = async () => { try { await p.waitForSelector('.tour-caixa', { timeout: 2500 }); await p.click((await p.$('[data-tour="pular"]')) ? '[data-tour="pular"]' : '[data-tour="avancar"]'); } catch {} };
  const ir = async (k) => { await p.evaluate((k) => { const a = TQConta.areaDe?.(k); if (a) { S.sub = S.sub || {}; S.sub[a] = k; S.aba = a; } else S.aba = k; render(); }, k); await p.waitForTimeout(600); };
  const db = () => p.evaluate(() => JSON.parse(localStorage.getItem('tq-demo-v1')));
  const criar = async (tipo, nome, email) => {
    await p.click('#entrar'); await p.click('[data-entrada="criar"]'); await p.waitForSelector('#enome');
    await p.click(`label:has(input[name="tipoNovo"][value="${tipo}"])`); await p.waitForTimeout(200);
    await p.fill('#enome', nome); await p.fill('#email', email); await p.fill('#esenha', 'segredo123'); await p.press('#esenha', 'Enter'); await p.waitForTimeout(800); await pular();
  };
  const abertas = () => p.$$eval('#form details[data-parte]', (xs) => xs.map((x) => x.open));
  const abrirTudo = () => p.$$eval('#form details[data-parte]', (xs) => xs.forEach((x) => { x.open = true; }));
  const progresso = () => p.textContent('[data-prog-txt]');
  try {
    await p.goto(B); await p.waitForSelector('.cidade'); await p.keyboard.press('Escape');
    // ---------- Casa ----------
    await criar('casa', 'Dona Etapas', 'dona@etapas.com');
    await ir('cadastro_casa'); await p.waitForSelector('#form details[data-parte]');
    const ab = await abertas();
    ok(ab.length === 8 && ab[0] && ab.slice(1).every((x) => !x), `casa: 8 partes recolhíveis, só a primeira (incompleta) aberta (${ab.map(Number).join('')})`);
    ok(/^0 de 8 partes completas$/.test((await progresso()).trim()), `progresso no topo (${(await progresso()).trim()})`);
    ok(await p.isDisabled('#enviar') && /Para enviar, faltam/.test(await p.textContent('#faltaEnviar')), 'Enviar fica desabilitado e diz o que falta');
    const itens = await p.$$eval('#faltaEnviar a', (xs) => xs.map((x) => x.textContent));
    ok(['Razão social', 'CNPJ', 'Dono A: CPF', 'Repasses: Titular da conta', 'Repasses: banco, agência e conta, ou a chave Pix', 'Capacidade com público sentado no chão'].every((x) => itens.includes(x)), `obrigatórios para habilitar e gerar o contrato (${itens.length} itens)`);
    ok(!(await p.$('#form [data-multi="dias_semana"]')) && !/Dias da semana que podem receber/.test(await p.textContent('#app')), 'casa: sem a pergunta "Dias da semana" (vai no calendário de disponibilidade)');
    // Link do que falta leva ao campo (abre a parte fechada).
    await p.click('#faltaEnviar a:has-text("Dono A: CPF")'); await p.waitForTimeout(200);
    ok(await p.evaluate(() => document.activeElement?.dataset?.k === 'dono_cpf' && document.activeElement.closest('details').open), 'o link do que falta abre a parte e leva ao campo');
    // Preenche a primeira parte e salva a parte: ✓, progresso e a próxima abre.
    for (const [k, v] of [['nome', 'Casa Etapas'], ['cidade_uf', 'Recife/PE'], ['razao_social', 'Casa Etapas Ltda'], ['cnpj', '11.222.333/0001-81'], ['endereco', 'Rua das Flores, 10, Boa Vista, 50000-000']]) await p.fill(`#form [data-k="${k}"]`, v);
    await p.click('[data-parte="0"] [data-salvar-parte]'); await p.waitForTimeout(700);
    ok(/✓ Feito: Parte salva/.test(await p.textContent('[data-parte="0"] [data-parte-msg]')) && (await p.textContent('[data-parte="0"] [data-parte-n]')).trim() === '✓', 'Salvar esta parte: ✓ na parte completa');
    const ab2 = await abertas();
    ok(!ab2[0] && ab2[1], 'a parte completa fecha e abre a próxima incompleta');
    ok(/^1 de 8 partes completas$/.test((await progresso()).trim()), `progresso atualiza (${(await progresso()).trim()})`);
    ok((Object.values((await db()).casas)[0]?.dados || {}).razao_social === 'Casa Etapas Ltda', 'a parte vai para o banco como rascunho');
    ok((Object.values((await db()).casas)[0]?.dados || {}).cidade_uf === 'Recife/PE' && await p.inputValue('#form [data-fcid-uf]') === 'PE' && await p.inputValue('#form [data-k="cidade_uf"]') === 'Recife', 'Cidade/UF: colar "Recife/PE" escolhe PE no estado e grava "Recife/PE" como antes');
    ok(Object.values((await db()).casas)[0]?.status === 'rascunho', 'salvar a parte não envia a Ficha');
    // CNPJ inválido também segura o envio.
    await abrirTudo();
    for (const [k, v] of [['dono_nome', 'Dona Etapas Silva'], ['dono_cpf', '529.982.247-25'], ['whatsapp', '81 99999-0000'], ['rep_titular', 'Casa Etapas Ltda'], ['rep_documento', '11.222.333/0001-81'], ['rep_pix', '11.222.333/0001-81'], ['capacidade_sentado', '80']]) await p.fill(`#form [data-k="${k}"]`, v);
    await p.fill('#form [data-k="cnpj"]', '11.111.111/1111-11'); await p.waitForTimeout(200);
    ok(await p.isDisabled('#enviar') && /CNPJ inválido/.test(await p.textContent('#faltaEnviar')), 'campo inválido também segura o envio');
    await p.fill('#form [data-k="cnpj"]', '11.222.333/0001-81'); await p.waitForTimeout(200);
    ok(!(await p.isDisabled('#enviar')) && /Tudo preenchido/.test(await p.textContent('#faltaEnviar')), 'com tudo preenchido e válido, Enviar libera');
    // Cópia local: digita e recarrega antes do salvamento automático.
    await p.fill('#form [data-k="luz"]', 'Frontal quente'); await p.waitForTimeout(150);
    ok(/Frontal quente/.test(await p.evaluate(() => Object.entries(localStorage).filter(([k]) => k.startsWith('tq-rascunho-casa-')).map(([, v]) => v).join(''))), 'cópia local guardada no navegador enquanto digita');
    // Sem conexão na hora de sair: a cópia local fica e o banco ainda não tem (simula o salvamento que não chegou).
    await p.evaluate(() => { clearTimeout(S.tauto); S.tauto = null; const k = Object.keys(localStorage).find((x) => x.startsWith('tq-rascunho-casa-')); const l = JSON.parse(localStorage.getItem(k)); l.dados.luz = 'Frontal quente'; localStorage.setItem(k, JSON.stringify(l));
      const d = JSON.parse(localStorage.getItem('tq-demo-v1')); Object.values(d.casas)[0].dados.luz = ''; localStorage.setItem('tq-demo-v1', JSON.stringify(d)); });
    await p.reload(); await p.waitForTimeout(800); await pular(); await ir('cadastro_casa'); await p.waitForSelector('#form details[data-parte]');
    ok(await p.inputValue('#form [data-k="luz"]') === 'Frontal quente' && /Recuperamos o que você tinha digitado/.test(await p.textContent('#app')), 'saiu e voltou: o que não tinha chegado ao banco volta da cópia local');
    await p.waitForTimeout(1500);
    ok((Object.values((await db()).casas)[0]?.dados || {}).luz === 'Frontal quente', 'o recuperado é salvo no banco sozinho');
    ok(!(await p.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith('tq-rascunho-casa-')))), 'depois de salvo, a cópia local sai');
    await p.click('#enviar'); await p.waitForTimeout(300);
    // Enviar trava as respostas: pergunta na própria página antes (Marina, 18/11/2026) e nada sai até o "Sim".
    ok(/Enviar a Ficha ao Tranquilo agora\?/.test(await p.textContent('.conf-aqui')) && Object.values((await db()).casas)[0]?.status !== 'em_analise', 'Enviar pergunta na própria página antes, dizendo o que acontece');
    await p.click('[data-conf-sim]'); await p.waitForTimeout(700);
    ok(Object.values((await db()).casas)[0]?.status === 'em_analise', 'Ficha completa enviada vai para análise');
    await ir('conta'); await p.click('#sairConta'); await p.waitForTimeout(400);
    // ---------- Artista ----------
    await criar('artista', 'Bia Etapas', 'bia@etapas.com');
    await ir('inscricao'); await p.waitForSelector('#form details[data-parte]');
    const abA = await abertas();
    ok(abA.length === 5 && abA[0] && abA.slice(1).every((x) => !x), `artista: 5 partes, só a primeira aberta (${abA.map(Number).join('')})`);
    ok(!(await p.$('#form [data-k="disponibilidade"]')) && !!(await p.$('#dispFicha')), 'artista: sem a observação de disponibilidade; o calendário continua');
    ok(await p.isDisabled('#enviar') && /Nome artístico/.test(await p.textContent('#faltaEnviar')), 'artista: Enviar desabilitado dizendo o que falta');
    await p.fill('#form [data-k="nome_artistico"]', 'Bia Etapas'); await p.waitForTimeout(1600);
    ok((Object.values((await db()).insc)[0]?.dados || {}).nome_artistico === 'Bia Etapas' && Object.values((await db()).insc)[0]?.status === 'rascunho', 'artista: rascunho salvo sozinho no banco, sem enviar');
    // "Salvar esta parte" incompleta: guarda o rascunho, mas avisa em amarelo o que falta pelo nome e marca em vermelho.
    await p.fill('#form [data-k="release"]', 'x'); await p.click('[data-parte="0"] [data-salvar-parte]'); await p.waitForTimeout(700);
    const msgP = await p.textContent('[data-parte="0"] [data-parte-msg]');
    ok(/^⚠ Atenção: Rascunho salvo às \d\d:\d\d\. Para completar esta parte: /.test(msgP) && /Release curto precisa de pelo menos 200 caracteres \(agora tem 1\)/.test(msgP) && /escolha a cidade onde mora/.test(msgP) && !/Feito/.test(msgP)
      && await p.$eval('[data-parte="0"] [data-parte-msg]', (e) => e.classList.contains('atencao')), `parte incompleta: rascunho salvo, em amarelo, dizendo o que falta pelo nome (${msgP.slice(0, 160)}…)`);
    ok(await p.$eval('#form [data-k="release"]', (e) => e.classList.contains('campo-falta')) && await p.$eval('#form [data-k="estado"]', (e) => e.classList.contains('campo-falta')), 'parte incompleta: os campos que faltam ficam em vermelho');
    ok((await p.textContent('[data-parte="0"] [data-parte-n]')).trim() === '1' && /Release curto precisa/.test(await p.textContent('#faltaEnviar')) && await p.isDisabled('#enviar'), 'mínimo de caracteres conta como incompleto na parte e no Enviar');
    ok((Object.values((await db()).insc)[0]?.dados || {}).release === 'x', 'mesmo incompleta, a parte foi guardada como rascunho');
    await p.$eval('#form [data-parte="4"]', (d) => { d.open = true; }); await p.click('[data-parte="4"] [data-salvar-parte]'); await p.waitForTimeout(700);
    const msgC = await p.textContent('[data-parte="4"] [data-parte-msg]');
    ok(/marque a autorização de uso dos dados/.test(msgC) && await p.$eval('#form [data-k="aceite"]', (e) => e.closest('.fcheck').classList.contains('campo-falta')) && /Autorizo o Tranquilo/.test(await p.textContent('#faltaEnviar')), `caixa obrigatória: conta como falta e fica em vermelho (${msgC.slice(0, 120)}…)`);
    // Valor antigo da observação de disponibilidade não se perde ao salvar.
    await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('tq-demo-v1')); Object.values(d.insc)[0].dados.disponibilidade = 'Só a partir de março'; localStorage.setItem('tq-demo-v1', JSON.stringify(d)); });
    await p.reload(); await pular(); await ir('inscricao'); await p.waitForSelector('#form details[data-parte]');
    await p.fill('#form [data-k="generos"]', 'MPB e samba'); await p.waitForTimeout(1600);
    ok((Object.values((await db()).insc)[0]?.dados || {}).disponibilidade === 'Só a partir de março', 'artista: a observação antiga de disponibilidade continua guardada');
  } catch (e) { ok(false, 'quebrou: ' + e.message.split('\n')[0]); }
  ok(!erros.length, 'sem erro JS ' + erros.join(' | '));
  console.log(res.join('\n')); await b.close();
})();
