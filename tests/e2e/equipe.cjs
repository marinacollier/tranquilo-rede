// Equipe da casa por função e Trilha da Nova Casa, no modo demonstração (sem banco):
// o dono monta a equipe e dá acesso; a pessoa da equipe entra só com a função dela (e tutorial próprio);
// a Central começa a trilha e a casa confirma a parte dela.
const { chromium } = require('playwright');
const B = process.env.BASE || 'http://localhost:8790/'; const res = []; const ok = (c, m) => { res.push((c ? 'OK    ' : 'FALHA ') + m); if (!c) process.exitCode = 1; };
const COD = {}; for (const [t, c] of require('fs').readFileSync(process.env.ACESSOS || '/tmp/tq-acessos.tsv', 'utf8').trim().split('\n').map((l) => l.split('\t'))) COD[t] ||= c;
(async () => {
  const b = await chromium.launch(); const erros = [];
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route('**/config.js', (r) => r.fulfill({ contentType: 'application/javascript', body: 'window.TQ_CONFIG = {};' }));
  await ctx.addInitScript(() => { try { localStorage.setItem('tq-consentimento', 'tudo'); localStorage.setItem('tq-tutorial-publico', '1'); } catch {} });
  const p = await ctx.newPage(); p.on('pageerror', (e) => erros.push(e.message)); p.on('dialog', (d) => d.accept());
  // Abre uma aba do menu ou, no portal da casa, a parte de uma das quatro áreas.
  const abrirAba = async (k) => { if (await p.$(`[data-aba="${k}"]`)) return p.click(`[data-aba="${k}"]`); const a = await p.evaluate((k) => window.TQConta?.areaDe?.(k), k); if (!a) throw new Error('aba inexistente ' + k); await p.click(`[data-aba="${a}"]`); await p.waitForTimeout(150); const sb = await p.$(`[data-sub="${a}|${k}"]`); if (sb) await sb.click(); await p.waitForTimeout(150); };
  const SUBS = ['cadastro_casa', 'equipe_casa', 'trilha', 'minha_funcao', 'materiais', 'roteiro', 'duvidas', 'agenda_casa', 'passos', 'minhas', 'campanha'];
  const pular = async () => { try { await p.waitForSelector('.tour-caixa', { timeout: 3000 }); await p.click((await p.$('[data-tour="pular"]')) ? '[data-tour="pular"]' : '[data-tour="avancar"]'); } catch {} };
  const abas = () => p.evaluate((subs) => [...new Set([...document.querySelectorAll('[data-aba]')].map((x) => x.dataset.aba))].concat(subs.filter((k) => window.TQConta?.areaDe?.(k))), SUBS);
  const db = () => p.evaluate(() => JSON.parse(localStorage.getItem('tq-demo-v1')));
  const criar = async (tipo, nome, email) => {
    await p.click('#entrar'); await p.click('[data-entrada="criar"]'); await p.waitForSelector('#enome');
    await p.click(`label:has(input[name="tipoNovo"][value="${tipo}"])`); await p.fill('#enome', nome); await p.fill('#email', email); await p.fill('#esenha', 'segredo123'); await p.press('#esenha', 'Enter');
  };
  const sair = async () => { await p.click('[data-aba="conta"]'); await p.click('#sairConta'); await p.waitForTimeout(400); };
  try {
    await p.goto(B); await p.waitForSelector('.cidade');
    // 1. Dono da casa monta a equipe.
    await criar('casa', 'Dono Teste', 'dono@casa.com'); await pular();
    await p.evaluate((cod) => { const d = JSON.parse(localStorage.getItem('tq-demo-v1')); Object.assign(d.usuarios[d.sessao].perfil, { vinculo_nome: 'Casa Teste', codigo_acesso: cod }); localStorage.setItem('tq-demo-v1', JSON.stringify(d)); }, COD.casa);
    await p.reload(); await pular(); await p.waitForTimeout(500);
    ok((await abas()).includes('equipe_casa') && !(await abas()).includes('trilha'), 'dono vê a aba Equipe da casa (e ainda não a Trilha)');
    await abrirAba('equipe_casa'); await p.waitForSelector('#eqcNome');
    await p.fill('#eqcNome', 'Ana'); await p.fill('#eqcEmail', 'ana@casa.com');
    await p.click('#eqcOk');
    ok(/Escolha a função/.test(await p.textContent('#eqcErr')), 'sem função escolhida, o site explica e não salva');
    ok(await p.$$eval('[data-eqc-funcao]', (xs) => xs.every((x) => x.type === 'radio')), 'uma função por pessoa (Guia v1.5): a escolha é única');
    await p.check('[data-eqc-funcao="porta"]');
    await p.click('#eqcOk'); await p.waitForSelector('[data-eqc-convidar]');
    const txt = await p.textContent('#app');
    ok(/Ana/.test(txt) && /Falta completar a equipe/.test(txt) && /Falta Líder Local/.test(txt), 'pessoa entra na equipe e o site mostra o que falta (Líder Local, reserva…)');
    await p.click('[data-eqc-convidar]'); await p.waitForTimeout(400);
    const cv = (await db()).conv['ana@casa.com'];
    ok(cv && cv.vinculo_nome === 'Casa Teste' && cv.funcoes.join() === 'porta', '"Dar acesso" cria o convite ligado à casa, com a função');
    // 2. A pessoa da equipe entra só com a função dela.
    await sair(); await criar('casa', 'Ana', 'ana@casa.com');
    await p.waitForSelector('.tour-caixa', { timeout: 8000 });
    const tag = await p.textContent('.tour-caixa .tag');
    const cob = await p.evaluate((subs) => { const abas = [...new Set([...document.querySelectorAll('[data-aba]')].map((b) => b.dataset.aba))].concat(subs.filter((k) => window.TQConta?.areaDe?.(k)));
      const ps = TQTour.passosDe('casa_equipe', (a) => abas.includes(a)); const ex = new Set(ps.flatMap((x) => [...(x.cobre || []), ...(x.ir ? [x.ir[0]] : [])]));
      return { abas, faltam: abas.filter((a) => !ex.has(a)) }; }, SUBS);
    ok(/Equipe da casa/.test(tag) && !cob.faltam.length, `primeiro acesso da equipe abre o tutorial dela, cobrindo as ${cob.abas.length} abas${cob.faltam.length ? ' (faltam ' + cob.faltam.join(', ') + ')' : ''}`);
    ok(cob.abas[0] === 'operacoes' && cob.abas.includes('minha_funcao') && !cob.abas.includes('ficha') && !cob.abas.includes('equipe_casa') && !cob.abas.includes('cadastro_casa') && !cob.abas.includes('minhas'), 'porta vê Minha função, sem a equipe, o cadastro e as métricas da casa');
    await pular(); await abrirAba('minha_funcao');
    ok(/Operador\(a\) de porta/.test(await p.textContent('#app')) && /Lista de entrada e cortesias/.test(await p.textContent('#app')), 'Minha função mostra o que a porta lê, recebe e devolve');
    // 3. A Central começa a trilha.
    await sair(); await p.click('#entrar'); await p.click('[data-demo="equipe"]'); await pular(); await p.waitForTimeout(400);
    await p.click('[data-aba="trilhas"]'); await p.waitForSelector('#triCasa');
    await p.fill('#triCasa', 'Casa Teste'); await p.fill('#triInicio', '2027-01-04'); await p.fill('#triNota', 'Combinado: piloto de 3 meses'); await p.click('#triOk');
    await p.waitForSelector('[data-tri-marco="Casa Teste|nota"]');
    ok(/a 12 jan/i.test(await p.textContent('#app')), 'trilha começada em 04/01/2027 fecha em 12/01 (7 dias úteis)');
    await p.click('[data-tri-marco="Casa Teste|nota"]'); await p.waitForTimeout(400);
    ok(!!(await db()).tri['Casa Teste'].marcos.nota, 'Central marca a etapa dela (nota de passagem)');
    // 4. A casa vê a trilha e confirma a leitura.
    await sair(); await p.click('#entrar'); await p.fill('#email', 'dono@casa.com'); await p.fill('#esenha', 'segredo123'); await p.press('#esenha', 'Enter'); await pular();
    await p.waitForFunction(() => window.TQConta?.areaDe?.('trilha'), null, { timeout: 10000 }).catch(() => {}); await pular();
    ok((await abas()).includes('trilha'), 'com a trilha começada, o dono vê a aba Trilha da nova casa');
    await abrirAba('trilha'); await p.waitForSelector('[data-trilha-casa="leitura"]');
    ok(!/Combinado: piloto/.test(await p.textContent('#app')), 'a casa não vê a nota de passagem');
    await p.click('[data-trilha-casa="leitura"]'); await p.waitForTimeout(400);
    ok(!!(await db()).tri['Casa Teste'].marcos.leitura && !(await p.$('[data-trilha-casa="nota"]')), 'a casa confirma a leitura do Guia e não marca etapa da Central');
  } catch (e) { ok(false, 'quebrou: ' + e.message.split('\n')[0]); }
  ok(!erros.length, 'sem erro JS ' + erros.join(' | '));
  console.log(res.join('\n')); await b.close();
})();
