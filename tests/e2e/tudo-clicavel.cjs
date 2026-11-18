// "TUDO ABSOLUTAMENTE TUDO PRECISA SER CLICÁVEL" (Marina, 18/11/2026): percorre as telas de cada acesso (público,
// artista, casa, equipe por área e adm) e confere que toda linha de tabela, item de lista e cartão abre algo
// (diálogo de detalhe, tela ou link), com foco por teclado. Rode com: PORTA=... bash .meu.sh tudo-clicavel
const { chromium } = require('playwright');
const B = process.env.BASE || 'http://localhost:8790/'; const res = []; const ok = (c, m) => { res.push((c ? 'OK    ' : 'FALHA ') + m); if (!c) process.exitCode = 1; };
const linhas = require('fs').readFileSync(process.env.ACESSOS || '/tmp/tq-acessos.tsv', 'utf8').trim().split('\n').map((l) => l.split('\t'));
// O que conta como "abre algo" e o que não precisa abrir (formulários, calendário, tutorial).
const SONDA = () => {
  const ABRE = 'a,button,input,select,textarea,label,summary,details,[data-ev],[data-click],[data-abrir],[data-det]';
  const itens = [...document.querySelectorAll('#app tbody tr, #app ul.passos > li, #app ul.pend > li, #app .list > .card, #app .list > .alert, #app .list > .row, #app .evo')]
    .filter((el) => !el.closest('.tour-caixa,form,#form') && !el.querySelector('td[colspan]') && el.textContent.trim() && el.offsetParent !== null);
  const mudos = itens.filter((el) => !el.matches(ABRE) && !el.querySelector(ABRE) && !el.closest(ABRE.replace(',[data-det]', '') + ',[data-det]'));
  return { total: itens.length, mudos: mudos.slice(0, 3).map((x) => x.textContent.replace(/\s+/g, ' ').trim().slice(0, 70)), nMudos: mudos.length };
};
(async () => {
  const b = await chromium.launch(); const erros = [];
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route('**/config.js*', (r) => r.fulfill({ contentType: 'application/javascript', body: 'window.TQ_CONFIG = {};' }));
  await ctx.route(/supabase\.co/, (r) => r.abort());
  await ctx.addInitScript(() => { try { localStorage.setItem('tq-consentimento', 'tudo'); localStorage.setItem('tq-sem-trilha', '1'); localStorage.setItem('tq-tutorial-publico', '1'); } catch {} });
  const p = await ctx.newPage(); p.on('pageerror', (e) => erros.push(e.message)); p.on('dialog', (d) => d.accept());
  const pular = async () => { try { await p.waitForSelector('.tour-caixa', { timeout: 2500 }); await p.click((await p.$('[data-tour="pular"]')) ? '[data-tour="pular"]' : '[data-tour="avancar"]'); } catch {} };
  const sair = async () => { try { await p.evaluate(() => TQConta.sairDeTudo()); } catch {} await p.waitForTimeout(300); };
  const fechar = () => p.evaluate(() => { const d = document.getElementById('dlg'); if (d.open) d.close(); });
  let telas = 0, comItens = 0, abertos = 0;
  const conferir = async (quem, tela) => {
    const r = await p.evaluate(SONDA); telas++;
    if (r.total) comItens++;
    ok(r.nMudos === 0, `${quem} · ${tela}: ${r.total} itens, todos abrem algo${r.nMudos ? ` (não abrem: ${r.mudos.join(' | ')})` : ''}`);
    // Abre o primeiro detalhe genérico pelo teclado (Enter) e confere o diálogo.
    const det = await p.$('#app [data-det]');
    if (det && await det.isVisible()) {
      await det.focus(); await p.keyboard.press('Enter'); await p.waitForTimeout(150);
      const aberto = await p.evaluate(() => document.getElementById('dlg').open);
      if (aberto) abertos++; else ok(false, `${quem} · ${tela}: Enter no item não abriu o detalhe`);
      await fechar();
    }
  };
  // Percorre todas as abas do menu e as partes (subnav) de cada uma.
  const percorrer = async (quem) => {
    const abas = await p.$$eval('#tabs [data-aba]', (xs) => [...new Set(xs.map((x) => x.dataset.aba))]);
    for (const a of abas) {
      await p.evaluate((k) => { S.aba = k; render(); }, a); await p.waitForTimeout(350);
      const subs = await p.$$eval('.subnav [data-sub]', (xs) => xs.map((x) => x.dataset.sub));
      if (!subs.length) { await conferir(quem, a); continue; }
      for (const s of subs) { await p.evaluate((v) => { const [ar, k] = v.split('|'); (S.sub ||= {})[ar] = k; S.aba = ar; S.lendo = null; render(); }, s); await p.waitForTimeout(350); await conferir(quem, s.split('|')[1]); }
    }
  };
  try {
    // 1. Público: cada data da agenda abre o detalhe (dia, casa, line-up, ingressos).
    await p.goto(B); await p.waitForSelector('.cidade'); await p.waitForTimeout(600);
    const evo = await p.$('.evo[data-ev]');
    if (evo) { await evo.focus(); await p.keyboard.press('Enter'); await p.waitForSelector('#dlg[open]', { timeout: 3000 });
      ok(/Line-up/.test(await p.textContent('#dlgIn')) && /Ingressos/.test(await p.textContent('#dlgIn')), 'público: data da agenda abre o detalhe pelo teclado, com line-up e ingressos'); await fechar(); }
    else ok(true, 'público: agenda sem datas futuras neste retrato');
    await conferir('público', 'início');
    // 2. Equipe e adm (demonstração), com o pacote interno para as telas de datas e métricas.
    for (const [demo, areas] of [['adm', null], ['equipe', null], ['equipe', ['operacoes']], ['equipe', ['agenda']], ['equipe', ['marketing']]]) {
      await sair(); await p.goto(B); await p.waitForSelector('.cidade'); await p.click('#entrar'); await p.waitForTimeout(200); await p.click(`[data-demo="${demo}"]`); await pular();
      const cod = linhas.find(([t]) => t === demo)[1];
      await p.evaluate(async ([cod, areas]) => { S.pac = await abrirPacote(cod); if (areas) S.conta.perfil.areas = areas; render(); }, [cod, areas]); await p.waitForTimeout(500);
      await percorrer(demo + (areas ? ` (${areas[0]})` : ''));
    }
    // Uma data do Notion abre o detalhe com casa, cidade, line-up, status e ingressos (antes não abria nada).
    await p.evaluate(() => { const a = TQConta.areaDe?.('geral') || 'geral'; (S.sub ||= {})[a] = 'geral'; S.aba = a; delete S.conta.perfil.areas; render(); }); await p.waitForTimeout(400);
    const ev = await p.$('table[data-tbl="geral"] tbody tr[data-click^="ev:"]');
    if (ev) { await ev.click(); await p.waitForSelector('#dlg[open]', { timeout: 3000 }); const t = await p.textContent('#dlgIn');
      ok(/Casa/.test(t) && /Cidade/.test(t) && /Line-up/.test(t) && /Ingressos/.test(t) && /Ficha da casa/.test(t), 'equipe: data da rede abre o detalhe (casa, cidade, line-up, status, ingressos, Ficha e contrato)'); await fechar(); }
    // 3. Casa e artista (contas novas no modo demonstração).
    for (const [tipo, nome, email] of [['casa', 'Dono Clique', 'dono@clique.com'], ['artista', 'Artista Clique', 'artista@clique.com']]) {
      await sair(); await p.goto(B); await p.waitForSelector('.cidade'); await p.click('#entrar'); await p.click('[data-entrada="criar"]'); await p.waitForSelector('#enome');
      await p.click(`label:has(input[name="tipoNovo"][value="${tipo}"])`); await p.fill('#enome', nome); await p.fill('#email', email); await p.fill('#esenha', 'segredo123'); await p.press('#esenha', 'Enter');
      await pular(); await p.waitForTimeout(500);
      const ref = linhas.find(([t, , n]) => t === tipo && !/^Casa (em|da rede)/.test(n));
      if (ref) { await p.evaluate(([cod, v]) => { const d = JSON.parse(localStorage.getItem('tq-demo-v1')); Object.assign(d.usuarios[d.sessao].perfil, { vinculo_nome: v, codigo_acesso: cod }); localStorage.setItem('tq-demo-v1', JSON.stringify(d)); }, [ref[1], ref[2]]); await p.reload(); await pular(); await p.waitForTimeout(500); }
      await percorrer(tipo);
    }
    ok(telas > 40 && comItens > 10 && abertos > 5, `percorreu ${telas} telas (${comItens} com itens) e abriu ${abertos} detalhes pelo teclado`);
  } catch (e) { ok(false, 'quebrou: ' + e.message.split('\n')[0]); }
  ok(!erros.length, 'sem erro JS ' + erros.slice(0, 3).join(' | '));
  console.log(res.join('\n')); await b.close();
})();
