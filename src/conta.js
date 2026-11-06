// Contas por e-mail: cadastro de artistas e casas, curadoria, habilitação e próximos passos.
// Com supabaseUrl e supabaseAnonKey em config.js, usa o Supabase (contas e dados reais).
// Sem eles, roda em modo demonstração: tudo fica só neste navegador.
"use strict";
const TQConta = (() => {
  const cfg = window.TQ_CONFIG || {};
  const CONFIGURADO = !!(cfg.supabaseUrl && cfg.supabaseAnonKey);
  let REAL = false;   // vira true quando o banco responde com as tabelas criadas
  let FORA = false;   // banco configurado, mas fora do ar: nunca cair no modo demonstração nesse caso
  const R = window.TQRegras;
  const hojeIso = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
  let api = null;

  const hubDemo = () => { try { return JSON.parse(localStorage.getItem("tq-demo-hub") || "{}"); } catch { return {}; } };
  // ---------- modo demonstração ----------
  function Demo() {
    const CH = "tq-demo-v1";
    const ler = () => { try { return JSON.parse(localStorage.getItem(CH)) || null; } catch { return null; } };
    let db = ler() || { usuarios: {}, insc: {}, casas: {}, chk: [], reg: [], sessao: null };
    db.conv ||= {}; db.avisos ||= []; db.modContr ||= []; db.contr ||= [];
    const gravar = () => { try { localStorage.setItem(CH, JSON.stringify(db)); } catch {} };
    const id = () => crypto.randomUUID();
    const eu = () => db.sessao && db.usuarios[db.sessao]?.perfil;
    const exigeEquipe = () => { if (!["equipe", "adm"].includes(eu()?.tipo)) throw new Error("Sem permissão."); };
    const agora = () => new Date().toISOString();
    return {
      async sessao() { return eu() || null; },
      async entrar(email, senha) {
        const u = Object.values(db.usuarios).find((x) => x.perfil.email === email.toLowerCase().trim());
        if (!u || u.senha !== senha) throw new Error("E-mail ou senha incorretos.");
        db.sessao = u.perfil.id; gravar(); return u.perfil;
      },
      async cadastrar({ email, senha, nome, tipo }) {
        email = email.toLowerCase().trim();
        if (Object.values(db.usuarios).some((x) => x.perfil.email === email)) throw new Error("Já existe uma conta com este e-mail.");
        const perfil = { id: id(), email, nome, tipo: ["artista", "casa", "equipe", "adm"].includes(tipo) ? tipo : "artista", codigo_acesso: null, vinculo_nome: null, criado_em: agora() };
        db.usuarios[perfil.id] = { senha, perfil }; db.sessao = perfil.id; gravar();
        return { perfil };
      },
      async recuperar() { return true; },
      async sair() { db.sessao = null; gravar(); },
      async minhaInscricao() { return db.insc[db.sessao] || null; },
      async salvarInscricao(dados, enviar) {
        const atual = db.insc[db.sessao];
        if (atual && !["rascunho", "ajustes"].includes(atual.status)) throw new Error("Inscrição em análise: aguarde o retorno da curadoria.");
        const pc = R.preCuradoria(dados);
        db.insc[db.sessao] = { ...(atual || { id: id(), user_id: db.sessao, criado_em: agora() }), dados, status: enviar ? "em_curadoria" : (atual?.status || "rascunho"),
          score: pc.score, faixa: pc.faixa, score_detalhe: pc.detalhe, alertas: pc.alertas, enviado_em: enviar ? agora() : atual?.enviado_em || null, atualizado_em: agora() };
        gravar(); return db.insc[db.sessao];
      },
      async minhaCasa() { return db.casas[db.sessao] || null; },
      async salvarCasa(dados, { enviar, ja_parceira, notion_casa_id }) {
        const atual = db.casas[db.sessao], pend = R.pendenciasCasa(dados);
        let status = atual?.status || "rascunho";
        if (!["habilitada", "suspensa"].includes(status) && enviar) status = pend.habilitacao.length ? "incompleto" : "em_analise";
        db.casas[db.sessao] = { ...(atual || { id: id(), user_id: db.sessao, criado_em: agora() }), dados, ja_parceira: !!ja_parceira, notion_casa_id: notion_casa_id || null,
          status, pendencias: pend, enviado_em: status === "em_analise" ? agora() : atual?.enviado_em || null, atualizado_em: agora() };
        gravar(); return db.casas[db.sessao];
      },
      async meuChecklist() { return db.chk.filter((c) => c.user_id === db.sessao); },
      async marcar(evento_id, item, feito) {
        db.chk = db.chk.filter((c) => !(c.user_id === db.sessao && c.evento_id === evento_id && c.item === item));
        if (feito) db.chk.push({ user_id: db.sessao, evento_id, item, feito: true, atualizado_em: agora() });
        gravar();
      },
      async registrar(evento_id, r) {
        // Um registro por casa e por noite: registrar de novo corrige o anterior.
        db.reg = db.reg.filter((x) => !(x.user_id === db.sessao && x.evento_id === evento_id));
        db.reg.push({ id: id(), user_id: db.sessao, evento_id, ...r, criado_em: agora() }); gravar();
      },
      async meusRegistros() { return db.reg.filter((r) => r.user_id === db.sessao); },
      async vincularCodigo(codigo, nome) {
        const p = eu(); if (p.codigo_acesso) throw new Error("Esta conta já está vinculada. Fale com a equipe para trocar.");
        p.vinculo_pedido = codigo; p.vinculo_pedido_nome = nome; p.vinculo_pedido_em = agora(); gravar(); return p;
      },
      async chaveInterna() { return null; },
      async inscricoes() { exigeEquipe(); return Object.values(db.insc).map((i) => ({ ...i, perfil: db.usuarios[i.user_id]?.perfil })); },
      async avaliarInscricao(iid, campos) {
        exigeEquipe(); const i = Object.values(db.insc).find((x) => x.id === iid);
        Object.assign(i, campos, campos.status && campos.status !== i.status ? { avaliado_por: db.sessao, avaliado_em: agora() } : {}); gravar();
      },
      async casas() { exigeEquipe(); return Object.values(db.casas).map((c) => ({ ...c, perfil: db.usuarios[c.user_id]?.perfil })); },
      async avaliarCasa(cid, campos) {
        exigeEquipe(); const c = Object.values(db.casas).find((x) => x.id === cid);
        Object.assign(c, campos, { avaliado_por: db.sessao, avaliado_em: agora() }); gravar();
      },
      async perfis() { exigeEquipe(); return Object.values(db.usuarios).map((u) => u.perfil); },
      async atualizarPerfil(pid, campos) {
        if (eu()?.tipo !== "adm") throw new Error("Só a administração muda perfis.");
        Object.assign(db.usuarios[pid].perfil, campos); gravar();
      },
      async checklistTodos() { exigeEquipe(); return db.chk; },
      async registrosTodos() { exigeEquipe(); return db.reg; },
      // convites, primeiro acesso e avisos
      async convidar(c) {
        exigeEquipe(); if (eu().tipo !== "adm" && !["artista", "casa"].includes(c.tipo)) throw new Error("Só a administração convida para equipe ou administração.");
        const email = c.email.toLowerCase().trim(); db.conv[email] = { ...db.conv[email], ...c, email, criado_em: db.conv[email]?.criado_em || agora(), aceito_em: db.conv[email]?.aceito_em || null }; gravar();
        return { enviado: false, demo: true };
      },
      async convites() { exigeEquipe(); return Object.values(db.conv); },
      async cancelarConvite(email) { exigeEquipe(); delete db.conv[email]; gravar(); },
      async marcarTutorialEnviado(email) { if (db.conv[email]) { db.conv[email].tutorial_enviado_em = agora(); gravar(); } },
      async enviarLinkSenha() { return { enviado: false, demo: true }; },
      precisaSenha() { return false; },
      async definirSenha(senha) { db.usuarios[db.sessao].senha = senha; eu().senha_definida = true; gravar(); },
      async marcarTutorial() { eu().tutorial_visto_em = agora(); gravar(); },
      async reivindicar() {
        const p = eu(), c = p && db.conv[p.email]; if (!c || c.aceito_em) return false;
        Object.assign(p, { tipo: c.tipo, codigo_acesso: c.codigo_acesso || p.codigo_acesso, vinculo_nome: c.vinculo_nome || p.vinculo_nome, funcoes: c.tipo === "casa" ? c.funcoes || null : null }); c.aceito_em = agora(); gravar(); return true;
      },
      async avisar(a) { if (!db.avisos.some((x) => x.cidade.toLowerCase() === a.cidade.toLowerCase() && x.contato.toLowerCase() === a.contato.toLowerCase())) db.avisos.push({ ...a, id: id(), criado_em: agora() }); gravar(); },
      async avisos() { exigeEquipe(); return db.avisos; },
      async relatos() { exigeEquipe(); return []; },
      // Campanhas e materiais no modo demonstração: só existem se um teste guardar exemplos em "tq-demo-hub".
      async hubCampanhas() { const h = hubDemo(); return { campanhas: h.campanhas || [], itens: h.itens || [], feitos: db.campFeitos || [] }; },
      async marcarCampanha(itemId, feito) {
        db.campFeitos = (db.campFeitos || []).filter((f) => f.item_id !== itemId);
        if (feito) db.campFeitos.push({ item_id: itemId, feito_por: db.sessao, feito_em: agora() });
        gravar();
      },
      async andamentoCampanhas() {
        const h = hubDemo(), hoje = new Date().toISOString().slice(0, 10), fs = new Set((db.campFeitos || []).map((f) => f.item_id));
        return (h.campanhas || []).map((c) => { const its = (h.itens || []).filter((i) => i.campanha_id === c.id);
          return { campanha_id: c.id, slug: c.slug, titulo: c.titulo, casa_ref: c.casa_ref, dias: its.length, feitos: its.filter((i) => fs.has(i.id)).length,
            atrasados: its.filter((i) => !fs.has(i.id) && i.dia < hoje).length, proximo: its.filter((i) => !fs.has(i.id) && i.dia >= hoje).map((i) => i.dia).sort()[0] || null }; });
      },
      async hubMateriais() {
        const h = hubDemo(), minhas = (db.ciencias || []).filter((c) => c.user_id === db.sessao);
        const vig = (h.materiais || []).map((m) => (h.versoes || []).filter((v) => v.material_id === m.id).sort((a, b) => b.publicada_em.localeCompare(a.publicada_em))[0]).filter(Boolean);
        const versoes = [...(h.versoes || [])].sort((a, b) => b.publicada_em.localeCompare(a.publicada_em));   // como no banco: mais recente primeiro
        return { materiais: h.materiais || [], versoes, minhas, todas: db.ciencias || [],
          pendentes: vig.filter((v) => v.exige_ciencia && !minhas.some((c) => c.versao_id === v.id)).map((v) => ({ versao_id: v.id })) };
      },
      async darCiencia(versaoId) { (db.ciencias ||= []).push({ versao_id: versaoId, user_id: db.sessao, registrada_em: agora() }); gravar(); },
      async publicarVersao(v) {
        exigeEquipe(); const h = hubDemo();
        if ((h.versoes || []).some((x) => x.material_id === v.material_id && x.versao === v.versao)) throw new Error("duplicate key value violates unique constraint");
        (h.versoes ||= []).push({ ...v, id: id(), publicada_em: agora() }); localStorage.setItem("tq-demo-hub", JSON.stringify(h));
      },
      async importarCampanha(dados) {
        exigeEquipe(); const h = hubDemo();
        let c = (h.campanhas ||= []).find((x) => x.slug === dados.slug);
        if (!c) { c = { id: id() }; h.campanhas.push(c); }
        Object.assign(c, { slug: dados.slug, titulo: dados.titulo, casa_ref: dados.casa, fonte_url: dados.fonte_url });
        const chaves = new Set(dados.itens.map((i) => i.chave));
        h.itens = (h.itens || []).filter((i) => i.campanha_id !== c.id || chaves.has(i.chave));
        for (const it of dados.itens) {
          const ex = h.itens.find((i) => i.campanha_id === c.id && i.chave === it.chave);
          if (ex) Object.assign(ex, it); else h.itens.push({ ...it, id: id(), campanha_id: c.id });
        }
        h.itens.sort((a, b) => a.dia.localeCompare(b.dia)); localStorage.setItem("tq-demo-hub", JSON.stringify(h)); return c.id;
      },
      async novoMaterial(m, v) {
        exigeEquipe(); const h = hubDemo();
        if ((h.materiais || []).some((x) => x.slug === m.slug)) throw new Error("duplicate key value violates unique constraint");
        const mid = id(); (h.materiais ||= []).push({ ...m, id: mid, ativo: true });
        (h.versoes ||= []).push({ ...v, material_id: mid, id: id(), publicada_em: agora() }); localStorage.setItem("tq-demo-hub", JSON.stringify(h));
      },
      // Contrato automático (mesmas regras do banco, supabase/schema.sql v7).
      async modelosContrato() { exigeEquipe(); return db.modContr; },
      async salvarModeloContrato(m) { exigeEquipe(); if (m.id) Object.assign(db.modContr.find((x) => x.id === m.id), m); else db.modContr.unshift({ ...m, id: id(), ativo: true, criado_em: agora() }); gravar(); },
      async contratos() { const p = eu(); return db.contr.filter((c) => ["equipe", "adm"].includes(p?.tipo) || c.user_id === db.sessao); },
      async criarContrato(c) { exigeEquipe(); const n = { ...c, id: id(), status: "enviado", dados: {}, lido_fim_em: null, criado_por: db.sessao, criado_em: agora() }; db.contr.unshift(n); gravar(); return n; },
      async cancelarContrato(cid) { exigeEquipe(); const c = db.contr.find((x) => x.id === cid); if (c?.status === "enviado") { c.status = "cancelado"; gravar(); } },
      async contratoSalvarDados(cid, d) {
        const c = db.contr.find((x) => x.id === cid && x.user_id === db.sessao && x.status === "enviado"); if (!c) throw new Error("Contrato não encontrado ou já assinado.");
        for (const [k, v] of Object.entries(d)) { if (!c.campos.some((x) => x.chave === k)) throw new Error(`Campo ${k} não existe neste contrato.`); if (typeof v !== "string" || v.length > 300 || /[{}]{2}/.test(v)) throw new Error(`Valor inválido em ${k}.`); }
        c.dados = d; c.lido_fim_em = null; gravar();
      },
      async contratoLido(cid) { const c = db.contr.find((x) => x.id === cid && x.user_id === db.sessao && x.status === "enviado"); if (c && !c.lido_fim_em) { c.lido_fim_em = agora(); gravar(); } },
      async assinarContrato(cid, nome, h) {
        const c = db.contr.find((x) => x.id === cid && x.user_id === db.sessao && x.status === "enviado"); if (!c) throw new Error("Contrato não encontrado ou já assinado.");
        const falta = c.campos.filter((x) => !String(c.dados[x.chave] ?? "").trim()).map((x) => x.rotulo); if (falta.length) throw new Error(`Faltam dados — preencha antes de assinar: ${falta.join(", ")}.`);
        if (!c.lido_fim_em) throw new Error("Leia o contrato até o fim antes de assinar.");
        nome = String(nome || "").replace(/\s+/g, " ").trim(); if (nome.length < 5 || !/\s/.test(nome)) throw new Error("Digite o seu nome completo para assinar (é a sua assinatura).");
        const t = TQContrato.preencher(c.texto, c.campos, c.dados); if (await TQContrato.hash(t) !== h) throw new Error("O contrato mudou enquanto você lia. Recarregue a página e leia de novo.");
        Object.assign(c, { status: "assinado", texto_final: t, hash: h, assinado_nome: nome, assinado_em: agora(), ip: "demonstração", navegador: navigator.userAgent.slice(0, 300) }); gravar(); return c;
      },
      // Equipe da casa por função e Trilha da Nova Casa (mesmas regras do banco, schema v11).
      async equipeCasa() {
        const p = eu(); if (!p?.vinculo_nome) return [];
        const temConta = (m) => Object.values(db.usuarios).some((u) => u.perfil.email === m.email && u.perfil.funcoes);
        return (db.eqc || []).filter((m) => m.casa_ref === p.vinculo_nome).map((m) => ({ ...m, acesso: !m.email ? "sem_email" : temConta(m) ? "ativo" : db.conv[m.email] ? "convidado" : "sem_convite" }));
      },
      async salvarMembro(m) {
        const e = TQEquipe.funcoesErro(m.funcoes); if (e) throw new Error(e);
        const p = eu(); if (p?.tipo !== "casa" || p.funcoes || !p.vinculo_nome) throw new Error("Só o responsável da casa mexe na equipe.");
        db.eqc ||= []; const linha = { nome: m.nome, whatsapp: m.whatsapp || null, email: m.email || null, instagram: m.instagram || null, observacao: m.observacao || null, funcoes: [...new Set(m.funcoes)].sort(), reserva: !!m.reserva };
        if (m.id) Object.assign(db.eqc.find((x) => x.id === m.id), linha); else db.eqc.push({ ...linha, id: id(), casa_ref: p.vinculo_nome, criado_em: agora() });
        gravar();
      },
      async removerMembro(mid) { db.eqc = (db.eqc || []).filter((x) => x.id !== mid); gravar(); },
      async convidarMembro(mid) {
        const m = (db.eqc || []).find((x) => x.id === mid), p = eu(); if (!m?.email) throw new Error("Coloque o e-mail da pessoa antes de convidar.");
        db.conv[m.email] = { email: m.email, tipo: "casa", nome: m.nome, whatsapp: m.whatsapp, codigo_acesso: p.codigo_acesso, vinculo_nome: p.vinculo_nome, funcoes: m.funcoes, criado_em: agora(), aceito_em: null };
        gravar(); return { enviado: false, demo: true };
      },
      async equipesTodas() { exigeEquipe(); return db.eqc || []; },
      async checklistCasa() { return this.meuChecklist(); },
      async desmarcarCasa(ev, it) { return this.marcar(ev, it, false); },
      async minhaTrilha() { const p = eu(), t = p?.vinculo_nome && (db.tri || {})[p.vinculo_nome]; return t ? { casa_ref: p.vinculo_nome, inicio: t.inicio, marcos: t.marcos || {} } : null; },
      async trilhaMarcarCasa(etapa, feito) {
        const p = eu(), t = (db.tri || {})[p?.vinculo_nome]; if (!t) throw new Error("A sua casa ainda não tem trilha.");
        if (p.funcoes) throw new Error("Só o responsável da casa confirma as etapas da trilha.");
        if (!TQEquipe.ETAPAS_CASA.includes(etapa)) throw new Error("Esta etapa é da Central.");
        t.marcos ||= {}; if (feito) t.marcos[etapa] = agora(); else delete t.marcos[etapa]; gravar();
      },
      async trilhas() {
        exigeEquipe(); const T = db.tri || {};
        return { trilhas: Object.entries(T).map(([k, t]) => ({ casa_ref: k, inicio: t.inicio, nota_passagem: t.nota || null })),
          marcos: Object.entries(T).flatMap(([k, t]) => Object.entries(t.marcos || {}).map(([etapa, em]) => ({ casa_ref: k, etapa, feito_em: em }))) };
      },
      async salvarTrilha(t) { exigeEquipe(); db.tri ||= {}; db.tri[t.casa_ref] = { ...(db.tri[t.casa_ref] || {}), inicio: t.inicio, nota: t.nota || null }; gravar(); },
      async marcarTrilha(ref, etapa, feito) { exigeEquipe(); const t = db.tri[ref]; t.marcos ||= {}; if (feito) t.marcos[etapa] = agora(); else delete t.marcos[etapa]; gravar(); },
      async apagarTrilha(ref) { exigeEquipe(); delete db.tri[ref]; gravar(); },
      // Ficha da Casa: pedido de atualização (a Central aprova), combinados e disponibilidade de datas (schema v13).
      async minhasSolicitacoes() { return (db.sol || []).filter((x) => x.user_id === db.sessao).sort((a, b) => b.criado_em.localeCompare(a.criado_em)); },
      async solicitarAtualizacao(proposto, mensagem) {
        const c = db.casas[db.sessao]; if (!c) throw new Error("Cadastre a casa antes de pedir atualização.");
        const mudou = {}, antes = {}; for (const [k, v] of Object.entries(proposto)) if (JSON.stringify(c.dados[k] ?? "") !== JSON.stringify(v ?? "")) { mudou[k] = v; antes[k] = c.dados[k] ?? null; }
        if (!Object.keys(mudou).length) throw new Error("Nada mudou em relação à ficha atual.");
        (db.sol ||= []).forEach((x) => { if (x.casa_id === c.id && x.status === "pendente") x.status = "cancelada"; });
        db.sol.push({ id: id(), casa_id: c.id, user_id: db.sessao, antes, proposto: mudou, mensagem: mensagem || null, status: "pendente", criado_em: agora() }); gravar();
      },
      async cancelarSolicitacao(sid) { const x = (db.sol || []).find((y) => y.id === sid && y.user_id === db.sessao && y.status === "pendente"); if (x) { x.status = "cancelada"; gravar(); } },
      async solicitacoesTodas() { exigeEquipe(); return db.sol || []; },
      async responderSolicitacao(sid, aprovar, resposta) {
        exigeEquipe(); const x = (db.sol || []).find((y) => y.id === sid && y.status === "pendente"); if (!x) throw new Error("Esta solicitação não está mais pendente.");
        if (aprovar) { const c = Object.values(db.casas).find((y) => y.id === x.casa_id); c.dados = { ...c.dados, ...x.proposto }; c.pendencias = R.pendenciasCasa(c.dados); }
        Object.assign(x, { status: aprovar ? "aprovada" : "recusada", resposta: resposta || null, revisado_em: agora() }); gravar();
      },
      async definirCombinados(cid, cb) { exigeEquipe(); Object.values(db.casas).find((y) => y.id === cid).combinados = cb; gravar(); },
      async disponibilidade() { const p = eu(); return (db.disp || []).filter((x) => ["equipe", "adm"].includes(p?.tipo) || x.casa_ref === p?.vinculo_nome); },
      async marcarDisponibilidade(casa_ref, dia, situacao) {
        const p = eu(); if (p?.tipo !== "casa" || p.funcoes || p.vinculo_nome !== casa_ref) throw new Error("Só o responsável da casa informa a disponibilidade.");
        db.disp = (db.disp || []).filter((x) => !(x.casa_ref === casa_ref && x.dia === dia));
        if (situacao) db.disp.push({ casa_ref, dia, situacao, atualizado_em: agora() }); gravar();
      },
      async documentos() { return []; },
      async criarDocumento() { throw new Error("No modo demonstração os documentos não são guardados."); },
      async apagarDocumento() {},
      async meusArquivos() { return {}; },
      async enviarArquivo() { throw new Error("O envio de arquivos funciona só com o banco ligado (fora do modo demonstração)."); },
      async linkArquivo() { return null; },
      async arquivosTodos() { return []; },
    };
  }

  // Aviso do topo do formulário de entrada (conectando, fora do ar ou modo demonstração).
  function avisoConta() {
    const h = FORA ? `<div class="alert crit" style="margin-bottom:14px"><b>Contas fora do ar agora</b>A agenda e os ingressos funcionam normalmente. Para entrar ou se cadastrar, tente de novo em alguns minutos.</div>`
      : !api && CONFIGURADO ? `<div class="alert" style="margin-bottom:14px"><b>Conectando…</b>Preparando o acesso às contas. Leva alguns segundos.</div>`
      : REAL ? "" : `<div class="alert warn" style="margin-bottom:14px"><b>Modo demonstração</b>As contas e respostas ficam só neste navegador, para testar os fluxos. Atalhos: <a href="#" data-demo="equipe">entrar como equipe</a> · <a href="#" data-demo="adm">entrar como administração</a></div>`;
    return h ? h.replace('<div class="alert', '<div id="contaAviso" class="alert') : '<div id="contaAviso"></div>';
  }

  // ---------- banco configurado mas fora do ar ----------
  // Ninguém cai no modo demonstração achando que enviou algo de verdade: toda ação explica e pede para tentar depois.
  function Fora() {
    const msg = "As contas estão fora do ar agora. A agenda e os ingressos funcionam normalmente; tente entrar de novo em alguns minutos.";
    return new Proxy({}, { get: (_, k) => (k === "sessao" ? async () => null : async () => { throw new Error(msg); }) });
  }

  // ---------- Supabase ----------
  async function Supa() {
    // Cópia do supabase-js servida pelo próprio site (vendor/); o CDN só entra se ela faltar.
    if (!window.supabase?.createClient) {
      await new Promise((ok, erro) => { const sc = document.createElement("script"); sc.src = "vendor/supabase-2.117.2.js"; sc.onload = ok; sc.onerror = erro; document.head.appendChild(sc); })
        .catch(() => import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm").then((m) => { window.supabase = m; }));
    }
    const { createClient } = window.supabase;
    const sb = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    // Link de "esqueci a senha": o Supabase abre a sessão e avisa que a pessoa precisa escolher uma senha nova.
    let recuperacao = /type=recovery/.test(location.hash);
    sb.auth.onAuthStateChange((evento) => { if (evento === "PASSWORD_RECOVERY") recuperacao = true; });
    const base = () => location.origin + location.pathname;
    const ok = ({ data, error }) => { if (error) throw new Error(traduz(error.message)); return data; };
    const uid = async () => (await sb.auth.getUser()).data.user?.id;
    // O código de acesso não sai na leitura de perfis (só por meu_acesso, e o de todos só para a adm: schema v8).
    // Banco ainda sem a v8: lê como antes.
    const COLS0 = "id,email,nome,tipo,whatsapp,vinculo_nome,criado_em,tutorial_visto_em,senha_definida,vinculo_pedido_nome,vinculo_pedido_em", COLS = COLS0 + ",funcoes";
    // Função na equipe da casa (schema v11). Banco ainda sem a coluna: lê como antes.
    const lerCols = async (montar) => { const r = await montar(sb.from("perfis").select(COLS)); return r.error && /funcoes/.test(r.error.message || "") ? montar(sb.from("perfis").select(COLS0)) : r; };
    const semV8 = (e) => /PGRST202|42703|Could not find the function|does not exist/i.test(`${e?.code} ${e?.message}`);
    const perfil = async () => {
      const u = await uid(); if (!u) return null;
      const r = await lerCols((x) => x.eq("id", u).maybeSingle());
      if (r.error && semV8(r.error)) return ok(await sb.from("perfis").select("*").eq("id", u).maybeSingle());
      const p = ok(r); if (!p) return null;
      const a = await sb.rpc("meu_acesso");
      return { ...p, codigo_acesso: a.data?.[0]?.codigo_acesso ?? null, vinculo_pedido: a.data?.[0]?.vinculo_pedido ?? null };
    };
    const lerPerfis = async (montar) => {
      const r = await lerCols(montar);
      if (r.error && semV8(r.error)) return ok(await montar(sb.from("perfis").select("*")));
      const ps = ok(r), cods = await sb.rpc("codigos_acesso");   // vazio para quem não é adm
      const m = Object.fromEntries((cods.data || []).map((c) => [c.id, c]));
      return ps.map((p) => ({ ...p, codigo_acesso: m[p.id]?.codigo_acesso ?? null, vinculo_pedido: m[p.id]?.vinculo_pedido ?? null }));
    };
    // Nota interna fica em notas_internas (só a equipe lê). Banco ainda sem essa tabela: usa a coluna antiga.
    const semTabela = (e) => /PGRST205|42P01|Could not find the table/i.test(`${e?.code} ${e?.message}`);
    const comNotas = async (alvo, linhas) => {
      if (!linhas.length) return linhas;
      const { data, error } = await sb.from("notas_internas").select("alvo_id, nota").eq("alvo", alvo).in("alvo_id", linhas.map((l) => l.id));
      if (error) return linhas;
      const nota = Object.fromEntries(data.map((n) => [n.alvo_id, n.nota]));
      return linhas.map((l) => ({ ...l, nota_interna: nota[l.id] ?? l.nota_interna ?? null }));
    };
    const guardarNota = async (alvo, id, campos) => {
      if (!("nota_interna" in campos)) return campos;
      const { nota_interna, ...resto } = campos;
      const { error } = await sb.from("notas_internas").upsert({ alvo, alvo_id: id, nota: nota_interna, atualizado_em: new Date().toISOString() });
      if (error && semTabela(error)) return campos;
      if (error) throw new Error(traduz(error.message));
      return resto;
    };
    const comPerfis = async (linhas) => {
      if (!linhas.length) return linhas;
      const ps = await lerPerfis((x) => x.in("id", linhas.map((l) => l.user_id)));
      return linhas.map((l) => ({ ...l, perfil: ps.find((p) => p.id === l.user_id) }));
    };
    return {
      // O banco está pronto quando a tabela de perfis existe (schema.sql já rodou).
      async pronto() {
        const { error } = await sb.from("perfis").select("id").limit(1);
        if (!error) return true;
        if (/PGRST205|42P01|does not exist|Could not find the table/i.test(`${error.code} ${error.message}`)) return false;
        // Só falha de rede conta como "fora do ar". Erro de permissão ou de consulta = banco respondendo
        // (um código como 42501 não é erro 5xx).
        if (/Failed to fetch|NetworkError|Load failed|network|timed? ?out|upstream|Bad Gateway|Service Unavailable/i.test(error.message || "")) throw new Error("banco fora do ar");
        return true;
      },
      async sessao() { return perfil(); },
      async entrar(email, senha) { ok(await sb.auth.signInWithPassword({ email, password: senha })); return perfil(); },
      async cadastrar({ email, senha, nome, tipo }) {
        const r = ok(await sb.auth.signUp({ email, password: senha, options: { data: { nome, tipo }, emailRedirectTo: location.origin + location.pathname } }));
        return r.session ? { perfil: await perfil() } : { confirmar: true };
      },
      async recuperar(email) { ok(await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname })); return true; },
      async sair() { await sb.auth.signOut(); },
      async minhaInscricao() { return ok(await sb.from("inscricoes_artistas").select("*").eq("user_id", await uid()).maybeSingle()); },
      async salvarInscricao(dados, enviar) {
        const u = await uid(), atual = await this.minhaInscricao();
        const linha = { dados, status: enviar ? "em_curadoria" : atual?.status || "rascunho" };
        return atual ? ok(await sb.from("inscricoes_artistas").update(linha).eq("user_id", u).select().single())
          : ok(await sb.from("inscricoes_artistas").insert({ ...linha, user_id: u }).select().single());
      },
      async minhaCasa() { return ok(await sb.from("cadastros_casas").select("*").eq("user_id", await uid()).maybeSingle()); },
      async salvarCasa(dados, { enviar, ja_parceira, notion_casa_id }) {
        const u = await uid(), atual = await this.minhaCasa();
        const linha = { dados, ja_parceira: !!ja_parceira, notion_casa_id: notion_casa_id || null, status: enviar ? "em_analise" : atual?.status || "rascunho" };
        return atual ? ok(await sb.from("cadastros_casas").update(linha).eq("user_id", u).select().single())
          : ok(await sb.from("cadastros_casas").insert({ ...linha, user_id: u }).select().single());
      },
      async meuChecklist() { return ok(await sb.from("checklist").select("*").eq("user_id", await uid())); },
      async marcar(evento_id, item, feito) {
        const u = await uid();
        if (feito) ok(await sb.from("checklist").upsert({ user_id: u, evento_id, item, feito: true, atualizado_em: new Date().toISOString() }));
        else ok(await sb.from("checklist").delete().match({ user_id: u, evento_id, item }));
      },
      async registrar(evento_id, r) { ok(await sb.from("registros_noite").upsert({ user_id: await uid(), evento_id, ...r }, { onConflict: "user_id,evento_id" })); },
      async meusRegistros() { return ok(await sb.from("registros_noite").select("*").eq("user_id", await uid())); },
      async vincularCodigo(codigo, nome) {
        const p = await perfil(); if (p.codigo_acesso) throw new Error("Esta conta já está vinculada. Fale com a equipe para trocar.");
        // Vira pedido: a administração confirma em Pessoas (o banco não deixa a conta se vincular sozinha).
        ok(await sb.from("perfis").update({ vinculo_pedido: codigo, vinculo_pedido_nome: nome }).eq("id", p.id));
        return perfil();
      },
      async chaveInterna(tipo) { return ok(await sb.from("chaves_internas").select("codigo").eq("tipo", tipo).maybeSingle())?.codigo || null; },
      async inscricoes() { return comNotas("insc", await comPerfis(ok(await sb.from("inscricoes_artistas").select("*").order("enviado_em", { ascending: false, nullsFirst: false })))); },
      async avaliarInscricao(iid, campos) { campos = await guardarNota("insc", iid, campos); ok(await sb.from("inscricoes_artistas").update(campos).eq("id", iid)); },
      async casas() { return comNotas("casa", await comPerfis(ok(await sb.from("cadastros_casas").select("*").order("atualizado_em", { ascending: false })))); },
      async avaliarCasa(cid, campos) { campos = await guardarNota("casa", cid, campos); ok(await sb.from("cadastros_casas").update(campos).eq("id", cid)); },
      async perfis() { return lerPerfis((x) => x.order("criado_em", { ascending: false })); },
      async atualizarPerfil(pid, campos) { ok(await sb.from("perfis").update(campos).eq("id", pid)); },
      async checklistTodos() { return ok(await sb.from("checklist").select("*")); },
      async registrosTodos() { return ok(await sb.from("registros_noite").select("*").order("criado_em", { ascending: false })); },
      // convites, primeiro acesso e avisos
      async convidar(c) {
        const linha = { email: c.email.toLowerCase().trim(), tipo: c.tipo, nome: c.nome || "", whatsapp: c.whatsapp || null, codigo_acesso: c.codigo_acesso || null, vinculo_nome: c.vinculo_nome || null, criado_por: await uid() };
        ok(await sb.from("convites").upsert(linha, { onConflict: "email" }));
        // Link de acesso por e-mail. A conta nasce ao clicar; o convite aplica perfil e vínculo nessa hora.
        const { error } = await sb.auth.signInWithOtp({ email: linha.email, options: { shouldCreateUser: true, emailRedirectTo: base(), data: { nome: linha.nome, tipo: linha.tipo === "casa" ? "casa" : "artista" } } });
        return { enviado: !error, erro: error ? traduz(error.message) : null };
      },
      async convites() { return ok(await sb.from("convites").select("*").order("criado_em", { ascending: false })); },
      async cancelarConvite(email) {
        const linhas = ok(await sb.from("convites").delete().eq("email", email).select("email"));
        if (!linhas?.length) throw new Error("Este convite já foi aceito e não pode ser cancelado. Para mudar a conta, use a aba Pessoas.");
      },
      async marcarTutorialEnviado(email) { await sb.from("convites").update({ tutorial_enviado_em: new Date().toISOString() }).eq("email", email); },
      async enviarLinkSenha(email) {
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: base() });
        return { enviado: !error, erro: error ? traduz(error.message) : null };
      },
      precisaSenha() { return recuperacao; },
      async definirSenha(senha) {
        ok(await sb.auth.updateUser({ password: senha }));
        recuperacao = false;
        ok(await sb.from("perfis").update({ senha_definida: true }).eq("id", await uid()));
      },
      async marcarTutorial() { ok(await sb.from("perfis").update({ tutorial_visto_em: new Date().toISOString() }).eq("id", await uid())); },
      async reivindicar() { const { data, error } = await sb.rpc("reivindicar_convite"); return !error && data === true; },
      async avisar(a) {
        const { error } = await sb.from("avisos_cidade").insert({ ...a, consentimento: true });
        if (error && /PGRST205|42P01|Could not find the table/i.test(`${error.code} ${error.message}`)) throw new Error("Os avisos por cidade ainda não estão ligados. Tente de novo mais tarde.");
        if (error && error.code !== "23505") throw new Error(traduz(error.message));   // 23505: já pediu esta cidade
      },
      async avisos() { return ok(await sb.from("avisos_cidade").select("*").order("criado_em", { ascending: false })); },
      // Documentos da data (contrato) e modelo geral: a equipe cadastra; cada conta só lê os seus e os gerais.
      async documentos() { return ok(await sb.from("documentos").select("*").order("criado_em", { ascending: false })); },
      async criarDocumento(d) { return ok(await sb.from("documentos").insert(d).select().single()); },
      // Contrato automático: a equipe cria; a pessoa preenche, lê e assina pelas funções do banco (schema v7).
      async modelosContrato() { return ok(await sb.from("modelos_contrato").select("*").eq("ativo", true).order("criado_em", { ascending: false })); },
      async salvarModeloContrato(m) { ok(m.id ? await sb.from("modelos_contrato").update({ nome: m.nome, texto: m.texto, ativo: m.ativo ?? true }).eq("id", m.id) : await sb.from("modelos_contrato").insert({ nome: m.nome, texto: m.texto })); },
      async contratos() { return ok(await sb.from("contratos").select("*").order("criado_em", { ascending: false })); },
      async criarContrato(c) { return ok(await sb.from("contratos").insert(c).select().single()); },
      async cancelarContrato(cid) { ok(await sb.from("contratos").update({ status: "cancelado" }).eq("id", cid)); },
      async contratoSalvarDados(cid, d) { ok(await sb.rpc("contrato_salvar_dados", { cid, d })); },
      async contratoLido(cid) { ok(await sb.rpc("contrato_li_ate_o_fim", { cid })); },
      async assinarContrato(cid, nome, h) { return ok(await sb.rpc("assinar_contrato", { cid, nome, h })); },
      async apagarDocumento(id) { ok(await sb.from("documentos").delete().eq("id", id)); },
      // Materiais enviados (rider, mapa de palco, fotos): pasta privada <conta>/<data>/ no armazenamento "materiais".
      async meusArquivos() {
        const u = await uid(), st = sb.storage.from("materiais"), out = {};
        const { data: pastas } = await st.list(u, { limit: 200 });
        for (const p of pastas || []) { const { data: fs } = await st.list(`${u}/${p.name}`, { limit: 100, sortBy: { column: "created_at", order: "desc" } }); out[p.name] = (fs || []).map((f) => ({ nome: f.name, caminho: `${u}/${p.name}/${f.name}`, tamanho: f.metadata?.size, em: f.created_at })); }
        return out;
      },
      async enviarArquivo(eventoId, arquivo) {
        if (arquivo.size > 25 * 1024 * 1024) throw new Error("Arquivo maior que 25 MB. Mande um link (Drive, WeTransfer) pelo contato da casa.");
        const limpo = arquivo.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w.-]+/g, "_").slice(-80);
        const { error } = await sb.storage.from("materiais").upload(`${await uid()}/${eventoId}/${Date.now()}-${limpo}`, arquivo, { upsert: false });
        if (error) throw new Error(/mime|type/i.test(error.message) ? "Tipo de arquivo não aceito. Use PDF, imagem (JPG/PNG), Word, ZIP ou MP3." : traduz(error.message));
      },
      async linkArquivo(caminho) { const { data } = await sb.storage.from("materiais").createSignedUrl(caminho, 3600); return data?.signedUrl || null; },
      async arquivosTodos() {
        const st = sb.storage.from("materiais"), out = [];
        const { data: contas } = await st.list("", { limit: 500 });
        for (const c of contas || []) {
          const { data: pastas } = await st.list(c.name, { limit: 200 });
          for (const p of pastas || []) { const { data: fs } = await st.list(`${c.name}/${p.name}`, { limit: 100 }); for (const f of fs || []) out.push({ user_id: c.name, evento_id: p.name, nome: f.name, caminho: `${c.name}/${p.name}/${f.name}`, em: f.created_at }); }
        }
        return out.sort((a, b) => String(b.em).localeCompare(String(a.em)));
      },
      // Campanha da casa (conteúdo do Bruno): a casa só vê a dela (posso_casa no banco); "feito" vale para toda a casa.
      async hubCampanhas() {
        const [campanhas, itens, feitos] = await Promise.all([
          sb.from("campanhas").select("id,slug,titulo,casa_ref,fonte_url").order("titulo"),
          sb.from("campanha_itens").select("id,campanha_id,chave,dia,rotulo,acoes").eq("ativo", true).order("dia"),
          sb.from("campanha_feitos").select("item_id,feito_por,feito_em,nota"),
        ]);
        return { campanhas: ok(campanhas), itens: ok(itens), feitos: ok(feitos) };
      },
      async marcarCampanha(itemId, feito) {
        if (feito) ok(await sb.from("campanha_feitos").insert({ item_id: itemId }));
        else ok(await sb.from("campanha_feitos").delete().eq("item_id", itemId));
      },
      async andamentoCampanhas() { return ok(await sb.rpc("andamento_campanhas")); },
      // Materiais com versão vigente e ciência de leitura ("Li e estou ciente"), que fica registrada por versão.
      async hubMateriais() {
        const u = await uid();
        const [materiais, versoes, minhas, pendentes, todas] = await Promise.all([
          sb.from("materiais").select("*").eq("ativo", true).order("titulo"),
          sb.from("material_versoes").select("id,material_id,versao,resumo,url,exige_ciencia,publicada_em").order("publicada_em", { ascending: false }),
          sb.from("ciencias").select("versao_id,registrada_em").eq("user_id", u),
          sb.rpc("minhas_ciencias_pendentes"),
          sb.from("ciencias").select("versao_id,user_id,registrada_em"),
        ]);
        return { materiais: ok(materiais), versoes: ok(versoes), minhas: ok(minhas), pendentes: ok(pendentes), todas: ok(todas) };
      },
      async darCiencia(versaoId) { ok(await sb.from("ciencias").insert({ versao_id: versaoId })); },
      // Equipe: carrega ou atualiza a campanha de uma casa. Reimportar não apaga o que a casa já marcou.
      async importarCampanha(dados) { return ok(await sb.rpc("importar_campanha", { dados })); },
      // Equipe: nova versão de um material (quem publica e quando são carimbados pelo banco).
      async publicarVersao(v) { ok(await sb.from("material_versoes").insert(v)); },
      async novoMaterial(m, v) {
        const [mat] = ok(await sb.from("materiais").insert(m).select("id"));
        ok(await sb.from("material_versoes").insert({ ...v, material_id: mat.id }));
      },
      async relatos() { return ok(await sb.from("diario").select("criado_em,user_id,perfil,tela,detalhe,navegador").eq("acao", "relato").order("criado_em", { ascending: false }).limit(300)); },
      // Equipe da casa por função e Trilha da Nova Casa (schema v11).
      async equipeCasa() { return ok(await sb.rpc("equipe_da_casa")); },
      async salvarMembro(m) {
        const linha = { nome: m.nome, whatsapp: m.whatsapp || null, email: m.email || null, instagram: m.instagram || null, observacao: m.observacao || null, funcoes: m.funcoes, reserva: !!m.reserva };
        ok(m.id ? await sb.from("equipe_casa").update(linha).eq("id", m.id) : await sb.from("equipe_casa").insert({ ...linha, casa_ref: m.casa_ref }));
      },
      async removerMembro(mid) { ok(await sb.from("equipe_casa").delete().eq("id", mid)); },
      async convidarMembro(mid, email, nome) {
        if (ok(await sb.rpc("convidar_equipe_casa", { membro: mid })) === "ja_tem_acesso") return { ja: true };
        const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: base(), data: { nome, tipo: "casa" } } });
        return { enviado: !error, erro: error ? traduz(error.message) : null };
      },
      async equipesTodas() { return ok(await sb.from("equipe_casa").select("*").order("criado_em")); },
      // Passos marcados por qualquer pessoa da casa (banco sem a v11: só os da própria conta).
      async checklistCasa() { const r = await sb.rpc("checklist_da_casa"); return r.error ? this.meuChecklist() : r.data; },
      async desmarcarCasa(ev, it) { const r = await sb.rpc("desmarcar_passo_casa", { ev, it }); if (r.error) await this.marcar(ev, it, false); },
      async minhaTrilha() { const r = await sb.rpc("minha_trilha"); return r.error ? null : r.data?.[0] || null; },
      async trilhaMarcarCasa(etapa, feito) { ok(await sb.rpc("trilha_marcar_casa", { etapa_: etapa, feito })); },
      async trilhas() { const [t, m] = await Promise.all([sb.from("trilhas").select("*").order("inicio", { ascending: false }), sb.from("trilha_marcos").select("casa_ref,etapa,feito_em")]); return { trilhas: ok(t), marcos: ok(m) }; },
      async salvarTrilha(t) { ok(await sb.from("trilhas").upsert({ casa_ref: t.casa_ref, inicio: t.inicio, nota_passagem: t.nota || null })); },
      async marcarTrilha(ref, etapa, feito) { ok(feito ? await sb.from("trilha_marcos").upsert({ casa_ref: ref, etapa }) : await sb.from("trilha_marcos").delete().match({ casa_ref: ref, etapa })); },
      async apagarTrilha(ref) { ok(await sb.from("trilhas").delete().eq("casa_ref", ref)); },
      // Ficha da Casa: pedido de atualização, combinados e disponibilidade de datas (schema v13).
      async minhasSolicitacoes() { return ok(await sb.from("solicitacoes_ficha").select("*").eq("user_id", await uid()).order("criado_em", { ascending: false }).limit(20)); },
      async solicitarAtualizacao(proposto, mensagem) { return ok(await sb.rpc("solicitar_atualizacao_ficha", { proposto, mensagem })); },
      async cancelarSolicitacao(sid) { ok(await sb.rpc("cancelar_solicitacao_ficha", { sid })); },
      async solicitacoesTodas() { return ok(await sb.from("solicitacoes_ficha").select("*").order("criado_em", { ascending: false }).limit(300)); },
      async responderSolicitacao(sid, aprovar, resposta) { ok(await sb.rpc("responder_solicitacao_ficha", { sid, aprovar, resposta_: resposta || null })); },
      async definirCombinados(cid, c) { ok(await sb.rpc("definir_combinados", { cid, c })); },
      async disponibilidade() { return ok(await sb.from("disponibilidade_casa").select("casa_ref,dia,situacao,nota,atualizado_em").order("dia")); },
      async marcarDisponibilidade(casa_ref, dia, situacao) {
        ok(situacao ? await sb.from("disponibilidade_casa").upsert({ casa_ref, dia, situacao }) : await sb.from("disponibilidade_casa").delete().match({ casa_ref, dia }));
      },
    };
  }
  function traduz(m) {
    if (/Invalid login credentials/i.test(m)) return "E-mail ou senha incorretos.";
    if (/Email not confirmed/i.test(m)) return "Confirme o e-mail pelo link que enviamos antes de entrar.";
    if (/already registered/i.test(m)) return "Já existe uma conta com este e-mail.";
    if (/Password should be at least/i.test(m)) return "A senha precisa de pelo menos 8 caracteres.";
    if (/rate limit|too many|security purposes/i.test(m)) return "Limite de envio de e-mails do Supabase atingido. Tente de novo em alguns minutos ou mande pelo WhatsApp.";
    if (/not allowed|not authorized|Signups not allowed/i.test(m)) return "O Supabase recusou o envio para este e-mail. Confira a configuração de e-mail do projeto.";
    if (/Email address .* is invalid|email_address_invalid|invalid email/i.test(m)) return "Esse e-mail não parece válido. Confira se está escrito certo.";
    if (/weak|easy to guess|pwned|leaked/i.test(m)) return "Essa senha é fácil de adivinhar ou já vazou em outro site. Escolha outra, com pelo menos 8 caracteres.";
    if (/JWT expired|invalid JWT|session.*(missing|expired)|refresh token/i.test(m)) return "Sua sessão expirou. Saia e entre de novo.";
    if (/duplicate key/i.test(m)) return "Isso já foi salvo. Recarregue a página para ver.";
    if (/invalid input syntax|out of range|violates check constraint/i.test(m)) return "Algum campo tem um valor que não dá para salvar (confira os números). Se continuar, fale com a equipe.";
    if (/Failed to fetch|NetworkError|Load failed|network/i.test(m)) return "Sem conexão com a internet agora. Confira a rede e tente de novo.";
    if (/upstream|Bad Gateway|Service Unavailable|Gateway|timeout|statement timeout|5\d\d/i.test(m)) return "O servidor teve um problema agora. Tente de novo em instantes.";
    if (/row-level security|permission denied/i.test(m)) return "Sua conta não tem permissão para fazer isso.";
    if (/^[\x00-\x7F]+$/.test(m) && m.length > 0) { console.warn("Mensagem do servidor:", m); return "Algo deu errado do nosso lado. Tente de novo; se continuar, fale com a equipe."; }
    return m;
  }

  // ---------- estado e carregamento ----------
  async function carregar(perfil) {
    if (!perfil) throw new Error("Sua conta ainda está sendo criada. Tente entrar de novo em 1 minuto.");
    // Convite feito depois que a conta já existia: aplica ao entrar (o banco confere o e-mail confirmado).
    try { if (await api.reivindicar?.()) perfil = (await api.sessao()) || perfil; } catch { /* segue sem o convite */ }
    // Monta tudo antes de trocar a tela: se uma leitura falhar, a pessoa continua deslogada e vê a mensagem.
    const conta = { perfil, insc: null, casa: null, chk: [], reg: [] };
    if (perfil.tipo === "artista") conta.insc = await api.minhaInscricao();
    if (perfil.tipo === "casa") { conta.casa = await api.minhaCasa(); conta.reg = await api.meusRegistros(); conta.sol = perfil.funcoes ? [] : await api.minhasSolicitacoes().catch(() => []); }
    if (perfil.tipo === "artista" || perfil.tipo === "casa") {
      conta.chk = perfil.tipo === "casa" ? await api.checklistCasa() : await api.meuChecklist();
      // Trilha da nova casa: só o dono da casa acompanha (a equipe da casa não vê).
      if (perfil.tipo === "casa" && !perfil.funcoes) conta.trilha = await api.minhaTrilha().catch(() => null);
      // Documentos e materiais são da versão nova do banco: se falharem, o resto da conta funciona.
      [conta.docs, conta.arqs, conta.contr] = await Promise.all([api.documentos().catch(() => []), api.meusArquivos().catch(() => ({})), api.contratos().catch(() => [])]);
    }
    S.conta = conta;
    // Equipe e adm sempre abrem o pacote interno, mesmo que a conta tenha vindo de um vínculo antigo de artista/casa.
    // Código colado e ainda não confirmado pela adm também abre as métricas (é o mesmo que entrar pelo código).
    const cod = ["equipe", "adm"].includes(perfil.tipo) ? await api.chaveInterna(perfil.tipo) : perfil.codigo_acesso || perfil.vinculo_pedido;
    S.pac = null; S.eq = null; S.hub = null; S.campAberta = null; S.tri = null; S.eqcEd = null; S.triEd = null; S.disp = undefined; S.fichaPedido = false; S.sub = {};   // nada da conta anterior fica na tela
    if (cod) {
      // O pacote precisa ser do mesmo tipo da conta (conta rebaixada não continua vendo o painel antigo).
      try { const pac = await abrirPacote(cod); if (S.conta?.perfil.id === perfil.id && pac.perfil === perfil.tipo) S.pac = pac; }
      catch { /* código antigo ou inválido: segue sem métricas */ }
    }
    S.aba = ordenarAbas(abas())[0][0];
  }
  async function iniciar() {
    if (CONFIGURADO) {
      const limite = (ms) => new Promise((_, erro) => setTimeout(() => erro(new Error("tempo esgotado")), ms));
      try { const s = await Promise.race([Supa(), limite(8000)]); if (await Promise.race([s.pronto(), limite(8000)])) { api = s; REAL = true; } }
      catch (e) { console.error("Banco de contas indisponível", e); FORA = true; api = Fora(); }
    }
    if (!api) api = Demo();
    const p = await api.sessao();
    if (p) { await carregar(p); setTimeout(primeiroAcesso, 0); }
    return !!p;
  }
  async function recarregar() { const p = await api.sessao(); if (p) { const aba = S.aba; await carregar(p); if (abas().some(([k]) => k === aba)) S.aba = aba; } render(); }

  const ROTULO = { artista: "Artista", casa: "Casa", equipe: "Equipe", adm: "Administração" };
  // ---------- portal da casa: quatro áreas ----------
  // Ficha da Casa (dados cadastrais e equipe), Operações (como fazer), Datas (disponibilidade e datas confirmadas) e
  // Marketing (campanhas). Cada informação tem uma tela dona (docs/INFORMATION_OWNERSHIP.md); as outras só apontam para ela.
  const AREAS_CASA = [["ficha", "Ficha da Casa"], ["operacoes", "Operações"], ["datas_casa", "Datas"], ["marketing", "Marketing"]];
  function subsDaArea(area) {
    if (S.conta?.perfil.tipo !== "casa") return [];
    const fs = funcoesDe(), A = fs ? TQEquipe.abasDaFuncao(fs) : null;
    const pacAbas = S.pac ? PERFIS[S.pac.perfil].abas.map(([k]) => k) : [];
    if (area === "ficha") return fs ? (A.equipe ? [["equipe_casa", "Equipe da casa"]] : []) : [["cadastro_casa", "Ficha da unidade"], ["equipe_casa", "Equipe da casa"]];
    if (area === "operacoes") return [...(fs ? [["minha_funcao", "Minha função"]] : []), ...(!fs && S.conta.trilha ? [["trilha", "Treinamento"]] : []),
      ["materiais", "Guia e materiais"], ...(pacAbas.includes("roteiro") && S.pac?.metodo ? [["roteiro", "Como é a noite"]] : []), ["duvidas", "Dúvidas"]];
    if (area === "datas_casa") return [...(fs ? [] : [["agenda_casa", "Disponibilidade"]]), ["passos", fs ? "Datas e passos" : "Datas confirmadas"],
      ...(pacAbas.includes("minhas") && (!fs || A.metricas) ? [["minhas", "Público das noites"]] : [])];
    if (area === "marketing") return !fs || A.campanha ? [["campanha", "Campanhas"]] : [];
    return [];
  }
  /** Área do portal da casa que contém a tela k (ou null). */
  function areaDe(k) { if (!k || S.conta?.perfil.tipo !== "casa") return null; for (const [a] of AREAS_CASA) if (subsDaArea(a).some(([x]) => x === k)) return a; return null; }
  function irPara(k) { const a = areaDe(k); if (a) { (S.sub ||= {})[a] = k; S.aba = a; } else S.aba = k; }
  function telaArea(area) {
    const subs = subsDaArea(area); if (!subs.length) return "";
    S.sub ||= {}; let k = S.sub[area]; if (!subs.some(([x]) => x === k)) k = subs[0][0]; S.sub[area] = k;
    const nav = subs.length > 1 ? `<nav class="subnav" aria-label="Partes de ${esc(AREAS_CASA.find(([a]) => a === area)[1])}">${subs.map(([x, t]) => `<button class="${x === k ? "on" : ""}"${x === k ? ' aria-current="page"' : ""} data-sub="${area}|${x}">${esc(t)}</button>`).join("")}</nav>` : "";
    return nav + (TELAS[k] || window.TQ_TELAS?.[k])();
  }
  // Funções da conta na equipe da casa; null = dono da casa (ou conta que não é de casa).
  const funcoesDe = () => (S.conta?.perfil.tipo === "casa" && S.conta.perfil.funcoes?.length ? S.conta.perfil.funcoes : null);
  const nomesFuncoes = (fs) => (fs || []).map((f) => TQEquipe.NOME[f] || f).join(" · ");
  const roteiroConta = () => (funcoesDe() ? "casa_equipe" : S.conta.perfil.tipo);
  const lerChecklist = () => (S.conta.perfil.tipo === "casa" ? api.checklistCasa() : api.meuChecklist());
  function abas() {
    const t = S.conta.perfil.tipo, doPac = S.pac ? PERFIS[S.pac.perfil].abas : [];
    // Dúvidas frequentes valem para quem tem conta mesmo sem código vinculado (o pacote já traz a aba).
    const duv = doPac.some(([k]) => k === "duvidas") ? [] : [["duvidas", "Dúvidas frequentes"]];
    if (t === "artista") return [["passos", "Próximos passos"], ["inscricao", "Minha inscrição"], ...doPac, ["materiais", "Materiais"], ...duv, ["conta", "Conta"]];
    // Portal da casa (alinhamento com o Gui, 11/2026): só quatro áreas no menu. As telas de antes viram partes delas.
    if (t === "casa") return [...AREAS_CASA.filter(([a]) => subsDaArea(a).length), ["conta", "Conta"]];
    const base = [["inicio", "Comece por aqui"], ["painel", "Painel da operação"], ["agenda_casas", "Agenda das casas"], ["curadoria", "Curadoria"], ["casas_cad", "Cadastros de casas"], ["trilhas", "Treinamentos"], ["prontidao", "Prontidão"], ["convites", "Convites"], ["demanda", "Demanda"], ["documentos", "Documentos"], ["campanhas", "Campanhas"], ["materiais", "Materiais"], ["relatos", "Relatos"]];
    if (t === "adm") base.push(["pessoas", "Pessoas"]);
    return [...base, ...doPac, ["conta", "Conta"]];
  }
  const rotuloQuem = () => `${ROTULO[S.conta.perfil.tipo]} · ${S.conta.perfil.vinculo_nome || S.conta.perfil.nome || S.conta.perfil.email}`;

  // ---------- formulários ----------
  const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  // Erros de formato que a pessoa consegue corrigir (vazio é tratado por "faltando").
  function conferirFormato(d) {
    const e = [], url = (k, nome) => { if (d[k] && !/^https?:\/\/\S+\.\S+/i.test(String(d[k]).trim())) e.push(`${nome} precisa ser um link começando com https://`); };
    url("spotify", "Spotify"); url("youtube", "YouTube"); url("outro_link", "Outro link"); url("foto", "Foto");
    if (d.estado && !/^[A-Za-z]{2}$/.test(String(d.estado).trim())) e.push("Estado: use a sigla com 2 letras (ex.: PE)");
    if (d.whatsapp) { const n = String(d.whatsapp).replace(/\D/g, "").length; if (n < 10 || n > 13 || /[^\d\s()+-]/.test(d.whatsapp)) e.push("WhatsApp: só números, com DDD (ex.: 81 99999-9999)"); }
    if (d.telefone) { const n = String(d.telefone).replace(/\D/g, "").length; if (n < 10 || n > 13 || /[^\d\s()+-]/.test(d.telefone)) e.push("Telefone da casa: só números, com DDD"); }
    for (const [k, nome] of [["dono_email", "E-mail do Dono A"], ["email_contato", "E-mail"]]) if (d[k] && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(d[k]).trim())) e.push(`${nome}: confira o endereço (ex.: nome@casa.com.br)`);
    if (d.dono_nascimento && !/^\d{2}\/\d{2}\/\d{4}$/.test(String(d.dono_nascimento).trim())) e.push("Data de nascimento: use dd/mm/aaaa");
    for (const [k, nome] of [["dono_cpf", "CPF"], ["cnpj", "CNPJ"]]) if (d[k]) { const n = String(d[k]).replace(/\D/g, "").length; if (n !== (k === "cnpj" ? 14 : 11)) e.push(`${nome}: confira os ${k === "cnpj" ? 14 : 11} números`); }
    for (const [k, nome] of [["ouvintes_mensais", "Ouvintes mensais"], ["seguidores_instagram", "Seguidores"], ["integrantes", "Integrantes"], ["cache_minimo", "Cachê mínimo"], ["capacidade", "Capacidade em pé"], ["capacidade_sentado", "Capacidade sentada"]]) {
      if (d[k] != null && d[k] !== "" && !(/^\d+$/.test(String(d[k]).trim()))) e.push(`${nome}: só números, sem sinal de menos`);
    }
    return e;
  }
  const F_ARTISTA = [
    ["Quem é você", [
      ["nome_artistico", "Nome artístico", "text", null, 1],
      ["cidade_base", "Cidade onde mora", "text", null, 1],
      ["estado", "Estado (UF)", "text", null, 1],
      ["generos", "Gêneros e referências", "text", null, 1, "Ex.: MPB, indie, samba. Pode citar até 3 artistas de referência."],
      ["formato_interesse", "Formato que mais te interessa", "select", [["descubra", "Descubra: noite com 3 artistas em ascensão"], ["apresenta", "Apresenta: show próprio numa data"], ["turne", "Turnê: várias cidades da rede"], ["nao_sei", "Ainda não sei"]], 1],
      ["release", "Release curto", "textarea", null, 1, "Pelo menos 200 caracteres. Se você for aprovada, ele vai para a sua página no site do Tranquilo."],
      ["foto", "Link de foto em alta resolução", "url", null, 0, "Drive, Dropbox ou site. Vira a capa da sua página."],
    ]],
    ["Música e público", [
      ["spotify", "Link do Spotify", "url", null, 1],
      ["youtube", "Link do YouTube", "url"],
      ["outro_link", "Outro link (Bandcamp, SoundCloud, clipe, show ao vivo)", "url"],
      ["instagram", "Instagram", "text", null, 1, "@usuario"],
      ["ouvintes_mensais", "Ouvintes mensais no Spotify", "number"],
      ["seguidores_instagram", "Seguidores no Instagram", "number"],
    ]],
    ["Formato e técnica", [
      ["formacao", "Formação", "select", [["solo", "Solo"], ["duo", "Duo"], ["trio", "Trio"], ["banda", "Banda"]], 1],
      ["integrantes", "Pessoas no palco", "number", null, 1],
      ["rider_tipo", "Seu rider", "select", [["circulavel", "Circulável: cabe na estrutura-base da maioria das casas"], ["condicionado", "Condicionado: só algumas casas atendem"], ["especial", "Produção especial: precisa de estrutura específica"]], 1, "O rider define a rota, não muda a sua proposta artística."],
      ["rider_link", "Link do rider técnico", "url"],
      ["tecnico_proprio", "Viaja com técnico de som próprio?", "select", [["nao", "Não"], ["sim", "Sim"]]],
      ["necessidades", "Necessidades técnicas importantes", "textarea"],
    ]],
    ["Circulação", [
      ["cidades_interesse", "Cidades da rede onde quer tocar", "cidades", null, 1],
      ["outras_cidades", "Outras cidades", "text"],
      ["disponibilidade", "Disponibilidade", "text", null, 0, "Ex.: quinta a domingo, a partir de março."],
      ["equipe_viagem", "Quantas pessoas viajam no total", "number"],
    ]],
    ["Condições e contato", [
      ["aceita_bonus", "Topa cachê base com bônus por meta de público?", "select", [["true", "Sim"], ["false", "Prefiro cachê fixo"]], 1, "Modelo usado pelo Tranquilo: um cachê base e um bônus quando o público passa da meta da noite."],
      ["cache_minimo", "Cachê mínimo por show (R$)", "number"],
      ["contato_producao", "Contato de produção ou empresariado", "text", null, 0, "Nome e WhatsApp ou e-mail."],
      ["whatsapp", "Seu WhatsApp", "text", null, 1],
      ["aceite", "Autorizo o Tranquilo a usar estes dados para curadoria e operação da rede.", "check", null, 1],
    ]],
  ];
  // Ficha da unidade, modelo v1 (Gui, Operações, 30/10/2026), Parte 2 "Para preencher": mesmas seções, ordem, títulos,
  // textos de ajuda e opções do documento original (docs/GUI_DOCUMENT_COMPARISON.md). "Sua equipe" vem da Equipe da casa.
  // [título, descrição, campos]; campo = [chave, rótulo, tipo, opções, obrigatório, ajuda, placeholder]
  const SIM_NAO = [["sim", "Sim"], ["nao", "Não"]];
  const F_CASA = [
    ["A casa", "Dados da empresa e do espaço. Usamos para o contrato, a página do evento e a divulgação.", [
      ["nome", "Nome da casa", "text", null, 1], ["cidade_uf", "Cidade/UF", "text", null, 1], ["razao_social", "Razão social", "text"], ["cnpj", "CNPJ", "text"],
      ["inscricao", "Inscrição municipal ou estadual", "text"], ["emite_nf", "A casa emite nota fiscal?", "select", SIM_NAO],
      ["endereco", "Endereço completo", "text", null, 1, "Rua, número, bairro e CEP."], ["complemento", "Complemento e ponto de referência", "text"],
      ["instagram", "Instagram da casa", "text", null, 0, null, "@"], ["site", "Site", "text"], ["telefone", "Telefone da casa", "text"],
      ["funcionamento", "Dias e horários de funcionamento", "text"],
      ["como_chegar", "Como chegar", "textarea", null, 0, "Estacionamento próximo, transporte público e cuidados na rua à noite. Vai na página de cada evento."],
    ]],
    ["Dono A (responsável legal)", "O franqueado: quem assina pela casa e responde pela unidade.", [
      ["dono_nome", "Nome completo", "text", null, 1], ["dono_cpf", "CPF", "text"], ["dono_rg", "RG", "text"], ["dono_nascimento", "Data de nascimento", "text", null, 0, null, "dd/mm/aaaa"],
      ["dono_email", "E-mail", "text"], ["whatsapp", "WhatsApp", "text", null, 1], ["dono_endereco", "Endereço residencial", "text", null, 0, "Usado só no contrato."],
    ], "sensivel"],
    ["Dados para repasses", "A conta que recebe a parte da casa na bilheteria.", [
      ["rep_titular", "Titular da conta", "text"], ["rep_documento", "CPF ou CNPJ do titular", "text"], ["rep_banco", "Banco", "text"],
      ["rep_tipo", "Tipo de conta", "select", [["corrente", "Corrente"], ["poupanca", "Poupança"], ["pagamento", "Pagamento"]]],
      ["rep_agencia", "Agência", "text"], ["rep_conta", "Conta com dígito", "text"], ["rep_pix", "Chave Pix", "text"],
    ], "sensivel"],
    ["O espaço", "O formato Tranquilo é com o público sentado no chão.", [
      ["capacidade_sentado", "Capacidade com público sentado no chão", "number", null, 1, "Pode ser aproximado.", "ex.: 80"], ["capacidade", "Capacidade em pé", "number", null, 0, null, "ex.: 120"],
      ["conforto", "Almofadas, tapetes, cadeiras e mesas disponíveis", "text"], ["palco", "Palco (medidas e altura)", "text", null, 0, "Pode ser aproximado."],
      ["camarim", "Camarim", "select", [["tem", "Tem camarim"], ["espaco", "Não tem, mas há um espaço reservado"], ["nao", "Não tem"]]],
      ["acessibilidade", "Acessibilidade", "multi", [["rampa", "Entrada sem degraus ou com rampa"], ["banheiro", "Banheiro adaptado"], ["cadeirante", "Espaço para cadeira de rodas na plateia"], ["mezanino", "Acesso ao mezanino por rampa ou elevador"], ["vaga", "Vaga de estacionamento acessível"], ["nenhuma", "Nenhuma dessas"]]],
      ["acessibilidade_obs", "Acessibilidade: outras observações", "text", null, 0, null, "Outras observações"],
      ["menores", "Menores de idade", "select", [["permite", "Permite"], ["responsavel", "Permite com responsável legal"], ["nao", "Não permite"]]],
    ]],
    ["Som, luz e palco", "Para montar o rider de cada noite com os artistas.", [
      ["rider", "Já tem o rider técnico da casa? Cole aqui o link ou o texto", "textarea", null, 0, "Se colar o rider, não precisa preencher o resto desta seção."],
      ["som", "Sistema de som", "text", null, 0, "Se puder, marca e modelo das caixas."], ["mesa", "Mesa: marca, modelo e quantos canais", "text", null, 0, null, "Ex.: Yamaha MG16, 16 canais"],
      ["microfones", "A casa tem microfones?", "select", SIM_NAO], ["pedestais", "A casa tem pedestais?", "select", SIM_NAO],
      ["ligar_palco", "O que a casa tem para o artista ligar no palco", "textarea", null, 0, "Cabos, direct box (DI), retornos, amplificadores, banquetas. Conte o que tem e o que falta."],
      ["luz", "Luz", "text", null, 0, "Tem luz de palco? Dá para deixar a plateia em penumbra?"],
    ]],
    ["Bar e cozinha", "", [
      ["bar_cozinha", "Como funcionam o bar e a cozinha", "textarea", null, 0, "O que serve, horário da cozinha, atendimento no balcão ou na mesa."],
      ["ticket_medio", "Ticket médio por pessoa", "text"], ["caixa_sistema", "Sistema de caixa e maquininha", "text", null, 0, "Precisa gerar relatório oficial por noite."],
      ["exclusividade_bebida", "Exclusividade com marca de bebida", "text", null, 0, "Se tiver, qual marca e o que o contrato pede."],
    ]],
    ["Ingressos e agenda", "", [
      ["ticketeira", "A casa usa alguma ticketeira? Tem exclusividade?", "text"],
      ["dias_semana", "Dias da semana que podem receber o Tranquilo", "multi", [["segunda", "Segunda"], ["terca", "Terça"], ["quarta", "Quarta"], ["quinta", "Quinta"], ["sexta", "Sexta"], ["sabado", "Sábado"], ["domingo", "Domingo"]], 0, "As datas exatas são combinadas com a Isa."],
    ]],
    ["Dúvidas sobre o Guia", "Leia o Guia do Franqueado e anote aqui o que ficou em dúvida ou o que você quer conversar com a gente. Ao mandar esta Ficha preenchida, você confirma que leu o Guia.", [
      ["duvidas_guia", "Suas dúvidas", "textarea"],
    ]],
  ];
  // Fichas antigas (antes do modelo v1) usavam outros nomes: o valor aparece no campo novo e nada se perde.
  const F_CASA_ANTIGO = { dono_nome: "responsavel", dono_email: "email_contato", funcionamento: "dias" };
  const valorCasa = (d, k) => { const v = d[k]; if (v != null && v !== "" && !(Array.isArray(v) && !v.length)) return v;
    if (k === "cidade_uf" && d.cidade) return d.estado ? `${d.cidade}/${d.estado}` : d.cidade;
    return F_CASA_ANTIGO[k] ? d[F_CASA_ANTIGO[k]] : v; };
  const CHAVES_FICHA = new Set(F_CASA.flatMap(([, , cs]) => cs.map((c) => c[0])));
  const ROTULO_ANTIGO = { responsavel: "Responsável local", email_contato: "E-mail de contato", cidade: "Cidade", estado: "Estado", dias: "Dias e horários", restricoes: "Restrições de horário e volume", backline: "Backline", aceite_responsabilidades: "Aceite da matriz de responsabilidades" };
  const SOM_ANTIGO = { pa_proprio: "PA e mesa próprios", parceiro: "Parceiro técnico contratado", nao_tem: "Ainda não tenho" };

  const A_VALIDAR_HTML = '<span class="a-validar" title="Ainda não confirmado pelo Gui (Operações)">a validar</span>';
  function campo([k, rot, tipo, opts, obrig, ajuda, ph], d, travado) {
    const v = d[k] ?? "", dis = travado ? " disabled" : "", req = obrig ? ' <span class="muted">*</span>' : "";
    const aj = ajuda ? `<div class="muted" style="font-size:12px;margin-top:3px">${esc(ajuda)}</div>` : "";
    if (tipo === "check") return `<label class="fcheck"><input type="checkbox" data-k="${k}"${String(v) === "true" ? " checked" : ""}${dis}> <span>${esc(rot)}${req}</span></label>`;
    if (tipo === "multi") {
      const sel = new Set(Array.isArray(v) ? v : []);
      return `<div class="fcampo"><b>${esc(rot)}${req}</b><div class="fcidades">${opts.map(([ov, ot]) => `<label><input type="checkbox" data-multi="${k}" value="${ov}"${sel.has(ov) ? " checked" : ""}${dis}> ${esc(ot)}</label>`).join("")}</div>${!Array.isArray(v) && v ? `<div class="muted" style="font-size:12px;margin-top:3px">Resposta anterior: ${esc(v)}</div>` : ""}${aj}</div>`;
    }
    if (tipo === "cidades") {
      const sel = new Set(d[k] || []);
      return `<div class="fcampo"><b>${esc(rot)}${req}</b><div class="fcidades">${R.CIDADES_REDE.map((c) => `<label><input type="checkbox" data-cidade="${esc(c)}"${sel.has(c) ? " checked" : ""}${dis}> ${esc(c)}</label>`).join("")}</div>${aj}</div>`;
    }
    let inp;
    if (tipo === "select") inp = `<select data-k="${k}"${dis}><option value="">Escolha</option>${opts.map(([ov, ot]) => `<option value="${ov}"${String(v) === ov ? " selected" : ""}>${esc(ot)}</option>`).join("")}${v && !opts.some(([ov]) => ov === String(v)) ? `<option value="${esc(v)}" selected>${esc(v)} (resposta anterior)</option>` : ""}</select>`;
    else if (tipo === "textarea") inp = `<textarea data-k="${k}" rows="4"${dis}>${esc(v)}</textarea>`;
    else inp = `<input data-k="${k}" type="${tipo === "url" ? "url" : /(^|_)email/.test(k) ? "email" : "text"}"${/whatsapp|telefone/.test(k) ? ' inputmode="tel" autocomplete="tel"' : /cpf|cnpj|nascimento|agencia|rep_conta|rep_documento/.test(k) ? ' inputmode="numeric"' : ""} value="${esc(v)}"${tipo === "number" ? ` data-num inputmode="numeric" placeholder="${esc(ph || "ex.: 12.000")}"` : ` maxlength="${k === "release" ? 3000 : 300}"${ph ? ` placeholder="${esc(ph)}"` : ""}`}${dis}>`;
    return `<label class="fcampo"><b>${esc(rot)}${req}</b>${inp}${aj}</label>`;
  }
  const formHtml = (def, d, travado) => def.map(([titulo, cs]) => `<section class="card fsec"><h3>${esc(titulo)}</h3><div class="fgrid">${cs.map((c) => campo(c, d, travado)).join("")}</div></section>`).join("");
  // Ficha da casa: seções com descrição; campo vazio continua visível (vazio).
  const formCasa = (d, travado) => F_CASA.map(([titulo, desc, cs]) => (titulo === "Dúvidas sobre o Guia" && S.conta?.perfil.tipo === "casa" ? equipeNaFicha() : "") + `<section class="card fsec"><h3>${esc(titulo)}</h3>${desc ? `<p class="muted" style="margin:-4px 0 10px;font-size:14px">${esc(desc)}</p>` : ""}<div class="fgrid">${cs.map((c) => campo(c, Object.fromEntries([[c[0], valorCasa(d, c[0])]]), travado)).join("")}</div></section>`).join("");
  // Número como as pessoas escrevem no Brasil: "50.000" e "50 mil" são cinquenta mil; "1.200,5" é 1200.
  // Sinal de menos é mantido para o aviso de valor inválido aparecer. Corta em 999.999.999.
  function inteiroBR(v) {
    let t = String(v || "").trim().toLowerCase();
    // Faixa ou valor aproximado ("80 a 100", "uns 80", "80-100"): vale o primeiro número.
    if (!/^-?[\d.,\s]+(mil)?$/.test(t)) { const m = t.match(/-?\d[\d.,]*(\s*mil)?/); t = m ? m[0] : ""; }
    t = t.replace(/\s+/g, "");
    if (!t) return "";
    const mil = /mil$/.test(t); t = t.replace(/mil$/, "");
    const neg = t.startsWith("-");
    t = t.replace(/,\d*$/, "");                       // descarta decimais com vírgula
    if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, ""); // separador de milhar
    else t = t.replace(/\.\d*$/, "");                  // decimal com ponto
    t = t.replace(/\D/g, "");
    if (!t) return "";
    const n = Math.min(999999999, Number(t) * (mil ? 1000 : 1));
    return String(neg ? -n : n);
  }
  function lerForm(raiz) {
    const d = {};
    // Campos numéricos viram inteiros (12000.5 → 12000; acima de 999.999.999 é cortado): o banco calcula a
    // pré-curadoria com números inteiros e recusaria a inscrição inteira por causa de um valor quebrado.
    raiz.querySelectorAll("[data-k]").forEach((el) => { d[el.dataset.k] = el.type === "checkbox" ? String(el.checked) : el.hasAttribute("data-num") ? inteiroBR(el.value) : el.value.trim(); });
    for (const el of raiz.querySelectorAll("[data-multi]")) { const k = el.dataset.multi; d[k] ||= []; if (el.checked) d[k].push(el.value); }
    const cs = [...raiz.querySelectorAll("[data-cidade]")].filter((el) => el.checked).map((el) => el.dataset.cidade);
    if (raiz.querySelector("[data-cidade]")) d.cidades_interesse = cs;
    return d;
  }
  const faltando = (def, d) => def.flatMap((sec) => sec[sec.length > 2 && typeof sec[1] === "string" ? 2 : 1]).filter(([k, , tipo, , obrig]) => obrig && (tipo === "check" ? d[k] !== "true" : tipo === "cidades" ? !(d[k] || []).length : !d[k])).map(([, rot]) => rot);

  // ---------- telas: artista ----------
  const STATUS_INSC = { rascunho: ["", "Rascunho"], em_curadoria: ["b-warn", "Com a curadoria"], ajustes: ["b-serious", "Ajustes pedidos"], aprovada: ["b-good", "Aprovada"], reprovada_pre: ["b-crit", "Não seguiu na pré-curadoria"], reprovada: ["b-crit", "Não seguiu na curadoria"] };
  const STATUS_CASA = { rascunho: ["", "Rascunho"], incompleto: ["b-serious", "Faltam dados mínimos"], em_analise: ["b-warn", "Em análise pela equipe"], ajustes: ["b-serious", "Ajustes pedidos"], habilitada: ["b-good", "Habilitada"], suspensa: ["b-crit", "Suspensa"] };
  const badge = (m, s) => `<span class="badge ${m[s]?.[0] || ""}">${esc(m[s]?.[1] || s)}</span>`;
  const linhaTempo = (etapas, atual) => `<ol class="tempo">${etapas.map((e, i) => `<li class="${i < atual ? "ok" : i === atual ? "agora" : ""}"><i>${i < atual ? "✓" : i + 1}</i><span>${esc(e)}</span></li>`).join("")}</ol>`;
  const medidor = (pc) => `<div class="card"><div class="row"><b>Força da inscrição</b><span><b style="font-size:22px">${+pc.score || 0}</b><span class="muted">/100</span> <span class="badge ${pc.faixa === "Prioridade" ? "b-good" : pc.faixa === "Avaliar" ? "b-warn" : "b-serious"}">${esc(pc.faixa)}</span></span></div>
    <div class="progress" style="margin:10px 0"><i style="width:${Math.max(0, Math.min(100, +pc.score || 0))}%"></i></div>
    <div class="grid g4" style="gap:6px;font-size:13px">${[["completude", "Perfil completo", 20], ["tracao", "Público", 35], ["tecnica", "Rider", 20], ["circulacao", "Cidades da rede", 15], ["condicoes", "Condições", 10]].map(([k, t, max]) => `<div><span class="muted">${t}</span><br><b>${+pc.detalhe?.[k] || 0}</b>/${max}</div>`).join("")}</div>
    ${pc.alertas.length ? `<div style="margin-top:8px">${pc.alertas.map((a) => `<span class="pill">${esc(a)}</span>`).join("")}</div>` : ""}</div>`;

  function eventosDaConta() {
    if (!S.pac) return [];
    const limite = new Date(Date.now() - 5 * 864e5).toISOString().slice(0, 10);
    return S.pac.eventos.filter((e) => !e.z && e.d >= limite).sort((a, b) => a.d.localeCompare(b.d));
  }
  function blocoPassos(e, modelo) {
    const feitos = Object.fromEntries(S.conta.chk.filter((c) => c.evento_id === e.id && c.feito).map((c) => [c.item, true]));
    const fs = funcoesDe();
    const ps = R.passosDaData(modelo, e.d, feitos, hojeIso()).filter((p) => modelo !== "casa" || TQEquipe.vePasso(fs, p.chave));
    const n = ps.filter((p) => p.feito).length, atras = ps.filter((p) => p.atrasado).length;
    const proximo = ps.find((p) => !p.feito && !p.passou);
    const registro = modelo === "casa" && e.d <= hojeIso() && TQEquipe.vePasso(fs, "publico") ? `<button class="btn sm" data-registrar="${e.id}">Registrar a noite</button>` : "";
    return `<div class="card"><div class="row"><div><b>${dt(e.d)} · ${esc(e.c)}</b> <span class="muted">${esc(e.h || "")}</span><div class="muted" style="font-size:13px">${esc(e.a.join(", ") || e.m)}</div></div>
      <div style="text-align:right"><span class="badge ${atras ? "b-crit" : n === ps.length ? "b-good" : "b-warn"}">${n}/${ps.length} feitos${atras ? ` · ${atras} atrasado${atras > 1 ? "s" : ""}` : ""}</span><div style="margin-top:6px;display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap">${registro}${e.l ? `<a class="btn sm" href="${esc(e.l)}" target="_blank" rel="noopener">Ingressos</a>` : ""}</div></div></div>
      ${proximo ? `<div class="alert ${proximo.atrasado ? "crit" : "warn"}" style="margin:10px 0"><b>Agora: ${esc(proximo.titulo)}${proximo.validar ? " " + A_VALIDAR_HTML : ""}</b>${esc(proximo.texto)} <span class="muted">· prazo ${dt(proximo.prazo)}</span></div>` : `<div class="alert good" style="margin:10px 0"><b>Tudo feito para esta data.</b></div>`}
      <details><summary>Ver todos os passos</summary><ul class="passos">${ps.map((p) => `<li class="${p.feito ? "feito" : p.atrasado ? "atrasado" : p.passou ? "passou" : ""}"><label><input type="checkbox" data-passo="${e.id}|${p.chave}"${p.feito ? " checked" : ""}> <span><b>${esc(p.titulo)}</b>${p.validar ? " " + A_VALIDAR_HTML : ""} <span class="muted">· ${p.dias < 0 ? `${-p.dias} dias antes` : p.dias === 0 ? "no dia" : `${p.dias} dia${p.dias > 1 ? "s" : ""} depois`} (${dtc(p.prazo)})${p.passou ? " · não registrado" : ""}</span><br><span class="muted" style="font-size:13px">${esc(p.texto)}</span></span></label></li>`).join("")}</ul></details>${TQOperacao.bloco(e, modelo, fs ? TQEquipe.partesNoite(fs) : null)}${blocoMateriais(e)}</div>`;
  }
  // Contrato da data, modelo geral e arquivos enviados pela própria conta (rider, mapa de palco, fotos, release).
  function blocoMateriais(e) {
    const docs = (S.conta.docs || []).filter((d) => d.evento_id === e.id || (!d.evento_id && d.tipo === "modelo"));
    const digitais = meusContratos().filter((c) => c.evento_id === e.id);
    const meus = (S.conta.arqs || {})[e.id] || [];
    const artista = S.conta.perfil.tipo === "artista";
    return `<details style="margin-top:6px"><summary>Contrato e materiais${docs.length + meus.length + digitais.length ? ` (${docs.length + meus.length + digitais.length})` : ""}</summary>
      <div style="margin-top:10px">${digitais.map((c) => `<div class="row" style="margin-bottom:6px"><span>✍️ ${esc(c.titulo)} · <span class="badge ${TQContrato.situacao(c).classe}">${TQContrato.situacao(c).rotulo}</span></span><button class="btn sm" data-ct-abrir="${c.id}">${c.status === "assinado" ? "Ver" : "Ler e assinar"}</button></div>`).join("")}${docs.length ? docs.map((d) => `<div class="row" style="margin-bottom:6px"><span>${d.tipo === "contrato" ? "📄 Contrato" : d.tipo === "modelo" ? "📝 Modelo" : "📎"} · ${esc(d.titulo)}</span><a class="btn sm" href="${esc(d.url)}" target="_blank" rel="noopener">Abrir</a></div>`).join("") : `<p class="muted" style="font-size:13px;margin:0 0 8px">O contrato desta data aparece aqui quando a equipe anexar.</p>`}
      <b style="font-size:14px">Seus arquivos</b>
      ${meus.length ? `<ul class="passos" style="margin:6px 0">${meus.map((f) => `<li><a href="#" data-arquivo="${esc(f.caminho)}">${esc(f.nome.replace(/^\d+-/, ""))}</a> <span class="muted" style="font-size:12px">· ${f.em ? dt(f.em.slice(0, 10)) : ""}</span></li>`).join("")}</ul>` : `<p class="muted" style="font-size:13px;margin:4px 0">Nenhum arquivo enviado para esta data.</p>`}
      <label class="fcampo" style="margin-top:8px"><b>Enviar ${artista ? "rider, mapa de palco, fotos ou release" : "rider da casa, fotos do palco ou documentos"}</b><input type="file" data-enviar-arquivo="${esc(e.id)}" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.zip,.txt,.mp3"></label>
      <div class="err" role="status" aria-live="polite" id="arqErr-${esc(e.id)}"></div></div></details>`;
  }

  // ---------- contrato automático ----------
  // Equipe: modelos, preparar (campos da equipe preenchidos, o resto fica para a pessoa) e acompanhar.
  function secaoContratos(E, contas, datas, dataTxt, nomeConta) {
    if (E.contr === null || E.modContr === null) return `<div class="alert warn" style="margin-bottom:14px"><b>Contrato automático ainda não está ligado no banco</b>Rode o supabase/schema.sql (parte v7) para usar.</div>`;
    const mods = E.modContr || [], prep = S.cPrep, ed = mods.find((m) => m.id === S.cModEd);
    const lista = (E.contr || []).filter((c) => c.status !== "cancelado" || S.cVerCancel);
    const pre = prep || S.cPre || {};
    // Próximas datas (60 dias) sem contrato digital nem contrato anexado: para ninguém ficar sem.
    const comContrato = new Set([...(E.contr || []).filter((c) => c.status !== "cancelado").map((c) => c.evento_id), ...(E.docs || []).filter((d) => d.tipo === "contrato").map((d) => d.evento_id)]);
    const ate = new Date(Date.now() + 60 * 864e5).toISOString().slice(0, 10), hoje = new Date().toISOString().slice(0, 10);
    const semContrato = datas.filter((e) => e.d >= hoje && e.d <= ate && !comContrato.has(e.id));
    const contaDe = (e) => contas.find((p) => p.vinculo_nome && (e.a || []).some((a) => a.toLowerCase() === p.vinculo_nome.toLowerCase()));
    return `<div class="card" id="contrAuto"><h3 style="margin-top:0">Contrato para assinar no site</h3>
      <p class="muted" style="margin:0 0 10px;font-size:14px">Escolha a conta, a data e o modelo. O site preenche o que já sabe (nome, data, cidade, casa); você completa o cachê e o que mais souber. O que ficar em branco a pessoa preenche antes de assinar (CPF, endereço, Pix…).</p>
      <div class="grid g3">
        <label class="fcampo"><b>Conta</b><select id="ctConta"><option value="">Escolha a artista ou casa</option>${contas.map((p) => `<option value="${p.id}"${pre.conta === p.id ? " selected" : ""}>${esc(p.vinculo_nome || p.nome || p.email)} · ${p.tipo}</option>`).join("")}</select></label>
        <label class="fcampo"><b>Data</b><select id="ctEv"><option value="">Sem data específica</option>${datas.map((e) => `<option value="${esc(e.id)}"${pre.ev === e.id ? " selected" : ""}>${dt(e.d)} · ${esc(e.c)} · ${esc(e.a.join(", ") || e.m)}</option>`).join("")}</select></label>
        <label class="fcampo"><b>Modelo</b><select id="ctMod"><option value="">${mods.length ? "Escolha o modelo" : "Cadastre um modelo abaixo"}</option>${mods.map((m) => `<option value="${m.id}"${prep?.modelo === m.id ? " selected" : ""}>${esc(m.nome)}</option>`).join("")}</select></label>
      </div><div class="barra-acoes"><button class="btn" id="ctPrep">Preparar contrato</button></div>
      ${prep ? `<div style="margin-top:12px;border-top:1px solid var(--line);padding-top:12px">
        <label class="fcampo"><b>Nome do contrato</b><input id="ctTit" maxlength="160" value="${esc(prep.titulo)}"></label>
        <p style="margin:10px 0 6px"><b>Campos do modelo</b> <span class="muted" style="font-size:13px">· em branco = a pessoa preenche</span></p>
        <div class="grid g2">${prep.campos.map((c) => `<label class="fcampo"><b>${esc(c.rotulo)}</b><input data-ct-campo="${esc(c.chave)}" maxlength="300" value="${esc(prep.valores[c.chave] || "")}" placeholder="a pessoa preenche"></label>`).join("") || `<p class="muted">Este modelo não tem campos: o texto vai como está.</p>`}</div>
        <div class="barra-acoes"><button class="btn pri" id="ctEnviar">Enviar para assinatura</button><button class="btn" id="ctDescartar">Descartar</button></div></div>` : ""}
      <div class="err" role="status" aria-live="polite" id="ctErr"></div>
      <details style="margin-top:12px"${S.cModAberto ? " open" : ""}><summary>Modelos de contrato (${mods.length})</summary>
        <p class="muted" style="font-size:13px">Cole o texto do modelo do Notion. Trechos como <code>[PREENCHER NOME COMPLETO]</code> viram campos. Para o site preencher sozinho, use <code>{{artista}}</code>, <code>{{data}}</code>, <code>{{cidade}}</code>, <code>{{casa}}</code>, <code>{{evento}}</code>, <code>{{cache}}</code> e <code>{{horario}}</code>.</p>
        ${mods.map((m) => `<div class="row" style="margin-bottom:6px"><span>${esc(m.nome)} <span class="muted" style="font-size:12px">· ${TQContrato.campos(m.texto).campos.length} campos</span></span><button class="btn sm" data-ct-mod-editar="${m.id}">Editar</button></div>`).join("")}
        <label class="fcampo"><b>${ed ? "Editar modelo" : "Novo modelo"}: nome</b><input id="mcNome" maxlength="120" value="${esc(ed?.nome || "")}" placeholder="ex.: Contrato Apresenta — artista principal"></label>
        <label class="fcampo"><b>Texto do modelo</b><textarea id="mcTexto" rows="10" style="width:100%;font:14px/1.5 var(--sans)">${esc(ed?.texto || "")}</textarea></label>
        <div class="barra-acoes"><button class="btn" id="mcOk">${ed ? "Salvar alterações" : "Salvar modelo"}</button>${ed ? `<button class="btn" data-ct-mod-editar="">Cancelar edição</button>` : ""}</div><div class="err" role="status" aria-live="polite" id="mcErr"></div>
        <p class="muted" style="font-size:12px;margin:4px 0 0">Mudar o modelo não muda contratos já enviados.</p>
      </details></div>
      ${semContrato.length ? `<h2>Datas dos próximos 60 dias sem contrato (${semContrato.length})</h2><p class="sub">Nenhum contrato gerado nem anexado para estas datas.</p><div class="list">${semContrato.slice(0, 30).map((e) => { const c = contaDe(e); return `<div class="row card" style="padding:10px 14px"><span><b>${dt(e.d)} · ${esc(e.c)}</b> <span class="muted">${esc((e.a || []).join(", ") || e.m)}${e.h ? " · " + esc(e.h) : ""}</span>${c ? "" : ` <span class="muted" style="font-size:12px">· sem conta ligada no site</span>`}</span><button class="btn sm" data-ct-pre="${esc(e.id)}|${c ? c.id : ""}">Preparar contrato</button></div>`; }).join("")}</div>` : ""}
      <h2>Contratos para assinar</h2>${tabela("contr", [
        { t: "Contrato", v: (c) => c.titulo, h: (c) => `<b>${esc(c.titulo)}</b>` },
        { t: "Conta", v: (c) => nomeConta[c.user_id] || "–" },
        { t: "Data", v: (c) => c.evento_id || "", h: (c) => c.evento_id ? esc(dataTxt(c.evento_id)) : "–" },
        { t: "Situação", v: (c) => c.status + (c.assinado_em || ""), h: (c) => { const si = TQContrato.situacao(c); return `<span class="badge ${si.classe}">${si.rotulo}</span>${c.assinado_em ? `<div class="muted" style="font-size:12px">${esc(c.assinado_nome)} · ${new Date(c.assinado_em).toLocaleString("pt-BR")}</div>` : si.falta ? `<div class="muted" style="font-size:12px">falta: ${esc(si.falta.map((x) => x.rotulo).join(", "))}</div>` : ""}`; } },
        { t: "", v: () => 0, h: (c) => `<div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn sm" data-ct-ver="${c.id}">${c.status === "assinado" ? "Ver e baixar" : "Ver"}</button>${c.status === "enviado" ? `<button class="btn sm" data-ct-cancelar="${c.id}">Cancelar</button>` : ""}</div>` },
      ], lista, { i: 3, dir: 1 }, vazio("Nenhum contrato gerado ainda", "Prepare o primeiro contrato acima: ele aparece na área da artista ou da casa para assinar.", "", "documentos"))}`;
  }
  // Artista e casa: contratos pendentes no topo do passo a passo e a tela de leitura e assinatura.
  const meusContratos = () => (S.conta.contr || []).filter((c) => c.status !== "cancelado");
  function avisoContratos() {
    const pend = meusContratos().filter((c) => c.status === "enviado");
    return pend.map((c) => `<div class="alert warn" style="margin-bottom:12px"><b>Contrato para assinar: ${esc(c.titulo)}</b>Leia, complete os seus dados e assine aqui mesmo, sem imprimir.<div class="barra-acoes" style="margin-top:10px"><button class="btn pri" data-ct-abrir="${c.id}">Ler e assinar →</button></div></div>`).join("");
  }
  function telaContrato(c) {
    const si = TQContrato.situacao(c), assinado = c.status === "assinado";
    const mostra = assinado ? c.texto_final : TQContrato.preencher(c.texto, c.campos, Object.fromEntries(c.campos.map((x) => [x.chave, String(c.dados?.[x.chave] ?? "").trim() || `[${x.rotulo}: preencha acima]`])));
    const completo = !si.falta;
    if (!assinado) setTimeout(ligarLeitura, 0);
    return `<button class="btn sm" data-ct-voltar>← Voltar</button><div class="tag" style="margin-top:12px">Contrato</div><h1>${esc(c.titulo)}</h1>
      ${assinado ? `<div class="alert good"><b>Contrato assinado</b>Por ${esc(c.assinado_nome)} em ${new Date(c.assinado_em).toLocaleString("pt-BR")}. Código de verificação: ${esc(c.hash.slice(0, 12))}…<div class="barra-acoes" style="margin-top:10px"><button class="btn" data-ct-ver="${c.id}">Baixar ou imprimir</button></div></div>`
        : `<p class="sub">São três passos: ${c.campos.length ? "complete os seus dados, " : ""}leia o contrato até o fim e assine digitando o seu nome completo.</p>`}
      ${!assinado && c.campos.length ? `<div class="card"><h3 style="margin-top:0">1. Seus dados</h3><div class="grid g2">${c.campos.map((x) => `<label class="fcampo"><b>${esc(x.rotulo)}</b><input data-ct-dado="${esc(x.chave)}" maxlength="300" value="${esc(c.dados?.[x.chave] || "")}"></label>`).join("")}</div>
        <div class="barra-acoes"><button class="btn${completo ? "" : " pri"}" id="ctSalvarDados">Salvar dados</button></div><p class="muted" style="font-size:13px;margin:4px 0 0">Os dados entram no texto do contrato logo abaixo.</p></div>` : ""}
      <div class="card"><h3 style="margin-top:0">${assinado ? "Texto assinado" : `${c.campos.length ? "2" : "1"}. Leia o contrato inteiro`}</h3>
        <div id="ctTexto" class="contr-texto" tabindex="0" aria-label="Texto do contrato">${esc(mostra)}</div>
        ${assinado ? "" : `<p class="muted" id="ctLido" style="font-size:13px;margin:8px 0 0">${!completo ? "Complete e salve os seus dados para liberar a leitura." : c.lido_fim_em ? "✓ Você leu até o fim." : "Role o texto até o fim para liberar a assinatura."}</p>`}</div>
      ${assinado ? "" : `<div class="card"><h3 style="margin-top:0">${c.campos.length ? "3" : "2"}. Assinar</h3>
        <label class="fcampo"><b>Seu nome completo</b><input id="ctNome" autocomplete="name" maxlength="160" value="${esc(S.conta.perfil.nome || "")}"></label>
        <label class="fcheck"><input type="checkbox" id="ctConcordo"> <span>Li o contrato inteiro e concordo com os termos. Entendo que digitar o meu nome aqui vale como a minha assinatura.</span></label>
        <div class="barra-acoes"><button class="btn pri" id="ctAssinar"${completo && c.lido_fim_em ? "" : " disabled"}>Assinar contrato</button></div>
        <p class="muted" style="font-size:12px;margin:6px 0 0">Ficam registrados o texto exato, a data e a hora, o seu IP e o navegador. Você e a equipe têm acesso à mesma cópia, aqui no site.</p></div>`}
      <div class="err" role="status" aria-live="polite" id="ctErr"></div>`;
  }
  // Marca "leu até o fim" quando o texto chega ao fim da rolagem (ou cabe inteiro na tela).
  function ligarLeitura() {
    const el = $("#ctTexto"), c = meusContratos().find((x) => x.id === S.contrAberto);
    if (!el || !c || c.status !== "enviado" || c.lido_fim_em || TQContrato.situacao(c).falta) return;
    const fim = async () => {
      if (el.scrollTop + el.clientHeight < el.scrollHeight - 8 || el.dataset.lido) return;
      el.dataset.lido = "1"; el.removeEventListener("scroll", fim);
      try { await api.contratoLido(c.id); c.lido_fim_em = new Date().toISOString(); TQDiario.registrar("contrato_lido", { contrato: c.id });
        const m = $("#ctLido"); if (m) m.textContent = "✓ Você leu até o fim."; const b = $("#ctAssinar"); if (b) b.disabled = false; }
      catch (e) { delete el.dataset.lido; const m = $("#ctErr"); if (m) m.textContent = traduz(e.message); }
    };
    el.addEventListener("scroll", fim, { passive: true }); fim();
  }
  function abrirImpressao(c) {
    const w = window.open(URL.createObjectURL(new Blob([TQContrato.paginaImpressao(c, esc)], { type: "text/html;charset=utf-8" })), "_blank");
    if (!w) alert("O navegador bloqueou a janela. Permita janelas deste site e tente de novo.");
  }

  const TELAS = {
    ficha: () => telaArea("ficha"), operacoes: () => telaArea("operacoes"), datas_casa: () => telaArea("datas_casa"), marketing: () => telaArea("marketing"),
    passos() {
      const p = S.conta.perfil;
      const aberto = S.contrAberto && meusContratos().find((c) => c.id === S.contrAberto);
      if (aberto) return telaContrato(aberto);
      return avisoContratos() + (p.tipo === "casa" ? passosCasa() : passosArtista());
    },
    inscricao() {
      const i = S.conta.insc, d = i?.dados || {}, trav = i && !["rascunho", "ajustes"].includes(i.status);
      return `<div class="tag">Inscrição de artista</div><h1>${trav ? "Sua inscrição" : "Inscreva-se na rede"}</h1>
      <p class="sub">${trav ? "Sua inscrição está com a equipe. Você pode consultar as respostas, mas só edita de novo se a curadoria pedir ajustes." : "Leva uns 10 minutos. O rascunho fica salvo e você pode voltar depois. Ao enviar, a pré-curadoria é automática e o resultado aparece na hora."}</p>
      ${i?.parecer && i.status === "ajustes" ? `<div class="alert warn"><b>A curadoria pediu ajustes</b>${esc(i.parecer)}</div>` : ""}
      <div id="medidor">${medidor(R.preCuradoria(d))}</div>
      <div id="form" style="display:flex;flex-direction:column;gap:12px;margin-top:12px">${formHtml(F_ARTISTA, d, trav)}</div>
      ${trav ? "" : `<div class="err" role="status" aria-live="polite" id="ferr"></div><div class="barra-acoes"><button class="btn" id="salvar">Salvar rascunho</button><button class="btn pri" id="enviar">Enviar para a curadoria</button></div>`}`;
    },
    cadastro_casa() {
      const c = S.conta.casa, d = c?.dados || {}, parceira = S.casaParceira ?? !!c?.ja_parceira;
      // Só casas com nome real; quem não se acha usa "Minha casa não aparece".
      const casasConhecidas = (S.pub.casas || []).filter((x) => !/^Casa (em|da rede)\b/.test(x.nome)).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
      // Ficha enviada ao Tranquilo não muda em silêncio: a casa pede a atualização e a Central confere.
      const enviada = !!c && ["em_analise", "habilitada", "suspensa"].includes(c.status), pedindo = enviada && S.fichaPedido, travado = enviada && !pedindo;
      // "Já deixamos preenchido o que você nos contou" (Ficha v1): o que a base Casas do Notion tem e a ficha ainda não.
      const sug = enviada ? {} : Object.fromEntries(Object.entries(S.pac?.ficha_notion || {}).filter(([k, v]) => CHAVES_FICHA.has(k) && v != null && v !== "" && [null, undefined, ""].includes(valorCasa(d, k))));
      const sols = S.conta.sol || [], aberto = sols.find((x) => x.status === "pendente");
      const ultimaRecusa = [...sols].filter((x) => x.status !== "cancelada").sort((x, y) => String(y.criado_em).localeCompare(String(x.criado_em)))[0];
      const pend = c?.pendencias || R.pendenciasCasa(d);
      const rotulo = (k) => F_CASA.flatMap(([, , cs]) => cs).find((x) => x[0] === k)?.[1] || ROTULO_ANTIGO[k] || k;
      const mostra = (k, v) => Array.isArray(v) ? v.join(", ") : k === "som" && SOM_ANTIGO[v] ? SOM_ANTIGO[v] : v === "true" ? "Sim" : v === "false" ? "Não" : String(v);
      const usadosNaFicha = new Set(Object.entries(F_CASA_ANTIGO).filter(([novo]) => !d[novo]).map(([, ant]) => ant).concat(d.cidade_uf ? [] : ["cidade", "estado"]));
      const extras = Object.entries(d).filter(([k, v]) => !CHAVES_FICHA.has(k) && !usadosNaFicha.has(k) && v != null && v !== "" && !(Array.isArray(v) && !v.length));
      return `<div class="tag">Ficha da Casa</div><h1>${esc(d.nome || S.conta.perfil.vinculo_nome || "Ficha da unidade")}</h1>
      <p class="sub">Esta Ficha é só da sua casa. Primeiro, um resumo de como a sua unidade vai funcionar. Depois, os dados da casa e da equipe, junto com as suas dúvidas sobre o Guia do Franqueado. ${enviada ? "A ficha já está com o Tranquilo: para mudar algo, toque em Solicitar atualização." : "O que você preenche fica salvo; pode parar e voltar depois."}</p>
      <div class="row" style="margin-bottom:10px"><span>${c ? badge(STATUS_CASA, c.status) : '<span class="badge">ainda não enviada</span>'}</span><button class="btn sm" data-ir="materiais">Abrir o Guia do Franqueado ↗</button></div>
      ${c?.parecer ? `<div class="alert ${c.status === "ajustes" ? "warn" : ""}"><b>Mensagem da equipe</b>${esc(c.parecer)}</div>` : ""}
      ${c?.status === "habilitada" && R.pendenciasCasa(d).habilitacao.includes(R.NOVA_EXIGENCIA) ? `<div class="alert warn"><b>Nova exigência: ${esc(R.NOVA_EXIGENCIA.toLowerCase())}</b>O público do Tranquilo assiste sentado no chão. A casa continua habilitada; informe a capacidade por Solicitar atualização.</div>` : ""}
      ${aberto ? `<div class="alert warn"><b>Pedido de atualização com a Central desde ${dt(aberto.criado_em.slice(0, 10))}</b>Campos: ${esc(Object.keys(aberto.proposto).map(rotulo).join(", "))}. A ficha muda quando a Central aprovar.<div class="barra-acoes" style="margin-top:8px"><button class="btn sm" data-sol-cancelar="${aberto.id}">Cancelar o pedido</button></div></div>` : ""}
      ${ultimaRecusa?.status === "recusada" ? `<div class="alert crit"><b>Pedido de atualização recusado em ${dt(String(ultimaRecusa.revisado_em || ultimaRecusa.criado_em).slice(0, 10))}</b>${ultimaRecusa.resposta ? "Resposta da Central: " + esc(ultimaRecusa.resposta) : "A Central não deixou resposta."} A ficha continua como estava.</div>` : ""}
      ${pedindo ? `<div class="alert warn"><b>Você está pedindo uma atualização</b>Altere os campos abaixo e toque em "Enviar pedido de atualização", no fim da página. A ficha só muda quando a Central aprovar.${aberto ? " Este pedido substitui o que já está com a Central: as mudanças dele já estão nos campos." : ""}</div>` : ""}
      ${parteUmCasa(c)}
      <h2>Parte 2 · Para preencher</h2>
      ${Object.keys(sug).length ? `<div class="alert"><b>Já deixamos preenchido o que temos da sua casa</b>Confira e corrija se precisar: ${esc(Object.keys(sug).map((k) => F_CASA.flatMap(([, , cs]) => cs).find((x) => x[0] === k)?.[1] || k).join(", "))}. Só fica salvo na sua Ficha quando você salvar ou enviar.</div>` : ""}
      <div class="grid g3" style="margin:0 0 12px">${[["habilitacao", "Falta para habilitar", "b-crit"], ["match", "Falta para montar a noite", "b-warn"], ["enriquecimento", "Deixa a ficha completa", ""]].map(([k, t, cl]) => `<div class="card"><b>${t}</b> ${A_VALIDAR_HTML} <span class="badge ${cl}">${pend[k].length}</span><div class="muted" style="font-size:13px;margin-top:4px">${pend[k].map(esc).join(" · ") || "Nada pendente"}</div></div>`).join("")}</div>
      ${enviada ? "" : `<div class="card"><b>A casa já recebe o Tranquilo?</b><div class="filters" style="margin-bottom:0"><label class="fcheck"><input type="radio" name="parceira" value="nao"${!parceira ? " checked" : ""}> Casa nova na rede</label><label class="fcheck"><input type="radio" name="parceira" value="sim"${parceira ? " checked" : ""}> Já recebo datas do Tranquilo</label>
      ${parceira ? `<select id="casaNotion" aria-label="Escolha a sua casa"><option value="">Escolha a casa</option>${casasConhecidas.map((x) => `<option value="${x.id}"${c?.notion_casa_id === x.id ? " selected" : ""}>${esc(x.nome)} · ${esc(x.cidade)}</option>`).join("")}<option value="outra">Minha casa não aparece na lista</option></select>` : ""}</div></div>`}
      <div id="form" data-modo="${pedindo ? "pedido" : travado ? "leitura" : "edicao"}" style="display:flex;flex-direction:column;gap:12px;margin-top:12px">${formCasa(pedindo && aberto ? { ...d, ...aberto.proposto } : { ...d, ...sug }, travado || c?.status === "suspensa")}</div>
      ${extras.length ? `<section class="card fsec" style="margin-top:12px"><h3>Outras informações já enviadas</h3><p class="muted" style="margin:-4px 0 10px;font-size:14px">Respostas de uma versão anterior da ficha. Ficam guardadas aqui.</p><dl class="kv">${extras.map(([k, v]) => `<dt>${esc(rotulo(k))}</dt><dd>${esc(mostra(k, v))}</dd>`).join("")}</dl></section>` : ""}
      <div class="err" role="status" aria-live="polite" id="ferr"></div>
      ${!enviada ? `<div class="barra-acoes"><button class="btn" id="salvar">Salvar rascunho</button><button class="btn pri" id="enviar">Enviar a Ficha ao Tranquilo</button><button class="btn" id="copiarFicha">Copiar respostas</button></div>`
        : pedindo ? `<label class="fcampo" style="margin-top:12px"><b>O que mudou (opcional)</b><textarea id="solMsg" rows="2" maxlength="1000"></textarea></label><div class="barra-acoes"><button class="btn pri" id="solEnviar">Enviar pedido de atualização</button><button class="btn" id="solVoltar">Cancelar</button></div>`
        : c.status === "suspensa" ? "" : `<div class="barra-acoes"><button class="btn pri" id="solPedir">Solicitar atualização</button><button class="btn" id="copiarFicha">Copiar respostas</button></div>`}
      ${sols.length ? `<details style="margin-top:14px"><summary>Pedidos de atualização (${sols.length})</summary><ul class="passos">${sols.map((x) => `<li><b>${dt(x.criado_em.slice(0, 10))}</b> · ${esc({ pendente: "com a Central", aprovada: "aprovado", recusada: "recusado", cancelada: "cancelado" }[x.status])} · ${esc(Object.keys(x.proposto).map(rotulo).join(", "))}${x.resposta ? `<br><span class="muted" style="font-size:13px">Resposta: ${esc(x.resposta)}</span>` : ""}</li>`).join("")}</ul></details>` : ""}
      <p class="muted" style="font-size:13px;margin-top:14px">Esta Ficha resume as condições da sua unidade. Em qualquer diferença, vale o contrato assinado.</p>`;
    },
    conta() {
      const p = S.conta.perfil;
      const podeVincular = !p.codigo_acesso && !p.vinculo_pedido && !S.pac;
      return `<div class="tag">Conta</div><h1>${esc(p.nome || p.email)}</h1>
      <div class="card"><dl class="kv"><dt>E-mail</dt><dd>${esc(p.email)}</dd><dt>Perfil</dt><dd>${ROTULO[p.tipo]}${funcoesDe() ? ` · ${esc(nomesFuncoes(funcoesDe()))}` : ""}</dd><dt>Vínculo na rede</dt><dd>${p.vinculo_nome ? `${esc(p.vinculo_nome)} <span class="badge b-good">métricas liberadas</span>` : p.vinculo_pedido_nome ? `${esc(p.vinculo_pedido_nome)} <span class="badge b-warn">aguardando a equipe confirmar</span> <span class="muted" style="font-size:13px">as métricas já aparecem enquanto isso</span>` : `<span class="muted">ainda sem vínculo</span>`}</dd>
      ${!REAL ? `<dt>Modo</dt><dd><span class="badge b-warn">demonstração</span> os dados ficam só neste navegador</dd>` : ""}</dl></div>
      ${podeVincular ? `<h2>Tenho um código de acesso</h2><p class="sub">Se a equipe já te mandou um código (aquele XXXX-XXXX-XXXX), cole aqui para ligar esta conta ao seu histórico e às métricas da rede. Basta fazer isso uma vez.${["equipe", "adm"].includes(p.tipo) ? " Para a equipe e a administração, use o código interno de vocês." : ""}</p><div class="card login"><input id="vcod" placeholder="XXXX-XXXX-XXXX" autocomplete="off"><div class="err" role="status" aria-live="polite" id="verr"></div><button class="btn pri" id="vok">Vincular</button></div>` : ""}
      <div style="margin-top:20px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-rever-tutorial>Ver o tutorial de novo</button><button class="btn" id="sairConta">Sair da conta</button></div>`;
    },
    // ---------- equipe da casa por função e trilha da nova casa ----------
    equipe_casa() {
      const L = S.conta.equipe, dono = !funcoesDe(), p = S.conta.perfil;
      if (!p.vinculo_nome) return `<div class="tag">Equipe da casa</div><h1>Quem faz a noite</h1>${vazio("A conta ainda não está ligada à casa", "Quando a equipe do Tranquilo ligar esta conta à sua casa (pelo convite ou em Pessoas), você monta a equipe aqui.", "", "equipe_casa")}`;
      if (L === undefined) { carregarEquipeCasa(); return carregando("a equipe da casa"); }
      if (L === null) return faltaSchema("Equipe da casa");
      const cob = TQEquipe.cobertura(L), ed = dono && L.find((m) => m.id === S.eqcEd);
      const ACESSO = { ativo: ["b-good", "com acesso"], convidado: ["b-warn", "convite enviado"], sem_convite: ["", "sem acesso à plataforma"], sem_email: ["", "sem e-mail"] };
      const pessoa = (m) => `<div class="card row"><span><b>${esc(m.nome)}</b>${m.reserva ? ' <span class="badge">reserva</span>' : ""} ${(m.funcoes || []).map((f) => `<span class="pill">${esc(TQEquipe.NOME[f] || f)}</span>`).join("")}
        <div class="muted" style="font-size:12px">${esc([m.whatsapp, m.email].filter(Boolean).join(" · ") || "sem contato")}${dono ? ` · <span class="badge ${ACESSO[m.acesso]?.[0] || ""}">${ACESSO[m.acesso]?.[1] || ""}</span>` : ""}</div>
        ${TQEquipe.funcoesAvisos(m.funcoes).map((a) => `<div class="muted" style="font-size:12px">⚠️ ${esc(a)}</div>`).join("")}</span>
        ${dono ? `<span style="display:flex;gap:6px;flex-wrap:wrap">${(m.funcoes || []).includes("bar") ? `<span class="muted" style="font-size:12px">Bar sem acesso ao portal ${A_VALIDAR_HTML}</span>` : m.email && m.acesso !== "ativo" ? `<button class="btn sm" data-eqc-convidar="${m.id}">${m.acesso === "convidado" ? "Reenviar convite" : "Dar acesso"}</button>` : ""}<button class="btn sm" data-eqc-editar="${m.id}">Editar</button><button class="btn sm" data-eqc-remover="${m.id}">Tirar da equipe</button></span>` : ""}</div>`;
      return `<div class="tag">Equipe da casa</div><h1>Quem faz a noite</h1>
      <p class="sub">${dono ? "Você monta a equipe e responde por ela: a Central não contrata nem escala. Quem tiver e-mail ganha acesso à plataforma só com o que é da função dela." : "A equipe da casa, montada pelo responsável. Só ele muda as funções."} Pelo Guia do Franqueado: as 4 cadeiras (você, o Líder Local, o anfitrião e a social media), o técnico de som e os operadores de porta, cada função com uma pessoa diferente (só você pode ser também o Líder Local), e 1 reserva para a equipe da noite.</p>
      <div class="alert ${cob.completa ? "good" : "warn"}"><b>${cob.completa ? "Equipe completa" : "Falta completar a equipe"}</b>${cob.completa ? "Tripé (Líder Local, anfitrião e social media), técnico de som e porta, com reserva." : esc([...cob.pend, ...cob.erros].join(" · "))}</div>
      <div class="grid g4" style="margin:12px 0">${TQEquipe.FUNCOES.map(([k, n, o, q]) => { const quem = L.filter((m) => !m.reserva && (m.funcoes || []).includes(k)).map((m) => m.nome);
        return `<div class="card"><b>${esc(n)}</b>${TQEquipe.TRIPE.includes(k) ? ' <span class="badge">tripé</span>' : ""}<div style="margin:4px 0">${quem.length ? esc(quem.join(", ")) : '<span class="badge b-warn">falta</span>'}</div><div class="muted" style="font-size:12px">${esc(o)} <b>Quando:</b> ${esc(q)}.</div></div>`; }).join("")}</div>
      <h2>Pessoas (${L.length})</h2>${L.length ? `<div class="list">${L.map(pessoa).join("")}</div>` : `<p class="muted">Ninguém cadastrado ainda.</p>`}
      ${dono ? `<div class="card" id="eqcForm" style="margin-top:14px"><h3 style="margin-top:0">${ed ? "Editar pessoa" : "Adicionar pessoa"}</h3>
        <div class="fgrid"><label class="fcampo"><b>Nome</b><input id="eqcNome" maxlength="120" value="${esc(ed?.nome || "")}"></label><label class="fcampo"><b>WhatsApp</b><input id="eqcWa" inputmode="tel" maxlength="30" value="${esc(ed?.whatsapp || "")}"></label>
        <label class="fcampo"><b>E-mail (opcional, para dar acesso)</b><input id="eqcEmail" type="email" maxlength="160" value="${esc(ed?.email || "")}"></label>
        <label class="fcampo"><b>Instagram (anfitrião e social media)</b><input id="eqcInsta" maxlength="80" placeholder="@" value="${esc(ed?.instagram || "")}"></label>
        <label class="fcampo"><b>Observação</b><input id="eqcObs" maxlength="300" value="${esc(ed?.observacao || "")}"></label></div>
        <b style="font-size:14px">Função</b><div class="filters" style="margin:6px 0">${TQEquipe.FUNCOES.map(([k, n]) => `<label class="fcheck"><input type="radio" name="eqcFuncao" data-eqc-funcao="${k}"${ed?.funcoes?.includes(k) ? " checked" : ""}> ${esc(n)}</label>`).join("")}</div>
        <label class="fcheck"><input type="checkbox" id="eqcReserva"${ed?.reserva ? " checked" : ""}> <span>Reserva: cobre quem faltar na semana do evento</span></label>
        <p class="muted" style="font-size:12px;margin:6px 0 0">Cada função é de uma pessoa diferente. Se você mesmo for o Líder Local, cadastre-se sem e-mail (você já tem a conta da casa). O bar é responsabilidade sua; o Tranquilo não fala com a equipe de bar.</p>
        <div class="err" role="status" aria-live="polite" id="eqcErr"></div><div class="barra-acoes"><button class="btn pri" id="eqcOk">${ed ? "Salvar" : "Adicionar à equipe"}</button>${ed ? `<button class="btn" data-eqc-editar="">Cancelar</button>` : ""}</div></div>` : ""}`;
    },
    minha_funcao() {
      const fs = funcoesDe() || [];
      return `<div class="tag">Minha função</div><h1>${esc(nomesFuncoes(fs))}</h1>
      <p class="sub">Você faz parte da equipe de ${esc(S.conta.perfil.vinculo_nome || "uma casa da rede")}. Aqui está o que é seu: o que ler uma vez, o que chega a cada show e o que você devolve. Quem muda a sua função é o responsável da casa.</p>
      ${fs.map((f) => { const d = TQEquipe.PERFIL[f], F = TQEquipe.FUNCOES.find((x) => x[0] === f); if (!d || !F) return "";
        return `<div class="card" style="margin-bottom:12px"><h3 style="margin-top:0">${esc(F[1])}</h3><p class="muted" style="margin:0 0 8px">${esc(F[2])} <b>Quando:</b> ${esc(F[3])}.</p>
        <div class="grid g3">${[["Leia uma vez", d.le], ["A cada show", d.show], ["Você devolve", d.devolve]].map(([t, xs]) => `<div><b>${t}</b><ul class="passos">${xs.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>`).join("")}</div></div>`; }).join("")}
      <div class="alert"><b>O que não muda em nenhuma casa</b>Silêncio durante o show, público sentado, formato enxuto (voz e um instrumento, duo ou trio), som confortável e bar longe do palco.</div>
      <div class="barra-acoes"><button class="btn pri" data-ir="passos">Ver os passos de cada data →</button></div>`;
    },
    trilha() {
      const T = S.conta.trilha;
      if (!T) return `<div class="tag">Treinamento da casa</div><h1>Treinamento da nova casa</h1>${vazio("O treinamento ainda não começou", "Quando a Central iniciar a habilitação da sua casa, os 7 dias úteis aparecem aqui.", "", "trilha")}`;
      if (S.conta.equipe === undefined && S.conta.perfil.vinculo_nome) carregarEquipeCasa();
      const feitos = Object.fromEntries(Object.entries(T.marcos || {}).map(([k, em]) => [k, { em }]));
      const A = TQEquipe.andamento(T.inicio, feitos, hojeIso()), cob = S.conta.equipe ? TQEquipe.cobertura(S.conta.equipe) : null;
      const linha = (e) => `<li class="${e.feito ? "feito" : e.atrasado ? "atrasado" : ""}"><label>${e.casa ? `<input type="checkbox" data-trilha-casa="${e.chave}"${e.feito ? " checked" : ""}>` : `<span aria-hidden="true" style="width:16px;display:inline-block">${e.feito ? "✓" : "○"}</span>`} <span><b>${esc(e.titulo)}</b>${TQEquipe.A_VALIDAR.has(e.chave) ? " " + A_VALIDAR_HTML : ""} <span class="muted">· ${e.casa ? "a casa (você marca)" : `${esc(e.quem)}, ${esc(TQEquipe.AREA[e.quem] || "")}`}${e.prazo ? ` · até ${dtc(e.prazo)}` : ""}${e.atrasado ? " · atrasado" : ""}</span>${e.texto ? `<br><span class="muted" style="font-size:13px">${esc(e.texto)}</span>` : ""}</span></label></li>`;
      return `<div class="tag">Treinamento da casa</div><h1>${A.fechada ? "Treinamento concluído" : "Seu treinamento em 7 dias úteis"}</h1>
      <p class="sub">Nos 7 dias, a casa conversa com todas as áreas do Tranquilo para conhecer os detalhes e conseguir orientar o time que vai montar. Cada pessoa da Central fala com a casa no máximo dois dias: um para enviar, outro para responder as dúvidas. A casa nunca recebe duas pessoas falando do mesmo assunto. Marque aqui o que é da casa.</p>
      <div class="alert ${A.atrasadas ? "warn" : A.fechada ? "good" : ""}"><b>${A.feitas} de ${A.total} etapas · ${A.fechada ? "a casa conhece as quatro áreas e assume a operação" : `agora com ${A.com === "casa" ? "você" : esc(A.com)}`}</b>${A.proxima ? `${esc(A.proxima.titulo)}, até ${dtc(A.proxima.prazo)}. ` : ""}Treinamento de ${dtc(A.etapas[0].prazo)} a ${dtc(A.fim)}.</div>
      <div class="progress" style="margin:10px 0 14px"><i style="width:${Math.round((A.feitas / A.total) * 100)}%"></i></div>
      ${[...new Set(A.etapas.map((e) => e.dia))].map((d) => `<h3>Dia ${d} · ${dtc(TQEquipe.diaUtil(T.inicio, d))}</h3><ul class="passos">${A.etapas.filter((e) => e.dia === d).map(linha).join("")}</ul>`).join("")}
      <h2>Depois do treinamento</h2><p class="sub">Primeiro, em até 1 semana ${A_VALIDAR_HTML}, os nomes do tripé: cada um recebe o seu briefing e as funções antes do evento. O resto fica pronto antes do primeiro evento, e a Operações confere uma vez.</p>
      ${cob ? `<div class="alert ${cob.completa ? "good" : "warn"}" style="margin-bottom:10px"><b>Equipe ${cob.completa ? "completa" : "incompleta"}</b>${cob.completa ? "" : esc(cob.pend.join(" · ")) + " "}<button class="btn sm" data-ir="equipe_casa">Abrir a equipe</button></div>` : ""}
      <ul class="passos">${A.depois.map(linha).join("")}</ul>`;
    },
    trilhas() {
      const T = S.tri; if (!T) { carregarTrilhas(); return carregando("as trilhas"); }
      if (T.erro) return faltaSchema("Trilhas");
      if (!S.eq) carregarEquipe();   // nomes das casas dos convites
      const k = (x) => String(x || "").trim().toLowerCase(), hoje = hojeIso();
      const casas = [...new Set((S.eq?.conv || []).filter((c) => c.tipo === "casa" && c.vinculo_nome).map((c) => c.vinculo_nome))].sort();
      const ed = T.trilhas.find((t) => t.casa_ref === S.triEd);
      const cartao = (t) => {
        const feitos = Object.fromEntries(T.marcos.filter((m) => m.casa_ref === t.casa_ref).map((m) => [m.etapa, { em: m.feito_em }]));
        const A = TQEquipe.andamento(t.inicio, feitos, hoje), eq = T.equipes.filter((m) => k(m.casa_ref) === k(t.casa_ref)), cob = TQEquipe.cobertura(eq);
        const linha = (e) => `<li class="${e.feito ? "feito" : e.atrasado ? "atrasado" : ""}"><label><input type="checkbox" data-tri-marco="${esc(t.casa_ref)}|${e.chave}"${e.feito ? " checked" : ""}> <span><b>${e.dia ? `Dia ${e.dia} · ` : ""}${esc(e.titulo)}</b> <span class="muted">· ${esc(e.quem === "casa" ? "a casa" : e.quem)}${e.prazo ? ` · até ${dtc(e.prazo)}` : ""}${e.atrasado ? " · atrasado" : ""}</span></span></label></li>`;
        return `<details class="card" style="margin-bottom:10px"${S.triAberta === t.casa_ref ? " open" : ""}><summary><b>${esc(t.casa_ref)}</b> <span class="muted">· ${dtc(A.etapas[0].prazo)} a ${dtc(A.fim)}</span>
          <span class="badge ${A.atrasadas ? "b-crit" : A.fechada ? "b-good" : "b-warn"}">${A.feitas}/${A.total}${A.atrasadas ? ` · ${A.atrasadas} atrasada${A.atrasadas > 1 ? "s" : ""}` : ""}</span> ${A.fechada ? "" : `<span class="muted">com ${esc(A.com === "casa" ? "a casa" : A.com)}</span>`} <span class="badge ${cob.completa ? "b-good" : ""}">equipe ${cob.completa ? "completa" : `${eq.length} pessoa${eq.length === 1 ? "" : "s"}`}</span></summary>
          <ul class="passos" style="margin-top:10px">${[...A.etapas, ...A.depois].map(linha).join("")}</ul>
          ${t.nota_passagem ? `<div class="alert" style="margin-top:8px"><b>Nota de passagem (só a Central vê)</b><span style="white-space:pre-wrap">${esc(t.nota_passagem)}</span></div>` : ""}
          ${eq.length ? `<p style="margin:10px 0 4px"><b>Equipe da casa</b></p><ul class="passos">${eq.map((m) => `<li>${esc(m.nome)}${m.reserva ? " (reserva)" : ""} · ${esc(nomesFuncoes(m.funcoes))}${m.whatsapp ? ` · ${esc(m.whatsapp)}` : ""}</li>`).join("")}</ul>${cob.completa ? "" : `<p class="muted" style="font-size:13px">${esc(cob.pend.join(" · "))}</p>`}` : `<p class="muted" style="font-size:13px">A casa ainda não cadastrou a equipe.</p>`}
          <div class="barra-acoes"><button class="btn sm" data-tri-editar="${esc(t.casa_ref)}">Editar dia 1 e nota</button><button class="btn sm" data-tri-apagar="${esc(t.casa_ref)}">Apagar trilha</button></div></details>`;
      };
      return `<div class="tag">Treinamentos</div><h1>Treinamento da nova casa</h1>
      <p class="sub">Habilitação em 7 dias úteis: Thales passa o lead (dia 1), Gui (dias 2 e 3), Isa (dias 4 e 5) e Bruno (dias 6 e 7). Cada um marca a sua etapa aqui; a casa confirma a parte dela (respostas, leitura do Guia e data aprovada) pela área dela. Fins de semana e feriados nacionais não contam.</p>
      ${T.trilhas.length ? T.trilhas.map(cartao).join("") : vazio("Nenhuma trilha em andamento", "Comece a trilha de uma casa nova logo abaixo: o dia 1 é o dia em que o Thales passa o lead.", "", "trilhas")}
      <div class="card" style="margin-top:14px" id="triForm"><h3 style="margin-top:0">${ed ? `Editar a trilha de ${esc(ed.casa_ref)}` : "Começar a trilha de uma casa"}</h3>
        <div class="fgrid"><label class="fcampo"><b>Casa (o mesmo nome do convite)</b><input id="triCasa" list="triCasas" maxlength="160" value="${esc(ed?.casa_ref || "")}"${ed ? " readonly" : ""}><datalist id="triCasas">${casas.map((c) => `<option value="${esc(c)}">`).join("")}</datalist></label>
        <label class="fcampo"><b>Dia 1 (Thales passa o lead)</b><input id="triInicio" type="date" value="${esc(ed?.inicio || hoje)}"></label></div>
        <label class="fcampo"><b>Nota de passagem do Thales (só a Central vê)</b><textarea id="triNota" rows="4" maxlength="4000" placeholder="Contato, nome do dono, casa, combinado financeiro e observações (tudo o que foi prometido fora do padrão)">${esc(ed?.nota_passagem || "")}</textarea></label>
        <p class="muted" style="font-size:12px;margin:4px 0 0">A casa vê a trilha quando a conta dela está ligada a este mesmo nome.</p>
        <div class="err" role="status" aria-live="polite" id="triErr"></div><div class="barra-acoes"><button class="btn pri" id="triOk">${ed ? "Salvar" : "Começar trilha"}</button>${ed ? `<button class="btn" data-tri-editar="">Cancelar</button>` : ""}</div></div>`;
    },
    // ---------- Datas: disponibilidade da casa (a casa informa; a Isa consulta em Agenda das casas) ----------
    agenda_casa() {
      const ref = S.conta.perfil.vinculo_nome;
      if (!ref) return `<div class="tag">Datas</div><h1>Disponibilidade</h1>${vazio("A conta ainda não está ligada à casa", "Quando a equipe do Tranquilo ligar esta conta à sua casa, você informa aqui os dias livres.", "", "agenda_casa")}`;
      if (S.disp === undefined) { carregarDisp(); return carregando("a disponibilidade"); }
      if (S.disp === null) return faltaSchema("Datas");
      const mes = S.dispMes || hojeIso().slice(0, 7), evs = (S.pac?.eventos || []).filter((e) => !e.z);
      const dias = TQEquipe.diasSemana || [];
      const fichaDias = S.conta.casa?.dados?.dias_semana || [];
      return `<div class="tag">Datas</div><h1>Disponibilidade da casa</h1>
      <p class="sub">Marque os dias em que a casa pode receber o Tranquilo e os dias em que não pode. A Isa consulta este calendário para montar a agenda. Disponível não é reserva: a data só vale quando a Isa confirma com a casa.</p>
      ${calendarioMes(mes, (dia) => { const r = S.disp.find((x) => x.casa_ref.toLowerCase() === ref.toLowerCase() && x.dia === dia), e = evs.filter((x) => x.d === dia);
        return { classe: e.length ? "cal-ev" : r?.situacao === "disponivel" ? "livre" : r?.situacao === "indisponivel" ? "ocupado" : "", rotulo: e.length ? e.map((x) => (x.a || []).join(", ") || x.m || "evento").join(" · ") : r ? (r.situacao === "disponivel" ? "disponível" : "indisponível") : "", clicavel: dia >= hojeIso() && !e.length }; }, "data-disp-dia")}
      ${fichaDias.length ? `<p class="muted" style="font-size:13px">Na Ficha, a casa disse que recebe: ${esc(fichaDias.map((d) => ({ segunda: "segunda", terca: "terça", quarta: "quarta", quinta: "quinta", sexta: "sexta", sabado: "sábado", domingo: "domingo" }[d] || d)).join(", "))}. <button class="btn sm" data-disp-semana>Marcar esses dias deste mês como disponíveis</button></p>` : ""}
      <div class="err" role="status" aria-live="polite" id="dispErr"></div>`;
    },
    // ---------- equipe: painel da operação e agenda das casas ----------
    painel() {
      const E = S.eq; if (!E) { carregarEquipe(); return carregando("o painel"); }
      const P = S.pac, hoje = hojeIso(), em14 = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10);
      if (!P) return `<div class="tag">Painel da operação</div><h1>Eventos por data</h1><div class="alert warn"><b>Falta o código interno</b>Cole o código interno da equipe na aba Conta para ver os eventos.</div>`;
      const k = (x) => String(x || "").trim().toLowerCase();
      const f = S.pf ||= { cidade: "", casa: "", status: "", foco: "" };
      const casaDe = (e) => (E.casas || []).find((c) => k(c.dados?.nome) === k(e.h) || k(c.perfil?.vinculo_nome) === k(e.h));
      const contratoDe = (e) => { const cs = (E.contr || []).filter((c) => c.evento_id === e.id && c.status !== "cancelado"); const anexado = (E.docs || []).some((d) => d.evento_id === e.id && d.tipo === "contrato");
        return cs.length ? (cs.every((c) => c.status === "assinado") ? ["b-good", "assinado no site"] : ["b-warn", `${cs.filter((c) => c.status !== "assinado").length} para assinar`]) : anexado ? ["", "PDF anexado (assinatura não confirmada)"] : ["b-crit", "sem contrato"]; };
      const linhas = P.eventos.filter((e) => !e.z && e.d >= hoje).map((e) => { const c = casaDe(e), ct = contratoDe(e);
        const pend = [...(!e.l ? ["sem link de ingressos"] : []), ...(ct[0] === "b-crit" ? ["sem contrato"] : []), ...(!c ? ["casa sem ficha no site"] : c.status !== "habilitada" ? [`ficha: ${STATUS_CASA[c.status]?.[1] || c.status}`] : []),
          ...((E.sol || []).some((x) => c && x.casa_id === c.id && x.status === "pendente") ? ["pedido de atualização da ficha"] : [])];
        return { e, c, ct, pend, atencao: e.d <= em14 && pend.length > 0 }; })
        .filter((l) => (!f.cidade || l.e.c === f.cidade) && (!f.casa || l.e.h === f.casa) && (!f.status || l.e.s === f.status) && (!f.foco || (f.foco === "atencao" ? l.atencao : f.foco === "contrato" ? l.ct[0] !== "b-good" : l.pend.length)));
      const todas = P.eventos.filter((e) => !e.z && e.d >= hoje), uniq = (xs) => [...new Set(xs.filter(Boolean))].sort();
      const sel = (id, rot, val, ops) => `<select data-pf="${id}" aria-label="${rot}"><option value="">${rot}</option>${ops.map((o) => `<option${o === val ? " selected" : ""}>${esc(o)}</option>`).join("")}</select>`;
      const n = (fn) => linhas.filter(fn).length;
      return `<div class="tag">Painel da operação</div><h1>Eventos por data</h1>
      <div class="alert" style="margin-bottom:10px"><b>Ainda falta neste painel ${A_VALIDAR_HTML}</b>Ranking de alinhamento dos donos, bonificações pendentes (Estrella Galicia) e contratos assinados: esperando o Gui definir os critérios de cada um.</div>
      <p class="sub">Todos os próximos eventos, do mais perto para o mais longe, com o que falta em cada um. Vendas: os números vêm do Notion (público e vendidos lançados); a integração com a Ingresse ainda não existe, então datas futuras aparecem sem venda.</p>
      <div class="stats">${kpi(n((l) => l.atencao), "precisam de atenção (14 dias)")}${kpi(n((l) => l.ct[0] !== "b-good"), "sem contrato assinado no site")}${kpi(n((l) => !l.c || l.c.status !== "habilitada"), "casa sem ficha habilitada")}${kpi((E.sol || []).filter((x) => x.status === "pendente").length, "pedidos de atualização de ficha")}</div>
      <div class="filters">${sel("cidade", "Todas as cidades", f.cidade, uniq(todas.map((e) => e.c)))}${sel("casa", "Todas as casas", f.casa, uniq(todas.map((e) => e.h)))}${sel("status", "Todos os status", f.status, uniq(todas.map((e) => e.s)))}
      <select data-pf="foco" aria-label="Foco"><option value="">Todos os eventos</option>${[["atencao", "Precisa de atenção (14 dias)"], ["contrato", "Contrato pendente"], ["pend", "Com qualquer pendência"]].map(([v, t]) => `<option value="${v}"${f.foco === v ? " selected" : ""}>${t}</option>`).join("")}</select></div>
      ${tabela("painel", [
        { t: "Data", v: (l) => l.e.d, h: (l) => `<b>${dt(l.e.d)}</b>${l.atencao ? ' <span class="badge b-crit">atenção</span>' : ""}` },
        { t: "Evento", v: (l) => l.e.n, h: (l) => `${esc(l.e.c)} · ${esc(l.e.h || "casa a definir")}<div class="muted" style="font-size:12px">${esc((l.e.a || []).join(", ") || l.e.m || "")}</div>` },
        { t: "Status", v: (l) => l.e.s, h: (l) => esc(l.e.s || "–") },
        { t: "Vendas", n: 1, v: (l) => l.e.v ?? -1, h: (l) => l.e.v != null ? `${fmt(l.e.v)}${l.e.x ? ` de ${fmt(l.e.x)}` : ""}` : `<span class="muted">sem dado</span>` },
        { t: "Contrato", v: (l) => l.ct[1], h: (l) => `<span class="badge ${l.ct[0]}">${esc(l.ct[1])}</span>` },
        { t: "Casa", v: (l) => l.c?.status || "", h: (l) => l.c ? badge(STATUS_CASA, l.c.status) : `<span class="muted">sem ficha no site</span>` },
        { t: "Pendências", n: 1, v: (l) => l.pend.length, h: (l) => l.pend.length ? l.pend.map((x) => `<span class="pill">${esc(x)}</span>`).join("") : "–" },
      ], linhas, { i: 0, dir: 1 }, vazio("Nenhum evento com esses filtros", "Mude os filtros acima.", "", "painel"))}
      <p class="muted" style="font-size:12px">Bonificações (como Estrella Galicia) e o status jurídico dos contratos assinados fora do site ainda não têm fonte validada: não aparecem aqui até a regra ser confirmada.</p>`;
    },
    agenda_casas() {
      const E = S.eq; if (!E) { carregarEquipe(); return carregando("a agenda das casas"); }
      if (E.disp === null) return faltaSchema("Agenda das casas");
      const k = (x) => String(x || "").trim().toLowerCase(), evs = (S.pac?.eventos || []).filter((e) => !e.z);
      const casas = [...new Set([...(E.disp || []).map((x) => x.casa_ref), ...(E.conv || []).filter((c) => c.tipo === "casa" && c.vinculo_nome).map((c) => c.vinculo_nome)])].sort();
      const casa = S.agCasa && casas.includes(S.agCasa) ? S.agCasa : casas[0], mes = S.dispMes || hojeIso().slice(0, 7);
      const doMes = (x) => x.dia.startsWith(mes);
      const conflitos = (E.disp || []).filter((x) => x.situacao === "indisponivel" && evs.some((e) => e.d === x.dia && k(e.h) === k(x.casa_ref)));
      return `<div class="tag">Agenda das casas</div><h1>Disponibilidade por casa</h1>
      <p class="sub">O que cada casa informou na área Datas, junto com os eventos já confirmados. Disponível não é reserva: confirme com a casa antes de fechar a data. Só a casa altera a disponibilidade dela.</p>
      ${casas.length ? `<div class="filters"><select data-ag-casa aria-label="Casa">${casas.map((c) => `<option${c === casa ? " selected" : ""}>${esc(c)}</option>`).join("")}</select></div>
      ${calendarioMes(mes, (dia) => { const r = (E.disp || []).find((x) => k(x.casa_ref) === k(casa) && x.dia === dia), e = evs.filter((x) => x.d === dia && k(x.h) === k(casa));
        return { classe: e.length ? (r?.situacao === "indisponivel" ? "conflito" : "cal-ev") : r?.situacao === "disponivel" ? "livre" : r?.situacao === "indisponivel" ? "ocupado" : "", rotulo: e.length ? e.map((x) => (x.a || []).join(", ") || x.m).join(" · ") : r ? (r.situacao === "disponivel" ? "disponível" : "indisponível") : "", clicavel: false }; })}
      <h2>Casas com dias livres neste mês</h2>${tabela("agmes", [
        { t: "Casa", v: (r) => r.casa, h: (r) => `<b>${esc(r.casa)}</b>` },
        { t: "Dias disponíveis", n: 1, v: (r) => r.livres.length, h: (r) => r.livres.length ? r.livres.map((d) => dtc(d)).join(", ") : "–" },
        { t: "Indisponíveis", n: 1, v: (r) => r.fora },
      ], casas.map((c) => ({ casa: c, livres: (E.disp || []).filter((x) => k(x.casa_ref) === k(c) && doMes(x) && x.situacao === "disponivel").map((x) => x.dia).sort(), fora: (E.disp || []).filter((x) => k(x.casa_ref) === k(c) && doMes(x) && x.situacao === "indisponivel").length })), { i: 1, dir: -1 }, "")}
      ${conflitos.length ? `<div class="alert crit"><b>Conflitos: evento confirmado em dia marcado como indisponível</b>${conflitos.map((x) => `${esc(x.casa_ref)} · ${dt(x.dia)}`).join("; ")}</div>` : ""}` : vazio("Nenhuma casa informou a disponibilidade ainda", "Quando uma casa marcar os dias livres na área Datas, o calendário aparece aqui.", "", "agenda_casas")}`;
    },
    // ---------- equipe ----------
    inicio() {
      const E = S.eq; if (!E) { carregarEquipe(); return carregando("o seu resumo"); }
      const p = S.conta.perfil, adm = p.tipo === "adm", P = S.pac;
      const hora = new Date().getHours(), oi = hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";
      const primeiro = (p.nome || "").split(" ")[0];
      const mes = P ? P.eventos.filter((e) => e.d.startsWith(P.hoje.slice(0, 7)) && !e.z).length : null;
      const alertas = P ? alertasOperacao(P).length : null;
      const conv = (E.conv || []).filter((c) => !c.aceito_em).length;
      const fila = [
        ["curadoria", (E.insc || []).filter((i) => i.status === "em_curadoria").length, "artistas esperando curadoria"],
        ["casas_cad", (E.casas || []).filter((c) => c.status === "em_analise").length, "casas esperando análise"],
        ["demanda", (E.avisos || []).length, "pedidos de show no \u201cme avise\u201d"],
      ];
      const atalho = (aba, cor, num, sufixo, titulo, texto, ir) => `<button class="atalho" data-ir="${aba}" style="--cor:${cor}">${num == null ? "" : `<div class="num">${num}<small>${sufixo}</small></div>`}<b>${titulo}</b><p>${texto}</p><span class="ir">${ir} →</span></button>`;
      return `<div class="tag">Comece por aqui</div><h1>${oi}${primeiro ? ", " + esc(primeiro) : ""}</h1>
      <p class="inicio-oi">Três coisas para olhar hoje. O menu completo continua à esquerda${matchMedia("(max-width:959px)").matches ? ", no botão ☰" : ""}.</p>
      <div class="atalhos">
        ${atalho(adm ? "estrategia" : "operacao", "#7c8ff3", mes, mes == null ? "" : "de 50 datas este mês", "Como a rede está indo", adm ? "Cidades, casas e artistas que estão acima ou abaixo da média, e onde abrir datas a seguir." : "Calendário do mês, meta de 50 datas e o que acontece nos próximos 14 dias.", adm ? "Ver o painel" : "Ver a operação")}
        ${atalho("operacao", "#f9b436", alertas, alertas == null ? "" : alertas === 1 ? "ponto" : "pontos", "O que precisa de atenção", "Datas sem link de ingressos, noites sem público lançado e status desatualizados no Notion.", "Ver os alertas")}
        ${atalho("convites", "#fcdbe5", conv, conv === 1 ? "convite esperando" : "convites esperando", "Chamar alguém para a rede", "Convide uma artista ou casa que já trabalha com o Tranquilo. Ela recebe o link e o tutorial.", "Fazer um convite")}
      </div>
      <h2 style="font-family:var(--sans);font-weight:600;font-size:16px;margin:34px 0 0">Fila de hoje</h2>
      <div class="fila">${fila.map(([aba, n, t]) => `<button data-ir="${aba}"><span class="q${n ? "" : " zero"}">${n}</span><span>${t}</span></button>`).join("")}</div>
`;
    },
    curadoria() {
      const L = S.eq?.insc; if (!L) { carregarEquipe(); return carregando("fila de curadoria"); }
      const f = S.eqf ||= { status: "em_curadoria", faixa: "", q: "" };
      let ls = L.filter((i) => !f.status || i.status === f.status).filter((i) => !f.faixa || i.faixa === f.faixa);
      if (f.q) { const q = f.q.toLowerCase(); ls = ls.filter((i) => JSON.stringify(i.dados).toLowerCase().includes(q)); }
      const n = (s) => L.filter((i) => i.status === s).length;
      return `<div class="tag">Curadoria</div><h1>Fila de artistas</h1><p class="sub">Toda inscrição enviada passa pela pré-curadoria automática (pontuação de 0 a 100 e alertas). A equipe decide: aprovar, pedir ajustes ou não seguir.</p>
      <div class="stats">${kpi(n("em_curadoria"), "aguardando curadoria")}${kpi(n("ajustes"), "com ajustes pedidos")}${kpi(n("aprovada"), "aprovadas")}${kpi(n("rascunho"), "rascunhos não enviados")}</div>
      <div class="filters"><select id="eqStatus" aria-label="Filtrar por status"><option value="">Todos os status</option>${Object.entries(STATUS_INSC).map(([k, [, t]]) => `<option value="${k}"${f.status === k ? " selected" : ""}>${t}</option>`).join("")}</select>
      <select id="eqFaixa" aria-label="Filtrar por faixa"><option value="">Todas as faixas</option>${["Prioridade", "Avaliar", "Abaixo do corte"].map((x) => `<option${f.faixa === x ? " selected" : ""}>${x}</option>`).join("")}</select><input id="eqQ" placeholder="Buscar nome, cidade, gênero" value="${esc(f.q)}"></div>
      ${tabela("curad", [
        { t: "Artista", v: (i) => i.dados.nome_artistico, h: (i) => `<b>${esc(i.dados.nome_artistico || "(sem nome)")}</b><div class="muted" style="font-size:12px">${esc(i.dados.cidade_base || "")} ${esc(i.dados.estado || "")} · ${esc(i.dados.generos || "")}</div>` },
        { t: "Pontuação", n: 1, v: (i) => i.score, h: (i) => `<b>${i.score ?? "–"}</b>` },
        { t: "Faixa", v: (i) => i.faixa, h: (i) => i.faixa ? `<span class="badge ${i.faixa === "Prioridade" ? "b-good" : i.faixa === "Avaliar" ? "b-warn" : "b-serious"}">${esc(i.faixa)}</span>` : "–" },
        { t: "Formato", v: (i) => i.dados.formato_interesse },
        { t: "Alertas", v: (i) => (i.alertas || []).length, h: (i) => (i.alertas || []).map((a) => `<span class="pill">${esc(a)}</span>`).join("") || "–" },
        { t: "Status", v: (i) => i.status, h: (i) => badge(STATUS_INSC, i.status) },
        { t: "Enviada", v: (i) => i.enviado_em || "", h: (i) => i.enviado_em ? dt(i.enviado_em.slice(0, 10)) : "–" },
      ], ls.map((i) => ({ ...i, _click: "insc:" + i.id })), { i: 1, dir: -1 }, L.length ? null : vazio("A fila está vazia", "Quando uma artista enviar a inscrição, ela chega aqui com a pré-curadoria pronta. Para chamar artistas que já estão na rede, use Convites.", `<button class="btn" data-ir="convites">Abrir convites</button>`, "curadoria"))}`;
    },
    casas_cad() {
      const L = S.eq?.casas; if (!L) { carregarEquipe(); return carregando("cadastros de casas"); }
      const n = (s) => L.filter((c) => c.status === s).length;
      return `<div class="tag">Casas</div><h1>Cadastros e habilitação</h1><p class="sub">Habilitar o suficiente para testar; qualificar pela execução. Classificação depois das datas: 🟢 confiável, 🟡 desenvolvimento, 🔴 correção necessária, ⛔ suspensa.</p>
      <div class="stats">${kpi(n("em_analise"), "aguardando análise")}${kpi(n("incompleto"), "faltando dados mínimos")}${kpi(n("habilitada"), "habilitadas")}${kpi(L.filter((c) => c.ja_parceira).length, "já parceiras")}</div>
      ${tabela("casc", [
        { t: "Casa", v: (c) => c.dados.nome, h: (c) => `<b>${esc(c.dados.nome || "(sem nome)")}</b><div class="muted" style="font-size:12px">${esc(c.dados.cidade || "")} · ${c.ja_parceira ? "já parceira" : "nova"}</div>` },
        { t: "Capacidade", n: 1, v: (c) => +c.dados.capacidade || null, h: (c) => fmt(+c.dados.capacidade || null) },
        { t: "Bloqueia habilitação", n: 1, v: (c) => c.pendencias?.habilitacao?.length ?? 0 },
        { t: "Bloqueia match", n: 1, v: (c) => c.pendencias?.match?.length ?? 0 },
        { t: "Pedidos de atualização", n: 1, v: (c) => (S.eq.sol || []).filter((x) => x.casa_id === c.id && x.status === "pendente").length, h: (c) => { const n = (S.eq.sol || []).filter((x) => x.casa_id === c.id && x.status === "pendente").length; return n ? `<span class="badge b-warn">${n}</span>` : "0"; } },
        { t: "Status", v: (c) => c.status, h: (c) => badge(STATUS_CASA, c.status) },
        { t: "Classificação", v: (c) => c.classificacao, h: (c) => CLASSE[c.classificacao] || "–" },
      ], L.map((c) => ({ ...c, _click: "casacad:" + c.id })), { i: 4, dir: 1 }, vazio("Nenhuma casa cadastrada ainda", "As casas que criarem conta e enviarem a ficha aparecem aqui para habilitação.", `<button class="btn" data-ir="convites">Convidar uma casa</button>`, "casas_cad"))}`;
    },
    prontidao() {
      const E = S.eq; if (!E?.chk) { carregarEquipe(); return carregando("prontidão"); }
      const nomes = Object.fromEntries((E.perfis || []).map((p) => [p.id, p.vinculo_nome || p.nome || p.email]));
      const tipos = Object.fromEntries((E.perfis || []).map((p) => [p.id, p.tipo]));
      const evs = Object.fromEntries((S.pac?.eventos || []).map((e) => [e.id, e]));
      const grupos = {};
      for (const c of E.chk) (grupos[c.evento_id + "|" + c.user_id] ||= []).push(c);
      const linhas = Object.entries(grupos).map(([k, cs]) => {
        const [ev, u] = k.split("|"), e = evs[ev], modelo = tipos[u] === "casa" ? "casa" : "artista";
        const ps = e ? R.passosDaData(modelo, e.d, Object.fromEntries(cs.map((c) => [c.item, true])), hojeIso()) : [];
        return { ev, e, quem: nomes[u] || "–", modelo, feitos: cs.length, total: ps.length || (modelo === "casa" ? R.PASSOS_CASA.length : R.PASSOS_ARTISTA.length), atras: ps.filter((p) => p.atrasado).length };
      });
      return `<div class="tag">Prontidão</div><h1>Quem já fez o quê</h1><p class="sub">Checklists marcados por artistas e casas em cada data. A Central consulta e só intervém quando há motivo (método V0.1: observabilidade, não microgestão).</p>
      ${tabela("pront", [
        { t: "Data", v: (l) => l.e?.d || "", h: (l) => l.e ? `<b>${dt(l.e.d)}</b> ${esc(l.e.c)}` : `<span class="muted">${esc(l.ev.slice(0, 8))}</span>` },
        { t: "Quem", v: (l) => l.quem, h: (l) => `${esc(l.quem)} <span class="muted">· ${l.modelo}</span>` },
        { t: "Feitos", n: 1, v: (l) => l.feitos / l.total, h: (l) => `${l.feitos}/${l.total}` },
        { t: "Atrasados", n: 1, v: (l) => l.atras, h: (l) => l.atras ? `<span class="badge b-crit">${l.atras}</span>` : "0" },
      ], linhas, { i: 0, dir: 1 }, vazio("Nenhum checklist marcado ainda", "Quando artistas e casas marcarem os passos de cada data, o andamento aparece aqui.", "", "prontidao"))}
      <h2>Registros da noite</h2>
      ${tabela("regs", [
        { t: "Data", v: (r) => evs[r.evento_id]?.d || r.criado_em, h: (r) => evs[r.evento_id] ? `${dt(evs[r.evento_id].d)} · ${esc(evs[r.evento_id].c)}` : dt(r.criado_em.slice(0, 10)) },
        { t: "Casa", v: (r) => nomes[r.user_id] },
        { t: "Público", n: 1, v: (r) => r.publico, h: (r) => fmt(r.publico) },
        { t: "Ocorrência", v: (r) => r.ocorrencia, h: (r) => r.ocorrencia ? `${r.gravidade === "excecao" ? '<span class="badge b-crit">exceção crítica</span> ' : '<span class="badge">ordinária</span> '}${esc(r.ocorrencia)}${r.como_resolveu ? `<div class="muted" style="font-size:12px">Resolução: ${esc(r.como_resolveu)}</div>` : ""}` : "–" },
      ], E.reg || [], { i: 0, dir: -1 }, vazio("Nenhuma noite registrada", "Depois de cada show, a casa registra público e ocorrências pela área dela.", "", "operacao"))}`;
    },
    pessoas() {
      const E = S.eq; if (!E?.perfis) { carregarEquipe(); return carregando("pessoas"); }
      return `<div class="tag">Pessoas</div><h1>Contas na plataforma</h1><p class="sub">Artistas e casas criam a própria conta. Equipe e administração só são definidas aqui. O vínculo liga a conta ao histórico da artista ou da casa no Notion e libera as métricas dela.</p>
      ${tabela("pess", [
        { t: "Pessoa", v: (p) => p.nome || p.email, h: (p) => `<b>${esc(p.nome || "–")}</b><div class="muted" style="font-size:12px">${esc(p.email)}</div>` },
        { t: "Perfil", v: (p) => p.tipo, h: (p) => `<select data-tipo="${p.id}" data-antes="${p.tipo}" aria-label="Perfil de ${esc(p.nome || p.email)}"${p.id === S.conta.perfil.id ? ' disabled title="Você não pode mudar o seu próprio perfil"' : ""}>${Object.entries(ROTULO).map(([k, t]) => `<option value="${k}"${p.tipo === k ? " selected" : ""}>${t}</option>`).join("")}</select>` },
        { t: "Vínculo", v: (p) => p.vinculo_nome || "", h: (p) => ["artista", "casa"].includes(p.tipo) ? seletorVinculo(p) : "–" },
        { t: "Criada", v: (p) => p.criado_em, h: (p) => dt(p.criado_em.slice(0, 10)) },
        { t: "Acesso", v: (p) => p.tutorial_visto_em || "", h: (p) => `<div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn sm" data-link-senha="${esc(p.email)}">Enviar link de senha</button><button class="btn sm" data-enviar-tutorial="${esc(p.tipo)}|${esc(p.email)}|${esc(p.vinculo_nome || p.nome || "")}|${esc(p.whatsapp || "")}">Enviar tutorial</button></div><div class="muted" style="font-size:12px;margin-top:4px">${p.tutorial_visto_em ? "viu o tutorial em " + dt(p.tutorial_visto_em.slice(0, 10)) : "ainda não viu o tutorial"}</div>` },
      ], E.perfis, { i: 3, dir: -1 })}`;
    },
    convites() {
      const E = S.eq; if (!E) { carregarEquipe(); return carregando("convites"); }
      if (E.conv === null) return faltaSchema("Convites");
      const adm = S.conta.perfil.tipo === "adm", tipoSel = S.convTipo || "artista", pre = S.convPre || {};
      const acessos = (S.pac?.acessos || []).filter((a) => a.tipo === tipoSel);
      const contas = new Set((E.perfis || []).map((p) => p.email));
      return `<div class="tag">Convites</div><h1>Chamar quem já está na rede</h1>
      <p class="sub">Para artistas e casas que já trabalham com o Tranquilo. A pessoa recebe um link por e-mail, entra, cria a senha e já cai na própria área, vinculada ao histórico dela. O tutorial abre sozinho no primeiro acesso.</p>
      <div class="card"><div class="fgrid">
        <label class="fcampo"><b>Perfil</b><select id="cvTipo">${[["artista", "Artista"], ["casa", "Casa"], ...(adm ? [["equipe", "Equipe"], ["adm", "Administração"]] : [])].map(([k, t]) => `<option value="${k}"${tipoSel === k ? " selected" : ""}>${t}</option>`).join("")}</select></label>
        ${["artista", "casa"].includes(tipoSel) ? `<label class="fcampo"><b>${tipoSel === "casa" ? "Casa" : "Artista"} da rede</b>${acessos.length ? `<select id="cvVinc"><option value="">Sem vínculo por enquanto</option>${acessos.map((a) => `<option value="${esc(a.codigo)}|${esc(a.nome)}"${pre.nome === a.nome ? " selected" : ""}>${esc(a.nome)}${a.cidades ? " · " + esc(a.cidades) : ""}</option>`).join("")}</select>` : `<span class="muted" style="font-size:13px">A lista de nomes vem com o código de administração. Sem ele, o convite sai sem vínculo e a administração liga depois em Pessoas.</span>`}</label>` : ""}
        <label class="fcampo"><b>Nome</b><input id="cvNome" value="${esc(pre.nome || "")}" autocomplete="off"></label>
        <label class="fcampo"><b>E-mail</b><input id="cvEmail" type="email" autocomplete="off"></label>
        <label class="fcampo"><b>WhatsApp (opcional)</b><input id="cvWa" inputmode="tel" placeholder="DDD + número" autocomplete="off"></label>
      </div><div class="err" role="status" aria-live="polite" id="cverr"></div><div class="barra-acoes"><button class="btn pri" id="cvOk">Enviar convite</button></div>
      <p class="muted" style="font-size:13px;margin-bottom:0">Os e-mails saem pelo Supabase. Sem um servidor de e-mail próprio (SMTP) configurado, o Supabase só entrega para e-mails da equipe do projeto e poucos por hora. Por isso cada convite também tem a mensagem pronta para WhatsApp.</p></div>
      <h2>Convites enviados</h2>
      ${tabela("conv", [
        { t: "Pessoa", v: (c) => c.nome || c.email, h: (c) => `<b>${esc(c.nome || "–")}</b><div class="muted" style="font-size:12px">${esc(c.email)}</div>` },
        { t: "Perfil", v: (c) => c.tipo, h: (c) => ROTULO[c.tipo] },
        { t: "Vínculo", v: (c) => c.vinculo_nome || "", h: (c) => esc(c.vinculo_nome || "–") },
        { t: "Situação", v: (c) => c.aceito_em ? 2 : contas.has(c.email) ? 1 : 0, h: (c) => c.aceito_em ? `<span class="badge b-good">entrou em ${dt(c.aceito_em.slice(0, 10))}</span>` : contas.has(c.email) ? `<span class="badge b-warn">conta criada, falta confirmar o e-mail</span>` : `<span class="badge">aguardando</span>` },
        { t: "Tutorial", v: (c) => c.tutorial_enviado_em || "", h: (c) => c.tutorial_enviado_em ? `enviado em ${dt(c.tutorial_enviado_em.slice(0, 10))}` : `<span class="muted">não enviado</span>` },
        { t: "", v: () => 0, h: (c) => `<div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn sm" data-reconvidar="${esc(c.email)}">${c.aceito_em ? "Mandar link de entrada" : "Reenviar convite"}</button><button class="btn sm" data-enviar-tutorial="${esc(c.tipo)}|${esc(c.email)}|${esc(c.nome || "")}|${esc(c.whatsapp || "")}">Enviar tutorial</button>${c.aceito_em ? "" : `<button class="btn sm" data-cancelar-convite="${esc(c.email)}">Cancelar</button>`}</div>` },
      ], E.conv, { i: 3, dir: 1 }, vazio("Nenhum convite ainda", "Escolha a artista ou a casa acima, coloque o e-mail e envie. O convite aparece aqui com a situação de cada pessoa.", "", "convites"))}`;
    },
    campanha() {
      const H = S.hub; if (!H) { carregarHub(); return carregando("campanha"); }
      if (H.erro) return `<div class="alert crit"><b>Não foi possível carregar a campanha</b>${esc(H.erro)} <button class="btn sm" data-hub-recarregar>Tentar de novo</button></div>`;
      const feitos = Object.fromEntries((H.feitos || []).map((f) => [f.item_id, f]));
      if (!H.campanhas.length) return `<div class="tag">Campanha</div><h1>Campanha de divulgação</h1>${vazio("Nenhuma campanha para a sua casa ainda", "Quando a equipe do Tranquilo carregar a campanha da sua casa, os dias e as ações aparecem aqui. A conta precisa estar ligada à casa pelo convite da equipe.", "", "campanha")}`;
      return `<div class="tag">Campanha</div><h1>Campanha de divulgação</h1><p class="sub">O que postar e mandar em cada dia. Marque "Feito" quando terminar: vale para toda a equipe da casa, e o Tranquilo acompanha.</p>
      ${H.campanhas.map((c) => {
        const its = H.itens.filter((i) => i.campanha_id === c.id), nf = its.filter((i) => feitos[i.id]).length;
        return `<h2>${esc(c.titulo)}</h2><div class="row" style="margin-bottom:8px"><span class="muted">${nf} de ${its.length} dias feitos</span><div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn sm" data-camp-ics="${c.id}" title="Baixa um arquivo .ics com os dias da campanha. No Google Agenda: Configurações › Importar.">Levar para o Google Agenda</button>${c.fonte_url ? `<a class="btn sm" href="${esc(c.fonte_url)}" target="_blank" rel="noopener">Ver página da campanha</a>` : ""}</div></div>
        <div class="progress" style="margin-bottom:14px"><i style="width:${its.length ? Math.round((nf / its.length) * 100) : 0}%"></i></div>
        <div class="list">${its.map((i) => diaCampanha(i, feitos, true)).join("")}</div>`;
      }).join("")}`;
    },
    campanhas() {
      if (!S.eq) carregarEquipe();   // nomes de quem marcou
      const H = S.hub; if (!H) { carregarHub(); return carregando("campanhas"); }
      if (H.erro) return `<div class="alert crit"><b>Não foi possível carregar as campanhas</b>${esc(H.erro)} <button class="btn sm" data-hub-recarregar>Tentar de novo</button></div>`;
      const feitos = Object.fromEntries((H.feitos || []).map((f) => [f.item_id, f]));
      const nomes = Object.fromEntries((S.eq?.perfis || []).map((p) => [p.id, p.nome || p.email]));
      return `<div class="tag">Campanhas</div><h1>Andamento das campanhas</h1><p class="sub">Cada casa marca os dias da própria campanha. Atrasado = dia que já passou sem "Feito". Clique numa campanha para ver dia a dia.</p>
      ${tabela("andcamp", [
        { t: "Casa", v: (a) => a.casa_ref, h: (a) => `<b>${esc(a.casa_ref)}</b>` }, { t: "Campanha", v: (a) => a.titulo },
        { t: "Feitos", n: 1, v: (a) => a.feitos / (a.dias || 1), h: (a) => `${a.feitos}/${a.dias}` },
        { t: "Atrasados", n: 1, v: (a) => a.atrasados, h: (a) => a.atrasados ? `<span class="badge b-crit">${a.atrasados}</span>` : "0" },
        { t: "Próximo dia", v: (a) => a.proximo || "", h: (a) => a.proximo ? dt(a.proximo) : "–" },
      ], (H.andamento || []).map((a) => ({ ...a, _click: "camp:" + a.campanha_id })), { i: 3, dir: -1 }, vazio("Nenhuma campanha carregada", "Carregue a campanha de uma casa logo abaixo, com a página ou o arquivo de dados do Bruno.", "", "campanhas"))}
      ${formCampanha(H)}
      ${coberturaCasas(H)}
      ${S.campAberta ? (() => { const c = H.campanhas.find((x) => x.id === S.campAberta); if (!c) return ""; const its = H.itens.filter((i) => i.campanha_id === c.id);
        return `<h2>${esc(c.casa_ref)} · ${esc(c.titulo)}</h2><div class="list">${its.map((i) => diaCampanha(i, feitos, false).replace("por alguém da casa", feitos[i.id] ? "por " + esc(nomes[feitos[i.id].feito_por] || "alguém da casa") : "")).join("")}</div>`; })() : ""}`;
    },
    materiais() {
      const H = S.hub; if (!H) { carregarHub(); return carregando("materiais"); }
      if (H.erro) return `<div class="alert crit"><b>Não foi possível carregar os materiais</b>${esc(H.erro)} <button class="btn sm" data-hub-recarregar>Tentar de novo</button></div>`;
      const equipe = ["equipe", "adm"].includes(S.conta.perfil.tipo);
      if (equipe && !S.eq) carregarEquipe();   // para listar quem ainda não confirmou a leitura
      const vigente = (mid) => H.versoes.find((v) => v.material_id === mid);
      const minha = Object.fromEntries((H.minhas || []).map((c) => [c.versao_id, c.registrada_em]));
      const pend = new Set((H.pendentes || []).map((p) => p.versao_id));
      const perfis = S.eq?.perfis || [];
      const cards = H.materiais.map((m) => {
        const v = vigente(m.id), url = v?.url || m.fonte_url;
        const ciencia = !v?.exige_ciencia ? "" : equipe
          ? (() => { const deram = (H.todas || []).filter((c) => c.versao_id === v.id); const alvo = perfis.filter((p) => (m.publico || []).includes(p.tipo));
              const faltam = alvo.filter((p) => !deram.some((c) => c.user_id === p.id));
              return `<div class="muted" style="font-size:13px;margin-top:8px"><b>Ciência da versão ${esc(v.versao)}:</b> ${deram.length} ${deram.length === 1 ? "pessoa" : "pessoas"}${alvo.length ? ` · faltam ${faltam.length}${faltam.length && faltam.length <= 8 ? ": " + faltam.map((p) => esc(p.vinculo_nome || p.nome || p.email)).join(", ") : ""}` : ""}</div>`; })()
          : pend.has(v.id) ? `<div class="alert warn" style="margin-top:10px"><b>Leia e confirme</b>Esta versão muda o que a casa faz. Abra, leia e confirme.<div class="barra-acoes" style="margin-top:8px"><button class="btn pri" data-ciencia="${v.id}">Li e estou ciente</button></div></div>`
          : minha[v.id] ? `<div class="muted" style="font-size:13px;margin-top:8px">✓ Você confirmou a leitura da versão ${esc(v.versao)} em ${dt(String(minha[v.id]).slice(0, 10))}.</div>` : "";
        const copia = url && urlCopia(url);
        const quem = equipe ? `<div class="muted" style="font-size:12px">Para ${(m.publico || []).join(" e ")}${m.casa_ref ? " · só " + esc(m.casa_ref) : ""}</div>` : "";
        return `<div class="card"><div class="row"><div><b>${esc(m.titulo)}</b><div class="muted" style="font-size:13px">${esc(m.tipo_material)} · versão ${esc(v?.versao || "–")}${v?.resumo ? " · " + esc(v.resumo) : ""}</div>${quem}</div><div style="display:flex;gap:6px;flex-wrap:wrap">${url ? `<a class="btn sm" href="${esc(url)}" target="_blank" rel="noopener">Abrir</a>` : ""}${copia ? `<a class="btn sm" href="${esc(copia)}" target="_blank" rel="noopener" title="Cria uma cópia no seu Google Drive para você editar. O original não muda.">Fazer minha cópia</a>` : ""}</div></div>${ciencia}</div>`;
      });
      const nPend = H.pendentes?.length || 0;
      return `<div class="tag">Materiais</div><h1>Guias e materiais</h1><p class="sub">${equipe ? "Os materiais publicados para artistas e casas, com quem já confirmou a leitura da versão atual." : "Guias, playbooks e modelos do Tranquilo. Os modelos abrem só para leitura: para usar, toque em \"Fazer minha cópia\" (ou Arquivo › Fazer uma cópia)."}</p>
      ${!equipe && nPend ? `<div class="alert warn" style="margin-bottom:12px"><b>${nPend} ${nPend === 1 ? "material pede" : "materiais pedem"} sua confirmação de leitura</b>Eles aparecem abaixo com o botão "Li e estou ciente".</div>` : ""}
      ${equipe ? formMateriais(H) : ""}
      <div class="list">${cards.join("") || vazio("Nenhum material publicado ainda", "Quando a equipe publicar guias e modelos, eles aparecem aqui.", "", "materiais")}</div>`;
    },
    documentos() {
      const E = S.eq; if (!E) { carregarEquipe(); return carregando("documentos"); }
      if (E.docs === null) return faltaSchema("Documentos");
      const contas = (E.perfis || []).filter((p) => ["artista", "casa"].includes(p.tipo)).sort((a, b) => (a.vinculo_nome || a.nome || a.email).localeCompare(b.vinculo_nome || b.nome || b.email, "pt-BR"));
      const nomeConta = Object.fromEntries((E.perfis || []).map((p) => [p.id, p.vinculo_nome || p.nome || p.email]));
      const datas = (S.pub?.agenda || []).filter((e) => e.id);
      const dataTxt = (id) => { const e = (S.pub?.agenda || []).find((x) => x.id === id) || S.pac?.eventos?.find((x) => x.id === id); return e ? `${dt(e.d)} · ${e.c}` : id ? id.slice(0, 8) : "–"; };
      return `<div class="tag">Documentos</div><h1>Contratos e materiais</h1><p class="sub">Gere o contrato de cada data para a artista ou a casa assinar aqui mesmo, ou anexe um contrato pronto (link). Os dois aparecem no passo a passo dela, em "Contrato e materiais". Abaixo, os arquivos que artistas e casas enviaram.</p>
      ${secaoContratos(E, contas, datas, dataTxt, nomeConta)}
      <div class="card"><h3 style="margin-top:0">Anexar documento pronto (link)</h3><div class="grid g2">
        <label class="fcampo"><b>Tipo</b><select id="docTipo"><option value="contrato">Contrato de uma data</option><option value="modelo">Modelo de contrato (para todos)</option><option value="outro">Outro documento de uma data</option></select></label>
        <label class="fcampo"><b>Nome</b><input id="docTit" maxlength="120" placeholder="ex.: Contrato Joyce Alane · BH 05/11"></label>
        <label class="fcampo"><b>Conta</b><select id="docConta"><option value="">Escolha a artista ou casa</option>${contas.map((p) => `<option value="${p.id}">${esc(p.vinculo_nome || p.nome || p.email)} · ${p.tipo}</option>`).join("")}</select></label>
        <label class="fcampo"><b>Data</b><select id="docEv"><option value="">Escolha a data</option>${datas.map((e) => `<option value="${esc(e.id)}">${dt(e.d)} · ${esc(e.c)} · ${esc(e.a.join(", ") || e.m)}</option>`).join("")}</select></label>
        <label class="fcampo" style="grid-column:1/-1"><b>Link (Drive, Dropbox, DocuSign…)</b><input id="docUrl" maxlength="500" placeholder="https://"></label>
      </div><div class="barra-acoes"><button class="btn pri" id="docOk">Anexar</button></div><div class="err" role="status" aria-live="polite" id="docErr"></div>
      <p class="muted" style="font-size:13px;margin:6px 0 0">Confira se o link está compartilhado com a pessoa (ou "qualquer pessoa com o link").</p></div>
      <h2>Anexados</h2>${tabela("docs", [
        { t: "Documento", v: (d) => d.titulo, h: (d) => `<a href="${esc(d.url)}" target="_blank" rel="noopener">${esc(d.titulo)}</a>` },
        { t: "Tipo", v: (d) => d.tipo }, { t: "Conta", v: (d) => nomeConta[d.user_id] || (d.tipo === "modelo" ? "todos" : "–") },
        { t: "Data", v: (d) => d.evento_id, h: (d) => d.tipo === "modelo" ? "–" : esc(dataTxt(d.evento_id)) },
        { t: "", v: () => 0, h: (d) => `<button class="btn sm" data-apagar-doc="${d.id}">Remover</button>` },
      ], E.docs || [], { i: 0, dir: 1 }, vazio("Nenhum documento anexado", "Anexe o modelo de contrato e o contrato de cada data.", "", "convites"))}
      <h2>Materiais recebidos</h2>${tabela("arqs", [
        { t: "Arquivo", v: (f) => f.nome, h: (f) => `<a href="#" data-arquivo="${esc(f.caminho)}">${esc(f.nome.replace(/^\d+-/, ""))}</a>` },
        { t: "Quem enviou", v: (f) => nomeConta[f.user_id] || f.user_id.slice(0, 8) },
        { t: "Data", v: (f) => f.evento_id, h: (f) => esc(dataTxt(f.evento_id)) },
        { t: "Enviado em", v: (f) => f.em, h: (f) => f.em ? dt(String(f.em).slice(0, 10)) : "–" },
      ], E.arqs || [], { i: 3, dir: -1 }, vazio("Nenhum material enviado ainda", "Riders, mapas de palco e fotos enviados pelas artistas e casas aparecem aqui.", "", "convites"))}`;
    },
    relatos() {
      const E = S.eq; if (!E) { carregarEquipe(); return carregando("relatos"); }
      if (E.relatos === null) return faltaSchema("Relatos");
      const quem = Object.fromEntries((E.perfis || []).map((p) => [p.id, p.email]));
      const aparelho = (ua) => /Mobile|Android|iPhone/i.test(ua || "") ? "celular" : "computador";
      return `<div class="tag">Relatos</div><h1>O que as pessoas contaram</h1><p class="sub">Tudo o que chega pelo botão "Algo deu errado?", com a tela, a conta e os últimos erros daquela aba. A lista completa de uso e erros fica na tabela diario do Supabase.</p>
      <div class="list">${(E.relatos || []).map((r) => {
        const d = r.detalhe || {}, rec = (d.recentes || []).filter((x) => x.acao !== "tela");
        return `<div class="card"><div class="row"><b>${esc(quem[r.user_id] || d.contato || "visitante")}</b><span class="muted" style="font-size:13px">${new Date(r.criado_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} · ${esc(r.perfil || "")} · ${esc(r.tela || "")} · ${aparelho(r.navegador)}</span></div>
        <p style="margin:8px 0">${esc(d.texto || "")}</p>
        ${rec.length ? `<details><summary>${rec.length} erro${rec.length > 1 ? "s" : ""} ou aviso${rec.length > 1 ? "s" : ""} antes do relato</summary><ul class="passos">${rec.map((x) => `<li><b>${esc(x.h || "")} · ${esc(x.acao)}</b> <span class="muted">${esc(x.tela || "")}</span><br><span class="muted" style="font-size:13px">${esc(x.texto || x.msg || [x.alvo, x.status].filter(Boolean).join(" · "))}</span></li>`).join("")}</ul></details>` : `<span class="muted" style="font-size:13px">Nenhum erro registrado antes do relato.</span>`}</div>`;
      }).join("") || vazio("Nenhum relato ainda", "Quando alguém usar o botão \"Algo deu errado?\", aparece aqui com a tela e os erros.")}</div>`;
    },
    demanda() {
      const E = S.eq; if (!E) { carregarEquipe(); return carregando("demanda por cidade"); }
      if (E.avisos === null) return faltaSchema("Demanda");
      const norm = (c) => c.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      const agenda = S.pub?.agenda || [], datasPor = {};
      for (const e of agenda) datasPor[norm(e.c)] = (datasPor[norm(e.c)] || 0) + 1;
      const grupos = {};
      for (const a of E.avisos) { const k = norm(a.cidade); (grupos[k] ||= { cidade: a.cidade.trim(), lista: [] }).lista.push(a); }
      const linhas = Object.entries(grupos).map(([k, g]) => ({ ...g, k, n: g.lista.length, datas: datasPor[k] || 0, ultimo: g.lista.map((a) => a.criado_em).sort().pop() }));
      const semData = linhas.filter((l) => !l.datas), maxN = Math.max(1, ...linhas.map((l) => l.n));
      const link = site() + "#avise";
      const divulgar = `<button class="btn pri" data-copy="${esc(link)}">Copiar link do "me avise"</button><a class="btn" href="https://wa.me/?text=${encodeURIComponent("Quer saber quando tem show do Tranquilo na sua cidade? Deixa seu contato aqui: " + link)}" target="_blank" rel="noopener">Divulgar no WhatsApp</a><a class="btn ghost" href="${esc(link)}" target="_blank" rel="noopener">Ver como o público vê</a>`;
      if (!E.avisos.length) return `<div class="tag">Demanda</div><h1>Quem pediu show em cada cidade</h1>
      <p class="sub">Quem visita o site deixa o e-mail ou o WhatsApp pedindo aviso de show na própria cidade. Cidade com muitos pedidos e nenhuma data marcada é candidata a abrir praça.</p>
      ${vazio("Ainda ninguém pediu show", "Os pedidos chegam pelo formulário \u201cMe avise na minha cidade\u201d da página pública. Divulgue o link nas redes, na bio do Instagram e nos ingressos: cada pedido aparece aqui, somado por cidade.", divulgar, "demanda")}`;
      return `<div class="tag">Demanda</div><h1>Quem pediu show em cada cidade</h1>
      <p class="sub">Visitantes do site deixam e-mail ou WhatsApp pedindo aviso de shows na própria cidade. Cidade com muitos pedidos e nenhuma data marcada é candidata a abrir praça. Os contatos só podem ser usados para avisar de shows, como a pessoa autorizou.</p>
      <div class="stats">${kpi(fmt(E.avisos.length), "pedidos de aviso")}${kpi(fmt(linhas.length), "cidades pedidas")}${kpi(fmt(semData.length), "cidades pedidas sem data marcada")}${kpi(fmt(semData.reduce((s, l) => s + l.n, 0)), "pessoas esperando nessas cidades")}</div>
      ${tabela("dem", [
        { t: "Cidade", v: (l) => l.cidade, h: (l) => `<b>${esc(l.cidade)}</b>` },
        { t: "Pedidos", v: (l) => l.n, h: (l) => barra(l.n, maxN) },
        { t: "Datas na agenda", n: 1, v: (l) => l.datas, h: (l) => l.datas ? fmt(l.datas) : `<span class="badge b-warn">nenhuma</span>` },
        { t: "Último pedido", v: (l) => l.ultimo, h: (l) => dt(l.ultimo.slice(0, 10)) },
        { t: "", v: () => 0, h: (l) => `<button class="btn sm" data-copy="${esc(l.lista.map((a) => a.contato).join("\n"))}">Copiar contatos</button>` },
      ], linhas, { i: 1, dir: -1 })}
      <div class="barra-acoes" style="margin-top:18px">${divulgar}</div>`;
    },
  };

  function passosArtista() {
    const p = S.conta.perfil, i = S.conta.insc, evs = eventosDaConta();
    const etapas = ["Inscrição", "Pré-curadoria", "Curadoria", "Aprovada", "Proposta de data", "Contrato e repasse da data", "Pré-show", "Show", "Pós-show"];
    let etapa = 0, agora = "";
    if (!i || i.status === "rascunho") {
      const falta = faltando(F_ARTISTA, i?.dados || {});
      agora = `<div class="alert warn"><b>Complete e envie sua inscrição</b>${falta.length ? `Faltam ${falta.length} campos obrigatórios. O rascunho fica salvo: dá para fazer em partes.` : "Está tudo preenchido: falta só enviar."}<div class="barra-acoes" style="margin-top:12px"><button class="btn pri" data-ir="inscricao">Abrir inscrição →</button></div></div>`;
    } else if (i.status === "ajustes") {
      agora = `<div class="alert warn"><b>A curadoria pediu ajustes</b>${esc(i.parecer || "")}<div class="barra-acoes" style="margin-top:12px"><button class="btn pri" data-ir="inscricao">Editar e reenviar →</button></div></div>`;
    } else if (i.status === "em_curadoria") {
      etapa = 2; agora = `<div class="alert"><b>Sua inscrição está com a curadoria</b>A equipe avalia por ordem de chegada e a resposta aparece aqui. Enquanto isso, nada a fazer.</div>${medidor({ score: i.score, faixa: i.faixa, detalhe: i.score_detalhe, alertas: i.alertas || [] })}`;
    } else if (i.status === "reprovada" || i.status === "reprovada_pre") {
      etapa = 2; agora = `<div class="alert crit"><b>Desta vez a inscrição não seguiu</b>${esc(i.parecer || "A curadoria não abriu datas para este momento.")}</div>`;
    } else if (i.status === "aprovada") {
      const futuras = evs.filter((e) => e.d >= hojeIso());
      etapa = futuras.length ? 6 : evs.length ? 8 : 4;
      if (!p.codigo_acesso) agora = `<div class="alert good"><b>Você foi aprovada na rede${i.parecer ? "" : "!"}</b>${esc(i.parecer || "")} Próximo passo: a equipe propõe datas e cidades. Quando a primeira data for confirmada, os passos de cada show aparecem aqui.</div>
        <div class="card"><b>Enquanto isso</b><ul class="passos"><li>Confira se o release, a foto e os links estão atualizados: eles vão para a sua página no site do Tranquilo.</li><li>Mantenha a disponibilidade e as cidades de interesse em dia.</li><li>Se a equipe te mandou um código de acesso, vincule na aba Conta.</li></ul></div>`;
      else if (!evs.length) agora = `<div class="alert good"><b>Aprovada e vinculada como ${esc(p.vinculo_nome)}</b>Nenhuma data em andamento agora. Quando uma data for confirmada, os passos aparecem aqui.</div>`;
    }
    // Artista que já é da rede (vinculada, com datas) não precisa de inscrição: o aviso de inscrição sai.
    if (p.codigo_acesso && evs.length && (!i || ["rascunho", "aprovada"].includes(i.status))) { etapa = Math.max(etapa, 6); if (!i || i.status === "rascunho") agora = ""; }
    const comoFunciona = etapa < 2 ? `<h2>Como funciona</h2><div class="grid g3">${[["1", "Inscrição", "Release, links, rider e as cidades onde quer tocar. A pré-curadoria mostra na hora a força da inscrição."], ["2", "Curadoria", "A equipe do Tranquilo avalia e responde por aqui: aprovada, ajustes ou não seguiu desta vez."], ["3", "Datas", "Com a data confirmada, cada show ganha um passo a passo com prazos, do material de divulgação ao pós-show."]].map(([n, t, x]) => `<div class="card"><div class="kpi"><div class="v" style="color:var(--violet)">${n}</div></div><h3 style="margin-top:12px">${t}</h3><p class="muted" style="margin:0">${x}</p></div>`).join("")}</div>` : "";
    return `<div class="tag">Artista</div><h1>Olá, ${esc(p.nome || i?.dados?.nome_artistico || "")}</h1>
    <p class="sub">Aqui fica o que você precisa fazer em cada etapa, do cadastro ao pós-show.</p>
    ${linhaTempo(etapas, etapa)}${agora}${comoFunciona}
    ${evs.length ? `<h2>Suas datas</h2><p class="sub">Passo a passo de cada show, com prazo contado a partir da data. Marque o que já fez: a equipe acompanha por aqui.</p><div class="list">${evs.map((e) => blocoPassos(e, "artista")).join("")}</div>` : ""}`;
  }
  // Parte 1 da Ficha (Sua unidade): textos do modelo v1 e os combinados desta casa, registrados pela Central.
  // Combinado ainda não registrado aparece vazio (nunca um valor de exemplo ou de outra casa).
  const CONTATOS_FICHA = [["gui", "Operação, implantação, receitas e repasses", "Gui · Operações"], ["isa", "Datas, artistas e line-up", "Isa · Comercial e Artístico"], ["bruno", "Divulgação e materiais", "Bruno · Marketing"], ["zerrinha", "Comunidade e tripé social", "Zerrinha · Comunidade"]];
  function parteUmCasa(c) {
    const cb = c?.combinados || {}, nada = '<span class="muted">Ainda não registrado pela Operações</span>';
    const pct = (o, ks) => o && ks.every(([k]) => o[k] != null && o[k] !== "") ? ks.map(([k, t]) => `${esc(o[k])}% ${t}`).join(" · ") : nada;
    const eq = S.conta.equipe ? TQEquipe.cobertura(S.conta.equipe) : null;
    return `<section class="card fsec"><h3>Parte 1 · Sua unidade</h3><h4 style="margin:0 0 6px">Como vai funcionar</h4>
      <dl class="kv"><dt>Produtos</dt><dd>Tranquilo Descubra e Tranquilo Apresenta</dd><dt>Ingressos</dt><dd>Vendidos pela Ingresse, parceira do Tranquilo. As vendas são acompanhadas em conjunto pelo Tranquilo e pela casa.</dd><dt>Datas e artistas</dt><dd>Definidos com a Isa (Comercial e Artístico)</dd></dl>
      <h4 style="margin:12px 0 6px">Divisão das receitas</h4>
      <dl class="kv"><dt>Bilheteria</dt><dd>${pct(cb.bilheteria, [["artista", "Artista"], ["casa", "Casa"], ["tranquilo", "Tranquilo"]])}</dd><dt>Alimentos e bebidas</dt><dd>${pct(cb.aeb, [["casa", "Casa"], ["tranquilo", "Tranquilo"]])}</dd></dl>
      <p class="muted" style="font-size:13px">Custos logísticos apresentados e aprovados antes são descontados da bilheteria antes da divisão. O Tranquilo fecha cada data e faz os repasses nos prazos do contrato. Sem aluguel do espaço e sem promessa de lotação.</p>
      <h4 style="margin:12px 0 6px">Seus contatos no Tranquilo</h4>
      <div class="tbl-wrap" style="overflow-x:auto"><table class="tbl"><thead><tr><th>Assunto</th><th>Quem</th><th>Contato</th></tr></thead><tbody>${CONTATOS_FICHA.map(([k, a, q]) => `<tr><td>${esc(a)}</td><td>${esc(q)}</td><td>${cb.contatos?.[k] ? `WhatsApp ${esc(cb.contatos[k])}` : nada}</td></tr>`).join("")}</tbody></table></div>
      <h4 style="margin:12px 0 6px">Próximos passos</h4>
      <ul class="passos"><li class="${c ? "feito" : ""}"><b>Primeiras informações da casa</b> <span class="muted">· ${c ? "feito" : "a fazer"}</span></li>
      <li class="${c?.enviado_em ? "feito" : ""}"><b>Ler o Guia e devolver esta Ficha preenchida</b> <span class="muted">· até 3 dias após receber${c?.enviado_em ? " · feito" : ""}</span></li>
      <li><b>Conversa de alinhamento com a Operações, a partir das suas dúvidas</b> <span class="muted">· logo depois</span></li>
      <li class="${eq?.tripe ? "feito" : ""}"><b>Líder Local, anfitrião e social media definidos</b> <span class="muted">· até 10 dias após receber${eq?.tripe ? " · feito" : ""}</span></li>
      <li><b>Primeiras datas com a Isa</b> <span class="muted">· com a equipe definida</span></li></ul></section>`;
  }
  // "Sua equipe" da Ficha: mostra a Equipe da casa (a fonte é uma só; edita-se lá).
  // Respostas da Ficha em texto (WhatsApp/Tranks), na ordem do modelo do Gui. sensivel=false deixa de fora Dono A e repasses.
  function textoFicha(d, sensivel, equipe) {
    return F_CASA.filter(([, , , sens]) => sensivel || !sens).map(([titulo, , cs]) => `*${titulo}*\n` + cs.map(([k, rot, tipo, opts]) => { let v = valorCasa(d, k); if (Array.isArray(v)) v = v.map((x) => (opts || []).find(([o]) => o === x)?.[1] || x).join(", "); else if (tipo === "select") v = (opts.find(([o]) => o === v) || [, v])[1]; return `${rot}: ${v || ""}`; }).join("\n")).join("\n\n")
      + (equipe ? "\n\n*Sua equipe*\n" + [["lider", "Líder Local (produtor)", ["nome", "whatsapp", "email"]], ["anfitriao", "Anfitrião(ã)", ["nome", "whatsapp", "instagram"]], ["social_media", "Social Media", ["nome", "whatsapp", "instagram"]], ["som", "Técnico(a) de som", ["nome", "whatsapp", "observacao"]]]
        .map(([f, t, ks]) => { const m = equipe.find((x) => !x.reserva && (x.funcoes || []).includes(f)) || {}; return `${t}: ${ks.map((k) => m[k] || "").filter(Boolean).join(" · ")}`; }).join("\n") : "");
  }
  function equipeNaFicha() {
    const L = S.conta.equipe; if (L === undefined) carregarEquipeCasa();
    const de = (f) => (L || []).filter((m) => !m.reserva && (m.funcoes || []).includes(f));
    const bloco = (f, titulo, desc, campos) => `<div class="card"><b>${esc(titulo)}</b> <span class="muted" style="font-size:13px">${esc(desc)}</span>${(de(f).length ? de(f) : [{}]).map((m) => `<dl class="kv" style="margin-top:6px">${campos.map(([k, t]) => `<dt>${t}</dt><dd>${m[k] ? esc(m[k]) : ""}</dd>`).join("")}</dl>`).join("")}</div>`;
    return `<section class="card fsec"><h3>Sua equipe</h3><p class="muted" style="margin:-4px 0 10px;font-size:14px">Precisa estar completa antes do primeiro evento. Cada função é de uma pessoa diferente; a única exceção é o Dono A, que pode ser também o Líder Local. O bar é responsabilidade do Dono A: o Tranquilo não fala com a equipe de bar.</p>
      <div class="grid g2">${bloco("lider", "Líder Local (produtor)", "Tripé · conduz o dia do evento e fala com os artistas. Pode ser o próprio Dono A.", [["nome", "Nome"], ["whatsapp", "WhatsApp"], ["email", "E-mail"]])}
      ${bloco("anfitriao", "Anfitrião(ã)", "Tripé · conduz o público durante o evento", [["nome", "Nome"], ["whatsapp", "WhatsApp"], ["instagram", "Instagram"]])}
      ${bloco("social_media", "Social Media", "Tripé · registra o evento de acordo com o briefing", [["nome", "Nome"], ["whatsapp", "WhatsApp"], ["instagram", "Instagram"]])}
      ${bloco("som", "Técnico(a) de som", "", [["nome", "Nome"], ["whatsapp", "WhatsApp"], ["observacao", "Observação"]])}</div>
      <div class="barra-acoes"><button class="btn sm" data-ir="equipe_casa">Editar a equipe</button></div></section>`;
  }
  function passosCasa() {
    const p = S.conta.perfil, c = S.conta.casa, evs = eventosDaConta();
    if (funcoesDe()) return `<div class="tag">${esc(nomesFuncoes(funcoesDe()))}</div><h1>${esc(p.vinculo_nome || "Sua casa")}</h1>
      <p class="sub">Os passos de cada data que são da sua função, com prazo. O que você marca vale para a casa inteira: o responsável e a Central acompanham.</p>
      ${evs.length ? `<h2>Datas da casa</h2><div class="list">${evs.map((e) => blocoPassos(e, "casa")).join("")}</div>` : vazio("Nenhuma data confirmada ainda", "Quando o Tranquilo repassar uma data para a casa, os passos da sua função aparecem aqui.", "", "passos")}`;
    // O status da habilitação e o que falta ficam na Ficha da Casa (uma fonte só); aqui, só o aviso com o atalho.
    const aviso = !c || c.status !== "habilitada" ? `<div class="alert ${c?.status === "suspensa" ? "crit" : "warn"}" style="margin-bottom:12px"><b>${!c ? "A Ficha da Casa ainda não foi enviada" : c.status === "suspensa" ? "Casa suspensa" : `Ficha: ${esc(STATUS_CASA[c.status]?.[1] || c.status)}`}</b>${c?.parecer ? esc(c.parecer) + " " : ""}<div class="barra-acoes" style="margin-top:8px"><button class="btn sm" data-ir="cadastro_casa">Abrir a Ficha da Casa</button></div></div>` : "";
    return `<div class="tag">Datas</div><h1>Datas confirmadas</h1>
    <p class="sub">Depois que o Tranquilo repassa a data, a casa produz o show e marca cada passo, com prazo. O Tranquilo acompanha por aqui, sem precisar perguntar.</p>
    ${aviso}
    ${evs.length ? `<div class="list">${evs.map((e) => blocoPassos(e, "casa")).join("")}</div>` : vazio("Nenhuma data confirmada ainda", "Quando o Tranquilo repassar uma data para a casa, o passo a passo aparece aqui. Para o Tranquilo saber quando a casa pode receber shows, preencha a Disponibilidade.", `<button class="btn" data-ir="agenda_casa">Abrir a disponibilidade</button>`, "passos")}
    ${S.conta.reg.length ? `<h2>Noites registradas</h2><div class="list">${S.conta.reg.map((r) => `<div class="card row"><span>${esc(S.pac?.eventos.find((e) => e.id === r.evento_id)?.n || r.evento_id)}</span><span>${r.publico != null ? fmt(r.publico) + " pessoas" : ""} ${r.gravidade === "excecao" ? '<span class="badge b-crit">exceção</span>' : ""}</span></div>`).join("")}</div>` : ""}`;
  }

  const CLASSE = { confiavel: "🟢 Confiável", desenvolvimento: "🟡 Desenvolvimento", correcao: "🔴 Correção necessária", suspenso: "⛔ Suspensa" };
  const carregando = (o) => `<p class="muted">Carregando ${o}…</p>`;
  const faltaSchema = (aba) => `<div class="tag">${aba}</div><h1>Falta atualizar o banco</h1><div class="alert warn"><b>Esta aba precisa da versão nova do banco.</b>No Supabase, abra SQL Editor → New query, cole o arquivo supabase/schema.sql inteiro e clique em Run. Ele é seguro de rodar de novo e não apaga nada. Depois recarregue esta página.</div>`;
  // Campanhas e materiais (Hub): carregados quando a aba abre; S.hub = null força recarregar.
  async function carregarHub() {
    if (S.hubCarregando) return; S.hubCarregando = true;
    const quem = S.conta?.perfil.id, equipe = ["equipe", "adm"].includes(S.conta?.perfil.tipo);
    try {
      const [camp, mat, and] = await Promise.all([api.hubCampanhas(), api.hubMateriais(), equipe ? api.andamentoCampanhas() : Promise.resolve([])]);
      if (S.conta?.perfil.id !== quem) return;
      S.hub = { ...camp, ...mat, andamento: and };
    } catch (e) {
      if (!S.conta) return;
      S.hub = { erro: traduz(e.message || "") };
    } finally { S.hubCarregando = false; }
    render();
  }
  const hojeSP = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const linkAcao = (l) => /^https:\/\//i.test(l.url || "") ? `<a class="btn sm" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.rotulo || "abrir")}</a>` : "";
  // Google Docs, Planilhas e Apresentações: o endereço /copy abre direto o "Fazer uma cópia" (o original fica protegido).
  function urlCopia(url) {
    const m = String(url).match(/^https:\/\/docs\.google\.com\/(document|spreadsheets|presentation)\/d\/([\w-]{20,})/);
    return m ? `https://docs.google.com/${m[1]}/d/${m[2]}/copy` : null;
  }
  // Equipe: publicar nova versão (com ou sem nova confirmação de leitura) e cadastrar material novo, sem SQL.
  function formMateriais(H) {
    const ops = H.materiais.map((m) => `<option value="${m.id}">${esc(m.titulo)}${m.casa_ref ? " · " + esc(m.casa_ref) : ""}</option>`).join("");
    const casas = [...new Set([...(H.campanhas || []).map((c) => c.casa_ref), ...H.materiais.map((m) => m.casa_ref)].filter(Boolean))];
    const tipos = ["guia", "playbook", "template", "briefing", "checklist", "politica", "termo", "outro"];
    return `<details class="card" style="margin-bottom:12px"${S.matAberto ? " open" : ""}><summary><b>Publicar nova versão ou material novo</b></summary>
      <p class="muted" style="font-size:13px">Peça nova confirmação de leitura só quando a mudança altera o que a casa faz (campanha, playbook do Apresenta, funções de anfitrião e social media). Ajuste de texto ou visual: publique sem pedir.</p>
      <h3>Nova versão</h3>
      ${ops ? `<div class="grid g2"><label>Material<select id="mvMat">${ops}</select></label><label>Versão<input id="mvVer" maxlength="20" placeholder="ex.: 2 ou 2026-11"></label></div>
      <label>O que mudou<input id="mvRes" maxlength="200" placeholder="ex.: novo roteiro do anfitrião"></label>
      <label>Link desta versão (opcional)<input id="mvUrl" type="url" placeholder="https://… (vazio = mesmo link de sempre)"></label>
      <label class="fcheck"><input type="checkbox" id="mvCie"> <span>Muda o que a casa faz: pedir "Li e estou ciente" de novo</span></label>
      <div class="barra-acoes"><button class="btn pri" data-mat-versao>Publicar versão</button></div>` : `<p class="muted">Cadastre um material primeiro.</p>`}
      <h3>Material novo</h3>
      <div class="grid g2"><label>Título<input id="mnTit" maxlength="160" placeholder="ex.: Função do anfitrião"></label><label>Tipo<select id="mnTipo">${tipos.map((t) => `<option>${t}</option>`).join("")}</select></label></div>
      <label>Link (Google Docs, Notion, Canva…)<input id="mnUrl" type="url" placeholder="https://"></label>
      <div class="filters" style="margin-bottom:0"><label class="fcheck"><input type="checkbox" id="mnCasa" checked> Casas</label><label class="fcheck"><input type="checkbox" id="mnArt"> Artistas</label></div>
      <label>Só para uma casa (opcional)<input id="mnRef" list="mnRefs" placeholder="vazio = todas as casas"><datalist id="mnRefs">${casas.map((c) => `<option value="${esc(c)}">`).join("")}</datalist></label>
      <label class="fcheck"><input type="checkbox" id="mnCie"> <span>Pedir "Li e estou ciente"</span></label>
      <div class="barra-acoes"><button class="btn pri" data-mat-novo>Cadastrar material</button></div>
      <div class="err" id="materr" role="alert"></div></details>`;
  }
  const slugDe = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
  // Equipe: carregar ou atualizar a campanha de uma casa a partir da página ou do arquivo de dados do Bruno.
  function formCampanha(H) {
    const P = S.campPrevia;
    const casas = [...new Set([...(S.eq?.conv || []).filter((c) => c.tipo === "casa" && c.vinculo_nome).map((c) => c.vinculo_nome), ...H.campanhas.map((c) => c.casa_ref)].filter(Boolean))].sort();
    const existe = P && H.campanhas.find((c) => c.slug === P.slug);
    const nAcoes = P ? P.itens.reduce((n, i) => n + i.acoes.length, 0) : 0;
    return `<details class="card" style="margin-top:14px"${P || S.campAberto ? " open" : ""}><summary><b>Carregar ou atualizar a campanha de uma casa</b></summary>
      <p class="muted" style="font-size:13px">Use a página da campanha salva do Bruno (.html) ou o arquivo de dados da casa (.json). O texto continua sendo dele; aqui fica só o "feito" de cada dia. Atualizar não apaga o que a casa já marcou, e dia retirado sai da campanha.</p>
      <label>Arquivo da campanha<input type="file" id="cfArq" accept=".html,.htm,.json,text/html,application/json"></label>
      ${P ? `<div class="alert ${P.avisos.length ? "warn" : "good"}" style="margin:10px 0"><b>${P.itens.length} dias e ${nAcoes} ações lidos de ${esc(P.arquivo)}</b>De ${dt(P.itens[0].dia)} a ${dt(P.itens[P.itens.length - 1].dia)}.${P.avisos.map((a) => " " + esc(a)).join("")}</div>
      <div class="grid g2"><label>Casa (como no convite)<input id="cfCasa" list="cfCasas" value="${esc(P.casa)}"><datalist id="cfCasas">${casas.map((c) => `<option value="${esc(c)}">`).join("")}</datalist></label>
      <label>Identificador<input id="cfSlug" value="${esc(P.slug)}" pattern="[a-z0-9-]+"></label></div>
      <div class="grid g2"><label>Título<input id="cfTit" value="${esc(P.titulo)}"></label><label>Link da página da campanha (opcional)<input id="cfFonte" type="url" value="${esc(P.fonte_url || "")}" placeholder="https://"></label></div>
      <p class="muted" style="font-size:13px">${existe ? `Vai <b>atualizar</b> a campanha que já existe (${esc(existe.casa_ref)} · ${esc(existe.titulo)}).` : "Vai criar uma campanha nova."}</p>
      <label class="fcheck"><input type="checkbox" id="cfCie"${existe ? "" : " checked"}> <span>Pedir "Li e estou ciente" da campanha para a casa${existe ? " (marque se a mudança altera o que a casa faz)" : ""}</span></label>
      <div class="barra-acoes"><button class="btn pri" data-camp-importar>${existe ? "Atualizar campanha" : "Carregar campanha"}</button><button class="btn" data-camp-limpar>Cancelar</button></div>` : ""}
      <div class="err" id="camperr" role="alert"></div></details>`;
  }
  // Equipe: cada casa ligada por convite, com formato (completa = tem material só dela), campanha e leituras pendentes.
  function coberturaCasas(H) {
    const E = S.eq; if (!E?.conv) return "";
    const k = (s) => String(s || "").trim().toLowerCase();
    const grupos = {};
    for (const c of E.conv.filter((c) => c.tipo === "casa" && c.vinculo_nome)) (grupos[k(c.vinculo_nome)] ||= { nome: c.vinculo_nome, conv: [] }).conv.push(c);
    if (!Object.keys(grupos).length) return "";
    const vig = (mid) => H.versoes.find((v) => v.material_id === mid);
    const linhas = Object.values(grupos).map((g) => {
      const proprios = H.materiais.filter((m) => k(m.casa_ref) === k(g.nome));
      const pedem = H.materiais.filter((m) => (m.publico || []).includes("casa") && (!m.casa_ref || k(m.casa_ref) === k(g.nome))).map((m) => vig(m.id)).filter((v) => v?.exige_ciencia);
      const pessoas = g.conv.filter((c) => c.aceito_em).map((c) => (E.perfis || []).find((p) => k(p.email) === k(c.email))).filter(Boolean);
      const faltam = pessoas.reduce((n, p) => n + pedem.filter((v) => !(H.todas || []).some((c) => c.versao_id === v.id && c.user_id === p.id)).length, 0);
      const and = (H.andamento || []).find((a) => k(a.casa_ref) === k(g.nome));
      return { nome: g.nome, pessoas: pessoas.length, convPend: g.conv.filter((c) => !c.aceito_em).length, formato: proprios.length ? "completa" : "leve", proprios: proprios.length, and, faltam };
    });
    return `<h2>Casas no hub</h2><p class="sub">Formato <b>completa</b>: a casa tem materiais feitos para ela (como o Rooftap). <b>Leve</b>: só os materiais padrão. Leituras pendentes = confirmações que ainda faltam das pessoas da casa.</p>
      ${tabela("cobcasas", [
        { t: "Casa", v: (r) => r.nome, h: (r) => `<b>${esc(r.nome)}</b>` },
        { t: "Pessoas", n: 1, v: (r) => r.pessoas, h: (r) => `${r.pessoas}${r.convPend ? ` <span class="muted">+${r.convPend} convite${r.convPend > 1 ? "s" : ""} aberto${r.convPend > 1 ? "s" : ""}</span>` : ""}` },
        { t: "Formato", v: (r) => r.formato, h: (r) => r.formato === "completa" ? `completa <span class="muted">(${r.proprios} doc${r.proprios > 1 ? "s" : ""})</span>` : "leve" },
        { t: "Campanha", v: (r) => r.and ? r.and.feitos / (r.and.dias || 1) : -1, h: (r) => r.and ? `${r.and.feitos}/${r.and.dias}${r.and.atrasados ? ` <span class="badge b-crit">${r.and.atrasados} atrasado${r.and.atrasados > 1 ? "s" : ""}</span>` : ""}` : `<span class="muted">sem campanha</span>` },
        { t: "Leituras pendentes", n: 1, v: (r) => r.faltam, h: (r) => r.faltam ? `<span class="badge b-warn">${r.faltam}</span>` : "0" },
      ], linhas, { i: 0, dir: 1 }, "")}`;
  }
  // Depois de carregar a campanha: pede ciência numa versão nova do material "campanha-<identificador>" (cria se não houver).
  async function pedirCienciaCampanha(d) {
    const slug = ("campanha-" + d.slug).slice(0, 80), m = S.hub?.materiais?.find((x) => x.slug === slug);
    const versao = new Date().toISOString().slice(0, 16).replace("T", " ");
    const site = /^https:/.test(location.origin) ? location.origin + location.pathname + "#/campanha" : "https://marinacollier.github.io/tranquilo-rede/#/campanha";
    if (m) await api.publicarVersao({ material_id: m.id, versao, resumo: "Campanha atualizada", exige_ciencia: true });
    else await api.novoMaterial({ slug, titulo: d.titulo.length >= 3 ? d.titulo.slice(0, 160) : `Campanha ${d.casa}`.slice(0, 160), tipo_material: "checklist", publico: ["casa"], fonte_url: d.fonte_url || site, casa_ref: d.casa, fonte_tipo: "site_bruno" }, { versao, resumo: "Campanha carregada", exige_ciencia: true });
  }
  // Campanha em arquivo de calendário (.ics): os mesmos dias e ações da tela, para importar no Google Agenda.
  function icsCampanha(c, itens) {
    const e = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/([,;])/g, "\\$1").replace(/\r?\n/g, "\\n");
    const dobra = (l) => { const out = []; let cur = "", n = 0;   // linhas de até 75 bytes, como pede o formato
      for (const ch of l) { const b = new TextEncoder().encode(ch).length; if (n + b > 73) { out.push(cur); cur = ""; n = 0; } cur += ch; n += b; }
      return [...out, cur].join("\r\n "); };
    const d8 = (iso) => iso.replace(/-/g, ""), mais1 = (iso) => new Date(Date.parse(iso + "T12:00:00Z") + 864e5).toISOString().slice(0, 10);
    const ev = itens.map((i) => {
      const canais = [...new Set((i.acoes || []).map((a) => a.canal).filter(Boolean))].join(", ");
      const desc = (i.acoes || []).map((a) => `${a.canal || ""}${a.show ? " · " + a.show : ""}: ${a.texto || ""}${(a.links || []).map((l) => `\n${l.rotulo || "link"}: ${l.url}`).join("")}`).join("\n\n");
      return ["BEGIN:VEVENT", `UID:${i.id}@rede-tranquilo`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
        `DTSTART;VALUE=DATE:${d8(i.dia)}`, `DTEND;VALUE=DATE:${d8(mais1(i.dia))}`, `SUMMARY:${e(`Campanha ${c.casa_ref || ""}: ${canais || i.rotulo || ""}`)}`,
        `DESCRIPTION:${e(desc + "\n\nMarque como feito no painel: " + location.origin + location.pathname)}`, "END:VEVENT"].map(dobra).join("\r\n");
    });
    return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Rede Tranquilo//Campanha//PT", "CALSCALE:GREGORIAN", `X-WR-CALNAME:${e(c.titulo)}`, ...ev, "END:VCALENDAR"].join("\r\n") + "\r\n";
  }
  // Um dia da campanha: ações (canal, show, texto, links) e o "feito" compartilhado pela casa.
  function diaCampanha(i, feitos, podeMarcar) {
    const f = feitos[i.id], hoje = hojeSP(), atrasado = !f && i.dia < hoje, ehHoje = i.dia === hoje;
    const quem = f ? (f.feito_por === S.conta.perfil.id ? "por você" : "por alguém da casa") : "";
    return `<div class="card camp-dia${f ? " feito" : atrasado ? " atrasado" : ehHoje ? " hoje" : ""}">
      <div class="row"><b>${esc(i.rotulo || dt(i.dia))}${ehHoje ? ' <span class="badge b-warn">hoje</span>' : ""}${atrasado ? ' <span class="badge b-crit">atrasado</span>' : ""}</b>
      ${podeMarcar ? `<label class="fcheck" style="margin:0"><input type="checkbox" data-camp-feito="${i.id}"${f ? " checked" : ""}> Feito</label>` : f ? '<span class="badge b-good">feito</span>' : ""}</div>
      ${f ? `<div class="muted" style="font-size:12px;margin-top:2px">Marcado ${quem} em ${new Date(f.feito_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</div>` : ""}
      <ul class="passos" style="margin-top:8px">${(i.acoes || []).map((a) => `<li><b>${esc(a.canal || "")}</b>${a.show ? ` <span class="muted">· ${esc(a.show)}</span>` : ""}<br><span style="font-size:14px">${esc(a.texto || "")}</span>${(a.links || []).length ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">${a.links.map(linkAcao).join("")}</div>` : ""}</li>`).join("")}</ul></div>`;
  }
  async function carregarEquipe() {
    if (S.eqCarregando) return; S.eqCarregando = true;
    try {
      const quem = S.conta?.perfil.id;
      // Convites e avisos são da versão nova do banco: se o schema ainda não foi atualizado, o resto continua funcionando.
      const novo = (pr) => pr.catch(() => null);
      const [insc, casas, perfis, chk, reg, conv, avisos, relatos, docs, arqs, contr, modContr, sol, disp] = await Promise.all([api.inscricoes(), api.casas(), api.perfis(), api.checklistTodos(), api.registrosTodos(), novo(api.convites()), novo(api.avisos()), novo(api.relatos()), novo(api.documentos()), novo(api.arquivosTodos()), novo(api.contratos()), novo(api.modelosContrato()), novo(api.solicitacoesTodas()), novo(api.disponibilidade())]);
      if (S.conta?.perfil.id !== quem) return;   // a conta mudou enquanto carregava
      S.eq = { insc, casas, perfis, chk, reg, conv, avisos, relatos, docs, arqs, contr, modContr, sol: sol || [], disp: disp || [] };
    } catch (e) {
      if (!S.conta) return;
      S.eq = { insc: [], casas: [], perfis: [], chk: [], reg: [], conv: [], avisos: [] }; alert("Não foi possível carregar: " + e.message);
    } finally { S.eqCarregando = false; }
    render();
  }
  function seletorVinculo(p) {
    const acessos = (S.pac?.acessos || []).filter((a) => a.tipo === p.tipo);
    if (p.vinculo_pedido && !p.codigo_acesso) {
      const certo = acessos.find((a) => a.codigo === p.vinculo_pedido);
      return `<div><span class="badge b-warn">pediu: ${esc(p.vinculo_pedido_nome || "?")}</span> ${certo ? `<button class="btn sm" data-vinculo-confirmar="${p.id}">Confirmar</button>` : `<span class="muted" style="font-size:12px">código não confere com ${acessos.length ? "nenhuma conta da rede" : "o pacote (entre com o código de adm)"}</span>`} <button class="btn sm" data-vinculo-recusar="${p.id}">Recusar</button></div>`;
    }
    if (!acessos.length) return p.vinculo_nome ? esc(p.vinculo_nome) : `<span class="muted">entre com o código de adm para vincular</span>`;
    return `<select data-vinculo="${p.id}"><option value="">Sem vínculo</option>${acessos.map((a) => `<option value="${esc(a.codigo)}|${esc(a.nome)}"${p.codigo_acesso === a.codigo ? " selected" : ""}>${esc(a.nome)}${a.cidades ? " · " + esc(a.cidades) : ""}</option>`).join("")}</select>`;
  }

  // ---------- fichas para a equipe ----------
  function fichaInscricao(id) {
    const i = S.eq.insc.find((x) => x.id === id); if (!i) return;
    const d = i.dados, adm = S.conta.perfil.tipo === "adm";
    const resp = F_ARTISTA.map(([t, cs]) => `<h3>${esc(t)}</h3><dl class="kv">${cs.map(([k, rot, tipo, opts]) => { let v = d[k]; if (tipo === "select") v = (opts.find(([o]) => o === v) || [, v])[1]; if (tipo === "cidades") v = (v || []).join(", "); if (tipo === "check") v = v === "true" ? "Sim" : "Não"; const link = tipo === "url" && v ? `<a href="${esc(v)}" target="_blank" rel="noopener">${esc(v)}</a>` : esc(v || "–"); return `<dt>${esc(rot)}</dt><dd>${link}</dd>`; }).join("")}</dl>`).join("");
    $("#dlgIn").innerHTML = `<div class="tag">Inscrição · ${badge(STATUS_INSC, i.status)}</div><h2 style="margin-top:4px">${esc(d.nome_artistico || "(sem nome)")}</h2><p class="muted">${esc(i.perfil?.email || "")}${i.enviado_em ? ` · enviada em ${dt(i.enviado_em.slice(0, 10))}` : ""}</p>
    ${medidor({ score: i.score ?? 0, faixa: i.faixa || "–", detalhe: i.score_detalhe || { completude: 0, tracao: 0, tecnica: 0, circulacao: 0, condicoes: 0 }, alertas: i.alertas || [] })}
    ${resp}
    <h3>Decisão</h3><label class="fcampo"><b>Mensagem para a artista</b><textarea id="parecer" rows="3">${esc(i.parecer || "")}</textarea></label>
    <label class="fcampo"><b>Nota interna (só a equipe vê)</b><textarea id="nota" rows="2">${esc(i.nota_interna || "")}</textarea></label>
    ${adm && i.perfil ? `<label class="fcampo"><b>Vincular à artista da rede (libera métricas)</b>${seletorVinculo(i.perfil)}</label>` : ""}
    <div class="barra-acoes"><button class="btn pri" data-decisao="aprovada">Aprovar</button><button class="btn" data-decisao="ajustes">Pedir ajustes</button><button class="btn" data-decisao="reprovada">Não seguir</button><button class="btn" data-copiar-ficha>Copiar ficha</button><button class="btn" onclick="dlg.close()">Fechar</button></div><div class="err" role="status" aria-live="polite" id="derr"></div>`;
    $("#dlg").dataset.alvo = "insc:" + id; $("#dlg").showModal();
  }
  function fichaCasa(id) {
    const c = S.eq.casas.find((x) => x.id === id); if (!c) return;
    const d = c.dados, adm = S.conta.perfil.tipo === "adm", pend = c.pendencias || R.pendenciasCasa(d);
    // Dados pessoais do Dono A e dados bancários: só a administração vê (a equipe vê que existem).
    const resp = F_CASA.map(([t, , cs, sens]) => `<h3>${esc(t)}</h3>${sens && !adm ? `<p class="muted" style="font-size:13px">Dados pessoais e bancários: só a administração vê. ${cs.filter((x) => valorCasa(d, x[0])).length} de ${cs.length} campos preenchidos.</p>` : `<dl class="kv">${cs.map(([k, rot, tipo, opts]) => { let v = valorCasa(d, k); if (Array.isArray(v)) v = v.map((x) => (opts || []).find(([o]) => o === x)?.[1] || x).join(", "); else if (tipo === "select") v = (opts.find(([o]) => o === v) || [, v])[1]; return `<dt>${esc(rot.length > 60 ? rot.slice(0, 60) + "…" : rot)}</dt><dd>${esc(v || "")}</dd>`; }).join("")}</dl>`}`).join("");
    const cb = c.combinados || {}, sols = (S.eq.sol || []).filter((x) => x.casa_id === c.id && x.status === "pendente");
    const rotulo = (k) => F_CASA.flatMap(([, , cs]) => cs).find((x) => x[0] === k)?.[1] || k;
    const pedidos = sols.map((x) => `<div class="card" style="margin-bottom:8px"><b>Pedido de atualização de ${dt(x.criado_em.slice(0, 10))}</b>${x.mensagem ? `<div class="muted" style="font-size:13px">${esc(x.mensagem)}</div>` : ""}
      <div class="tbl-wrap" style="overflow-x:auto"><table class="tbl"><thead><tr><th>Campo</th><th>Antes</th><th>Proposto</th></tr></thead><tbody>${Object.keys(x.proposto).map((k) => `<tr><td>${esc(rotulo(k))}</td><td>${esc(JSON.stringify(x.antes?.[k] ?? "").replace(/^"|"$/g, ""))}</td><td><b>${esc(JSON.stringify(x.proposto[k] ?? "").replace(/^"|"$/g, ""))}</b></td></tr>`).join("")}</tbody></table></div>
      <label class="fcampo"><b>Resposta para a casa (opcional)</b><input data-sol-resp="${x.id}" maxlength="1000"></label>
      <div class="barra-acoes"><button class="btn pri sm" data-sol-responder="${x.id}|1">Aprovar e atualizar a ficha</button><button class="btn sm" data-sol-responder="${x.id}|0">Recusar</button></div></div>`).join("");
    const combinados = `<h3>Combinados da parceria (Parte 1 da Ficha)</h3><p class="muted" style="font-size:13px">A casa vê estes valores na Ficha. Em branco, aparece "Ainda não registrado pela Operações".</p>
      <div class="grid g3"><label class="fcampo"><b>Bilheteria: artista %</b><input data-cb="bilheteria.artista" inputmode="numeric" value="${esc(cb.bilheteria?.artista ?? "")}"></label><label class="fcampo"><b>Bilheteria: casa %</b><input data-cb="bilheteria.casa" inputmode="numeric" value="${esc(cb.bilheteria?.casa ?? "")}"></label><label class="fcampo"><b>Bilheteria: Tranquilo %</b><input data-cb="bilheteria.tranquilo" inputmode="numeric" value="${esc(cb.bilheteria?.tranquilo ?? "")}"></label>
      <label class="fcampo"><b>Alimentos e bebidas: casa %</b><input data-cb="aeb.casa" inputmode="numeric" value="${esc(cb.aeb?.casa ?? "")}"></label><label class="fcampo"><b>Alimentos e bebidas: Tranquilo %</b><input data-cb="aeb.tranquilo" inputmode="numeric" value="${esc(cb.aeb?.tranquilo ?? "")}"></label></div>
      <div class="grid g2">${CONTATOS_FICHA.map(([k, , q]) => `<label class="fcampo"><b>WhatsApp de ${esc(q)}</b><input data-cb="contatos.${k}" maxlength="30" value="${esc(cb.contatos?.[k] ?? "")}"></label>`).join("")}</div>
      <div class="barra-acoes"><button class="btn sm" data-cb-salvar="${c.id}">Salvar combinados</button></div>`;
    $("#dlgIn").innerHTML = `<div class="tag">Casa · ${badge(STATUS_CASA, c.status)}</div><h2 style="margin-top:4px">${esc(d.nome || "(sem nome)")}</h2><p class="muted">${esc(c.perfil?.email || "")} · ${c.ja_parceira ? "já parceira" + (c.notion_casa_id && c.notion_casa_id !== "outra" ? ` · <a href="https://www.notion.so/${esc(c.notion_casa_id)}" target="_blank" rel="noopener">ficha no Notion</a>` : "") : "casa nova"}</p>
    <div class="grid g3">${[["habilitacao", "Bloqueia habilitação"], ["match", "Bloqueia match"], ["enriquecimento", "Enriquecimento"]].map(([k, t]) => `<div class="card"><b>${t}</b> (${pend[k].length})<div style="font-size:13px">${pend[k].map(esc).join(" · ") || "ok"}</div></div>`).join("")}</div>
    ${pedidos}
    ${resp}
    <div class="barra-acoes" style="margin:8px 0"><button class="btn sm" data-tranks="${c.id}" title="Copia todos os dados desta Ficha em formato de pergunta para a Tranks.">Copiar Ficha para a Tranks</button><span class="muted" style="font-size:12px" id="tranksOk"></span></div>
    ${combinados}
    <h3>Decisão</h3><label class="fcampo"><b>Classificação</b><select id="classe"><option value="">Sem classificação (antes da 1ª data)</option>${Object.entries(CLASSE).map(([k, t]) => `<option value="${k}"${c.classificacao === k ? " selected" : ""}>${t}</option>`).join("")}</select></label>
    <label class="fcampo"><b>Mensagem para a casa</b><textarea id="parecer" rows="3">${esc(c.parecer || "")}</textarea></label>
    <label class="fcampo"><b>Nota interna</b><textarea id="nota" rows="2">${esc(c.nota_interna || "")}</textarea></label>
    ${adm && c.perfil ? `<label class="fcampo"><b>Vincular à casa da rede (libera métricas)</b>${seletorVinculo(c.perfil)}</label>` : ""}
    <div class="barra-acoes"><button class="btn pri" data-decisao="habilitada">Habilitar</button><button class="btn" data-decisao="ajustes">Pedir ajustes</button><button class="btn" data-decisao="suspensa">Suspender</button><button class="btn" data-decisao="">Só salvar</button><button class="btn" onclick="dlg.close()">Fechar</button></div><div class="err" role="status" aria-live="polite" id="derr"></div>`;
    $("#dlg").dataset.alvo = "casa:" + id; $("#dlg").showModal();
  }
  function fichaRegistro(eventoId) {
    const e = S.pac?.eventos.find((x) => x.id === eventoId);
    $("#dlgIn").innerHTML = `<div class="tag">Registrar a noite</div><h2 style="margin-top:4px">${e ? `${dt(e.d)} · ${esc(e.c)}` : ""}</h2><p class="sub">Problema ordinário: resolva e registre. Exceção crítica: registre e avise a equipe na hora.</p>
    <label class="fcampo"><b>Público presente (pessoas)</b><input id="rpub" type="text" inputmode="numeric" placeholder="ex.: 120"></label>
    <label class="fcampo"><b>Ocorrência (opcional)</b><textarea id="rocc" rows="3" placeholder="O que aconteceu"></textarea></label>
    <label class="fcampo"><b>Gravidade</b><select id="rgrav"><option value="ordinaria">Ordinária: resolvida pela casa</option><option value="excecao">Exceção crítica: precisa do Tranquilo</option></select></label>
    <label class="fcampo"><b>Como resolveu</b><textarea id="rres" rows="2"></textarea></label>
    <div class="barra-acoes"><button class="btn pri" id="rsalvar">Registrar</button><button class="btn" onclick="dlg.close()">Cancelar</button></div><div class="err" role="status" aria-live="polite" id="derr"></div>`;
    $("#dlg").dataset.alvo = "reg:" + eventoId; $("#dlg").showModal();
  }

  // ---------- entrada (público) ----------
  function formEntrada() {
    const modo = S.entrada || "entrar";
    const demo = avisoConta();
    const tipoSel = S.tipoNovo || "artista";
    const email = modo === "criar" ? `<h3>Criar conta</h3><p class="dica">Leva um minuto. Depois você completa a inscrição ou a ficha da casa no seu ritmo.</p>
      <div class="seg" role="radiogroup" aria-label="Tipo de conta"><label><input type="radio" name="tipoNovo" value="artista"${tipoSel === "artista" ? " checked" : ""}> Sou artista</label><label><input type="radio" name="tipoNovo" value="casa"${tipoSel === "casa" ? " checked" : ""}> Tenho uma casa</label></div>
      <label class="fcampo"><b>${tipoSel === "casa" ? "Seu nome (responsável)" : "Nome artístico"}</b><input id="enome" autocomplete="name"></label>
      <label class="fcampo"><b>E-mail</b><input id="email" type="email" autocomplete="email" placeholder="voce@email.com"></label>
      <label class="fcampo"><b>Senha</b><input id="esenha" type="password" autocomplete="new-password" minlength="8" placeholder="pelo menos 8 caracteres"></label>
      <div class="err" role="status" aria-live="polite" id="eerr"></div><button class="btn pri lg" id="eok" style="width:100%">Criar conta</button>
      <p class="aceite-legal">Ao criar a conta, você concorda com os <a href="https://tranquilomusica.com.br/termos-de-uso" target="_blank" rel="noopener">Termos de Uso</a> e a <a href="https://tranquilomusica.com.br/politica-de-privacidade" target="_blank" rel="noopener">Política de Privacidade</a> do Tranquilo.</p>
      <p class="links">Já tem conta? <a href="#" data-entrada="entrar">Entrar</a></p>`
      : `<h3>Entrar</h3><p class="dica">Com o e-mail e a senha da sua conta.</p>
      <label class="fcampo"><b>E-mail</b><input id="email" type="email" autocomplete="email" placeholder="voce@email.com"></label>
      <label class="fcampo"><b>Senha</b><input id="esenha" type="password" autocomplete="current-password"></label>
      <div class="err" role="status" aria-live="polite" id="eerr"></div><button class="btn pri lg" id="eok" style="width:100%">Entrar</button>
      <p class="links"><a href="#" data-entrada="criar">Criar conta de artista ou casa</a> · <a href="#" id="esqueci">Esqueci a senha</a></p>`;
    return `${demo}<div class="entrada"><div class="card login" style="max-width:none">${email}</div><div class="card login" style="max-width:none"><h3>Recebeu um código?</h3><p class="dica">A equipe manda um código XXXX-XXXX-XXXX para quem já está na rede. Ele abre o seu painel sem senha.</p>${formLogin()}</div></div>`;
  }
  async function aposEntrar(perfil) { await carregar(perfil); TQDiario.registrar("entrou_conta", { tipo: S.conta.perfil.tipo, vinculada: !!S.conta.perfil.codigo_acesso }); render(); scrollTo(0, 0); primeiroAcesso(); }

  // ---------- primeiro acesso: senha e tutorial ----------
  function primeiroAcesso() {
    const p = S.conta?.perfil; if (!p) return;
    if (p.senha_definida === false || api.precisaSenha?.()) return pedirSenha();
    if (TQTour.aberto()) return;
    if (!p.tutorial_visto_em) abrirTutorial(roteiroConta(), true);
    // Quem já viu o tutorial antes de partes novas entrarem recebe só as novidades do que o acesso dele tem.
    else if (TQTour.temNovidades(p.tutorial_visto_em)) abrirTutorial(roteiroConta(), true, p.tutorial_visto_em);
  }
  function abrirTutorial(tipo, primeira, desde) {
    TQTour.abrir(tipo, { desde, primeira, chave: "conta-" + tipo, dicaRever: S.conta ? "aba Conta → \"Ver o tutorial de novo\", ou \"Como funciona\" no menu" : null,
      // Atalhos para abas só fazem sentido com a conta aberta; pelo link público o tutorial é só leitura.
      aoIr: S.conta ? (aba) => { if (S.conta && (abas().some(([k]) => k === aba) || areaDe(aba))) { irPara(aba); render(); scrollTo(0, 0); } } : null,
      temAba: S.conta ? (aba) => abas().some(([k]) => k === aba) || !!areaDe(aba) : null,
      aoFechar: async (visto) => {
        if (!visto || !S.conta) return;
        S.conta.perfil.tutorial_visto_em = new Date().toISOString();
        try { await api.marcarTutorial(); } catch { /* fica para a próxima vez */ }
      },
    });
  }
  function pedirSenha() {
    $("#dlgIn").innerHTML = `<div class="tag">Primeiro acesso</div><h2 style="margin-top:4px">Crie a sua senha</h2>
    <p class="sub">Você entrou pelo link do e-mail. Escolha uma senha para as próximas vezes.</p>
    <label class="fcampo"><b>Nova senha</b><input id="ns1" type="password" autocomplete="new-password" minlength="8"></label>
    <label class="fcampo"><b>Repita a senha</b><input id="ns2" type="password" autocomplete="new-password" minlength="8"></label>
    <div class="err" role="status" aria-live="polite" id="nserr"></div><div class="barra-acoes"><button class="btn pri" id="nsok">Salvar senha</button></div>`;
    $("#dlg").dataset.alvo = "senha"; $("#dlg").showModal(); setTimeout(() => $("#ns1")?.focus(), 30);
  }

  // ---------- envio de acesso e tutorial ----------
  const site = () => location.origin + location.pathname;
  const soDigitos = (w) => (w || "").replace(/\D/g, "");
  function mensagemTutorial(tipo, nome) {
    return `Oi${nome ? ", " + nome : ""}! Este é o passo a passo da sua área na Rede Tranquilo (${ROTULO[tipo].toLowerCase()}): ${TQTour.linkDe(tipo)}\n\nQuando você entrar pela primeira vez, ele também abre sozinho.`;
  }
  function mensagemConvite(c) {
    const criar = `${site()}#criar&email=${encodeURIComponent(c.email)}&tipo=${c.tipo === "casa" ? "casa" : "artista"}`;
    return `Oi${c.nome ? ", " + c.nome : ""}! Você foi convidada para a área ${c.tipo === "casa" ? "da casa" : c.tipo === "artista" ? "da artista" : "interna"} da Rede Tranquilo${c.vinculo_nome ? ` (${c.vinculo_nome})` : ""}.\n\nEnviei um link de acesso para ${c.email}. Se ele não chegar, crie a senha por aqui, usando este mesmo e-mail: ${criar}\n\nNo primeiro acesso, um tutorial mostra tudo o que dá para fazer.`;
  }
  function dialogoEnvio({ titulo, texto, email, whatsapp, assunto, aoEnviar, aviso }) {
    const wa = `https://wa.me/${soDigitos(whatsapp)}?text=${encodeURIComponent(texto)}`;
    const mail = `mailto:${encodeURIComponent(email || "")}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(texto)}`;
    $("#dlgIn").innerHTML = `<div class="tag">Enviar</div><h2 style="margin-top:4px">${esc(titulo)}</h2>
    ${aviso ? `<div class="alert ${/não saiu|demonstração/.test(aviso) ? "warn" : "good"}" style="margin-bottom:10px">${esc(aviso)}</div>` : ""}
    <textarea id="envTxt" aria-label="Mensagem a enviar" rows="7" style="width:100%;border:1px solid var(--line);border-radius:9px;padding:10px;font:inherit;background:var(--surface)">${esc(texto)}</textarea>
    <p class="muted" style="font-size:13px">O botão abre o WhatsApp ou o seu programa de e-mail com a mensagem pronta. Nada é enviado sem você confirmar lá.</p>
    <div class="barra-acoes"><a class="btn pri" data-envio href="${esc(wa)}" target="_blank" rel="noopener">WhatsApp${whatsapp ? "" : " (escolher contato)"}</a><a class="btn" data-envio href="${esc(mail)}">E-mail</a><button class="btn" data-copiar-envio>Copiar mensagem</button><button class="btn" onclick="dlg.close()">Fechar</button></div>`;
    $("#dlg").dataset.alvo = "envio"; S.aoEnviar = aoEnviar; $("#dlg").showModal();
  }
  function enviarTutorial(tipo, nome, email, whatsapp) {
    dialogoEnvio({ titulo: `Tutorial de ${ROTULO[tipo].toLowerCase()}`, texto: mensagemTutorial(tipo, nome), email, whatsapp, assunto: "Seu passo a passo na Rede Tranquilo",
      aoEnviar: () => api.marcarTutorialEnviado(email).catch(() => {}) });
  }
  const resultadoEnvio = (r, oque) => r.demo ? `No modo demonstração nenhum e-mail sai. Use o WhatsApp ou o e-mail abaixo.` : r.enviado ? `${oque} enviado por e-mail.` : `O e-mail não saiu: ${r.erro} Use o WhatsApp ou o e-mail abaixo.`;

  // ---------- eventos ----------
  async function cliquesContrato(t) {
    const erro = (m) => { const e = $("#ctErr") || $("#mcErr"); if (e) e.textContent = m; };
    const ab = t.closest("[data-ct-abrir]"); if (ab) { S.contrAberto = ab.dataset.ctAbrir; irPara("passos"); render(); scrollTo(0, 0); return true; }
    if (t.closest("[data-ct-voltar]")) { S.contrAberto = null; render(); scrollTo(0, 0); return true; }
    const ver = t.closest("[data-ct-ver]"); if (ver) { const c = [...(S.eq?.contr || []), ...(S.conta.contr || [])].find((x) => x.id === ver.dataset.ctVer); if (c) abrirImpressao(c); return true; }
    const me = t.closest("[data-ct-mod-editar]"); if (me) { S.cModEd = me.dataset.ctModEditar || null; S.cModAberto = true; render(); $("#mcNome")?.focus(); return true; }
    if (t.id === "mcOk") {
      const nome = $("#mcNome").value.trim(), texto = $("#mcTexto").value.trim(), em = $("#mcErr");
      if (nome.length < 2) { em.textContent = "Dê um nome ao modelo."; return true; }
      if (texto.length < 50) { em.textContent = "Cole o texto completo do modelo."; return true; }
      await api.salvarModeloContrato({ id: S.cModEd || undefined, nome, texto }); S.cModEd = null; S.cModAberto = true; S.eq = null; render(); return true;
    }
    if (t.id === "ctPrep") {
      const conta = $("#ctConta").value, ev = $("#ctEv").value, modelo = $("#ctMod").value;
      if (!conta) return erro("Escolha a conta da artista ou da casa."), true;
      if (!modelo) return erro("Escolha um modelo de contrato."), true;
      const m = S.eq.modContr.find((x) => x.id === modelo), p = S.eq.perfis.find((x) => x.id === conta);
      const e = (S.pub?.agenda || []).find((x) => x.id === ev) || S.pac?.eventos?.find((x) => x.id === ev);
      const { texto, campos } = TQContrato.campos(m.texto), sug = TQContrato.sugestoes(e, p);
      S.cPrep = { conta, ev, modelo, texto, campos, valores: Object.fromEntries(campos.map((c) => [c.chave, sug[c.chave] || ""])),
        titulo: `${m.nome} · ${p.vinculo_nome || p.nome || p.email}${e ? ` · ${e.c} ${dt(e.d).slice(0, 5)}` : ""}`.slice(0, 160) };
      render(); $("#ctTit")?.scrollIntoView({ block: "center" }); return true;
    }
    if (t.id === "ctDescartar") { S.cPrep = null; S.cPre = null; render(); return true; }
    const pr = t.closest("[data-ct-pre]"); if (pr) {
      const [ev, conta] = pr.dataset.ctPre.split("|"); S.cPrep = null; S.cPre = { ev, conta: conta || "" }; render();
      $("#contrAuto")?.scrollIntoView({ block: "start" }); ($("#ctConta")?.value ? $("#ctMod") : $("#ctConta"))?.focus(); return true;
    }
    if (t.id === "ctEnviar") {
      const P = S.cPrep; if (!P) return true;
      document.querySelectorAll("[data-ct-campo]").forEach((i) => { P.valores[i.dataset.ctCampo] = i.value.trim(); });
      P.titulo = $("#ctTit").value.trim();
      if (P.titulo.length < 2) return erro("Dê um nome ao contrato."), true;
      if (Object.values(P.valores).some((v) => /[{}]{2}/.test(v))) return erro("Os valores não podem ter {{ ou }}."), true;
      const daEquipe = P.campos.filter((c) => P.valores[c.chave]), daPessoa = P.campos.filter((c) => !P.valores[c.chave]);
      const texto = TQContrato.preencher(P.texto, daEquipe, P.valores);
      if (texto.length < 50) return erro("O texto do modelo está curto demais."), true;
      await api.criarContrato({ user_id: P.conta, evento_id: P.ev || null, titulo: P.titulo, modelo_id: P.modelo, texto, campos: daPessoa });
      TQDiario.registrar("contrato_enviado", { campos_pessoa: daPessoa.length });
      S.cPrep = null; S.cPre = null; S.eq = null; render(); return true;
    }
    const can = t.closest("[data-ct-cancelar]"); if (can) {
      if (!confirm("Cancelar este contrato? A pessoa deixa de ver o pedido de assinatura.")) return true;
      await api.cancelarContrato(can.dataset.ctCancelar); S.eq = null; render(); return true;
    }
    if (t.id === "ctSalvarDados") {
      const c = meusContratos().find((x) => x.id === S.contrAberto); if (!c) return true;
      const d = {}; document.querySelectorAll("[data-ct-dado]").forEach((i) => { d[i.dataset.ctDado] = i.value.trim(); });
      await api.contratoSalvarDados(c.id, d); S.conta.contr = await api.contratos(); render(); return true;
    }
    if (t.id === "ctAssinar") {
      const c = meusContratos().find((x) => x.id === S.contrAberto); if (!c) return true;
      if (!$("#ctConcordo").checked) return erro("Marque que leu e concorda com os termos."), true;
      const h = await TQContrato.hash(TQContrato.preencher(c.texto, c.campos, c.dados));
      await api.assinarContrato(c.id, $("#ctNome").value, h);
      TQDiario.registrar("contrato_assinado", { contrato: c.id });
      S.conta.contr = await api.contratos(); render(); scrollTo(0, 0); return true;
    }
    return false;
  }
  // Calendário de um mês (segunda a domingo). celula(dia) → { classe, rotulo, clicavel }.
  function calendarioMes(mes, celula, attr) {
    const [a, m] = mes.split("-").map(Number), primeiro = new Date(Date.UTC(a, m - 1, 1)), total = new Date(Date.UTC(a, m, 0)).getUTCDate();
    const vazios = (primeiro.getUTCDay() + 6) % 7, nome = primeiro.toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
    const ant = new Date(Date.UTC(a, m - 2, 1)).toISOString().slice(0, 7), prox = new Date(Date.UTC(a, m, 1)).toISOString().slice(0, 7);
    let html = `<div class="cal"><div class="row" style="margin-bottom:8px"><button class="btn sm" data-cal-mes="${ant}" aria-label="Mês anterior">‹</button><b style="text-transform:capitalize">${esc(nome)}</b><button class="btn sm" data-cal-mes="${prox}" aria-label="Próximo mês">›</button></div>
      <div class="cal-grade">${["seg", "ter", "qua", "qui", "sex", "sáb", "dom"].map((d) => `<div class="cal-cab">${d}</div>`).join("")}${'<div></div>'.repeat(vazios)}`;
    for (let d = 1; d <= total; d++) {
      const dia = `${mes}-${String(d).padStart(2, "0")}`, c = celula(dia);
      html += attr && c.clicavel ? `<button class="cal-dia ${c.classe}" ${attr}="${dia}" aria-label="${dt(dia)}: ${esc(c.rotulo || "sem informação")}"><b>${d}</b><span>${esc(c.rotulo)}</span></button>`
        : `<div class="cal-dia ${c.classe}${attr ? " passado" : ""}"><b>${d}</b><span>${esc(c.rotulo)}</span></div>`;
    }
    return html + `</div><div class="cal-legenda"><span class="cal-dia livre">disponível</span><span class="cal-dia ocupado">indisponível</span><span class="cal-dia ev">evento confirmado</span>${attr ? "" : '<span class="cal-dia conflito">conflito</span>'}<span class="cal-dia">sem informação</span></div>${attr ? '<p class="muted" style="font-size:12px">Toque num dia para mudar: sem informação → disponível → indisponível.</p>' : ""}</div>`;
  }
  async function carregarDisp() {
    if (S.dispCarregando) return; S.dispCarregando = true;
    try { S.disp = await api.disponibilidade(); } catch { S.disp = null; } finally { S.dispCarregando = false; }
    render();
  }
  // Equipe da casa (dono e equipe) e trilhas (Central): carregados quando a aba abre.
  async function carregarEquipeCasa() {
    if (S.eqcCarregando || !S.conta) return; S.eqcCarregando = true;
    const quem = S.conta.perfil.id;
    try { const L = await api.equipeCasa(); if (S.conta?.perfil.id === quem) S.conta.equipe = L; }
    catch { if (S.conta?.perfil.id === quem) S.conta.equipe = null; }
    finally { S.eqcCarregando = false; }
    render();
  }
  async function carregarTrilhas() {
    if (S.triCarregando) return; S.triCarregando = true;
    try { const [t, e] = await Promise.all([api.trilhas(), api.equipesTodas().catch(() => [])]); S.tri = { ...t, equipes: e || [] }; }
    catch (e) { S.tri = { erro: e.message }; }
    finally { S.triCarregando = false; }
    render();
  }
  async function cliquesEquipe(t) {
    const ed = t.closest("[data-eqc-editar]"); if (ed) { S.eqcEd = ed.dataset.eqcEditar || null; render(); $("#eqcForm")?.scrollIntoView({ block: "center" }); return true; }
    if (t.id === "eqcOk") {
      const err = $("#eqcErr"), funcoes = [...document.querySelectorAll("[data-eqc-funcao]")].filter((x) => x.checked).map((x) => x.dataset.eqcFuncao);
      const m = { id: S.eqcEd || null, casa_ref: S.conta.perfil.vinculo_nome, nome: $("#eqcNome").value.trim(), whatsapp: $("#eqcWa").value.trim(), email: $("#eqcEmail").value.trim().toLowerCase(), instagram: $("#eqcInsta").value.trim(), observacao: $("#eqcObs").value.trim(), funcoes, reserva: $("#eqcReserva").checked };
      if (!m.nome) { err.textContent = "Coloque o nome da pessoa."; return true; }
      if (m.email && !EMAIL_OK.test(m.email)) { err.textContent = "Esse e-mail não parece válido. Confira se está escrito certo."; return true; }
      const e = TQEquipe.funcoesErro(funcoes); if (e) { err.textContent = e; return true; }
      err.textContent = "Salvando…";
      try { await api.salvarMembro(m); TQDiario.registrar("equipe_casa", { acao: m.id ? "editou" : "adicionou", funcoes }); S.eqcEd = null; S.conta.equipe = undefined; await carregarEquipeCasa(); }
      catch (x) { err.textContent = /equipe_casa_email|duplicate/i.test(x.message || "") ? "Já tem alguém da equipe com este e-mail." : traduz(x.message || ""); }
      return true;
    }
    const rm = t.closest("[data-eqc-remover]"); if (rm) {
      const m = (S.conta.equipe || []).find((x) => x.id === rm.dataset.eqcRemover);
      if (!m || !confirm(`Tirar ${m.nome} da equipe?${m.acesso === "ativo" ? " A conta dessa pessoa deixa de ver a casa." : ""}`)) return true;
      try { await api.removerMembro(m.id); TQDiario.registrar("equipe_casa", { acao: "tirou" }); S.conta.equipe = undefined; await carregarEquipeCasa(); } catch (x) { alert(traduz(x.message || "")); }
      return true;
    }
    const cv = t.closest("[data-eqc-convidar]"); if (cv) {
      const m = (S.conta.equipe || []).find((x) => x.id === cv.dataset.eqcConvidar); if (!m) return true;
      try {
        const r = await api.convidarMembro(m.id, m.email, m.nome); TQDiario.registrar("equipe_convite", { funcoes: m.funcoes });
        const site = location.origin + location.pathname, criar = `${site}#criar&email=${encodeURIComponent(m.email)}&tipo=casa`;
        const zap = `Oi, ${m.nome}! Você entrou na equipe de ${S.conta.perfil.vinculo_nome} na Rede Tranquilo (${nomesFuncoes(m.funcoes)}). Mandei um link de acesso para ${m.email}. Se não chegar, crie a sua senha com esse mesmo e-mail aqui: ${criar}\n\nNo primeiro acesso, um tutorial mostra o que é seu.`;
        if (r.ja) alert(`${m.nome} já tem acesso.`);
        else { navigator.clipboard?.writeText(zap).catch(() => {}); alert(`${r.enviado ? `Link de acesso enviado para ${m.email}.` : `O e-mail não saiu${r.erro ? ` (${r.erro})` : ""}.`} A mensagem para o WhatsApp foi copiada:\n\n${zap}`); }
        S.conta.equipe = undefined; await carregarEquipeCasa();
      } catch (x) { alert(traduz(x.message || "")); }
      return true;
    }
    if (t.dataset?.trilhaCasa) {
      const etapa = t.dataset.trilhaCasa;
      try { await api.trilhaMarcarCasa(etapa, t.checked); TQDiario.registrar("trilha_casa", { etapa, feito: t.checked }); S.conta.trilha = await api.minhaTrilha(); const y = scrollY; render(); scrollTo(0, y); }
      catch (x) { alert(traduz(x.message || "")); t.checked = !t.checked; }
      return true;
    }
    // Central: trilhas das casas novas.
    if (t.dataset?.triMarco) {
      const v = t.dataset.triMarco, i = v.lastIndexOf("|"), ref = v.slice(0, i), etapa = v.slice(i + 1); S.triAberta = ref;
      try { await api.marcarTrilha(ref, etapa, t.checked); TQDiario.registrar("trilha_marco", { etapa, feito: t.checked }); const y = scrollY; S.tri = null; await carregarTrilhas(); scrollTo(0, y); }
      catch (x) { alert(traduz(x.message || "")); t.checked = !t.checked; }
      return true;
    }
    const te = t.closest("[data-tri-editar]"); if (te) { S.triEd = te.dataset.triEditar || null; render(); $("#triForm")?.scrollIntoView({ block: "center" }); return true; }
    if (t.id === "triOk") {
      const err = $("#triErr"), casa_ref = $("#triCasa").value.trim(), inicio = $("#triInicio").value, nota = $("#triNota").value.trim();
      if (!casa_ref || !/^\d{4}-\d{2}-\d{2}$/.test(inicio)) { err.textContent = "Escolha a casa e o dia 1."; return true; }
      if (!S.triEd && S.tri.trilhas.some((x) => x.casa_ref.toLowerCase() === casa_ref.toLowerCase())) { err.textContent = "Esta casa já tem trilha: use \"Editar dia 1 e nota\"."; return true; }
      err.textContent = "Salvando…";
      try { await api.salvarTrilha({ casa_ref, inicio, nota }); TQDiario.registrar("trilha", { acao: S.triEd ? "editou" : "comecou" }); S.triEd = null; S.triAberta = casa_ref; S.tri = null; await carregarTrilhas(); }
      catch (x) { err.textContent = traduz(x.message || ""); }
      return true;
    }
    const ta = t.closest("[data-tri-apagar]"); if (ta) {
      if (!confirm(`Apagar a trilha de ${ta.dataset.triApagar}? As etapas marcadas também saem.`)) return true;
      try { await api.apagarTrilha(ta.dataset.triApagar); S.tri = null; await carregarTrilhas(); } catch (x) { alert(traduz(x.message || "")); }
      return true;
    }
    return false;
  }
  // Ficha da Casa: pedido de atualização, cancelamento e "Copiar respostas" (como no modelo do Gui).
  async function cliquesDatas(t) {
    const cm = t.closest("[data-cal-mes]"); if (cm) { S.dispMes = cm.dataset.calMes; render(); return true; }
    const dd = t.closest("[data-disp-dia]"); if (dd) {
      const ref = S.conta.perfil.vinculo_nome, dia = dd.dataset.dispDia, atual = (S.disp || []).find((x) => x.casa_ref.toLowerCase() === ref.toLowerCase() && x.dia === dia);
      const prox = !atual ? "disponivel" : atual.situacao === "disponivel" ? "indisponivel" : null;
      try { await api.marcarDisponibilidade(ref, dia, prox); S.disp = (S.disp || []).filter((x) => !(x === atual)); if (prox) S.disp.push({ casa_ref: ref, dia, situacao: prox }); TQDiario.registrar("disponibilidade", { situacao: prox || "limpa" }); render(); }
      catch (x) { const e = $("#dispErr"); if (e) e.textContent = traduz(x.message || ""); }
      return true;
    }
    if (t.closest("[data-disp-semana]")) {
      const ref = S.conta.perfil.vinculo_nome, mes = S.dispMes || hojeIso().slice(0, 7), quer = S.conta.casa?.dados?.dias_semana || [];
      const nomes = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"], [a, m] = mes.split("-").map(Number), total = new Date(Date.UTC(a, m, 0)).getUTCDate();
      try { for (let d = 1; d <= total; d++) { const dia = `${mes}-${String(d).padStart(2, "0")}`; if (dia < hojeIso() || (S.pac?.eventos || []).some((e) => !e.z && e.d === dia) || !quer.includes(nomes[new Date(dia + "T12:00:00Z").getUTCDay()]) || (S.disp || []).some((x) => x.casa_ref.toLowerCase() === ref.toLowerCase() && x.dia === dia)) continue;
          await api.marcarDisponibilidade(ref, dia, "disponivel"); S.disp.push({ casa_ref: ref, dia, situacao: "disponivel" }); }
        render(); } catch (x) { const e = $("#dispErr"); if (e) e.textContent = traduz(x.message || ""); }
      return true;
    }
    return false;
  }
  async function cliquesFicha(t) {
    // Central: responder pedido de atualização e salvar combinados.
    const sr = t.closest("[data-sol-responder]"); if (sr) {
      const [sid, ap] = sr.dataset.solResponder.split("|"), resp = document.querySelector(`[data-sol-resp="${sid}"]`)?.value || "";
      try { await api.responderSolicitacao(sid, ap === "1", resp); TQDiario.registrar("ficha_pedido_resposta", { aprovado: ap === "1" }); $("#dlg").close(); S.eq = null; render(); } catch (x) { $("#derr").textContent = traduz(x.message || ""); }
      return true;
    }
    const tk = t.closest("[data-tranks]"); if (tk) {
      const c = S.eq.casas.find((x) => x.id === tk.dataset.tranks); if (!c) return true;
      const adm = S.conta.perfil.tipo === "adm", d = c.dados || {}, pend = c.pendencias || R.pendenciasCasa(d), cb = c.combinados || {};
      const txt = `Tranks, esta é a Ficha da unidade da casa ${d.nome || "(sem nome)"} (${valorCasa(d, "cidade_uf") || "cidade não informada"}), situação: ${STATUS_CASA[c.status]?.[1] || c.status}. `
        + `Com base nela: o que ainda falta para a casa receber o primeiro evento, o que precisa ser confirmado com a casa e o que merece atenção da Operações?${adm ? "" : " (Dados pessoais do Dono A e dados bancários ficaram de fora: só a administração vê.)"}\n\n`
        + textoFicha(d, adm, null)
        + `\n\n*Combinados da parceria*\nBilheteria: artista ${cb.bilheteria?.artista ?? "?"}% · casa ${cb.bilheteria?.casa ?? "?"}% · Tranquilo ${cb.bilheteria?.tranquilo ?? "?"}%\nAlimentos e bebidas: casa ${cb.aeb?.casa ?? "?"}% · Tranquilo ${cb.aeb?.tranquilo ?? "?"}%`
        + `\n\n*Pendências calculadas pelo portal*\nPara habilitar: ${pend.habilitacao.join(", ") || "nada"}\nPara montar a noite: ${pend.match.join(", ") || "nada"}\nPara completar: ${pend.enriquecimento.join(", ") || "nada"}`;
      try { await navigator.clipboard.writeText(txt); $("#tranksOk").textContent = "Copiado. Cole na conversa com a Tranks."; } catch { $("#tranksOk").textContent = "O navegador não deixou copiar."; }
      return true;
    }
    const cs = t.closest("[data-cb-salvar]"); if (cs) {
      const cb = {}; for (const el of document.querySelectorAll("[data-cb]")) { const v = el.value.trim(); if (!v) continue; const [a, b] = el.dataset.cb.split("."); (cb[a] ||= {})[b] = /^\d+([.,]\d+)?$/.test(v) && a !== "contatos" ? Number(v.replace(",", ".")) : v; }
      for (const [g, nome] of [["bilheteria", "Bilheteria"], ["aeb", "Alimentos e bebidas"]]) {
        const vs = Object.values(cb[g] || {}); if (!vs.length) continue;
        if (vs.some((v) => typeof v !== "number" || v < 0 || v > 100)) { $("#derr").textContent = `${nome}: use só números de 0 a 100.`; return true; }
        const soma = vs.reduce((a, b) => a + b, 0); if (Math.abs(soma - 100) > 0.01) { $("#derr").textContent = `${nome}: os percentuais somam ${soma}%, precisam somar 100%.`; return true; }
      }
      try { await api.definirCombinados(cs.dataset.cbSalvar, cb); $("#derr").textContent = "Combinados salvos."; const c = S.eq.casas.find((x) => x.id === cs.dataset.cbSalvar); if (c) c.combinados = cb; } catch (x) { $("#derr").textContent = traduz(x.message || ""); }
      return true;
    }
    if (t.id === "solPedir") { S.fichaPedido = true; render(); $("#form [data-k]")?.focus(); return true; }
    if (t.id === "solVoltar") { S.fichaPedido = false; render(); return true; }
    if (t.id === "solEnviar") {
      const err = $("#ferr"), novo = lerForm($("#form")), erros = conferirFormato(novo);
      if (erros.length) { err.textContent = `Confira antes de enviar: ${erros.join("; ")}.`; return true; }
      err.textContent = "Enviando…";
      try { await api.solicitarAtualizacao(novo, $("#solMsg")?.value || ""); TQDiario.registrar("ficha_pedido", {});
        S.fichaPedido = false; S.conta.sol = await api.minhasSolicitacoes(); render(); $("#ferr").textContent = "Pedido enviado. A Central confere e a ficha muda quando for aprovado."; }
      catch (x) { err.textContent = traduz(x.message || ""); }
      return true;
    }
    const sc = t.closest("[data-sol-cancelar]"); if (sc) {
      if (!confirm("Cancelar o pedido de atualização?")) return true;
      try { await api.cancelarSolicitacao(sc.dataset.solCancelar); S.conta.sol = await api.minhasSolicitacoes(); render(); } catch (x) { alert(traduz(x.message || "")); }
      return true;
    }
    if (t.id === "copiarFicha") {
      const d = { ...(S.conta.casa?.dados || {}), ...lerForm($("#form")) };
      const txt = textoFicha(d, true, S.conta.equipe);
      try { await navigator.clipboard.writeText(txt); $("#ferr").textContent = "Respostas copiadas."; } catch { $("#ferr").textContent = "O navegador não deixou copiar."; }
      return true;
    }
    return false;
  }
  async function cliques(ev) {
    const t = ev.target;
    const sb = t.closest("[data-sub]"); if (sb) { await salvarPendente(); const [a, k] = sb.dataset.sub.split("|"); (S.sub ||= {})[a] = k; S.aba = a; render(); scrollTo(0, 0); return; }
    const ir = t.closest("[data-ir]"); if (ir) { ev.preventDefault(); irPara(ir.dataset.ir); render(); scrollTo(0, 0); return; }
    if (await cliquesEquipe(t)) return;
    if (await cliquesFicha(t)) return;
    if (await cliquesDatas(t)) return;
    const ent = t.closest("[data-entrada]"); if (ent) {
      ev.preventDefault(); const em = $("#email")?.value || ""; S.entrada = ent.dataset.entrada; render();
      if ($("#email")) $("#email").value = em;
      $("#email")?.scrollIntoView({ block: "center" }); ($("#enome") || $("#email"))?.focus({ preventScroll: true }); return;
    }
    const dm = t.closest("[data-demo]"); if (dm) {
      ev.preventDefault(); const tipo = dm.dataset.demo, email = `${tipo}@demo.tranquilo`;
      try { await api.entrar(email, "demo123"); } catch { await api.cadastrar({ email, senha: "demo123", nome: tipo === "adm" ? "Administração (demo)" : "Equipe (demo)", tipo }); }
      return aposEntrar(await api.sessao());
    }
    if (t.id === "eok") {
      const email = $("#email").value.trim(), senha = $("#esenha").value, err = $("#eerr");
      err.textContent = "Aguarde…";
      try {
        if ((S.entrada || "entrar") === "criar") {
          const nome = $("#enome").value.trim();
          if (!nome || !email || senha.length < 8) { err.textContent = "Preencha nome, e-mail e uma senha com pelo menos 8 caracteres."; return; }
          if (!EMAIL_OK.test(email)) { err.textContent = "Esse e-mail parece incompleto. Confira se tem @ e o final (ex.: nome@gmail.com)."; $("#email").focus(); return; }
          const r = await api.cadastrar({ email, senha, nome, tipo: S.tipoNovo || "artista" });
          if (r.confirmar) { err.textContent = ""; $("#eok").outerHTML = `<div class="alert good"><b>Confira seu e-mail</b>Enviamos um link de confirmação para ${esc(email)}. Depois de confirmar, entre com e-mail e senha.</div>`; return; }
          return aposEntrar(r.perfil);
        }
        return aposEntrar(await api.entrar(email, senha));
      } catch (e) { err.textContent = e.message; }
      return;
    }
    if (t.id === "esqueci") {
      ev.preventDefault(); const email = $("#email").value.trim();
      if (!email) { $("#eerr").textContent = "Escreva seu e-mail acima e clique de novo."; return; }
      await api.recuperar(email); $("#eerr").textContent = REAL ? "Se houver conta, enviamos um link para trocar a senha." : "No modo demonstração não há envio de e-mail.";
      return;
    }
    if (t.id === "salvar" || t.id === "enviar") {
      const casa = S.conta.perfil.tipo === "casa";
      // Na casa, guarda também o que veio de versões anteriores da ficha (nenhum dado preenchido some).
      const enviar = t.id === "enviar", raiz = $("#form"), d = { ...(casa ? S.conta.casa?.dados || {} : {}), ...lerForm(raiz) }, err = $("#ferr");
      const falta = faltando(casa ? F_CASA : F_ARTISTA, d);
      if (enviar && falta.length && !casa) { err.textContent = `Faltam: ${falta.join(", ").replace(/\.+$/, "")}. Os campos com * são obrigatórios.`; return; }
      const erros = enviar ? conferirFormato(d) : [];
      if (erros.length) { err.textContent = `Confira antes de enviar: ${erros.join("; ")}.`; return; }
      err.textContent = "Salvando…";
      try {
        if (casa) {
          const parceira = document.querySelector('input[name="parceira"]:checked')?.value === "sim";
          S.conta.casa = await api.salvarCasa(d, { enviar, ja_parceira: parceira, notion_casa_id: parceira ? $("#casaNotion")?.value : null });
        } else S.conta.insc = await api.salvarInscricao(d, enviar);
        err.textContent = "";
        if (enviar && casa && S.conta.casa?.status === "incompleto") { render(); const f = R.pendenciasCasa(d).habilitacao; const e2 = $("#ferr"); if (e2) { e2.textContent = `A Ficha foi guardada, mas ainda não foi para análise: falta ${f.join(", ")}.`; e2.scrollIntoView({ block: "center" }); } }
        else if (enviar) { irPara(casa ? "cadastro_casa" : "passos"); render(); scrollTo(0, 0); } else { render(); $("#ferr").textContent = "Rascunho salvo."; }
      } catch (e) { err.textContent = e.message; }
      return;
    }
    if (t.id === "vok") {
      const cod = $("#vcod").value, err = $("#verr"); err.textContent = "Conferindo…";
      try {
        const pac = await abrirPacote(cod);
        if (pac.perfil !== S.conta.perfil.tipo) { err.textContent = `Este código é de ${PERFIS[pac.perfil].rotulo.toLowerCase()}, e a conta é de ${ROTULO[S.conta.perfil.tipo].toLowerCase()}.`; return; }
        await api.vincularCodigo(normCod(cod).replace(/(.{4})(.{4})(.{4})/, "$1-$2-$3"), pac.nome);
        return recarregar();
      } catch (e) { err.textContent = e.message; }
      return;
    }
    if (t.id === "sairConta") { await sairDeTudo(); return; }
    const reg = t.closest("[data-registrar]"); if (reg) return fichaRegistro(reg.dataset.registrar);
    if (t.id === "rsalvar") {
      const eventoId = $("#dlg").dataset.alvo.slice(4), pub = inteiroBR($("#rpub").value);
      if (pub !== "" && (+pub < 0 || +pub > 20000)) { $("#derr").textContent = "Confira o público: um número entre 0 e 20.000 pessoas."; $("#rpub").focus(); return; }
      try {
        await api.registrar(eventoId, { publico: pub === "" ? null : +pub, ocorrencia: $("#rocc").value.trim() || null, gravidade: $("#rgrav").value, como_resolveu: $("#rres").value.trim() || null });
        S.conta.reg = await api.meusRegistros();
        const chk = S.conta.chk; if (!chk.some((c) => c.evento_id === eventoId && c.item === "publico")) { await api.marcar(eventoId, "publico", true); S.conta.chk = await lerChecklist(); }
        $("#dlg").close(); render();
      } catch (e) { $("#derr").textContent = e.message; }
      return;
    }
    if (t.closest("[data-hub-recarregar]")) { S.hub = null; render(); return; }
    const ics = t.closest("[data-camp-ics]"); if (ics && S.hub?.campanhas) {
      const c = S.hub.campanhas.find((x) => x.id === ics.dataset.campIcs); if (!c) return;
      const blob = new Blob([icsCampanha(c, S.hub.itens.filter((i) => i.campanha_id === c.id))], { type: "text/calendar;charset=utf-8" });
      const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `campanha-${c.slug || "tranquilo"}.ics` });
      document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      alert("Arquivo baixado. No Google Agenda (no computador): Configurações › Importar e exportar › Importar, e escolha o arquivo. Os dias entram como eventos de dia inteiro.");
      return;
    }
    if (t.closest("[data-camp-limpar]")) { S.campPrevia = null; render(); return; }
    if (t.closest("[data-camp-importar]") && S.campPrevia) {
      const err = $("#camperr"); err.textContent = "";
      const casa = $("#cfCasa").value.trim(), slug = slugDe($("#cfSlug").value), titulo = $("#cfTit").value.trim() || "Campanha", fonte = $("#cfFonte").value.trim();
      if (!casa) { err.textContent = "Escreva o nome da casa exatamente como no convite (é assim que a casa passa a ver a campanha)."; $("#cfCasa").focus(); return; }
      if (slug.length < 3) { err.textContent = "Dê um identificador curto, por exemplo rooftap-nov26."; $("#cfSlug").focus(); return; }
      if (fonte && !/^https:\/\//i.test(fonte)) { err.textContent = "O link da página precisa começar com https://"; $("#cfFonte").focus(); return; }
      const semConvite = !(S.eq?.conv || []).some((c) => c.tipo === "casa" && (c.vinculo_nome || "").toLowerCase() === casa.toLowerCase());
      if (semConvite && !confirm(`Nenhum convite de casa está ligado a "${casa}". A campanha fica carregada, mas ninguém da casa vê até receber um convite com esse nome. Continuar?`)) return;
      const d = { slug, titulo, casa, fonte_url: fonte || null, itens: S.campPrevia.itens.map(({ chave, dia, rotulo, acoes }) => ({ chave, dia, rotulo, acoes })) };
      const cie = $("#cfCie").checked;
      try {
        await api.importarCampanha(d);
        if (cie) await pedirCienciaCampanha(d);
        TQDiario.registrar("campanha_importada", { dias: d.itens.length });
        S.campPrevia = null; S.hub = null; await carregarHub();
        alert(`Campanha de ${casa} carregada: ${d.itens.length} dias.${cie ? " A casa vai ver o pedido de confirmação de leitura em Materiais." : ""}`);
      } catch (e) { err.textContent = traduz(e.message || ""); }
      return;
    }
    if (t.closest("[data-mat-versao], [data-mat-novo]")) {
      const err = $("#materr"); err.textContent = ""; S.matAberto = true;
      const url = (s) => s.trim();
      try {
        if (t.closest("[data-mat-versao]")) {
          const versao = $("#mvVer").value.trim(), u = url($("#mvUrl").value);
          if (!versao) { err.textContent = "Dê um nome à versão (ex.: 2)."; $("#mvVer").focus(); return; }
          if (u && !/^https:\/\//i.test(u)) { err.textContent = "O link precisa começar com https://"; $("#mvUrl").focus(); return; }
          const pede = $("#mvCie").checked;
          if (!confirm(pede ? "Publicar e pedir que todos confirmem a leitura de novo?" : "Publicar esta versão sem pedir nova confirmação?")) return;
          await api.publicarVersao({ material_id: $("#mvMat").value, versao, resumo: $("#mvRes").value.trim() || null, url: u || null, exige_ciencia: pede });
        } else {
          const titulo = $("#mnTit").value.trim(), u = url($("#mnUrl").value), publico = [$("#mnCasa").checked && "casa", $("#mnArt").checked && "artista"].filter(Boolean);
          if (titulo.length < 3) { err.textContent = "Escreva o título do material."; $("#mnTit").focus(); return; }
          if (!/^https:\/\//i.test(u)) { err.textContent = "Cole o link do material (começando com https://)."; $("#mnUrl").focus(); return; }
          if (!publico.length) { err.textContent = "Escolha quem vê: casas, artistas ou os dois."; return; }
          const ref = $("#mnRef").value.trim();
          const slug = (titulo + (ref ? "-" + ref : "")).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
          await api.novoMaterial({ slug, titulo, tipo_material: $("#mnTipo").value, publico, fonte_url: u, casa_ref: ref || null, fonte_tipo: "link" },
            { versao: "1", resumo: "Primeira versão", exige_ciencia: $("#mnCie").checked });
        }
        TQDiario.registrar("material_publicado", {});
        S.hub = null; await carregarHub();
      } catch (e) { err.textContent = /duplicate|unique|já foi salvo/i.test(e.message) ? "Já existe uma versão (ou um material) com esse nome. Use outro." : traduz(e.message || ""); }
      return;
    }
    const cie = t.closest("[data-ciencia]"); if (cie) {
      if (!confirm("Confirmar que você leu esta versão do material? A confirmação fica registrada com data e hora.")) return;
      try { await api.darCiencia(cie.dataset.ciencia); TQDiario.registrar("ciencia", { versao: cie.dataset.ciencia }); const y = scrollY; S.hub = null; await carregarHub(); scrollTo(0, y); }
      catch (e) { alert(traduz(e.message || "")); }
      return;
    }
    const arq = t.closest("[data-arquivo]"); if (arq) {
      ev.preventDefault();
      const url = await api.linkArquivo(arq.dataset.arquivo);
      if (url) window.open(url, "_blank", "noopener"); else alert("Não foi possível abrir o arquivo agora.");
      return;
    }
    if (await cliquesContrato(t)) return;
    const vc = t.closest("[data-vinculo-confirmar], [data-vinculo-recusar]"); if (vc) {
      const pid = vc.dataset.vinculoConfirmar || vc.dataset.vinculoRecusar, p = (S.eq?.perfis || []).find((x) => x.id === pid); if (!p) return;
      const a = vc.dataset.vinculoConfirmar && (S.pac?.acessos || []).find((x) => x.codigo === p.vinculo_pedido && x.tipo === p.tipo);
      await api.atualizarPerfil(pid, a ? { codigo_acesso: a.codigo, vinculo_nome: a.nome, vinculo_pedido: null, vinculo_pedido_nome: null } : { vinculo_pedido: null, vinculo_pedido_nome: null });
      S.eq = null; render(); return;
    }
    const docDel = t.closest("[data-apagar-doc]"); if (docDel) {
      if (!confirm("Remover este documento? A pessoa deixa de ver o link.")) return;
      try { await api.apagarDocumento(docDel.dataset.apagarDoc); S.eq = null; render(); } catch (e) { alert(e.message); }
      return;
    }
    if (t.id === "docOk") {
      const err = $("#docErr"), url = $("#docUrl").value.trim(), titulo = $("#docTit").value.trim(), tipo = $("#docTipo").value;
      const [user_id, evento_id] = [$("#docConta").value || null, $("#docEv").value || null];
      if (!/^https:\/\//i.test(url)) { err.textContent = "Cole o link completo, começando com https:// (Drive, Dropbox, DocuSign…)."; return; }
      if (titulo.length < 2) { err.textContent = "Dê um nome curto ao documento."; return; }
      if (tipo === "contrato" && (!user_id || !evento_id)) { err.textContent = "Contrato precisa da conta e da data."; return; }
      try { await api.criarDocumento({ tipo, titulo, url, user_id: tipo === "modelo" ? null : user_id, evento_id: tipo === "modelo" ? null : evento_id }); S.eq = null; render(); }
      catch (e) { err.textContent = e.message; }
      return;
    }
    const dec = t.closest("[data-decisao]"); if (dec) {
      const [tipo, id] = $("#dlg").dataset.alvo.split(":"), status = dec.dataset.decisao;
      const campos = { parecer: $("#parecer").value.trim() || null, nota_interna: $("#nota").value.trim() || null };
      if (status) campos.status = status;
      if (tipo === "casa") campos.classificacao = $("#classe").value || null;
      if (status === "ajustes" && !campos.parecer) { $("#derr").textContent = "Escreva na mensagem o que precisa ser ajustado."; return; }
      // Encerrar uma inscrição é a resposta mais delicada para a artista: exige mensagem e confirmação.
      if (status === "reprovada" && !campos.parecer) { $("#derr").textContent = "Escreva uma mensagem para a artista explicando que, por agora, não vai seguir."; $("#parecer").focus(); return; }
      if (status === "reprovada" && !confirm("Encerrar esta inscrição? A artista recebe a sua mensagem e a inscrição sai da fila.")) return;
      try {
        if (tipo === "insc") await api.avaliarInscricao(id, campos); else await api.avaliarCasa(id, campos);
        const v = $("#dlg").querySelector("[data-vinculo]");
        if (v) { const [codigo, nome] = v.value ? v.value.split("|") : [null, null]; const p = (S.eq.perfis || []).find((x) => x.id === v.dataset.vinculo); if (p && p.codigo_acesso !== codigo) await api.atualizarPerfil(p.id, { codigo_acesso: codigo, vinculo_nome: nome }); }
        $("#dlg").close(); S.eq = null; render();
      } catch (e) { $("#derr").textContent = e.message; }
      return;
    }
    if (t.closest("[data-copiar-ficha]")) {
      const i = S.eq.insc.find((x) => "insc:" + x.id === $("#dlg").dataset.alvo), d = i.dados;
      const txt = [`Nome artístico: ${d.nome_artistico}`, `Cidade: ${d.cidade_base}/${d.estado}`, `Gêneros: ${d.generos}`, `Instagram: ${d.instagram}`, `Spotify: ${d.spotify}`, `Contato: ${d.whatsapp} ${d.contato_producao || ""}`, `Rider: ${d.rider_tipo} ${d.rider_link || ""}`, `Cidades: ${(d.cidades_interesse || []).join(", ")}`, `Pré-curadoria: ${i.score}/100 (${i.faixa})`, `Mini release: ${d.release}`].join("\n");
      navigator.clipboard?.writeText(txt); t.textContent = "Copiada"; return;
    }
    // ---------- primeiro acesso, convites e avisos ----------
    if (t.closest("[data-rever-tutorial]")) { abrirTutorial(roteiroConta(), false); return; }
    if (t.id === "nsok") {
      const a = $("#ns1").value, b = $("#ns2").value, err = $("#nserr");
      if (a.length < 8) { err.textContent = "Use pelo menos 8 caracteres."; return; }
      if (a !== b) { err.textContent = "As duas senhas não são iguais."; return; }
      err.textContent = "Salvando…";
      try { await api.definirSenha(a); S.conta.perfil.senha_definida = true; $("#dlg").close(); primeiroAcesso(); } catch (e) { err.textContent = e.message; }
      return;
    }
    if (t.id === "cvOk") {
      const err = $("#cverr"), email = $("#cvEmail").value.trim().toLowerCase(), nome = $("#cvNome").value.trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { err.textContent = "Escreva um e-mail válido."; return; }
      const [codigo_acesso, vinculo_nome] = ($("#cvVinc")?.value || "").split("|");
      const c = { email, tipo: S.convTipo || "artista", nome: nome || vinculo_nome || "", whatsapp: $("#cvWa").value.trim() || null, codigo_acesso: codigo_acesso || null, vinculo_nome: vinculo_nome || null };
      err.textContent = "Enviando…";
      try {
        const r = await api.convidar(c); err.textContent = ""; S.convPre = null; S.eq = null; render();
        dialogoEnvio({ titulo: `Convite para ${c.nome || c.email}`, texto: mensagemConvite(c), email: c.email, whatsapp: c.whatsapp, assunto: "Seu acesso à Rede Tranquilo", aviso: resultadoEnvio(r, "Convite") });
      } catch (e) { err.textContent = e.message; }
      return;
    }
    const rc = t.closest("[data-reconvidar]"); if (rc) {
      const c = (S.eq?.conv || []).find((x) => x.email === rc.dataset.reconvidar); if (!c) return;
      rc.textContent = "Enviando…";
      try { const r = await api.convidar(c); dialogoEnvio({ titulo: `Acesso de ${c.nome || c.email}`, texto: mensagemConvite(c), email: c.email, whatsapp: c.whatsapp, assunto: "Seu acesso à Rede Tranquilo", aviso: resultadoEnvio(r, "Link de acesso") }); }
      catch (e) { alert(e.message); }
      S.eq = null; render(); return;
    }
    const cc = t.closest("[data-cancelar-convite]"); if (cc) {
      if (!confirm(`Cancelar o convite de ${cc.dataset.cancelarConvite}?`)) return;
      try { await api.cancelarConvite(cc.dataset.cancelarConvite); S.eq = null; render(); } catch (e) { alert(e.message); }
      return;
    }
    const et = t.closest("[data-enviar-tutorial]"); if (et) { const [tipo, email, nome, wa] = et.dataset.enviarTutorial.split("|"); enviarTutorial(tipo, nome, email, wa); return; }
    const ls = t.closest("[data-link-senha]"); if (ls) {
      ls.textContent = "Enviando…";
      try { const r = await api.enviarLinkSenha(ls.dataset.linkSenha); ls.textContent = r.enviado ? "Link enviado" : "Não enviado"; if (!r.enviado) alert(resultadoEnvio(r, "Link").replace(" Use o WhatsApp ou o e-mail abaixo.", "")); }
      catch (e) { ls.textContent = "Erro"; alert(e.message); }
      return;
    }
    if (t.closest("[data-envio]")) { try { S.aoEnviar?.(); } catch { /* registro opcional */ } return; }
    if (t.closest("[data-copiar-envio]")) { navigator.clipboard?.writeText($("#envTxt").value).then(() => { t.textContent = "Copiada"; }); return; }
    if (t.id === "avOk") { await avisarCidade(); return; }
    const cl = t.closest("[data-click]");
    if (cl && /^camp:/.test(cl.dataset.click)) { ev.stopImmediatePropagation(); S.campAberta = cl.dataset.click.slice(5); render(); return; }
    if (cl && /^(insc|casacad):/.test(cl.dataset.click)) { ev.stopImmediatePropagation(); const [k, id] = cl.dataset.click.split(":"); return k === "insc" ? fichaInscricao(id) : fichaCasa(id); }
  }
  // Um clique por vez: enquanto a ação de um botão não termina, novos cliques nele são ignorados
  // (evita conta, inscrição, convite ou registro em dobro). Antes de o banco responder, nada é enviado.
  document.addEventListener("click", async (ev) => {
    const b = ev.target.closest("button, a[data-demo]");
    if (b?.dataset.ocupado) { ev.preventDefault(); ev.stopImmediatePropagation(); return; }
    if (!api && ev.target.closest("#eok, #esqueci, [data-demo], #avOk, #salvar, #enviar")) {
      ev.preventDefault(); ev.stopImmediatePropagation();
      const e = $("#eerr") || $("#averr") || $("#ferr"); if (e) e.textContent = "Conectando às contas… tente de novo em alguns segundos.";
      return;
    }
    if (b) b.dataset.ocupado = "1";
    try { await cliques(ev); }
    catch (e) { console.error(e); const m = $("#ctErr") || $("#mcErr") || $("#eerr") || $("#ferr") || $("#derr") || $("#averr"); if (m) m.textContent = traduz(e.message || ""); }
    finally { if (b) delete b.dataset.ocupado; }
  }, true);

  document.addEventListener("change", async (ev) => {
    const t = ev.target;
    if (t.dataset?.pf) { (S.pf ||= {})[t.dataset.pf] = t.value; render(); return; }
    if (t.hasAttribute?.("data-ag-casa")) { S.agCasa = t.value; render(); return; }
    if (t.id === "cfArq" && t.files?.[0]) {
      const arq = t.files[0]; S.campAberto = true;
      try {
        if (arq.size > 3e6) throw new Error("Arquivo grande demais para uma campanha (mais de 3 MB). Confira se é o arquivo certo.");
        const r = TQCampanha.ler(await arq.text(), { ano: new Date().getFullYear() });
        const anterior = S.hub?.campanhas?.find((c) => r.casa && c.casa_ref?.toLowerCase() === r.casa.toLowerCase());
        const slug = r.slug || anterior?.slug || slugDe(`${r.casa || "casa"}-${r.itens[0].dia.slice(0, 7)}`);
        S.campPrevia = { ...r, arquivo: arq.name, slug, fonte_url: r.fonte_url || anterior?.fonte_url || "" };
        render();
      } catch (e) { S.campPrevia = null; render(); $("#camperr").textContent = e.message; }
      return;
    }
    if (t.name === "tipoNovo") {
      S.tipoNovo = t.value; const n = $("#enome")?.value, e = $("#email")?.value, sn = $("#esenha")?.value;
      render();
      if ($("#enome")) { $("#enome").value = n || ""; $("#email").value = e || ""; if ($("#esenha")) $("#esenha").value = sn || ""; }
      document.querySelector(`input[name="tipoNovo"][value="${t.value}"]`)?.focus();
      return;
    }
    if (t.name === "parceira") { S.casaParceira = t.value === "sim"; const d = lerForm($("#form")); render(); $("#form").innerHTML = formCasa(d, false); return; }
    if (t.id === "casaNotion" && t.value && t.value !== "outra") {
      const c = (S.pub.casas || []).find((x) => x.id === t.value);
      if (c) { const n = document.querySelector('[data-k="nome"]'), ci = document.querySelector('[data-k="cidade"]'); if (n && !n.value) n.value = /^Casa em/.test(c.nome) ? "" : c.nome; if (ci && !ci.value) ci.value = c.cidade; }
      return;
    }
    if (t.dataset?.enviarArquivo && t.files?.[0]) {
      const ev = t.dataset.enviarArquivo, msg = $(`#arqErr-${CSS.escape(ev)}`);
      if (msg) msg.textContent = "Enviando…";
      try { await api.enviarArquivo(ev, t.files[0]); S.conta.arqs = await api.meusArquivos(); TQDiario.registrar("enviou_arquivo", { evento: ev }); render(); document.querySelectorAll("details").forEach((d) => { if (d.querySelector(`[data-enviar-arquivo="${ev}"]`)) { d.open = true; d.closest(".card")?.querySelectorAll("details").forEach((x) => { if (x.contains(d)) x.open = true; }); } }); const m2 = $(`#arqErr-${CSS.escape(ev)}`); if (m2) m2.textContent = "Arquivo enviado. A equipe do Tranquilo já consegue ver."; }
      catch (e) { if (msg) msg.textContent = e.message; t.value = ""; }
      return;
    }
    if (t.dataset?.campFeito) {
      try { await api.marcarCampanha(t.dataset.campFeito, t.checked); TQDiario.registrar("campanha_feito", { item: t.dataset.campFeito, feito: t.checked }); const y = scrollY; S.hub = null; await carregarHub(); scrollTo(0, y); }
      catch (e) { alert(traduz(e.message || "")); t.checked = !t.checked; }
      return;
    }
    const ps = t.dataset?.passo; if (ps) {
      const [eventoId, item] = ps.split("|");
      try { if (!t.checked && S.conta.perfil.tipo === "casa") await api.desmarcarCasa(eventoId, item); else await api.marcar(eventoId, item, t.checked); S.conta.chk = await lerChecklist(); const aberto = t.closest("details")?.open; render(); if (aberto) document.querySelectorAll("details").forEach((d) => { if (d.querySelector(`[data-passo^="${eventoId}|"]`)) d.open = true; }); }
      catch (e) { alert(e.message); t.checked = !t.checked; }
      return;
    }
    if (t.dataset?.tipo) {
      // Mudar perfil muda o que a pessoa vê (e pode dar acesso de equipe): só com confirmação.
      const nome = t.closest("tr")?.querySelector("b")?.textContent || "esta conta";
      if (!confirm(`Mudar o perfil de ${nome} de ${ROTULO[t.dataset.antes] || t.dataset.antes} para ${ROTULO[t.value]}? O vínculo com o histórico atual é desfeito.`)) { t.value = t.dataset.antes; return; }
      try { await api.atualizarPerfil(t.dataset.tipo, { tipo: t.value, codigo_acesso: null, vinculo_nome: null }); S.eq = null; render(); document.querySelector(`[data-tipo="${t.dataset.tipo}"]`)?.focus(); } catch (e) { alert(e.message); t.value = t.dataset.antes; }
      return;
    }
    if (t.dataset?.vinculo && !t.closest("dialog")) {
      const [codigo, nome] = t.value ? t.value.split("|") : [null, null];
      try { await api.atualizarPerfil(t.dataset.vinculo, { codigo_acesso: codigo, vinculo_nome: nome }); S.eq = null; render(); } catch (e) { alert(e.message); }
      return;
    }
    if (t.id === "eqStatus" || t.id === "eqFaixa") { S.eqf[t.id === "eqStatus" ? "status" : "faixa"] = t.value; render(); }
    if (t.id === "cvTipo") { S.convTipo = t.value; S.convPre = null; render(); return; }
    if (t.id === "cvVinc") { const nome = t.value.split("|")[1] || "", n = $("#cvNome"); if (n && !n.value) n.value = nome; return; }
    if (t.id === "avCidade") { const o = $("#avOutra"); if (o) o.hidden = t.value !== "__outra"; return; }
  });
  document.addEventListener("input", (ev) => {
    const t = ev.target;
    if (t.closest("#form") && S.aba === "inscricao") { const m = $("#medidor"); if (m) m.innerHTML = medidor(R.preCuradoria(lerForm($("#form")))); }
    if (t.closest("#form") && (S.aba === "inscricao" || (S.aba === "ficha" && (S.sub?.ficha || "cadastro_casa") === "cadastro_casa"))) { clearTimeout(S.tauto); S.tauto = setTimeout(salvarPendente, 1200); }
    if (t.id === "eqQ") { S.eqf.q = t.value; clearTimeout(S.tq); S.tq = setTimeout(() => { render(); const i = $("#eqQ"); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 250); }
  });

  // Salvamento automático do rascunho (inscrição da artista e cadastro da casa), 1,2 s depois da última
  // alteração e também antes de trocar de aba. Atualiza o estado local na hora para a troca de aba não apagar nada.
  function salvarPendente() {
    clearTimeout(S.tauto); S.tauto = null;
    const raiz = $("#form"); if (!raiz || !S.conta || !raiz.querySelector("[data-k]:not(:disabled)")) return Promise.resolve();
    const casa = S.conta.perfil.tipo === "casa";
    if (casa && raiz.dataset.modo !== "edicao") return Promise.resolve();   // ficha enviada: muda só por pedido
    const d = { ...(casa ? S.conta.casa?.dados || {} : {}), ...lerForm(raiz) };
    const msg = (t) => { const e = $("#ferr"); if (e) e.textContent = t; };
    let p;
    if (casa) {
      const parceira = document.querySelector('input[name="parceira"]:checked')?.value === "sim", notion = parceira ? $("#casaNotion")?.value : null;
      S.conta.casa = { ...(S.conta.casa || { status: "rascunho" }), dados: d, ja_parceira: parceira, notion_casa_id: notion };
      p = api.salvarCasa(d, { enviar: false, ja_parceira: parceira, notion_casa_id: notion }).then((c) => { S.conta.casa = c; });
    } else {
      S.conta.insc = { ...(S.conta.insc || { status: "rascunho" }), dados: d };
      p = api.salvarInscricao(d, false).then((i) => { S.conta.insc = i; });
    }
    msg("Salvando…");
    return p.then(() => msg(`Salvo automaticamente às ${new Date().toTimeString().slice(0, 5)}.`)).catch((e) => msg(`Não deu para salvar agora (${e.message}). Tente "Salvar rascunho".`));
  }

  // ---------- público: "me avise de shows na minha cidade" ----------
  async function avisarCidade() {
    const err = $("#averr"), sel = $("#avCidade").value, cidade = (sel === "__outra" ? $("#avOutra").value : sel).trim(), contato = $("#avContato").value.trim();
    if (cidade.length < 2) { err.textContent = "Escolha ou escreva a sua cidade."; return; }
    const email = /@/.test(contato), digitos = contato.replace(/\D/g, "");
    if (email ? !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contato) : digitos.length < 10) { err.textContent = "Escreva um e-mail ou um WhatsApp com DDD."; return; }
    if (!$("#avOk2").checked) { err.textContent = "Marque a autorização para podermos avisar você."; return; }
    err.textContent = "Enviando…";
    try {
      await api.avisar({ cidade, contato: email ? contato.toLowerCase() : digitos, canal: email ? "email" : "whatsapp" });
      $("#avForm").innerHTML = `<div class="alert good"><b>Pronto! Vamos te avisar.</b>Quando abrir show em ${esc(cidade)}, você fica sabendo antes.${REAL ? "" : " (Modo demonstração: o pedido ficou só neste navegador.)"}</div>`;
    } catch (e) { err.textContent = e.message; }
  }
  function formAviso(cidades, sel = "") {
    return `<div id="avForm"><div class="fgrid">
      <label class="fcampo"><b>Sua cidade</b><select id="avCidade"><option value="">Escolha</option>${cidades.map((c) => `<option${c === sel ? " selected" : ""}>${esc(c)}</option>`).join("")}<option value="__outra">Outra cidade</option></select><input id="avOutra" placeholder="Qual cidade?" hidden style="margin-top:6px">
      <button type="button" class="loc-btn" data-avloc>📍 Usar minha localização</button><span class="aceite-legal" id="avLocNota" style="margin:0"></span></label>
      <label class="fcampo"><b>E-mail ou WhatsApp</b><input id="avContato" autocomplete="email" placeholder="voce@email.com ou (11) 99999-9999"></label>
      <label class="fcheck"><input type="checkbox" id="avOk2"> <span>Autorizo o Tranquilo a me avisar de shows nesta cidade, inclusive pelo WhatsApp Business se eu deixar meu número. Dá para pedir para sair a qualquer momento. Veja a <a href="https://tranquilomusica.com.br/politica-de-privacidade" target="_blank" rel="noopener">Política de Privacidade</a> e a <a href="https://tranquilomusica.com.br/politica-mensagens-whatsapp" target="_blank" rel="noopener">Política de Mensagens WhatsApp</a>.</span></label></div>
      <div class="err" role="status" aria-live="polite" id="averr"></div><button class="btn sun lg" id="avOk">Me avise</button></div>`;
  }
  function tutorialPublico(forcar) {
    if (S.conta || TQTour.aberto()) return;
    if (!forcar && store.get("tq-tutorial-publico")) return;
    TQTour.abrir("publico", { primeira: !forcar, chave: "publico", dicaRever: "botão \"Como funciona\", no topo da página",
      aoFechar: (visto) => { if (visto) store.set("tq-tutorial-publico", new Date().toISOString()); setTimeout(() => window.TQConsent?.(), 300); } });
  }

  async function sairDeTudo() { S.conta = null; await api?.sair(); store.del("tq-codigo"); S.conta = null; S.pac = null; S.eq = null; S.hub = null; S.campAberta = null; render(); scrollTo(0, 0); }

  return { get REAL() { return REAL; }, get FORA() { return FORA; }, avisoConta, iniciar, abas, areaDe, rotuloQuem, telas: TELAS, formEntrada, sairDeTudo, formAviso, tutorialPublico, abrirTutorial, salvarPendente: () => { if (S.tauto) salvarPendente(); } };
})();
