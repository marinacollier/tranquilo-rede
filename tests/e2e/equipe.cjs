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
  const pular = async () => { try { await p.waitForSelector('.tour-caixa', { timeout: 3000 }); await p.click((await p.$('[data-tour="pular"]')) ? '[data-tour="pular"]' : '[data-tour="avancar"]'); } catch {} };
  const abas = () => p.$$eval('[data-aba]', (xs) => [...new Set(xs.map((x) => x.dataset.aba))]);
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
    await p.click('[data-aba="equipe_casa"]'); await p.waitForSelector('#eqcNome');
    await p.fill('#eqcNome', 'Ana'); await p.fill('#eqcEmail', 'ana@casa.com');
    await p.check('[data-eqc-funcao="anfitriao"]'); await p.check('[data-eqc-funcao="social_media"]'); await p.click('#eqcOk');
    ok(/nunca são a mesma pessoa/.test(await p.textContent('#eqcErr')), 'anfitrião e social media na mesma pessoa: o site explica e não salva');
    await p.uncheck('[data-eqc-funcao="anfitriao"]'); await p.uncheck('[data-eqc-funcao="social_media"]'); await p.check('[data-eqc-funcao="produtor"]'); await p.check('[data-eqc-funcao="porta"]');
    await p.click('#eqcOk'); await p.waitForSelector('[data-eqc-convidar]');
    const txt = await p.textContent('#app');
    ok(/Ana/.test(txt) && /Falta completar a equipe/.test(txt) && /Falta Líder Local/.test(txt), 'pessoa entra na equipe e o site mostra o que falta (Líder Local, reserva…)');
    await p.click('[data-eqc-convidar]'); await p.waitForTimeout(400);
    const cv = (await db()).conv['ana@casa.com'];
    ok(cv && cv.vinculo_nome === 'Casa Teste' && cv.funcoes.join() === 'porta,produtor', '"Dar acesso" cria o convite ligado à casa, com as funções');
    // 2. A pessoa da equipe entra só com a função dela.
    await sair(); await criar('casa', 'Ana', 'ana@casa.com');
    await p.waitForSelector('.tour-caixa', { timeout: 8000 });
    const tag = await p.textContent('.tour-caixa .tag');
    const cob = await p.evaluate(() => { const abas = [...new Set([...document.querySelectorAll('[data-aba]')].map((b) => b.dataset.aba))];
      const ps = TQTour.passosDe('casa_equipe', (a) => abas.includes(a)); const ex = new Set(ps.flatMap((x) => [...(x.cobre || []), ...(x.ir ? [x.ir[0]] : [])]));
      return { abas, faltam: abas.filter((a) => !ex.has(a)) }; });
    ok(/Equipe da casa/.test(tag) && !cob.faltam.length, `primeiro acesso da equipe abre o tutorial dela, cobrindo as ${cob.abas.length} abas${cob.faltam.length ? ' (faltam ' + cob.faltam.join(', ') + ')' : ''}`);
    ok(cob.abas[0] === 'minha_funcao' && cob.abas.includes('equipe_casa') && !cob.abas.includes('cadastro_casa') && !cob.abas.includes('minhas'), 'produtor vê Minha função e a equipe, sem o cadastro e sem as métricas da casa');
    await pular(); await p.click('[data-aba="minha_funcao"]');
    ok(/Produtor/.test(await p.textContent('#app')) && /Pacote fixado no grupo/.test(await p.textContent('#app')), 'Minha função mostra o que o produtor lê, recebe e devolve');
    await p.click('[data-aba="equipe_casa"]'); await p.waitForTimeout(300);
    ok(!(await p.$('#eqcForm')) && !(await p.$('[data-eqc-remover]')), 'pessoa da equipe só vê a equipe (não muda nada)');
    // 3. A Central começa a trilha.
    await sair(); await p.click('#entrar'); await p.click('[data-demo="equipe"]'); await pular(); await p.waitForTimeout(400);
    await p.click('[data-aba="trilhas"]'); await p.waitForSelector('#triCasa');
    await p.fill('#triCasa', 'Casa Teste'); await p.fill('#triInicio', '2027-01-04'); await p.fill('#triNota', 'Combinado: piloto de 3 meses'); await p.click('#triOk');
    await p.waitForSelector('[data-tri-marco="Casa Teste|nota"]');
    ok(/a 12 jan/i.test(await p.textContent('#app')), 'trilha começada em 04/01/2027 fecha em 12/01 (7 dias úteis)');
    await p.click('[data-tri-marco="Casa Teste|nota"]'); await p.waitForTimeout(400);
    ok(!!(await db()).tri['Casa Teste'].marcos.nota, 'Central marca a etapa dela (nota de passagem)');
    // 4. A casa vê a trilha e confirma a leitura.
    await sair(); await p.click('#entrar'); await p.fill('#email', 'dono@casa.com'); await p.fill('#esenha', 'segredo123'); await p.press('#esenha', 'Enter'); await pular(); await p.waitForTimeout(500);
    ok((await abas()).includes('trilha'), 'com a trilha começada, o dono vê a aba Trilha da nova casa');
    await p.click('[data-aba="trilha"]'); await p.waitForSelector('[data-trilha-casa="leitura"]');
    ok(!/Combinado: piloto/.test(await p.textContent('#app')), 'a casa não vê a nota de passagem');
    await p.click('[data-trilha-casa="leitura"]'); await p.waitForTimeout(400);
    ok(!!(await db()).tri['Casa Teste'].marcos.leitura && !(await p.$('[data-trilha-casa="nota"]')), 'a casa confirma a leitura do Guia e não marca etapa da Central');
  } catch (e) { ok(false, 'quebrou: ' + e.message.split('\n')[0]); }
  ok(!erros.length, 'sem erro JS ' + erros.join(' | '));
  console.log(res.join('\n')); await b.close();
})();
