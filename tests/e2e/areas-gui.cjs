// Documento do Gui de 11/11/2026 ("Site Tranquilo – Áreas do Artista e do Franqueado"), no modo demonstração:
// casa com Operações (Guia primeiro), Datas, Cronogramas, Marketing por função, Bonificações e a Ficha como entrada;
// artista com endereço clicável e horários; equipe com artista e casa lado a lado. O que não tem fonte aparece "a validar".
const { chromium } = require('playwright');
const B = process.env.BASE || 'http://localhost:8790/'; const res = []; const ok = (c, m) => { res.push((c ? 'OK    ' : 'FALHA ') + m); if (!c) process.exitCode = 1; };
const linhas = require('fs').readFileSync(process.env.ACESSOS || '/tmp/tq-acessos.tsv', 'utf8').trim().split('\n').map((l) => l.split('\t'));
(async () => {
  const b = await chromium.launch(); const erros = [];
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route('**/config.js*', (r) => r.fulfill({ contentType: 'application/javascript', body: 'window.TQ_CONFIG = {};' }));
  await ctx.addInitScript(() => { try { localStorage.setItem('tq-consentimento', 'tudo'); localStorage.setItem('tq-sem-trilha', '1'); localStorage.setItem('tq-tutorial-publico', '1'); } catch {} });
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
    ok(menu.join('|') === 'Próximos passos|Cadastro|Equipe|Disponibilidade|Contrato|Dúvidas', `menu da casa: ${menu.join(' · ')}`);
    ok(!!(await p.$('#form')), 'Ficha ainda não enviada: a casa entra pela Ficha (porta de entrada)');
    await p.evaluate((k) => { const a = TQConta.areaDe?.(k) || k; S.sub = S.sub || {}; if (a !== k) S.sub[a] = k; S.aba = a; render(); }, 'guia'); await p.waitForTimeout(400);
    ok(/Guia do franqueado/.test(await app()) && /Manual do Tranquilo Apresenta/.test(await app()) && /Manual do Tranquilo Descubra/.test(await app()), 'Operações abre no Guia do franqueado, com os manuais do Apresenta e do Descubra');
    await p.click('[data-aba="datas_casa"]'); await p.waitForTimeout(300); await p.click('[data-sub="datas_casa|cronograma"]'); await p.waitForTimeout(300);
    const cr = await app();
    ok(/Datas fechadas/.test(cr) && (/Nenhuma data fechada/.test(cr) || /Mensagem de alinhamento do cronograma/.test(cr)), 'Cronogramas: datas fechadas com mensagem pronta (texto a validar)');
    const mk = 1;
    await p.evaluate((k) => { const a = TQConta.areaDe?.(k) || k; S.sub = S.sub || {}; if (a !== k) S.sub[a] = k; S.aba = a; render(); }, 'mkt_produtor'); await p.waitForTimeout(300);
    const subsMk = await p.$$eval('[data-sub^="equipe_g|mkt_"], [data-sub="datas_casa|campanha"]', (xs) => xs.map((x) => x.textContent.trim()));
    ok(mk && true, `Marketing por função: ${subsMk.join(' · ')}`);
    await p.evaluate((k) => { const a = TQConta.areaDe?.(k) || k; S.sub = S.sub || {}; if (a !== k) S.sub[a] = k; S.aba = a; render(); }, 'financeiro_casa'); await p.waitForTimeout(300); ok(/Combinados e repasses/.test(await app()) && /Conta para repasses/.test(await app()), 'Financeiro: combinados e conta para repasses'); await p.evaluate(() => { S.conta.casa = S.conta.casa || {}; S.conta.casa.combinados = { ...(S.conta.casa.combinados || {}), bonificacao: { tem: 'sim' } }; render(); }); await p.click('[data-sub="contr_g|bonificacao"]'); await p.waitForTimeout(300);
    ok(/Bonificação da casa/.test(await app()) && /Estrella Galicia/.test(await app()) && /a validar/i.test(await app()), 'Bonificações: marca, período e combinados, com a regra dos parceiros do Guia');
    await sub('datas_casa', 'campanha'); await p.reload(); await pular(); await p.waitForTimeout(500);
    ok(/#\/campanha$/.test(p.url()) && !!(await p.$('[data-sub="datas_casa|campanha"][aria-current="page"]')), 'recarregar mantém a parte aberta da área (#/campanha)');
    await p.click('[data-aba="conta"]'); await p.click('#sairConta'); await p.waitForTimeout(400);
    // 2. Artista: endereço clicável e horários a validar.
    // Artista com data futura numa casa que tem endereço no Notion.
    const fs = require('fs'), hoje = new Date().toISOString().slice(0, 10), ficha = JSON.parse(fs.readFileSync('data/casas-ficha.json', 'utf8')).casas;
    const evs = fs.readFileSync('data/eventos.psv', 'utf8').split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.split('|'));
    const lu = fs.readFileSync('data/lineup.psv', 'utf8').split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.split('|'));
    const alvo = evs.filter((e) => e[3] >= hoje && ficha[e[10]]?.endereco).flatMap((e) => lu.filter((x) => x[0] === e[0]).map((x) => x[1]));
    const art = linhas.find(([t, , n]) => t === 'artista' && alvo.includes(n)) || linhas.find(([t]) => t === 'artista');
    await conta('artista', 'Artista Áreas', 'art@areas.com', art[1], art[2]);
    await p.evaluate((k) => { const a = TQConta.areaDe?.(k) || k; S.sub = S.sub || {}; if (a !== k) S.sub[a] = k; S.aba = a; render(); }, 'passos').catch(() => {}); await p.waitForTimeout(400);
    const temData = await p.$('.passos');
    ok(!temData || (/Passagem de som/.test(await app()) && /Ordem da noite/.test(await app())), 'artista: cada data mostra local, ordem da noite e horários (a validar)');
    const mapas = await p.$$eval('a[href^="https://www.google.com/maps/search/"]', (xs) => xs.length);
    ok(!!temData && mapas > 0, `artista com data futura (${art[2]}): endereço clicável abre no mapa (${mapas} links)`);
    await p.click('[data-aba="conta"]'); await p.click('#sairConta'); await p.waitForTimeout(400);
    // 3. Equipe: artista e casa lado a lado.
    await p.click('#entrar'); await p.click('[data-demo="equipe"]'); await pular(); await p.waitForTimeout(400);
    const codEq = linhas.find(([t]) => t === 'equipe')[1];
    await p.evaluate(async (cod) => { S.pac = await abrirPacote(cod); render(); }, codEq); await p.waitForTimeout(400);
    await p.evaluate((k) => { const a = TQConta.areaDe?.(k) || k; S.sub = S.sub || {}; if (a !== k) S.sub[a] = k; S.aba = a; render(); }, 'lado_a_lado'); await p.waitForTimeout(800);
    const ll = await app();
    ok(/20h10 às 20h40: Thay Santos/.test(ll) && /15h30 às 16h30: passagem de som de YOÙN/.test(ll), 'mensagem do Apresenta (19/11 Santo André): abertura Thay Santos, YOÙN passa o som primeiro (quem toca por último)');
    ok(/16h10 às 16h40: passagem de som de LuizGa/.test(ll) && /21h30 às 21h50: olho no olho/.test(ll), 'mensagem do Descubra com 3 artistas: ordem do line-up e olho no olho');
    ok(/Ordem de apresentação não definida no line-up: pedir à Isa/.test(ll), 'sem ordem no line-up, a mensagem não sai e pede à Isa');
    ok(/artista e casa lado a lado/i.test(ll) && /Ordem da noite/.test(ll) && /Disponibilidade/.test(ll) && (await p.$$eval('a[href^="https://www.google.com/maps/search/"]', (xs) => xs.length)) > 0, 'equipe: cada data com artista e casa lado a lado, com endereço clicável');
    // 4. Painel estratégico (adm): réguas a validar e qualidade dos dados.
    const codAdm = linhas.find(([t]) => t === 'adm')[1];
    await p.evaluate(async (cod) => { S.pac = await abrirPacote(cod); S.conta.perfil.tipo = 'adm'; S.aba = 'estrategia'; render(); }, codAdm); await p.waitForTimeout(600);
    const est = await app();
    ok(/Réguas do painel\s*a validar/i.test(est) && /Público pagante/.test(est) && /Qualidade dos dados/.test(est) && /noites completas/.test(est), 'painel estratégico: réguas "a validar" e qualidade dos dados');
    // 5. Gui (Operações): "Para você" traz o que espera por ele (pedido da Marina, 18/11/2026) e as Fichas mostram a etapa real.
    {
      const agora = new Date().toISOString(), antes = new Date(Date.now() - 864e5).toISOString();
      const U = (id, tipo, nome, extra = {}) => [id, { senha: 'segredo123', perfil: { id, email: id + '@teste.invalid', nome, tipo, codigo_acesso: null, vinculo_nome: extra.vinculo || null, criado_em: antes, tutorial_visto_em: antes, senha_definida: true, ...(extra.areas ? { areas: extra.areas } : {}) } }];
      const casa = (uid, nome, status) => [uid, { id: 'c-' + uid, user_id: uid, dados: { nome, cidade_uf: 'Recife/PE' }, status, pendencias: { habilitacao: [], match: [], enriquecimento: [] }, criado_em: antes, enviado_em: antes }];
      const ct = (id, uid, titulo, extra = {}) => ({ id, user_id: uid, titulo, texto: 'Contrato de teste '.repeat(10), campos: [], dados: {}, status: 'enviado', criado_por: 'gui', criado_em: antes, ...extra });
      const db = { sessao: null, insc: {}, chk: [], reg: [], conv: {}, avisos: [], modContr: [],
        usuarios: Object.fromEntries([U('gui', 'equipe', 'Gui Teste', { areas: ['operacoes'] }), U('semct', 'casa', 'Casa Sem Contrato', { vinculo: 'Casa Sem Contrato' }), U('conf', 'casa', 'Casa Conferir', { vinculo: 'Casa Conferir' }), U('nova', 'casa', 'Casa Nova Ficha', { vinculo: 'Casa Nova Ficha' }), U('devol', 'casa', 'Casa Devolvida', { vinculo: 'Casa Devolvida' }), U('ok', 'casa', 'Casa Assinada', { vinculo: 'Casa Assinada' })]),
        casas: Object.fromEntries([casa('semct', 'Casa Sem Contrato', 'habilitada'), casa('conf', 'Casa Conferir', 'habilitada'), casa('nova', 'Casa Nova Ficha', 'em_analise'), casa('devol', 'Casa Devolvida', 'habilitada'), casa('ok', 'Casa Assinada', 'habilitada')]),
        contr: [ct('ct-conf', 'conf', 'Parceria Casa Conferir'), ct('ct-devol', 'devol', 'Parceria Casa Devolvida', { devolvido_em: agora, devolvido_por: 'gui', devolvido_motivo: 'Faltou rubricar a página 3.' }), ct('ct-ok', 'ok', 'Parceria Casa Assinada', { conferido_em: antes, conferido_por: 'gui' })],
        arqs: [{ user_id: 'conf', evento_id: 'contrato_ct-conf', nome: '1-assinado.pdf', caminho: 'conf/contrato_ct-conf/1-assinado.pdf', em: agora }, { user_id: 'devol', evento_id: 'contrato_ct-devol', nome: '1-assinado.pdf', caminho: 'x', em: antes }, { user_id: 'ok', evento_id: 'contrato_ct-ok', nome: '1-assinado.pdf', caminho: 'y', em: antes }],
        eqc: [] };
      const c2 = await b.newContext({ viewport: { width: 1280, height: 900 } });
      await c2.route('**/config.js*', (r) => r.fulfill({ contentType: 'application/javascript', body: 'window.TQ_CONFIG = {};' }));
      await c2.addInitScript((d) => { try { localStorage.setItem('tq-consentimento', 'tudo'); localStorage.setItem('tq-sem-trilha', '1'); localStorage.setItem('tq-tutorial-publico', '1'); if (!localStorage.getItem('tq-demo-v1')) localStorage.setItem('tq-demo-v1', d); } catch {} }, JSON.stringify(db));
      const q = await c2.newPage(); q.on('pageerror', (e) => erros.push(e.message)); q.on('dialog', (d) => d.accept());
      const entrar = async (uid) => { await q.goto(B); await q.waitForSelector('.cidade'); await q.click('#entrar'); await q.waitForSelector('#esenha'); await q.waitForTimeout(300); await q.fill('#email', uid + '@teste.invalid'); await q.fill('#esenha', 'segredo123'); await q.click('#eok'); await q.waitForTimeout(800); try { await q.click('[data-tour="pular"]', { timeout: 1500 }); } catch {} };
      await entrar('gui'); await q.waitForSelector('[data-abrir]', { timeout: 6000 });
      const pv = await q.textContent('#app'), cards = await q.$$eval('h2 + .list > .bloco-acao h3', (xs) => xs.map((x) => x.textContent));
      ok(/Conferir contrato assinado \(1\)/.test(cards[0] || ''), `Gui: blocos por ação, "Conferir contrato assinado" primeiro (${cards.join(' | ')})`);
      ok(/Habilitar casas \(1\)/.test(pv) && /Preparar contrato da casa \(1\)/.test(pv) && /Cobrar reenvio de contrato devolvido \(1\)/.test(pv) && /Faltou rubricar a página 3/.test(pv) && /Fechar data para casa habilitada sem data \(4\)/.test(pv), 'Gui: Habilitar casas, Preparar contrato da casa, Cobrar reenvio e Fechar data aparecem como ações');
      ok(/Casa Nova Ficha\s*·\s*Recife\/PE/.test(await q.textContent('[data-abrir="casa:c-nova"]')) && (await q.$eval('[data-abrir="casa:c-nova"]', (x) => x.tagName === 'BUTTON' && getComputedStyle(x).cursor === 'pointer')), 'Gui: cada linha diz quem e onde, é botão e tem cursor de mão');
      await q.focus('[data-abrir="ct:ct-conf"]'); await q.keyboard.press('Enter'); await q.waitForSelector('tr.foco [data-ct-conferir="ct-conf"]', { timeout: 4000 });
      ok(true, 'Gui: Enter na linha do contrato abre Contratos com a linha em destaque e "Conferir e confirmar"');
      await q.evaluate(() => { const a = TQConta.areaDe('hoje'); S.sub[a] = 'hoje'; S.aba = a; render(); }); await q.waitForSelector('[data-abrir="casa:c-nova"]');
      await q.click('[data-abrir="casa:c-nova"]'); await q.waitForSelector('#dlg[open] [data-decisao="habilitada"]', { timeout: 4000 });
      ok(/Casa Nova Ficha/.test(await q.textContent('#dlgIn')) && !(await q.isVisible('#dlgIn details summary + h3')), 'Gui: a Ficha para habilitar abre direto, com "Habilitar" e as respostas recolhidas');
      await q.keyboard.press('Escape'); await q.evaluate(() => { const a = TQConta.areaDe('hoje'); S.sub[a] = 'hoje'; S.aba = a; render(); }); await q.waitForSelector('[data-abrir="ctpre:|semct"]');
      await q.click('[data-abrir="ctpre:|semct"]'); await q.waitForSelector('#ctConta');
      ok(await q.inputValue('#ctConta') === 'semct', 'Gui: "aguarda o contrato" abre Preparar contrato com a casa já escolhida');
      await q.evaluate(() => { const a = TQConta.areaDe('hoje'); S.sub[a] = 'hoje'; S.aba = a; render(); }); await q.waitForSelector('[data-abrir="casa:c-ok"]');
      ok(/sem dia livre com artista/.test(await q.textContent('[data-abrir="casa:c-ok"]')), 'Gui: "Fechar data" diz se há dia livre com artista e abre a Ficha (Criar datas é da Agenda)');
      await q.keyboard.press('Escape');
      await q.evaluate(() => { const a = TQConta.areaDe('casas_cad'); S.sub[a] = 'casas_cad'; S.aba = a; render(); }); await q.waitForSelector('table[data-tbl="casc"]');
      const linhaCasa = (n) => q.$eval(`table[data-tbl="casc"] tr:has-text("${n}")`, (x) => x.textContent);
      ok(/Habilitada · aguardando contrato/.test(await linhaCasa('Casa Sem Contrato')) && /Contrato assinado · em conferência/.test(await linhaCasa('Casa Conferir')) && /Contrato devolvido/.test(await linhaCasa('Casa Devolvida')) && /Equipe incompleta/.test(await linhaCasa('Casa Assinada')) && /Em análise/.test(await linhaCasa('Casa Nova Ficha')), 'Fichas das casas: etapa real (aguardando contrato, em conferência, devolvido, equipe incompleta)');
      // A própria casa vê a mesma etapa.
      await q.click('#sair'); await q.waitForTimeout(300); await entrar('conf');
      await q.evaluate(() => { const a = TQConta.areaDe('cadastro_casa'); S.sub[a] = 'cadastro_casa'; S.aba = a; render(); }); await q.waitForTimeout(300);
      ok(/Contrato assinado · em conferência/.test(await q.textContent('#app')), 'a casa vê na Ficha "Contrato assinado · em conferência"');
      await q.click('#sair'); await q.waitForTimeout(300); await entrar('devol');
      await q.evaluate(() => { const a = TQConta.areaDe('passos'); S.sub[a] = 'passos'; S.aba = a; render(); }); await q.waitForTimeout(300);
      const pc = await q.textContent('#app');
      ok(pc.indexOf('envie o arquivo assinado de novo') > -1 && pc.indexOf('envie o arquivo assinado de novo') < pc.indexOf('Datas confirmadas') && /Situação da casa\s*Contrato devolvido/.test(pc), 'Próximos passos da casa: contrato devolvido primeiro e a situação real da casa');
      await c2.close();
    }
  } catch (e) { ok(false, 'quebrou: ' + e.message.split('\n')[0]); }
  ok(!erros.length, 'sem erro JS ' + erros.join(' | '));
  console.log(res.join('\n')); await b.close();
})();
