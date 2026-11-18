// Propostas de atualização (18/11/2026), no modo demonstração:
// Isa (Agenda) propõe para a artista → a artista aceita tudo em Próximos passos e a ficha muda na hora;
// Isa propõe pelo histórico para quem não tem conta → convite com a proposta e mensagem de WhatsApp pronta;
// Gui (Operações) propõe para a casa → a casa ajusta e aceita; casa habilitada continua habilitada.
const { chromium } = require('playwright');
const B = process.env.BASE || 'http://localhost:8790/'; const res = []; const ok = (c, m) => { res.push((c ? 'OK    ' : 'FALHA ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch(); const erros = [];
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route('**/config.js*', (r) => r.fulfill({ contentType: 'application/javascript', body: 'window.TQ_CONFIG = {};' }));
  await ctx.addInitScript(() => { try { localStorage.setItem('tq-consentimento', 'tudo'); localStorage.setItem('tq-tutorial-publico', '1'); localStorage.setItem('tq-sem-trilha', '1'); } catch {} });
  const p = await ctx.newPage(); p.on('pageerror', (e) => erros.push(e.message)); p.on('dialog', (d) => d.accept());
  const pular = async () => { try { await p.waitForSelector('.tour-caixa', { timeout: 2500 }); await p.click((await p.$('[data-tour="pular"]')) ? '[data-tour="pular"]' : '[data-tour="avancar"]'); } catch {} };
  const db = () => p.evaluate(() => JSON.parse(localStorage.getItem('tq-demo-v1')));
  // Cria (se preciso) e entra numa conta do modo demonstração, já com a ficha montada.
  const como = async (perfil, monta) => {
    await p.evaluate(([pf, m]) => { const d = JSON.parse(localStorage.getItem('tq-demo-v1')) || { usuarios: {}, insc: {}, casas: {}, chk: [], reg: [], sessao: null };
      d.usuarios[pf.id] = { senha: 'demo123', perfil: { codigo_acesso: null, vinculo_nome: null, criado_em: new Date().toISOString(), senha_portal: true, senha_definida: true, tutorial_visto_em: new Date().toISOString(), ...(d.usuarios[pf.id]?.perfil || {}), ...pf } };
      if (m?.insc) { d.insc[pf.id] = { id: 'i-' + pf.id, user_id: pf.id, criado_em: new Date().toISOString(), ...m.insc }; }
      if (m?.casa) { d.casas[pf.id] = { id: 'c-' + pf.id, user_id: pf.id, criado_em: new Date().toISOString(), ...m.casa }; }
      d.sessao = pf.id; localStorage.setItem('tq-demo-v1', JSON.stringify(d)); }, [perfil, monta]);
    await p.reload(); await p.waitForTimeout(700); await pular();
  };
  const ir = (k) => p.evaluate((k) => { const a = TQConta.areaDe?.(k) || k; S.sub = S.sub || {}; if (a !== k) S.sub[a] = k; S.aba = a; render(); }, k);
  const app = () => p.textContent('#app');
  try {
    await p.goto(B); await p.waitForSelector('.cidade'); await p.keyboard.press('Escape');
    // Contas: artista com inscrição já enviada (travada) e casa habilitada.
    await como({ id: 'u-ana', email: 'ana@prop.test', nome: 'Ana Prop', tipo: 'artista' }, { insc: { dados: { nome_artistico: 'Ana Prop', cidade_base: 'São Paulo', estado: 'SP' }, status: 'em_curadoria' } });
    await como({ id: 'u-casa', email: 'casa@prop.test', nome: 'Dona Prop', tipo: 'casa', vinculo_nome: 'Casa Prop', codigo_acesso: 'X' }, { casa: { dados: { nome: 'Casa Prop', cidade_uf: 'Campinas/SP' }, status: 'habilitada' } });

    // ---------- Isa → artista ----------
    await como({ id: 'u-isa', email: 'isa@prop.test', nome: 'Isa', tipo: 'equipe', areas: ['agenda'] });
    await ir('curadoria'); await p.waitForSelector('#ppBloco-artista', { timeout: 8000 });
    ok(!(await p.$('#ppBloco-artista .pp-linha')), 'bloco de propostas começa compacto (fechado)');
    ok(/aguardando resposta/.test(await p.textContent('#ppBloco-artista')) && /com informação faltando/.test(await p.textContent('#ppBloco-artista')), 'bloco mostra os números (aguardando, aceitas hoje, faltando)');
    await p.click('#ppBloco-artista [data-pp-bloco]');
    ok(/Ana Prop/.test(await p.textContent('#ppBloco-artista')) && /Falta: .*disponibilidade/i.test(await p.textContent('#ppBloco-artista')), 'Ana aparece em "Faltando informação importante", com o que falta');
    await p.click('#ppBloco-artista [data-pp-novo="artista|user:u-ana"]'); await p.waitForSelector('#ppForm');
    ok(/Hoje na ficha/.test(await p.textContent('#ppForm')), 'formulário mostra o que está hoje na ficha');
    await p.selectOption('[data-pp-campo="formato_interesse"]', 'descubra');
    await p.fill('[data-pp-campo="cidades_interesse"]', 'São Paulo, Campinas');
    ok(await p.isChecked('[data-pp-inc="cidades_interesse"]'), 'escrever no campo já marca "vai na proposta"');
    await p.check('[data-pp-inc="formato_interesse"]');
    await p.fill('[data-pp-dcid="0"]', 'Campinas'); await p.check('[data-pp-dia="0|5"]');
    await p.fill('#ppMotivo', 'Pelo histórico: tocou em Campinas às sextas.');
    await p.click('#ppEnviar'); await p.waitForTimeout(500);
    const env = await p.textContent('#dlgIn');
    ok(/Proposta enviada/.test(env) && /Próximos passos/.test(await p.inputValue('#envTxt')), 'proposta enviada, com mensagem de WhatsApp pronta');
    await p.keyboard.press('Escape');
    ok(/proposta enviada/.test(await p.textContent('#ppBloco-artista')), 'Ana fica marcada como "proposta enviada"');
    ok(/Propostas enviadas \(1\)/.test(await p.textContent('#ppBloco-artista')) && /aguardando resposta/.test(await p.textContent('#ppBloco-artista .pp-lista:last-of-type')), 'lista "Propostas enviadas" com o status');
    ok(!(await p.evaluate(() => TQPropostas.podePropor(S.conta.perfil, 'casa'))), 'Isa não propõe para casas');
    // Pelo histórico, sem conta: convite com a proposta junto.
    await p.waitForSelector('#ppBloco-artista [data-pp-novo^="artista|base:"]', { timeout: 8000 });
    await p.click('#ppBloco-artista [data-pp-novo^="artista|base:"]'); await p.waitForSelector('#ppForm');
    ok(/ainda não tem conta no portal/.test(await p.textContent('#ppForm')), 'sem conta: o formulário avisa e pede o e-mail do convite');
    await p.click('#ppEnviar'); await p.waitForTimeout(200);
    ok(/e-mail/.test(await p.textContent('#ppErr')), 'sem e-mail o convite não sai');
    await p.fill('#ppEmail', 'historico@prop.test'); await p.click('#ppEnviar'); await p.waitForTimeout(600);
    ok(/Convite com a proposta/.test(await p.textContent('#dlgIn')) && /Próximos passos/.test(await p.inputValue('#envTxt')) && /#criar&email=historico%40prop.test/.test(await p.inputValue('#envTxt')), 'convite criado com a proposta e a mensagem de WhatsApp pronta');
    ok((await db()).conv['historico@prop.test']?.tipo === 'artista', 'convite gravado');
    await p.keyboard.press('Escape');
    await ir('hoje'); await p.waitForTimeout(400);
    ok(/Propostas aguardando resposta/.test(await app()), '"Para você" mostra as propostas aguardando resposta');

    // ---------- Artista aceita tudo ----------
    await como({ id: 'u-ana', email: 'ana@prop.test', tipo: 'artista' });
    await ir('passos'); await p.waitForSelector('#ppCartao', { timeout: 8000 });
    const cartao = await p.textContent('#ppCartao');
    ok(/O Tranquilo sugeriu atualizar sua ficha/.test(cartao) && /Aceitar tudo/.test(cartao) && /Ajustar/.test(cartao) && /Recusar/.test(cartao), 'cartão no topo de Próximos passos com Aceitar tudo, Ajustar e Recusar');
    ok(!(await p.isVisible('#ppCartao .pp-ad')), 'antes → depois começa recolhido');
    await p.click('#ppCartao summary');
    ok(/vazio/.test(await p.textContent('#ppCartao .pp-ad')) && /Campinas/.test(await p.textContent('#ppCartao .pp-ad')), 'mostra o antes → depois');
    await p.click('[data-pp-aceitar]'); await p.waitForSelector('#ppMsg', { timeout: 5000 });
    ok(/Sua ficha foi atualizada/.test(await p.textContent('#ppMsg')), 'mensagem clara depois de aceitar');
    const d1 = await db();
    ok(d1.insc['u-ana'].dados.formato_interesse === 'descubra' && d1.insc['u-ana'].dados.cidades_interesse.join() === 'São Paulo,Campinas' && d1.insc['u-ana'].status === 'em_curadoria', 'ficha atualizada na hora (inscrição continua em curadoria)');
    ok((d1.sem || []).some((s) => s.user_id === 'u-ana' && s.cidade === 'Campinas' && s.dias.includes(5)), 'disponibilidade semanal em Campinas às sextas');
    ok(!(await p.$('#ppCartao')), 'cartão some depois de responder');

    // ---------- Gui → casa ----------
    await como({ id: 'u-isa', email: 'isa@prop.test', tipo: 'equipe', areas: ['operacoes'] });
    await ir('casas_cad'); await p.waitForSelector('#ppBloco-casa', { timeout: 8000 });
    ok(!(await p.evaluate(() => TQPropostas.podePropor(S.conta.perfil, 'artista'))), 'Gui não propõe para artistas');
    await p.click('#ppBloco-casa [data-pp-bloco]');
    await p.click('#ppBloco-casa [data-pp-novo="casa|user:u-casa"]'); await p.waitForSelector('#ppForm');
    await p.fill('[data-pp-campo="capacidade_sentado"]', '90'); await p.fill('[data-pp-campo="razao_social"]', 'Casa Prop Ltda');
    await p.check('[data-pp-dia="0|5"]'); await p.check('[data-pp-dia="0|6"]');
    await p.click('#ppEnviar'); await p.waitForTimeout(500);
    ok(/Proposta enviada/.test(await p.textContent('#dlgIn')), 'Gui envia a proposta para a casa');
    await p.keyboard.press('Escape');

    // ---------- Casa ajusta e aceita ----------
    await como({ id: 'u-casa', email: 'casa@prop.test', tipo: 'casa' });
    await ir('passos'); await p.waitForSelector('#ppCartao', { timeout: 8000 });
    await p.click('[data-pp-ajustar]'); await p.waitForSelector('#ppAjuste');
    await p.fill('[data-aj-campo="capacidade_sentado"]', '100');
    await p.click('[data-pp-ajok]'); await p.waitForSelector('#ppMsg', { timeout: 5000 });
    const d2 = await db(), c = d2.casas['u-casa'];
    ok(c.dados.capacidade_sentado === 100 && c.dados.razao_social === 'Casa Prop Ltda' && c.status === 'habilitada', 'casa ajusta e a ficha muda na hora (continua habilitada)');
    ok((d2.sem || []).some((s) => s.casa_ref === 'Casa Prop' && s.dias.join() === '5,6'), 'dias da semana da casa gravados');
    ok((d2.prop || []).find((x) => x.alvo_user === 'u-casa').status === 'ajustada', 'proposta fica "aceita com ajustes"');

    // ---------- Para você: aceitas hoje ----------
    await como({ id: 'u-isa', email: 'isa@prop.test', tipo: 'equipe', areas: ['operacoes'] });
    await ir('hoje'); await p.waitForTimeout(400);
    ok(/Propostas aceitas hoje/.test(await app()), '"Para você" mostra as propostas aceitas hoje');
  } catch (e) { ok(false, 'quebrou: ' + e.message.split('\n')[0]); }
  ok(!erros.length, 'sem erro JS ' + erros.join(' | '));
  console.log(res.join('\n')); await b.close();
})();
