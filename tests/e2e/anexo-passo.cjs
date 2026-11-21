// Tudo vira anexo (pedido da Marina, 17/11/2026): cada passo da data tem "Anexar comprovante"; anexar guarda o arquivo
// na pasta passo_<chave>_<data> da conta, marca o passo como feito e o anexo aparece no passo. Modo demonstração.
const { chromium } = require('playwright');
const B = process.env.BASE || 'http://localhost:8790/'; const res = []; const ok = (c, m) => { res.push((c ? 'OK    ' : 'FALHA ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch(); const erros = [];
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route('**/config.js*', (r) => r.fulfill({ contentType: 'application/javascript', body: 'window.TQ_CONFIG = {};' }));
  await ctx.addInitScript(() => { try { localStorage.setItem('tq-consentimento', 'tudo'); localStorage.setItem('tq-sem-trilha', '1'); localStorage.setItem('tq-tutorial-publico', '1'); } catch {} });
  const p = await ctx.newPage(); p.on('pageerror', (e) => erros.push(e.message)); p.on('dialog', (d) => d.accept());
  const pular = async () => { try { await p.waitForSelector('.tour-caixa', { timeout: 2500 }); await p.click((await p.$('[data-tour="pular"]')) ? '[data-tour="pular"]' : '[data-tour="avancar"]'); } catch {} };
  const ir = async (k) => { await p.evaluate((k) => { const a = TQConta.areaDe?.(k); if (a && a !== k) { S.sub = S.sub || {}; S.sub[a] = k; S.aba = a; } else S.aba = k; render(); }, k); await p.waitForTimeout(700); };
  const db = () => p.evaluate(() => JSON.parse(localStorage.getItem('tq-demo-v1')));
  const dia = new Date(Date.now() + 12 * 864e5).toISOString().slice(0, 10);
  try {
    await p.goto(B); await p.waitForSelector('.cidade');
    await p.evaluate((dia) => {
      const agora = new Date().toISOString();
      const u = {
        eq: { senha: 'demo123', perfil: { id: 'eq', email: 'equipe@demo.tranquilo', nome: 'Equipe (demo)', tipo: 'equipe', criado_em: agora, senha_definida: true, tutorial_visto_em: agora } },
        casa: { senha: 'segredo123', perfil: { id: 'casa', email: 'casa@anexo.com', nome: 'Casa Anexo', tipo: 'casa', vinculo_nome: 'Casa Anexo', criado_em: agora, senha_definida: true, tutorial_visto_em: agora } },
      };
      const d = { usuarios: u, insc: {}, casas: { casa: { id: 'c1', user_id: 'casa', status: 'habilitada', dados: { nome: 'Casa Anexo', cidade_uf: 'Recife/PE' }, criado_em: agora } },
        conv: {}, chk: [], reg: [], sessao: 'casa', contr: [], modContr: [],
        datasP: [{ id: 'dp1', dia, abertura: '19:00:00', produto: 'Descubra', casa_id: 'c1', casa_nome: 'Casa Anexo', cidade: 'Recife/PE', status: 'confirmada', artistas: [{ nome: 'Ana', ordem: 1 }, { nome: 'Bia', ordem: 2 }], criado_em: agora }] };
      localStorage.setItem('tq-demo-v1', JSON.stringify(d));
    }, dia);
    await p.reload(); await p.waitForTimeout(900); await pular();
    await ir('passos');
    const inp = await p.waitForSelector('input[data-anexo-passo]', { state: 'attached', timeout: 6000 }).catch(() => null);
    ok(!!inp, 'cada passo da data tem "Anexar comprovante"');
    if (inp) {
      const [evId, chave] = (await inp.getAttribute('data-anexo-passo')).split(/\|(?=[^|]*$)/);
      await inp.setInputFiles({ name: 'print-campanha.png', mimeType: 'image/png', buffer: Buffer.from('89504e470d0a1a0a', 'hex') });
      await p.waitForTimeout(1200);
      const d = await db();
      const pasta = `passo_${chave.replace(/[^\w-]+/g, '_')}_${evId.replace(/[^\w-]+/g, '_')}`;
      ok((d.arqs || []).some((f) => f.evento_id === pasta && /print-campanha\.png/.test(f.nome)), `o anexo fica guardado na pasta do passo (${pasta})`);
      ok((d.chk || []).some((c) => c.evento_id === evId && c.item === chave && c.feito), 'anexar marca o passo como feito');
      await ir('passos');
      ok(/📎/.test(await p.textContent('#app')) && /print-campanha\.png/.test(await p.textContent('#app')), 'o anexo aparece no passo para abrir depois');
    }
  } catch (e) { ok(false, 'quebrou: ' + e.message.split('\n')[0]); }
  ok(!erros.length, 'sem erro JS ' + erros.join(' | '));
  console.log(res.join('\n')); await b.close();
})();
