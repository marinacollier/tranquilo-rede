// Documento do Gui de 11/11/2026 ("Site Tranquilo – Áreas do Artista e do Franqueado"), no modo demonstração:
// casa com Operações (Guia primeiro), Datas, Cronogramas, Marketing por função, Bonificações e a Ficha como entrada;
// artista com endereço clicável e horários; equipe com artista e casa lado a lado. O que não tem fonte aparece "a validar".
const { chromium } = require('playwright');
const B = process.env.BASE || 'http://localhost:8790/'; const res = []; const ok = (c, m) => { res.push((c ? 'OK    ' : 'FALHA ') + m); if (!c) process.exitCode = 1; };
const linhas = require('fs').readFileSync(process.env.ACESSOS || '/tmp/tq-acessos.tsv', 'utf8').trim().split('\n').map((l) => l.split('\t'));
(async () => {
  const b = await chromium.launch(); const erros = [];
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route('**/config.js', (r) => r.fulfill({ contentType: 'application/javascript', body: 'window.TQ_CONFIG = {};' }));
  await ctx.addInitScript(() => { try { localStorage.setItem('tq-consentimento', 'tudo'); localStorage.setItem('tq-tutorial-publico', '1'); } catch {} });
  const p = await ctx.newPage(); p.on('pageerror', (e) => erros.push(e.message)); p.on('dialog', (d) => d.accept());
  const pular = async () => { try { await p.waitForSelector('.tour-caixa', { timeout: 3000 }); await p.click((await p.$('[data-tour="pular"]')) ? '[data-tour="pular"]' : '[data-tour="avancar"]'); } catch {} };
  const sub = async (a, k) => { await p.click(`[data-aba="${a}"]`); await p.waitForTimeout(200); const s = await p.$(`[data-sub="${a}|${k}"]`); if (s) await s.click(); await p.waitForTimeout(300); };
  const app = () => p.textContent('#app');
  const conta = async (tipo, nome, email, cod, vinculo) => {
    await p.goto(B); await p.waitForSelector('.cidade');
    await p.click('#entrar'); await p.click('[data-entrada="criar"]'); await p.waitForSelector('#enome');
    await p.click(`label:has(input[name="tipoNovo"][value="${tipo}"])`); await p.fill('#enome', nome); await p.fill('#email', email); await p.fill('#esenha', 'segredo123'); await p.press('#esenha', 'Enter'); await pular();
    await p.evaluate(([cod, v]) => { const d = JSON.parse(localStorage.getItem('tq-demo-v1')); Object.assign(d.usuarios[d.sessao].perfil, { vinculo_nome: v, codigo_acesso: cod }); localStorage.setItem('tq-demo-v1', JSON.stringify(d)); }, [cod, vinculo]);
    await p.reload(); await pular(); await p.waitForTimeout(400);
  };
  try {
    // 1. Casa: menu no formato do Gui e a Ficha como entrada.
    const casa = linhas.find(([t, , n]) => t === 'casa' && !/^Casa (em|da rede)/.test(n));
    await conta('casa', 'Dono Áreas', 'dono@areas.com', casa[1], casa[2]);
    const menu = await p.$$eval('nav.tabs .nav-g:not(.nav-rodape) button[data-aba]', (xs) => xs.map((x) => x.textContent.trim()));
    ok(menu.join('|') === 'Operações|Datas|Cronogramas|Marketing|Bonificações|Ficha da Casa', `menu da casa: ${menu.join(' · ')}`);
    ok(!!(await p.$('#form')), 'Ficha ainda não enviada: a casa entra pela Ficha (porta de entrada)');
    await p.click('[data-aba="operacoes"]'); await p.waitForTimeout(400);
    ok(/Guia do franqueado/.test(await app()) && /Manual do Tranquilo Apresenta/.test(await app()) && /Manual do Tranquilo Descubra/.test(await app()), 'Operações abre no Guia do franqueado, com os manuais do Apresenta e do Descubra');
    await p.click('[data-aba="cronogramas"]'); await p.waitForTimeout(300);
    const cr = await app();
    ok(/Datas fechadas/.test(cr) && (/Nenhuma data fechada/.test(cr) || /Mensagem de alinhamento do cronograma/.test(cr)), 'Cronogramas: datas fechadas com mensagem pronta (texto a validar)');
    const mk = await p.evaluate(() => [...document.querySelectorAll('[data-aba="marketing"]')].length);
    await p.click('[data-aba="marketing"]'); await p.waitForTimeout(300);
    const subsMk = await p.$$eval('[data-sub^="marketing|"]', (xs) => xs.map((x) => x.textContent.trim()));
    ok(mk && subsMk.join('|') === 'Produtor local|Anfitrião|Social media|Campanhas', `Marketing por função: ${subsMk.join(' · ')}`);
    ok(/Obrigações de marketing\s*a validar/i.test(await app()), 'obrigações de marketing marcadas "a validar"');
    await p.click('[data-aba="bonificacoes"]'); await p.waitForTimeout(300);
    ok(/Bonificação da casa/.test(await app()) && /Estrella Galicia/.test(await app()) && /a validar/i.test(await app()), 'Bonificações: marca, período e combinados, com a regra dos parceiros do Guia');
    await sub('marketing', 'campanha'); await p.reload(); await pular(); await p.waitForTimeout(500);
    ok(/#\/campanha$/.test(p.url()) && !!(await p.$('[data-sub="marketing|campanha"][aria-current="page"]')), 'recarregar mantém a parte aberta da área (#/campanha)');
    await p.click('[data-aba="conta"]'); await p.click('#sairConta'); await p.waitForTimeout(400);
    // 2. Artista: endereço clicável e horários a validar.
    // Artista com data futura numa casa que tem endereço no Notion.
    const fs = require('fs'), hoje = new Date().toISOString().slice(0, 10), ficha = JSON.parse(fs.readFileSync('data/casas-ficha.json', 'utf8')).casas;
    const evs = fs.readFileSync('data/eventos.psv', 'utf8').split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.split('|'));
    const lu = fs.readFileSync('data/lineup.psv', 'utf8').split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.split('|'));
    const alvo = evs.filter((e) => e[3] >= hoje && ficha[e[10]]?.endereco).flatMap((e) => lu.filter((x) => x[0] === e[0]).map((x) => x[1]));
    const art = linhas.find(([t, , n]) => t === 'artista' && alvo.includes(n)) || linhas.find(([t]) => t === 'artista');
    await conta('artista', 'Artista Áreas', 'art@areas.com', art[1], art[2]);
    await p.click('[data-aba="passos"]').catch(() => {}); await p.waitForTimeout(400);
    const temData = await p.$('.passos');
    ok(!temData || (/Passagem de som/.test(await app()) && /Ordem da noite/.test(await app())), 'artista: cada data mostra local, ordem da noite e horários (a validar)');
    const mapas = await p.$$eval('a[href^="https://www.google.com/maps/search/"]', (xs) => xs.length);
    ok(!!temData && mapas > 0, `artista com data futura (${art[2]}): endereço clicável abre no mapa (${mapas} links)`);
    await p.click('[data-aba="conta"]'); await p.click('#sairConta'); await p.waitForTimeout(400);
    // 3. Equipe: artista e casa lado a lado.
    await p.click('#entrar'); await p.click('[data-demo="equipe"]'); await pular(); await p.waitForTimeout(400);
    const codEq = linhas.find(([t]) => t === 'equipe')[1];
    await p.evaluate(async (cod) => { S.pac = await abrirPacote(cod); render(); }, codEq); await p.waitForTimeout(400);
    await p.click('[data-aba="lado_a_lado"]'); await p.waitForTimeout(800);
    const ll = await app();
    ok(/20h10 às 20h40: Eddu Porto/.test(ll) && /15h30 às 16h30: passagem de som de Lamparina/.test(ll), 'mensagem do Apresenta: abertura Eddu Porto, Lamparina passa o som primeiro (quem toca por último)');
    ok(/16h10 às 16h40: passagem de som de LuizGa/.test(ll) && /21h30 às 21h50: olho no olho/.test(ll), 'mensagem do Descubra com 3 artistas: ordem do line-up e olho no olho');
    ok(/Ordem de apresentação não definida no line-up: pedir à Isa/.test(ll), 'sem ordem no line-up, a mensagem não sai e pede à Isa');
    ok(/artista e casa lado a lado/i.test(ll) && /Ordem da noite/.test(ll) && /Disponibilidade/.test(ll) && (await p.$$eval('a[href^="https://www.google.com/maps/search/"]', (xs) => xs.length)) > 0, 'equipe: cada data com artista e casa lado a lado, com endereço clicável');
    // 4. Painel estratégico (adm): réguas a validar e qualidade dos dados.
    const codAdm = linhas.find(([t]) => t === 'adm')[1];
    await p.evaluate(async (cod) => { S.pac = await abrirPacote(cod); S.aba = 'estrategia'; render(); }, codAdm); await p.waitForTimeout(600);
    const est = await app();
    ok(/Réguas do painel\s*a validar/i.test(est) && /Público pagante/.test(est) && /Qualidade dos dados/.test(est) && /noites completas/.test(est), 'painel estratégico: réguas "a validar" e qualidade dos dados');
  } catch (e) { ok(false, 'quebrou: ' + e.message.split('\n')[0]); }
  ok(!erros.length, 'sem erro JS ' + erros.join(' | '));
  console.log(res.join('\n')); await b.close();
})();
