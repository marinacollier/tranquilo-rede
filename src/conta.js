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
  // Link do e-mail (convite, link de entrada, confirmação, "esqueci a senha"): o Supabase lê o login do endereço e limpa
  // o #access_token logo que a conta abre. Guardamos antes, nesta aba, que a pessoa veio pelo link: é isso que decide
  // a tela "Crie a sua senha" (a conta criada pelo link não tem senha que a pessoa conheça).
  const LINK_TIPOS = ["magiclink", "invite", "signup", "recovery"];
  try {
    const h = location.hash + location.search, tipo = (h.match(/type=(magiclink|invite|signup|recovery)\b/) || [])[1];
    if (tipo || /access_token=/.test(h)) { sessionStorage.setItem("tq-veio-link", tipo || "magiclink"); sessionStorage.removeItem("tq-senha-depois"); }
  } catch { /* sem armazenamento: vale só senha_definida */ }
  const veioLink = () => { try { const v = sessionStorage.getItem("tq-veio-link"); return LINK_TIPOS.includes(v) ? v : null; } catch { return null; } };
  const hojeIso = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
  // Mensagem de resultado num formulário, sempre com o desfecho na frente:
  // "✓ Feito: …" (verde), "✕ Erro: …" (vermelho, com o motivo e o que fazer), "⚠ Atenção: …" (amarelo) e "…" (cinza, esperando).
  // Texto vazio limpa. Texto terminado em "…" é espera; começando com ✓ ou ⚠ mantém o tipo; o resto é erro.
  function diz(el, texto) {
    if (!el) return;
    const t = String(texto ?? "").trim();
    el.classList.remove("feito", "espera", "atencao");
    if (!t) { el.textContent = ""; return; }
    if (/…$/.test(t) && !/^[✓✕⚠]/.test(t)) { el.classList.add("espera"); el.textContent = t; return; }
    if (/^✓/.test(t)) { el.classList.add("feito"); el.textContent = "✓ Feito: " + t.replace(/^✓\s*/, ""); return; }
    if (/^⚠/.test(t)) { el.classList.add("atencao"); el.textContent = "⚠ Atenção: " + t.replace(/^⚠\s*/, ""); return; }
    const r = t.replace(/^✕\s*(Erro:\s*)?/, "");
    el.textContent = "✕ Erro: " + r.charAt(0).toUpperCase() + r.slice(1);
  }
  window.TQDiz = diz;
  // ---------- status de toda ação que muda dados (pedido da Marina, 17/11/2026) ----------
  // "Nada pode ser alterado sem status": a ação mostra "Salvando…" na hora, trava o botão até o banco responder
  // e termina com "✓ Feito: …" ou "✕ Erro: …" perto do botão. Se a tela foi redesenhada, a mensagem vai para o
  // botão equivalente na tela nova; se ele sumiu (ou está num diálogo fechado), para o aviso fixo no pé da tela.
  const visivel = (el) => !!el?.isConnected && el.getClientRects().length > 0;
  function avisoGeral(texto) {
    let el = document.getElementById("tqAviso");
    if (!el) { el = document.createElement("div"); el.id = "tqAviso"; el.className = "err aviso-geral"; el.setAttribute("role", "status"); el.setAttribute("aria-live", "polite"); document.body.append(el); }
    diz(el, texto); clearTimeout(el._t);
    if (texto && !/…$/.test(String(texto).trim())) el._t = setTimeout(() => diz(el, ""), /^✓/.test(texto) ? 6000 : 15000);
  }
  function seletorDe(el) {
    if (!el?.getAttribute) return null;
    if (el.id) return "#" + CSS.escape(el.id);
    for (const a of el.attributes) if (a.name.startsWith("data-") && !["data-ocupado", "data-st"].includes(a.name)) return `[${a.name}="${CSS.escape(a.value)}"]`;
    return null;
  }
  // Lugar da mensagem logo depois do botão (ou da caixa de marcar); cria um se não houver.
  function statusPerto(el) {
    if (!visivel(el)) return null;
    const ancora = el.closest(".barra-acoes") || (el.matches("input, select, textarea") ? el.closest("label") || el : el.parentElement?.style?.display === "flex" ? el.parentElement : el);
    const prox = ancora.nextElementSibling;
    if (prox?.matches(".err")) return prox;
    const st = document.createElement("div"); st.className = "err"; st.setAttribute("role", "status"); st.setAttribute("aria-live", "polite"); st.dataset.st = "1";
    ancora.after(st); return st;
  }
  const carregandoAlgo = () => S.eqCarregando || S.hubCarregando || S.triCarregando || S.eqcCarregando || S.dispCarregando || S.dispACarregando;
  // acao(botão, função que salva, { ok, espera, st, erro }) → { ok: true, r } ou { erro }. Nunca usa alert().
  // st: lugar fixo da mensagem (elemento ou seletor). ok: texto (ou função do resultado) depois de "✓".
  async function acao(el, fn, { ok = "Salvo.", espera = "Salvando…", st = null, erro = null } = {}) {
    const sel = seletorDe(el), stSel = typeof st === "string" ? st : st?.id ? "#" + CSS.escape(st.id) : null;
    const fixo = () => { const x = (stSel && document.querySelector(stSel)) || (typeof st === "object" && st?.isConnected ? st : null); return visivel(x) ? x : null; };
    const inicio = fixo() || statusPerto(el);
    if (inicio) diz(inicio, espera); else avisoGeral(espera);
    const trava = !!el && "disabled" in el && !el.disabled;
    if (trava) el.disabled = true; el?.setAttribute?.("aria-busy", "true");
    let r, falhou = null;
    try { r = await fn(); } catch (e) { falhou = e; console.warn(e); }
    if (trava) el.disabled = false; el?.removeAttribute?.("aria-busy");
    // A tela pode estar recarregando os dados (lista zerada): espera para a mensagem não sumir no redesenho.
    await new Promise((res) => setTimeout(res, 0));
    for (let i = 0; i < 150 && carregandoAlgo(); i++) await new Promise((res) => setTimeout(res, 100));
    const texto = falhou ? (erro ? erro(falhou) : traduz(falhou.message || "")) : "✓ " + (typeof ok === "function" ? ok(r) : ok);
    const fim = fixo() || (sel && statusPerto(document.querySelector(sel))) || (visivel(inicio) ? inicio : null);
    if (fim) diz(fim, texto); else avisoGeral(texto);
    return falhou ? { erro: falhou } : { ok: true, r };
  }
  // Campo obrigatório ou fora do formato: marca em vermelho, leva o cursor até ele e explica. Nada é salvo.
  function marcar(...campos) {
    campos.flat().filter(Boolean).forEach((c) => { c.classList.add("campo-falta"); const sai = () => c.classList.remove("campo-falta"); c.addEventListener("input", sai, { once: true }); c.addEventListener("change", sai, { once: true }); });
    const p = campos.flat().find(Boolean); if (p) { p.scrollIntoView?.({ block: "center" }); p.focus?.({ preventScroll: true }); }
  }
  // ---------- "não tem como errar" e "começa pequeno" (pedido da Marina, 18/11/2026) ----------
  // Botão que diz o efeito e para quem vai: o rótulo é a ação e a linha embaixo diz o que acontece depois do clique.
  const comExplica = (botao, explica) => `<span class="acao-exp">${botao}<small>${explica}</small></span>`;
  // Bloco que começa recolhido: uma linha com o que é e o status; abre ao tocar. A tela lembra o que a pessoa abriu
  // ou fechou (um redesenho não muda nada). `aberta` é o padrão de quando a pessoa ainda não mexeu (a pendência vem aberta).
  // Regra da Marina (18/11/2026): "TUDO SEMPRE COMEÇA FECHADINHO E A PESSOA EXPANDE". Todo bloco, lista ou cartão
  // longo começa recolhido com uma linha de resumo; abre aberto só o passo atual ou o que a pessoa acabou de criar/abrir
  // (forcar). O que a pessoa abriu ou fechou fica lembrado (S.dobras) entre os redesenhos.
  function dobra(id, titulo, status, conteudo, { aberta = false, classe = "", forcar = false, attrs = "", extra = "" } = {}) {
    const lembrado = S.dobras?.[id], abre = forcar || (lembrado ?? aberta);
    return `<details class="dobra ${classe}" data-dobra="${esc(id)}"${attrs ? " " + attrs : ""}${abre ? " open" : ""}><summary><span class="dobra-tit">${titulo}</span>${status ? `<span class="dobra-st">${status}</span>` : ""}${extra}</summary><div class="dobra-corpo">${conteudo}</div></details>`;
  }
  // Confirmação na própria página (no lugar da janelinha do navegador) para o que apaga, cancela ou envia:
  // o primeiro clique abre uma caixa logo abaixo do botão, com o que vai acontecer e "Sim, …" / "Não, voltar".
  // Uso no clique: if (!confirmaAqui(botao, "Pergunta?", "o que acontece", "Sim, cancelar")) return true;
  function confirmaAqui(el, pergunta, efeito = "", sim = "Sim, continuar") {
    if (el?.dataset?.confirmado === "1") { delete el.dataset.confirmado; return true; }
    document.querySelectorAll(".conf-aqui").forEach((x) => x.remove());
    const box = document.createElement("div"); box.className = "alert warn conf-aqui"; box.setAttribute("role", "alertdialog"); box.setAttribute("aria-label", pergunta);
    box.innerHTML = `<b>${esc(pergunta)}</b>${efeito ? `<span>${esc(efeito)}</span>` : ""}<div class="barra-acoes"><button type="button" class="btn pri sm" data-conf-sim>${esc(sim)}</button><button type="button" class="btn sm" data-conf-nao>Não, voltar</button></div>`;
    box._sel = seletorDe(el); box._el = el;
    const td = el.closest("td, dialog"), barra = el.closest(".barra-acoes, .fsec-acoes, .acao-exp");
    if (td && !barra) td.append(box); else ((barra?.closest(".barra-acoes") || barra || el)).after(box);
    box.scrollIntoView?.({ block: "nearest" }); box.querySelector("[data-conf-sim]").focus({ preventScroll: true });
    return false;
  }
  function respostaConfirma(bt) {
    const box = bt.closest(".conf-aqui"); if (!box) return;
    const el = box._el?.isConnected ? box._el : box._sel && document.querySelector(box._sel); box.remove();
    if (!el) return;
    // O "sim" vale só para este clique: se a ação parar antes (campo faltando), o próximo clique pergunta de novo.
    if (bt.matches("[data-conf-sim]")) { el.dataset.confirmado = "1"; setTimeout(() => { el.click(); setTimeout(() => delete el.dataset.confirmado, 800); }, 0); } else el.focus?.();
  }
  // Confere uma lista [[elemento, problema?], …]: marca os que têm problema e escreve todos de uma vez.
  function barrar(st, regras, prefixo = "Não salvou") {
    document.querySelectorAll(".campo-falta").forEach((el) => el.classList.remove("campo-falta"));
    const ruins = regras.filter(([, p]) => p);
    if (!ruins.length) return false;
    marcar(ruins.map(([el]) => el));
    diz(st, `${prefixo}: ${ruins.map(([, p]) => p).join("; ")}.`);
    return true;
  }
  const minimo = (el, n, nome) => { const t = (el?.value || "").trim().length; return t < n ? (t ? `${nome}: escreva pelo menos ${n} caracteres (agora tem ${t})` : `${nome}: preencha`) : null; };
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
    const campDemoVisiveis = (h) => { const p = eu(); if (["equipe", "adm"].includes(p?.tipo)) return h.campanhas || []; if (p?.tipo !== "casa") return [];
      const cv = db.conv?.[p.email], ks = [p.vinculo_nome, cv?.tipo === "casa" && cv.aceito_em && cv.vinculo_nome].filter(Boolean).map(TQCampanha.chaveCasa).filter(Boolean);
      return (h.campanhas || []).filter((c) => ks.includes(TQCampanha.chaveCasa(c.casa_ref))); };
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
        const perfil = { id: id(), email, nome, tipo: ["artista", "casa", "equipe", "adm"].includes(tipo) ? tipo : "artista", codigo_acesso: null, vinculo_nome: null, criado_em: agora(), senha_portal: true };
        db.usuarios[perfil.id] = { senha, perfil }; db.sessao = perfil.id; gravar();
        return { perfil };
      },
      async recuperar() { return true; },
      async sair() { db.sessao = null; gravar(); },
      async minhaInscricao() { return db.insc[db.sessao] || null; },
      async salvarInscricao(dados, enviar) {
        const atual = db.insc[db.sessao];
        if (atual && !["rascunho", "ajustes"].includes(atual.status) && (enviar || atual.status === "encerrada" || !soPreencheVazios(atual.dados, dados))) throw new Error("Inscrição em análise: aguarde o retorno da curadoria. Campos vazios você preenche direto.");
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
      async historico() { exigeEquipe(); return []; },
      // "Seu histórico": o que não vem nas listas já carregadas (S.eq ou S.conta), com quem e quando, como no banco.
      async meuHistorico(tipo) {
        const h = hubDemo(), u = db.sessao, eqp = ["equipe", "adm"].includes(tipo), tri = Object.entries(db.tri || {});
        const base = { campanhas: h.campanhas || [], campItens: h.itens || [], campHist: eqp ? db.campHist || [] : [], campFeitos: db.campFeitos || [], sem: (db.sem || []).filter((x) => x.atualizado_por === u), diario: [] };
        if (eqp) return { ...base, versoes: h.versoes || [], materiais: h.materiais || [], trilhas: tri.map(([k, t]) => ({ casa_ref: k, criado_por: t.criado_por, criado_em: t.criado_em })),
          marcos: tri.flatMap(([k, t]) => Object.entries(t.marcos || {}).map(([etapa, em]) => ({ casa_ref: k, etapa, feito_em: em, feito_por: t.por?.[etapa] || null }))) };
        if (tipo === "casa") return { ...base, disp: (db.disp || []).filter((x) => x.atualizado_por === u), eqc: (db.eqc || []).filter((x) => x.criado_por === u) };
        return { ...base, dispA: (db.dispA || []).filter((x) => x.user_id === u) };
      },
      async editarFichaCasa(cid, dados) { exigeEquipe(); const c = Object.values(db.casas).find((x) => x.id === cid); if (c) { c.dados = dados; gravar(); } },
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
        const email = c.email.toLowerCase().trim(); db.conv[email] = { ...db.conv[email], ...c, email, criado_em: db.conv[email]?.criado_em || agora(), criado_por: db.conv[email]?.criado_por || db.sessao, aceito_em: db.conv[email]?.aceito_em || null }; gravar();
        return { enviado: false, demo: true };
      },
      async convites() { exigeEquipe(); return Object.values(db.conv); },
      async cancelarConvite(email) { exigeEquipe(); delete db.conv[email]; gravar(); },
      async marcarTutorialEnviado(email) { if (db.conv[email]) { db.conv[email].tutorial_enviado_em = agora(); gravar(); } },
      async enviarLinkSenha() { return { enviado: false, demo: true }; },
      precisaSenha() { return false; },
      async definirSenha(senha) { db.usuarios[db.sessao].senha = senha; eu().senha_definida = true; eu().senha_portal = true; gravar(); },
      async marcarTutorial() { eu().tutorial_visto_em = agora(); gravar(); },
      async reivindicar() {
        const p = eu(), c = p && db.conv[p.email]; if (!c || c.aceito_em) return false;
        Object.assign(p, { tipo: c.tipo, codigo_acesso: c.codigo_acesso || p.codigo_acesso, vinculo_nome: c.vinculo_nome || p.vinculo_nome, funcoes: c.tipo === "casa" ? c.funcoes || null : null, ...(c.areas?.length && ["equipe", "adm"].includes(c.tipo) ? { areas: c.areas } : {}) }); c.aceito_em = agora(); gravar(); return true;
      },
      async avisar(a) { if (!db.avisos.some((x) => x.cidade.toLowerCase() === a.cidade.toLowerCase() && x.contato.toLowerCase() === a.contato.toLowerCase())) db.avisos.push({ ...a, id: id(), criado_em: agora() }); gravar(); },
      async avisos() { exigeEquipe(); return db.avisos; },
      async relatos() { exigeEquipe(); return []; },
      // Campanhas e materiais no modo demonstração: só existem se um teste guardar exemplos em "tq-demo-hub".
      // Como posso_casa() no banco: a equipe vê todas; a casa, as campanhas cujo nome normalizado bate com o vínculo dela.
      async hubCampanhas() {
        const h = hubDemo(), cs = campDemoVisiveis(h), ids = new Set(cs.map((c) => c.id)), its = (h.itens || []).filter((i) => ids.has(i.campanha_id) && i.ativo !== false), iids = new Set(its.map((i) => i.id));
        return { campanhas: cs, itens: its, feitos: (db.campFeitos || []).filter((f) => iids.has(f.item_id)) };
      },
      async marcarCampanha(itemId, feito, nota) {
        db.campFeitos = (db.campFeitos || []).filter((f) => f.item_id !== itemId);
        if (feito) db.campFeitos.push({ item_id: itemId, feito_por: db.sessao, feito_em: agora(), nota: nota || null });
        (db.campHist ||= []).push({ item_id: itemId, acao: feito ? "feito" : "desfeito", por: db.sessao, em: agora() });
        gravar();
      },
      async ajustarDiaCampanha(itemId, mud) {
        exigeEquipe(); const h = hubDemo(), it = (h.itens || []).find((i) => i.id === itemId); if (!it) throw new Error("Dia da campanha não encontrado.");
        Object.assign(it, mud); h.itens.sort((a, b) => a.dia.localeCompare(b.dia)); localStorage.setItem("tq-demo-hub", JSON.stringify(h));
      },
      async andamentoCampanhas() {
        const h = hubDemo(), hoje = new Date().toISOString().slice(0, 10), fs = new Set((db.campFeitos || []).map((f) => f.item_id));
        return campDemoVisiveis(h).map((c) => { const its = (h.itens || []).filter((i) => i.campanha_id === c.id && i.ativo !== false);
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
      async conteudoVersao(vid) { return (hubDemo().versoes || []).find((v) => v.id === vid)?.conteudo_html || null; },
      async publicarDoc(d) {
        exigeEquipe(); const h = hubDemo();
        let m = (h.materiais || []).find((x) => x.slug === d.slug);
        if (!m) { m = { id: id(), slug: d.slug, titulo: d.titulo, area: d.area, funcao: d.funcao || null, tipo_material: d.tipo, publico: d.publico, fonte_url: d.fonte_url, ativo: true }; (h.materiais ||= []).push(m); }
        else { m.ativo = true; m.titulo = d.titulo; }
        const versao = (h.versoes || []).some((x) => x.material_id === m.id && x.versao === d.versao) ? `${d.versao} (${new Date().toISOString().slice(11, 16)})` : d.versao;
        (h.versoes ||= []).push({ id: id(), material_id: m.id, versao, resumo: d.resumo || null, url: null, exige_ciencia: false, conteudo_html: d.html, tem_conteudo: true, publicada_em: agora(), publicada_por: db.sessao });
        for (const r of d.aposentar || []) { const x = h.materiais.find((y) => y.slug === r); if (x) x.ativo = false; }
        localStorage.setItem("tq-demo-hub", JSON.stringify(h));
      },
      async publicarVersao(v) {
        exigeEquipe(); const h = hubDemo();
        if ((h.versoes || []).some((x) => x.material_id === v.material_id && x.versao === v.versao)) throw new Error("duplicate key value violates unique constraint");
        (h.versoes ||= []).push({ ...v, id: id(), publicada_em: agora(), publicada_por: db.sessao }); localStorage.setItem("tq-demo-hub", JSON.stringify(h));
      },
      async importarCampanha(dados) {
        exigeEquipe(); const h = hubDemo();
        let c = (h.campanhas ||= []).find((x) => x.slug === dados.slug);
        if (!c) { c = { id: id() }; h.campanhas.push(c); }
        Object.assign(c, { slug: dados.slug, titulo: dados.titulo, casa_ref: dados.casa, fonte_url: dados.fonte_url, importada_em: agora(), importada_por: db.sessao });
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
        (h.versoes ||= []).push({ ...v, material_id: mid, id: id(), publicada_em: agora(), publicada_por: db.sessao }); localStorage.setItem("tq-demo-hub", JSON.stringify(h));
      },
      // Contrato automático (mesmas regras do banco, supabase/schema.sql v7).
      async modelosContrato() { exigeEquipe(); return db.modContr; },
      async salvarModeloContrato(m) { exigeEquipe(); if (m.id) Object.assign(db.modContr.find((x) => x.id === m.id), m); else db.modContr.unshift({ ...m, id: id(), ativo: true, criado_em: agora() }); gravar(); },
      async contratos() { const p = eu(); return db.contr.filter((c) => ["equipe", "adm"].includes(p?.tipo) || c.user_id === db.sessao); },
      async criarContrato(c) { exigeEquipe(); const n = { ...c, id: id(), status: "enviado", dados: {}, lido_fim_em: null, criado_por: db.sessao, criado_em: agora() }; db.contr.unshift(n); gravar(); return n; },
      async cancelarContrato(cid) { exigeEquipe(); const c = db.contr.find((x) => x.id === cid); if (c?.conferido_em) throw new Error("Contrato já conferido pela equipe não pode ser alterado."); if (c?.status === "enviado") { c.status = "cancelado"; gravar(); } },
      async contratoSalvarDados(cid, d) {
        const c = db.contr.find((x) => x.id === cid && x.user_id === db.sessao && x.status === "enviado" && !x.conferido_em); if (!c) throw new Error("Contrato não encontrado, já assinado ou já conferido pela equipe.");
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
        if (m.id) Object.assign(db.eqc.find((x) => x.id === m.id), linha); else db.eqc.push({ ...linha, id: id(), casa_ref: p.vinculo_nome, criado_em: agora(), criado_por: db.sessao });
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
        t.marcos ||= {}; t.por ||= {}; if (feito) { t.marcos[etapa] = agora(); t.por[etapa] = db.sessao; } else delete t.marcos[etapa]; gravar();
      },
      async trilhas() {
        exigeEquipe(); const T = db.tri || {};
        return { trilhas: Object.entries(T).map(([k, t]) => ({ casa_ref: k, inicio: t.inicio, nota_passagem: t.nota || null })),
          marcos: Object.entries(T).flatMap(([k, t]) => Object.entries(t.marcos || {}).map(([etapa, em]) => ({ casa_ref: k, etapa, feito_em: em }))) };
      },
      async salvarTrilha(t) { exigeEquipe(); db.tri ||= {}; db.tri[t.casa_ref] = { criado_em: agora(), criado_por: db.sessao, ...(db.tri[t.casa_ref] || {}), inicio: t.inicio, nota: t.nota || null }; gravar(); },
      async marcarTrilha(ref, etapa, feito) { exigeEquipe(); const t = db.tri[ref]; t.marcos ||= {}; t.por ||= {}; if (feito) { t.marcos[etapa] = agora(); t.por[etapa] = db.sessao; } else delete t.marcos[etapa]; gravar(); },
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
        Object.assign(x, { status: aprovar ? "aprovada" : "recusada", resposta: resposta || null, revisado_em: agora(), revisado_por: db.sessao }); gravar();
      },
      // Propostas de atualização (mesmas regras do banco, schema v34): a equipe propõe, a pessoa aceita, ajusta ou recusa.
      async propostas() {
        const p = eu(); if (!p) return [];
        for (const x of db.prop || []) if (!x.alvo_user && x.convite_email === p.email && x.alvo_tipo === p.tipo) { x.alvo_user = p.id; gravar(); }
        return (db.prop || []).filter((x) => TQPropostas.podePropor(p, x.alvo_tipo) || x.alvo_user === p.id).sort((a, b) => b.criado_em.localeCompare(a.criado_em));
      },
      async criarProposta(n) {
        const p = eu(); if (!TQPropostas.podePropor(p, n.alvo_tipo)) throw new Error("Sem permissão: artistas são da área de Agenda e casas, da área de Operações.");
        const conv = n.convite_email ? String(n.convite_email).toLowerCase().trim() : null;
        const alvo = n.alvo_user || (conv && Object.values(db.usuarios).find((u) => u.perfil.email === conv)?.perfil.id) || null;
        const d = alvo ? (n.alvo_tipo === "casa" ? db.casas[alvo] : db.insc[alvo])?.dados || {} : {};
        const x = { id: id(), alvo_tipo: n.alvo_tipo, alvo_user: alvo, alvo_ref: n.alvo_ref || null, convite_email: conv, campos: n.campos || {}, disponibilidade: n.disponibilidade?.length ? n.disponibilidade : null,
          antes: Object.fromEntries(Object.keys(n.campos || {}).map((k) => [k, d[k] ?? null])), motivo: n.motivo || null, status: "pendente", criado_por: db.sessao, criado_em: agora(), respondido_em: null };
        if (!Object.keys(x.campos).length && !x.disponibilidade) throw new Error("Escolha pelo menos uma informação para propor.");
        (db.prop ||= []).push(x); gravar(); return x;
      },
      async responderProposta(pid, aceitar, ajustes) {
        const p = eu(), x = (db.prop || []).find((y) => y.id === pid && (y.alvo_user === p?.id || p?.tipo === "adm"));
        if (!x) throw new Error("Proposta não encontrada."); if (x.status !== "pendente") throw new Error("Esta proposta já foi respondida.");
        if (!aceitar) { Object.assign(x, { status: "recusada", respondido_em: agora() }); gravar(); return x; }
        let campos = { ...x.campos }, disp = x.disponibilidade;
        for (const [k, v] of Object.entries(ajustes?.campos || {})) { if (!(k in x.campos)) throw new Error("Este campo não estava na proposta: " + k); if (TQPropostas.vazio(v)) delete campos[k]; else campos[k] = v; }
        if (ajustes && "disponibilidade" in ajustes) disp = ajustes.disponibilidade?.length ? ajustes.disponibilidade : null;
        const ajustou = JSON.stringify(campos) !== JSON.stringify(x.campos) || JSON.stringify(disp) !== JSON.stringify(x.disponibilidade);
        const u = x.alvo_user, casa = x.alvo_tipo === "casa";
        if (Object.keys(campos).length) {
          if (casa) { const c = db.casas[u] ||= { id: id(), user_id: u, dados: {}, status: "rascunho", criado_em: agora() }; c.dados = { ...c.dados, ...campos }; c.pendencias = R.pendenciasCasa(c.dados); c.atualizado_em = agora(); }
          else { const i = db.insc[u] ||= { id: id(), user_id: u, dados: {}, status: "rascunho", criado_em: agora() }; i.dados = { ...i.dados, ...campos }; const pc = R.preCuradoria(i.dados); Object.assign(i, { score: pc.score, faixa: pc.faixa, score_detalhe: pc.detalhe, alertas: pc.alertas, atualizado_em: agora() }); }
        }
        const ref = casa ? db.usuarios[u]?.perfil.vinculo_nome || db.casas[u]?.dados?.nome || x.alvo_ref : null;
        for (const it of disp || []) {
          const cid = casa ? null : it.cidade || null, achou = (db.sem ||= []).find((s) => casa ? s.casa_ref && ref && s.casa_ref.toLowerCase() === ref.toLowerCase() : s.user_id === u && String(s.cidade || "").toLowerCase() === String(cid || "").toLowerCase());
          if (casa && !ref) continue;
          if (achou) achou.dias = [...new Set([...achou.dias, ...it.dias])].sort(); else db.sem.push(casa ? { casa_ref: ref, dias: [...it.dias].sort() } : { user_id: u, cidade: cid, dias: [...it.dias].sort() });
        }
        Object.assign(x, { status: ajustou ? "ajustada" : "aceita", aplicado: { campos, disponibilidade: disp }, respondido_em: agora() }); gravar(); return x;
      },
      async definirAreas(pid, areas) { if (eu().tipo !== "adm") throw new Error("Só a administração define as áreas da equipe."); const u = db.usuarios[pid]; if (u && ["equipe", "adm"].includes(u.perfil.tipo)) u.perfil.areas = areas.length ? areas : null; gravar(); },
      async definirCombinados(cid, cb) { exigeEquipe(); Object.values(db.casas).find((y) => y.id === cid).combinados = cb; gravar(); },
      async semanal() { const p = eu(); return (db.sem || []).filter((x) => ["equipe", "adm"].includes(p?.tipo) || (x.user_id && x.user_id === p?.id) || (x.casa_ref && x.casa_ref === p?.vinculo_nome)); },
      async salvarSemanal(alvo, dias, cidade = null) {
        const p = eu(), casa = alvo === "casa", cid = casa ? null : (cidade || null);
        if (casa ? p?.tipo !== "casa" || p.funcoes || !p.vinculo_nome : p?.tipo !== "artista") throw new Error("Só a própria casa (responsável) ou a própria artista marca os dias da semana.");
        db.sem = (db.sem || []).filter((x) => !(casa ? x.casa_ref === p.vinculo_nome : x.user_id === p.id && (x.cidade || null) === cid));
        if (casa || dias.length) db.sem.push({ ...(casa ? { casa_ref: p.vinculo_nome } : { user_id: p.id, cidade: cid }), dias: [...new Set(dias)].sort(), atualizado_em: agora(), atualizado_por: db.sessao }); gravar();
      },
      async dispArtistas() { const p = eu(); return (db.dispA || []).filter((x) => ["equipe", "adm"].includes(p?.tipo) || x.user_id === p?.id); },
      async marcarDispArtista(dia, situacao, nota) {
        const p = eu(); if (p?.tipo !== "artista") throw new Error("Só a própria artista informa a disponibilidade.");
        if (dia < hojeIso()) throw new Error("Esse dia já passou.");
        const antes = (db.dispA || []).find((x) => x.user_id === p.id && x.dia === dia);
        db.dispA = (db.dispA || []).filter((x) => x !== antes);
        if (situacao) db.dispA.push({ user_id: p.id, dia, situacao, nota: nota === undefined ? antes?.nota || null : nota || null, atualizado_em: agora() }); gravar();
      },
      async disponibilidade() { const p = eu(); return (db.disp || []).filter((x) => ["equipe", "adm"].includes(p?.tipo) || x.casa_ref === p?.vinculo_nome); },
      async datasPortal() {
        const p = eu(), minha = Object.values(db.casas).find((c) => c.user_id === db.sessao), k = (x) => String(x || "").trim().toLowerCase();
        // Funcionário da casa (Líder Local, Anfitrião…) vê as datas da própria casa, como o dono (banco v35).
        const daEquipeDaCasa = (d) => p?.tipo === "casa" && p.funcoes?.length && p.vinculo_nome && k(d.casa_nome) === k(p.vinculo_nome);
        return (db.datasP || []).filter((d) => ["equipe", "adm"].includes(p?.tipo) || (minha && d.casa_id === minha.id) || daEquipeDaCasa(d) || (d.artistas || []).some((a) => a.user_id === db.sessao));
      },
      async salvarDataPortal(d) {
        exigeEquipe(); db.datasP ||= [];
        const i = d.id ? db.datasP.findIndex((x) => x.id === d.id) : -1;
        const n = { status: "confirmada", ...(i >= 0 ? db.datasP[i] : { id: id(), criado_em: agora(), criado_por: db.sessao }), ...d, atualizado_em: agora() };
        if (i >= 0) db.datasP[i] = n; else db.datasP.push(n); gravar(); return n;
      },
      async marcarDisponibilidade(casa_ref, dia, situacao, nota) {
        const p = eu(); if (p?.tipo !== "casa" || p.funcoes || p.vinculo_nome !== casa_ref) throw new Error("Só o responsável da casa informa a disponibilidade.");
        const antes = (db.disp || []).find((x) => x.casa_ref === casa_ref && x.dia === dia);
        db.disp = (db.disp || []).filter((x) => x !== antes);
        if (situacao) db.disp.push({ casa_ref, dia, situacao, nota: nota === undefined ? antes?.nota || null : nota || null, atualizado_em: agora(), atualizado_por: db.sessao }); gravar();
      },
      async documentos() { return []; },
      async criarDocumento() { throw new Error("No modo demonstração os documentos não são guardados."); },
      async apagarDocumento() {},
      // Arquivos: no modo demonstração só o contrato assinado e o comprovante de passo "chegam" (fica o nome, não o conteúdo).
      async meusArquivos() { const out = {}; for (const f of (db.arqs || []).filter((x) => x.user_id === db.sessao)) (out[f.evento_id] ||= []).unshift(f); return out; },
      async enviarArquivo(eventoId, arquivo) {
        if (!/^(contrato|passo)_/.test(eventoId)) throw new Error("O envio de arquivos funciona só com o banco ligado (fora do modo demonstração).");
        const nome = `${Date.now()}-${String(arquivo?.name || "contrato.pdf").replace(/[^\w.-]+/g, "_").slice(-80)}`;
        (db.arqs ||= []).push({ user_id: db.sessao, evento_id: eventoId, nome, caminho: `${db.sessao}/${eventoId}/${nome}`, em: agora() }); gravar();
      },
      async linkArquivo() { return null; },
      async arquivosTodos() { exigeEquipe(); return [...(db.arqs || [])].sort((a, b) => b.em.localeCompare(a.em)); },
      // Conferir o contrato assinado enviado (mesmas regras do banco, schema v28).
      async conferirContrato(cid, aceitar, motivo) {
        exigeEquipe(); const c = db.contr.find((x) => x.id === cid); if (!c) throw new Error("Contrato não encontrado.");
        const p = eu(), area = db.usuarios[c.user_id]?.perfil.tipo === "casa" ? "operacoes" : "agenda";
        if (p.tipo !== "adm" && p.areas?.length && !p.areas.includes(area)) throw new Error(`Este contrato é conferido pela área de ${area === "operacoes" ? "Operações" : "Agenda"} (ou pela administração).`);
        if (c.status === "cancelado") throw new Error("Contrato cancelado: não há o que conferir.");
        if (c.status === "assinado") throw new Error("Este contrato foi assinado dentro do portal: não precisa conferir.");
        if (c.conferido_em) throw new Error("Este contrato já foi conferido.");
        const ultimo = (db.arqs || []).filter((f) => f.user_id === c.user_id && f.evento_id === "contrato_" + c.id).map((f) => f.em).sort().pop();
        if (!ultimo) throw new Error("O arquivo assinado ainda não chegou: não há o que conferir.");
        if (c.devolvido_em && ultimo <= c.devolvido_em) throw new Error("O arquivo novo ainda não chegou: a pessoa precisa enviar de novo antes.");
        if (aceitar) Object.assign(c, { conferido_em: agora(), conferido_por: db.sessao, devolvido_em: null, devolvido_por: null, devolvido_motivo: null });
        else {
          motivo = String(motivo || "").replace(/\s+/g, " ").trim(); if (motivo.length < 5) throw new Error("Escreva o motivo: a pessoa vai ler o que precisa corrigir.");
          Object.assign(c, { devolvido_em: agora(), devolvido_por: db.sessao, devolvido_motivo: motivo.slice(0, 500) });
          if (c.evento_id) db.chk = db.chk.filter((x) => !(x.user_id === c.user_id && x.evento_id === c.evento_id && x.item === "contrato"));
        }
        gravar(); return { ...c };
      },
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
    let TEM_CONTEUDO = true;   // banco com a v18 (documento dentro da página)
    const ok = ({ data, error }) => { if (error) throw new Error(traduz(error.message)); return data; };
    const uid = async () => (await sb.auth.getUser()).data.user?.id;
    // O código de acesso não sai na leitura de perfis (só por meu_acesso, e o de todos só para a adm: schema v8).
    // Banco ainda sem a v8: lê como antes.
    const COLS0 = "id,email,nome,tipo,whatsapp,vinculo_nome,criado_em,tutorial_visto_em,senha_definida,vinculo_pedido_nome,vinculo_pedido_em", COLS = COLS0 + ",funcoes,areas";
    // Função na equipe da casa (schema v11). Banco ainda sem a coluna: lê como antes.
    const lerCols = async (montar) => { const r = await montar(sb.from("perfis").select(COLS)); return r.error && /funcoes|areas/.test(r.error.message || "") ? montar(sb.from("perfis").select(COLS0)) : r; };
    const semV8 = (e) => /PGRST202|42703|Could not find the function|does not exist/i.test(`${e?.code} ${e?.message}`);
    const perfil = async () => {
      const user = (await sb.auth.getUser()).data.user, u = user?.id; if (!u) return null;
      // Senha salva pelo próprio portal (cadastro com senha, "Crie a sua senha", "Mudar a senha"): fica nos metadados da conta.
      const senha_portal = !!user.user_metadata?.senha_portal;
      const r = await lerCols((x) => x.eq("id", u).maybeSingle());
      if (r.error && semV8(r.error)) { const p0 = ok(await sb.from("perfis").select("*").eq("id", u).maybeSingle()); return p0 && { ...p0, senha_portal }; }
      const p = ok(r); if (!p) return null;
      const a = await sb.rpc("meu_acesso");
      return { ...p, senha_portal, codigo_acesso: a.data?.[0]?.codigo_acesso ?? null, vinculo_pedido: a.data?.[0]?.vinculo_pedido ?? null };
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
        const r = ok(await sb.auth.signUp({ email, password: senha, options: { data: { nome, tipo, senha_portal: true }, emailRedirectTo: location.origin + location.pathname } }));
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
      // Administração edita a Ficha direto (Gui, 11/2026); o banco só deixa a adm.
      // "Seu histórico": colunas de quem e quando (feito_por, publicada_por, importada_por, atualizado_por...) e, para a
      // equipe, o diário de uso da própria pessoa. Cada leitura falha sozinha (banco antigo ou sem permissão) sem derrubar a tela.
      async meuHistorico(tipo, desde) {
        const u = await uid(), eqp = ["equipe", "adm"].includes(tipo);
        const q = (pr) => Promise.resolve(pr).then((r) => (r?.error ? [] : r?.data || []), () => []);
        const [campanhas, campHist, campFeitos, sem] = await Promise.all([
          eqp ? q(sb.from("campanhas").select("id,titulo,casa_ref,importada_em,importada_por").eq("importada_por", u).gte("importada_em", desde)) : [],
          eqp ? q(sb.from("campanha_historico").select("item_id,acao,por,em").eq("por", u).gte("em", desde).order("em", { ascending: false }).limit(500)) : [],
          tipo === "artista" ? [] : q(sb.from("campanha_feitos").select("item_id,feito_por,feito_em").eq("feito_por", u).gte("feito_em", desde)),
          q(sb.from("disponibilidade_semanal").select("casa_ref,user_id,cidade,dias,atualizado_em,atualizado_por").eq("atualizado_por", u).gte("atualizado_em", desde)),
        ]);
        // Qual campanha e qual dia de cada dia marcado.
        const ids = [...new Set([...campHist, ...campFeitos].map((x) => x.item_id))].slice(0, 300);
        const campItens = ids.length ? await q(sb.from("campanha_itens").select("id,campanha_id,dia").in("id", ids)) : [];
        const faltam = [...new Set(campItens.map((i) => i.campanha_id))].filter((cid) => !campanhas.some((c) => c.id === cid));
        if (faltam.length) campanhas.push(...(await q(sb.from("campanhas").select("id,titulo,casa_ref").in("id", faltam))));
        const out = { campanhas, campHist, campFeitos, campItens, sem };
        if (eqp) {
          const dia = () => sb.from("diario").select("criado_em,acao,detalhe").eq("user_id", u).gte("criado_em", desde).order("criado_em", { ascending: false });
          const [versoes, materiais, trilhas, marcos, diario, cliques] = await Promise.all([
            q(sb.from("material_versoes").select("id,material_id,versao,publicada_em,publicada_por").eq("publicada_por", u).gte("publicada_em", desde)),
            q(sb.from("materiais").select("id,titulo")),
            q(sb.from("trilhas").select("casa_ref,criado_por,criado_em").eq("criado_por", u).gte("criado_em", desde)),
            q(sb.from("trilha_marcos").select("casa_ref,etapa,feito_por,feito_em").eq("feito_por", u).gte("feito_em", desde)),
            q(dia().in("acao", TQHistorico.ACOES_DIARIO).limit(1000)),
            q(dia().eq("acao", "clique").eq("detalhe->>externo", "whatsapp").limit(300)),
          ]);
          return { ...out, versoes, materiais, trilhas, marcos, diario: [...diario, ...cliques] };
        }
        if (tipo === "casa") {
          const [disp, eqc] = await Promise.all([
            q(sb.from("disponibilidade_casa").select("casa_ref,dia,situacao,atualizado_em,atualizado_por").eq("atualizado_por", u).gte("atualizado_em", desde)),
            q(sb.from("equipe_casa").select("id,nome,funcoes,casa_ref,criado_por,criado_em").eq("criado_por", u).gte("criado_em", desde)),
          ]);
          return { ...out, disp, eqc };
        }
        return { ...out, dispA: await q(sb.from("disponibilidade_artista").select("dia,situacao,atualizado_em").eq("user_id", u).gte("atualizado_em", desde)) };
      },
      async historico() { return ok(await sb.from("auditoria").select("id,quando,quem_email,tabela,registro,operacao,antes,depois").order("id", { ascending: false }).limit(400)); },
      async editarFichaCasa(cid, dados) { const r = ok(await sb.from("cadastros_casas").update({ dados }).eq("id", cid).select("dados")); if (!r?.length || JSON.stringify(r[0].dados) !== JSON.stringify(dados)) throw new Error("Só a administração e a área de Operações editam a Ficha direto."); },
      async perfis() { return lerPerfis((x) => x.order("criado_em", { ascending: false })); },
      async atualizarPerfil(pid, campos) { ok(await sb.from("perfis").update(campos).eq("id", pid)); },
      async checklistTodos() { return ok(await sb.from("checklist").select("*")); },
      async registrosTodos() { return ok(await sb.from("registros_noite").select("*").order("criado_em", { ascending: false })); },
      // convites, primeiro acesso e avisos
      async convidar(c) {
        const linha = { email: c.email.toLowerCase().trim(), tipo: c.tipo, nome: c.nome || "", whatsapp: c.whatsapp || null, codigo_acesso: c.codigo_acesso || null, vinculo_nome: c.vinculo_nome || null, criado_por: await uid(), ...(c.areas?.length ? { areas: c.areas } : {}) };
        ok(await sb.from("convites").upsert(linha, { onConflict: "email" }));
        // Link de acesso por e-mail. A conta nasce ao clicar; o convite aplica perfil e vínculo nessa hora.
        const { error } = await sb.auth.signInWithOtp({ email: linha.email, options: { shouldCreateUser: true, emailRedirectTo: base(), data: { nome: linha.nome, tipo: linha.tipo === "casa" ? "casa" : "artista", pelo_link: "1" } } });
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
        const r = await sb.auth.updateUser({ password: senha, data: { senha_portal: true } });
        // Senha igual à que já estava na conta: o Supabase recusa (422), mas a pessoa já tem essa senha; segue.
        if (r.error && !/different from the old password|same_password/i.test(r.error.message + " " + (r.error.code || ""))) ok(r);
        if (r.error) await sb.auth.updateUser({ data: { senha_portal: true } });   // senha igual: marca mesmo assim
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
      // Equipe confere o arquivo assinado enviado: aceitar (conferido) ou pedir de novo com o motivo (schema v28).
      async conferirContrato(cid, aceitar, motivo) {
        const r = await sb.rpc("conferir_contrato", { cid, aceitar, motivo: motivo || null });
        if (r.error && /PGRST202|Could not find the function/i.test(`${r.error.code} ${r.error.message}`)) throw new Error("A conferência de contratos ainda não está ligada no banco (rode o supabase/schema.sql, parte v28).");
        return ok(r);
      },
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
      async marcarCampanha(itemId, feito, nota) {
        if (feito) ok(await sb.from("campanha_feitos").insert({ item_id: itemId, ...(nota ? { nota: String(nota).slice(0, 500) } : {}) }));
        else ok(await sb.from("campanha_feitos").delete().eq("item_id", itemId));
      },
      async andamentoCampanhas() { return ok(await sb.rpc("andamento_campanhas")); },
      // Equipe: troca a data ou o texto de um dia (a casa vê na hora). Recarregar a página do Bruno volta ao texto dela.
      async ajustarDiaCampanha(itemId, mud) { ok(await sb.from("campanha_itens").update(mud).eq("id", itemId)); },
      // Materiais com versão vigente e ciência de leitura ("Li e estou ciente"), que fica registrada por versão.
      async hubMateriais() {
        const u = await uid();
        const [materiais, versoes, minhas, pendentes, todas] = await Promise.all([
          sb.from("materiais").select("*").eq("ativo", true).order("titulo"),
          sb.from("material_versoes").select(TEM_CONTEUDO ? "id,material_id,versao,resumo,url,exige_ciencia,publicada_em,tem_conteudo" : "id,material_id,versao,resumo,url,exige_ciencia,publicada_em").order("publicada_em", { ascending: false }),
          sb.from("ciencias").select("versao_id,registrada_em").eq("user_id", u),
          sb.rpc("minhas_ciencias_pendentes"),
          sb.from("ciencias").select("versao_id,user_id,registrada_em"),
        ]);
        // Banco ainda sem a v18 (documento dentro da página): lê como antes, e os documentos abrem pelo link.
        if (versoes.error && /tem_conteudo/.test(versoes.error.message || "")) { TEM_CONTEUDO = false; return this.hubMateriais(); }
        return { materiais: ok(materiais), versoes: ok(versoes), minhas: ok(minhas), pendentes: ok(pendentes), todas: ok(todas) };
      },
      async darCiencia(versaoId) { ok(await sb.from("ciencias").insert({ versao_id: versaoId })); },
      async conteudoVersao(vid) { const [v] = ok(await sb.from("material_versoes").select("conteudo_html").eq("id", vid)); return v?.conteudo_html || null; },
      // Equipe: publica um documento para abrir dentro do portal (cria o material na primeira vez) e aposenta os que ele substitui.
      async publicarDoc(d) {
        let [m] = ok(await sb.from("materiais").select("id").eq("slug", d.slug));
        if (!m) [m] = ok(await sb.from("materiais").insert({ slug: d.slug, titulo: d.titulo, area: d.area, funcao: d.funcao || null, tipo_material: d.tipo, publico: d.publico, fonte_url: d.fonte_url }).select("id"));
        else ok(await sb.from("materiais").update({ ativo: true, titulo: d.titulo }).eq("id", m.id));
        const { error } = await sb.from("material_versoes").insert({ material_id: m.id, versao: d.versao, resumo: d.resumo || null, conteudo_html: d.html });
        if (error && /duplicate|unique/i.test(error.message)) ok(await sb.from("material_versoes").insert({ material_id: m.id, versao: `${d.versao} (${new Date().toISOString().slice(11, 16)})`, resumo: d.resumo || null, conteudo_html: d.html }));
        else if (error) ok({ error });
        if (d.aposentar?.length) ok(await sb.from("materiais").update({ ativo: false }).in("slug", d.aposentar));
      },
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
        const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: base(), data: { nome, tipo: "casa", pelo_link: "1" } } });
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
      async propostas() { return ok(await sb.from("propostas_atualizacao").select("*").order("criado_em", { ascending: false }).limit(500)); },
      async criarProposta(n) { return ok(await sb.from("propostas_atualizacao").insert({ alvo_tipo: n.alvo_tipo, alvo_user: n.alvo_user || null, alvo_ref: n.alvo_ref || null, convite_email: n.convite_email || null, campos: n.campos || {}, disponibilidade: n.disponibilidade?.length ? n.disponibilidade : null, motivo: n.motivo || null }).select().single()); },
      async responderProposta(pid, aceitar, ajustes) { return ok(await sb.rpc("responder_proposta", { pid, aceitar, ajustes: ajustes || null })); },
      async definirAreas(conta, areas) { ok(await sb.rpc("definir_areas", { conta, novas: areas })); },
      async semanal() { const r = await sb.from("disponibilidade_semanal").select("casa_ref,user_id,dias,cidade"); return ok(r.error && /cidade/.test(r.error.message || "") ? await sb.from("disponibilidade_semanal").select("casa_ref,user_id,dias") : r); },
      async salvarSemanal(alvo, dias, cidade = null) {
        const p = await this.sessao(), casa = alvo === "casa", cid = casa ? null : (cidade || null), base = sb.from("disponibilidade_semanal").select("id");
        const atual = ok(await (casa ? base.eq("casa_ref", p.vinculo_nome) : cid ? base.eq("user_id", p.id).eq("cidade", cid) : base.eq("user_id", p.id).is("cidade", null)).maybeSingle());
        if (!casa && cid && !dias.length) { if (atual) ok(await sb.from("disponibilidade_semanal").delete().eq("id", atual.id)); return; }
        ok(atual ? await sb.from("disponibilidade_semanal").update({ dias }).eq("id", atual.id)
          : await sb.from("disponibilidade_semanal").insert(casa ? { casa_ref: p.vinculo_nome, dias } : { user_id: p.id, dias, ...(cid ? { cidade: cid } : {}) }));
      },
      async dispArtistas() { return ok(await sb.from("disponibilidade_artista").select("user_id,dia,situacao,nota").gte("dia", hojeIso()).order("dia")); },
      // nota: motivo da exceção (feriado, evento privado…); undefined mantém a que já estava.
      async marcarDispArtista(dia, situacao, nota) {
        const u = await uid();
        ok(situacao ? await sb.from("disponibilidade_artista").upsert({ user_id: u, dia, situacao, ...(nota === undefined ? {} : { nota: nota || null }) }) : await sb.from("disponibilidade_artista").delete().match({ user_id: u, dia }));
      },
      async disponibilidade() { return ok(await sb.from("disponibilidade_casa").select("casa_ref,dia,situacao,nota,atualizado_em").order("dia")); },
      async datasPortal() { return ok(await sb.from("datas_portal").select("*").order("dia")); },
      async salvarDataPortal(d) {
        const { id: did, ...linha } = d;
        return ok(did ? await sb.from("datas_portal").update(linha).eq("id", did).select().single() : await sb.from("datas_portal").insert(linha).select().single());
      },
      async marcarDisponibilidade(casa_ref, dia, situacao, nota) {
        ok(situacao ? await sb.from("disponibilidade_casa").upsert({ casa_ref, dia, situacao, ...(nota === undefined ? {} : { nota: nota || null }) }) : await sb.from("disponibilidade_casa").delete().match({ casa_ref, dia }));
      },
    };
  }
  // Traduz a resposta do servidor para o que a pessoa precisa saber: o que aconteceu e o que fazer agora.
  // (O "✕ Erro:" na frente quem coloca é o diz().)
  function traduz(m) {
    m = String(m || "");
    if (/Invalid login credentials/i.test(m)) return "e-mail ou senha não conferem. Confira os dois ou use \"Esqueci minha senha\".";
    if (/Email not confirmed/i.test(m)) return "seu e-mail ainda não foi confirmado. Abra o e-mail \"Confirme sua conta\" da Rede Tranquilo (olhe também o spam) e clique no link.";
    if (/already registered|already been registered|user_already_exists/i.test(m)) return "já existe uma conta com este e-mail. Clique em \"Entrar\" ou use \"Esqueci minha senha\".";
    if (/different from the old password|same_password/i.test(m)) return "a senha nova precisa ser diferente da que você já usa.";
    if (/reauthenticat/i.test(m)) return "por segurança, peça um novo link em \"Esqueci minha senha\" e troque a senha por ele.";
    if (/Password should be at least/i.test(m)) return "a senha precisa ter pelo menos 8 caracteres.";
    if (/weak|easy to guess|pwned|leaked/i.test(m)) return "essa senha é fácil de adivinhar ou já vazou em outro site. Escolha outra, com pelo menos 8 caracteres.";
    if (/rate limit|too many|security purposes/i.test(m)) return "muitos e-mails enviados em pouco tempo. Espere uns minutos e tente de novo, ou mande o convite pelo WhatsApp.";
    if (/Error sending|sending (confirmation|recovery|magic link|invite)|smtp/i.test(m)) return "o e-mail não saiu do nosso servidor. Nada foi enviado. Tente de novo em instantes ou mande pelo WhatsApp.";
    if (/Signups not allowed|not allowed|not authorized/i.test(m)) return "o servidor não deixou enviar para este e-mail. Confira o endereço ou fale com a equipe.";
    if (/Email address .* is invalid|email_address_invalid|invalid email/i.test(m)) return "esse e-mail não parece válido. Confira se está escrito certo (ex.: nome@gmail.com).";
    if (/otp_expired|expired|invalid.*(link|token)|Token has expired/i.test(m)) return "esse link já venceu ou já foi usado. Peça um novo e use o mais recente.";
    if (/JWT expired|invalid JWT|session.*(missing|expired)|refresh token/i.test(m)) return "sua sessão expirou. Saia e entre de novo; o que estava salvo continua lá.";
    if (/duplicate key/i.test(m)) return "isso já estava salvo. Recarregue a página para ver.";
    if (/^Não habilitada: /.test(m)) return m.replace(/^Não habilitada: /, "não dá para habilitar: ");
    if (/invalid input syntax|out of range|violates check constraint/i.test(m)) return "algum campo tem um valor que não dá para salvar (confira números e datas). Nada foi salvo.";
    if (/Failed to fetch|NetworkError|Load failed|network/i.test(m)) return "sem conexão com a internet agora. Nada foi salvo. Confira a rede e tente de novo.";
    if (/upstream|Bad Gateway|Service Unavailable|Gateway|timeout|statement timeout|5\d\d/i.test(m)) return "o servidor ficou instável. Nada foi salvo. Tente de novo em instantes.";
    if (/row-level security|permission denied/i.test(m)) return "sua conta não tem permissão para fazer isso. Se acha que deveria ter, fale com a equipe.";
    if (/^[\x00-\x7F]+$/.test(m) && m.length > 0) { console.warn("Mensagem do servidor:", m); try { TQDiario.registrar("erro_servidor", { msg: m.replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[e-mail]").slice(0, 200) }); } catch { /* diário fora do ar */ } return "o servidor recusou e nada foi salvo. Tente de novo; se continuar, toque em \"Algo deu errado?\" no rodapé que a equipe vê o que aconteceu."; }
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
      [conta.docs, conta.arqs, conta.contr, conta.datasP] = await Promise.all([api.documentos().catch(() => []), api.meusArquivos().catch(() => ({})), api.contratos().catch(() => []), api.datasPortal().catch(() => [])]);
      // Propostas de atualização da equipe (v34): só o responsável (artista ou dono da casa) responde.
      conta.prop = perfil.funcoes ? [] : await api.propostas().catch(() => []);
      if (conta.prop.some((x) => x.status === "pendente")) conta.sem = await api.semanal().catch(() => []);
    }
    S.conta = conta;
    // Equipe e adm sempre abrem o pacote interno, mesmo que a conta tenha vindo de um vínculo antigo de artista/casa.
    // Código colado e ainda não confirmado pela adm também abre as métricas (é o mesmo que entrar pelo código).
    const cod = ["equipe", "adm"].includes(perfil.tipo) ? await api.chaveInterna(perfil.tipo) : perfil.codigo_acesso || perfil.vinculo_pedido;
    S.pac = null; S.eq = null; S.hub = null; S.campAbertas = null; S.campForm = null; S.tri = null; S.eqcEd = null; S.triEd = null; S.disp = undefined; S.fichaPedido = false; S.sub = {};   // nada da conta anterior fica na tela
    if (cod) {
      // O pacote precisa ser do mesmo tipo da conta (conta rebaixada não continua vendo o painel antigo).
      try { const pac = await abrirPacote(cod); if (S.conta?.perfil.id === perfil.id && pac.perfil === perfil.tipo) S.pac = pac; }
      catch { /* código antigo ou inválido: segue sem métricas */ }
    }
    S.aba = ordenarAbas(abas())[0][0];
    if (perfil.tipo === "casa" && !funcoesDe() && !["em_analise", "habilitada", "suspensa"].includes(conta.casa?.status)) S.aba = "ficha";
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
  // Documento do Gui de 11/11/2026: Operações (Guia primeiro), Datas, Cronogramas, Marketing (por função) e Bonificações.
  // A Ficha é a porta de entrada: fica por último no menu e abre primeiro enquanto não foi enviada.
  // Por tema (pedido da Marina, 17/11/2026): datas, disponibilidade, contratos, financeiro, operações, marketing e cadastro.
  // Menu curto (pedido da Marina, 17/11/2026): só "Sua casa" e "Suas datas"; as partes ficam dentro, na ordem do fluxo.
  // Sua casa: cadastro → equipe → treinamento e guia → contrato → financeiro. Suas datas: disponibilidade → passo a passo
  // → cronograma → marketing → público. Artista: "Suas datas" e "Seu cadastro".
  // Menu simples (pedido da Marina, 17/11/2026), na ordem do fluxo: Próximos passos, Cadastro, Equipe, Disponibilidade
  // e Contrato. As partes que sobram ficam dentro de cada um; Bonificações só aparece para casa que tem.
  const AREAS_CASA = [["datas_casa", "Próximos passos"], ["ficha", "Ficha da casa"], ["equipe_g", "Equipe"], ["disp_g", "Disponibilidade"], ["contr_g", "Contrato"]];
  // Material de divulgação do Bruno (Produtor local, Anfitrião, Social media) é do artista (Marina, 17/11/2026).
  const AREAS_ART = [["art_mkt", "Divulgação"]];
  // Referência (Materiais, Base, Método): só para o time do Tranquilo; artista e casa veem só Dúvidas (pedido da Marina, 17/11/2026).
  const REFERENCIA = [["materiais", "Materiais"], ["base", "Base de conhecimento"], ["metodo", "Método"], ["duvidas", "Dúvidas"]];
  const MKT_FUNCOES = [["mkt_produtor", "lider", "Produtor local"], ["mkt_anfitriao", "anfitriao", "Anfitrião"], ["mkt_social", "social_media", "Social media"]];
  function subsDaArea(area) {
    if (S.conta?.perfil.tipo === "artista") return area === "art_mkt" ? MKT_FUNCOES.map(([k, , t]) => [k, t]) : [];
    if (S.conta?.perfil.tipo !== "casa") return [];
    const pacAbas = S.pac ? PERFIS[S.pac.perfil].abas.map(([k]) => k) : [];
    const fs = funcoesDe(), A = fs ? TQEquipe.abasDaFuncao(fs) : null;
    if (!fs && S.conta.casa?.status === "encerrada") return area === "ficha" ? [["cadastro_casa", "Ficha da casa"]] : [];
    const temBonif = S.conta.casa?.combinados?.bonificacao?.tem === "sim";
    if (area === "datas_casa") return [["passos", "Passo a passo"], ...(!fs || fs.includes("lider") ? [["cronograma", "Cronograma da noite"]] : []),
      ...(!fs || A.campanha ? [["campanha", "Divulgação"]] : []), ...(!fs && S.conta.trilha ? [["trilha", "Treinamento"]] : []),
      ...(pacAbas.includes("roteiro") && S.pac?.metodo ? [["roteiro", "Como é a noite"]] : []), ...(pacAbas.includes("minhas") && (!fs || A.metricas) ? [["minhas", "Público das noites"]] : []), ["meu_hist", "Seu histórico"]];
    if (area === "ficha") return fs ? [["minha_funcao", "Minha função"], ["guia", "Guia do franqueado"]] : [["cadastro_casa", "Ficha da casa"], ["guia", "Guia do franqueado"]];
    if (area === "equipe_g") return !fs || A.equipe ? [["equipe_casa", "Quem é quem"]] : [];
    if (area === "disp_g") return fs ? [] : [["agenda_casa", "Disponibilidade"]];
    if (area === "contr_g") return fs ? [] : [["contratos_meus", "Contrato"], ["financeiro_casa", "Combinados e repasses"], ...(temBonif ? [["bonificacao", "Bonificações"]] : [])];
    return [];
  }
  // ---------- trilha (pedido da Marina, 17/11/2026): o menu libera cada parte conforme o caminho anda ----------
  // Artista: ficha → curadoria → disponibilidade → contrato → datas. Casa: cadastro → habilitação → equipe →
  // disponibilidade → contrato → datas. Parte travada aparece no menu com cadeado e diz o que falta para liberar.
  function trilhaDe() {
    const p = S.conta?.perfil; if (!p || funcoesDe()) return null;
    const cts = meusContratos(), ctOk = cts.length && cts.every((c) => c.status === "assinado" || arqsContrato(c).length);
    if (p.tipo === "artista") {
      const st = S.conta.insc?.status || "rascunho", enviada = st !== "rascunho", aprovada = st === "aprovada";
      if (S.dispA === undefined && !S.dispACarregando) { S.dispACarregando = true; Promise.all([api.dispArtistas(), api.semanal().catch(() => [])]).then(([r, sm]) => { S.dispA = r; S.sem = sm; }, () => { S.dispA = null; }).finally(() => { S.dispACarregando = false; render(); }); }
      const disp = (S.dispA || []).some((x) => x.user_id === p.id && x.situacao === "disponivel") || semanaDe(S.sem, { userId: p.id }).length > 0;
      return [
        { k: "inscricao", titulo: "Preencher e enviar a sua ficha", feito: enviada, liberado: true },
        { titulo: "Curadoria do Tranquilo", feito: aprovada, liberado: enviada, motivo: "libera quando você envia a ficha", nota: st === "ajustes" ? "A curadoria pediu ajustes na sua ficha." : st === "em_curadoria" ? "A Isa está olhando a sua ficha." : "" },
        { k: "disp_artista", titulo: "Marcar onde e quando você pode tocar", feito: disp, liberado: aprovada, motivo: "libera quando a curadoria aprovar a sua ficha" },
        { k: "contratos_meus", titulo: "Assinar o contrato da data", feito: !!ctOk, liberado: cts.length > 0, motivo: eventosDaConta().some((e) => e.d >= hojeIso()) ? "a sua data já está marcada: libera quando a equipe enviar o contrato" : "libera quando a Isa fechar uma data com você" },
      ];
    }
    if (p.tipo === "casa") {
      const st = S.conta.casa?.status || "rascunho", enviada = !["rascunho", "incompleto"].includes(st), hab = st === "habilitada";
      if (S.conta.equipe === undefined && p.vinculo_nome) carregarEquipeCasa();
      if (S.disp === undefined && p.vinculo_nome) carregarDisp();
      const L = S.conta.equipe, eqOk = Array.isArray(L) && L.length && TQEquipe.cobertura(L).completa;
      const ref = (p.vinculo_nome || "").toLowerCase();
      const disp = (S.disp || []).some((x) => (x.casa_ref || "").toLowerCase() === ref && x.situacao === "disponivel") || semanaDe(S.sem, { casaRef: p.vinculo_nome, fichaDias: S.conta.casa?.dados?.dias_semana }).length > 0;
      return [
        { k: "ficha", titulo: "Preencher e enviar o cadastro da casa", feito: enviada, liberado: true },
        { titulo: "Habilitação pelo Gui (Operações)", feito: hab, liberado: enviada, motivo: "libera quando você envia o cadastro", nota: st === "ajustes" ? "O Gui pediu ajustes no cadastro." : st === "em_analise" ? "O Gui está olhando o cadastro." : "" },
        { k: "equipe_g", titulo: "Montar a equipe da casa", feito: !!eqOk, liberado: enviada, motivo: "libera quando você envia o cadastro" },
        { k: "disp_g", titulo: "Marcar a disponibilidade da casa", feito: disp, liberado: hab && !!eqOk, motivo: [!hab && "o Gui habilitar a casa", !eqOk && `a equipe da casa estiver completa (${Array.isArray(L) ? `faltam: ${TQEquipe.listaFalta(TQEquipe.cobertura(L))}` : "monte em Equipe"})`].filter(Boolean).reduce((a, x, i) => a + (i ? " e " : "") + x, "libera quando ") },
        { k: "contr_g", titulo: "Assinar o contrato da parceria", feito: !!ctOk, liberado: cts.length > 0, motivo: "libera quando o Gui enviar o contrato" },
      ];
    }
    return null;
  }
  /** Motivo de a parte do menu estar travada na trilha (ou null). */
  function bloqueio(k) {
    try { if (localStorage.getItem("tq-sem-trilha") === "1") return null; } catch { /* sem armazenamento: trilha ligada */ }
    const t = trilhaDe(); if (!t) return null;
    const passo = t.find((x) => x.k === k || (x.k && areaDe(k) === x.k));
    return passo && !passo.liberado ? passo.motivo : null;
  }
  function telaTravada(k) {
    const m = bloqueio(k); if (!m) return null;
    const t = trilhaDe(), prox = t.find((x) => !x.feito);
    return `<div class="tag">Ainda não liberado</div><h1>🔒 Essa parte vem depois</h1><p class="sub">Ela ${esc(m)}. A trilha vai liberando cada parte conforme o caminho anda.</p>${blocoTrilha()}${prox?.k && prox.liberado ? `<div class="barra-acoes"><button class="btn pri" data-ir="${prox.k}">Ir para o próximo passo →</button></div>` : ""}`;
  }
  function blocoTrilha() {
    const t = trilhaDe(); if (!t) return "";
    const feitos = t.filter((x) => x.feito).length, atual = t.find((x) => !x.feito);
    if (feitos === t.length) return `<div class="alert good" style="margin-bottom:14px"><b>✓ Trilha completa</b>Tudo liberado. Agora é acompanhar cada data aqui embaixo.</div>`;
    return `<div class="card trilha" style="margin-bottom:14px"><div class="row"><b>Sua trilha</b><span class="muted" style="font-size:13px">${feitos} de ${t.length}</span></div>
      ${(() => { const li = (x) => { const cls = x.feito ? "feito" : x === atual ? "atual" : !x.liberado ? "trava" : "";
        return `<li class="${cls}"><span class="trilha-marca">${x.feito ? "✓" : !x.liberado ? "🔒" : x === atual ? "●" : "○"}</span><span><b>${esc(x.titulo)}</b>${x === atual && x.nota ? `<div class="muted" style="font-size:13px">${esc(x.nota)}</div>` : ""}${!x.liberado && !x.feito ? `<div class="muted" style="font-size:12px">${esc(x.motivo)}</div>` : ""}</span>${x === atual && x.k && x.liberado ? `<button class="btn sm pri" data-ir="${x.k}">Fazer agora</button>` : ""}</li>`; };
        // Começa pequeno: o que já foi feito e o passo de agora; os que vêm depois ficam numa linha que abre.
        const i = t.indexOf(atual), agora = t.slice(0, i + 1), depois = t.slice(i + 1);
        return `<ol class="trilha-lista">${agora.map(li).join("")}</ol>${depois.length ? dobra("trilha-depois", `Depois ${depois.length === 1 ? "vem mais 1 etapa" : `vêm mais ${depois.length} etapas`}`, "libera uma por vez", `<ol class="trilha-lista" start="${i + 2}">${depois.map(li).join("")}</ol>`, { classe: "sem-borda" }) : ""}`; })()}</div>`;
  }
  /** Área do portal da casa que contém a tela k (ou null). */
  function areaDe(k) {
    if (!k) return null;
    if (menuAgrupado()) { for (const [g] of gruposEquipe()) if (subsDoGrupo(g).some(([x]) => x === k)) return g; return null; }
    const t = S.conta?.perfil.tipo; if (t !== "casa" && t !== "artista") return null; for (const [a] of (t === "casa" ? AREAS_CASA : AREAS_ART)) if (subsDaArea(a).some(([x]) => x === k)) return a; return null;
  }
  // Equipe com área (Gui, Isa, Bruno): menu simples como o da casa, poucos itens com o trabalho de cada um e as partes dentro.
  // Menu padrão do time (pedido da Marina, 17/11/2026): o mesmo formato para Gui, Isa, Bruno, equipe e administração.
  // Na lateral, as partes do trabalho; dentro de cada uma, as abas em cima. Cada área vê só as suas; a adm vê todas.
  const GRUPOS_EQ = {
    g_hoje: ["Início", [["inicio", "Comece por aqui"], ["hoje", "Para você"], ["acompanhamento", "Acompanhamento"], ["feito", "Seu histórico"], ["geral", "A rede"], ["painel", "Painel da operação"], ["operacao", "Operação"]]],
    g_datas: ["Datas", [["datas_portal", "Criar datas"], ["lado_a_lado", "Artista e casa"], ["agenda_casas", "Agenda das casas"], ["datas", "Datas do Notion"]]],
    g_artistas: ["Curadoria", [["curadoria", "Curadoria"], ["base_artistas", "Base de artistas"], ["artistas", "Histórico dos artistas"]]],
    g_casas: ["Casas", [["casas_cad", "Fichas das casas"], ["base_casas", "Base de casas"], ["casas", "Histórico das casas"], ["trilhas", "Treinamentos"]]],
    g_contratos: ["Contratos", [["documentos", "Contratos e documentos"]]],
    g_campanhas: ["Campanhas", [["campanhas", "Campanhas"], ["demanda", "Demanda"]]],
    g_adm: ["Administração", [["estrategia", "O que está dando certo"], ["pessoas", "Pessoas"], ["prontidao", "Prontidão"], ["relatos", "Relatos"], ["desempenho", "Desempenho da equipe"], ["historico", "Histórico de alterações"], ["acessos", "Acessos"]]],
  };
  const GRUPOS_DA_AREA = { agenda: ["g_datas", "g_artistas", "g_contratos"], operacoes: ["g_casas", "g_contratos"], marketing: ["g_campanhas"] };
  const menuAgrupado = () => ["equipe", "adm"].includes(S.conta?.perfil.tipo);
  function gruposEquipe() {
    const p = S.conta?.perfil, tudo = p?.tipo === "adm" || !p?.areas?.length;
    const gs = tudo ? ["g_hoje", "g_datas", "g_artistas", "g_casas", "g_contratos", "g_campanhas", ...(p?.tipo === "adm" ? ["g_adm"] : [])]
      : ["g_hoje", ...new Set(p.areas.flatMap((a) => GRUPOS_DA_AREA[a] || []))];
    return gs.filter((g) => subsDoGrupo(g).length).map((g) => [g, GRUPOS_EQ[g][0]]);
  }
  function subsDoGrupo(g) {
    const pac = S.pac ? PERFIS[S.pac.perfil].abas.map(([k]) => k) : [];
    // "Comece por aqui" é da administração e da equipe sem área; "Para você", de quem tem área (Gui, Isa, Bruno). "Seu histórico", de todos.
    return (GRUPOS_EQ[g]?.[1] || []).filter(([k]) => (!["datas", "casas", "artistas", "base_casas", "base_artistas", "operacao", "estrategia", "acessos"].includes(k) || pac.includes(k))
      && (k !== "inicio" || !comAreas()) && (k !== "hoje" || comAreas()) && (k !== "desempenho" || S.conta?.perfil.tipo === "adm"));
  }
  function telaGrupo(g) {
    const subs = subsDoGrupo(g); if (!subs.length) return "";
    S.sub ||= {}; let k = S.sub[g]; if (!subs.some(([x]) => x === k)) k = subs[0][0]; S.sub[g] = k;
    const nav = subs.length > 1 ? `<nav class="subnav" aria-label="Partes de ${esc(GRUPOS_EQ[g][0])}">${subs.map(([x, t]) => `<button class="${x === k ? "on" : ""}"${x === k ? ' aria-current="page"' : ""} data-sub="${g}|${x}">${esc(t)}</button>`).join("")}</nav>` : "";
    return nav + (TELAS[k] || window.TQ_TELAS?.[k])();
  }
  function irPara(k) { const a = areaDe(k); if (a) { (S.sub ||= {})[a] = k; S.aba = a; } else S.aba = k; }
  function telaArea(area) {
    const subs = subsDaArea(area); if (!subs.length) return "";
    S.sub ||= {}; let k = S.sub[area]; if (!subs.some(([x]) => x === k)) k = subs[0][0]; S.sub[area] = k;
    const nav = subs.length > 1 ? `<nav class="subnav" aria-label="Partes de ${esc([...AREAS_CASA, ...AREAS_ART].find(([a]) => a === area)[1])}">${subs.map(([x, t]) => `<button class="${x === k ? "on" : ""}"${x === k ? ' aria-current="page"' : ""} data-sub="${area}|${x}">${esc(t)}</button>`).join("")}</nav>` : "";
    return nav + (TELAS[k] || window.TQ_TELAS?.[k])();
  }
  // Funções da conta na equipe da casa; null = dono da casa (ou conta que não é de casa).
  const funcoesDe = () => (S.conta?.perfil.tipo === "casa" && S.conta.perfil.funcoes?.length ? S.conta.perfil.funcoes : null);
  const nomesFuncoes = (fs) => (fs || []).map((f) => TQEquipe.NOME[f] || f).join(" · ");
  const roteiroConta = () => (funcoesDe() ? "casa_equipe" : comAreas() ? "eq_areas" : S.conta.perfil.tipo);
  const lerChecklist = () => (S.conta.perfil.tipo === "casa" ? api.checklistCasa() : api.meuChecklist());
  // Áreas da equipe do Tranquilo (banco v22, pedido da Marina, 17/11/2026). Administração vê tudo; equipe sem área marcada
  // também (como antes). Com área marcada, só as abas e os botões da área ficam visíveis.
  const AREAS_EQ = [["operacoes", "Operações", "casas: convites, Ficha do franqueado (habilitar e editar), contrato com a casa, publicar guias"], ["agenda", "Agenda", "artistas: curadoria, cruzar datas, criar datas, contrato do artista"], ["marketing", "Marketing", "campanhas e documentos de marketing"]];
  const nomesAreas = (as) => (as || []).map((a) => (AREAS_EQ.find(([k]) => k === a) || [, a])[1]).join(" · ");
  const comAreas = () => S.conta?.perfil.tipo === "equipe" && !!S.conta.perfil.areas?.length;
  function temArea(a) {
    const p = S.conta?.perfil; if (!p) return false;
    if (p.tipo === "adm") return true;
    return p.tipo === "equipe" && (!p.areas?.length || p.areas.includes(a));
  }
  // Caixas de marcar das áreas (Pessoas e Convites). attr identifica o grupo: data-area-conta="<id>" ou data-cv-area.
  const caixasAreas = (marcadas, attr) => `<div style="display:flex;gap:10px;flex-wrap:wrap">${AREAS_EQ.map(([k, t, o]) => `<label class="fcheck" title="${esc(o)}"><input type="checkbox" value="${k}" ${attr}${(marcadas || []).includes(k) ? " checked" : ""}> <span>${t}</span></label>`).join("")}</div>${/area-conta/.test(attr) ? '<div class="err" role="status" aria-live="polite"></div>' : ""}`;
  const soArea = (a) => `<span class="muted" style="font-size:13px;align-self:center">Esta decisão é da área de ${esc(nomesAreas([a]))}.</span>`;
  function abas() {
    const t = S.conta.perfil.tipo, doPac = S.pac ? PERFIS[S.pac.perfil].abas : [];
    // Dúvidas frequentes valem para quem tem conta mesmo sem código vinculado (o pacote já traz a aba).
    const duv = doPac.some(([k]) => k === "duvidas") ? [] : [["duvidas", "Dúvidas frequentes"]];
    if (t === "artista") return [["passos", "Próximos passos"], ["inscricao", "Minha ficha"], ["disp_artista", "Disponibilidade"], ["contratos_meus", "Contrato"], ["art_mkt", "Divulgação"], ["meu_hist", "Seu histórico"], ...doPac, ["duvidas", "Dúvidas"], ["conta", "Conta"]];
    // Portal da casa (alinhamento com o Gui, 11/2026): só quatro áreas no menu. As telas de antes viram partes delas.
    if (t === "casa") return [...AREAS_CASA.filter(([a]) => subsDaArea(a).length), ["duvidas", "Dúvidas"], ["conta", "Conta"]];
    const base = [["inicio", "Comece por aqui"], ["painel", "Painel da operação"], ["datas_portal", "Criar datas"], ["lado_a_lado", "Artista e casa"], ["agenda_casas", "Agenda das casas"], ["curadoria", "Curadoria"], ["casas_cad", "Cadastros de casas"], ["trilhas", "Treinamentos"], ["prontidao", "Prontidão"], ["acompanhamento", "Acompanhamento"], ["convites", "Convites"], ["demanda", "Demanda"], ["documentos", "Contratos e documentos"], ["campanhas", "Campanhas"], ["materiais", "Materiais"], ["base", "Base de conhecimento"], ["metodo", "Método"], ["relatos", "Relatos"]];
    if (t === "adm") base.push(["pessoas", "Pessoas"], ["historico", "Histórico de alterações"]);
    // Equipe com área (Gui, Isa, Bruno): menu enxuto, só o que cada área usa no dia a dia, começando por "Hoje".
    if (menuAgrupado()) {
      const POR_AREA = { agenda: ["datas_portal", "curadoria", "agenda_casas", "documentos", "convites"], operacoes: ["casas_cad", "convites", "documentos", "painel", "trilhas", "materiais"], marketing: ["campanhas", "materiais"] };
      const quer = new Set((S.conta.perfil.areas || []).flatMap((a) => POR_AREA[a] || []));
      const pac = doPac.filter(([k]) => k === "datas" && (quer.has("datas_portal") || quer.has("casas_cad")));
      // Convidar (rodada de testes de 21/11/2026): Agenda convida artista, Operações convida casa; Marketing não convida.
      const convida = S.conta.perfil.tipo === "adm" || !(S.conta.perfil.areas || []).length || (S.conta.perfil.areas || []).some((a) => ["agenda", "operacoes"].includes(a));
      return [...gruposEquipe(), ...(convida ? [["convites", "Convidar"]] : []), ...REFERENCIA.filter(([k]) => k !== "duvidas"), ["conta", "Conta"]];
    }
    const precisa = { datas_portal: ["agenda"], documentos: ["agenda", "operacoes"], campanhas: ["marketing"] }, soAdm = new Set(["prontidao", "relatos"]);
    const visivel = base.filter(([k]) => (!precisa[k] || precisa[k].some(temArea)) && (!soAdm.has(k) || !comAreas()));
    return [...visivel, ...doPac.filter(([k]) => !visivel.some(([x]) => x === k)), ["conta", "Conta"]];
  }
  const rotuloQuem = () => `${ROTULO[S.conta.perfil.tipo]} · ${S.conta.perfil.vinculo_nome || S.conta.perfil.nome || S.conta.perfil.email}`;

  // ---------- formulários ----------
  const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  // Erros de formato que a pessoa consegue corrigir (vazio é tratado por "faltando").
  // ---------- validações básicas (pedido da Marina, 17/11/2026): aceita com ou sem pontuação, confere e formata ----------
  const VAL = (() => {
    const dig = (v) => String(v ?? "").replace(/\D/g, "");
    const rep = (n) => /^(\d)\1+$/.test(n);
    function cpf(v) { const n = dig(v); if (n.length !== 11 || rep(n)) return false;
      const dv = (k) => { let s = 0; for (let i = 0; i < k; i++) s += +n[i] * (k + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
      return dv(9) === +n[9] && dv(10) === +n[10]; }
    function cnpj(v) { const n = dig(v); if (n.length !== 14 || rep(n)) return false;
      const dv = (k) => { const w = k === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; let s = 0; for (let i = 0; i < k; i++) s += +n[i] * w[i]; const r = s % 11; return r < 2 ? 0 : 11 - r; };
      return dv(12) === +n[12] && dv(13) === +n[13]; }
    const fCpf = (v) => dig(v).replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
    const fCnpj = (v) => dig(v).replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
    const email = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v ?? "").trim());
    const tel = (v) => { const n = dig(v).replace(/^55(?=\d{10,11}$)/, ""); return n.length === 10 || n.length === 11; };
    const fTel = (v) => { const n = dig(v).replace(/^55(?=\d{10,11}$)/, ""); return n.length === 11 ? n.replace(/^(\d{2})(\d{5})(\d{4})$/, "($1) $2-$3") : n.replace(/^(\d{2})(\d{4})(\d{4})$/, "($1) $2-$3"); };
    const uuid = (v) => /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i.test(String(v ?? "").trim());
    // Pix: CPF, CNPJ, e-mail, celular ou chave aleatória.
    const pix = (v) => { const t = String(v ?? "").trim(); return email(t) || uuid(t) || (/^[\d.\-/\s]+$/.test(t) && (cpf(t) || cnpj(t))) || (/^[+\d()\s-]+$/.test(t) && tel(t)); };
    const fPix = (v) => { const t = String(v ?? "").trim(); if (email(t) || uuid(t)) return t.toLowerCase(); if (/^[\d.\-/\s]+$/.test(t) && cpf(t)) return fCpf(t); if (/^[\d.\-/\s]+$/.test(t) && cnpj(t)) return fCnpj(t); return tel(t) ? fTel(t) : t; };
    const doc = (v) => cpf(v) || cnpj(v), fDoc = (v) => (cpf(v) ? fCpf(v) : cnpj(v) ? fCnpj(v) : String(v ?? "").trim());
    const cep = (v) => dig(v).length === 8, fCep = (v) => dig(v).replace(/^(\d{5})(\d{3})$/, "$1-$2");
    const nome = (v) => String(v ?? "").trim().split(/\s+/).filter((w) => w.length > 1).length >= 2;
    // Regra pelo nome do campo (contratos: os rótulos vêm do modelo).
    function porRotulo(rotulo, v) {
      const r = String(rotulo || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(), t = String(v ?? "").trim();
      if (!t) return { erro: `${rotulo}: preencha` };
      if (/pix/.test(r)) return pix(t) ? { v: fPix(t) } : { erro: `${rotulo}: use CPF, CNPJ, e-mail, celular com DDD ou a chave aleatória` };
      if (/cpf\s*\/\s*cnpj|cpf ou cnpj|documento/.test(r)) return doc(t) ? { v: fDoc(t) } : { erro: `${rotulo}: CPF (11 números) ou CNPJ (14 números) válido` };
      if (/cnpj/.test(r)) return cnpj(t) ? { v: fCnpj(t) } : { erro: `${rotulo}: CNPJ inválido (confira os 14 números)` };
      if (/cpf/.test(r)) return cpf(t) ? { v: fCpf(t) } : { erro: `${rotulo}: CPF inválido (confira os 11 números)` };
      if (/e-?mail/.test(r)) return email(t) ? { v: t.toLowerCase() } : { erro: `${rotulo}: confira o e-mail (ex.: nome@email.com)` };
      if (/telefone|celular|whats/.test(r)) return tel(t) ? { v: fTel(t) } : { erro: `${rotulo}: número com DDD (ex.: 11 99999-9999)` };
      if (/^cep/.test(r)) return cep(t) ? { v: fCep(t) } : { erro: `${rotulo}: 8 números (ex.: 01234-567)` };
      if (/nome completo|razao social/.test(r)) return nome(t) ? { v: t.replace(/\s+/g, " ") } : { erro: `${rotulo}: escreva o nome completo (nome e sobrenome)` };
      if (/^rg/.test(r)) return dig(t).length >= 5 ? { v: t } : { erro: `${rotulo}: confira o número` };
      if (t.length < 2) return { erro: `${rotulo}: preencha direitinho` };
      return { v: t };
    }
    return { cpf, cnpj, doc, pix, email, tel, cep, nome, fCpf, fCnpj, fDoc, fPix, fTel, fCep, porRotulo };
  })();
  window.TQVal = VAL;
  // ---------- Cidade e estado (pedido da Marina, 18/11/2026) ----------
  // Primeiro o estado (27 UFs), depois a cidade com busca só daquele estado; escolher "Campinas - SP" na busca já marca a
  // UF. A base dos 5.570 municípios do IBGE (src/cidades.json, UF -> nomes) só carrega quando um formulário com cidade
  // aparece. Sem a base (sem rede), dá para digitar a cidade à mão. As chaves gravadas não mudam: cidade_base + estado
  // na inscrição da artista; cidade_uf ("Cidade/UF") na Ficha da casa, na data do portal e nos dados do contrato.
  const UFS = [["AC", "Acre"], ["AL", "Alagoas"], ["AP", "Amapá"], ["AM", "Amazonas"], ["BA", "Bahia"], ["CE", "Ceará"], ["DF", "Distrito Federal"],
    ["ES", "Espírito Santo"], ["GO", "Goiás"], ["MA", "Maranhão"], ["MT", "Mato Grosso"], ["MS", "Mato Grosso do Sul"], ["MG", "Minas Gerais"],
    ["PA", "Pará"], ["PB", "Paraíba"], ["PR", "Paraná"], ["PE", "Pernambuco"], ["PI", "Piauí"], ["RJ", "Rio de Janeiro"], ["RN", "Rio Grande do Norte"],
    ["RS", "Rio Grande do Sul"], ["RO", "Rondônia"], ["RR", "Roraima"], ["SC", "Santa Catarina"], ["SP", "São Paulo"], ["SE", "Sergipe"], ["TO", "Tocantins"]];
  const UF_OK = new Set(UFS.map(([s]) => s)), ufDe = (v) => String(v ?? "").trim().toUpperCase();
  const normCid = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[’`]/g, "'").replace(/\s+/g, " ").trim();
  const CID = { lista: null, idx: null, p: null };
  function carregarCidades() {
    CID.p ||= fetch("cidades.json").then((r) => r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status))).then((j) => {
      CID.lista = j; CID.idx = Object.fromEntries(Object.entries(j).map(([uf, l]) => [uf, new Map(l.map((n) => [normCid(n), n]))]));
      setTimeout(() => { document.querySelectorAll("[data-cid-uf], [data-cid-de]").forEach(preencherLista); atualizarPartes(); }); return j;
    }).catch(() => { CID.p = null; CID.falhou = true; return null; });
    return CID.p;
  }
  // Nome oficial da cidade naquele estado (ignora acento e maiúscula), ou null. Sem a base carregada: undefined.
  const cidadeOficial = (cid, uf) => CID.idx ? CID.idx[uf]?.get(normCid(cid)) || null : undefined;
  // "Campinas/SP", "Campinas - SP", "Campinas, SP" e "/SP" -> { cid, uf }; sem UF reconhecida, tudo é cidade.
  function separarCidadeUF(v) {
    const t = String(v ?? "").trim(), m = t.match(/^(.*?)\s*(?:\/|,|\s[-–]\s|[-–])\s*([A-Za-z]{2})$/);
    return m && UF_OK.has(m[2].toUpperCase()) ? { cid: m[1].trim(), uf: m[2].toUpperCase() } : { cid: t, uf: "" };
  }
  const opcoesUF = (uf) => `<option value="">Escolha o estado</option>${UFS.map(([s, n]) => `<option value="${s}"${s === uf ? " selected" : ""}>${n} (${s})</option>`).join("")}`;
  let nLista = 0;
  // Campo combinado (um valor só, "Cidade/UF"): estado + cidade com busca. attrs (data-k, id, data-ct-dado) vão na cidade.
  function cidadeUfHtml(attrs, valor, dis = "") {
    const { cid, uf } = separarCidadeUF(valor), id = "tqCidLista" + ++nLista;
    return `<span class="fcid" data-fcid><select data-fcid-uf aria-label="Estado (UF)"${dis}>${opcoesUF(uf)}</select><input ${attrs} data-cid-uf list="${id}" value="${esc(cid)}" autocomplete="off" maxlength="120" aria-label="Cidade" placeholder="${uf ? "Busque a cidade" : "Escolha o estado ou busque: Campinas - SP"}"${dis}><datalist id="${id}"></datalist></span>`;
  }
  // Select de estado ligado a um campo de cidade separado (inscrição: estado + cidade_base).
  function ufSelectHtml(attrs, valor, dis = "") {
    const uf = ufDe(valor), velho = valor && !UF_OK.has(uf) ? `<option value="${esc(valor)}" selected>${esc(valor)} (resposta anterior)</option>` : "";
    return `<select ${attrs} data-uf${dis}>${opcoesUF(uf)}${velho}</select>`;
  }
  const cidadeSoltaHtml = (attrs, valor, ufK, uf, dis = "") => { const id = "tqCidLista" + ++nLista;
    return `<input ${attrs} data-cid-de="${esc(ufK)}" list="${id}" value="${esc(valor ?? "")}" autocomplete="off" maxlength="120" placeholder="${uf ? "Busque a cidade" : "Escolha o estado ou busque: Campinas - SP"}"${dis}><datalist id="${id}"></datalist>`; };
  // O select de UF que vale para este campo de cidade (e o inverso).
  const ufDoCampo = (el) => el.hasAttribute("data-cid-uf") ? el.closest("[data-fcid]")?.querySelector("[data-fcid-uf]")
    : el.dataset.cidDe ? (el.closest("#form, form, dialog") || document).querySelector(`[data-k="${CSS.escape(el.dataset.cidDe)}"]`) : null;
  const cidadeDoUf = (sel) => sel.hasAttribute("data-fcid-uf") ? sel.closest("[data-fcid]")?.querySelector("[data-cid-uf]")
    : sel.dataset.k ? (sel.closest("#form, form, dialog") || document).querySelector(`[data-cid-de="${CSS.escape(sel.dataset.k)}"]`) : null;
  // Valor para gravar do campo combinado: "Cidade/UF" (só a cidade, se não escolheu estado; "/UF", se só o estado).
  function valorCidade(el) {
    if (!el) return ""; if (!el.hasAttribute("data-cid-uf")) return el.value.trim();
    const p = separarCidadeUF(el.value), uf = p.uf || ufDoCampo(el)?.value || "";
    return uf ? `${p.cid}/${uf}` : p.cid;
  }
  // Põe um valor "Cidade/UF" no campo combinado (ex.: a cidade da casa ao escolher a casa da data).
  function definirCidade(el, valor) { const { cid, uf } = separarCidadeUF(valor), s = ufDoCampo(el); el.value = cid; if (s) s.value = uf; preencherLista(el); }
  // Sugestões da busca: com estado, todas as cidades dele (o navegador filtra); sem estado, "Nome - UF" que batem com o texto.
  function preencherLista(el) {
    const dl = el.list || document.getElementById(el.getAttribute("list") || ""); if (!dl) return;
    const uf = ufDoCampo(el)?.value || "";
    el.placeholder = uf ? "Busque a cidade" : "Escolha o estado ou busque: Campinas - SP";
    if (!CID.lista) return;
    if (UF_OK.has(uf)) { if (dl.dataset.uf !== uf) { dl.dataset.uf = uf; dl.innerHTML = (CID.lista[uf] || []).map((n) => `<option value="${esc(n)}">`).join(""); } return; }
    const q = normCid(el.value); dl.dataset.uf = "";
    if (q.length < 2) { dl.innerHTML = ""; return; }
    const achou = [];
    for (const [s, l] of Object.entries(CID.lista)) for (const n of l) { const k = normCid(n); if (k.includes(q)) achou.push([k.startsWith(q) ? 0 : 1, n, s]); }
    achou.sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1], "pt-BR"));
    dl.innerHTML = achou.slice(0, 60).map(([, n, s]) => `<option value="${esc(n)} - ${s}">`).join("");
  }
  // Escolheu "Campinas - SP" (ou colou "Campinas/SP"): a UF entra sozinha e a cidade fica só com o nome.
  function aoDigitarCidade(el) {
    const s = ufDoCampo(el), p = separarCidadeUF(el.value);
    if (p.uf && s && [...s.options].some((o) => o.value === p.uf)) { s.value = p.uf; el.value = p.cid; }
    if (CID.lista) preencherLista(el); else carregarCidades().then(() => preencherLista(el));
  }
  // Trocou o estado: a cidade que não é desse estado sai, e a busca passa a mostrar só as cidades dele.
  function aoTrocarUf(sel) {
    const el = cidadeDoUf(sel); if (!el) return;
    const limpar = () => { if (el.value && UF_OK.has(sel.value) && cidadeOficial(separarCidadeUF(el.value).cid, sel.value) === null) el.value = ""; preencherLista(el); };
    if (CID.lista) limpar(); else carregarCidades().then(limpar);
    if (el.hasAttribute("data-cid-uf")) el.dispatchEvent(new Event("input", { bubbles: true }));
  }
  // Ao sair do campo: "sao paulo" vira "São Paulo" (nome oficial do IBGE).
  function aoSairCidade(el) {
    const uf = ufDoCampo(el)?.value, of = UF_OK.has(uf) && cidadeOficial(separarCidadeUF(el.value).cid, uf);
    if (of && of !== el.value) { el.value = of; el.dispatchEvent(new Event("input", { bubbles: true })); }
  }
  document.addEventListener("input", (ev) => { const t = ev.target;
    if (t.matches?.("[data-cid-uf], [data-cid-de]")) aoDigitarCidade(t); else if (t.matches?.("[data-fcid-uf], select[data-uf]")) aoTrocarUf(t); }, true);
  document.addEventListener("change", (ev) => { if (ev.target.matches?.("[data-cid-uf], [data-cid-de]")) aoSairCidade(ev.target); }, true);
  document.addEventListener("focusin", (ev) => { if (ev.target.matches?.("[data-cid-uf], [data-cid-de], [data-fcid-uf], select[data-uf]")) carregarCidades(); });
  // Quando aparece um formulário com cidade, a base carrega e a conferência (cidade do estado escolhido) passa a valer.
  new MutationObserver((_, obs) => { if (CID.lista) return obs.disconnect(); if (!CID.p && !CID.falhou && document.querySelector("[data-cid-uf], [data-cid-de]")) carregarCidades(); })
    .observe(document.documentElement, { childList: true, subtree: true });
  // Problemas de cidade/UF num valor "Cidade/UF" (rot = nome do campo para a mensagem).
  function problemaCidadeUF(v, rot = "Cidade/UF") {
    const { cid, uf } = separarCidadeUF(v);
    if (!uf) return `${rot}: escolha o estado`;
    if (!cid) return `${rot}: escolha a cidade`;
    if (cidadeOficial(cid, uf) === null) return `${rot}: "${cid}" não está na lista de cidades de ${uf}; escolha na busca`;
    return null;
  }
  // Devolve a lista de problemas (texto para a pessoa) e, em .chaves, os campos com problema (para marcar em vermelho).
  function conferirFormato(d) {
    const e = [], ch = e.chaves = [], add = (k, m) => { e.push(m); ch.push(k); };
    const url = (k, nome) => { if (d[k] && !/^https?:\/\/\S+\.\S+/i.test(String(d[k]).trim())) add(k, `${nome} precisa ser um link começando com https://`); };
    url("spotify", "Spotify"); url("youtube", "YouTube"); url("outro_link", "Outro link"); url("foto", "Foto"); url("rider_link", "Link do rider técnico");
    if (d.estado && !UF_OK.has(ufDe(d.estado))) add("estado", "Estado (UF): escolha o estado na lista");
    else if (d.cidade_base && UF_OK.has(ufDe(d.estado)) && cidadeOficial(d.cidade_base, ufDe(d.estado)) === null) add("cidade_base", `Cidade onde mora: "${String(d.cidade_base).trim()}" não está na lista de cidades de ${ufDe(d.estado)}; escolha na busca`);
    if (d.cidade_uf) { const m = problemaCidadeUF(d.cidade_uf); if (m) add("cidade_uf", m); }
    if (d.whatsapp) { const n = String(d.whatsapp).replace(/\D/g, "").length; if (n < 10 || n > 13 || /[^\d\s()+-]/.test(d.whatsapp)) add("whatsapp", "WhatsApp: só números, com DDD (ex.: 81 99999-9999)"); }
    if (d.telefone) { const n = String(d.telefone).replace(/\D/g, "").length; if (n < 10 || n > 13 || /[^\d\s()+-]/.test(d.telefone)) add("telefone", "Telefone da casa: só números, com DDD"); }
    for (const [k, nome] of [["dono_email", "E-mail do Dono A"], ["email_contato", "E-mail"]]) if (d[k] && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(d[k]).trim())) add(k, `${nome}: confira o endereço (ex.: nome@casa.com.br)`);
    if (d.dono_nascimento && !/^\d{2}\/\d{2}\/\d{4}$/.test(String(d.dono_nascimento).trim())) add("dono_nascimento", "Data de nascimento: use dd/mm/aaaa");
    if (d.dono_cpf && !VAL.cpf(d.dono_cpf)) add("dono_cpf", "CPF do Dono A inválido: confira os 11 números");
    if (d.cnpj && !VAL.cnpj(d.cnpj)) add("cnpj", "CNPJ inválido: confira os 14 números");
    if (d.rep_documento && !VAL.doc(d.rep_documento)) add("rep_documento", "CPF ou CNPJ do titular da conta inválido");
    if (d.rep_pix && !VAL.pix(d.rep_pix)) add("rep_pix", "Chave Pix: use CPF, CNPJ, e-mail, celular com DDD ou a chave aleatória");
    // Mínimo de caracteres: nunca deixa seguir sem (pedido da Marina, 17/11/2026).
    for (const [k, nome, min] of MINIMOS) { const n = String(d[k] ?? "").trim().length; if (n && n < min) add(k, `${nome} precisa de pelo menos ${min} caracteres (agora tem ${n})`); }
    for (const [k, nome] of [["ouvintes_mensais", "Ouvintes mensais"], ["seguidores_instagram", "Seguidores"], ["integrantes", "Integrantes"], ["cache_minimo", "Cachê mínimo"], ["capacidade", "Capacidade em pé"], ["capacidade_sentado", "Capacidade sentada"], ["equipe_viagem", "Quantas pessoas viajam"]]) {
      if (d[k] != null && d[k] !== "" && !(/^\d+$/.test(String(d[k]).trim()))) add(k, `${nome}: só números, sem sinal de menos`);
    }
    return e;
  }
  // Campos de texto livre com mínimo de caracteres (o aviso "Pelo menos N caracteres" aparece embaixo do campo).
  const MINIMOS = [["release", "Release curto", 200]];
  // Marca em vermelho os campos com formato errado (depois de conferirFormato).
  function marcarFormato(raiz, erros) {
    const els = (erros.chaves || []).map((k) => campoVisivel(raiz, k)).filter(Boolean);
    els.forEach((el) => { const det = el.closest("details"); if (det) det.open = true; });
    if (els.length) marcar(els);
  }
  const F_ARTISTA = [
    ["Quem é você", [
      ["nome_artistico", "Nome artístico", "text", null, 1],
      ["estado", "Estado (UF)", "uf", null, 1],
      ["cidade_base", "Cidade onde mora", "cidade", "estado", 1, "Escolha o estado e busque a cidade (ou busque direto: Campinas - SP)."],
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
      // "disponibilidade" (observação) saiu da ficha: a disponibilidade é marcada no calendário (pedido da Marina, 18/11/2026).
      // O valor antigo continua guardado e aparece para a curadoria.
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
      ["nome", "Nome da casa", "text", null, 1], ["cidade_uf", "Cidade/UF", "cidade_uf", null, 1], ["razao_social", "Razão social", "text", null, 1], ["cnpj", "CNPJ", "text", null, 1],
      ["inscricao", "Inscrição municipal ou estadual", "text"], ["emite_nf", "A casa emite nota fiscal?", "select", SIM_NAO],
      ["endereco", "Endereço completo", "text", null, 1, "Rua, número, bairro e CEP."], ["complemento", "Complemento e ponto de referência", "text"],
      ["instagram", "Instagram da casa", "text", null, 0, null, "@"], ["site", "Site", "text"], ["telefone", "Telefone da casa", "text"],
      ["funcionamento", "Dias e horários de funcionamento", "text"],
      ["como_chegar", "Como chegar", "textarea", null, 0, "Estacionamento próximo, transporte público e cuidados na rua à noite. Vai na página de cada evento."],
    ]],
    ["Dono A (responsável legal)", "O franqueado: quem assina pela casa e responde pela unidade.", [
      ["dono_nome", "Nome completo", "text", null, 1], ["dono_cpf", "CPF", "text", null, 1], ["dono_rg", "RG", "text"], ["dono_nascimento", "Data de nascimento", "text", null, 0, null, "dd/mm/aaaa"],
      ["dono_email", "E-mail", "text"], ["whatsapp", "WhatsApp", "text", null, 1], ["dono_endereco", "Endereço residencial", "text", null, 0, "Usado só no contrato."],
    ], "sensivel"],
    ["Dados para repasses", "A conta que recebe a parte da casa na bilheteria.", [
      ["rep_titular", "Titular da conta", "text", null, 1], ["rep_documento", "CPF ou CNPJ do titular", "text", null, 1], ["rep_banco", "Banco", "text"],
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
      // "dias_semana" saiu da ficha (a disponibilidade é marcada no calendário, pedido da Marina, 18/11/2026). O valor
      // antigo continua guardado e ainda pré-preenche a disponibilidade semanal (semanaDe, fichaDias).
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
  // "Dias da semana" saiu da Ficha (vai no calendário): não aparece mais como pendência para a casa preencher.
  const semDiasSemana = (p) => ({ ...p, enriquecimento: (p.enriquecimento || []).filter((x) => !/^Dias da semana/.test(x)) });
  const CHAVES_FICHA = new Set(F_CASA.flatMap(([, , cs]) => cs.map((c) => c[0])));
  const ROTULO_ANTIGO = { responsavel: "Responsável local", email_contato: "E-mail de contato", cidade: "Cidade", estado: "Estado", dias: "Dias e horários", restricoes: "Restrições de horário e volume", backline: "Backline", aceite_responsabilidades: "Aceite da matriz de responsabilidades", dias_semana: "Dias da semana que podem receber o Tranquilo" };
  const SOM_ANTIGO = { pa_proprio: "PA e mesa próprios", parceiro: "Parceiro técnico contratado", nao_tem: "Ainda não tenho" };

  // Botões de encerrar ficam escondidos até a regra do banco (v15b) estar aplicada em produção.
  const ENCERRAR_ATIVO = true;  // banco v15b em produção (conferido em 13/11)
  // Edição da Ficha pela administração: liga quando a regra v16 do banco estiver em produção.
  const EDITAR_FICHA_ATIVO = true;  // banco v16 e v17 em produção (conferido em 13/11)
  const A_VALIDAR_HTML = '<span class="a-validar" title="Ainda não confirmado pelo Gui (Operações)">a validar</span>';
  // travado = "vazios": Ficha já enviada; só os campos ainda vazios ficam abertos (banco v25).
  function campo([k, rot, tipo, opts, obrig, ajuda, ph], d, travado, ctx = d) {
    const v = d[k] ?? "", dis = travado === "vazios" ? (vazioV(v) ? "" : " disabled") : travado ? " disabled" : "", req = obrig ? ' <span class="muted">*</span>' : "";
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
    if (tipo === "uf") inp = ufSelectHtml(`data-k="${k}"`, v, dis);
    else if (tipo === "cidade") inp = cidadeSoltaHtml(`data-k="${k}"`, v, opts, ufDe(ctx?.[opts]), dis);
    else if (tipo === "cidade_uf") inp = cidadeUfHtml(`data-k="${k}"`, v, dis);
    else if (tipo === "select") inp = `<select data-k="${k}"${dis}><option value="">Escolha</option>${opts.map(([ov, ot]) => `<option value="${ov}"${String(v) === ov ? " selected" : ""}>${esc(ot)}</option>`).join("")}${v && !opts.some(([ov]) => ov === String(v)) ? `<option value="${esc(v)}" selected>${esc(v)} (resposta anterior)</option>` : ""}</select>`;
    else if (tipo === "textarea") inp = `<textarea data-k="${k}" rows="4"${dis}>${esc(v)}</textarea>`;
    else inp = `<input data-k="${k}" type="${tipo === "url" ? "url" : /(^|_)email/.test(k) ? "email" : "text"}"${/whatsapp|telefone/.test(k) ? ' inputmode="tel" autocomplete="tel"' : /cpf|cnpj|nascimento|agencia|rep_conta|rep_documento/.test(k) ? ' inputmode="numeric"' : ""} value="${esc(v)}"${tipo === "number" ? ` data-num inputmode="numeric" placeholder="${esc(ph || "ex.: 12.000")}"` : ` maxlength="${k === "release" ? 3000 : 300}"${ph ? ` placeholder="${esc(ph)}"` : ""}`}${dis}>`;
    return `<label class="fcampo"><b>${esc(rot)}${req}</b>${inp}${aj}</label>`;
  }
  const vazioV = (v) => v == null || v === "" || v === false || v === "false" || (Array.isArray(v) && !v.length);
  // Mesma regra do banco (so_preenche_vazios): nada que já tinha resposta muda.
  const soPreencheVazios = (antes, depois) => Object.entries(antes || {}).every(([k, v]) => vazioV(v) || JSON.stringify(depois?.[k]) === JSON.stringify(v));
  // Formulários longos em partes (pedido da Marina, 18/11/2026): cada seção abre e fecha (abre a primeira incompleta),
  // mostra ✓ quando está completa, tem "Salvar esta parte" e o progresso ("3 de 8 partes completas") fica no topo.
  // "Enviar" só libera com todos os obrigatórios preenchidos e válidos; enquanto isso diz o que falta, com link para o campo.
  const secoesDe = (def) => def.map((s) => typeof s[1] === "string" ? { titulo: s[0], desc: s[1], cs: s[2] } : { titulo: s[0], desc: "", cs: s[1] });
  const PREFIXO_PARTE = { "Dono A (responsável legal)": "Dono A", "Dados para repasses": "Repasses" };
  const REPASSE_BANCO = ["rep_banco", "rep_agencia", "rep_conta"];
  // O que a tela mostra: na casa, fichas antigas aparecem nos campos novos (valorCasa).
  const dadosVistos = (def, d) => def === F_CASA ? { ...d, ...Object.fromEntries(secoesDe(def).flatMap((s) => s.cs).map(([k]) => [k, valorCasa(d, k)])) } : d;
  // Tudo o que falta para enviar: obrigatórios vazios, formato inválido e, na casa, a conta de repasse (banco, agência e
  // conta, ou Pix). Obrigatórios = o que a habilitação, a curadoria e o contrato usam (src/contrato.js, doCadastro).
  function pendenciasForm(def, d) {
    const secs = secoesDe(def), lista = [], secDe = (k) => secs.findIndex((s) => s.cs.some((c) => c[0] === k));
    const txt = (k, rot) => { const pre = PREFIXO_PARTE[secs[secDe(k)]?.titulo]; return pre ? `${pre}: ${rot}` : rot; };
    for (const [k, rot, tipo] of camposFaltando(def, d)) lista.push({ k, sec: secDe(k), txt: txt(k, rot), frase: FRASE_FALTA[k] || (tipo === "check" ? `marque "${rot}"` : tipo === "select" ? `responda "${rot}"` : tipo === "cidades" || tipo === "multi" ? `marque ${rot}` : `preencha ${rot}`) });
    if (def === F_CASA && !REPASSE_BANCO.every((k) => !vazioV(d[k])) && vazioV(d.rep_pix))
      lista.push({ k: REPASSE_BANCO.find((k) => vazioV(d[k])), sec: secDe("rep_pix"), txt: "Repasses: banco, agência e conta, ou a chave Pix", frase: "preencha banco, agência e conta, ou a chave Pix" });
    const erros = conferirFormato(d);
    erros.forEach((m, i) => { const k = erros.chaves[i], sec = secDe(k); if (sec >= 0 && !lista.some((x) => x.k === k)) lista.push({ k, sec, txt: m, frase: m, formato: true }); });
    return lista.sort((a, b) => a.sec - b.sec);
  }
  // Como o item aparece no aviso de "Salvar esta parte" (o resto usa "preencha <rótulo>" ou "marque "<rótulo>"").
  const FRASE_FALTA = { aceite: "marque a autorização de uso dos dados", cidades_interesse: "marque pelo menos uma cidade da rede", cidade_uf: "escolha o estado e a cidade", cidade_base: "escolha a cidade onde mora", estado: "escolha o estado (UF)" };
  // Elemento visível de um campo (a caixa de marcar fica pequena demais: marca a linha toda).
  const campoVisivel = (raiz, k) => { const el = raiz?.querySelector(`[data-k="${k}"]`) || raiz?.querySelector(`[data-multi="${k}"]`) || (k === "cidades_interesse" ? raiz?.querySelector("[data-cidade]") : null);
    return el && el.type === "checkbox" ? el.closest(".fcheck, .fcidades") || el : el; };
  // Partes que a pessoa salvou com "Salvar esta parte" (contam como completas mesmo sem obrigatório): só neste navegador.
  const chavePartes = () => S.conta ? `tq-partes-${S.conta.perfil.tipo === "casa" ? "casa" : "artista"}-${S.conta.perfil.id}` : "";
  const partesSalvas = () => { try { return new Set(JSON.parse(store.get(chavePartes()) || "[]")); } catch { return new Set(); } };
  function estadoPartes(def, d) {
    const pend = pendenciasForm(def, d), salvas = partesSalvas();
    return secoesDe(def).map((s, i) => {
      const p = pend.filter((x) => x.sec === i), temObrig = s.cs.some((c) => c[4]) || (def === F_CASA && s.cs.some((c) => c[0] === "rep_pix"));
      const respondida = s.cs.some(([k]) => !vazioV(d[k]));
      return { pend: p, completa: !p.length && (temObrig || respondida || salvas.has(s.titulo)), obrig: temObrig };
    });
  }
  const resumoParte = (e) => e.completa ? "Completa" : e.pend.length ? `Falta${e.pend.length > 1 ? "m" : ""} ${e.pend.length} ${e.pend.some((x) => !x.formato) ? (e.pend.length > 1 ? "itens" : "item") : (e.pend.length > 1 ? "correções" : "correção")}` : "Opcional: preencha o que souber";
  const progressoPartes = (est, auto) => { const n = est.filter((e) => e.completa).length;
    return `<div class="card fprog" data-progresso><div class="row"><b data-prog-txt>${n} de ${est.length} partes completas</b>${auto ? `<span class="muted" style="font-size:13px">Fica salvo sozinho enquanto você digita</span>` : ""}</div><div class="progress" style="margin-top:8px"><i data-prog-barra style="width:${Math.round((n / est.length) * 100)}%"></i></div></div>`; };
  function formPartes(def, d, travado, { valor = (x, k) => x[k], antes = () => "", proprio = true } = {}) {
    const secs = secoesDe(def), dv = { ...d, ...Object.fromEntries(secs.flatMap((s) => s.cs).map(([k]) => [k, valor(d, k)])) };
    const est = estadoPartes(def, dv), abertas = S.partesAbertas?.[S.aba], primeira = est.findIndex((e) => !e.completa);
    return progressoPartes(est, proprio && travado === false) + secs.map((s, i) => antes(s.titulo) + `<details class="card fsec" data-parte="${i}"${(abertas ? abertas.includes(i) : i === primeira) ? " open" : ""}>
      <summary><span class="fsec-n${est[i].completa ? " ok" : ""}" data-parte-n aria-hidden="true">${est[i].completa ? "✓" : i + 1}</span><span class="fsec-tit"><h3>${esc(s.titulo)}</h3><span class="fsec-res" data-parte-res>${resumoParte(est[i])}</span></span></summary>
      ${s.desc ? `<p class="muted fsec-desc">${esc(s.desc)}</p>` : ""}<div class="fgrid">${s.cs.map((c) => campo(c, { [c[0]]: dv[c[0]] }, travado, dv)).join("")}</div>
      ${proprio && travado === false ? `<div class="fsec-acoes"><button type="button" class="btn sm" data-salvar-parte="${i}">Salvar esta parte</button><span class="muted" data-parte-msg role="status" aria-live="polite"></span></div>` : ""}</details>`).join("");
  }
  const formHtml = (def, d, travado) => formPartes(def, d, travado);
  // Ficha da casa: seções com descrição; campo vazio continua visível (vazio).
  const formCasa = (d, travado, proprio = true) => formPartes(F_CASA, d, travado, { proprio, valor: valorCasa, antes: (t) => t === "Dúvidas sobre o Guia" && S.conta?.perfil.tipo === "casa" ? equipeNaFicha() : "" });
  // Bloco acima do botão Enviar: o que falta, cada item com link para o campo.
  const faltaEnviarHtml = (lista) => lista.length ? `<b>Para enviar, falta${lista.length > 1 ? "m" : ""} ${lista.length} ${lista.length > 1 ? "itens" : "item"}:</b> ${lista.map((x) => `<a href="#" data-ir-campo="${esc(x.k)}">${esc(x.txt)}</a>`).join(" · ")}` : "✓ Tudo preenchido. Já dá para enviar.";
  const botaoEnviar = (lista, rotulo, explica) => `<div class="falta-enviar${lista.length ? "" : " ok"}" id="faltaEnviar" role="status" aria-live="polite">${faltaEnviarHtml(lista)}</div>${comExplica(`<button class="btn pri" id="enviar" aria-describedby="faltaEnviar"${lista.length ? " disabled" : ""}>${rotulo}</button>`, explica)}`;
  // Cópia das respostas da Ficha (modelo do Gui): só abre o texto pronto; não envia a Ficha nem muda nada nela.
  const botaoCopiaFicha = comExplica(`<button class="btn ghost" id="copiarFicha">Mandar uma cópia das respostas ao Gui</button>`, "Abre o texto pronto para WhatsApp ou e-mail (ou para copiar). Não envia a Ficha nem muda nada nela.");
  // Atualiza ✓, resumo das partes, progresso e o botão Enviar enquanto a pessoa digita (sem redesenhar a tela).
  function atualizarPartes() {
    const raiz = $("#form"); if (!raiz || !S.conta || !raiz.querySelector("[data-parte]")) return;
    const def = S.conta.perfil.tipo === "casa" ? F_CASA : F_ARTISTA, d = dadosVistos(def, { ...(def === F_CASA ? S.conta.casa?.dados : S.conta.insc?.dados) || {}, ...lerForm(raiz) });
    const est = estadoPartes(def, d), n = est.filter((e) => e.completa).length;
    raiz.querySelectorAll("details[data-parte]").forEach((det) => { const e = est[+det.dataset.parte]; if (!e) return;
      const num = det.querySelector("[data-parte-n]"); num.textContent = e.completa ? "✓" : +det.dataset.parte + 1; num.classList.toggle("ok", e.completa);
      det.querySelector("[data-parte-res]").textContent = resumoParte(e); });
    const t = raiz.querySelector("[data-prog-txt]"); if (t) t.textContent = `${n} de ${est.length} partes completas`;
    const bar = raiz.querySelector("[data-prog-barra]"); if (bar) bar.style.width = Math.round((n / est.length) * 100) + "%";
    const f = $("#faltaEnviar"), b = $("#enviar"); if (f && b) { const lista = pendenciasForm(def, d); f.innerHTML = faltaEnviarHtml(lista); f.classList.toggle("ok", !lista.length); b.disabled = !!lista.length; }
  }
  // Leva até o campo (abre a parte, rola, foca e marca em vermelho).
  function irParaCampo(k, marcarErro = true) {
    const raiz = $("#form"); if (!raiz) return;
    const el = raiz.querySelector(`[data-k="${k}"]`) || raiz.querySelector(`[data-multi="${k}"]`) || (k === "cidades_interesse" ? raiz.querySelector("[data-cidade]") : null);
    if (!el) return;
    const det = el.closest("details"); if (det && !det.open) det.open = true;
    if (marcarErro && el.dataset.k) marcar(el.type === "checkbox" ? el.closest(".fcheck") || el : el);
    el.scrollIntoView({ block: "center" }); el.focus({ preventScroll: true });
  }
  // Cópia local do rascunho (neste navegador): o que foi digitado e ainda não chegou ao banco não se perde.
  // Sai quando o banco confirma o mesmo conteúdo.
  const chaveLocal = () => S.conta ? `tq-rascunho-${S.conta.perfil.tipo === "casa" ? "casa" : "artista"}-${S.conta.perfil.id}` : "";
  const lerLocal = () => { try { return JSON.parse(store.get(chaveLocal()) || "null"); } catch { return null; } };
  const guardarLocal = (d) => { if (chaveLocal()) store.set(chaveLocal(), JSON.stringify({ em: new Date().toISOString(), dados: d })); };
  const limparLocal = (d) => { const l = lerLocal(); if (chaveLocal() && (!d || !l || JSON.stringify(l.dados) === JSON.stringify(d))) store.del(chaveLocal()); };
  // Na hora de mostrar o formulário: se há cópia local diferente do banco, ela volta para os campos e é salva logo.
  function recuperarLocal(d) {
    const l = lerLocal(); if (!l?.dados) return null;
    const junto = { ...d, ...l.dados }; if (JSON.stringify(junto) === JSON.stringify(d)) return null;
    if (!S.tauto) S.tauto = setTimeout(salvarPendente, 400);
    S.recuperado = S.conta.perfil.id; return junto;
  }
  const avisoRecuperado = `<div class="alert"><b>Recuperamos o que você tinha digitado</b>Estava guardado só neste aparelho e ainda não tinha chegado ao Tranquilo. Confira: salvamos de novo na sua ficha.</div>`;
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
    raiz.querySelectorAll("[data-k]").forEach((el) => { d[el.dataset.k] = el.type === "checkbox" ? String(el.checked) : el.hasAttribute("data-num") ? inteiroBR(el.value) : el.hasAttribute("data-cid-uf") ? valorCidade(el) : el.value.trim(); });
    for (const el of raiz.querySelectorAll("[data-multi]")) { const k = el.dataset.multi; d[k] ||= []; if (el.checked) d[k].push(el.value); }
    const cs = [...raiz.querySelectorAll("[data-cidade]")].filter((el) => el.checked).map((el) => el.dataset.cidade);
    if (raiz.querySelector("[data-cidade]")) d.cidades_interesse = cs;
    return d;
  }
  const camposFaltando = (def, d) => def.flatMap((sec) => sec[sec.length > 2 && typeof sec[1] === "string" ? 2 : 1]).filter(([k, , tipo, , obrig]) => obrig && (tipo === "check" ? d[k] !== "true" : tipo === "cidades" ? !(d[k] || []).length : tipo === "number" ? !(+d[k] > 0) : !String(d[k] ?? "").trim()));
  const faltando = (def, d) => camposFaltando(def, d).map(([, rot]) => rot);
  // Marca em vermelho os campos obrigatórios vazios e leva a pessoa até o primeiro.
  function marcarFaltando(raiz, def, d) {
    raiz.querySelectorAll(".campo-falta").forEach((el) => el.classList.remove("campo-falta"));
    const els = camposFaltando(def, d).map(([k]) => campoVisivel(raiz, k)).filter(Boolean);
    els.forEach((el) => { const det = el.closest("details"); if (det) det.open = true; }); marcar(els);
    if (els[0]) { els[0].scrollIntoView({ block: "center" }); els[0].focus({ preventScroll: true }); }
  }

  // ---------- telas: artista ----------
  const STATUS_INSC = { rascunho: ["", "Rascunho"], em_curadoria: ["b-warn", "Com a curadoria"], ajustes: ["b-serious", "Ajustes pedidos"], aprovada: ["b-good", "Aprovada"], reprovada_pre: ["b-crit", "Não seguiu na pré-curadoria"], reprovada: ["b-crit", "Não seguiu na curadoria"], encerrada: ["b-crit", "Participação encerrada"] };
  const STATUS_CASA = { rascunho: ["", "Rascunho"], incompleto: ["b-serious", "Faltam dados mínimos"], em_analise: ["b-warn", "Em análise pela equipe"], ajustes: ["b-serious", "Ajustes pedidos"], habilitada: ["b-good", "Habilitada"], suspensa: ["b-crit", "Suspensa"], encerrada: ["b-crit", "Parceria encerrada"] };
  const badge = (m, s) => `<span class="badge ${m[s]?.[0] || ""}">${esc(m[s]?.[1] || s)}</span>`;
  const linhaTempo = (etapas, atual) => `<ol class="tempo">${etapas.map((e, i) => `<li class="${i < atual ? "ok" : i === atual ? "agora" : ""}"><i>${i < atual ? "✓" : i + 1}</i><span>${esc(e)}</span></li>`).join("")}</ol>`;
  const medidor = (pc) => `<div class="card"><div class="row"><b>Força da inscrição</b><span><b style="font-size:22px">${+pc.score || 0}</b><span class="muted">/100</span> <span class="badge ${pc.faixa === "Prioridade" ? "b-good" : pc.faixa === "Avaliar" ? "b-warn" : "b-serious"}">${esc(pc.faixa)}</span></span></div>
    <div class="progress" style="margin:10px 0"><i style="width:${Math.max(0, Math.min(100, +pc.score || 0))}%"></i></div>
    <div class="grid g4" style="gap:6px;font-size:13px">${[["completude", "Perfil completo", 20], ["tracao", "Público", 35], ["tecnica", "Rider", 20], ["circulacao", "Cidades da rede", 15], ["condicoes", "Condições", 10]].map(([k, t, max]) => `<div><span class="muted">${t}</span><br><b>${+pc.detalhe?.[k] || 0}</b>/${max}</div>`).join("")}</div>
    ${pc.alertas.length ? `<div style="margin-top:8px">${pc.alertas.map((a) => `<span class="pill">${esc(a)}</span>`).join("")}</div>` : ""}</div>`;

  function eventosDaConta() {
    const limite = new Date(Date.now() - 5 * 864e5).toISOString().slice(0, 10);
    return [...(S.pac?.eventos || []), ...(S.conta?.datasP || []).map(eventoDoPortal)].filter((e) => !e.z && e.d >= limite).sort((a, b) => a.d.localeCompare(b.d));
  }
  // Data criada no portal pela Central (v21) no mesmo formato das datas do Notion; id "p:<uuid>".
  function eventoDoPortal(x) {
    const arts = [...(x.artistas || [])].sort((a, b) => (a.ordem || 99) - (b.ordem || 99)), cidade = (x.cidade || "").replace(/\/.*$/, "").trim();
    return { id: "p:" + x.id, d: String(x.dia).slice(0, 10), n: `Tranquilo ${x.produto} — ${cidade || x.casa_nome}${R.produtoBase(x.produto) === "Apresenta" && arts.length ? " — " + arts[arts.length - 1].nome : ""}`,
      s: x.status === "cancelada" ? "Cancelado" : "Data confirmada", c: cidade, m: x.produto, h: x.casa_nome, a: arts.map((a) => a.nome), l: x.link_ingressos || null,
      f: true, z: x.status === "cancelada", portal: x, au: arts.map((a) => a.user_id).filter(Boolean), kc: x.casa_id,
      noite: { inicio: String(x.abertura || "19:00").slice(0, 5), artistas: arts.map((a, i) => ({ nome: a.nome, ordem: a.ordem || i + 1, status: "Confirmado", producao: !!a.producao, whatsapp: a.whatsapp || null })) } };
  }
  const noiteDe = (e) => e.noite || S.pac?.noites?.[e.id];
  // Marketing por função (documento do Gui): o que cada um faz no marketing, a partir do que a Operações já combinou por função.
  function telaMarketing(f) {
    const F = TQEquipe.FUNCOES.find((x) => x[0] === f) || [f, f, ""], d = TQEquipe.PERFIL[f] || { le: [], show: [], devolve: [] };
    const H = S.hub; if (!H && S.conta) carregarHub();
    const slugs = DOCS_DA_FUNCAO[f] || [];
    const mats = slugs.map((sl) => (H?.materiais || []).find((m) => m.slug === sl)).filter(Boolean)
      .concat((H?.materiais || []).filter((m) => m.funcao === f && !slugs.includes(m.slug) && !DOCS_APOSENTADOS.includes(m.slug)));
    const nome = { lider: "Produtor local (Líder Local)", anfitriao: "Anfitrião(ã)", social_media: "Social media" }[f] || F[1];
    // Artista (aba Divulgação): sem o texto escrito para a casa ("pode ser o próprio dono") e sem "a validar".
    const artista = S.conta?.perfil.tipo === "artista";
    return `<div class="tag">${artista ? "Divulgação" : "Marketing"}</div><h1>${esc(nome)}</h1>
      <p class="sub">${artista ? "O que esta parte da divulgação do show pede e os materiais do Tranquilo para ajudar você." : esc(F[2])}</p>
      ${!H ? carregando("os documentos") : mats.length ? `<div class="list">${mats.map((m) => cartaoDoc(H, m)).join("")}</div>` : `<div class="alert warn"><b>⚠ Atenção: os documentos desta função ainda não foram publicados no portal.</b>A equipe do Tranquilo publica em Materiais.</div>`}
      <h2>O que a função faz</h2>
      ${artista ? "" : `<div class="alert warn" style="margin-bottom:12px"><b>Obrigações de marketing ${A_VALIDAR_HTML}</b>A lista abaixo vem do que a Operações combinou para cada função. O texto final das obrigações de marketing vem do Gui e do Bruno.</div>`}
      ${[["A cada show", d.show], ["Você devolve", d.devolve]].map(([t, xs]) => dobra(`mkt:${f}:${t}`, t, `${(xs || []).length} ${(xs || []).length === 1 ? "item" : "itens"}`, `<ul class="passos">${(xs || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`)).join("")}
      ${artista ? "" : `<div class="barra-acoes" style="margin-top:12px"><button class="btn sm" data-ir="campanha">Ver a campanha de divulgação</button></div>`}`;
  }
  // Mensagem de alinhamento de cronograma (modelo da Operações, 12/11/2026). Quem recebe: o contato da casa.
  // Regras: ordem do line-up ("Ordem de apresentação"); quem toca por último passa o som primeiro; olho no olho só no
  // Descubra; artista não confirmado fica fora (avisar Operações); sem telefone sai [telefone]; horários partem das 19h.
  const DIAS_SEM = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
  const hm = (min) => { const h = Math.floor(min / 60), m = min % 60; return `${h}h${m ? String(m).padStart(2, "0") : ""}`; };
  const BLOCOS_CRONO = {
    apresenta: (A, B) => [["Montagem e passagem", [[-270, 0, "chegada da equipe e início da montagem técnica"], [-210, -150, `passagem de som de ${B}`], [-150, -140, "troca de palco"], [-140, -110, `passagem de som de ${A}`], [null, -60, "ajustes finais", "até"], [-60, 0, "chegada da equipe operacional"]]],
      ["Noite", [[0, 0, "abertura da casa"], [50, 0, "aviso de 10 minutos"], [60, 0, "anfitriã (abertura da noite)"], [70, 100, A], [100, 120, "intervalo"], [120, 180, B], [180, 210, "playlist"], [210, 0, "início da desmontagem"]]]],
    descubra3: (A, B, C) => [["Montagem e passagem", [[-240, 0, "chegada da equipe e início da montagem técnica"], [-170, -140, `passagem de som de ${C}`], [-130, -100, `passagem de som de ${B}`], [-90, -60, `passagem de som de ${A}`], [-60, 0, "chegada da equipe operacional e da portaria"]]],
      ["Noite", [[0, 0, "abertura das portas"], [40, 0, "aviso de 10 minutos"], [50, 0, "anfitriã (abertura da noite)"], [60, 90, A], [90, 105, "intervalo"], [105, 135, B], [135, 150, "intervalo"], [150, 170, "olho no olho"], [170, 200, C], [200, 0, "início da desmontagem"]]]],
    descubra2: (A, B) => [["Montagem e passagem", [[-240, 0, "chegada da equipe e início da montagem técnica"], [-170, -140, `passagem de som de ${B}`], [-130, -100, `passagem de som de ${A}`], [-100, -80, "checagem do olho no olho (os dois juntos)"], [-60, 0, "chegada da equipe operacional e da portaria"]]],
      ["Noite", [[0, 0, "abertura das portas"], [40, 0, "aviso de 10 minutos"], [50, 0, "anfitriã (abertura da noite)"], [60, 90, A], [90, 105, "intervalo"], [105, 125, `olho no olho especial, ${A} e ${B}`], [125, 140, "intervalo"], [140, 170, B], [170, 0, "início da desmontagem"]]]],
  };
  function mensagemCronograma(e, { contato, casaNome, endereco, tecnico }) {
    const N = noiteDe(e), avisos = [];
    if (!N) return { bloqueada: true, avisos: ["O line-up desta noite ainda não chegou do Notion: pedir à Isa."], texto: "" };
    const conf = N.artistas.filter((a) => a.status === "Confirmado"), fora = N.artistas.filter((a) => a.status !== "Confirmado" && a.status !== "Cancelado");
    fora.forEach((a) => avisos.push(`${a.nome} está com status "${a.status}" e ficou fora da lista: avisar Operações antes de enviar.`));
    if (!conf.length || conf.some((a) => a.ordem == null)) return { bloqueada: true, avisos: [...avisos, "Ordem de apresentação não definida no line-up: pedir à Isa."], texto: "" };
    const produto = /descubra/i.test(e.n || "") ? "Descubra" : /apresenta/i.test(e.n || "") ? "Apresenta" : R.produtoBase(e.m) || e.m;
    const ord = [...conf].sort((a, b) => a.ordem - b.ordem), nomes = ord.map((a) => a.nome), apres = produto === "Apresenta";
    const tipo = apres ? (nomes.length === 2 ? "apresenta" : null) : nomes.length === 3 ? "descubra3" : nomes.length === 2 ? "descubra2" : null;
    if (!tipo) {
      // Mensagem em linguagem da operação: o que falta para a mensagem sair, e com quem resolver.
      const msg = produto === "Descubra" && nomes.length < 2 ? `Ainda não dá para montar o cronograma: o Descubra tem 2 ou 3 artistas e esta data só tem ${nomes.length === 1 ? "1 confirmado (" + nomes[0] + ")" : "nenhum confirmado"}. Quando a Isa completar o line-up, a mensagem aparece aqui.`
        : produto === "Apresenta" && nomes.length < 2 ? `Ainda não dá para montar o cronograma: o Apresenta tem abertura e atração (2 artistas) e esta data só tem ${nomes.length === 1 ? "1 confirmado (" + nomes[0] + ")" : "nenhum confirmado"}. Quando a Isa completar o line-up, a mensagem aparece aqui.`
        : !produto ? "Ainda não dá para montar o cronograma: falta dizer se a data é Descubra ou Apresenta. Fale com a Isa."
        : `Ainda não temos modelo de cronograma para ${produto} com ${nomes.length} artistas. Fale com a Operações para montar este caso.`;
      return { bloqueada: true, avisos: [...avisos, msg], texto: "" };
    }
    const ini = N.inicio ? +N.inicio.slice(0, 2) * 60 + +N.inicio.slice(3, 5) : 19 * 60;
    if (!N.inicio) avisos.push("Horário de início não está no Notion: considerei abertura às 19h (a validar).");
    const blocos = BLOCOS_CRONO[tipo](...nomes);
    const linhaHora = ([a, b, t, pre]) => `${pre === "até" ? `até ${hm(ini + b)}` : b ? `${hm(ini + a)} às ${hm(ini + b)}` : hm(ini + a)}: ${t}`;
    const d = new Date(e.d + "T12:00:00"), dia = DIAS_SEM[d.getDay()], dataBr = e.d.slice(8, 10) + "/" + e.d.slice(5, 7);
    const principal = apres ? nomes[1] : null;
    const contatos = ord.map((a, i) => `• ${a.nome}${apres && i === 0 ? " (abertura)" : ""}: ${a.producao ? "[nome da produção] (produção), " : ""}${a.whatsapp || "[telefone]"}`);
    if (ord.some((a) => a.producao)) avisos.push("Nome da produção e telefones ficam no Notion: a Operações completa os campos entre colchetes (a validar).");
    else if (ord.some((a) => !a.whatsapp)) avisos.push(`Falta o WhatsApp de ${ord.filter((a) => !a.whatsapp).map((a) => a.nome).join(", ")}: ainda sem conta no portal. Complete antes de mandar.`);
    const texto = [`Oi, ${contato || "[contato da casa]"}! Tudo bem? 🌿`, "",
      `Pra ${dia} (${dataBr}), no *Tranquilo ${produto}${principal ? ` com ${principal}` : ""}*, cria por favor um grupo no WhatsApp pra alinhar os horários com os artistas e o técnico de som.`, "",
      "*Quem entra no grupo:*", ...contatos, tecnico ? `• *Técnico de som:* ${tecnico}` : "• *Técnico de som:* coloca quem vai operar o som da noite", "",
      "Depois cola esse cronograma no grupo:", "",
      `*Tranquilo ${produto}${principal ? ` · ${principal}` : ""}*`, `📍 ${casaNome || "[casa]"}, ${endereco || "[endereço]"}`, `📅 ${dia[0].toUpperCase() + dia.slice(1)}, ${dataBr}`, "",
      ...blocos.flatMap(([t, ls], i) => [`*${t}*`, ...ls.map(linhaHora), ...(i < blocos.length - 1 ? [""] : [])]), "",
      "Quem toca por último passa o som primeiro. Qualquer atraso, avisa aqui no grupo 🙏"].join("\n");
    return { bloqueada: false, avisos, texto };
  }
  // Toda mensagem do portal sai por WhatsApp, e-mail ou cópia (para mandar por outro canal).
  const acoesEnvio = (texto, { whatsapp, email, assunto, idTexto }) => {
    const wa = `https://wa.me/${soDigitos(whatsapp || "")}?text=${encodeURIComponent(texto)}`;
    const mail = `mailto:${encodeURIComponent(email || "")}?subject=${encodeURIComponent(assunto || "Tranquilo")}&body=${encodeURIComponent(texto)}`;
    return `<div class="barra-acoes"><a class="btn pri sm" href="${escHref(wa)}" target="_blank" rel="noopener">WhatsApp${whatsapp ? "" : " (escolher contato)"}</a><a class="btn sm" href="${escHref(mail)}">E-mail</a><button class="btn sm" data-copiar-msg="${esc(idTexto)}">Copiar</button><span class="muted" style="font-size:12px"></span></div>`;
  };
  const blocoMensagem = (e, opts) => { const M = mensagemCronograma(e, opts), id = "crmsg-" + e.id;
    return `<div style="margin-top:10px"><b>Mensagem de alinhamento do cronograma</b> <span class="muted" style="font-size:12px">para o contato da casa criar o grupo com os artistas e o técnico de som</span>
      ${M.avisos.length ? `<div class="alert ${M.bloqueada ? "crit" : "warn"}" style="margin:6px 0">${M.avisos.map(esc).join("<br>")}</div>` : ""}
      ${M.bloqueada ? "" : `<textarea id="${esc(id)}" rows="12" readonly style="width:100%;font-size:13px">${esc(M.texto)}</textarea>${acoesEnvio(M.texto, { whatsapp: opts.whatsapp, email: opts.email, assunto: `Cronograma do Tranquilo · ${dt(e.d)}`, idTexto: id })}`}</div>`; };
  // Endereço que abre no aplicativo de mapa do celular (Google Maps, Apple Maps ou outro, pelo link universal).
  const linkMapa = (end) => end ? `<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(end)}" target="_blank" rel="noopener">${esc(end)} ↗</a>` : `<span class="muted">endereço a confirmar com a casa</span>`;
  const HORARIOS_NOITE = [["Passagem de som (estimada)", "passagem"], ["Portas", "portas"], ["Show", "show"]];
  // O que o artista (e a casa, nos Cronogramas) precisa para tocar: data, local, ordem da noite, horários e contatos.
  function infoNoite(e, end) {
    const N = noiteDe(e), conf = N ? N.artistas.filter((a) => a.status === "Confirmado" && a.ordem != null).sort((a, b) => a.ordem - b.ordem) : [];
    const ordem = conf.length ? conf.map((a) => `${a.ordem}. ${esc(a.nome)}`).join(" · ") : (e.a || []).length ? (e.a || []).map((n) => esc(n)).join(" · ") + ' <span class="muted">(ordem a definir)</span>' : '<span class="muted">line-up a definir</span>';
    return `<dl class="kv" style="margin:10px 0 0"><dt>Local</dt><dd>${esc(nomeCasa(e.h))} · ${linkMapa(end)}</dd>
      <dt>Ordem da noite</dt><dd>${ordem}</dd>
      <dt>Abertura da casa</dt><dd>${N?.inicio ? N.inicio.replace(":", "h").replace("h00", "h") : '<span class="muted">19h (a confirmar)</span>'}</dd>
      <dt>Passagem de som</dt><dd>Quem toca por último passa o som primeiro. Horário no cronograma da noite.</dd>
      <dt>Contatos ${A_VALIDAR_HTML}</dt><dd>Isa · Comercial e Artístico (datas, artistas e line-up). Contato da casa a confirmar.</dd></dl>`;
  }
  // Passos da data para a própria conta (casa ou artista), com o modelo do papel (quem faz, o que conta como feito e o
  // método, src/modelos.js) e o SOS do que é dela: equipe incompleta a 14 dias, contrato sem assinar a 10 e passos atrasados.
  function passosDaConta(e, modelo) {
    const feitos = window.TQModelos ? TQModelos.feitosDe(S.conta.chk, e.id) : Object.fromEntries(S.conta.chk.filter((c) => c.evento_id === e.id && c.feito).map((c) => [c.item, true]));
    const ctData = meusContratos().filter((c) => c.evento_id === e.id), ctPend = ctData.find((c) => c.status === "enviado" && !ctRecebido(c));
    if (ctData.some((c) => c.status === "assinado" || ctRecebido(c))) feitos.contrato ||= true;
    else if (ctData.some(ctPedidoDeNovo)) feitos.contrato = false;
    const fs = funcoesDe();
    // Data marcada em cima da hora (rodada de testes de 21/11/2026): o passo cujo prazo já tinha passado quando a data foi
    // criada não conta como atraso nem dispara SOS; vira "data curta: fazer o quanto antes".
    const criada = e.portal?.criado_em ? String(e.portal.criado_em).slice(0, 10) : null;
    const ps = (window.TQModelos ? TQModelos.passos(modelo, e.d, feitos, hojeIso(), e.m) : R.passosDaData(modelo, e.d, feitos, hojeIso(), e.m)).filter((p) => modelo !== "casa" || TQEquipe.vePasso(fs, p.chave))
      .map((p) => (criada && !p.feito && !p.passou && p.prazo < criada ? { ...p, atrasado: false, agora: true, curto: true } : p));
    const d = Math.round((Date.parse(e.d + "T12:00:00Z") - Date.parse(hojeIso() + "T12:00:00Z")) / 864e5), sos = [];
    if (d >= 0) {
      const L = S.conta.equipe, cob = modelo === "casa" && Array.isArray(L) && TQEquipe.veTudo(fs) ? TQEquipe.cobertura(L) : null;
      if (cob && !cob.completa && d <= 14) sos.push({ titulo: "Equipe da casa incompleta", texto: `Faltam ${d} dias e ainda falta: ${TQEquipe.listaFalta(cob)}. Sem a equipe completa a noite não fecha.`, botao: `<button class="btn sm pri" data-ir="equipe_casa">Completar a equipe</button>` });
      if (ctPend && d <= 10 && (modelo === "artista" || !fs)) sos.push({ titulo: "Contrato sem assinar", texto: `Faltam ${d} dias para a data e o contrato ainda não voltou assinado.`, botao: `<button class="btn sm pri" data-ct-abrir="${ctPend.id}">Abrir o contrato</button>` });
      const atr = ps.filter((p) => p.atrasado);
      if (atr.length >= 2) sos.push({ titulo: `${atr.length} passos atrasados`, texto: `${atr.slice(0, 3).map((p) => p.titulo).join(", ")}${atr.length > 3 ? ` e mais ${atr.length - 3}` : ""}. Faça o que der e marque Feito; se travou, avise a Central pelo grupo.`, botao: "" });
    }
    return { ps, sos, ctPend, fs };
  }
  // Acompanhamento da própria conta, no topo de Próximos passos: % feito, atrasados e SOS das próximas datas.
  function painelConta(evs, modelo) {
    const fut = evs.filter((e) => e.d >= hojeIso()); if (!fut.length || !window.TQModelos) return "";
    const todos = fut.map((e) => passosDaConta(e, modelo)), r = TQModelos.resumo(todos.flatMap((x) => x.ps)), sos = todos.reduce((t, x) => t + x.sos.length, 0);
    return `<div class="card md-conta row" style="margin-bottom:12px"><span><b>Seu acompanhamento</b> <span class="muted" style="font-size:13px">· ${fut.length} ${fut.length === 1 ? "data" : "datas"} pela frente</span></span><span>${pctBadge({ ...r, sos })}</span></div>`;
  }
  function blocoPassos(e, modelo) {
    const { ps, sos, ctPend, fs } = passosDaConta(e, modelo);
    const n = ps.filter((p) => p.feito).length, atras = ps.filter((p) => p.atrasado).length;
    const proximo = ps.find((p) => !p.feito && !p.passou);
    const registro = modelo === "casa" && e.d <= hojeIso() && TQEquipe.vePasso(fs, "publico") ? `<button class="btn sm" data-registrar="${e.id}">Registrar a noite</button>` : "";
    const local = modelo === "artista" ? `<details class="pp-det" style="margin-top:8px"><summary>Local, ordem da noite e contatos</summary>${infoNoite(e, S.pac?.enderecos?.[e.k])}</details>` : "";
    return `<div class="card"><div class="row"><div><b>${dt(e.d)} · ${esc(e.c)}</b> <span class="muted">${esc(e.h || "")}</span><div class="muted" style="font-size:13px">${esc(e.a.join(", ") || e.m)}</div></div>
      <div style="text-align:right"><span class="badge ${atras ? "b-crit" : n === ps.length ? "b-good" : "b-warn"}">${n}/${ps.length} feitos${atras ? ` · ${atras} atrasado${atras > 1 ? "s" : ""}` : ""}</span><div style="margin-top:6px;display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap">${registro}${e.l ? `<a class="btn sm" href="${escHref(e.l)}" target="_blank" rel="noopener">Ingressos</a>` : ""}</div></div></div>
      ${local}
      ${sos.length ? `<div class="alert crit md-sos-conta" style="margin:10px 0"><b>🆘 SOS: algo está atrasado ou travado</b><ul class="passos md-lista">${sos.map((x) => `<li><b>${esc(x.titulo)}</b><br><span style="font-size:13px">${esc(x.texto)}</span>${x.botao ? `<div class="barra-acoes" style="margin-top:6px">${x.botao}</div>` : ""}</li>`).join("")}</ul></div>` : ""}
      ${proximo?.chave === "contrato" && !ctPend ? `<div class="alert" style="margin:10px 0"><b>Contrato: a equipe está preparando</b>O contrato desta data ainda não chegou. Quando a equipe do Tranquilo enviar, ele aparece aqui com o botão "Abrir o contrato". Você não precisa fazer nada agora.</div>`
        : proximo ? `<div class="alert ${proximo.atrasado ? "crit" : "warn"}" style="margin:10px 0"><b>Agora: ${esc(proximo.titulo)}${proximo.validar ? " " + A_VALIDAR_HTML : ""}</b>${esc(proximo.texto)} <span class="muted">· prazo ${dt(proximo.prazo)}</span>${window.TQModelos && proximo.metodo ? `<div style="margin-top:6px">${linkMetodo(proximo.metodo, e.m)}</div>` : ""}${proximo.chave === "contrato" ? `<div class="barra-acoes" style="margin-top:10px"><button class="btn pri" data-ct-abrir="${ctPend.id}">Abrir o contrato →</button></div>` : ""}</div>` : `<div class="alert good" style="margin:10px 0"><b>Tudo feito para esta data.</b></div>`}
      <details data-dobra="pp-todos:${esc(e.id)}"${S.dobras?.["pp-todos:" + e.id] ? " open" : ""}><summary>Ver todos os passos (quem faz, o que conta como feito e como fazer)</summary><ul class="passos">${ps.map((p) => window.TQModelos ? linhaModelo(p, { evId: e.id, produto: e.m, marcar: true, campo: "passo", soQuemMarcou: false, quemMarcou: (u) => u === S.conta.perfil.id ? "você" : modelo === "casa" ? "alguém da equipe da casa" : "você" }).replace("</b>", `</b>${p.validar ? " " + A_VALIDAR_HTML : ""}`)
        : `<li class="${p.feito ? "feito" : p.atrasado ? "atrasado" : p.passou ? "passou" : ""}"><label><input type="checkbox" data-passo="${e.id}|${p.chave}"${p.feito ? " checked" : ""}> <span><b>${esc(p.titulo)}</b> <span class="muted">· ${dtc(p.prazo)}${p.curto ? " · data curta: fazer o quanto antes" : ""}</span><br><span class="muted" style="font-size:13px">${esc(p.texto)}</span></span></label>${anexoPasso(e.id, p.chave)}</li>`).join("")}</ul></details>${TQOperacao.bloco(e, modelo, fs ? TQEquipe.partesNoite(fs) : null)}${blocoMateriais(e)}</div>`;
  }
  // Contrato da data, modelo geral e arquivos enviados pela própria conta (rider, mapa de palco, fotos, release).
  function blocoMateriais(e) {
    const docs = (S.conta.docs || []).filter((d) => d.evento_id === e.id || (!d.evento_id && d.tipo === "modelo"));
    const digitais = meusContratos().filter((c) => c.evento_id === e.id);
    const meus = (S.conta.arqs || {})[e.id] || [];
    const artista = S.conta.perfil.tipo === "artista";
    return `<details style="margin-top:6px"><summary>Contrato e materiais${docs.length + meus.length + digitais.length ? ` (${docs.length + meus.length + digitais.length})` : ""}</summary>
      <div style="margin-top:10px">${digitais.map((c) => `<div class="row" style="margin-bottom:6px"><span>✍️ ${esc(c.titulo)} · <span class="badge ${situacaoCt(c).classe}">${situacaoCt(c).rotulo}</span></span><button class="btn sm" data-ct-abrir="${c.id}">${c.status === "assinado" ? "Ver" : "Abrir e assinar"}</button></div>`).join("")}${docs.length ? docs.map((d) => `<div class="row" style="margin-bottom:6px"><span>${d.tipo === "contrato" ? "📄 Contrato" : d.tipo === "modelo" ? "📝 Modelo" : "📎"} · ${esc(d.titulo)}</span><a class="btn sm" href="${escHref(d.url)}" target="_blank" rel="noopener">Abrir</a></div>`).join("") : `<p class="muted" style="font-size:13px;margin:0 0 8px">O contrato desta data aparece aqui quando a equipe anexar.</p>`}
      <b style="font-size:14px">Seus arquivos</b>
      ${meus.length ? `<ul class="passos" style="margin:6px 0">${meus.map((f) => `<li><a href="#" data-arquivo="${esc(f.caminho)}">${esc(f.nome.replace(/^\d+-/, ""))}</a> <span class="muted" style="font-size:12px">· ${f.em ? dt(f.em.slice(0, 10)) : ""}</span></li>`).join("")}</ul>` : `<p class="muted" style="font-size:13px;margin:4px 0">Nenhum arquivo enviado para esta data.</p>`}
      <label class="fcampo" style="margin-top:8px"><b>Enviar ${artista ? "rider, mapa de palco, fotos ou release" : "rider da casa, fotos do palco ou documentos"}</b><input type="file" data-enviar-arquivo="${esc(e.id)}" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.zip,.txt,.mp3"></label>
      <div class="err" role="status" aria-live="polite" id="arqErr-${esc(e.id)}"></div></div></details>`;
  }

  // ---------- contrato automático ----------
  // Equipe: modelos, preparar (campos da equipe preenchidos, o resto fica para a pessoa) e acompanhar.
  function secaoContratos(E, contas, datas, dataTxt, nomeConta) {
    // Contrato por área (pedido da Marina, 17/11/2026): Isa (Agenda) libera o da artista; Gui (Operações) o da casa.
    const ehCasaMod = (m) => /^casa|parceria|franque/i.test(m.nome || ""), artOk = temArea("agenda"), casaOk = temArea("operacoes");
    contas = contas.filter((p) => (p.tipo === "casa" ? casaOk : artOk));
    if (E.contr !== null && E.modContr !== null) E = { ...E, modContr: (E.modContr || []).filter((m) => (ehCasaMod(m) ? casaOk : artOk)), contr: (E.contr || []).filter((c) => { const p = (E.perfis || []).find((x) => x.id === c.user_id); return !p || (p.tipo === "casa" ? casaOk : artOk); }) };
    if (E.contr === null || E.modContr === null) return `<div class="alert warn" style="margin-bottom:14px"><b>Contrato automático ainda não está ligado no banco</b>Rode o supabase/schema.sql (parte v7) para usar.</div>`;
    const mods = E.modContr || [], prep = S.cPrep, ed = mods.find((m) => m.id === S.cModEd);
    const lista = (E.contr || []).filter((c) => c.status !== "cancelado" || S.cVerCancel);
    const pre = prep || S.cPre || {};
    // Próximas datas (60 dias) sem contrato digital nem contrato anexado: para ninguém ficar sem.
    const comContrato = new Set([...(E.contr || []).filter((c) => c.status !== "cancelado").map((c) => c.evento_id), ...(E.docs || []).filter((d) => d.tipo === "contrato").map((d) => d.evento_id)]);
    const ate = new Date(Date.now() + 60 * 864e5).toISOString().slice(0, 10), hoje = new Date().toISOString().slice(0, 10);
    const semContrato = datas.filter((e) => e.d >= hoje && e.d <= ate && !comContrato.has(e.id));
    const contaDe = (e) => (e.au?.length && contas.find((p) => p.id === e.au[0])) || contas.find((p) => p.vinculo_nome && (e.a || []).some((a) => a.toLowerCase() === p.vinculo_nome.toLowerCase()));
    return `<div class="card" id="contrAuto"><h3 style="margin-top:0">Preparar contrato</h3>
      <p class="muted" style="margin:0 0 4px;font-size:14px">Escolha a conta, a data e o modelo. Nada é enviado antes de você conferir.</p>
      <details style="margin:0 0 10px"><summary>Como funciona o contrato automático</summary><p class="muted" style="margin:6px 0 0;font-size:14px">O site preenche o que já sabe (nome, data, cidade, casa); você completa o cachê e o que mais souber. O que ficar em branco a pessoa completa (CPF, endereço, Pix…). O contrato vai já assinado pelo Tranquilo: a pessoa baixa o PDF, assina e envia de volta, e você confere aqui.</p></details>
      <div class="grid g3">
        <label class="fcampo"><b>Conta</b><select id="ctConta"><option value="">Escolha a artista ou casa</option>${contas.map((p) => `<option value="${p.id}"${pre.conta === p.id ? " selected" : ""}>${esc(p.rotulo)} · ${p.tipo}</option>`).join("")}</select></label>
        <label class="fcampo"><b>Data</b><select id="ctEv"><option value="">Sem data específica</option>${datas.map((e) => `<option value="${esc(e.id)}"${pre.ev === e.id ? " selected" : ""}>${dt(e.d)} · ${esc(e.c)} · ${esc(e.a.join(", ") || e.m)}</option>`).join("")}</select></label>
        <label class="fcampo"><b>Modelo</b><select id="ctMod"><option value="">${mods.length ? "Escolha o modelo" : "Cadastre um modelo abaixo"}</option>${mods.map((m) => `<option value="${m.id}"${prep?.modelo === m.id ? " selected" : ""}>${esc(m.nome)}</option>`).join("")}</select></label>
      </div><div class="barra-acoes">${comExplica(`<button class="btn" id="ctPrep">Preparar contrato</button>`, "Mostra os campos para você conferir aqui. Ainda não envia nada.")}</div>
      ${prep ? `<div style="margin-top:12px;border-top:1px solid var(--line);padding-top:12px">
        <label class="fcampo"><b>Nome do contrato</b><input id="ctTit" maxlength="160" value="${esc(prep.titulo)}"></label>
        <p style="margin:10px 0 6px"><b>Campos do modelo</b> <span class="muted" style="font-size:13px">· em branco = a pessoa preenche</span></p>${prep.daFicha ? `<div class="alert good" style="margin:0 0 10px"><b>${prep.daFicha} ${prep.daFicha === 1 ? "campo veio" : "campos vieram"} da Ficha</b>Confira antes de enviar. O que ficou em branco não está na Ficha: a pessoa completa na hora de assinar.</div>` : ""}
        <div class="grid g2">${prep.campos.map((c) => `<label class="fcampo"><b>${esc(c.rotulo)}</b><input data-ct-campo="${esc(c.chave)}" maxlength="300" value="${esc(prep.valores[c.chave] || "")}" placeholder="a pessoa preenche"></label>`).join("") || `<p class="muted">Este modelo não tem campos: o texto vai como está.</p>`}</div>
        <div class="barra-acoes">${comExplica(`<button class="btn pri" id="ctEnviar">Enviar para assinatura</button>`, "Vai já assinado pelo Tranquilo. A pessoa vê no passo a passo dela, assina e devolve; você confere aqui.")}${comExplica(`<button class="btn ghost" id="ctDescartar">Descartar este rascunho</button>`, "Nada é enviado.")}</div></div>` : ""}
      <div class="err" role="status" aria-live="polite" id="ctErr"></div>
      <details style="margin-top:12px"${S.cModAberto ? " open" : ""}><summary>Modelos de contrato (${mods.length})</summary>
        <p class="muted" style="font-size:13px">Cole o texto do modelo do Notion. Trechos como <code>[PREENCHER NOME COMPLETO]</code> viram campos. Para o site preencher sozinho, use <code>{{artista}}</code>, <code>{{data}}</code>, <code>{{cidade}}</code>, <code>{{casa}}</code>, <code>{{evento}}</code>, <code>{{cache}}</code> e <code>{{horario}}</code>.</p>
        ${mods.map((m) => `<div class="row" style="margin-bottom:6px"><span>${esc(m.nome)} <span class="muted" style="font-size:12px">· ${TQContrato.campos(m.texto).campos.length} campos</span></span><button class="btn sm" data-ct-mod-editar="${m.id}">Editar</button></div>`).join("")}
        <label class="fcampo"><b>${ed ? "Editar modelo" : "Novo modelo"}: nome</b><input id="mcNome" maxlength="120" value="${esc(ed?.nome || "")}" placeholder="ex.: Contrato Apresenta — artista principal"></label>
        <label class="fcampo"><b>Texto do modelo</b><textarea id="mcTexto" rows="10" style="width:100%;font:14px/1.5 var(--sans)">${esc(ed?.texto || "")}</textarea></label>
        <div class="barra-acoes"><button class="btn" id="mcOk">${ed ? "Salvar alterações" : "Salvar modelo"}</button>${ed ? `<button class="btn" data-ct-mod-editar="">Cancelar edição</button>` : ""}</div><div class="err" role="status" aria-live="polite" id="mcErr"></div>
        <p class="muted" style="font-size:12px;margin:4px 0 0">Mudar o modelo não muda contratos já enviados.</p>
      </details></div>
      ${semContrato.length ? `<h2>Datas dos próximos 60 dias sem contrato (${semContrato.length})</h2><p class="sub">Nenhum contrato gerado nem anexado para estas datas.</p>${(() => { const linha = (e) => { const c = contaDe(e); return `<div class="row card" style="padding:10px 14px"><span><b>${dt(e.d)} · ${esc(e.c)}</b> <span class="muted">${esc((e.a || []).join(", ") || e.m)}${e.h ? " · " + esc(e.h) : ""}</span>${c ? "" : ` <span class="muted" style="font-size:12px">· sem conta ligada no site</span>`}</span><button class="btn sm" data-ct-pre="${esc(e.id)}|${c ? c.id : ""}">Preparar contrato</button></div>`; }, L = semContrato.slice(0, 30);
        return `<div class="list">${L.slice(0, 5).map(linha).join("")}</div>${L.length > 5 ? `<details style="margin-top:8px"><summary>Ver mais ${L.length - 5} ${L.length - 5 === 1 ? "data" : "datas"} sem contrato</summary><div class="list" style="margin-top:8px">${L.slice(5).map(linha).join("")}</div></details>` : ""}`; })()}` : ""}
      ${secaoLineups(E)}
      <h2>Contratos para assinar</h2><div class="err" role="status" aria-live="polite" id="ctConfMsg"></div>${tabela("contr", [
        { t: "Contrato", v: (c) => c.titulo, h: (c) => `<b>${esc(c.titulo)}</b>` },
        { t: "Conta", v: (c) => nomeConta[c.user_id] || "–" },
        { t: "Data", v: (c) => c.evento_id || "", h: (c) => c.evento_id ? esc(dataTxt(c.evento_id)) : "–" },
        { t: "Situação", v: (c) => c.status + (c.conferido_em || c.assinado_em || ""), h: (c) => { const si = situacaoCt(c); return `<span class="badge ${si.classe}">${si.rotulo}</span>${c.conferido_em ? `<div class="muted" style="font-size:12px">conferido por ${esc(nomeConta[c.conferido_por] || "equipe")} · ${new Date(c.conferido_em).toLocaleString("pt-BR")}</div>` : c.devolvido_em ? `<div class="muted" style="font-size:12px">${ctPedidoDeNovo(c) ? "aguardando o arquivo novo" : "arquivo novo depois do pedido"} · pedido por ${esc(nomeConta[c.devolvido_por] || "equipe")}: ${esc(c.devolvido_motivo || "")}</div>` : c.assinado_em ? `<div class="muted" style="font-size:12px">${esc(c.assinado_nome)} · ${new Date(c.assinado_em).toLocaleString("pt-BR")}</div>` : si.falta ? `<div class="muted" style="font-size:12px">falta: ${esc(si.falta.map((x) => x.rotulo).join(", "))}</div>` : ""}`; } },
        { t: "", v: () => 0, h: (c) => `<div style="display:flex;gap:6px;flex-wrap:wrap">${arqsContrato(c)[0] ? `<a class="btn sm pri" href="#" data-arquivo="${esc(arqsContrato(c)[0].caminho)}">Ver o assinado</a>` : ""}<button class="btn sm" data-ct-ver="${c.id}">Baixar PDF</button>${c.status === "enviado" && !arqsContrato(c).length ? `<button class="btn sm" data-ct-cancelar="${c.id}">Cancelar contrato</button>` : ""}${botoesConferir(c)}</div>` },
      ], lista, { i: 3, dir: 1 }, vazio("Nenhum contrato gerado ainda", "Prepare o primeiro contrato acima: ele aparece na área da artista ou da casa para assinar.", "", "documentos"))}`;
  }
  // Conferir o arquivo assinado recebido (banco v28): "Conferir e confirmar" ou "Pedir de novo" com o motivo (a pessoa lê).
  function botoesConferir(c) {
    if (c.status !== "enviado" || c.conferido_em || !arqsNovos(c).length) return "";
    if (S.ctDevolver === c.id) return `<div class="ct-devolver-box" style="flex-basis:100%;margin-top:6px"><label class="fcampo" style="margin:0"><b>O que a pessoa precisa corrigir?</b><textarea id="ctMotivo" rows="2" maxlength="500" placeholder="ex.: faltou a assinatura na página 2"></textarea></label>
      <div class="barra-acoes" style="margin-top:6px">${comExplica(`<button class="btn sm pri" data-ct-devolver-ok="${c.id}">Enviar o pedido à pessoa</button>`, "Ela lê o motivo e envia o arquivo de novo.")}<button class="btn sm ghost" data-ct-devolver="">Desistir</button></div></div>`;
    return `<button class="btn sm pri" data-ct-conferir="${c.id}" title="Confirma que o arquivo assinado está certo. Pede confirmação antes.">Conferir e confirmar</button><button class="btn sm" data-ct-devolver="${c.id}" title="Você escreve o que corrigir e a pessoa envia de novo.">Pedir o arquivo de novo</button>`;
  }
  // ---------- line-up e contratos de uma data do portal (pedido da Marina, 18/11/2026) ----------
  // Um contrato para cada artista do line-up e o da casa. A Isa (Agenda) vê os artistas; a Operações vê a casa; a
  // administração vê tudo. Cada linha diz a situação do contrato, os passos daquele artista e a ação direta.
  const ehCasaModelo = (m) => /^casa|parceria|franque/i.test(m.nome || "");
  function lineupDe(E, x) {
    const casaOk = temArea("operacoes"), casa = (E.casas || []).find((c) => c.id === x.casa_id);
    return TQContrato.lineup(x, E.contr || [], { arquivoNovo: (c) => arqsNovos(c).length > 0, casaUserId: casaOk ? casa?.user_id || null : undefined });
  }
  function resumoLineup(E, x) {
    const L = lineupDe(E, x), artOk = temArea("agenda"), linhas = [...(artOk ? L.artistas : []), ...(L.casa ? [L.casa] : [])];
    const prontos = linhas.filter((l) => l.etapa === "conferido" || l.etapa === "assinado").length;
    return `${L.artistas.length} ${L.artistas.length === 1 ? "artista" : "artistas"} · ${prontos} de ${linhas.length} ${linhas.length === 1 ? "contrato pronto" : "contratos prontos"}${prontos < linhas.length ? ` · falta: ${linhas.filter((l) => l.etapa !== "conferido" && l.etapa !== "assinado").map((l) => l.nome).join(", ")}` : ""}`;
  }
  // Mensagem para cobrar o contrato no WhatsApp, conforme a situação.
  function cobrancaContrato(l, x) {
    const quando = `${dt(String(x.dia).slice(0, 10))} em ${x.cidade || x.casa_nome}`, c = l.contrato;
    const corpo = l.etapa === "devolvido" ? `conferimos o arquivo assinado do contrato do Tranquilo ${x.produto} de ${quando} e precisamos de outro: ${c?.devolvido_motivo || ""}. Pode enviar o arquivo novo pela Rede Tranquilo, na aba Contratos?`
      : l.etapa === "aguardando_dados" ? `o contrato do Tranquilo ${x.produto} de ${quando} está na sua área da Rede Tranquilo esperando os seus dados (nome completo, CPF ou CNPJ e Pix). Completa por lá, baixa o PDF, assina e envia de volta?`
      : `o contrato do Tranquilo ${x.produto} de ${quando} já está com os seus dados. Falta baixar o PDF, assinar e enviar o arquivo assinado pela Rede Tranquilo, na aba Contratos.`;
    return `Oi, ${l.nome}! Aqui é da equipe do Tranquilo: ${corpo} ${site()}`;
  }
  function whatsappDe(E, l) {
    if (l.whatsapp) return l.whatsapp;
    const i = (E.insc || []).find((y) => y.user_id === l.user_id), p = (E.perfis || []).find((y) => y.id === l.user_id), c = (E.casas || []).find((y) => y.user_id === l.user_id);
    return i?.dados?.whatsapp || c?.dados?.whatsapp || p?.whatsapp || "";
  }
  function quadroLineup(E, x) {
    const artOk = temArea("agenda"), L = lineupDe(E, x), ev = "p:" + x.id;
    const P = R.passosDoLineup(x, E.chk || [], hojeIso(), (u) => L.artistas.some((l) => l.user_id === u && ["recebido", "conferido", "assinado"].includes(l.etapa)));
    const linhas = [...(artOk ? L.artistas : []), ...(L.casa ? [L.casa] : [])];
    if (!linhas.length) return `<p class="muted" style="font-size:13px">Os contratos desta data são de outra área.</p>`;
    const acao = (l) => {
      const c = l.contrato, w = whatsappDe(E, l);
      if (l.etapa === "sem_conta") return l === L.casa ? `<span class="muted" style="font-size:12px">a casa ainda não tem conta ligada</span>` : `<button class="btn sm" data-ir="convites">Convidar para o portal</button>`;
      if (l.etapa === "sem") return `<span class="muted" style="font-size:12px">entra em "Preparar contratos do line-up"</span>`;
      if (["aguardando_dados", "enviado", "devolvido"].includes(l.etapa)) return `<a class="btn sm" href="https://wa.me/${soDigitos(w)}?text=${encodeURIComponent(cobrancaContrato(l, x))}" target="_blank" rel="noopener">Cobrar no WhatsApp${w ? "" : " (escolher contato)"}</a><button class="btn sm" data-ct-ver="${c.id}">Baixar PDF</button>`;
      if (l.etapa === "recebido") return `${arqsContrato(c)[0] ? `<a class="btn sm" href="#" data-arquivo="${esc(arqsContrato(c)[0].caminho)}">Ver o assinado</a>` : ""}${botoesConferir(c)}`;
      return `<button class="btn sm" data-ct-ver="${c.id}">Baixar PDF</button>`;
    };
    const passos = (l) => { if (l === L.casa) return ""; const p = P.find((y) => y.user_id && y.user_id === l.user_id); if (!p) return "";
      return `<div class="muted" style="font-size:12px">passos: ${p.feitos}/${p.total} feitos${p.atrasados ? ` · <b style="color:var(--bad, #b42318)">${p.atrasados} atrasado${p.atrasados > 1 ? "s" : ""}</b>` : ""}${p.proximo ? ` · agora: ${esc(p.proximo.titulo)}` : ""}</div>`; };
    const pronto = (l) => l.etapa === "conferido" || l.etapa === "assinado", faltam = linhas.filter((l) => !pronto(l));
    const mods = (E.modContr || []).filter((m) => m.ativo !== false), modsArt = mods.filter((m) => !ehCasaModelo(m)), modsCasa = mods.filter(ehCasaModelo);
    const aPrep = linhas.filter((l) => l.etapa === "sem");
    return `<div class="lineup" data-ct-msg="${x.id}" style="margin-top:10px">
      ${faltam.length ? `<p style="margin:0 0 8px;font-size:14px"><b>Falta${faltam.length > 1 ? "m" : ""} ${faltam.length}:</b> ${faltam.map((l) => `${esc(l.nome)} <span class="muted">(${esc(TQContrato.ETAPAS[l.etapa][1].toLowerCase())})</span>`).join(", ")}</p>` : `<div class="alert good" style="margin:0 0 8px"><b>✓ Todos os contratos desta data estão assinados.</b></div>`}
      <div class="list">${linhas.map((l) => `<div class="row card" style="padding:10px 14px" data-lp-linha="${esc(l.user_id || l.nome)}"><div><b>${l === L.casa ? "Casa" : `${l.ordem}º`} · ${esc(l.nome)}</b> <span class="badge ${TQContrato.ETAPAS[l.etapa][0]}">${esc(TQContrato.ETAPAS[l.etapa][1])}</span>${l.contrato?.devolvido_em && l.etapa === "devolvido" ? `<div class="muted" style="font-size:12px">motivo: ${esc(l.contrato.devolvido_motivo || "")}</div>` : ""}${passos(l)}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">${acao(l)}</div></div>`).join("")}</div>
      <div class="err ct-msg" role="status" aria-live="polite"></div>
      ${aPrep.length ? S.lpPrep === x.id ? painelPrepLineup(E, x, aPrep, modsArt, modsCasa) : `<div class="barra-acoes" style="margin-top:8px"><button class="btn pri sm" data-lp-abrir="${x.id}">Preparar contratos do line-up (${aPrep.length})</button></div>` : ""}
      <div class="err" role="status" aria-live="polite" id="lpMsg-${x.id}"></div></div>`;
  }
  // Escolhe os modelos e completa o que é da equipe (ex.: cachê de cada um). O resto vem da Ficha de cada artista ou
  // fica para a pessoa preencher no contrato (nome completo, CPF/CNPJ, Pix).
  function modeloLineup(tipo, mods, x) {
    const esc_ = (S.lpMod || {})[tipo];
    return mods.find((m) => m.id === esc_) || mods.find((m) => new RegExp(x.produto, "i").test(m.nome)) || mods.find((m) => new RegExp(R.produtoBase(x.produto) || "^$", "i").test(m.nome)) || mods[0] || null;
  }
  function painelPrepLineup(E, x, aPrep, modsArt, modsCasa) {
    const e = eventoDoPortal(x), temArt = aPrep.some((l) => l.user_id && (E.perfis || []).find((p) => p.id === l.user_id)?.tipo !== "casa"), temCasa = aPrep.some((l) => (E.perfis || []).find((p) => p.id === l.user_id)?.tipo === "casa");
    const mA = modeloLineup("art", modsArt, x), mC = modeloLineup("casa", modsCasa, x);
    const sel = (tipo, mods, m) => `<label class="fcampo"><b>Modelo para ${tipo === "art" ? "os artistas" : "a casa"}</b><select data-lp-mod="${tipo}">${mods.length ? mods.map((y) => `<option value="${y.id}"${y.id === m?.id ? " selected" : ""}>${esc(y.nome)}</option>`).join("") : `<option value="">Cadastre um modelo em Contratos e documentos</option>`}</select></label>`;
    const linha = (l) => {
      const ehCasa = (E.perfis || []).find((p) => p.id === l.user_id)?.tipo === "casa", m = ehCasa ? mC : mA;
      if (!m) return `<div class="card" style="padding:10px 14px"><b>${esc(l.nome)}</b> <span class="muted">· sem modelo de contrato ${ehCasa ? "da casa" : "de artista"}</span></div>`;
      const P = montarContrato(m, l.user_id, e, l), daEquipe = P.campos.filter((c) => TQContrato.DA_EQUIPE[c.chave] && !P.valores[c.chave]), daPessoa = P.campos.filter((c) => !TQContrato.DA_EQUIPE[c.chave] && !P.valores[c.chave]);
      return `<div class="card" style="padding:10px 14px"><b>${esc(l.nome)}</b> <span class="muted" style="font-size:13px">· ${esc(m.nome)}${P.daFicha ? ` · ${P.daFicha} ${P.daFicha === 1 ? "dado veio" : "dados vieram"} da Ficha` : ""}${daPessoa.length ? ` · ${ehCasa ? "a casa" : "o artista"} completa: ${esc(daPessoa.map((c) => c.rotulo).join(", "))}` : ""}</span>
        ${daEquipe.length ? `<div class="grid g3" style="margin-top:6px">${daEquipe.map((c) => `<label class="fcampo" style="margin:0"><b>${esc(c.rotulo)}</b><input data-lp-campo="${l.user_id}|${esc(c.chave)}" maxlength="300" value="${esc((S.lpVal || {})[l.user_id + "|" + c.chave] || "")}" placeholder="em branco = a pessoa preenche"></label>`).join("")}</div>` : ""}</div>`;
    };
    return `<div class="card" style="margin-top:8px;border-style:dashed"><h3 style="margin-top:0">Preparar contratos do line-up</h3>
      <p class="muted" style="font-size:13px;margin:0 0 8px">Um contrato para cada um que ainda não tem, preenchido com a Ficha daquele artista (nome, cidade, WhatsApp) e com a data. O que a Ficha não tem (nome completo, CPF ou CNPJ, Pix) cada um preenche no próprio contrato. Quem já tem contrato desta data não ganha outro.</p>
      <div class="grid g2">${temArt ? sel("art", modsArt, mA) : ""}${temCasa ? sel("casa", modsCasa, mC) : ""}</div>
      <div class="list">${aPrep.map(linha).join("")}</div>
      <div class="barra-acoes">${comExplica(`<button class="btn pri" data-lp-gerar="${x.id}">Gerar ${aPrep.length} ${aPrep.length === 1 ? "contrato" : "contratos"}</button>`, "Cada pessoa vê o pedido de assinatura no passo a passo dela.")}<button class="btn ghost" data-lp-fechar>Agora não</button></div></div>`;
  }
  // Monta o contrato de uma conta para uma data: campos do modelo, o que a equipe sabe (data, casa, nome) e a Ficha.
  function montarContrato(m, conta, e, linhaLineup) {
    const p0 = (S.eq.perfis || []).find((x) => x.id === conta) || {}, p = { ...p0, vinculo_nome: nomeDaConta(p0) };
    const { texto, campos } = TQContrato.campos(m.texto), sug = TQContrato.sugestoes(e, p);
    const ehCasa = p0.tipo === "casa", ficha = ehCasa ? (S.eq.casas || []).find((c) => c.user_id === conta || (p0.vinculo_nome && (c.dados?.nome === p0.vinculo_nome || c.perfil?.vinculo_nome === p0.vinculo_nome))) : (S.eq.insc || []).find((i) => i.user_id === conta);
    const cad = TQContrato.doCadastro(campos, ehCasa ? "casa" : "artista", ficha?.dados, { combinados: ficha?.combinados, email: p0.email, nome: p.vinculo_nome, whatsapp: linhaLineup?.whatsapp || p0.whatsapp });
    return { texto, campos, daFicha: Object.keys(cad).length, valores: Object.fromEntries(campos.map((c) => [c.chave, sug[c.chave] || cad[c.chave] || ""])),
      titulo: `${m.nome} · ${p.vinculo_nome || p.nome || p.email}${e ? ` · ${e.c} ${dt(e.d).slice(0, 5)}` : ""}`.slice(0, 160) };
  }
  // Seção de Contratos e documentos: as datas do portal (próximos 60 dias) com o line-up e os contratos de cada uma.
  function secaoLineups(E) {
    const hoje = hojeIso(), ate = new Date(Date.now() + 60 * 864e5).toISOString().slice(0, 10);
    const ds = (E.datasP || []).filter((x) => x.status !== "cancelada" && String(x.dia).slice(0, 10) >= hoje && String(x.dia).slice(0, 10) <= ate).sort((a, b) => String(a.dia).localeCompare(String(b.dia)));
    if (!ds.length) return "";
    return `<h2 id="lineups">Line-up e contratos por data</h2><p class="sub">Datas criadas no portal nos próximos 60 dias: cada artista do line-up (e a casa) com a situação do contrato e quem falta.</p>
      <div class="list">${ds.map((x) => `<details class="card" data-lp-det="${x.id}"${S.lpAberto === x.id ? " open" : ""}><summary><b>${dt(String(x.dia).slice(0, 10))} · ${esc(x.casa_nome)}</b> <span class="badge">${esc(x.produto)}</span> <span class="muted" style="font-size:13px">· ${esc(resumoLineup(E, x))}</span></summary>${quadroLineup(E, x)}</details>`).join("")}</div>`;
  }
  // Artista e casa: contratos pendentes no topo do passo a passo e a tela de leitura e assinatura.
  const meusContratos = () => (S.conta.contr || []).filter((c) => c.status !== "cancelado");
  function avisoContratos() {
    // Devolvido pela equipe primeiro: é a pendência mais urgente da pessoa.
    const pend = meusContratos().filter((c) => c.status === "enviado" && !ctRecebido(c)).sort((a, b) => ctPedidoDeNovo(b) - ctPedidoDeNovo(a));
    return pend.map((c) => ctPedidoDeNovo(c) ? `<div class="alert crit" style="margin-bottom:12px"><b>Contrato: envie o arquivo assinado de novo · ${esc(c.titulo)}</b>A equipe do Tranquilo pediu outro arquivo. O motivo: <q>${esc(c.devolvido_motivo || "")}</q><div class="barra-acoes" style="margin-top:10px"><button class="btn pri" data-ct-abrir="${c.id}">Abrir o contrato →</button></div></div>` : `<div class="alert warn" style="margin-bottom:12px"><b>Contrato para assinar: ${esc(c.titulo)}</b>O Tranquilo já assinou. Complete os seus dados, baixe o PDF, assine e envie de volta.<div class="barra-acoes" style="margin-top:10px"><button class="btn pri" data-ct-abrir="${c.id}">Abrir o contrato →</button></div></div>`).join("");
  }
  // Dados que a pessoa já deu em outro contrato (mesma chave de campo), do mais recente para o mais antigo:
  // ela preenche uma vez e só confere nos próximos (pedido da Isa, 17/11/2026).
  function dadosAnteriores(c) {
    const outros = meusContratos().filter((x) => x.id !== c.id && x.status !== "cancelado").sort((a, b) => String(b.assinado_em || b.criado_em || "").localeCompare(String(a.assinado_em || a.criado_em || "")));
    const r = {}; for (const x of outros) for (const [k, v] of Object.entries(x.dados || {})) if (r[k] == null && String(v ?? "").trim()) r[k] = String(v).trim();
    return r;
  }
  // Arquivo assinado que a pessoa enviou (pasta contrato_<id> no armazenamento). Pessoa: S.conta.arqs; equipe: S.eq.arqs.
  const arqsContrato = (c) => S.eq?.arqs ? S.eq.arqs.filter((f) => f.evento_id === "contrato_" + c.id) : ((S.conta?.arqs || {})["contrato_" + c.id] || []);
  // Conferência pela equipe (banco v28): depois de "Pedir de novo", só conta o arquivo enviado depois do pedido.
  const arqsNovos = (c) => { const a = arqsContrato(c), d = c.devolvido_em && Date.parse(c.devolvido_em); return d ? a.filter((f) => f.em && Date.parse(f.em) > d) : a; };
  const ctRecebido = (c) => !!c.conferido_em || (c.status === "enviado" && arqsNovos(c).length > 0);   // arquivo assinado recebido (ou já conferido)
  const ctPedidoDeNovo = (c) => c.status === "enviado" && !c.conferido_em && !!c.devolvido_em && !arqsNovos(c).length;
  const ctAssinado = (c) => c.status === "assinado" || !!c.conferido_em;   // assinado de vez: no portal ou arquivo conferido
  // Situação para a tela: assinado no portal, conferido, arquivo recebido, pedido de novo, ou o que falta.
  function situacaoCt(c) {
    if (c.conferido_em) return { rotulo: "✓ Assinado e conferido", classe: "b-good" };
    if (c.status !== "assinado" && arqsNovos(c).length) return { rotulo: "Assinado · arquivo recebido", classe: "b-good" };
    if (ctPedidoDeNovo(c)) return { rotulo: "Arquivo pedido de novo", classe: "b-crit" };
    const si = TQContrato.situacao(c);
    return si.falta ? si : c.status === "enviado" ? { rotulo: "Aguardando assinatura", classe: "b-warn" } : si;
  }
  // Etapa real da casa e da artista (pedido da Marina, 18/11/2026): além de "habilitada" ou "aprovada", onde está o
  // contrato (conferido_*, devolvido_*, arquivo enviado) e, na casa, a equipe. Vale para a equipe e para a própria conta.
  function etapaContratos(cts) {
    cts = (cts || []).filter((c) => c.status !== "cancelado");
    if (!cts.length) return "sem";
    if (cts.some(ctPedidoDeNovo)) return "devolvido";
    if (cts.some((c) => c.status === "enviado" && !c.conferido_em && arqsNovos(c).length)) return "conferencia";
    if (cts.some((c) => c.status === "enviado" && !ctRecebido(c))) return "enviado";
    return "assinado";
  }
  const ETAPA_CT = { enviado: ["b-warn", "Contrato enviado · esperando assinatura"], conferencia: ["b-warn", "Contrato assinado · em conferência"], devolvido: ["b-crit", "Contrato devolvido"] };
  /** [classe, rótulo] da casa: status da Ficha e, depois de habilitada, contrato e equipe. equipe = lista da Equipe da casa (ou null se não carregou). */
  function etapaCasa(c, cts, equipe) {
    if (!c) return ["", "Ficha não enviada"];
    if (c.status !== "habilitada") return STATUS_CASA[c.status] || ["", c.status];
    const e = etapaContratos(cts);
    if (e === "sem") return ["b-warn", "Habilitada · aguardando contrato"];
    if (e !== "assinado") return ETAPA_CT[e];
    if (!Array.isArray(equipe)) return ["b-good", "Habilitada · contrato assinado"];
    return TQEquipe.cobertura(equipe).completa ? ["b-good", "Pronta"] : ["b-serious", "Equipe incompleta"];
  }
  /** [classe, rótulo] da artista: status da inscrição e, depois de aprovada, o contrato. */
  function etapaArtista(i, cts) {
    if (!i) return ["", "Inscrição não enviada"];
    if (i.status !== "aprovada") return STATUS_INSC[i.status] || ["", i.status];
    const e = etapaContratos(cts);
    if (e === "sem") return ["b-good", "Aprovada · aguardando contrato"];
    return e === "assinado" ? ["b-good", "Pronta"] : ETAPA_CT[e];
  }
  const badgeEtapa = ([cl, t]) => `<span class="badge ${cl}">${esc(t)}</span>`;
  // Equipe do Tranquilo: contratos e equipe de uma casa ou artista a partir de S.eq.
  const kref = (x) => String(x || "").trim().toLowerCase();
  function contratosDaConta(E, userId, vinculo) {
    const ids = new Set([userId, ...(vinculo ? (E.perfis || []).filter((p) => kref(p.vinculo_nome) === kref(vinculo)).map((p) => p.id) : [])].filter(Boolean));
    return (E.contr || []).filter((c) => ids.has(c.user_id));
  }
  const etapaCasaEq = (E, c) => { const ref = c?.perfil?.vinculo_nome; return etapaCasa(c, contratosDaConta(E, c?.user_id, ref), E.eqc == null ? null : ref ? E.eqc.filter((m) => kref(m.casa_ref) === kref(ref)) : []); };
  const etapaArtistaEq = (E, i) => etapaArtista(i, contratosDaConta(E, i?.user_id, i?.perfil?.vinculo_nome));
  const textoContrato = (c) => c.status === "assinado" ? c.texto_final : TQContrato.preencher(c.texto, c.campos, Object.fromEntries(c.campos.map((x) => [x.chave, String(c.dados?.[x.chave] ?? "").trim() || "________________"])));
  // Cópia local dos dados do contrato que ainda não foram salvos (neste navegador), para não perder nada.
  const lerCtLocal = (id) => { try { return JSON.parse(store.get("tq-rascunho-ct-" + id) || "{}") || {}; } catch { return {}; } };
  // Contrato (pedido da Marina, 17/11/2026): o Tranquilo já manda assinado; a pessoa completa os dados, baixa o PDF,
  // assina (à mão ou gov.br) e envia o arquivo de volta. O envio marca o passo "contrato" da data sozinho.
  // Campo dos dados do contrato: cidade e estado com a mesma escolha da Ficha (estado, depois a cidade com busca).
  const rotuloCt = (x) => String(x.rotulo || x.chave).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  function campoCt(x, v) {
    const attr = `data-ct-dado="${esc(x.chave)}"`, r = rotuloCt(x);
    if (/^cidade/.test(r)) return cidadeUfHtml(attr, v);
    if (/^(estado|uf)\b/.test(r)) return ufSelectHtml(attr, v);
    return `<input ${attr} maxlength="300" value="${esc(v)}">`;
  }
  function telaContrato(c) {
    const si = TQContrato.situacao(c), conferido = !!c.conferido_em, assinado = c.status === "assinado" || conferido, env = arqsNovos(c), deNovo = ctPedidoDeNovo(c);
    const ant = assinado ? {} : dadosAnteriores(c), trazidos = c.campos.filter((x) => !String(c.dados?.[x.chave] ?? "").trim() && ant[x.chave]);
    const completo = !si.falta, n0 = c.campos.length ? 1 : 0, locCt = assinado ? {} : lerCtLocal(c.id);
    const passo = (n, titulo, corpo, feito) => `<div class="card"><h3 style="margin-top:0">${feito ? "✓ " : `${n}. `}${titulo}</h3>${corpo}</div>`;
    const arqTxt = (f) => `${esc(f.nome.replace(/^\d+-/, ""))}${f.em ? ` · ${dt(f.em.slice(0, 10))}` : ""}`;
    return `<button class="btn sm" data-ct-voltar>← Voltar</button><div class="tag" style="margin-top:12px">Contrato</div><h1>${esc(c.titulo)}</h1>
      ${conferido ? `<div class="alert good"><b>✓ Contrato assinado e conferido</b>A equipe do Tranquilo conferiu o arquivo que você enviou em ${new Date(c.conferido_em).toLocaleString("pt-BR")}. Não precisa fazer mais nada.<div class="barra-acoes" style="margin-top:10px">${arqsContrato(c)[0] ? `<a class="btn" href="#" data-arquivo="${esc(arqsContrato(c)[0].caminho)}">Ver o arquivo enviado</a>` : ""}<button class="btn" data-ct-ver="${c.id}">Baixar PDF</button></div></div>`
        : assinado ? `<div class="alert good"><b>Contrato assinado</b>Por ${esc(c.assinado_nome)} em ${new Date(c.assinado_em).toLocaleString("pt-BR")}.<div class="barra-acoes" style="margin-top:10px"><button class="btn" data-ct-ver="${c.id}">Baixar PDF</button></div></div>`
        : deNovo ? `<div class="alert crit" id="ctDeNovo"><b>Envie o contrato assinado de novo</b>A equipe do Tranquilo conferiu o arquivo que você mandou e pediu outro. O motivo: <q>${esc(c.devolvido_motivo || "")}</q> Corrija, assine e envie o arquivo novo no passo ${n0 + 2} abaixo.</div>`
        : env.length ? `<div class="alert good"><b>Contrato assinado enviado</b>${arqTxt(env[0])}. Está tudo certo: a equipe do Tranquilo já recebeu e vai conferir.</div>`
        : `<p class="sub">O contrato já vai assinado pelo Tranquilo. ${c.campos.length ? "Complete os seus dados, baixe" : "Baixe"} o PDF, assine (à mão ou pelo gov.br) e envie o arquivo assinado aqui.</p>`}
      ${!assinado && c.campos.length ? passo(1, "Seus dados", `<div class="grid g2">${c.campos.map((x) => `<label class="fcampo"><b>${esc(x.rotulo)} <span class="obrig">*</span></b>${campoCt(x, locCt[x.chave] ?? (c.dados?.[x.chave] || ant[x.chave] || ""))}</label>`).join("")}</div>
        ${Object.keys(locCt).length ? `<div class="alert" style="margin:8px 0"><b>Recuperamos o que você tinha digitado</b>Estava guardado neste aparelho e ainda não foi salvo. Confira e toque em "Salvar dados".</div>` : ""}
        ${trazidos.length ? `<div class="alert" style="margin:8px 0"><b>Trouxemos o que você já informou em outro contrato</b>${esc(trazidos.map((x) => x.rotulo).join(", "))}. Confira e toque em "Salvar dados".</div>` : ""}
        <div class="barra-acoes"><button class="btn${completo && !trazidos.length ? "" : " pri"}" id="ctSalvarDados">Salvar dados</button></div><div class="err" role="status" aria-live="polite" id="ctDadosMsg">${completo ? "✓ Feito: dados salvos." : ""}</div>`, completo) : ""}
      ${assinado ? "" : passo(n0 + 1, "Baixe o contrato", `<p class="muted" style="font-size:14px;margin:0 0 10px">${completo ? "O PDF já sai com os seus dados e a assinatura do Tranquilo." : "Salve os seus dados primeiro: eles entram no PDF."}</p><div class="barra-acoes"><button class="btn${completo && !env.length ? " pri" : ""}" data-ct-ver="${c.id}"${completo ? "" : " disabled"}>Baixar PDF</button></div>`)}
      ${assinado ? "" : passo(n0 + 2, "Assine e envie de volta", `<p class="muted" style="font-size:14px;margin:0 0 10px">Assine no campo indicado no PDF (à mão e escaneie ou fotografe, ou pelo gov.br) e envie o arquivo aqui. Aceita PDF ou foto.</p>
        <label class="fcampo"><b>${env.length ? "Enviar outra versão" : deNovo ? "Arquivo assinado novo" : "Arquivo assinado"}</b><input type="file" data-enviar-arquivo="contrato_${esc(c.id)}" accept=".pdf,.jpg,.jpeg,.png"${completo ? "" : " disabled"}></label>
        <div class="err" role="status" aria-live="polite" id="arqErr-contrato_${esc(c.id)}">${env.length ? "✓ Feito: contrato assinado recebido." : ""}</div>`, !!env.length)}
      <details class="card" id="ctTextoBox"><summary><b>Ver o texto do contrato</b> <span class="muted" style="font-size:13px;font-weight:400">· o mesmo do PDF</span></summary><div id="ctTexto" class="contr-texto" tabindex="0" aria-label="Texto do contrato" style="margin-top:10px">${esc(textoContrato(c))}</div></details>
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
        const m = $("#ctLido"); if (m) diz(m, "✓ Você leu até o fim. Agora dá para assinar."); const b = $("#ctAssinar"); if (b) b.disabled = false; }
      catch (e) { delete el.dataset.lido; const m = $("#ctErr"); if (m) diz(m, traduz(e.message)); }
    };
    el.addEventListener("scroll", fim, { passive: true });
    // Texto recolhido (details): só conta a leitura depois de abrir.
    const box = el.closest("details"); if (box && !box.open) { box.addEventListener("toggle", () => { if (box.open) fim(); }); return; }
    fim();
  }
  function abrirImpressao(c) {
    const w = window.open(URL.createObjectURL(new Blob([TQContrato.paginaImpressao(c, esc)], { type: "text/html;charset=utf-8" })), "_blank");
    if (!w) alert("O navegador bloqueou a janela. Permita janelas deste site e tente de novo.");
  }

  /** Central: publicar documentos para abrir dentro do portal, vários de uma vez (o nome do arquivo diz qual é). */
  function formDocsPagina() {
    return `<div class="card" style="margin:12px 0"><h2 style="margin-top:0">Publicar documentos para abrir na página</h2>
      <p class="muted" style="font-size:14px;margin:0 0 10px">Arraste os arquivos .html do Gui e do Bruno (vários de uma vez). Cada um vira uma versão nova, que abre na página para quem tem acesso. <b>Não troque o nome dos arquivos</b>: é por ele que o portal sabe qual documento é.</p>
      <label class="dp-zona" id="dpZona" for="dpArq"><span style="font-size:28px">⬆</span><b>Arraste os arquivos aqui</b><span class="muted" style="font-size:13px">ou clique para escolher no computador</span>
        <input type="file" id="dpArq" multiple accept=".html,.htm,text/html" style="position:absolute;width:1px;height:1px;opacity:0"></label>
      <div class="err" role="status" aria-live="polite" id="dperr"></div>
      <details style="margin-top:8px"><summary class="muted" style="font-size:13px">Nomes que o portal reconhece e versão manual</summary>
        <p class="muted" style="font-size:13px">${Object.entries(DOCS).map(([k, d]) => `<code>${esc(k)}.html</code> = ${esc(d.titulo)}`).join("<br>")}</p>
        <label class="fcampo"><b>Versão (opcional)</b><input id="dpVer" placeholder="em branco = a versão escrita no documento" value="${esc(S.dpVer || "")}"></label>
        <p class="muted" style="font-size:13px">Cada envio vira uma versão nova; as antigas ficam guardadas. O Plano de Ação e os Playbooks saem do portal quando os documentos novos do marketing entram.</p></details></div>`;
  }

  // Arrastar e soltar os .html na área de envio.
  for (const ev of ["dragover", "dragenter"]) document.addEventListener(ev, (e) => { const z = e.target.closest?.("#dpZona"); if (z) { e.preventDefault(); z.classList.add("sobre"); } });
  document.addEventListener("dragleave", (e) => { const z = e.target.closest?.("#dpZona"); if (z) z.classList.remove("sobre"); });
  document.addEventListener("drop", (e) => { const z = e.target.closest?.("#dpZona"); if (!z) return; e.preventDefault(); z.classList.remove("sobre"); if (e.dataTransfer?.files?.length) publicarDocsPagina(e.dataTransfer.files); });
  async function publicarDocsPagina(files) {
    const err = $("#dperr"), fixa = ($("#dpVer")?.value || "").trim(), hoje = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10).split("-").reverse().join("/");
    // Sem versão escrita: usa a que o próprio documento diz ("Versão 1.9"); se não disser, a data de hoje.
    const versaoDe = (html) => fixa || html.match(/Vers[ãa]o\s+(\d+(?:\.\d+)+)/i)?.[1] || hoje;
    const lista = [...files].map((f) => ({ f, slug: f.name.toLowerCase().replace(/\.html?$/, "").replace(/[^a-z0-9-]/g, "") }));
    const desconhecidos = lista.filter((x) => !DOCS[x.slug]).map((x) => x.f.name);
    if (desconhecidos.length) return diz(err, `Não reconheci ${desconhecidos.join(", ")}. Renomeie com um dos nomes da lista acima (ex.: briefing-anfitriao.html) e envie de novo. Nada foi publicado.`);
    const grandes = lista.filter((x) => x.f.size > 3900000).map((x) => x.f.name);
    if (grandes.length) return diz(err, `${grandes.join(", ")} passa de 3,9 MB, o limite do portal. Nada foi publicado.`);
    S.docsAberto = true; S.dpVer = fixa;
    const base = location.origin + location.pathname, feitos = [];
    try {
      for (const [i, x] of lista.entries()) {
        diz(err, `Publicando ${i + 1} de ${lista.length}: ${DOCS[x.slug].titulo}…`);
        const d = DOCS[x.slug], html = await x.f.text(), versao = versaoDe(html);
        await api.publicarDoc({ slug: x.slug, titulo: d.titulo, area: d.area, funcao: d.funcao, tipo: d.tipo, publico: ["casa"], fonte_url: base + "#/materiais",
          versao, resumo: "Abre dentro do portal", html, aposentar: d.area === "marketing" ? DOCS_APOSENTADOS : [] });
        feitos.push(`${d.titulo} (versão ${versao})`);
      }
      TQDiario.registrar("docs_publicados", { n: feitos.length });
      S.hub = null; await carregarHub(); render();
      diz($("#dperr"), `✓ ${feitos.length} ${feitos.length === 1 ? "documento publicado" : "documentos publicados"}: ${feitos.join("; ")}. Já abrem dentro do portal.`);
    } catch (e) {
      S.hub = null; await carregarHub().catch(() => {}); render();
      diz($("#dperr"), `Parou no documento ${feitos.length + 1} de ${lista.length}. ${feitos.length ? `Publicados: ${feitos.join("; ")}. ` : "Nada foi publicado. "}${traduz(e.message || "")}`);
    }
  }
  // ---------- documentos que abrem dentro do portal (pedido do Gui, 13/11/2026) ----------
  // Catálogo dos documentos que a Central publica pelo envio de .html (nome do arquivo = slug). O conteúdo fica no banco
  // (material_versoes.conteudo_html), nunca no repositório. Marketing: Bruno; Operações: Gui.
  const DOCS = {
    "guia-do-franqueado": { titulo: "Guia do Franqueado", area: "operacoes", tipo: "guia", desc: "Como a unidade funciona, os compromissos, a semana de cada evento e o fechamento" },
    "comece-por-aqui": { titulo: "Comece por aqui · O que é o Tranquilo", area: "marketing", tipo: "guia", desc: "O release, como é uma noite e a diferença entre o Apresenta e o #Descubra." },
    "semana-social-media": { titulo: "#Descubra · A semana do social media", area: "marketing", funcao: "social_media", tipo: "playbook", desc: "Dia a dia, do show à véspera do próximo, com os posts reais do perfil de São Paulo." },
    "semana-lideranca-local": { titulo: "#Descubra · A semana da liderança local", area: "marketing", funcao: "lider", tipo: "playbook", desc: "Dia a dia: comunidade, tripé e artistas, com a pergunta de cada dia." },
    "briefing-anfitriao": { titulo: "Briefing · Anfitrião da noite", area: "marketing", funcao: "anfitriao", tipo: "briefing", desc: "O roteiro, as falas e a conversa. No fim, o que muda entre o Apresenta e o #Descubra." },
    "briefing-fotografo": { titulo: "Briefing · Fotógrafo da noite", area: "marketing", tipo: "briefing", desc: "Os 3 vídeos, as fotos e a entrega. No fim, o que muda no #Descubra." },
    "modelos-marketing": { titulo: "Modelos · artes, briefings e mensagens prontas", area: "marketing", tipo: "template", desc: "Templates do Canva e do CapCut, briefings dos artistas e mensagens de WhatsApp pra copiar." },
    "como-briefar-artistas": { titulo: "Artistas · como briefar cada um", area: "marketing", tipo: "guia", desc: "Quando cada um recebe, a campanha do artista no Descubra e no Apresenta e o que volta pra você." },
  };
  // Documentos do marketing que saíram (Bruno, 11/2026): ficam inativos quando os novos são publicados.
  const DOCS_APOSENTADOS = ["plano-acao-rooftap", "playbook-descubra", "playbook-apresenta", "semana-lideranca-local-sp", "semana-social-media-sp"];
  // O que cada função lê no Marketing (o dono da casa vê todos).
  const DOCS_DA_FUNCAO = {
    lider: ["semana-lideranca-local", "como-briefar-artistas", "briefing-anfitriao", "briefing-fotografo", "modelos-marketing", "comece-por-aqui"],
    anfitriao: ["briefing-anfitriao", "comece-por-aqui"],
    social_media: ["semana-social-media", "modelos-marketing", "briefing-fotografo", "comece-por-aqui"],
  };
  // Versão mais recente com conteúdo (o documento abre na página) e a vigente (para link e ciência).
  const versaoComConteudo = (H, m) => m && (H?.versoes || []).find((v) => v.material_id === m.id && v.tem_conteudo);
  const MANUAIS = { "manual-apresenta-operacao": "Apresenta", "manual-descubra-operacao": "Descubra" };
  const MANUAIS_SLUG = { "Manual do Tranquilo Apresenta": "manual-apresenta-operacao", "Manual do Tranquilo Descubra": "manual-descubra-operacao" };
  /** Botão para ler um material: dentro da página quando há conteúdo; senão, pelo link (em outra aba). */
  function botaoLer(H, m, rotulo = "Ler") {
    if (!m) return '<span class="muted" style="font-size:13px">ainda não publicado</span>';
    if (MANUAIS[m.slug]) return `<button class="btn pri sm" data-manual="${esc(MANUAIS[m.slug])}">${esc(rotulo)}</button>`;
    if (versaoComConteudo(H, m)) return `<button class="btn pri sm" data-ler="${esc(m.slug)}">${esc(rotulo)}</button>`;
    const v = (H?.versoes || []).find((x) => x.material_id === m.id), url = v?.url || m.fonte_url;
    return url ? `<a class="btn sm" href="${escHref(url)}" target="_blank" rel="noopener">Abrir em outra aba ↗</a>` : '<span class="muted" style="font-size:13px">ainda não publicado</span>';
  }
  /** Cartão único de documento (Guia, manuais, documentos do marketing): título, descrição, versão e "Ler" na página. */
  function cartaoDoc(H, m, titulo, desc) {
    const v = versaoComConteudo(H, m) || (m && (H?.versoes || []).find((x) => x.material_id === m.id));
    return `<div class="card"><div class="row"><div><b>${esc(titulo || m?.titulo || "")}</b><div class="muted" style="font-size:13px">${esc(desc || DOCS[m?.slug]?.desc || "")}${v?.versao ? ` · versão ${esc(v.versao)}` : ""}</div></div>${botaoLer(H, m || (MANUAIS_SLUG[titulo] && { slug: MANUAIS_SLUG[titulo] }))}</div></div>`;
  }
  // Nome de leitura citado em texto (ex.: "“O anfitrião da noite”") vira link para o documento no mesmo leitor.
  const LEITURAS = [[/Guia do Franqueado/i, "guia-do-franqueado"], [/anfitri[ãa]o da noite/i, "briefing-anfitriao"], [/social media da noite/i, "semana-social-media"],
    [/Briefing do L[íi]der Local/i, "semana-lideranca-local"], [/Sobre o Tranquilo/i, "comece-por-aqui"]];
  function leituraComLink(x) {
    const m = /Manual (da noite|do Tranquilo)/i.test(x) ? ["manual", "Apresenta"] : (LEITURAS.find(([re]) => re.test(x)) || [])[1];
    if (!m) return esc(x);
    return Array.isArray(m) ? `<button class="link-doc" data-manual="${m[1]}">${esc(x)}</button>` : `<button class="link-doc" data-ler="${m}">${esc(x)}</button>`;
  }
  function abrirLeitor(alvo) {
    S.lendo = { ...alvo, aba: S.aba, sub: S.sub?.[S.aba], y: scrollY };
    TQDiario.registrar("leu_documento", { doc: alvo.slug || alvo.manual });
    render(); scrollTo(0, 0);
  }
  function fecharLeitor() { const y = S.lendo?.y || 0; S.lendo = null; render(); scrollTo(0, y); }
  // Página do documento: script pequeno que informa a altura (a página do portal rola, não o quadro), leva os
  // links internos (#seção) para a rolagem da página e abre outro documento do catálogo (#tq:slug) no mesmo leitor.
  // Todo documento (Guia do Gui, documentos do Bruno, manuais) abre com a mesma cara: o visual próprio de cada um
  // sai (estilos, menus laterais, rodapés) e entra o padrão de leitura do portal, com "Nesta página" no topo.
  const CSS_LEITURA = `:root{color-scheme:dark}*{box-sizing:border-box}
html,body{margin:0;background:#000201;color:#c3cddd;font:400 16px/1.7 "Lexend Deca",system-ui,sans-serif;-webkit-text-size-adjust:100%}
.tq-doc{max-width:760px;margin:0 auto;padding:36px 28px 72px;overflow-wrap:anywhere}
h1,h2,h3,h4{color:#e2edff;line-height:1.2;text-wrap:balance}
h1{font:900 clamp(30px,5.4vw,46px)/1.08 "Playfair Display",Georgia,serif;margin:6px 0 14px;letter-spacing:-.01em}
h2{font:700 clamp(22px,3.4vw,28px)/1.2 "Playfair Display",Georgia,serif;margin:52px 0 14px;padding-top:28px;border-top:1px solid #1d1f25;scroll-margin-top:24px}
h3{font-size:18px;font-weight:600;margin:28px 0 8px}
h4{font-size:12.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#8d96a6;margin:22px 0 8px}
p{margin:0 0 14px}ul,ol{margin:0 0 16px;padding-left:22px}li{margin:6px 0}li::marker{color:#7c8ff3}
strong,b{color:#e2edff;font-weight:600}em{color:#e2edff}
a{color:#a5b4fc;text-underline-offset:3px}a:hover{color:#c7d2fe}
hr{border:0;border-top:1px solid #1d1f25;margin:32px 0}
img,video{max-width:100%;height:auto;border-radius:12px;display:block;margin:10px 0}
.tq-tab{overflow-x:auto;margin:12px 0 22px;border:1px solid #1d1f25;border-radius:12px}table{width:100%;border-collapse:collapse;font-size:14.5px}
th,td{text-align:left;vertical-align:top;padding:10px 14px;border-bottom:1px solid #1d1f25}
th{background:#0b0c0f;color:#8d96a6;font-size:11.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
tr:last-child td{border-bottom:0}
blockquote,details,article,aside,.card,.aviso,.callout{display:block;background:#0b0c0f;border:1px solid #1d1f25;border-radius:14px;padding:14px 18px;margin:14px 0}
blockquote{border-left:3px solid #7c8ff3}
details summary{cursor:pointer;font-weight:600;color:#e2edff}details[open] summary{margin-bottom:8px}
pre{white-space:pre-wrap;background:#0b0c0f;border:1px solid #1d1f25;border-radius:12px;padding:12px 14px;font:13.5px/1.55 ui-monospace,Menlo,monospace}
code{font-family:ui-monospace,Menlo,monospace;font-size:.92em}
button.copiar{font:inherit;font-size:12.5px;font-weight:600;border:1px solid #2c2f37;background:none;color:#c3cddd;border-radius:999px;padding:3px 12px;cursor:pointer;margin:2px 0 10px}
.tq-toc{background:#0b0c0f;border:1px solid #1d1f25;border-radius:14px;padding:14px 20px;margin:18px 0 8px;font-size:14.5px}
.tq-toc b{display:block;font-size:11.5px;letter-spacing:.14em;text-transform:uppercase;color:#8d96a6;margin-bottom:6px}
.tq-toc ol{margin:0;padding-left:20px}.tq-toc li{margin:3px 0}.tq-toc a{color:#c3cddd;text-decoration:none}.tq-toc a:hover{color:#e2edff;text-decoration:underline}
section,header,main{display:block}
dl{margin:0 0 16px}dt{color:#e2edff;font-weight:600;margin-top:8px}dd{margin:2px 0 8px 0}
@media (max-width:600px){.tq-doc{padding:24px 16px 56px}}`;
  function padronizarDoc(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    doc.querySelectorAll("script,style,link,meta,nav,footer,iframe,object,embed,form,input,select,textarea,[hidden],[aria-hidden=\"true\"]").forEach((e) => e.remove());
    doc.querySelectorAll("aside").forEach((e) => { if (e.querySelector("ol a,ul a") && !e.querySelector("p")) e.remove(); });   // menu lateral
    doc.querySelectorAll("button:not(.copiar)").forEach((e) => e.remove());
    doc.querySelectorAll("[style]").forEach((e) => e.removeAttribute("style"));
    doc.querySelectorAll("[class]").forEach((e) => { if (!e.matches("button.copiar")) e.removeAttribute("class"); });
    // Sem o visual de origem, rótulos e valores que vinham lado a lado (ex.: "Objetivo" + texto, "Reels" + "8h") colam:
    // separa com dois-pontos, espaço ou ponto médio.
    const INL = "SPAN,STRONG,B,A,SMALL,EM,I,TIME,CODE,MARK";
    doc.body.querySelectorAll(INL.toLowerCase()).forEach((el) => {
      const prox = el.nextSibling;
      if (!prox || /\s$/.test(el.textContent) || !el.textContent.trim()) return;
      const txt = prox.nodeType === 3 ? prox.textContent : prox.nodeType === 1 && INL.includes(prox.tagName) ? prox.textContent : null;
      if (txt == null || !txt.trim() || /^[\s.,;:!?)]/.test(txt)) return;
      const rotulo = /^(STRONG|B)$/.test(el.tagName) && !el.previousSibling?.textContent?.trim() && !/[:.!?]$/.test(el.textContent.trim());
      el.after(doc.createTextNode(rotulo ? ": " : prox.nodeType === 1 && el.tagName === "A" && prox.tagName === "A" ? " · " : " "));
    });
    const corpo = doc.querySelector("main") || doc.body;
    corpo.querySelectorAll("table").forEach((t) => { const w = doc.createElement("div"); w.setAttribute("class", "tq-tab"); t.replaceWith(w); w.append(t); });
    // Sumário "Nesta página" a partir dos títulos de seção, quando há mais de dois.
    const h2s = [...corpo.querySelectorAll("h2")];
    h2s.forEach((h, i) => { if (!h.id) h.id = "secao-" + (i + 1); });
    const toc = h2s.length > 2 ? `<div class="tq-toc"><b>Nesta página</b><ol>${h2s.map((h) => `<li><a href="#${h.id}">${esc(h.textContent.replace(/\s+/g, " ").trim())}</a></li>`).join("")}</ol></div>` : "";
    // O sumário entra logo depois do título principal (ou no começo).
    let miolo = corpo.innerHTML;
    const h1 = corpo.querySelector("h1");
    if (toc && h1) { const marca = "<!--tq-toc-->"; h1.insertAdjacentHTML("afterend", marca); miolo = corpo.innerHTML.replace(marca, toc); }
    else miolo = toc + miolo;
    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=Lexend+Deca:wght@400;600;700&display=swap">
<style>${CSS_LEITURA}</style></head><body><div class="tq-doc">${miolo}</div></body></html>`;
  }
  function paginaDoc(html, chave) {
    html = padronizarDoc(html);
    const ajuda = `<base target="_blank"><script>(function(){var K=${JSON.stringify(chave)};function alt(){parent.postMessage({tqDoc:K,altura:Math.max(document.documentElement.scrollHeight,document.body?document.body.scrollHeight:0)},"*")}
addEventListener("load",alt);setTimeout(alt,400);setTimeout(alt,1500);if(window.ResizeObserver)new ResizeObserver(alt).observe(document.documentElement);
document.addEventListener("click",function(e){var b=e.target.closest&&e.target.closest("button.copiar[data-copiar]");if(b){e.preventDefault();e.stopImmediatePropagation();parent.postMessage({tqDoc:K,copiar:b.getAttribute("data-copiar")},"*");var o=b.textContent;b.textContent="copiado";setTimeout(function(){b.textContent=o},1400);return}
var a=e.target.closest&&e.target.closest("a");if(!a)return;var h=a.getAttribute("href")||"";
if(h.indexOf("#tq:")===0){e.preventDefault();parent.postMessage({tqDoc:K,abrir:h.slice(4)},"*");return}
if(h==="#"){e.preventDefault();return}
if(h.charAt(0)==="#"){e.preventDefault();var id=decodeURIComponent(h.slice(1)),el=document.getElementById(id)||document.getElementsByName(id)[0];if(el)parent.postMessage({tqDoc:K,rolar:el.getBoundingClientRect().top+(window.scrollY||0)},"*")}},true)})();<\/script>`;
    return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (h) => h + ajuda) : ajuda + html;
  }
  addEventListener("message", (ev) => {
    const d = ev.data, L = S.lendo, f = document.getElementById("leitorDoc");
    if (!d || !L || !f || d.tqDoc !== L.slug || ev.source !== f.contentWindow) return;
    if (d.altura) f.style.height = Math.max(400, Math.min(d.altura + 24, 200000)) + "px";
    if (d.rolar != null) scrollTo({ top: f.getBoundingClientRect().top + scrollY + d.rolar - 70, behavior: "smooth" });
    if (d.abrir && DOCS[d.abrir]) { S.lendo = null; abrirLeitor({ slug: d.abrir }); }
    if (typeof d.copiar === "string") navigator.clipboard?.writeText(d.copiar).catch(() => {});
  });
  /** Tela do leitor: o documento inteiro dentro da página, com Voltar. */
  function leitor() {
    const L = S.lendo, H = S.hub;
    const voltar = `<button class="btn sm" data-ler-voltar>← Voltar</button>`;
    if (L.manual) {
      L.slug ||= "manual-" + L.manual.toLowerCase();
      L.html ??= `<main><h1>Manual do Tranquilo ${esc(L.manual)}</h1><p>Cronograma hora a hora, rider, camarim e funções da equipe.</p>${TQOperacao.manual(L.manual).replace(/<div class="card">\s*<h2[^>]*>/g, "<h2>").replace(/<\/div>\s*(?=<div class="card">|<p class="muted")/g, "")}</main>`;
      return quadroLeitura(L, `Manual do Tranquilo ${L.manual}`, "versão " + TQOperacao.VERSAO, voltar, "");
    }
    if (!H) { carregarHub(); return carregando("o documento"); }
    const m = (H.materiais || []).find((x) => x.slug === L.slug), v = versaoComConteudo(H, m), cat = DOCS[L.slug] || {};
    if (!m || !v) return `<div class="barra-acoes" style="margin-bottom:12px">${voltar}</div><div class="alert warn"><b>⚠ Atenção: este documento ainda não foi publicado no portal.</b>Avise a equipe do Tranquilo pelo grupo da unidade.</div>`;
    if (L.html === undefined) {
      if (!L.carregando) { L.carregando = true; api.conteudoVersao(v.id).then((h) => { if (S.lendo === L) { L.html = h || ""; render(); } })
        .catch((e) => { if (S.lendo === L) { L.html = ""; L.erro = traduz(e.message || ""); render(); } }); }
      return `<div class="barra-acoes" style="margin-bottom:12px">${voltar}</div>${carregando(m.titulo)}`;
    }
    if (!L.html) return `<div class="barra-acoes" style="margin-bottom:12px">${voltar}</div><div class="alert crit"><b>✕ Erro: o documento não abriu.</b>${esc(L.erro || "O conteúdo veio vazio.")} Tente de novo em instantes.</div>`;
    const vig = (H.versoes || []).find((x) => x.material_id === m.id), pend = vig?.exige_ciencia && (H.pendentes || []).some((p) => p.versao_id === vig.id);
    return quadroLeitura(L, m.titulo, "versão " + v.versao, voltar,
      pend ? `<div class="alert warn" style="margin-top:12px"><b>Leia e confirme</b>Esta versão muda o que a casa faz.<div class="barra-acoes" style="margin-top:8px"><button class="btn pri" data-ciencia="${vig.id}">Li e estou ciente</button></div></div>` : "");
  }
  // Moldura única de leitura: barra com Voltar, título e versão; o documento no padrão do portal; Voltar no fim.
  function quadroLeitura(L, titulo, versao, voltar, depois) {
    queueMicrotask(() => { const f = document.getElementById("leitorDoc"); if (f && !f.dataset.pronto) { f.dataset.pronto = "1"; f.srcdoc = paginaDoc(L.html, L.slug); } });
    return `<div class="leitor-barra">${voltar}<div><b>${esc(titulo)}</b><span class="muted">${esc(versao)}</span></div></div>
      <iframe id="leitorDoc" title="${esc(titulo)}" sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox" class="leitor-doc"></iframe>
      ${depois}<div class="barra-acoes" style="margin-top:16px">${voltar}</div>`;
  }

  const TELAS = {
    ...Object.fromEntries(Object.keys(GRUPOS_EQ).map((g) => [g, () => telaGrupo(g)])),
    ficha: () => telaArea("ficha"), operacoes: () => telaArea("operacoes"), datas_casa: () => telaArea("datas_casa"), marketing: () => telaArea("marketing"), art_mkt: () => telaArea("art_mkt"), equipe_g: () => telaArea("equipe_g"), disp_g: () => telaArea("disp_g"), contr_g: () => telaArea("contr_g"),
    passos() {
      const p = S.conta.perfil;
      const aberto = S.contrAberto && meusContratos().find((c) => c.id === S.contrAberto);
      if (aberto) return telaContrato(aberto);
      // A pendência mais importante primeiro (pedido da Marina, 18/11/2026): contrato para assinar ou devolvido, depois a trilha.
      return cartaoPropostas() + avisoContratos() + blocoTrilha() + (p.tipo === "casa" ? passosCasa() : passosArtista());
    },
    inscricao() {
      const i = S.conta.insc, trav = i && !["rascunho", "ajustes"].includes(i.status), rec = trav ? null : recuperarLocal(i?.dados || {}), d0 = rec || i?.dados || {};
      // Inscrição nova já nasce com o que a equipe mandou junto com o convite (pré-ficha pelo Notion, proposta pendente).
      const sugConv = trav ? {} : Object.fromEntries(doConvitePP("artista").filter(([k, v]) => F_ARTISTA.some(([, cs]) => cs.some((c) => c[0] === k)) && PP()?.vazio(d0[k]) === true && !PP().vazio(v)));
      // O nome artístico digitado ao criar a conta já vem na inscrição (não pede duas vezes).
      const d = { ...(trav || d0.nome_artistico ? {} : { nome_artistico: S.conta.perfil.nome || "" }), ...d0, ...sugConv };
      return `<div class="tag">Inscrição de artista</div><h1>${trav ? "Sua inscrição" : "Inscreva-se na rede"}</h1>
      <p class="sub">${trav ? "Sua inscrição está com a equipe. Você pode consultar as respostas e preencher o que ficou vazio; o que já foi respondido só muda se a curadoria pedir ajustes." : "Leva uns 10 minutos. O rascunho fica salvo e você pode voltar depois. Ao enviar, a pré-curadoria é automática e o resultado aparece na hora."}</p>
      ${i?.parecer && i.status === "ajustes" ? `<div class="alert warn"><b>A curadoria pediu ajustes</b>${esc(i.parecer)}</div>` : ""}
      ${rec || (!trav && S.recuperado === S.conta.perfil.id) ? avisoRecuperado : ""}
      ${Object.keys(sugConv).length ? `<div class="alert" id="sugConvite"><b>Já deixamos preenchido o que o Tranquilo sabe de você</b>Confira e corrija se precisar: ${esc(Object.keys(sugConv).map((k) => F_ARTISTA.flatMap(([, cs]) => cs).find((c) => c[0] === k)?.[1] || k).join(", "))}. Só fica salvo quando você salvar ou enviar.</div>` : ""}
      <div id="medidor">${medidor(R.preCuradoria(d))}</div>
      <div id="form" data-editavel="${trav ? "" : "1"}" style="display:flex;flex-direction:column;gap:12px;margin-top:12px">${formHtml(F_ARTISTA, d, trav ? (i.status === "encerrada" ? true : "vazios") : false)}</div>
      <section class="card fsec" style="margin-top:12px" id="dispFicha"><h3>Disponibilidade: dias em que você pode tocar</h3>${calendarioArtista()}</section>
      ${trav ? (i.status === "encerrada" ? "" : `<div class="err" role="status" aria-live="polite" id="ferr"></div><div class="barra-acoes">${comExplica(`<button class="btn pri" id="salvarVazios">Salvar os campos que estavam em branco</button>`, "Vale só para o que você ainda não tinha respondido e já chega à curadoria. O que já foi respondido só muda se a curadoria pedir ajustes.")}</div>`) : `<div class="err" role="status" aria-live="polite" id="ferr"></div><div class="barra-acoes">${botaoEnviar(pendenciasForm(F_ARTISTA, d), "Enviar para a curadoria", "A pré-curadoria sai na hora. Depois a equipe do Tranquilo avalia e responde aqui, em Próximos passos.")}${comExplica(`<button class="btn" id="salvar">Salvar rascunho</button>`, "Guarda para você continuar depois. Ainda não vai para a curadoria.")}</div>`}`;
    },
    cadastro_casa() {
      const c = S.conta.casa, parceira = S.casaParceira ?? !!c?.ja_parceira;
      // Só casas com nome real; quem não se acha usa "Minha casa não aparece".
      const casasConhecidas = (S.pub.casas || []).filter((x) => !/^Casa (em|da rede)\b/.test(x.nome)).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
      // Ficha enviada ao Tranquilo não muda em silêncio: a casa pede a atualização e a Central confere.
      const enviada = !!c && ["em_analise", "habilitada", "suspensa"].includes(c.status), pedindo = enviada && S.fichaPedido, travado = enviada && !pedindo;
      const rec = enviada ? null : recuperarLocal(c?.dados || {}), d = rec || c?.dados || {};
      // "Já deixamos preenchido o que você nos contou" (Ficha v1): o que a base Casas do Notion tem e a ficha ainda não.
      // E o que a equipe mandou junto com o convite (pré-ficha pelo Notion, proposta pendente): a Ficha já nasce preenchida.
      const sug = enviada ? {} : Object.fromEntries([...doConvitePP("casa"), ...Object.entries(S.pac?.ficha_notion || {})].filter(([k, v]) => CHAVES_FICHA.has(k) && v != null && v !== "" && !(Array.isArray(v) && !v.length) && [null, undefined, ""].includes(valorCasa(d, k))));
      const sols = S.conta.sol || [], aberto = sols.find((x) => x.status === "pendente");
      const ultimaRecusa = [...sols].filter((x) => x.status !== "cancelada").sort((x, y) => String(y.criado_em).localeCompare(String(x.criado_em)))[0];
      const pend = semDiasSemana(c?.pendencias || R.pendenciasCasa(d));
      const rotulo = (k) => F_CASA.flatMap(([, , cs]) => cs).find((x) => x[0] === k)?.[1] || ROTULO_ANTIGO[k] || k;
      const mostra = (k, v) => Array.isArray(v) ? v.join(", ") : k === "som" && SOM_ANTIGO[v] ? SOM_ANTIGO[v] : v === "true" ? "Sim" : v === "false" ? "Não" : String(v);
      const usadosNaFicha = new Set(Object.entries(F_CASA_ANTIGO).filter(([novo]) => !d[novo]).map(([, ant]) => ant).concat(d.cidade_uf ? [] : ["cidade", "estado"]));
      const extras = Object.entries(d).filter(([k, v]) => !CHAVES_FICHA.has(k) && !usadosNaFicha.has(k) && v != null && v !== "" && !(Array.isArray(v) && !v.length));
      return `<div class="tag">Ficha da Casa</div><h1>${esc(d.nome || S.conta.perfil.vinculo_nome || "Ficha da casa")}</h1>
      <p class="sub">Esta Ficha é só da sua casa. Primeiro, um resumo de como a sua unidade vai funcionar. Depois, os dados da casa e da equipe, junto com as suas dúvidas sobre o Guia do Franqueado. ${enviada ? "A ficha já está com o Tranquilo. Campo em branco você preenche direto; para mudar uma resposta já enviada, use \"Pedir para mudar uma resposta já enviada\", no fim da página." : "O que você preenche fica salvo; pode parar e voltar depois."}</p>
      <div class="row" style="margin-bottom:10px"><span>${c ? badgeEtapa(etapaCasa(c, meusContratos(), S.conta.equipe ?? null)) : '<span class="badge">ainda não enviada</span>'}</span><button class="btn sm" data-ler="guia-do-franqueado">Ler o Guia do Franqueado</button></div>
      ${c?.status === "encerrada" ? `<div class="alert crit"><b>Parceria encerrada ${A_VALIDAR_HTML}</b>${esc(c.parecer || "")} A Ficha e o histórico ficam guardados. Dúvidas: fale com a Operações.</div>`
        : c?.parecer ? `<div class="alert ${c.status === "ajustes" ? "warn" : ""}"><b>Mensagem da equipe</b>${esc(c.parecer)}</div>` : ""}
      ${c?.status === "habilitada" && R.pendenciasCasa(d).habilitacao.includes(R.NOVA_EXIGENCIA) ? `<div class="alert warn"><b>Nova exigência: ${esc(R.NOVA_EXIGENCIA.toLowerCase())}</b>O público do Tranquilo assiste sentado no chão. A casa continua habilitada; informe a capacidade em "Pedir para mudar uma resposta já enviada", no fim da página.</div>` : ""}
      ${aberto ? `<div class="alert warn"><b>Pedido de atualização com a Central desde ${dt(aberto.criado_em.slice(0, 10))}</b>Campos: ${esc(Object.keys(aberto.proposto).map(rotulo).join(", "))}. A ficha muda quando a Central aprovar.<div class="barra-acoes" style="margin-top:8px"><button class="btn sm" data-sol-cancelar="${aberto.id}">Cancelar o pedido</button></div></div>` : ""}
      ${ultimaRecusa?.status === "recusada" ? `<div class="alert crit"><b>Pedido de atualização recusado em ${dt(String(ultimaRecusa.revisado_em || ultimaRecusa.criado_em).slice(0, 10))}</b>${ultimaRecusa.resposta ? "Resposta da Central: " + esc(ultimaRecusa.resposta) : "A Central não deixou resposta."} A ficha continua como estava.</div>` : ""}
      ${pedindo ? `<div class="alert warn"><b>Você está pedindo uma atualização</b>Altere os campos abaixo, diga o motivo e toque em "Enviar o pedido ao Gui", no fim da página. A ficha só muda quando o Gui (Operações) aprovar.${aberto ? " Este pedido substitui o que já está com a Central: as mudanças dele já estão nos campos." : ""}</div>` : ""}
      ${parteUmCasa(c)}
      <h2>Parte 2 · Para preencher</h2>
      ${rec || (!enviada && S.recuperado === S.conta.perfil.id) ? avisoRecuperado : ""}
      ${Object.keys(sug).length ? `<div class="alert"><b>Já deixamos preenchido o que temos da sua casa</b>Confira e corrija se precisar: ${esc(Object.keys(sug).map((k) => F_CASA.flatMap(([, , cs]) => cs).find((x) => x[0] === k)?.[1] || k).join(", "))}. Só fica salvo na sua Ficha quando você salvar ou enviar.</div>` : ""}
      ${dobra("ficha-falta", "O que falta na Ficha", pend.habilitacao.length + pend.match.length + pend.enriquecimento.length ? `${pend.habilitacao.length} para habilitar · ${pend.match.length} para montar a noite · ${pend.enriquecimento.length} para deixar completa` : "✓ Nada pendente",
        `<div class="grid g3" style="margin:0">${[["habilitacao", "Falta para habilitar", "b-crit"], ["match", "Falta para montar a noite", "b-warn"], ["enriquecimento", "Deixa a ficha completa", ""]].map(([k, t, cl]) => `<div class="card"><b>${t}</b>${k === "habilitacao" ? " " + A_VALIDAR_HTML : ""} <span class="badge ${cl}">${pend[k].length}</span><div class="muted" style="font-size:13px;margin-top:4px">${pend[k].map(esc).join(" · ") || "Nada pendente"}</div></div>`).join("")}</div>`)}
      ${enviada ? "" : `<div class="card"><b>A casa já recebe o Tranquilo?</b><div class="filters" style="margin-bottom:0"><label class="fcheck"><input type="radio" name="parceira" value="nao"${!parceira ? " checked" : ""}> Casa nova na rede</label><label class="fcheck"><input type="radio" name="parceira" value="sim"${parceira ? " checked" : ""}> Já recebo datas do Tranquilo</label>
      ${parceira ? `<select id="casaNotion" aria-label="Escolha a sua casa"><option value="">Escolha a casa</option>${casasConhecidas.map((x) => `<option value="${x.id}"${c?.notion_casa_id === x.id ? " selected" : ""}>${esc(x.nome)} · ${esc(x.cidade)}</option>`).join("")}<option value="outra">Minha casa não aparece na lista</option></select>` : ""}</div></div>`}
      <div id="form" data-modo="${pedindo ? "pedido" : travado ? "leitura" : "edicao"}" data-editavel="${enviada ? "" : "1"}" style="display:flex;flex-direction:column;gap:12px;margin-top:12px">${formCasa(pedindo && aberto ? { ...d, ...aberto.proposto } : { ...d, ...sug }, ["suspensa", "encerrada"].includes(c?.status) ? true : travado ? "vazios" : false)}</div>
      ${extras.length ? `<details class="card fsec" style="margin-top:12px"><summary><b>Outras informações já enviadas (${extras.length})</b></summary><p class="muted" style="margin:6px 0 10px;font-size:14px">Respostas de uma versão anterior da ficha. Ficam guardadas aqui.</p><dl class="kv">${extras.map(([k, v]) => `<dt>${esc(rotulo(k))}</dt><dd>${esc(mostra(k, v))}</dd>`).join("")}</dl></details>` : ""}
      <div class="err" role="status" aria-live="polite" id="ferr"></div>
      ${!enviada ? `<div class="barra-acoes">${botaoEnviar(pendenciasForm(F_CASA, dadosVistos(F_CASA, { ...d, ...sug })), "Enviar a Ficha ao Tranquilo", "Vai para o Gui (Operações) conferir e habilitar a casa. Depois de enviada, o que você respondeu só muda por pedido.")}${comExplica(`<button class="btn" id="salvar">Salvar rascunho</button>`, "Guarda para você continuar depois. Ainda não vai para a análise do Tranquilo.")}${botaoCopiaFicha}</div>`
        : pedindo ? `<label class="fcampo" style="margin-top:12px"><b>O que mudou e por quê <span class="muted">*</span></b><textarea id="solMsg" rows="2" maxlength="1000"></textarea><div class="muted" style="font-size:12px;margin-top:3px">Pelo menos 10 caracteres. É o que a Central lê para aprovar.</div></label><div class="barra-acoes">${comExplica(`<button class="btn pri" id="solEnviar">Enviar o pedido ao Gui</button>`, "A Ficha só muda quando o Gui (Operações) aprovar. A resposta aparece aqui.")}${comExplica(`<button class="btn ghost" id="solVoltar">Desistir do pedido</button>`, "Nada é enviado. A Ficha continua como está.")}</div>`
        : ["suspensa", "encerrada"].includes(c.status) ? "" : `<div class="barra-acoes">${comExplica(`<button class="btn pri" id="salvarVazios">Salvar os campos que estavam em branco</button>`, "Vale só para o que você ainda não tinha respondido. Já chega ao Tranquilo, sem precisar de aprovação.")}${comExplica(`<button class="btn" id="solPedir">Pedir para mudar uma resposta já enviada</button>`, "Você corrige os campos e diz o motivo. Vai para o Gui (Operações) aprovar antes de valer.")}${botaoCopiaFicha}</div>`}
      ${sols.length ? `<details style="margin-top:14px"><summary>Pedidos de atualização (${sols.length})</summary><ul class="passos">${sols.map((x) => `<li><b>${dt(x.criado_em.slice(0, 10))}</b> · ${esc({ pendente: "com a Central", aprovada: "aprovado", recusada: "recusado", cancelada: "cancelado" }[x.status])} · ${esc(Object.keys(x.proposto).map(rotulo).join(", "))}${x.resposta ? `<br><span class="muted" style="font-size:13px">Resposta: ${esc(x.resposta)}</span>` : ""}</li>`).join("")}</ul></details>` : ""}
      <p class="muted" style="font-size:13px;margin-top:14px">Esta Ficha resume as condições da sua unidade. Em qualquer diferença, vale o contrato assinado.</p>`;
    },
    conta() {
      const p = S.conta.perfil;
      const podeVincular = !p.codigo_acesso && !p.vinculo_pedido && !S.pac;
      return `<div class="tag">Conta</div><h1>${esc(p.nome || p.email)}</h1>
      <div class="card"><dl class="kv"><dt>E-mail</dt><dd>${esc(p.email)}</dd><dt>Perfil</dt><dd>${ROTULO[p.tipo]}${funcoesDe() ? ` · ${esc(nomesFuncoes(funcoesDe()))}` : ""}</dd><dt>Vínculo na rede</dt><dd>${p.vinculo_nome ? `${esc(p.vinculo_nome)} <span class="badge b-good">métricas liberadas</span>` : p.vinculo_pedido_nome ? `${esc(p.vinculo_pedido_nome)} <span class="badge b-warn">aguardando a equipe confirmar</span> <span class="muted" style="font-size:13px">as métricas já aparecem enquanto isso</span>` : `<span class="muted">ainda sem vínculo</span>`}</dd>
      ${!REAL ? `<dt>Modo</dt><dd><span class="badge b-warn">demonstração</span> os dados ficam só neste navegador</dd>` : ""}</dl></div>
      ${podeVincular ? `<h2>Tenho um código de acesso</h2><p class="sub">Se a equipe já te mandou um código (aquele XXXX-XXXX-XXXX), cole aqui para ligar esta conta ao seu histórico e às métricas da rede. Basta fazer isso uma vez.${["equipe", "adm"].includes(p.tipo) ? " Para a equipe e a administração, use o código interno de vocês." : ""}</p><div class="card login"><input id="vcod" placeholder="XXXX-XXXX-XXXX" autocomplete="off"><div class="err" role="status" aria-live="polite" id="verr"></div>${comExplica(`<button class="btn pri" id="vok">Ligar a conta ao meu histórico</button>`, "Basta uma vez. Depois disso o seu histórico e as métricas aparecem aqui.")}</div>` : ""}
      <div class="barra-acoes" style="margin-top:20px">${comExplica(`<button class="btn" data-mudar-senha>Mudar a senha</button>`, "Você escolhe a nova aqui mesmo. Vale no próximo acesso.")}${comExplica(`<button class="btn" data-rever-tutorial>Ver o tutorial de novo</button>`, "Mostra de novo o passo a passo desta área. Não muda nada.")}${comExplica(`<button class="btn ghost" id="sairConta">Sair da conta</button>`, "Para entrar de novo, use o seu e-mail e senha.")}</div>`;
    },
    // ---------- equipe da casa por função e trilha da nova casa ----------
    equipe_casa() {
      const L = S.conta.equipe, dono = !funcoesDe(), p = S.conta.perfil;
      if (!p.vinculo_nome) return `<div class="tag">Equipe da casa</div><h1>Quem faz a noite</h1>${vazio("A conta ainda não está ligada à casa", "Quando a equipe do Tranquilo ligar esta conta à sua casa (pelo convite ou em Pessoas), você monta a equipe aqui.", "", "equipe_casa")}`;
      if (L === undefined) { carregarEquipeCasa(); return carregando("a equipe da casa"); }
      if (L === null) return faltaSchema("Equipe da casa");
      const cob = TQEquipe.cobertura(L), ed = dono && L.find((m) => m.id === S.eqcEd), novo = ed ? null : S.eqcNovo ?? null;
      const ACESSO = { ativo: ["b-good", "com acesso"], convidado: ["b-warn", "convite enviado"], sem_convite: ["", "sem acesso à plataforma"], sem_email: ["", "sem e-mail"] };
      const pessoa = (m, r) => `<div class="eqlin-pessoa"><span><b>${esc(m.nome)}</b>${r.k === "reserva" ? ` <span class="muted">· ${esc(nomesFuncoes(m.funcoes))}</span>` : m.reserva ? ' <span class="badge">reserva</span>' : ""}
        <span class="muted eqlin-contato">${esc([m.whatsapp, m.email].filter(Boolean).join(" · ") || "sem contato")}${dono && m.acesso ? ` · <span class="badge ${ACESSO[m.acesso]?.[0] || ""}">${ACESSO[m.acesso]?.[1] || ""}</span>` : ""}</span>
        ${TQEquipe.funcoesAvisos(m.funcoes).map((a) => `<span class="muted eqlin-contato">⚠️ ${esc(a)}</span>`).join("")}</span>
        ${dono ? `<span class="eqlin-acoes">${(m.funcoes || []).includes("bar") ? `<span class="muted" style="font-size:12px">Bar sem acesso ao portal ${A_VALIDAR_HTML}</span>` : m.email && m.acesso !== "ativo" ? `<button class="btn sm" data-eqc-convidar="${m.id}">${m.acesso === "convidado" ? "Reenviar convite" : "Dar acesso"}</button>` : ""}<button class="btn sm" data-eqc-editar="${m.id}">Editar</button><button class="btn sm" data-eqc-remover="${m.id}">Tirar da equipe</button></span>` : ""}</div>`;
      // O formulário abre dentro da linha da função (Adicionar/Editar); "+ Adicionar mais um membro" abre embaixo da lista.
      const linhas = linhasCasaEq(), formK = !dono ? null : ed ? (ed.reserva ? "reserva" : (ed.funcoes || []).find((f) => linhas.some((r) => r.k === f)) || "") : novo != null ? (linhas.some((r) => r.k === novo) ? novo : "") : null;
      const formHtml = formK == null ? "" : `<div class="card" id="eqcForm"><h3 style="margin-top:0">${ed ? `Editar ${esc(ed.nome)}` : novo ? `Adicionar ${esc(TQEquipe.CURTO[novo] || "pessoa")}` : "Adicionar mais um membro"}</h3>
        <div class="fgrid"><label class="fcampo"><b>Nome</b><input id="eqcNome" maxlength="120" value="${esc(ed?.nome || "")}"></label><label class="fcampo"><b>WhatsApp</b><input id="eqcWa" inputmode="tel" maxlength="30" value="${esc(ed?.whatsapp || "")}"></label>
        <label class="fcampo"><b>E-mail (opcional, para dar acesso)</b><input id="eqcEmail" type="email" maxlength="160" value="${esc(ed?.email || "")}"></label>
        <label class="fcampo"><b>Instagram (anfitrião e social media)</b><input id="eqcInsta" maxlength="80" placeholder="@" value="${esc(ed?.instagram || "")}"></label>
        <label class="fcampo"><b>Observação</b><input id="eqcObs" maxlength="300" value="${esc(ed?.observacao || "")}"></label></div>
        <b style="font-size:14px">Função${novo === "reserva" || ed?.reserva ? " (a reserva também tem uma função)" : ""}</b><div class="filters" style="margin:6px 0">${TQEquipe.FUNCOES.map(([k, n]) => `<label class="fcheck"><input type="radio" name="eqcFuncao" data-eqc-funcao="${k}"${(ed ? ed.funcoes?.includes(k) : novo === k) ? " checked" : ""}> ${esc(n)}</label>`).join("")}</div>
        <label class="fcheck"><input type="checkbox" id="eqcReserva"${(ed ? ed.reserva : novo === "reserva") ? " checked" : ""}> <span>Reserva: cobre quem faltar na semana do evento</span></label>
        <p class="muted" style="font-size:12px;margin:6px 0 0">Cada função é de uma pessoa diferente. Se você mesmo for o Líder Local, cadastre-se sem e-mail (você já tem a conta da casa). O bar é responsabilidade sua; o Tranquilo não fala com a equipe de bar.</p>
        <div class="barra-acoes"><button class="btn pri" id="eqcOk">${ed ? "Salvar" : "Adicionar à equipe"}</button><button class="btn" data-eqc-editar="">Cancelar</button></div></div>`;
      const outros = L.filter((m) => !m.reserva && !(m.funcoes || []).some((f) => TQEquipe.CHAVES.includes(f)));
      return `<div class="tag">Equipe da casa</div><h1>Quem faz a noite</h1>
      <p class="sub">${dono ? "Você monta a equipe e responde por ela: a Central não contrata nem escala. Quem tiver e-mail ganha acesso à plataforma só com o que é da função dela." : "A equipe da casa, montada pelo responsável. Só ele muda as funções."} Cada função com uma pessoa diferente (só ${dono ? "você" : "o dono"} pode ser também o Líder Local), e 1 reserva para a noite. Toque numa função para ver o que ela faz.</p>
      <div class="alert ${cob.completa ? "good" : "warn"}" id="eqcFalta"><b>${cob.completa ? "✓ Equipe completa" : fraseEquipe(cob)}</b>${cob.completa ? "" : esc([...(TQEquipe.faltando(cob).length ? [`${TQEquipe.listaFalta(cob)}.`] : []), ...cob.erros].join(" · "))}${!cob.completa && dono ? `<div class="muted" style="font-size:13px;margin-top:4px">A Disponibilidade da casa libera quando a equipe estiver completa.</div>` : ""}</div>
      ${listaEquipe(L, linhas, { chave: "eqc", dono, pessoa, form: formK ? { k: formK, html: formHtml } : null })}
      ${outros.length ? `<div class="eqlista" style="margin-top:8px">${outros.map((m) => pessoa(m, { k: "" })).join("")}</div>` : ""}
      ${dono ? `<div class="barra-acoes" style="margin-top:10px"><button class="btn" data-eqc-nova="">+ Adicionar mais um membro</button></div>` : ""}
      ${formK === "" ? formHtml : ""}
      ${dono ? `<div class="err" role="status" aria-live="polite" id="eqcErr"></div>` : ""}`;
    },
    // ---------- administração: histórico de alterações (v17) ----------
    historico() {
      if (S.hist === undefined) { S.hist = null; api.historico().then((h) => { S.hist = h; render(); }).catch((e) => { S.hist = { erro: traduz(e.message || "") }; render(); }); }
      if (!S.hist) return carregando("o histórico");
      if (S.hist.erro) return `<div class="tag">Histórico</div><h1>Histórico de alterações</h1><div class="alert warn"><b>O histórico ainda não está no banco</b>${esc(S.hist.erro)}</div>`;
      const NOMES = { cadastros_casas: "Ficha da casa", inscricoes_artistas: "Inscrição de artista", perfis: "Conta", equipe_casa: "Equipe da casa", disponibilidade_casa: "Disponibilidade", convites: "Convite", solicitacoes_ficha: "Pedido de atualização", materiais: "Material", campanhas: "Campanha", campanha_itens: "Campanha (dia)", checklist: "Passo a passo", registros_noite: "Registro da noite", contratos: "Contrato", documentos: "Documento", trilhas: "Treinamento", trilha_marcos: "Treinamento (etapa)", notas_internas: "Nota interna" };
      const f = S.histFiltro || "", lista = S.hist.filter((h) => !f || (NOMES[h.tabela] || h.tabela) === f);
      const val = (v) => v == null ? "–" : typeof v === "object" ? JSON.stringify(v) : String(v);
      const campos = (h) => { const ks = Object.keys(h.depois || h.antes || {}).filter((k) => !["id", "atualizado_em", "criado_em", "pendencias"].includes(k)).slice(0, 12);
        return ks.map((k) => `<div style="font-size:13px"><b>${esc(k)}</b>: ${h.operacao === "INSERT" ? "" : `<s class="muted">${esc(val(h.antes?.[k]).slice(0, 160))}</s> → `}${esc(val(h.depois?.[k]).slice(0, 160))}</div>`).join(""); };
      return `<div class="tag">Administração</div><h1>Histórico de alterações</h1>
      <p class="sub">Toda alteração feita no portal, por qualquer pessoa: quem, quando, o que era antes e o que ficou. Só a administração vê. Últimas ${S.hist.length}.</p>
      <div class="filters"><select id="histFiltro" aria-label="Filtrar por tipo"><option value="">Tudo</option>${[...new Set(S.hist.map((h) => NOMES[h.tabela] || h.tabela))].sort().map((n) => `<option${n === f ? " selected" : ""}>${esc(n)}</option>`).join("")}</select> <button class="btn sm" data-hist-recarregar>Atualizar</button></div>
      <div class="list">${lista.slice(0, S.histMax || 50).map((h) => dobra("aud:" + h.id, `${esc(NOMES[h.tabela] || h.tabela)} · ${{ INSERT: "criou", UPDATE: "alterou", DELETE: "apagou" }[h.operacao] || h.operacao}`, `${new Date(h.quando).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} · ${esc(h.quem_email || "sistema")}`, campos(h), { classe: "linha" })).join("") || vazio("Nenhuma alteração ainda", "Quando alguém mudar algo no portal, aparece aqui.", "", "historico")}</div>
      ${lista.length > (S.histMax || 50) ? `<button class="btn sm" style="margin-top:8px" data-hist-mais>Ver mais ${Math.min(50, lista.length - (S.histMax || 50))} (de ${lista.length - (S.histMax || 50)})</button>` : ""}`;
    },
    // ---------- casa: telas do documento do Gui (11/11/2026) ----------
    guia() {
      const H = S.hub; if (!H) { carregarHub(); return carregando("o Guia"); }
      const pega = (slug) => (H.materiais || []).find((m) => m.slug === slug);
      const doc = (m, titulo, desc) => cartaoDoc(H, m, titulo, desc);
      return `<div class="tag">Operações</div><h1>Guia do franqueado</h1>
      <p class="sub">O escopo todo do Tranquilo e o fio condutor do modelo. Comece por aqui; os manuais de cada produto vêm logo abaixo.</p>
      <div class="list">${doc(pega("guia-do-franqueado"), "Guia do Franqueado", "Como a unidade funciona, os compromissos, a semana de cada evento e o fechamento")}
      ${doc(pega("manual-apresenta-operacao"), "Manual do Tranquilo Apresenta", "Cronograma hora a hora, rider, camarim e funções da equipe")}
      ${doc(pega("manual-descubra-operacao"), "Manual do Tranquilo Descubra", "Cronograma hora a hora, rider, camarim e funções da equipe")}</div>
      <div class="barra-acoes" style="margin-top:12px"><button class="btn sm" data-ir="materiais">Ver todos os materiais</button><button class="btn sm" data-ir="duvidas">Dúvidas frequentes</button></div>`;
    },
    cronograma() {
      if (S.conta.equipe === undefined && S.conta.perfil.vinculo_nome) carregarEquipeCasa();   // técnico de som da equipe entra sozinho na mensagem
      const evs = eventosDaConta().filter((e) => e.d >= hojeIso()), d = S.conta.casa?.dados || {};
      const end = valorCasa(d, "endereco") || S.pac?.ficha_notion?.endereco || "", casa = d.nome || S.conta.perfil.vinculo_nome || "a casa";
      return `<div class="tag">Cronogramas</div><h1>Datas fechadas</h1>
      <p class="sub">Cada data fechada com o cronograma da noite, a mensagem pronta para mandar ao artista e quem vai tocar. O contato direto entre casa e artista é bem-vindo.</p>
      ${evs.length ? `<div class="list">${evs.map((e) => dobra("crono:" + e.id, `${esc(NOME_SEM[wdDe(e.d)].slice(0, 3))} ${dt(e.d)} · ${esc(e.m || "")}`, esc((e.a || []).join(", ") || "line-up a definir"), `${infoNoite(e, end)}
        ${blocoMensagem(e, { contato: String(valorCasa(d, "dono_nome") || "").split(" ")[0], casaNome: casa, endereco: end, tecnico: (() => { const t = (S.conta.equipe || []).find((m) => !m.reserva && (m.funcoes || []).includes("som")); return t ? `${t.nome}, ${t.whatsapp || "[telefone]"}` : ""; })() })}
        <div class="muted" style="font-size:13px;margin-top:8px"><b>Contato e ficha dos artistas</b> ${A_VALIDAR_HTML} O Gui define quais campos da ficha do artista a casa vê.</div>`, { classe: "linha" })).join("")}</div>`
        : vazio("Nenhuma data fechada ainda", "Quando o Tranquilo fechar uma data com a sua casa, o cronograma e a mensagem para o artista aparecem aqui.", "", "cronograma")}`;
    },
    mkt_produtor() { return telaMarketing("lider"); },
    mkt_anfitriao() { return telaMarketing("anfitriao"); },
    mkt_social() { return telaMarketing("social_media"); },
    bonificacao() {
      const b = S.conta.casa?.combinados?.bonificacao || {}, nada = '<span class="muted">Ainda não registrado pela Operações</span>';
      return `<div class="tag">Bonificações</div><h1>Bonificação da casa</h1>
      <p class="sub">Se a sua casa tem bonificação, de qual marca, por quanto tempo enviaremos e o que foi combinado. Quem registra é a Operações ${A_VALIDAR_HTML}.</p>
      <div class="card"><dl class="kv"><dt>Tem bonificação?</dt><dd>${b.tem === "sim" ? "Sim" : b.tem === "nao" ? "Não" : nada}</dd><dt>Marca</dt><dd>${b.marca ? esc(b.marca) : nada}</dd>
        <dt>Por quanto tempo enviaremos</dt><dd>${b.periodo ? esc(b.periodo) : nada}</dd><dt>Combinados</dt><dd>${b.combinados ? esc(b.combinados) : nada}</dd></dl></div>
      <div class="alert" style="margin-top:12px"><b>Parceiros de bebida (Guia do Franqueado)</b>O Tranquilo tem parceria com a Estrella Galicia (cerveja) e a Lambe Lambe (drinks alcoólicos). Se a sua casa estiver numa região com bonificação, a cerveja do bar nas noites Tranquilo é só Estrella Galicia. A Operações confirma se a sua cidade está nessa região.</div>`;
    },
    // ---------- equipe: artista e casa lado a lado ----------
    lado_a_lado() {
      const E = S.eq; if (!E) { carregarEquipe(); return carregando("as datas"); }
      const P = S.pac; if (!P) return `<div class="tag">Artista e casa</div><h1>Datas: artista e casa</h1><div class="alert warn"><b>Falta o código interno</b>Cole o código interno da equipe na aba Conta para ver as datas.<div class="barra-acoes" style="margin-top:8px"><button class="btn sm" data-ir="conta">Abrir Minha conta</button></div></div>`;
      const hoje = hojeIso(), evs = P.eventos.filter((e) => !e.z && e.d >= hoje).sort((a, b) => a.d.localeCompare(b.d)).slice(0, 70);
      const k = (x) => String(x || "").toLowerCase();
      const cadDe = (e) => (E.casas || []).find((c) => (c.notion_casa_id && c.notion_casa_id === e.k) || (c.dados?.nome && k(c.dados.nome) === k(e.h)) || (c.perfil?.vinculo_nome && k(c.perfil.vinculo_nome) === k(e.h)));
      const dispDe = (e) => (E.disp || []).find((x) => k(x.casa_ref) === k(e.h) && x.dia === e.d);
      const lado = (e) => { const c = cadDe(e), b = c?.combinados?.bonificacao, di = dispDe(e);
        return dobra("lado:" + e.id, `${esc(NOME_SEM[wdDe(e.d)].slice(0, 3))} ${dt(e.d)} · ${esc(e.c)}`, `${esc(e.h || "casa a definir")} · ${esc(e.m || "")}${c ? "" : " · sem cadastro no portal"}`, `
        <div class="grid g2" style="margin-top:0"><div><div class="tag" style="margin:0">Artista</div>${infoNoite(e, P.enderecos?.[e.k])}</div>
        <div><div class="tag" style="margin:0">Casa</div><dl class="kv" style="margin:10px 0 0"><dt>Casa</dt><dd>${esc(e.h || "a definir")}</dd>
          <dt>Ficha</dt><dd>${c ? badgeEtapa(etapaCasaEq(E, c)) : '<span class="muted">sem cadastro no portal</span>'}</dd>
          <dt>Disponibilidade</dt><dd>${di ? (di.situacao === "indisponivel" ? '<span class="badge b-crit">marcou indisponível</span>' : "marcou disponível") : '<span class="muted">sem marcação</span>'}</dd>
          <dt>Bonificação</dt><dd>${b?.tem === "sim" ? esc(b.marca || "sim") : b?.tem === "nao" ? "não" : '<span class="muted">a definir</span>'}</dd>
          ${c ? `<dt></dt><dd><button class="btn sm" data-click="casacad:${c.id}">Abrir a ficha</button></dd>` : ""}</dl></div></div>
        ${blocoMensagem(e, { contato: String(c?.dados?.dono_nome || "").split(" ")[0], casaNome: c?.dados?.nome || e.h, endereco: c?.dados?.endereco || P.enderecos?.[e.k], whatsapp: c?.dados?.whatsapp, email: c?.dados?.dono_email })}`, { classe: "linha" }); };
      return `<div class="tag">Artista e casa</div><h1>Datas: artista e casa lado a lado</h1>
      <p class="sub">Tudo o que circula entre o artista e a casa em cada data: ordem da noite, horários, endereço, ficha e disponibilidade da casa, bonificação. Próximas ${evs.length} datas.</p>
      ${evs.length ? `<div class="list">${evs.map(lado).join("")}</div>` : vazio("Nenhuma data futura", "Quando houver datas futuras na agenda, elas aparecem aqui.", "", "lado_a_lado")}`;
    },
    minha_funcao() {
      const fs = funcoesDe() || [];
      return `<div class="tag">Minha função</div><h1>${esc(nomesFuncoes(fs))}</h1>
      <p class="sub">Você faz parte da equipe de ${esc(S.conta.perfil.vinculo_nome || "uma casa da rede")}. Aqui está o que é seu: o que ler uma vez, o que chega a cada show e o que você devolve. Quem muda a sua função é o responsável da casa.</p>
      ${fs.map((f) => { const d = TQEquipe.PERFIL[f], F = TQEquipe.FUNCOES.find((x) => x[0] === f); if (!d || !F) return "";
        return dobra("funcao:" + f, esc(F[1]), `${d.le.length} para ler · ${d.show.length} a cada show · ${d.devolve.length} você devolve`, `<p class="muted" style="margin:0 0 8px">${esc(F[2])} <b>Quando:</b> ${esc(F[3])}.</p>
        <div class="grid g3">${[["Leia uma vez", d.le], ["A cada show", d.show], ["Você devolve", d.devolve]].map(([t, xs]) => `<div><b>${t}</b><ul class="passos">${xs.map((x) => `<li>${t === "Leia uma vez" ? leituraComLink(x) : esc(x)}</li>`).join("")}</ul></div>`).join("")}</div>`); }).join("")}
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
      // Fechadinho: cada dia é uma linha; abre sozinho só o dia atual e o dia com etapa da casa por fazer (o passo dela).
      return `<div class="tag">Treinamento da casa</div><h1>${A.fechada ? "Treinamento concluído" : "Seu treinamento em 7 dias úteis"}</h1>
      <p class="sub">Nos 7 dias, a casa conversa com todas as áreas do Tranquilo para conhecer os detalhes e conseguir orientar o time que vai montar. Cada pessoa da Central fala com a casa no máximo dois dias: um para enviar, outro para responder as dúvidas. A casa nunca recebe duas pessoas falando do mesmo assunto. Marque aqui o que é da casa.</p>
      <div class="alert ${A.atrasadas ? "warn" : A.fechada ? "good" : ""}"><b>${A.feitas} de ${A.total} etapas · ${A.fechada ? "a casa conhece as quatro áreas e assume a operação" : `agora com ${A.com === "casa" ? "você" : esc(A.com)}`}</b>${A.proxima ? `${esc(A.proxima.titulo)}, até ${dtc(A.proxima.prazo)}. ` : ""}Treinamento de ${dtc(A.etapas[0].prazo)} a ${dtc(A.fim)}.</div>
      <div class="progress" style="margin:10px 0 14px"><i style="width:${Math.round((A.feitas / A.total) * 100)}%"></i></div>
      ${[...new Set(A.etapas.map((e) => e.dia))].map((d) => { const es = A.etapas.filter((e) => e.dia === d), nf = es.filter((e) => e.feito).length;
        return dobra("trilha-dia:" + d, `Dia ${d} · ${dtc(TQEquipe.diaUtil(T.inicio, d))}`, `${nf}/${es.length} feitas${es.some((e) => e.atrasado && !e.feito) ? " · atrasada" : ""}`, `<ul class="passos">${es.map(linha).join("")}</ul>`,
          { classe: "linha", aberta: !A.fechada && (es.some((e) => e.casa && !e.feito) || A.etapas.find((e) => !e.feito)?.dia === d) }); }).join("")}
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
          <p style="margin:10px 0 4px"><b>Equipe da casa</b> <span class="badge ${cob.completa ? "b-good" : "b-warn"}">${esc(fraseEquipe(cob))}</span>${eq.length ? "" : ' <span class="muted" style="font-size:13px">A casa ainda não cadastrou a equipe.</span>'}</p>
          ${listaEquipe(eq, linhasCasaEq(), { chave: `tri:${k(t.casa_ref)}` })}
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
    // ---------- Disponibilidade da artista (banco v24): a artista marca os dias; a Isa cruza com as casas em Criar datas ----------
    disp_artista() {
      const d = S.conta.insc?.dados || {}, cids = [...(d.cidades_interesse || []), ...(d.outras_cidades ? [d.outras_cidades] : [])];
      return `<div class="tag">Disponibilidade</div><h1>Onde e quando você pode tocar</h1>
      <div class="card" style="margin-bottom:14px"><div class="row"><div><b>Cidades</b><div class="muted" style="font-size:14px">${cids.length ? esc(cids.join(", ")) : "Nenhuma cidade marcada ainda."}</div></div><button class="btn sm" data-ir="inscricao">${cids.length ? "Ver na inscrição" : "Marcar cidades"}</button></div>${d.disponibilidade ? `<div class="muted" style="font-size:13px;margin-top:6px">Observação: ${esc(d.disponibilidade)}</div>` : ""}</div>
      <h2>Dias</h2>${calendarioArtista()}`;
    },
    // Contratos da conta (artista e casa): todos num lugar, com o pendente primeiro.
    contratos_meus() {
      const aberto = S.contrAberto && meusContratos().find((c) => c.id === S.contrAberto);
      if (aberto) return telaContrato(aberto);
      const pendente = (c) => c.status === "enviado" && !ctRecebido(c) ? 0 : 1;
      const L = meusContratos().sort((a, b) => pendente(a) - pendente(b) || String(b.criado_em || "").localeCompare(String(a.criado_em || "")));
      const casa = S.conta.perfil.tipo === "casa";
      return `<div class="tag">Contratos</div><h1>Seus contratos</h1>
      <p class="sub">Aqui ficam todos os contratos ${casa ? "da casa com o Tranquilo" : "das suas datas"}: o que falta assinar aparece primeiro. Você completa os dados, baixa o PDF (já assinado pelo Tranquilo), assina e envia o arquivo de volta.</p>
      ${L.length ? `<div class="list">${L.map((c) => { const si = situacaoCt(c); return `<div class="card row"><span><b>${esc(c.titulo)}</b><div style="margin-top:4px"><span class="badge ${si.classe}">${si.rotulo}</span>${c.assinado_em ? ` <span class="muted" style="font-size:13px">· assinado em ${dt(c.assinado_em.slice(0, 10))}</span>` : ""}</div></span><button class="btn sm${pendente(c) ? "" : " pri"}" data-ct-abrir="${c.id}">${c.status === "assinado" || ctRecebido(c) ? "Ver" : ctPedidoDeNovo(c) ? "Enviar de novo →" : "Abrir e assinar →"}</button></div>`; }).join("")}</div>`
        : vazio("Nenhum contrato por enquanto", casa ? "Quando a equipe do Tranquilo enviar o contrato da parceria, ele aparece aqui para você ler e assinar." : "Quando uma data for confirmada, a equipe do Tranquilo prepara o contrato e ele aparece aqui para você ler e assinar.", "", "contratos_meus")}`;
    },
    // Financeiro da casa: combinados registrados pela Central e situação dos dados de repasse.
    financeiro_casa() {
      const c = S.conta.casa, cb = c?.combinados || {}, d = c?.dados || {}, nada = '<span class="muted">Ainda não registrado pela Operações</span>';
      const pct = (v) => (v != null && v !== "" ? `${esc(String(v))}%` : nada);
      const rep = ["rep_titular", "rep_documento", "rep_banco", "rep_agencia", "rep_conta"].every((k) => String(d[k] ?? "").trim()) || String(d.rep_pix ?? "").trim();
      return `<div class="tag">Financeiro</div><h1>Combinados e repasses</h1>
      <p class="sub">Como a receita de cada noite é dividida e para onde vai a parte da casa. Quem registra os combinados é a Operações.</p>
      <div class="card"><h3 style="margin-top:0">Bilheteria</h3><dl class="kv"><dt>Casa</dt><dd>${pct(cb.bilheteria?.casa)}</dd><dt>Artistas</dt><dd>${pct(cb.bilheteria?.artista)}</dd><dt>Tranquilo</dt><dd>${pct(cb.bilheteria?.tranquilo)}</dd></dl></div>
      <div class="card" style="margin-top:12px"><h3 style="margin-top:0">Alimentos e bebidas</h3><dl class="kv"><dt>Casa</dt><dd>${pct(cb.aeb?.casa)}</dd><dt>Tranquilo</dt><dd>${pct(cb.aeb?.tranquilo)}</dd></dl></div>
      <div class="card" style="margin-top:12px"><div class="row"><div><h3 style="margin:0">Conta para repasses</h3><div class="muted" style="font-size:14px;margin-top:4px">${rep ? "✓ Dados da conta informados na Ficha." : "Ainda faltam os dados da conta que recebe a parte da casa."}</div></div><button class="btn sm${rep ? "" : " pri"}" data-sub="ficha|cadastro_casa">${rep ? "Ver no Cadastro" : "Informar no Cadastro"}</button></div></div>`;
    },
    // ---------- Datas: disponibilidade da casa (a casa informa; a Isa consulta em Agenda das casas) ----------
    agenda_casa() {
      const ref = S.conta.perfil.vinculo_nome;
      if (!ref) return `<div class="tag">Datas</div><h1>Disponibilidade</h1>${vazio("A conta ainda não está ligada à casa", "Quando a equipe do Tranquilo ligar esta conta à sua casa, você informa aqui os dias livres.", "", "agenda_casa")}`;
      if (S.disp === undefined) { carregarDisp(); return carregando("a disponibilidade"); }
      if (S.disp === null) return faltaSchema("Datas");
      const mes = S.dispMes || hojeIso().slice(0, 7), evs = (S.pac?.eventos || []).filter((e) => !e.z);
      const dias = TQEquipe.diasSemana || [];
      const sem = semanaDe(S.sem, { casaRef: ref, fichaDias: S.conta.casa?.dados?.dias_semana }), dono = !funcoesDe();
      return `<div class="tag">Datas</div><h1>Disponibilidade da casa</h1>
      <p class="sub">A Isa consulta este calendário para montar a agenda, sem precisar perguntar pelo WhatsApp. Disponível não é reserva: a data só vale quando a Isa confirma com a casa.</p>
      ${dono ? blocoSemana(sem, "casa") : sem.length ? `<p class="muted">Toda semana: <b>${esc(sem.map((n) => NOME_SEM[n]).join(", "))}</b>.</p>` : ""}
      <p class="muted" style="font-size:13px;margin:0 0 8px">O calendário já vem preenchido pelos dias fixos. Para um feriado, um evento privado ou um dia extra, use <b>Ajustar uma data</b> logo abaixo (ou toque no dia).</p>
      ${calendarioMes(mes, (dia) => { const r = S.disp.find((x) => x.casa_ref.toLowerCase() === ref.toLowerCase() && x.dia === dia), e = evs.filter((x) => x.d === dia), sit = situacaoDia(r, sem, dia);
        return celulaDisp(sit, r, sem, e.length ? e.map((x) => (x.a || []).join(", ") || x.m || "evento").join(" · ") : "", dono && dia >= hojeIso() && !e.length); }, "data-disp-dia")}
      <div class="err" role="status" aria-live="polite" id="dispErr"></div>
      ${blocoExcecoes("casa")}`;
    },
    // ---------- equipe: painel da operação e agenda das casas ----------
    // ---------- equipe: criar datas no portal (pedido da Marina para a Isa, 17/11/2026) ----------
    datas_portal() {
      const E = S.eq; if (!E) { carregarEquipe(); return carregando("as datas"); }
      if (E.datasP === null) return faltaSchema("Criar datas");
      const k = (x) => String(x || "").trim().toLowerCase();
      const casas = (E.casas || []).filter((c) => c.status !== "encerrada").map((c) => ({ id: c.id, nome: c.dados?.nome || c.perfil?.vinculo_nome || c.perfil?.nome || "Casa sem nome", cidade: c.dados?.cidade_uf || c.dados?.cidade || "", status: c.status }))
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
      const artistas = (E.perfis || []).filter((p) => p.tipo === "artista").map((p) => ({ id: p.id, nome: p.vinculo_nome || p.nome || p.email })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
      const ed = S.dpEd ? (E.datasP || []).find((x) => x.id === S.dpEd) : null;
      const f = ed ? { ...ed, ...(S.dpPre || {}) } : { abertura: "19:00:00", produto: "Descubra", artistas: [], ...(S.dpPre || {}) };
      // A Nova data obedece a disponibilidade: escolhido o dia, só aparecem as casas e os artistas que marcaram esse dia
      // como livre e não têm show. "Exceção" libera todos (ex.: a casa confirmou por WhatsApp e ainda não marcou no portal).
      const dia = String(f.dia || "").slice(0, 10), exc = !!S.dpExc, livres = dia ? livresNoDia(E, casas, S.dpEd) : null;
      // Pedido da Marina (18/11/2026): cada lista mostra primeiro, e por padrão só, quem está livre no dia e na cidade da
      // casa (padrão semanal com cidade, exceções por data, sem outra data no mesmo dia). Quem não está fica num grupo
      // recolhido "Não marcaram este dia", com o motivo; escolher alguém de lá liga a Exceção, com aviso.
      const cidSel = (casas.find((c) => c.id === f.casa_id)?.cidade || f.cidade || "").trim(), cid1 = cidSel.split("/")[0].trim();
      const diaCurto = (d) => `${NOME_SEM[wdDe(d)].slice(0, 3)} ${d.slice(8, 10)}/${d.slice(5, 7)}`;
      const mesmoDiaEd = ed && dia === String(ed.dia || "").slice(0, 10);
      // Casas: livre no dia, Ficha habilitada pela equipe e com artista livre da cidade dela (o match). As outras, recolhidas com o motivo.
      const casasDia = livres ? livres(dia).todasC.map((c) => { const nArt = livres(dia, c.cidade || "", true).as.length;
        const motivo = mesmoDiaEd && c.id === ed.casa_id ? null : c.motivo || (c.status !== "habilitada" ? `Ficha ${String(STATUS_CASA[c.status]?.[1] || c.status || "não enviada").toLowerCase()}` : !nArt ? `nenhum artista livre em ${String(c.cidade || "?").split("/")[0]} neste dia` : null);
        return { ...c, nArt, motivo }; }) : [];
      const casasLivres = casasDia.filter((c) => !c.motivo), casasFora = casasDia.filter((c) => c.motivo);
      // Artistas: com a casa escolhida, livres para a cidade dela; sem casa, livres para a cidade de alguma casa livre.
      const LA = livres && cidSel ? livres(dia, cidSel, true) : null;
      let artLivres = [], artFora = [];
      if (LA) { artLivres = LA.as; artFora = LA.foraA; }
      else if (livres) {
        artLivres = [...new Map(casasLivres.flatMap((c) => livres(dia, c.cidade || "", true).as).map((a) => [a.id || a.nome, a])).values()];
        const L0 = livres(dia);
        artFora = L0.todosA.filter((a) => !artLivres.some((x) => x.id === a.id)).map((a) => ({ ...a, motivo: a.motivo || "livre, mas nenhuma casa livre na cidade dele" })).sort((x, y) => x.nome.localeCompare(y.nome, "pt-BR"));
      }
      // Quem já está nesta data (edição no mesmo dia) continua entre os livres.
      if (mesmoDiaEd) (ed.artistas || []).forEach((a) => { if (a.nome && !artLivres.some((x) => k(x.nome) === k(a.nome))) { artFora = artFora.filter((x) => k(x.nome) !== k(a.nome)); artLivres = [...artLivres, { nome: a.nome, jaNaData: true }]; } });
      const escolhidos = (f.artistas || []).map((a) => a.nome).filter(Boolean);
      escolhidos.forEach((n) => { if (!artLivres.some((x) => k(x.nome) === k(n)) && !artFora.some((x) => k(x.nome) === k(n))) artFora = [...artFora, { nome: n, motivo: "sem conta no portal" }]; });
      const foraSel = escolhidos.map((n) => artFora.find((x) => k(x.nome) === k(n))).filter(Boolean);
      const casaForaSel = casasFora.find((c) => c.id === f.casa_id);
      const verArtFora = exc || S.dpOutros || foraSel.length > 0, verCasaFora = exc || S.dpOutrasC || !!casaForaSel;
      const rotA = (x) => [x.nome, x.mora && "mora em " + x.mora, x.quer && cid1 && !k(x.mora || "").includes(k(cid1)) && "topa tocar em " + cid1, x.jaNaData ? "já nesta data" : "livre " + diaCurto(dia)].filter(Boolean).join(" · ");
      const rotAF = (x) => [x.nome, x.mora && "mora em " + x.mora, x.motivo].filter(Boolean).join(" · ");
      const rotC = (c) => [c.nome, c.cidade, `${c.nArt} ${c.nArt === 1 ? "artista livre" : "artistas livres"}`].filter(Boolean).join(" · ");
      // Sem ninguém livre: sugere os dias mais próximos com gente livre (na cidade da casa, ou com match de casa e artista).
      const sugestoes = (temGente) => { if (!livres) return [];
        const hj = hojeIso(), ds = []; for (let i = 0; i < 60; i++) { const d = new Date(Date.parse(hj + "T12:00:00Z") + i * 864e5).toISOString().slice(0, 10); if (d !== dia) ds.push(d); }
        return ds.map((d) => ({ d, n: temGente(d) })).filter((x) => x.n > 0).sort((x, y) => Math.abs(Date.parse(x.d) - Date.parse(dia)) - Math.abs(Date.parse(y.d) - Date.parse(dia))).slice(0, 3).sort((x, y) => x.d.localeCompare(y.d)); };
      const botoesSug = (sg, um, varios) => sg.map((x) => `<button class="btn sm" data-dp-dia-sug="${x.d}">${esc(diaCurto(x.d))} · ${x.n} ${x.n === 1 ? um : varios}</button>`).join(" ");
      let semNinguem = "";
      if (dia && !exc && !casasLivres.length) {
        const sg = sugestoes((d) => livres(d).cs.filter((c) => c.status === "habilitada" && livres(d, c.cidade || "", true).as.length).length);
        semNinguem += `<div class="alert warn" style="margin:0 0 10px" id="dpSemCasa"><b>Nenhuma casa livre em ${esc(diaCurto(dia))}</b>Nenhuma casa com Ficha habilitada marcou este dia como livre com artista livre na cidade dela. ${sg.length ? `Dias com casa e artista livres: ${botoesSug(sg, "casa", "casas")}` : "Nos próximos 60 dias também não há casa com artista livre: vale pedir às casas e aos artistas que marquem a disponibilidade."}${casasFora.length ? ` As outras casas estão na lista, em "Ver as outras casas", com o motivo.` : ""}</div>`;
      }
      if (dia && !exc && !artLivres.length && (cidSel || casasLivres.length)) {
        const sg = cidSel ? sugestoes((d) => livres(d, cidSel, true).as.length) : [];
        semNinguem += `<div class="alert warn" style="margin:0 0 10px" id="dpSemArt"><b>Ninguém livre em ${esc(diaCurto(dia))}${cid1 ? " para " + esc(cid1) : ""}</b>Nenhum artista que mora ou topa tocar ${cid1 ? "em " + esc(cid1) : "na cidade"} marcou este dia como livre. ${sg.length ? `Dias com artistas livres em ${esc(cid1)}: ${botoesSug(sg, "artista", "artistas")}` : cidSel ? `Nos próximos 60 dias ninguém marcou dia livre para ${esc(cid1)}: vale pedir aos artistas da cidade que marquem a disponibilidade.` : ""} Se alguém já confirmou por fora, abra "Não marcaram este dia" na lista do artista.</div>`;
      }
      const auto = exc ? (S.dpExcAuto || []) : [];
      const avisoDia = exc ? `<div class="alert warn" style="margin:0 0 10px" id="dpAvisoExc">${auto.length
          ? `<b>⚠ Exceção marcada automaticamente</b>${auto.map((x) => `${esc(x.nome)}: ${esc(x.motivo)}`).join("; ")}. Escolher fora da lista de livres só vale se você já confirmou ${auto.length > 1 ? "com eles" : "com essa pessoa"} por fora (WhatsApp, telefone). Se não confirmou, desmarque "Exceção" e escolha da lista de livres.`
          : `<b>⚠ Exceção ligada</b>Todas as casas e artistas aparecem, mesmo sem ter marcado o dia como livre. Use só quando a casa e o artista já confirmaram por fora.`}</div>`
        : !dia ? `<p class="muted" style="font-size:13px;margin:0 0 10px">Escolha o dia primeiro: a lista de casas e de artistas mostra primeiro quem marcou esse dia como livre.</p>`
        : `<p class="muted" style="font-size:13px;margin:0 0 10px" id="dpMatch">Com match em ${dt(dia)}: <b>${casasLivres.length} ${casasLivres.length === 1 ? "casa" : "casas"}</b> e <b>${artLivres.length} ${artLivres.length === 1 ? "artista" : "artistas"}</b>${cid1 ? ` para ${esc(cid1)}` : ""}.</p>${semNinguem}${foraSel.length ? `<div class="alert warn" style="margin:0 0 10px"><b>Não está livre ${cid1 ? "para " + esc(cid1) + " " : ""}neste dia</b>${foraSel.map((x) => `${esc(x.nome)}: ${esc(x.motivo)}`).join("; ")}. Troque por alguém da lista de livres ou, se já confirmou por fora, marque "Exceção".</div>` : ""}${casaForaSel ? `<div class="alert warn" style="margin:0 0 10px"><b>A casa escolhida não está liberada neste dia</b>${esc(casaForaSel.nome)}: ${esc(casaForaSel.motivo)}. Escolha outra casa ou, se já confirmou por fora, marque "Exceção".</div>` : ""}`;
      const grupoFora = "Não marcaram este dia (precisa confirmar por fora)";
      // Line-up editável (pedido da Marina, 18/11/2026): 3 linhas é o padrão do Descubra; "+ Adicionar artista" e "Tirar"
      // (mínimo 1). Quem já está numa linha não aparece nas outras (sem repetir).
      const nLin = Math.min(R.LINEUP_MAX, Math.max(1, S.dpN ?? Math.max(ed ? 1 : R.vagasFormato(f.produto).sugerido, (f.artistas || []).map((a) => !!a.nome).lastIndexOf(true) + 1)));
      const linhaArt = (i) => { const a = (f.artistas || [])[i] || {}, outros = (f.artistas || []).filter((x, j) => j !== i && x.nome).map((x) => k(x.nome));
        const artLivres_ = artLivres.filter((x) => !outros.includes(k(x.nome))), artFora_ = artFora.filter((x) => !outros.includes(k(x.nome)));
        { const artLivres = artLivres_, artFora = artFora_;
        const campoArt = exc ? `<input data-dp-art="${i}" list="dpArtistas" value="${esc(a.nome || "")}" placeholder="Nome (escolha da lista para ligar à conta)">`
          : `<select data-dp-art="${i}" data-valor="${esc(a.nome || "")}"${!dia ? " disabled" : ""}><option value="">${!dia ? "Escolha o dia primeiro" : artLivres.length ? "Escolha o artista" : "Ninguém livre neste dia"}</option>${artLivres.length ? `<optgroup label="Livres em ${esc(diaCurto(dia))}${cid1 ? " para " + esc(cid1) : ""}">${artLivres.map((x) => `<option value="${esc(x.nome)}"${k(x.nome) === k(a.nome) ? " selected" : ""}>${esc(rotA(x))}</option>`).join("")}</optgroup>` : ""}${!dia || !artFora.length ? "" : verArtFora
            ? `<optgroup label="${grupoFora}">${artFora.map((x) => `<option value="${esc(x.nome)}" data-fora="${esc(x.motivo)}"${k(x.nome) === k(a.nome) ? " selected" : ""}>${esc(rotAF(x))}</option>`).join("")}</optgroup>`
            : `<option value="__outros">▸ ${grupoFora}: ver ${artFora.length}</option>`}</select>`;
        return `<div class="fgrid" style="grid-template-columns:minmax(0,2fr) minmax(0,1fr);margin-bottom:8px"><label class="fcampo"><b>${i + 1}º artista da noite${i === 0 ? " *" : ""}</b>
          ${campoArt}</label>
          <div style="align-self:end;margin-bottom:10px;display:flex;gap:10px;align-items:center;flex-wrap:wrap"><label class="fcheck" style="margin:0"><input type="checkbox" data-dp-prod="${i}"${a.producao ? " checked" : ""}> <span>tem produção</span></label>${nLin > 1 ? `<button type="button" class="btn sm" data-dp-rem="${i}" aria-label="Tirar o ${i + 1}º artista do line-up">Tirar</button>` : ""}</div></div>`; } };
      const selCasa = !dia && !exc ? `<option value="">Escolha o dia primeiro</option>`
        : !dia ? `<option value="">Escolha a casa</option>${casas.map((c) => `<option value="${c.id}"${f.casa_id === c.id ? " selected" : ""}>${esc(c.nome)}${c.cidade ? " · " + esc(c.cidade) : ""}</option>`).join("")}`
        : `<option value="">${casasLivres.length ? "Escolha a casa" : "Nenhuma casa livre neste dia"}</option>${casasLivres.length ? `<optgroup label="Livres em ${esc(diaCurto(dia))}, com Ficha habilitada">${casasLivres.map((c) => `<option value="${c.id}"${f.casa_id === c.id ? " selected" : ""}>${esc(rotC(c))}</option>`).join("")}</optgroup>` : ""}${!casasFora.length ? "" : verCasaFora
          ? `<optgroup label="Outras casas (precisa confirmar por fora)">${casasFora.map((c) => `<option value="${c.id}" data-fora="${esc(c.motivo)}"${f.casa_id === c.id ? " selected" : ""}>${esc([c.nome, c.cidade, c.motivo].filter(Boolean).join(" · "))}</option>`).join("")}</optgroup>`
          : `<option value="__outrasC">▸ Ver as outras casas (${casasFora.length}): sem dia livre ou Ficha não habilitada</option>`}`;
      const artsDatalist = exc ? [...artLivres.map((x) => [x.nome, rotA(x)]), ...artFora.filter((x) => x.id).map((x) => [x.nome, rotAF(x)]), ...artistas.filter((x) => !artLivres.some((y) => k(y.nome) === k(x.nome)) && !artFora.some((y) => k(y.nome) === k(x.nome))).map((x) => [x.nome, x.nome])] : [];
      const filtros = filtrosDp(E, casas), FL = filtroDp();
      const hoje = hojeIso(), todasL = (E.datasP || []).filter((x) => S.dpVerTodas || String(x.dia) >= hoje).sort((a, b) => String(a.dia).localeCompare(String(b.dia)));
      const lista = todasL.filter((x) => FL.cid(x.cidade) && FL.casa(x.casa_nome) && FL.art((x.artistas || []).map((a) => a.nome)));
      const contrDe = (x) => (E.contr || []).filter((c) => c.evento_id === "p:" + x.id && c.status !== "cancelado");
      return `<div class="tag">Agenda</div><h1>Criar datas</h1>
      <p class="sub">A data criada aqui aparece na hora para a casa e para as artistas (Datas, passo a passo, cronograma), entra em "Preparar contrato" e gera a mensagem de cronograma. O Notion não muda: lance lá também enquanto o Notion for a agenda oficial.</p>
      ${filtros}
      ${buscaDatas(E, casas, !ed)}
      ${sugestaoHistorico()}
      ${(() => { const ab = !!(ed || S.dpPre || S.dpFormAberto || (() => { try { return localStorage.getItem("tq-dp-aberto") === "1"; } catch { return false; } })()); return `<div class="card${ab ? "" : " dp-fechado"}" id="dpForm"><h2 style="margin-top:0;cursor:pointer" data-dp-abrir-form role="button" tabindex="0" aria-expanded="${ab}">${ab ? "▾" : "▸"} ${ed ? "Editar data" : "Nova data"}${ab ? "" : ` <span class="muted" style="font-size:14px;font-weight:400">· criar uma data à mão (ou toque numa combinação acima, que ela já vem preenchida)</span>`}</h2>`; })()}
        <div class="fgrid">
          <label class="fcampo"><b>Dia *</b><input type="date" id="dpDia" value="${esc(String(f.dia || "").slice(0, 10))}"></label>
          <label class="fcampo"><b>Abertura da casa *</b><input type="time" id="dpAbre" value="${esc(String(f.abertura || "19:00").slice(0, 5))}"></label>
          <label class="fcampo"><b>Formato *</b><select id="dpProd">${R.NOMES_FORMATO.map((p) => `<option${f.produto === p ? " selected" : ""}>${p}</option>`).join("")}</select></label>
          <label class="fcampo"><b>Casa *</b><select id="dpCasa" data-valor="${esc(f.casa_id || "")}"${!dia && !exc ? " disabled" : ""}>${selCasa}</select></label>
          <label class="fcampo"><b>Cidade</b>${cidadeUfHtml('id="dpCidade"', f.cidade || "")}<span class="muted" style="font-size:12px">Vem da Ficha da casa.</span></label>
          <label class="fcampo"><b>Link de ingressos</b><input id="dpLink" value="${esc(f.link_ingressos || "")}" placeholder="https://ingresse.com/..."></label>
        </div>
        ${regraFormato(f.produto, "dpRegra")}
        ${avisoDia}
        <label class="fcheck" style="margin-bottom:8px"><input type="checkbox" data-dp-exc${exc ? " checked" : ""}> <span>Exceção: mostrar todas as casas e artistas (já confirmaram por fora)</span></label>
        <h3>Line-up, na ordem da noite</h3><p class="muted" style="font-size:13px;margin:0 0 8px">No Apresenta, o 1º é a abertura e o último é a atração. Quem toca por último passa o som primeiro.</p>
        ${Array.from({ length: nLin }, (_, i) => linhaArt(i)).join("")}
        ${nLin < R.LINEUP_MAX ? `<div class="barra-acoes" style="margin:0 0 10px"><button type="button" class="btn sm" data-dp-add>+ Adicionar artista</button><span class="muted" style="font-size:13px">${nLin} ${nLin === 1 ? "artista" : "artistas"} no line-up · ${esc(padraoLineup(f.produto))}</span></div>` : ""}
                <datalist id="dpArtistas">${artsDatalist.map(([n, r]) => `<option value="${esc(n)}"${r !== n ? ` label="${esc(r)}"` : ""}>`).join("")}</datalist>
        <label class="fcampo"><b>Observação</b><textarea id="dpObs" rows="2">${esc(f.observacao || "")}</textarea></label>
        ${S.dpConf ? `<div class="alert crit" id="dpConf" style="margin:8px 0"><b>Tirar do line-up e cancelar o contrato?</b>${S.dpConf.cancelar.length ? `Ao salvar, o contrato desta data ${S.dpConf.cancelar.length === 1 ? "de" : "de cada um:"} <b>${esc(S.dpConf.cancelar.map((c) => c.nome).join(", "))}</b> é cancelado e some da área ${S.dpConf.cancelar.length === 1 ? "dele" : "deles"}.` : ""}${S.dpConf.travados.length ? ` O contrato de <b>${esc(S.dpConf.travados.join(", "))}</b> já foi assinado ou conferido e não muda: combine o distrato por fora.` : ""}
          <div class="barra-acoes" style="margin-top:10px"><button class="btn pri" data-dp-conf-ok>Tirar e cancelar o contrato</button><button class="btn" data-dp-conf-nao>Voltar sem salvar</button></div></div>` : ""}
        <div class="err" role="status" aria-live="polite" id="dpErr"></div>
        <div class="barra-acoes"><button class="btn pri" data-dp-salvar>${ed ? "Salvar alterações" : "Criar data"}</button>${ed ? '<button class="btn" data-dp-novo>Cancelar edição</button>' : ""}</div></div>
      ${(() => { const ativas = lista.filter((x) => x.status !== "cancelada"), semContr = ativas.filter((x) => !contrDe(x).length).length;
        const st = `${lista.length} ${S.dpVerTodas ? "no total" : lista.length === 1 ? "próxima" : "próximas"}${FL.ativo ? ` (de ${todasL.length}, com os filtros)` : ""}${semContr ? ` · ${semContr} sem contrato` : ""}`;
        // Abre sozinho só quando a pessoa acabou de criar ou abrir uma data (S.lpAberto); senão começa fechado.
        return dobra("dp-criadas", "Datas criadas no portal", st, `<label class="fcheck" style="margin:0 0 8px"><input type="checkbox" data-dp-todas${S.dpVerTodas ? " checked" : ""}> <span>mostrar as passadas</span></label>
      ${lista.length ? `<div class="list" style="margin-top:6px">${lista.map((x) => { const e = eventoDoPortal(x), cs = contrDe(x), canc = x.status === "cancelada";
        // Compacta (pedido da Marina, 18/11/2026): dia, casa, formato e "contratos 1/4"; abre para o line-up, os contratos e os botões.
        const L = E.contr == null || canc ? null : lineupDe(E, x), linhasL = L ? [...(temArea("agenda") ? L.artistas : []), ...(L.casa ? [L.casa] : [])] : [];
        const prontos = linhasL.filter((l) => l.etapa === "conferido" || l.etapa === "assinado").length;
        const resumo = canc ? "cancelada" : [`${e.a.length} ${e.a.length === 1 ? "artista" : "artistas"}`, L ? (linhasL.length ? `contratos ${prontos}/${linhasL.length}` : "") : cs.length ? `contratos ${cs.filter(ctAssinado).length}/${cs.length}` : "sem contrato"].filter(Boolean).join(" · ");
        return `<details class="card dp-item" data-lp-det="${x.id}"${S.lpAberto === x.id ? " open" : ""}><summary><span class="dp-sum-tit"><b>${esc(NOME_SEM[wdDe(e.d)].slice(0, 3))} ${dt(e.d)} · ${esc(x.casa_nome)}</b> <span class="badge ${canc ? "b-crit" : "b-good"}">${esc(x.produto)}</span></span><span class="dp-sum-res" data-dp-resumo>${esc(resumo)}</span></summary>
          <div class="muted" style="font-size:13px;margin-top:8px">Abertura ${esc(e.noite.inicio)} · ${x.cidade ? esc(x.cidade) + " · " : ""}line-up: ${esc(e.a.join(", ") || "a definir")}${x.observacao ? ` · ${esc(x.observacao)}` : ""}</div>
          ${canc || E.contr == null ? "" : quadroLineup(E, x)}
          ${canc ? "" : `<div class="dp-acoes"><button class="btn sm pri" data-dp-contrato="${x.id}">Contrato avulso</button><button class="btn sm" data-dp-editar="${x.id}">Editar</button><button class="btn sm" data-dp-cancelar="${x.id}">Cancelar data</button></div>`}</details>`; }).join("")}</div>`
        : todasL.length ? `<p class="muted">Nenhuma data com esses filtros.</p>` : vazio("Nenhuma data criada no portal ainda", "Crie a primeira acima: ela aparece na hora para a casa e para as artistas.", "", "datas_portal")}`,
        { classe: "dp-bloco", attrs: 'id="dpCriadas"', forcar: !!S.lpAberto && lista.some((x) => x.id === S.lpAberto) }); })()}`;
    },
    // "Hoje" (pedido da Marina, 17/11/2026): para quem tem área (Gui, Isa, Bruno), só o que precisa de ação agora.
    // Organizado por AÇÃO (18/11/2026): blocos com verbo e cada linha abre direto o item (pendenciasEquipe).
    hoje() {
      const E = S.eq; if (!E) { carregarEquipe(); return carregando("o seu dia"); }
      const areas = S.conta.perfil.tipo === "adm" || !S.conta.perfil.areas?.length ? ["operacoes", "agenda", "marketing"] : S.conta.perfil.areas;
      if (areas.includes("marketing") && !S.hub) carregarHub();
      const nome = String(S.conta.perfil.nome || "").split(" ")[0];
      const blocos = pendenciasEquipe(E, areas), acoes = blocos.filter((b) => !b.info), resto = blocos.filter((b) => b.info);
      const carregandoHub = areas.includes("marketing") && !S.hub ? `<p class="muted" style="font-size:13px">Carregando as campanhas…</p>` : "";
      // Sem a agenda do Notion (pacote da equipe) ou sem as bases, a tela não pode dizer que não há nada: avisa o que falta.
      const carregandoBases = S.basesPub === null ? `<p class="muted" style="font-size:13px">Carregando as casas e artistas do Notion…</p>` : "";
      const semAgenda = S.pac ? "" : `<div class="alert warn"><b>A agenda do Notion não abriu nesta conta</b>Sem ela, as datas, casas e line-ups reais não entram aqui. Entre de novo; se continuar, peça à administração para conferir o código interno da equipe.</div>`;
      return `<div class="tag">Para você</div><h1>Oi${nome ? ", " + esc(nome) : ""}! 🌿</h1>
      <p class="sub">Juntamos aqui o que chegou ${areas.length === 3 ? "nas suas áreas" : "em " + esc(nomesAreas(areas))}, organizado pelo que fazer. Toque numa linha para abrir aquele item; "Abrir" mostra a lista toda.</p>
      ${semAgenda}${painelModelo(E, areas)}${acoes.length ? `<h2>Vale olhar primeiro</h2><div class="list">${acoes.map((b) => blocoAcao(b)).join("")}</div>` : resto.length ? `<div class="alert"><b>Nada urgente agora</b>O que está em andamento fica logo abaixo, em “Pode interessar”.</div>` : carregandoBases || semAgenda ? "" : `<div class="alert good"><b>Tudo tranquilo por aqui 🌿</b>Nada esperando por você agora.</div>`}${carregandoHub}${carregandoBases}
      ${resto.length ? `<h2>Pode interessar</h2><div class="list">${resto.map((b) => blocoAcao(b)).join("")}</div>` : ""}`;
    },
    // Acompanhamento (pedido da Marina, 18/11/2026): o modelo de cada papel em cada data, para a equipe e a adm.
    // Começa fechadinho: uma linha por data com o % de cada papel; abre para as ações, o Feito e os SOS.
    desempenho() { return telaDesempenho(); },
    acompanhamento() {
      const E = S.eq; if (!E) { carregarEquipe(); return carregando("o acompanhamento"); }
      if (!S.hub) carregarHub();
      const ver = S.acompVer || "", hoje = hojeIso(), datas = modeloDatas(E);
      const papeis = ["operacoes", "agenda", "marketing", "casa", "artista"], sosTodos = sosAbertos(E, ["operacoes", "agenda", "marketing"]);
      const futuras = datas.filter((x) => x.e.d >= hoje), lista = ver === "sos" ? datas.filter((x) => x.sos.length) : datas;
      const kpiPapel = (p) => { const ps = futuras.flatMap((x) => p === "casa" ? x.casaPs : p === "artista" ? x.artistas.flatMap((a) => a.passos) : x.eq[p]);
        const r = MD().resumo(ps, sosTodos.filter((s) => s.papel === p));
        return `<button type="button" class="card md-kpi${ver === p ? " on" : ""}" data-acomp-ver="${ver === p ? "" : p}" aria-pressed="${ver === p}"><b>${esc(NOME_PAPEL[p])}</b><span class="md-kpi-v">${r.total ? r.pct + "%" : "–"}</span><span class="muted" style="font-size:12px">${r.total ? `${r.feitos} de ${r.total} feitos · ${r.atrasados} atrasados${["casa", "artista"].includes(p) ? "" : ` · ${r.sos} SOS`}` : "sem passos ainda"}</span></button>`; };
      const escalados = sosTodos.filter((s) => s.escalado);
      return `<div class="tag">Acompanhamento</div><h1>Quem faz o quê em cada data</h1>
      <p class="sub">Cada papel tem o seu modelo, como a campanha do Bruno: a sequência de ações por data, o próximo passo, o SOS quando algo atrasa e o "como fazer". Toque num papel para ver só ele; toque numa data para abrir as ações.</p>
      <div class="barra-acoes" style="margin-bottom:10px"><button class="btn sm" data-acomp-atualizar title="Busca de novo o que cada um marcou">Atualizar agora</button><button class="btn sm${ver === "sos" ? " pri" : ""}" data-acomp-ver="${ver === "sos" ? "" : "sos"}">${ver === "sos" ? "Ver todas as datas" : `Só as datas com SOS (${datas.filter((x) => x.sos.length).length})`}</button></div>
      <div class="md-kpis">${papeis.map(kpiPapel).join("")}</div>
      ${escalados.length ? `<div class="alert crit"><b>Escalado para a adm (${escalados.length})</b><ul class="passos md-lista">${escalados.map(htmlSos).join("")}</ul></div>` : ""}
      ${dobra("md-sos-todos", "SOS abertos", `${sosTodos.length} ${sosTodos.length === 1 ? "alerta" : "alertas"} com a ação de socorro pronta · toque para ver`, sosTodos.length ? `<ul class="passos md-lista">${sosTodos.map(htmlSos).join("")}</ul>` : `<p class="muted">Nenhum SOS aberto.</p>`)}
      ${dobra("md-padrao", "O modelo de cada papel (padrão)", "a sequência de ações por data, com prazo, quem faz, o que conta como feito e o método", padraoDosPapeis())}
      <h2>Datas (3 dias atrás até 35 dias à frente)</h2>
      ${lista.length ? `<div class="list">${lista.map((x) => dataNoAcomp(x, ["operacoes", "agenda", "marketing", "casa", "artista"].includes(ver) ? ver : "")).join("")}</div>` : vazio(ver === "sos" ? "Nenhuma data com SOS" : "Nenhuma data nos próximos 35 dias", "As datas do Notion e as criadas no portal entram aqui sozinhas.", "", "acompanhamento")}`;
    },
    // "Seu histórico": o que a própria pessoa fez nos últimos 30 dias (telaHistorico, para todo acesso).
    feito() { return telaHistorico(); },
    meu_hist() { return telaHistorico(); },
    // "Visão geral" (só leitura): todas as próximas datas da rede, com cidade, casa, line-up, contrato e Ficha da casa.
    geral() {
      const E = S.eq; if (!E) { carregarEquipe(); return carregando("a visão geral"); }
      const k = (x) => String(x || "").trim().toLowerCase(), hoje = hojeIso(), f = S.gf ||= { cidade: "" };
      const evs = [...(S.pac?.eventos || []).filter((e) => !e.z && e.d >= hoje), ...(E.datasP || []).filter((x) => x.status !== "cancelada" && String(x.dia).slice(0, 10) >= hoje).map(eventoDoPortal)].sort((a, b) => a.d.localeCompare(b.d));
      const cidades = [...new Set(evs.map((e) => e.c).filter(Boolean))].sort();
      const lista = evs.filter((e) => !f.cidade || e.c === f.cidade).slice(0, 80);
      const fichaDe = (e) => (E.casas || []).find((c) => k(c.dados?.nome) === k(e.h) || k(c.perfil?.vinculo_nome) === k(e.h) || c.id === e.kc);
      const contrDe = (e) => { const cs = (E.contr || []).filter((c) => c.evento_id === e.id && c.status !== "cancelado"); return !cs.length ? "–" : cs.every(ctAssinado) ? "✓ assinado" : "aguardando"; };
      return `<div class="tag">Visão geral</div><h1>Próximas datas da rede</h1><p class="sub">Um panorama das próximas datas da rede, pra você se situar.</p>
      <div class="filters"><select data-gf="cidade" aria-label="Cidade"><option value="">Todas as cidades (${evs.length})</option>${cidades.map((c) => `<option value="${esc(c)}"${c === f.cidade ? " selected" : ""}>${esc(c)} (${evs.filter((e) => e.c === c).length})</option>`).join("")}</select></div>
      ${tabela("geral", [
        { t: "Data", v: (e) => e.d, h: (e) => `<b>${esc(NOME_SEM[wdDe(e.d)].slice(0, 3))}, ${dt(e.d)}</b>` },
        { t: "Cidade", v: (e) => e.c || "", h: (e) => esc(e.c || "–") },
        { t: "Casa", v: (e) => e.h || "", h: (e) => esc(e.h || "–") },
        { t: "Line-up", v: (e) => (e.a || []).join(", "), h: (e) => esc((e.a || []).join(", ") || "a definir") },
        { t: "Contrato", v: (e) => contrDe(e), h: (e) => contrDe(e) },
        { t: "Ficha da casa", v: (e) => fichaDe(e) ? etapaCasaEq(E, fichaDe(e))[1] : "", h: (e) => { const c = fichaDe(e); return c ? badgeEtapa(etapaCasaEq(E, c)) : '<span class="muted">sem Ficha</span>'; } },
      ], lista.map((e) => ({ ...e, _click: "ev:" + e.id })), { i: 0, dir: 1 }, vazio("Nenhuma data por vir", "", "", "geral"))}`;
    },
    painel() {
      const E = S.eq; if (!E) { carregarEquipe(); return carregando("o painel"); }
      const P = S.pac, hoje = hojeIso(), em14 = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10);
      if (!P) return `<div class="tag">Painel da operação</div><h1>Eventos por data</h1><div class="alert warn"><b>Falta o código interno</b>Cole o código interno da equipe na aba Conta para ver os eventos.<div class="barra-acoes" style="margin-top:8px"><button class="btn sm" data-ir="conta">Abrir Minha conta</button></div></div>`;
      const k = (x) => String(x || "").trim().toLowerCase();
      const f = S.pf ||= { cidade: "", casa: "", status: "", foco: "" };
      const casaDe = (e) => (E.casas || []).find((c) => k(c.dados?.nome) === k(e.h) || k(c.perfil?.vinculo_nome) === k(e.h));
      const contratoDe = (e) => { const cs = (E.contr || []).filter((c) => c.evento_id === e.id && c.status !== "cancelado"); const anexado = (E.docs || []).some((d) => d.evento_id === e.id && d.tipo === "contrato");
        return cs.length ? (cs.every(ctAssinado) ? ["b-good", "assinado no site"] : ["b-warn", `${cs.filter((c) => !ctAssinado(c)).length} para assinar`]) : anexado ? ["", "PDF anexado (assinatura não confirmada)"] : ["b-crit", "sem contrato"]; };
      const linhas = P.eventos.filter((e) => !e.z && e.d >= hoje).map((e) => { const c = casaDe(e), ct = contratoDe(e);
        const pend = [...(!e.l ? ["sem link de ingressos"] : []), ...(ct[0] === "b-crit" ? ["sem contrato"] : []), ...(!c ? ["casa sem ficha no site"] : c.status !== "habilitada" ? [`ficha: ${STATUS_CASA[c.status]?.[1] || c.status}`] : []),
          ...((E.sol || []).some((x) => c && x.casa_id === c.id && x.status === "pendente") ? ["pedido de atualização da ficha"] : [])];
        return { e, c, ct, pend, atencao: e.d <= em14 && pend.length > 0, _click: "ev:" + e.id }; })
        .filter((l) => (!f.cidade || l.e.c === f.cidade) && (!f.casa || l.e.h === f.casa) && (!f.status || l.e.s === f.status) && (!f.foco || (f.foco === "atencao" ? l.atencao : f.foco === "contrato" ? l.ct[0] !== "b-good" : l.pend.length)));
      const todas = P.eventos.filter((e) => !e.z && e.d >= hoje), uniq = (xs) => [...new Set(xs.filter(Boolean))].sort();
      // Cada opção diz quantos eventos tem (a pessoa vê que é um filtro e o que vai sobrar).
      const sel = (id, rot, val, ops) => { const campo = { cidade: "c", casa: "h", status: "s" }[id];
        return `<select data-pf="${id}" aria-label="${rot}"><option value="">${rot} (${todas.length})</option>${ops.map((o) => `<option value="${esc(o)}"${o === val ? " selected" : ""}>${esc(o)} (${todas.filter((e) => e[campo] === o).length})</option>`).join("")}</select>`; };
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
        { t: "Casa", v: (l) => l.c ? etapaCasaEq(E, l.c)[1] : "", h: (l) => l.c ? badgeEtapa(etapaCasaEq(E, l.c)) : `<span class="muted">sem ficha no site</span>` },
        { t: "Pendências", n: 1, v: (l) => l.pend.length, h: (l) => l.pend.length ? l.pend.map((x) => `<span class="pill">${esc(x)}</span>`).join("") : "–" },
      ], linhas, { i: 0, dir: 1 }, vazio("Nenhum evento com esses filtros", "Mude os filtros acima.", "", "painel"))}
      <p class="muted" style="font-size:12px">Bonificações (como Estrella Galicia) e o status jurídico dos contratos assinados fora do site ainda não têm fonte validada: não aparecem aqui até a regra ser confirmada.</p>`;
    },
    agenda_casas() {
      const E = S.eq; if (!E) { carregarEquipe(); return carregando("a agenda das casas"); }
      if (E.disp === null) return faltaSchema("Agenda das casas");
      const k = (x) => String(x || "").trim().toLowerCase(), evs = (S.pac?.eventos || []).filter((e) => !e.z);
      const casas = [...new Set([...(E.disp || []).map((x) => x.casa_ref), ...(E.sem || []).filter((x) => x.casa_ref).map((x) => x.casa_ref), ...(E.conv || []).filter((c) => c.tipo === "casa" && c.vinculo_nome).map((c) => c.vinculo_nome)])].sort();
      const semDe = (ref) => { const c = (E.casas || []).find((x) => k(x.perfil?.vinculo_nome) === k(ref)); return semanaDe(E.sem, { casaRef: ref, fichaDias: c?.dados?.dias_semana }); };
      const sitDe = (ref, dia) => situacaoDia((E.disp || []).find((x) => k(x.casa_ref) === k(ref) && x.dia === dia), semDe(ref), dia);
      const [ano, mm] = (S.dispMes || hojeIso().slice(0, 7)).split("-").map(Number), diasMes = Array.from({ length: new Date(Date.UTC(ano, mm, 0)).getUTCDate() }, (_, i) => `${S.dispMes || hojeIso().slice(0, 7)}-${String(i + 1).padStart(2, "0")}`);
      const casa = S.agCasa && casas.includes(S.agCasa) ? S.agCasa : casas[0], mes = S.dispMes || hojeIso().slice(0, 7);
      const doMes = (x) => x.dia.startsWith(mes);
      const conflitos = (E.disp || []).filter((x) => x.situacao === "indisponivel" && evs.some((e) => e.d === x.dia && k(e.h) === k(x.casa_ref)));
      return `<div class="tag">Agenda das casas</div><h1>Disponibilidade por casa</h1>
      <p class="sub">O que cada casa informou na área Datas, junto com os eventos já confirmados. Disponível não é reserva: confirme com a casa antes de fechar a data. Só a casa altera a disponibilidade dela.</p>
      ${casas.length ? `<div class="filters"><label class="escolha">Ver a casa (toque para trocar)<select data-ag-casa aria-label="Casa">${casas.map((c) => `<option${c === casa ? " selected" : ""}>${esc(c)}</option>`).join("")}</select></label></div>
      ${semDe(casa).length ? `<p class="muted" style="font-size:13px">${esc(casa)} recebe toda semana: <b>${esc(semDe(casa).map((n) => NOME_SEM[n]).join(", "))}</b>.</p>` : ""}
      ${calendarioMes(mes, (dia) => { const sit = sitDe(casa, dia), e = evs.filter((x) => x.d === dia && k(x.h) === k(casa));
        return { classe: e.length ? (sit === "indisponivel" ? "conflito" : "cal-ev") : livreNo(sit) ? "livre" : sit === "indisponivel" ? "ocupado" : "", rotulo: e.length ? e.map((x) => (x.a || []).join(", ") || x.m).join(" · ") : sit === "semana" ? "toda semana" : sit === "disponivel" ? "disponível" : sit === "indisponivel" ? "indisponível" : "", clicavel: false }; })}
      <h2>Casas com dias livres neste mês</h2>${tabela("agmes", [
        { t: "Casa", v: (r) => r.casa, h: (r) => `<b>${esc(r.casa)}</b>` },
        { t: "Dias disponíveis", n: 1, v: (r) => r.livres.length, h: (r) => r.livres.length ? r.livres.map((d) => dtc(d)).join(", ") : "–" },
        { t: "Indisponíveis", n: 1, v: (r) => r.fora },
      ], casas.map((c) => ({ casa: c, livres: diasMes.filter((d) => d >= hojeIso() && livreNo(sitDe(c, d))), fora: diasMes.filter((d) => sitDe(c, d) === "indisponivel").length })), { i: 1, dir: -1 }, "")}
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
      // "Vale olhar primeiro" por AÇÃO (pedido da Marina, 18/11/2026): os mesmos blocos do "Para você", de todas as áreas,
      // com cada linha abrindo o item; o que está zerado aparece embaixo, em "Em dia".
      if (!S.hub) carregarHub();
      const blocos = pendenciasEquipe(E, ["operacoes", "agenda", "marketing"]).filter((b) => !b.info);
      const avisos = (E.avisos || []).length;
      const zerados = [["Conferir contrato assinado", "documentos"], ["Habilitar casas", "casas_cad"], ["Avaliar na curadoria", "curadoria"], ["Preparar contrato da casa", "documentos"], ["Preparar contrato de artista", "documentos"], ["Cobrar reenvio de contrato devolvido", "documentos"], ["Responder pedidos de show", "demanda", avisos]]
        .filter(([t, , n]) => n == null ? !blocos.some((b) => b.acao === t) : !n);
      const atalho = (aba, cor, num, sufixo, titulo, texto, ir) => `<button class="atalho" data-ir="${aba}" style="--cor:${cor}">${num == null ? "" : `<div class="num">${num}<small>${sufixo}</small></div>`}<b>${titulo}</b><p>${texto}</p><span class="ir">${ir} →</span></button>`;
      return `<div class="tag">Comece por aqui</div><h1>${oi}${primeiro ? ", " + esc(primeiro) : ""}</h1>
      <p class="inicio-oi">Três coisas para olhar hoje. O menu completo continua à esquerda${matchMedia("(max-width:959px)").matches ? ", no botão ☰" : ""}.</p>
      ${blocos.length || avisos ? `<h2 style="font-family:var(--sans);font-weight:600;font-size:16px;margin:18px 0 0">Vale olhar primeiro</h2>
      <div class="list" id="filaPrimeiro" style="margin-top:12px">${blocos.map((b) => blocoAcao(b, 3)).join("")}${avisos ? blocoAcao({ acao: "Responder pedidos de show", dica: "Pedidos no \u201cme avise\u201d esperando resposta.", aba: "demanda", itens: [], n: avisos }) : ""}</div>` : ""}
      <div style="margin-top:14px">${painelModelo(E, ["operacoes", "agenda", "marketing"])}</div>
      <div class="atalhos">
        ${atalho(adm ? "estrategia" : "operacao", "#7c8ff3", mes, mes == null ? "" : "de 50 datas este mês", "Como a rede está indo", adm ? "Cidades, casas e artistas que estão acima ou abaixo da média, e onde abrir datas a seguir." : "Calendário do mês, meta de 50 datas e o que acontece nos próximos 14 dias.", adm ? "Ver o painel" : "Ver a operação")}
        ${atalho("operacao", "#f9b436", alertas, alertas == null ? "" : alertas === 1 ? "ponto" : "pontos", "O que precisa de atenção", "Datas sem link de ingressos, noites sem público lançado e status desatualizados no Notion.", "Ver os alertas")}
        ${atalho("convites", "#fcdbe5", conv, conv === 1 ? "convite esperando" : "convites esperando", "Chamar alguém para a rede", "Convide uma artista ou casa que já trabalha com o Tranquilo. Ela recebe o link e o tutorial.", "Fazer um convite")}
      </div>
      ${zerados.length ? `<div style="margin-top:34px">${dobra("inicio-em-dia", blocos.length ? "Em dia" : "✓ Fila de hoje vazia", `${zerados.length} ${zerados.length === 1 ? "fila sem nada esperando" : "filas sem nada esperando"} · toque para ver quais`,
        `<div class="fila">${zerados.map(([t, aba]) => `<button data-ir="${aba}"><span class="q zero">0</span><span>${t}</span></button>`).join("")}</div>`)}</div>` : ""}
`;
    },
    curadoria() {
      const L = S.eq?.insc; if (!L) { carregarEquipe(); return carregando("fila de curadoria"); }
      const f = S.eqf ||= { status: "em_curadoria", faixa: "", q: "" };
      let ls = L.filter((i) => !f.status || i.status === f.status).filter((i) => !f.faixa || i.faixa === f.faixa);
      if (f.q) { const q = f.q.toLowerCase(); ls = ls.filter((i) => JSON.stringify(i.dados).toLowerCase().includes(q)); }
      const n = (s) => L.filter((i) => i.status === s).length;
      return `<div class="tag">Curadoria</div><h1>Fila de artistas</h1><p class="sub">Toda inscrição enviada passa pela pré-curadoria automática (pontuação de 0 a 100 e alertas). A equipe decide: aprovar, pedir ajustes ou não seguir.</p>
      ${filaNotionCuradoria()}
      ${blocoPropostas("artista")}
      ${blocoPreFichas("artista")}
      <div class="stats">${kpi(n("em_curadoria"), "aguardando curadoria")}${kpi(n("ajustes"), "com ajustes pedidos")}${kpi(n("aprovada"), "aprovadas")}${kpi(n("rascunho"), "rascunhos não enviados")}</div>
      <div class="filters"><select id="eqStatus" aria-label="Filtrar por status"><option value="">Todos os status (${L.length})</option>${Object.entries(STATUS_INSC).map(([k, [, t]]) => `<option value="${k}"${f.status === k ? " selected" : ""}>${t} (${n(k)})</option>`).join("")}</select>
      <select id="eqFaixa" aria-label="Filtrar por faixa"><option value="">Todas as faixas</option>${["Prioridade", "Avaliar", "Abaixo do corte"].map((x) => `<option value="${x}"${f.faixa === x ? " selected" : ""}>${x} (${L.filter((i) => i.faixa === x).length})</option>`).join("")}</select><input id="eqQ" placeholder="Buscar nome, cidade, gênero" value="${esc(f.q)}"></div>
      ${tabela("curad", [
        { t: "Artista", v: (i) => i.dados.nome_artistico, h: (i) => `<b>${esc(i.dados.nome_artistico || "(sem nome)")}</b><div class="muted" style="font-size:12px">${esc(i.dados.cidade_base || "")} ${esc(i.dados.estado || "")} · ${esc(i.dados.generos || "")}</div>` },
        { t: "Pontuação", n: 1, v: (i) => i.score, h: (i) => `<b>${i.score ?? "–"}</b>` },
        { t: "Faixa", v: (i) => i.faixa, h: (i) => i.faixa ? `<span class="badge ${i.faixa === "Prioridade" ? "b-good" : i.faixa === "Avaliar" ? "b-warn" : "b-serious"}">${esc(i.faixa)}</span>` : "–" },
        { t: "Formato", v: (i) => i.dados.formato_interesse },
        { t: "Alertas", v: (i) => (i.alertas || []).length, h: (i) => (i.alertas || []).map((a) => `<span class="pill">${esc(a)}</span>`).join("") || "–" },
        { t: "Status", v: (i) => i.status, h: (i) => badgeEtapa(etapaArtistaEq(S.eq, i)) },
        { t: "Enviada", v: (i) => i.enviado_em || "", h: (i) => i.enviado_em ? dt(i.enviado_em.slice(0, 10)) : "–" },
      ], ls.map((i) => ({ ...i, _click: "insc:" + i.id })), { i: 1, dir: -1 }, L.length ? null : vazio("A fila está vazia", "Quando uma artista enviar a inscrição, ela chega aqui com a pré-curadoria pronta. Para chamar artistas que já estão na rede, use Convites.", `<button class="btn" data-ir="convites">Abrir convites</button>`, "curadoria"))}`;
    },
    casas_cad() {
      const L = S.eq?.casas; if (!L) { carregarEquipe(); return carregando("cadastros de casas"); }
      const n = (s) => L.filter((c) => c.status === s).length;
      return `<div class="tag">Casas</div><h1>Cadastros e habilitação</h1><p class="sub">Habilitar o suficiente para testar; qualificar pela execução. Classificação depois das datas: 🟢 confiável, 🟡 desenvolvimento, 🔴 correção necessária, ⛔ suspensa.</p>
      ${blocoPropostas("casa")}
      ${blocoPreFichas("casa")}
      <div class="stats">${kpi(n("em_analise"), "aguardando análise")}${kpi(n("incompleto"), "faltando dados mínimos")}${kpi(n("habilitada"), "habilitadas")}${kpi(L.filter((c) => c.ja_parceira).length, "já parceiras")}</div>
      ${tabela("casc", [
        { t: "Casa", v: (c) => c.dados.nome, h: (c) => `<b>${esc(c.dados.nome || "(sem nome)")}</b><div class="muted" style="font-size:12px">${esc(c.dados.cidade || "")} · ${c.ja_parceira ? "já parceira" : "nova"}</div>` },
        { t: "Capacidade", n: 1, v: (c) => +c.dados.capacidade || null, h: (c) => fmt(+c.dados.capacidade || null) },
        { t: "Bloqueia habilitação", n: 1, v: (c) => c.pendencias?.habilitacao?.length ?? 0 },
        { t: "Bloqueia match", n: 1, v: (c) => c.pendencias?.match?.length ?? 0 },
        { t: "Pedidos de atualização", n: 1, v: (c) => (S.eq.sol || []).filter((x) => x.casa_id === c.id && x.status === "pendente").length, h: (c) => { const n = (S.eq.sol || []).filter((x) => x.casa_id === c.id && x.status === "pendente").length; return n ? `<span class="badge b-warn">${n}</span>` : "0"; } },
        { t: "Situação", v: (c) => c.status + etapaCasaEq(S.eq, c)[1], h: (c) => badgeEtapa(etapaCasaEq(S.eq, c)) },
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
        const ps = e ? R.passosDaData(modelo, e.d, Object.fromEntries(cs.map((c) => [c.item, true])), hojeIso(), e.m) : [];
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
      return `<div class="tag">Pessoas</div><h1>Contas na plataforma</h1><p class="sub">Artistas e casas criam a própria conta. Equipe e administração só são definidas aqui. O vínculo liga a conta ao histórico da artista ou da casa no Notion e libera as métricas dela. Na equipe, marque a área de cada pessoa: ela passa a ver só as abas e os botões da área. Sem área marcada, vê tudo.</p>
      ${tabela("pess", [
        { t: "Pessoa", v: (p) => p.nome || p.email, h: (p) => `<b>${esc(p.nome || "–")}</b><div class="muted" style="font-size:12px">${esc(p.email)}</div>` },
        { t: "Perfil", v: (p) => p.tipo, h: (p) => `<select data-tipo="${p.id}" data-antes="${p.tipo}" aria-label="Perfil de ${esc(p.nome || p.email)}"${p.id === S.conta.perfil.id ? ' disabled title="Você não pode mudar o seu próprio perfil"' : ""}>${Object.entries(ROTULO).map(([k, t]) => `<option value="${k}"${p.tipo === k ? " selected" : ""}>${t}</option>`).join("")}</select>` },
        { t: "Vínculo", v: (p) => p.vinculo_nome || "", h: (p) => ["artista", "casa"].includes(p.tipo) ? seletorVinculo(p) : p.tipo === "equipe" ? caixasAreas(p.areas, `data-area-conta="${p.id}"`) : "–" },
        { t: "Criada", v: (p) => p.criado_em, h: (p) => dt(p.criado_em.slice(0, 10)) },
        { t: "Acesso", v: (p) => p.tutorial_visto_em || "", h: (p) => `<div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn sm" data-link-senha="${esc(p.email)}">Enviar link de senha</button><button class="btn sm" data-enviar-tutorial="${esc(p.tipo)}|${esc(p.email)}|${esc(p.vinculo_nome || p.nome || "")}|${esc(p.whatsapp || "")}">Enviar tutorial</button></div><div class="muted" style="font-size:12px;margin-top:4px">${p.tutorial_visto_em ? "viu o tutorial em " + dt(p.tutorial_visto_em.slice(0, 10)) : "ainda não viu o tutorial"}</div>` },
      ], E.perfis, { i: 3, dir: -1 })}`;
    },
    convites() {
      const quemConvidou = (c) => { if (!c.criado_por) return "–"; const p = (S.eq?.perfis || []).find((x) => x.id === c.criado_por); return p ? (p.id === S.conta.perfil.id ? "Você" : (p.nome || p.email || "–")) : "–"; };
      const E = S.eq; if (!E) { carregarEquipe(); return carregando("convites"); }
      if (E.conv === null) return faltaSchema("Convites");
      const adm = S.conta.perfil.tipo === "adm", ars = S.conta.perfil.areas || [];
      // Perfil já vem no que é da pessoa: Gui (Operações) convida casa; Isa (Agenda) convida artista.
      const tipoSel = S.convTipo || (ars.includes("operacoes") && !ars.includes("agenda") ? "casa" : "artista"), pre = S.convPre || {};
      const acessos = (S.pac?.acessos || []).filter((a) => a.tipo === tipoSel);
      const contas = new Set((E.perfis || []).map((p) => p.email));
      return `<div class="tag">Convites</div><h1>Chamar quem já está na rede</h1>
      <p class="sub">Para artistas e casas que já trabalham com o Tranquilo. A pessoa recebe um link por e-mail, entra, cria a senha e já cai na própria área, vinculada ao histórico dela. O tutorial abre sozinho no primeiro acesso.</p>
      <div class="card"><div class="fgrid">
        <label class="fcampo"><b>Quem você está convidando?</b><select id="cvTipo" style="font-weight:600">${[...(adm || !ars.length || ars.includes("agenda") ? [["artista", "Artista"]] : []), ...(adm || !ars.length || ars.includes("operacoes") ? [["casa", "Casa"]] : []), ...(adm ? [["equipe", "Equipe"], ["adm", "Administração"]] : [])].map(([k, t]) => `<option value="${k}"${tipoSel === k ? " selected" : ""}>${t}</option>`).join("")}</select></label>
        ${["artista", "casa"].includes(tipoSel) && acessos.length ? `<label class="fcampo"><b>Já tem histórico no Tranquilo? (opcional)</b>${acessos.length ? `<select id="cvVinc"><option value="">Sem vínculo por enquanto</option>${acessos.map((a) => `<option value="${esc(a.codigo)}|${esc(a.nome)}"${pre.nome === a.nome ? " selected" : ""}>${esc(a.nome)}${a.cidades ? " · " + esc(a.cidades) : ""}</option>`).join("")}</select>` : `<span class="muted" style="font-size:13px">A lista de nomes vem com o código de administração. Sem ele, o convite sai sem vínculo e a administração liga depois em Pessoas.</span>`}</label>` : ""}
        ${tipoSel === "equipe" ? `<div class="fcampo"><b>Área (o que a pessoa vai fazer)</b>${caixasAreas(pre.areas, 'data-cv-area')}<span class="muted" style="font-size:12px">Sem área marcada, a pessoa vê tudo da equipe.</span></div>` : ""}
        <label class="fcampo"><b>Nome ${tipoSel === "casa" ? "da casa" : tipoSel === "artista" ? "da artista" : "da pessoa"}</b><input id="cvNome" value="${esc(pre.nome || S.convRasc?.nome || "")}" autocomplete="off"></label>
        <label class="fcampo"><b>E-mail</b><input id="cvEmail" type="email" value="${esc(S.convRasc?.email || "")}" autocomplete="off"></label>
        <label class="fcampo"><b>WhatsApp (opcional)</b><input id="cvWa" inputmode="tel" placeholder="DDD + número" value="${esc(S.convRasc?.wa || "")}" autocomplete="off"></label>
      </div><div class="err" role="status" aria-live="polite" id="cverr"></div><div class="barra-acoes">${comExplica(`<button class="btn pri" id="cvOk" data-tipo="${tipoSel}">Enviar convite de ${esc(ROTULO[tipoSel].toLowerCase())}</button>`, "A pessoa recebe um e-mail com o link para entrar. Depois você também pode mandar a mensagem pelo WhatsApp.")}</div></div>
      <h2>Convites enviados</h2>
      ${tabela("conv", [
        { t: "Pessoa", v: (c) => c.nome || c.email, h: (c) => `<b>${esc(c.nome || "–")}</b><div class="muted" style="font-size:12px">${esc(c.email)}</div>` },
        { t: "Perfil", v: (c) => c.tipo, h: (c) => ROTULO[c.tipo] + (c.areas?.length ? `<div class="muted" style="font-size:12px">${esc(nomesAreas(c.areas))}</div>` : "") },
        { t: "Vínculo", v: (c) => c.vinculo_nome || "", h: (c) => esc(c.vinculo_nome || "–") },
        // Quem enviou o convite (pedido da Marina, 18/11/2026) e quando.
        { t: "Enviado por", v: (c) => quemConvidou(c), h: (c) => `${esc(quemConvidou(c))}${c.criado_em ? `<div class="muted" style="font-size:12px">${dt(String(c.criado_em).slice(0, 10))}</div>` : ""}` },
        { t: "Situação", v: (c) => c.aceito_em ? 2 : contas.has(c.email) ? 1 : 0, h: (c) => c.aceito_em ? `<span class="badge b-good">entrou em ${dt(c.aceito_em.slice(0, 10))}</span>` : contas.has(c.email) ? `<span class="badge b-warn">conta criada, falta confirmar o e-mail</span>` : `<span class="badge">aguardando</span>` },
        { t: "Tutorial", v: (c) => c.tutorial_enviado_em || "", h: (c) => c.tutorial_enviado_em ? `enviado em ${dt(c.tutorial_enviado_em.slice(0, 10))}` : `<span class="muted">não enviado</span>` },
        { t: "", v: () => 0, h: (c) => `<div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn sm" data-reconvidar="${esc(c.email)}">${c.aceito_em ? "Mandar link de entrada" : "Reenviar convite"}</button><button class="btn sm" data-enviar-tutorial="${esc(c.tipo)}|${esc(c.email)}|${esc(c.nome || "")}|${esc(c.whatsapp || "")}">Enviar tutorial</button>${c.aceito_em ? "" : `<button class="btn sm" data-cancelar-convite="${esc(c.email)}">Cancelar</button>`}</div>` },
      ], E.conv, { i: 3, dir: 1 }, vazio("Nenhum convite ainda", "Escolha a artista ou a casa acima, coloque o e-mail e envie. O convite aparece aqui com a situação de cada pessoa.", "", "convites"))}`;
    },
    campanha() {
      const H = S.hub; if (!H) { carregarHub(); return carregando("campanha"); }
      if (H.erro) return `<div class="alert crit"><b>Não foi possível carregar a campanha</b>${esc(H.erro)} <button class="btn sm" data-hub-recarregar>Tentar de novo</button></div>`;
      const feitos = Object.fromEntries((H.feitos || []).map((f) => [f.item_id, f]));
      if (!H.campanhas.length) return `<div class="tag">Campanha</div><h1>Campanha de divulgação</h1>${vazio("Nenhuma campanha para a sua casa ainda", "Quando a equipe do Tranquilo carregar a campanha da sua casa, os dias e as ações aparecem aqui. Se a equipe já disse que carregou e nada aparece, fale com ela: a campanha precisa estar no mesmo nome da sua casa.", "", "campanha")}`;
      return `<div class="tag">Campanha</div><h1>Campanha de divulgação</h1><p class="sub">O que postar e mandar em cada dia. Toque na campanha para ver os dias e marque "Feito" quando terminar: vale para toda a equipe da casa, e o Tranquilo acompanha.</p>
      ${H.campanhas.map((c) => cartaoCampanha(c, H, feitos, "casa")).join("")}`;
    },
    campanhas() {
      if (!S.eq) carregarEquipe();   // nomes de quem marcou e WhatsApp das casas
      const H = S.hub; if (!H) { carregarHub(); return carregando("campanhas"); }
      if (H.erro) return `<div class="alert crit"><b>Não foi possível carregar as campanhas</b>${esc(H.erro)} <button class="btn sm" data-hub-recarregar>Tentar de novo</button></div>`;
      const feitos = Object.fromEntries((H.feitos || []).map((f) => [f.item_id, f])), hoje = hojeSP();
      const pend = (c) => H.itens.filter((i) => i.campanha_id === c.id && !feitos[i.id] && i.dia <= hoje).length;
      const lista = [...H.campanhas].sort((x, y) => pend(y) - pend(x) || String(x.casa_ref).localeCompare(String(y.casa_ref)));
      return `<div class="tag">Campanhas</div><h1>Campanhas das casas</h1><p class="sub"><b>O que é seu aqui:</b> acompanhar se cada casa está fazendo os dias da campanha, cobrar a casa quando um dia atrasar e ajustar o dia quando o plano mudar.</p>
      <p class="muted" style="font-size:13px">A casa vê exatamente estes dias e marca "Feito" do lado dela. Toque numa casa para abrir os dias; atrasado = dia que já passou sem "Feito".</p>
      ${lista.length ? `<div class="camp-lista">${lista.map((c) => cartaoCampanha(c, H, feitos, "equipe")).join("")}</div>` : vazio("Nenhuma campanha carregada", "Carregue a campanha de uma casa logo abaixo, com a página ou o arquivo de dados do Bruno.", "", "campanhas")}
      ${formCampanha(H)}
      ${coberturaCasas(H)}`;
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
        return `<div class="card"><div class="row"><div><b>${esc(m.titulo)}</b><div class="muted" style="font-size:13px">${esc(m.tipo_material)} · versão ${esc(v?.versao || "–")}${v?.resumo ? " · " + esc(v.resumo) : ""}</div>${quem}</div><div style="display:flex;gap:6px;flex-wrap:wrap">${versaoComConteudo(H, m) || MANUAIS[m.slug] ? botaoLer(H, m) : url ? `<a class="btn sm" href="${escHref(url)}" target="_blank" rel="noopener">Abrir em outra aba ↗</a>` : ""}${copia ? `<a class="btn sm" href="${escHref(copia)}" target="_blank" rel="noopener" title="Cria uma cópia no seu Google Drive para você editar. O original não muda.">Fazer minha cópia</a>` : ""}</div></div>${ciencia}</div>`;
      });
      const nPend = H.pendentes?.length || 0;
      return `<div class="tag">Materiais</div><h1>Guias e materiais</h1><p class="sub">${equipe ? "Os materiais publicados para artistas e casas, com quem já confirmou a leitura da versão atual." : "Guias, playbooks e modelos do Tranquilo. Os modelos abrem só para leitura: para usar, toque em \"Fazer minha cópia\" (ou Arquivo › Fazer uma cópia)."}</p>
      ${!equipe && nPend ? `<div class="alert warn" style="margin-bottom:12px"><b>${nPend} ${nPend === 1 ? "material pede" : "materiais pedem"} sua confirmação de leitura</b>Eles aparecem abaixo com o botão "Li e estou ciente".</div>` : ""}
      ${equipe && (temArea("operacoes") || temArea("marketing")) ? formDocsPagina() + formMateriais(H) : ""}
      <div class="list">${cards.join("") || vazio("Nenhum material publicado ainda", "Quando a equipe publicar guias e modelos, eles aparecem aqui.", "", "materiais")}</div>`;
    },
    documentos() {
      const E = S.eq; if (!E) { carregarEquipe(); return carregando("documentos"); }
      if (E.docs === null) return faltaSchema("Documentos");
      // Casa ainda sem vínculo aparece pelo nome da Ficha (não pelo nome de quem criou a conta).
      // Contrato da casa vai só para o dono: funcionários (Líder Local, Anfitrião…) ficam fora da lista.
      const contas = (E.perfis || []).filter((p) => p.tipo === "artista" || (p.tipo === "casa" && !p.funcoes?.length)).map((p) => ({ ...p, rotulo: nomeDaConta(p) + (p.tipo === "casa" && p.nome && p.nome !== nomeDaConta(p) ? ` (${p.nome})` : "") })).sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"));
      const nomeConta = Object.fromEntries((E.perfis || []).map((p) => [p.id, nomeDaConta(p)]));
      // Datas do Notion (agenda) e as criadas no portal pela Central.
      const datasP = (E.datasP || []).map(eventoDoPortal).filter((e) => !e.z);
      const datas = [...(S.pub?.agenda || []).filter((e) => e.id), ...datasP].sort((a, b) => a.d.localeCompare(b.d));
      const dataTxt = (id) => { const e = datas.find((x) => x.id === id) || S.pac?.eventos?.find((x) => x.id === id); return e ? `${dt(e.d)} · ${e.c || e.h}` : id ? id.slice(0, 8) : "–"; };
      return `<div class="tag">Documentos</div><h1>Contratos e materiais</h1><p class="sub">Gere o contrato de cada data para a artista ou a casa (vai já assinado pelo Tranquilo; a pessoa assina e envia de volta), ou anexe um contrato pronto (link). Os dois aparecem no passo a passo dela, em "Contrato e materiais". Abaixo, os arquivos que artistas e casas enviaram.</p>
      ${secaoContratos(E, contas, datas, dataTxt, nomeConta)}
      <details class="card"><summary><b>Anexar documento pronto (link)</b> <span class="muted" style="font-size:13px;font-weight:400">· contrato assinado fora do portal</span></summary><div class="grid g2" style="margin-top:10px">
        <label class="fcampo"><b>Tipo</b><select id="docTipo"><option value="contrato">Contrato de uma data</option><option value="modelo">Modelo de contrato (para todos)</option><option value="outro">Outro documento de uma data</option></select></label>
        <label class="fcampo"><b>Nome</b><input id="docTit" maxlength="120" placeholder="ex.: Contrato Joyce Alane · BH 05/11"></label>
        <label class="fcampo"><b>Conta</b><select id="docConta"><option value="">Escolha a artista ou casa</option>${contas.map((p) => `<option value="${p.id}">${esc(p.rotulo)} · ${p.tipo}</option>`).join("")}</select></label>
        <label class="fcampo"><b>Data</b><select id="docEv"><option value="">Escolha a data</option>${datas.map((e) => `<option value="${esc(e.id)}">${dt(e.d)} · ${esc(e.c)} · ${esc(e.a.join(", ") || e.m)}</option>`).join("")}</select></label>
        <label class="fcampo" style="grid-column:1/-1"><b>Link (Drive, Dropbox, DocuSign…)</b><input id="docUrl" maxlength="500" placeholder="https://"></label>
      </div><div class="barra-acoes">${comExplica(`<button class="btn pri" id="docOk">Anexar o documento</button>`, "A pessoa passa a ver o link no passo a passo dela.")}</div><div class="err" role="status" aria-live="polite" id="docErr"></div>
      <p class="muted" style="font-size:13px;margin:6px 0 0">Confira se o link está compartilhado com a pessoa (ou "qualquer pessoa com o link").</p></details>
      <details style="margin-top:18px"><summary>Documentos anexados (${(E.docs || []).length})</summary>${tabela("docs", [
        { t: "Documento", v: (d) => d.titulo, h: (d) => `<a href="${escHref(d.url)}" target="_blank" rel="noopener">${esc(d.titulo)}</a>` },
        { t: "Tipo", v: (d) => d.tipo }, { t: "Conta", v: (d) => nomeConta[d.user_id] || (d.tipo === "modelo" ? "todos" : "–") },
        { t: "Data", v: (d) => d.evento_id, h: (d) => d.tipo === "modelo" ? "–" : esc(dataTxt(d.evento_id)) },
        { t: "", v: () => 0, h: (d) => `<button class="btn sm" data-apagar-doc="${d.id}">Remover</button>` },
      ], E.docs || [], { i: 0, dir: 1 }, vazio("Nenhum documento anexado", "Anexe o modelo de contrato e o contrato de cada data.", "", "convites"))}</details>
      <details style="margin-top:10px"><summary>Arquivos recebidos de artistas e casas (${(E.arqs || []).length})</summary>${tabela("arqs", [
        { t: "Arquivo", v: (f) => f.nome, h: (f) => `<a href="#" data-arquivo="${esc(f.caminho)}">${esc(f.nome.replace(/^\d+-/, ""))}</a>` },
        { t: "Quem enviou", v: (f) => nomeConta[f.user_id] || f.user_id.slice(0, 8) },
        { t: "Data", v: (f) => f.evento_id, h: (f) => esc(dataTxt(f.evento_id)) },
        { t: "Enviado em", v: (f) => f.em, h: (f) => f.em ? dt(String(f.em).slice(0, 10)) : "–" },
      ], E.arqs || [], { i: 3, dir: -1 }, vazio("Nenhum material enviado ainda", "Riders, mapas de palco e fotos enviados pelas artistas e casas aparecem aqui.", "", "convites"))}</details>`;
    },
    relatos() {
      const E = S.eq; if (!E) { carregarEquipe(); return carregando("relatos"); }
      if (E.relatos === null) return faltaSchema("Relatos");
      const quem = Object.fromEntries((E.perfis || []).map((p) => [p.id, p.email]));
      const aparelho = (ua) => /Mobile|Android|iPhone/i.test(ua || "") ? "celular" : "computador";
      return `<div class="tag">Relatos</div><h1>O que as pessoas contaram</h1><p class="sub">Tudo o que chega pelo botão "Algo deu errado?", com a tela, a conta e os últimos erros daquela aba. A lista completa de uso e erros fica na tabela diario do Supabase.</p>
      <div class="list">${(E.relatos || []).map((r) => {
        const d = r.detalhe || {}, rec = (d.recentes || []).filter((x) => x.acao !== "tela");
        const txt = String(d.texto || "");
        return dobra("rel:" + r.id, esc(quem[r.user_id] || d.contato || "visitante"), `${new Date(r.criado_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} · ${esc(r.tela || "")} · ${esc(txt.length > 70 ? txt.slice(0, 70) + "…" : txt)}`, `<p class="muted" style="font-size:13px;margin:0">${esc(r.perfil || "")} · ${esc(r.tela || "")} · ${aparelho(r.navegador)}</p>
        <p style="margin:8px 0">${esc(txt)}</p>
        ${rec.length ? `<details><summary>${rec.length} erro${rec.length > 1 ? "s" : ""} ou aviso${rec.length > 1 ? "s" : ""} antes do relato</summary><ul class="passos">${rec.map((x) => `<li><b>${esc(x.h || "")} · ${esc(x.acao)}</b> <span class="muted">${esc(x.tela || "")}</span><br><span class="muted" style="font-size:13px">${esc(x.texto || x.msg || [x.alvo, x.status].filter(Boolean).join(" · "))}</span></li>`).join("")}</ul></details>` : `<span class="muted" style="font-size:13px">Nenhum erro registrado antes do relato.</span>`}`, { classe: "linha" });
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
      const divulgar = `<button class="btn pri" data-copy="${esc(link)}">Copiar link do "me avise"</button><a class="btn" href="https://wa.me/?text=${encodeURIComponent("Quer saber quando tem show do Tranquilo na sua cidade? Deixa seu contato aqui: " + link)}" target="_blank" rel="noopener">Divulgar no WhatsApp</a><a class="btn ghost" href="${escHref(link)}" target="_blank" rel="noopener">Ver como o público vê</a>`;
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
      // Com data marcada, "Contrato e repasse" só fica ✓ quando o contrato da data foi assinado (ou o arquivo assinado chegou).
      const ctFeito = meusContratos().some((c) => c.status === "assinado" || arqsContrato(c).length);
      etapa = futuras.length ? (ctFeito ? 6 : 5) : evs.length ? 8 : 4;
      if (!p.codigo_acesso && !evs.length) agora = `<div class="alert good"><b>Você foi aprovada na rede${i.parecer ? "" : "!"}</b>${esc(i.parecer || "")} Próximo passo: a equipe propõe datas e cidades. Quando a primeira data for confirmada, os passos de cada show aparecem aqui.</div>
        <div class="card"><b>Enquanto isso</b><ul class="passos"><li>Confira se o release, a foto e os links estão atualizados: eles vão para a sua página no site do Tranquilo.</li><li>Mantenha a disponibilidade e as cidades de interesse em dia.</li><li>Se a equipe te mandou um código de acesso, vincule na aba Conta.</li></ul></div>`;
      else if (!evs.length) agora = `<div class="alert good"><b>Aprovada e vinculada como ${esc(p.vinculo_nome)}</b>Nenhuma data em andamento agora. Quando uma data for confirmada, os passos aparecem aqui.</div>`;
    }
    // Artista que já é da rede (vinculada, com datas) não precisa de inscrição: o aviso de inscrição sai.
    if (p.codigo_acesso && evs.length && (!i || ["rascunho", "aprovada"].includes(i.status))) { etapa = Math.max(etapa, 6); if (!i || i.status === "rascunho") agora = ""; }
    const comoFunciona = etapa < 2 ? dobra("art-como", "Como funciona", "3 etapas: inscrição, curadoria e datas", `<div class="grid g3">${[["1", "Inscrição", "Release, links, rider e as cidades onde quer tocar. A pré-curadoria mostra na hora a força da inscrição."], ["2", "Curadoria", "A equipe do Tranquilo avalia e responde por aqui: aprovada, ajustes ou não seguiu desta vez."], ["3", "Datas", "Com a data confirmada, cada show ganha um passo a passo com prazos, do material de divulgação ao pós-show."]].map(([n, t, x]) => `<div class="card"><div class="kpi"><div class="v" style="color:var(--violet)">${n}</div></div><h3 style="margin-top:12px">${t}</h3><p class="muted" style="margin:0">${x}</p></div>`).join("")}</div>`, { classe: "como-func" }) : "";
    const et = i?.status === "aprovada" ? etapaArtista(i, meusContratos()) : null;
    return `<div class="tag">Artista</div><h1>Olá, ${esc(p.nome || i?.dados?.nome_artistico || "")}</h1>
    <p class="sub">Aqui fica o que você precisa fazer em cada etapa, do cadastro ao pós-show.</p>
    ${et ? `<div class="card row" style="margin-bottom:12px" id="etapaConta"><span><b>Sua situação</b> ${badgeEtapa(et)}</span>${/Contrato (enviado|devolvido)/.test(et[1]) ? `<button class="btn sm pri" data-ir="contratos_meus">Abrir o contrato</button>` : ""}</div>` : ""}
    ${linhaTempo(etapas, etapa)}${agora}${comoFunciona}
    ${evs.length ? `<h2>Suas datas</h2><p class="sub">Passo a passo de cada show, com prazo contado a partir da data. Marque o que já fez: a equipe acompanha por aqui.</p>${painelConta(evs, "artista")}<div class="list">${evs.map((e) => blocoPassos(e, "artista")).join("")}</div>` : ""}`;
  }
  // Parte 1 da Ficha (Sua unidade): textos do modelo v1 e os combinados desta casa, registrados pela Central.
  // Combinado ainda não registrado aparece vazio (nunca um valor de exemplo ou de outra casa).
  const CONTATOS_FICHA = [["gui", "Operação, implantação, receitas e repasses", "Gui · Operações"], ["isa", "Datas, artistas e line-up", "Isa · Comercial e Artístico"], ["bruno", "Divulgação e materiais", "Bruno · Marketing"], ["zerrinha", "Comunidade e tripé social", "Zerrinha · Comunidade"]];
  function parteUmCasa(c) {
    const cb = c?.combinados || {}, nada = '<span class="muted">Ainda não registrado pela Operações</span>';
    const pct = (o, ks) => o && ks.every(([k]) => o[k] != null && o[k] !== "") ? ks.map(([k, t]) => `${esc(o[k])}% ${t}`).join(" · ") : nada;
    const eq = S.conta.equipe ? TQEquipe.cobertura(S.conta.equipe) : null;
    // Começa recolhida (é consulta, não pendência): uma linha diz o que tem dentro.
    return `<details class="card fsec" data-dobra="ficha-parte1"${S.dobras?.["ficha-parte1"] ? " open" : ""}><summary><span class="fsec-n" aria-hidden="true">i</span><span class="fsec-tit"><h3>Parte 1 · Sua unidade</h3><span class="fsec-res">Para ler: como vai funcionar, divisão das receitas, seus contatos no Tranquilo e próximos passos</span></span></summary><div class="fsec-corpo"><h4 style="margin:0 0 6px">Como vai funcionar</h4>
      <dl class="kv"><dt>Produtos</dt><dd>Tranquilo Descubra e Tranquilo Apresenta</dd><dt>Ingressos</dt><dd>Vendidos pela Ingresse, parceira do Tranquilo. As vendas são acompanhadas em conjunto pelo Tranquilo e pela casa.</dd><dt>Datas e artistas</dt><dd>Definidos com a Isa (Comercial e Artístico)</dd></dl>
      <h4 style="margin:12px 0 6px">Divisão das receitas</h4>
      <dl class="kv"><dt>Bilheteria</dt><dd>${pct(cb.bilheteria, [["artista", "Artista"], ["casa", "Casa"], ["tranquilo", "Tranquilo"]])}</dd><dt>Alimentos e bebidas</dt><dd>${pct(cb.aeb, [["casa", "Casa"], ["tranquilo", "Tranquilo"]])}</dd></dl>
      <p class="muted" style="font-size:13px">Custos logísticos apresentados e aprovados antes são descontados da bilheteria antes da divisão. O Tranquilo fecha cada data e faz os repasses nos prazos do contrato. Sem aluguel do espaço e sem promessa de lotação.</p>
      <h4 style="margin:12px 0 6px">Seus contatos no Tranquilo</h4>
      <div class="tbl-wrap" style="overflow-x:auto"><table class="tbl pilha"><thead><tr><th>Assunto</th><th>Quem</th><th>Contato</th></tr></thead><tbody>${CONTATOS_FICHA.map(([k, a, q]) => `<tr><td>${esc(a)}</td><td>${esc(q)}</td><td>${cb.contatos?.[k] ? `WhatsApp ${esc(cb.contatos[k])}` : nada}</td></tr>`).join("")}</tbody></table></div>
      <h4 style="margin:12px 0 6px">Próximos passos</h4>
      <ul class="passos"><li class="${c ? "feito" : ""}"><b>Primeiras informações da casa</b> <span class="muted">· ${c ? "feito" : "a fazer"}</span></li>
      <li class="${c?.enviado_em ? "feito" : ""}"><b>Ler o Guia e devolver esta Ficha preenchida</b> <span class="muted">· até 3 dias após receber${c?.enviado_em ? " · feito" : ""}</span></li>
      <li><b>Conversa de alinhamento com a Operações, a partir das suas dúvidas</b> <span class="muted">· logo depois</span></li>
      <li class="${eq?.tripe ? "feito" : ""}"><b>Líder Local, anfitrião e social media definidos</b> <span class="muted">· até 10 dias após receber${eq?.tripe ? " · feito" : ""}</span></li>
      <li><b>Primeiras datas com a Isa</b> <span class="muted">· com a equipe definida</span></li></ul></div></details>`;
  }
  // Equipe da casa em UMA lista (pedido da Marina, 18/11/2026): uma linha pequena por função, com quem ocupa (✓) ou
  // "Falta"; a linha abre para mostrar o que a função faz, o "Quando" e as pessoas. A mesma lista serve à Equipe da casa
  // (dono e equipe), à "Sua equipe" da Ficha e aos Treinamentos (a Central vê a equipe de cada casa).
  // As linhas da casa: as funções obrigatórias, a reserva e o bar (informativo: é do dono e não entra no portal).
  const RESERVA_EQ = { k: "reserva", titulo: "Reserva", desc: "Cobre quem faltar na semana do evento. Tem também uma função (escolhida ao cadastrar).", quando: "Definida na semana do evento" };
  const linhasCasaEq = () => [...TQEquipe.FUNCOES.filter((f) => f[4]).map(([k, , desc, quando]) => ({ k, titulo: TQEquipe.CURTO[k], desc, quando })), RESERVA_EQ,
    { k: "bar", titulo: "Bar", desc: TQEquipe.FUNCOES.find((f) => f[0] === "bar")[2], quando: TQEquipe.FUNCOES.find((f) => f[0] === "bar")[3], info: "responsabilidade do dono, sem acesso ao portal" }];
  const quemNaFuncao = (L, k) => (L || []).filter((m) => k === "reserva" ? m.reserva : !m.reserva && (m.funcoes || []).includes(k));
  /** "Faltam 3 de 6" ou "Equipe completa" (as 5 funções obrigatórias e a reserva). */
  function fraseEquipe(cob) {
    const f = TQEquipe.faltando(cob).length, tot = TQEquipe.OBRIGATORIAS.length + 1;
    return cob.completa ? "Equipe completa" : f ? `Faltam ${f} de ${tot}` : "Falta acertar a equipe";
  }
  // o: { chave (prefixo das linhas abertas), dono, pessoa(m, linha) → html, form: { k, html } }
  function listaEquipe(L, linhas, o = {}) {
    const abertas = S.eqlinAbertas || [];
    return `<div class="eqlista">${linhas.map((r) => {
      const quem = quemNaFuncao(L, r.k), id = `${o.chave || "eq"}:${r.k}`, st = quem.length ? "ok" : r.info ? "info" : "falta";
      const resumo = quem.length ? `<span class="eqlin-quem">${esc(quem[0].nome)}${quem[0].whatsapp ? ` <span class="muted">· ${esc(quem[0].whatsapp)}</span>` : ""}${quem.length > 1 ? ` <span class="badge">+${quem.length - 1}</span>` : ""}</span>`
        : r.info ? `<span class="eqlin-quem muted">${esc(r.info)}</span>` : `<span class="eqlin-quem"><span class="badge b-warn">Falta</span></span>`;
      const marca = `<span class="eqlin-st" aria-hidden="true">${st === "ok" ? "✓" : st === "info" ? "i" : "!"}</span>`;
      const form = o.form && o.form.k === r.k ? o.form.html : "";
      return `<details class="eqlin eqlin-${st}" data-eqlin="${esc(id)}"${form || abertas.includes(id) ? " open" : ""}><summary>${marca}<b>${esc(r.titulo)}</b>${resumo}${o.dono && st === "falta" ? `<button class="btn sm pri" data-eqc-nova="${r.k}">Adicionar</button>` : ""}</summary>
        <div class="eqlin-corpo">${r.desc ? `<p class="muted">${esc(r.desc)}${r.quando ? ` <b>Quando:</b> ${esc(r.quando)}.` : ""}</p>` : ""}${quem.map((m) => (o.pessoa || pessoaEqSimples)(m, r)).join("")}${form}</div></details>`;
    }).join("")}</div>`;
  }
  const pessoaEqSimples = (m, r) => `<div class="eqlin-pessoa"><span><b>${esc(m.nome)}</b>${r.k === "reserva" ? ` <span class="muted">· ${esc(nomesFuncoes(m.funcoes))}</span>` : ""}<span class="muted eqlin-contato">${esc([m.whatsapp, m.email].filter(Boolean).join(" · ") || "sem contato")}</span></span></div>`;
  // "Sua equipe" da Ficha: mostra a Equipe da casa (a fonte é uma só; edita-se lá).
  // Respostas da Ficha em texto (WhatsApp/Tranks), na ordem do modelo do Gui. sensivel=false deixa de fora Dono A e repasses.
  function textoFicha(d, sensivel, equipe) {
    return F_CASA.filter(([, , , sens]) => sensivel || !sens).map(([titulo, , cs]) => `*${titulo}*\n` + cs.map(([k, rot, tipo, opts]) => { let v = valorCasa(d, k); if (Array.isArray(v)) v = v.map((x) => (opts || []).find(([o]) => o === x)?.[1] || x).join(", "); else if (tipo === "select") v = (opts.find(([o]) => o === v) || [, v])[1]; return `${rot}: ${v || ""}`; }).join("\n")).join("\n\n")
      + (equipe ? "\n\n*Sua equipe*\n" + [["lider", "Líder Local (produtor)", ["nome", "whatsapp", "email"]], ["anfitriao", "Anfitrião(ã)", ["nome", "whatsapp", "instagram"]], ["social_media", "Social Media", ["nome", "whatsapp", "instagram"]], ["som", "Técnico(a) de som", ["nome", "whatsapp", "observacao"]]]
        .map(([f, t, ks]) => { const m = equipe.find((x) => !x.reserva && (x.funcoes || []).includes(f)) || {}; return `${t}: ${ks.map((k) => m[k] || "").filter(Boolean).join(" · ")}`; }).join("\n") : "");
  }
  function equipeNaFicha() {
    const L = S.conta.equipe; if (L === undefined) carregarEquipeCasa();
    // Os 4 blocos do modelo do Gui, cada um numa linha pequena que abre com os campos (Nome, WhatsApp…).
    const linhas = [["lider", "Líder Local (produtor)", "Tripé · conduz o dia do evento e fala com os artistas. Pode ser o próprio Dono A.", [["nome", "Nome"], ["whatsapp", "WhatsApp"], ["email", "E-mail"]]],
      ["anfitriao", "Anfitrião(ã)", "Tripé · conduz o público durante o evento", [["nome", "Nome"], ["whatsapp", "WhatsApp"], ["instagram", "Instagram"]]],
      ["social_media", "Social Media", "Tripé · registra o evento de acordo com o briefing", [["nome", "Nome"], ["whatsapp", "WhatsApp"], ["instagram", "Instagram"]]],
      ["som", "Técnico(a) de som", "", [["nome", "Nome"], ["whatsapp", "WhatsApp"], ["observacao", "Observação"]]]].map(([k, titulo, desc, campos]) => ({ k, titulo, desc, campos }));
    const pessoa = (m, r) => `<dl class="kv eqlin-kv">${r.campos.map(([k, t]) => `<dt>${t}</dt><dd>${m[k] ? esc(m[k]) : '<span class="muted">—</span>'}</dd>`).join("")}</dl>`;
    const cob = Array.isArray(L) ? TQEquipe.cobertura(L) : null;
    return `<section class="card fsec"><h3>Sua equipe</h3><p class="muted" style="margin:-4px 0 10px;font-size:14px">Precisa estar completa antes do primeiro evento. Cada função é de uma pessoa diferente; a única exceção é o Dono A, que pode ser também o Líder Local. O bar é responsabilidade do Dono A: o Tranquilo não fala com a equipe de bar.</p>
      ${cob ? `<p class="eqlin-frase"><b>${cob.completa ? "✓ Equipe completa" : esc(fraseEquipe(cob))}</b>${cob.completa ? "" : ` <span class="muted">· ${esc(TQEquipe.listaFalta(cob))}</span>`}</p>` : ""}
      ${listaEquipe(L || [], linhas, { chave: "ficha", pessoa })}
      <div class="barra-acoes">${comExplica(`<button class="btn sm" data-ir="equipe_casa">Editar a equipe</button>`, "Abre a área Equipe. O que você muda lá aparece aqui na Ficha.")}</div></section>`;
  }
  function passosCasa() {
    const p = S.conta.perfil, c = S.conta.casa, evs = eventosDaConta();
    if (funcoesDe()) return `<div class="tag">${esc(nomesFuncoes(funcoesDe()))}</div><h1>${esc(p.vinculo_nome || "Sua casa")}</h1>
      <p class="sub">Os passos de cada data que são da sua função, com prazo. O que você marca vale para a casa inteira: o responsável e a Central acompanham.</p>
      ${evs.length ? `<h2>Datas da casa</h2>${painelConta(evs, "casa")}<div class="list">${evs.map((e) => blocoPassos(e, "casa")).join("")}</div>` : vazio("Nenhuma data confirmada ainda", "Quando o Tranquilo repassar uma data para a casa, os passos da sua função aparecem aqui.", "", "passos")}`;
    // O status da habilitação e o que falta ficam na Ficha da Casa (uma fonte só); aqui, só o aviso com o atalho.
    const aviso = !c || c.status !== "habilitada" ? `<div class="alert ${c?.status === "suspensa" ? "crit" : "warn"}" style="margin-bottom:12px"><b>${!c ? "A Ficha da Casa ainda não foi enviada" : c.status === "suspensa" ? "Casa suspensa" : `Ficha: ${esc(STATUS_CASA[c.status]?.[1] || c.status)}`}</b>${c?.parecer ? esc(c.parecer) + " " : ""}<div class="barra-acoes" style="margin-top:8px"><button class="btn sm" data-ir="cadastro_casa">Abrir a Ficha da Casa</button></div></div>` : "";
    if (S.conta.equipe === undefined && p.vinculo_nome) carregarEquipeCasa();
    const et = etapaCasa(c, meusContratos(), p.vinculo_nome ? S.conta.equipe ?? null : []);
    const etapaTxt = c?.status === "habilitada" ? `<div class="card row" style="margin-bottom:12px" id="etapaConta"><span><b>Situação da casa</b> ${badgeEtapa(et)}</span>${et[1] === "Equipe incompleta" ? `<button class="btn sm pri" data-ir="equipe_casa">Completar a equipe</button>` : /Contrato (enviado|devolvido)/.test(et[1]) ? `<button class="btn sm pri" data-ir="contratos_meus">Abrir o contrato</button>` : ""}</div>` : "";
    return `<div class="tag">Datas</div><h1>Datas confirmadas</h1>
    <p class="sub">Depois que o Tranquilo repassa a data, a casa produz o show e marca cada passo, com prazo. O Tranquilo acompanha por aqui, sem precisar perguntar.</p>
    ${aviso}${etapaTxt}${painelConta(evs, "casa")}
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
  const linkAcao = (l) => /^https:\/\//i.test(l.url || "") ? `<a class="btn sm" href="${escHref(l.url)}" target="_blank" rel="noopener">${esc(l.rotulo || "abrir")}</a>` : "";
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
    return `<details class="card" style="margin-bottom:12px"${S.matAberto ? " open" : ""}><summary><span><b>Outras opções: material por link</b> <span class="muted" style="font-size:13px">(Google Docs, Notion, Canva: abre em outra aba)</span></span></summary>
      <p class="muted" style="font-size:13px">Peça nova confirmação de leitura só quando a mudança altera o que a casa faz (campanha, playbook do Apresenta, funções de anfitrião e social media). Ajuste de texto ou visual: publique sem pedir.</p>
      <h3>Nova versão</h3>
      ${ops ? `<div class="grid g2"><label class="fcampo"><b>Material</b><select id="mvMat">${ops}</select></label><label class="fcampo"><b>Versão</b><input id="mvVer" maxlength="20" placeholder="ex.: 2 ou 2026-11"></label></div>
      <label class="fcampo"><b>O que mudou</b><input id="mvRes" maxlength="200" placeholder="ex.: novo roteiro do anfitrião"></label>
      <label class="fcampo"><b>Link desta versão (opcional)</b><input id="mvUrl" type="url" placeholder="https://… (vazio = mesmo link de sempre)"></label>
      <label class="fcheck"><input type="checkbox" id="mvCie"> <span>Muda o que a casa faz: pedir "Li e estou ciente" de novo</span></label>
      <div class="barra-acoes">${comExplica(`<button class="btn pri" data-mat-versao>Publicar versão</button>`, "Todas as artistas e casas passam a ver a versão nova. Pede confirmação antes.")}</div>` : `<p class="muted">Cadastre um material primeiro.</p>`}
      <h3>Material novo</h3>
      <div class="grid g2"><label class="fcampo"><b>Título</b><input id="mnTit" maxlength="160" placeholder="ex.: Função do anfitrião"></label><label class="fcampo"><b>Tipo</b><select id="mnTipo">${tipos.map((t) => `<option>${t}</option>`).join("")}</select></label></div>
      <label class="fcampo"><b>Link (Google Docs, Notion, Canva…)</b><input id="mnUrl" type="url" placeholder="https://"></label>
      <div class="filters" style="margin-bottom:0"><label class="fcheck"><input type="checkbox" id="mnCasa" checked> Casas</label><label class="fcheck"><input type="checkbox" id="mnArt"> Artistas</label></div>
      <label class="fcampo"><b>Só para uma casa (opcional)</b><input id="mnRef" list="mnRefs" placeholder="vazio = todas as casas"><datalist id="mnRefs">${casas.map((c) => `<option value="${esc(c)}">`).join("")}</datalist></label>
      <label class="fcheck"><input type="checkbox" id="mnCie"> <span>Pedir "Li e estou ciente"</span></label>
      <div class="barra-acoes">${comExplica(`<button class="btn pri" data-mat-novo>Cadastrar material</button>`, "O material entra na lista de Guias e materiais de quem você escolheu.")}</div>
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
    const k = (s) => TQCampanha.chaveCasa(s);   // o mesmo nome normalizado que liga a campanha à casa (chave_casa no banco)
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
      // Completa = a casa tem o Tranquilo Descubra; leve = não tem (definição do Bruno, 13/11/2026). Vem da agenda do Notion.
      const descubra = (S.pac?.eventos || []).some((e) => k(e.h) === k(g.nome) && /descubra/i.test(`${e.m || ""} ${e.n || ""}`));
      return { nome: g.nome, pessoas: pessoas.length, convPend: g.conv.filter((c) => !c.aceito_em).length, formato: S.pac ? (descubra ? "completa" : "leve") : "?", proprios: proprios.length, and, faltam };
    });
    return `<h2>Casas no hub</h2><p class="sub">Formato <b>completa</b>: a casa tem o Tranquilo Descubra. <b>Leve</b>: só o Apresenta.${S.pac ? "" : " (Para ver o formato, cole o código interno da equipe em Conta.)"} Leituras pendentes = confirmações que ainda faltam das pessoas da casa.</p>
      ${tabela("cobcasas", [
        { t: "Casa", v: (r) => r.nome, h: (r) => `<b>${esc(r.nome)}</b>` },
        { t: "Pessoas", n: 1, v: (r) => r.pessoas, h: (r) => `${r.pessoas}${r.convPend ? ` <span class="muted">+${r.convPend} convite${r.convPend > 1 ? "s" : ""} aberto${r.convPend > 1 ? "s" : ""}</span>` : ""}` },
        { t: "Formato", v: (r) => r.formato, h: (r) => r.formato === "?" ? '<span class="muted">sem agenda</span>' : esc(r.formato) },
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
  // Resumo de uma campanha, igual para a casa e para a equipe (mesmos dias, mesmo "hoje" de São Paulo).
  function resumoCampanha(c, H, feitos) {
    const hoje = hojeSP(), its = H.itens.filter((i) => i.campanha_id === c.id);
    const nf = its.filter((i) => feitos[i.id]).length, atr = its.filter((i) => !feitos[i.id] && i.dia < hoje), deHoje = its.find((i) => !feitos[i.id] && i.dia === hoje);
    const prox = its.find((i) => !feitos[i.id] && i.dia > hoje);
    return { its, nf, atr, deHoje, prox, texto: `${nf} de ${its.length} dias feitos${atr.length ? `, ${atr.length} atrasado${atr.length > 1 ? "s" : ""}` : ""}` };
  }
  // Campanha compacta (só o resumo); abre para ver os dias. Fica aberta entre um redesenho e outro (S.campAbertas).
  function cartaoCampanha(c, H, feitos, modo) {
    const r = resumoCampanha(c, H, feitos), equipe = modo === "equipe", aberto = S.campAbertas?.has(c.id);
    const badges = `${r.atr.length ? '<span class="badge b-crit">atrasada</span>' : ""}${r.deHoje ? ' <span class="badge b-warn">dia de hoje</span>' : ""}${r.its.length && r.nf === r.its.length ? '<span class="badge b-good">concluída</span>' : ""}`;
    const prox = r.deHoje ? "hoje" : r.prox ? dt(r.prox.dia) : "";
    const pend = [...r.atr, ...(r.deHoje ? [r.deHoje] : [])];
    const topo = equipe
      ? `<div class="barra-acoes" style="margin:10px 0">${pend.length ? `${linkCobrar(c, pend, pend.length > 1 ? `Cobrar os ${pend.length} dias no WhatsApp` : "Cobrar a casa no WhatsApp")}` : ""}${c.fonte_url ? `<a class="btn sm" href="${escHref(c.fonte_url)}" target="_blank" rel="noopener">Ver página da campanha</a>` : ""}</div>`
      : `<div class="barra-acoes" style="margin:10px 0"><button class="btn sm" data-camp-ics="${c.id}" title="Baixa um arquivo .ics com os dias da campanha. No Google Agenda: Configurações › Importar.">Levar para o Google Agenda</button>${c.fonte_url ? `<a class="btn sm" href="${escHref(c.fonte_url)}" target="_blank" rel="noopener">Ver página da campanha</a>` : ""}</div>`;
    return `<details class="card camp-casa" data-camp="${esc(c.id)}"${aberto ? " open" : ""}><summary>
      <div class="row"><span><b>${equipe ? `${esc(c.casa_ref)} · ` : ""}${esc(c.titulo)}</b><br><span class="muted camp-resumo">${esc(r.texto)}${prox ? ` · próximo dia: ${prox}` : ""}</span></span><span>${badges}</span></div>
      <div class="progress" style="margin-top:8px"><i style="width:${r.its.length ? Math.round((r.nf / r.its.length) * 100) : 0}%"></i></div></summary>
      ${topo}<div class="list">${r.its.map((i) => diaCampanha(i, feitos, modo, c)).join("")}</div></details>`;
  }
  // Link do portal onde a casa vê a campanha (o mesmo do pedido de ciência).
  const linkCampanhaCasa = () => (/^https:/.test(location.origin) ? location.origin + location.pathname : "https://marinacollier.github.io/tranquilo-rede/") + "#/campanha";
  // WhatsApp da casa: Ficha (ou conta) da casa e, se não tiver, o convite. Mesmo nome normalizado da campanha.
  function waDaCasa(ref) {
    const k = TQCampanha.chaveCasa(ref), E = S.eq || {}, bate = (n) => !!n && TQCampanha.chaveCasa(n) === k;
    const cad = (E.casas || []).find((c) => bate(c.dados?.nome) || bate(c.perfil?.vinculo_nome));
    const cv = (E.conv || []).find((c) => c.tipo === "casa" && bate(c.vinculo_nome) && c.whatsapp);
    return cad?.dados?.whatsapp || cad?.perfil?.whatsapp || cv?.whatsapp || "";
  }
  function cobrancaCampanha(c, dias) {
    const hoje = hojeSP();
    const linhas = dias.map((i) => `• ${i.rotulo || dt(i.dia)}${i.dia === hoje ? " (hoje)" : " (atrasado)"}: ${(i.acoes || []).map((a) => [a.canal, a.texto].filter(Boolean).join(": ")).join(" / ") || "ver no portal"}`);
    return `Oi! Aqui é do marketing do Tranquilo. Na campanha de divulgação da ${c.casa_ref}, ${dias.length === 1 ? "este dia ainda está" : "estes dias ainda estão"} sem "Feito":\n${linhas.join("\n")}\n\nO passo a passo, as artes e os links estão aqui: ${linkCampanhaCasa()}\nQuando fizer, é só marcar "Feito" no portal. Se não der para fazer, me avisa que eu ajusto o dia.`;
  }
  function linkCobrar(c, dias, rotulo) {
    const w = waDaCasa(c.casa_ref);
    return `<a class="btn sm pri" data-camp-cobrar="${esc(c.id)}" href="https://wa.me/${soDigitos(w)}?text=${encodeURIComponent(cobrancaCampanha(c, dias))}" target="_blank" rel="noopener">${esc(rotulo)}${w ? "" : " (escolher contato)"}</a>`;
  }
  // Um dia da campanha: ações (canal, show, texto, links) e o "feito" compartilhado pela casa.
  // modo "casa": marca Feito. modo "equipe": cobra, marca como feito pela casa (com quem e quando) e ajusta o dia.
  function diaCampanha(i, feitos, modo, c) {
    const f = feitos[i.id], hoje = hojeSP(), atrasado = !f && i.dia < hoje, ehHoje = i.dia === hoje, equipe = modo === "equipe";
    const nomes = equipe ? Object.fromEntries((S.eq?.perfis || []).map((p) => [p.id, p.nome || p.email])) : {};
    const quem = !f ? "" : f.feito_por === S.conta.perfil.id ? "por você" : equipe ? "por " + (nomes[f.feito_por] || "alguém da casa") : f.nota ? "pela equipe do Tranquilo" : "por alguém da casa";
    const ed = S.campForm?.id === i.id ? S.campForm.tipo : null;
    const acoesEq = !equipe ? "" : f ? `<div class="barra-acoes" style="margin-top:8px"><button class="btn sm ghost" data-camp-desfazer="${esc(i.id)}">Desfazer o "feito"</button></div>`
      : `<div class="barra-acoes camp-acoes" style="margin-top:8px">${atrasado || ehHoje ? linkCobrar(c, [i], "Cobrar a casa no WhatsApp") + `<button class="btn sm" data-camp-pela-casa="${esc(i.id)}">Marcar como feito pela casa</button>` : ""}<button class="btn sm" data-camp-ajustar="${esc(i.id)}">Ajustar o dia</button></div>`;
    const form = ed === "pela" ? `<div class="card" style="margin-top:8px"><b>Feito pela casa</b><p class="muted" style="font-size:13px;margin:4px 0 8px">Use quando a casa avisou por fora (WhatsApp, Instagram) que fez. A casa vê o "feito" com esta anotação.</p>
        <div class="grid g2"><label>Quem da casa fez<input id="cpQuem" maxlength="80" placeholder="ex.: a social media"></label><label>Quando<input id="cpQuando" type="date" value="${hoje}" max="${hoje}"></label></div>
        <div class="barra-acoes"><button class="btn sm pri" data-camp-pela-ok="${esc(i.id)}">Salvar como feito</button><button class="btn sm" data-camp-form-x>Cancelar</button></div><div id="cperr" class="muted" style="font-size:13px"></div></div>`
      : ed === "ajustar" ? `<div class="card" style="margin-top:8px"><b>Ajustar o dia</b><p class="muted" style="font-size:13px;margin:4px 0 8px">A casa vê a mudança na hora. Se a página do Bruno for carregada de novo, o texto dela volta a valer.</p>
        <label>Dia<input id="cpDia" type="date" value="${esc(i.dia)}"></label>
        ${(i.acoes || []).map((a, j) => `<label>${esc(a.canal || "Ação " + (j + 1))}${a.show ? ` · ${esc(a.show)}` : ""}<textarea data-cp-texto="${j}" rows="2" maxlength="1000">${esc(a.texto || "")}</textarea></label>`).join("")}
        <div class="barra-acoes"><button class="btn sm pri" data-camp-ajustar-ok="${esc(i.id)}">Salvar o dia</button><button class="btn sm" data-camp-form-x>Cancelar</button></div><div id="cperr" class="muted" style="font-size:13px"></div></div>` : "";
    return `<div class="card camp-dia${f ? " feito" : atrasado ? " atrasado" : ehHoje ? " hoje" : ""}" data-camp-dia="${esc(i.id)}">
      <div class="row"><b>${esc(i.rotulo || dt(i.dia))}${ehHoje ? ' <span class="badge b-warn">hoje</span>' : ""}${atrasado ? ' <span class="badge b-crit">atrasado</span>' : ""}</b>
      ${!equipe ? `<label class="fcheck" style="margin:0"><input type="checkbox" data-camp-feito="${i.id}"${f ? " checked" : ""}> Feito</label>` : f ? '<span class="badge b-good">feito</span>' : ""}</div>
      ${f ? `<div class="muted" style="font-size:12px;margin-top:2px">Marcado ${esc(quem)} em ${new Date(f.feito_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}${f.nota ? ` · ${esc(f.nota)}` : ""}</div>` : ""}
      <ul class="passos" style="margin-top:8px">${(i.acoes || []).map((a) => `<li><b>${esc(a.canal || "")}</b>${a.show ? ` <span class="muted">· ${esc(a.show)}</span>` : ""}<br><span style="font-size:14px">${esc(a.texto || "")}</span>${(a.links || []).length ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">${a.links.map(linkAcao).join("")}</div>` : ""}</li>`).join("")}</ul>
      ${acoesEq}${form}</div>`;
  }
  async function carregarEquipe() {
    if (S.eqCarregando) return; S.eqCarregando = true;
    try {
      const quem = S.conta?.perfil.id;
      // Convites e avisos são da versão nova do banco: se o schema ainda não foi atualizado, o resto continua funcionando.
      const novo = (pr) => pr.catch(() => null);
      const [insc, casas, perfis, chk, reg, conv, avisos, relatos, docs, arqs, contr, modContr, sol, disp] = await Promise.all([api.inscricoes(), api.casas(), api.perfis(), api.checklistTodos(), api.registrosTodos(), novo(api.convites()), novo(api.avisos()), novo(api.relatos()), novo(api.documentos()), novo(api.arquivosTodos()), novo(api.contratos()), novo(api.modelosContrato()), novo(api.solicitacoesTodas()), novo(api.disponibilidade())]);
      const eqc = await api.equipesTodas().catch(() => null);
      if (S.conta?.perfil.id !== quem) return;   // a conta mudou enquanto carregava
      const [datasP, dispA, sem, prop] = await Promise.all([api.datasPortal().catch(() => null), api.dispArtistas().catch(() => null), api.semanal().catch(() => []), api.propostas().catch(() => [])]);
      S.eq = { insc, casas, perfis, chk, reg, conv, avisos, relatos, docs, arqs, contr, modContr, sol: sol || [], disp: disp || [], datasP, dispA, sem: sem || [], eqc, prop: prop || [] };
    } catch (e) {
      if (!S.conta) return;
      S.eq = { insc: [], casas: [], perfis: [], chk: [], reg: [], conv: [], avisos: [] }; alert("✕ Erro: não foi possível carregar os dados da equipe. " + e.message + " Recarregue a página.");
    } finally { S.eqCarregando = false; }
    render();
  }
  // Nome de uma conta de artista ou casa para a Central: o vínculo; sem vínculo, o nome da casa na Ficha; senão o da pessoa.
  function nomeDaConta(p) { return p.vinculo_nome || (p.tipo === "casa" && (S.eq?.casas || []).find((c) => c.user_id === p.id)?.dados?.nome) || p.nome || p.email; }
  function seletorVinculo(p) {
    const acessos = (S.pac?.acessos || []).filter((a) => a.tipo === p.tipo);
    if (p.vinculo_pedido && !p.codigo_acesso) {
      const certo = acessos.find((a) => a.codigo === p.vinculo_pedido);
      return `<div><span class="badge b-warn">pediu: ${esc(p.vinculo_pedido_nome || "?")}</span> ${certo ? `<button class="btn sm" data-vinculo-confirmar="${p.id}" title="Liga a conta ao histórico pedido e libera as métricas dela.">Confirmar o vínculo</button>` : `<span class="muted" style="font-size:12px">código não confere com ${acessos.length ? "nenhuma conta da rede" : "o pacote (entre com o código de adm)"}</span>`} <button class="btn sm" data-vinculo-recusar="${p.id}" title="A conta continua sem vínculo; a pessoa pode pedir de novo.">Recusar o vínculo</button></div>`;
    }
    if (!acessos.length) return p.vinculo_nome ? esc(p.vinculo_nome) : `<span class="muted">entre com o código de adm para vincular</span>`;
    return `<select data-vinculo="${p.id}"><option value="">Sem vínculo</option>${acessos.map((a) => `<option value="${esc(a.codigo)}|${esc(a.nome)}"${p.codigo_acesso === a.codigo ? " selected" : ""}>${esc(a.nome)}${a.cidades ? " · " + esc(a.cidades) : ""}</option>`).join("")}</select>`;
  }

  // ---------- fichas para a equipe ----------
  function fichaInscricao(id) {
    const i = S.eq.insc.find((x) => x.id === id); if (!i) return;
    const d = i.dados, adm = S.conta.perfil.tipo === "adm";
    const futurasArt = (S.pac?.eventos || []).filter((e) => !e.z && e.d >= hojeIso() && (e.a || []).some((n) => n.toLowerCase() === String(d.nome_artistico || "").toLowerCase()));
    const resp = F_ARTISTA.map(([t, cs]) => `<h3>${esc(t)}</h3><dl class="kv">${cs.map(([k, rot, tipo, opts]) => { let v = d[k]; if (tipo === "select") v = (opts.find(([o]) => o === v) || [, v])[1]; if (tipo === "cidades") v = (v || []).join(", "); if (tipo === "check") v = v === "true" ? "Sim" : "Não"; const link = tipo === "url" && v ? `<a href="${escHref(v)}" target="_blank" rel="noopener">${esc(v)}</a>` : esc(v || "–"); return `<dt>${esc(rot)}</dt><dd>${link}</dd>`; }).join("")}</dl>`).join("")
      + (d.disponibilidade ? `<h3>Observação antiga sobre a disponibilidade</h3><p>${esc(d.disponibilidade)}</p>` : "");
    $("#dlgIn").innerHTML = `<div class="tag">Inscrição · ${badgeEtapa(etapaArtistaEq(S.eq, i))}</div><h2 style="margin-top:4px">${esc(d.nome_artistico || "(sem nome)")}</h2><p class="muted">${esc(i.perfil?.email || "")}${i.enviado_em ? ` · enviada em ${dt(i.enviado_em.slice(0, 10))}` : ""}</p>
    ${medidor({ score: i.score ?? 0, faixa: i.faixa || "–", detalhe: i.score_detalhe || { completude: 0, tracao: 0, tecnica: 0, circulacao: 0, condicoes: 0 }, alertas: i.alertas || [] })}
    ${futurasArt.length ? `<div class="alert warn" style="margin:8px 0"><b>${futurasArt.length} data${futurasArt.length > 1 ? "s" : ""} futura${futurasArt.length > 1 ? "s" : ""} na agenda ${A_VALIDAR_HTML}</b>${futurasArt.map((e) => `${dt(e.d)} · ${esc(e.c)}`).join("; ")}. Para encerrar, cancele essas datas no Notion (Eventos e Line-up): o portal não altera o Notion.</div>` : ""}
    <details style="margin:10px 0"><summary>Ver as respostas da inscrição</summary>${resp}</details>
    <h3>Decisão</h3><label class="fcampo"><b>Mensagem para a artista</b><textarea id="parecer" rows="3">${esc(i.parecer || "")}</textarea></label>
    <label class="fcampo"><b>Nota interna (só a equipe vê)</b><textarea id="nota" rows="2">${esc(i.nota_interna || "")}</textarea></label>
    ${adm && i.perfil ? `<label class="fcampo"><b>Vincular à artista da rede (libera métricas)</b>${seletorVinculo(i.perfil)}</label>` : ""}
    <div class="barra-acoes">${!temArea("agenda") ? soArea("agenda") : (i.status === "aprovada" ? '<span class="badge b-good" style="align-self:center">✓ já aprovada</span>' : comExplica('<button class="btn pri" data-decisao="aprovada">Aprovar a artista</button>', "Ela lê a sua mensagem e passa a marcar onde e quando pode tocar.")) + (["aprovada", "encerrada"].includes(i.status) ? "" : comExplica('<button class="btn" data-decisao="ajustes">Pedir ajustes à artista</button>', "A inscrição volta para ela corrigir, com a sua mensagem.") + comExplica('<button class="btn" data-decisao="reprovada">Não seguir agora</button>', "Encerra a inscrição; ela lê a sua mensagem. Pede confirmação antes.")) + (ENCERRAR_ATIVO && i.status === "aprovada" ? comExplica(`<button class="btn" data-decisao="encerrada">Encerrar participação</button>`, "Ela perde o acesso às datas. Pede confirmação antes.") : "")}</div>
    <div class="barra-acoes" style="margin-top:10px"><button class="btn sm ghost" data-copiar-ficha title="Copia as respostas da inscrição. Não muda nada.">Copiar as respostas</button><button class="btn sm ghost" onclick="dlg.close()">Fechar sem decidir</button></div><div class="err" role="status" aria-live="polite" id="derr"></div>`;
    $("#dlg").dataset.alvo = "insc:" + id; $("#dlg").showModal();
  }
  function fichaCasa(id) {
    const c = S.eq.casas.find((x) => x.id === id); if (!c) return;
    const d = c.dados, adm = S.conta.perfil.tipo === "adm", pend = semDiasSemana(c.pendencias || R.pendenciasCasa(d));
    // Dados pessoais do Dono A e dados bancários: só a administração vê (a equipe vê que existem).
    if (adm && S.fichaEdit === id) {
      $("#dlgIn").innerHTML = `<div class="tag">Editar a Ficha · administração</div><h2 style="margin-top:4px">${esc(d.nome || "(sem nome)")}</h2>
        <p class="muted" style="font-size:13px">A edição vale na hora e a casa vê a Ficha atualizada. Use para importar a Ficha que a casa mandou por outro canal.</p>
        <div id="formCentral" style="display:flex;flex-direction:column;gap:12px">${formCasa(d, false, false)}</div>
        <div class="barra-acoes" style="margin-top:12px"><button class="btn pri" data-salvar-ficha="${c.id}">Salvar a Ficha</button><button class="btn" data-editar-ficha="">Voltar</button></div><div class="err" role="status" aria-live="polite" id="derr"></div>`;
      $("#dlg").dataset.alvo = "casa:" + id; if (!$("#dlg").open) $("#dlg").showModal(); return;
    }
    const resp = F_CASA.map(([t, , cs, sens]) => `<h3>${esc(t)}</h3>${sens && !adm ? `<p class="muted" style="font-size:13px">Dados pessoais e bancários: só a administração vê. ${cs.filter((x) => valorCasa(d, x[0])).length} de ${cs.length} campos preenchidos.</p>` : `<dl class="kv">${cs.map(([k, rot, tipo, opts]) => { let v = valorCasa(d, k); if (Array.isArray(v)) v = v.map((x) => (opts || []).find(([o]) => o === x)?.[1] || x).join(", "); else if (tipo === "select") v = (opts.find(([o]) => o === v) || [, v])[1]; return `<dt>${esc(rot.length > 60 ? rot.slice(0, 60) + "…" : rot)}</dt><dd>${esc(v || "")}</dd>`; }).join("")}</dl>`}`).join("");
    const futurasCasa = (S.pac?.eventos || []).filter((e) => !e.z && e.d >= hojeIso() && ((c.notion_casa_id && e.k === c.notion_casa_id) || (d.nome && String(e.h || "").toLowerCase() === String(d.nome).toLowerCase())));
    const cb = c.combinados || {}, sols = (S.eq.sol || []).filter((x) => x.casa_id === c.id && x.status === "pendente");
    const rotulo = (k) => F_CASA.flatMap(([, , cs]) => cs).find((x) => x[0] === k)?.[1] || k;
    const pedidos = sols.map((x) => `<div class="card" style="margin-bottom:8px"><b>Pedido de atualização de ${dt(x.criado_em.slice(0, 10))}</b>${x.mensagem ? `<div class="muted" style="font-size:13px">${esc(x.mensagem)}</div>` : ""}
      <div class="tbl-wrap" style="overflow-x:auto"><table class="tbl"><thead><tr><th>Campo</th><th>Antes</th><th>Proposto</th></tr></thead><tbody>${Object.keys(x.proposto).map((k) => `<tr><td>${esc(rotulo(k))}</td><td>${esc(JSON.stringify(x.antes?.[k] ?? "").replace(/^"|"$/g, ""))}</td><td><b>${esc(JSON.stringify(x.proposto[k] ?? "").replace(/^"|"$/g, ""))}</b></td></tr>`).join("")}</tbody></table></div>
      <label class="fcampo"><b>Resposta para a casa (opcional)</b><input data-sol-resp="${x.id}" maxlength="1000"></label>
      <div class="barra-acoes">${comExplica(`<button class="btn pri sm" data-sol-responder="${x.id}|1">Aprovar e atualizar a ficha</button>`, "As mudanças entram na Ficha na hora e a casa vê.")}${comExplica(`<button class="btn sm" data-sol-responder="${x.id}|0">Recusar o pedido</button>`, "A Ficha continua como está; a casa vê a recusa.")}</div></div>`).join("");
    const combinados = `<details style="margin:10px 0"><summary>Combinados da parceria (Parte 1 da Ficha)</summary><p class="muted" style="font-size:13px">A casa vê estes valores na Ficha. Em branco, aparece "Ainda não registrado pela Operações".</p>
      <div class="grid g3"><label class="fcampo"><b>Bilheteria: artista %</b><input data-cb="bilheteria.artista" inputmode="numeric" value="${esc(cb.bilheteria?.artista ?? "")}"></label><label class="fcampo"><b>Bilheteria: casa %</b><input data-cb="bilheteria.casa" inputmode="numeric" value="${esc(cb.bilheteria?.casa ?? "")}"></label><label class="fcampo"><b>Bilheteria: Tranquilo %</b><input data-cb="bilheteria.tranquilo" inputmode="numeric" value="${esc(cb.bilheteria?.tranquilo ?? "")}"></label>
      <label class="fcampo"><b>Alimentos e bebidas: casa %</b><input data-cb="aeb.casa" inputmode="numeric" value="${esc(cb.aeb?.casa ?? "")}"></label><label class="fcampo"><b>Alimentos e bebidas: Tranquilo %</b><input data-cb="aeb.tranquilo" inputmode="numeric" value="${esc(cb.aeb?.tranquilo ?? "")}"></label></div>
      <div class="grid g2">${CONTATOS_FICHA.map(([k, , q]) => `<label class="fcampo"><b>WhatsApp de ${esc(q)}</b><input data-cb="contatos.${k}" maxlength="30" value="${esc(cb.contatos?.[k] ?? "")}"></label>`).join("")}</div>
      <h4 style="margin:12px 0 4px">Bonificação ${A_VALIDAR_HTML}</h4><p class="muted" style="font-size:13px;margin:0 0 6px">A casa vê em Bonificações. Quem preenche cada casa ainda está a validar com o Gui.</p>
      <div class="grid g2"><label class="fcampo"><b>A casa tem bonificação?</b><select data-cb="bonificacao.tem"><option value="">A definir</option>${[["sim", "Sim"], ["nao", "Não"]].map(([v, t]) => `<option value="${v}"${cb.bonificacao?.tem === v ? " selected" : ""}>${t}</option>`).join("")}</select></label>
      <label class="fcampo"><b>Marca</b><input data-cb="bonificacao.marca" maxlength="80" placeholder="Ex.: Estrella Galicia" value="${esc(cb.bonificacao?.marca ?? "")}"></label>
      <label class="fcampo"><b>Por quanto tempo enviaremos</b><input data-cb="bonificacao.periodo" maxlength="80" placeholder="Ex.: até 31/03/2027" value="${esc(cb.bonificacao?.periodo ?? "")}"></label>
      <label class="fcampo"><b>Combinados</b><textarea data-cb="bonificacao.combinados" rows="2" maxlength="600">${esc(cb.bonificacao?.combinados ?? "")}</textarea></label></div>
      <div class="barra-acoes"><button class="btn sm" data-cb-salvar="${c.id}">Salvar combinados</button></div></details>`;
    $("#dlgIn").innerHTML = `<div class="tag">Casa · ${badgeEtapa(etapaCasaEq(S.eq, c))}</div><h2 style="margin-top:4px">${esc(d.nome || "(sem nome)")}</h2><p class="muted">${esc(c.perfil?.email || "")} · ${c.ja_parceira ? "já parceira" + (c.notion_casa_id && c.notion_casa_id !== "outra" ? ` · <a href="https://www.notion.so/${esc(c.notion_casa_id)}" target="_blank" rel="noopener">ficha no Notion</a>` : "") : "casa nova"}</p>
    <div class="grid g3">${[["habilitacao", "Bloqueia habilitação"], ["match", "Bloqueia match"], ["enriquecimento", "Enriquecimento"]].map(([k, t]) => `<div class="card"><b>${t}</b> (${pend[k].length})<div style="font-size:13px">${pend[k].map(esc).join(" · ") || "ok"}</div></div>`).join("")}</div>
    ${pedidos}
    ${futurasCasa.length ? `<div class="alert warn" style="margin:8px 0"><b>${futurasCasa.length} data${futurasCasa.length > 1 ? "s" : ""} futura${futurasCasa.length > 1 ? "s" : ""} na agenda ${A_VALIDAR_HTML}</b>${futurasCasa.map((e) => `${dt(e.d)} · ${esc(e.c)}`).join("; ")}. Para encerrar, cancele essas datas no Notion (Eventos e Line-up): o portal não altera o Notion.</div>` : ""}
    <details style="margin:10px 0"><summary>Ver as respostas da Ficha</summary>${resp}</details>
    <div class="barra-acoes" style="margin:8px 0">${(adm || S.conta.perfil.areas?.includes("operacoes")) && EDITAR_FICHA_ATIVO ? `<button class="btn sm" data-editar-ficha="${c.id}">Editar a Ficha</button>` : ""}<button class="btn sm" data-tranks="${c.id}" title="Copia todos os dados desta Ficha em formato de pergunta para a Tranks.">Copiar Ficha para a Tranks</button><span class="muted" style="font-size:12px" id="tranksOk"></span></div>
    ${combinados}
    <h3>Decisão</h3><label class="fcampo"><b>Classificação</b><select id="classe"><option value="">Sem classificação (antes da 1ª data)</option>${Object.entries(CLASSE).map(([k, t]) => `<option value="${k}"${c.classificacao === k ? " selected" : ""}>${t}</option>`).join("")}</select></label>
    <label class="fcampo"><b>Mensagem para a casa</b><textarea id="parecer" rows="3">${esc(c.parecer || "")}</textarea></label>
    <label class="fcampo"><b>Nota interna</b><textarea id="nota" rows="2">${esc(c.nota_interna || "")}</textarea></label>
    ${adm && c.perfil ? `<label class="fcampo"><b>Vincular à casa da rede (libera métricas)</b>${seletorVinculo(c.perfil)}</label>` : ""}
    <div class="barra-acoes">${!temArea("operacoes") ? soArea("operacoes") + '<button class="btn" onclick="dlg.close()">Fechar</button>' : (c.status === "habilitada" ? '<span class="badge b-good" style="align-self:center">✓ já habilitada</span>' : comExplica('<button class="btn pri" data-decisao="habilitada">Habilitar a casa</button>', "A casa lê a sua mensagem e libera equipe, disponibilidade e contrato.") + comExplica('<button class="btn" data-decisao="ajustes">Pedir ajustes à casa</button>', "A Ficha volta para a casa corrigir, com a sua mensagem.")) + (c.status === "suspensa" ? "" : comExplica('<button class="btn" data-decisao="suspensa">Suspender</button>', "A casa para de receber datas até você habilitar de novo.")) + comExplica('<button class="btn" data-decisao="">Só salvar a mensagem e a nota</button>', "Não muda a situação da casa.") + (ENCERRAR_ATIVO && c.status !== "encerrada" ? comExplica(`<button class="btn" data-decisao="encerrada">Encerrar parceria</button>`, "A equipe da casa perde o acesso. Pede confirmação antes.") : "")}</div>
    ${temArea("operacoes") ? `<div class="barra-acoes" style="margin-top:10px"><button class="btn sm ghost" onclick="dlg.close()">Fechar sem decidir</button></div>` : ""}<div class="err" role="status" aria-live="polite" id="derr"></div>`;
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
      ${S.conviteEquipe ? "" : `<div class="seg" role="radiogroup" aria-label="Tipo de conta"><label><input type="radio" name="tipoNovo" value="artista"${tipoSel === "artista" ? " checked" : ""}> Sou artista</label><label><input type="radio" name="tipoNovo" value="casa"${tipoSel === "casa" ? " checked" : ""}> Tenho uma casa</label></div>`}
      ${S.conviteEquipe ? `<div class="alert good" style="margin:8px 0"><b>Você foi convidada para a equipe de uma casa da Rede</b>Crie a sua senha: ao entrar, você vê só o que é da sua função.</div>` : ""}
      <label class="fcampo"><b>${S.conviteEquipe ? "Seu nome" : tipoSel === "casa" ? "Seu nome (responsável pela casa)" : "Nome artístico"}</b><input id="enome" autocomplete="name"></label>
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
    // Criar senha no primeiro acesso: toda conta que entrou pelo link do e-mail (convite de casa, artista ou equipe) e ainda
    // não tem senha, e quem veio pelo link "esqueci a senha". Sem isso a casa convidada não conseguia entrar de novo.
    // A tela vem antes do tutorial e da trilha (antes era um diálogo que podia ficar atrás do tutorial ou nem abrir:
    // a conta do link nascia com senha_definida = true, ver schema v30).
    if (precisaCriarSenha()) { if ($("#dlg").open && $("#dlg").dataset.alvo === "senha") $("#dlg").close(); render(); scrollTo(0, 0); setTimeout(() => $("#ns1")?.focus(), 30); return; }
    if (TQTour.aberto()) return;
    if (!p.tutorial_visto_em) abrirTutorial(roteiroConta(), true);
    // Quem já viu o tutorial antes de partes novas entrarem recebe só as novidades do que o acesso dele tem.
    else if (TQTour.temNovidades(p.tutorial_visto_em)) abrirTutorial(roteiroConta(), true, p.tutorial_visto_em);
  }
  // Quem precisa criar a senha agora: veio do "esqueci a senha"; a conta foi criada pelo link e nunca teve senha;
  // ou entrou nesta aba por um link do e-mail (convite, link de entrada, confirmação) sem nunca ter salvo senha no portal.
  function precisaCriarSenha() {
    const p = S.conta?.perfil; if (!p || S.senhaDepois) return false;
    try { if (sessionStorage.getItem("tq-senha-depois") === "1") return false; } catch { /* segue */ }
    if (api.precisaSenha?.() || p.senha_definida === false) return true;
    const v = veioLink(); return v === "recovery" || (!!v && !p.senha_portal);
  }
  function telaSenha() {
    if (!precisaCriarSenha()) return null;
    const p = S.conta.perfil, nova = api.precisaSenha?.() || veioLink() === "recovery";
    return `<div class="card tela-senha" style="max-width:520px;margin:24px auto"><div class="tag">${nova ? "Senha nova" : "Primeiro acesso"}</div>
    <h1 style="margin-top:4px">${nova ? "Escolha a sua senha nova" : "Crie a sua senha para entrar das próximas vezes"}</h1>
    <p class="sub">${nova ? "Você abriu o link de senha do e-mail. Escolha a senha nova e pronto." : `Você entrou pelo link do e-mail${p.email ? ` (<b>${esc(p.email)}</b>)` : ""}. Esse link abre uma vez só: com a senha, você entra de qualquer celular ou computador com o seu e-mail.`}</p>
    <label class="fcampo"><b>Nova senha</b><input id="ns1" type="password" autocomplete="new-password" minlength="8" placeholder="pelo menos 8 caracteres"></label>
    <label class="fcampo"><b>Repita a senha</b><input id="ns2" type="password" autocomplete="new-password" minlength="8"></label>
    <div class="err" role="status" aria-live="polite" id="nserr"></div><button class="btn pri lg" id="nsok" style="width:100%">Salvar senha e continuar</button>
    <p style="text-align:center;margin:14px 0 0"><button type="button" id="nsdepois" class="muted" style="background:none;border:0;padding:4px;font:inherit;font-size:13px;text-decoration:underline;cursor:pointer;color:var(--muted)">fazer depois</button></p></div>`;
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
  function pedirSenha(trocar) {
    $("#dlgIn").innerHTML = `<button class="dlg-x" data-ns-fechar aria-label="Fechar">✕</button><div class="tag">${trocar ? "Conta" : "Primeiro acesso"}</div><h2 style="margin-top:4px">${trocar ? "Mudar a senha" : "Crie a sua senha"}</h2>
    <p class="sub">${trocar ? "Escolha a senha nova. Ela vale a partir da próxima vez que você entrar." : "Você entrou pelo link do e-mail. Escolha uma senha para as próximas vezes."}</p>
    <label class="fcampo"><b>Nova senha</b><input id="ns1" type="password" autocomplete="new-password" minlength="8"></label>
    <label class="fcampo"><b>Repita a senha</b><input id="ns2" type="password" autocomplete="new-password" minlength="8"></label>
    <div class="err" role="status" aria-live="polite" id="nserr"></div><div class="barra-acoes"><button class="btn pri" id="nsok">Salvar senha</button><button class="btn" id="nsdepois">${trocar ? "Cancelar" : "Agora não"}</button></div>${trocar ? "" : '<p class="dica">Dá pra criar depois na aba Conta, em "Mudar a senha".</p>'}`;
    $("#dlg").dataset.alvo = "senha"; $("#dlg").dataset.trocar = trocar ? "1" : ""; $("#dlg").showModal(); setTimeout(() => $("#ns1")?.focus(), 30);
  }

  // ---------- envio de acesso e tutorial ----------
  const site = () => location.origin + location.pathname;
  // Número para o wa.me: só dígitos e com o código do Brasil (55) quando vier só com DDD.
  const soDigitos = (w) => { const d = (w || "").replace(/\D/g, ""); return d.length === 10 || d.length === 11 ? "55" + d : d; };
  function mensagemTutorial(tipo, nome) {
    return `Oi${nome ? ", " + nome : ""}! Este é o passo a passo da sua área na Rede Tranquilo (${ROTULO[tipo].toLowerCase()}): ${TQTour.linkDe(tipo)}\n\nQuando você entrar pela primeira vez, ele também abre sozinho.`;
  }
  function mensagemConvite(c) {
    const criar = `${site()}#criar&email=${encodeURIComponent(c.email)}&tipo=${c.tipo === "casa" ? "casa" : "artista"}`;
    return `Oi${c.nome ? ", " + c.nome : ""}! Você foi convidada para a área ${c.tipo === "casa" ? "da casa" : c.tipo === "artista" ? "da artista" : "interna"} da Rede Tranquilo${c.vinculo_nome ? ` (${c.vinculo_nome})` : ""}.\n\nEnviei um link de acesso para ${c.email} (olhe também no spam). Ao tocar nele, a primeira tela pede para você criar a sua senha. Se o e-mail não chegar, crie a conta por aqui, usando este mesmo e-mail: ${criar}\n\nDepois, um tutorial mostra tudo o que dá para fazer.`;
  }
  function dialogoEnvio({ titulo, texto, email, whatsapp, assunto, aoEnviar, aviso }) {
    const wa = `https://wa.me/${soDigitos(whatsapp)}?text=${encodeURIComponent(texto)}`;
    const mail = `mailto:${encodeURIComponent(email || "")}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(texto)}`;
    $("#dlgIn").innerHTML = `<div class="tag">Enviar</div><h2 style="margin-top:4px">${esc(titulo)}</h2>
    ${aviso ? `<div class="alert ${/não saiu|demonstração/.test(aviso) ? "warn" : "good"}" style="margin-bottom:10px">${esc(aviso)}</div>` : ""}
    <textarea id="envTxt" aria-label="Mensagem a enviar" rows="7" style="width:100%;border:1px solid var(--line);border-radius:9px;padding:10px;font:inherit;background:var(--surface)">${esc(texto)}</textarea>
    <p class="muted" style="font-size:13px">O botão abre o WhatsApp ou o seu programa de e-mail com a mensagem pronta. Nada é enviado sem você confirmar lá.</p>
    <div class="barra-acoes"><a class="btn pri" data-envio href="${escHref(wa)}" target="_blank" rel="noopener">WhatsApp${whatsapp ? "" : " (escolher contato)"}</a><a class="btn" data-envio href="${escHref(mail)}">E-mail</a><button class="btn" data-copiar-envio>Copiar mensagem</button><button class="btn" onclick="dlg.close()">Fechar</button></div>`;
    $("#dlg").dataset.alvo = "envio"; S.aoEnviar = aoEnviar; $("#dlg").showModal();
  }
  function enviarTutorial(tipo, nome, email, whatsapp) {
    dialogoEnvio({ titulo: `Tutorial de ${ROTULO[tipo].toLowerCase()}`, texto: mensagemTutorial(tipo, nome), email, whatsapp, assunto: "Seu passo a passo na Rede Tranquilo",
      aoEnviar: () => api.marcarTutorialEnviado(email).catch(() => {}) });
  }
  // Depois de "Enviar convite", "Reenviar convite", "Dar acesso" e "Enviar link de senha" (pedido da Marina, 18/11/2026):
  // no topo, grande, o que aconteceu ("✓ Convite enviado para …") e o que a pessoa vai receber; embaixo, as ações
  // secundárias (reenviar o e-mail, WhatsApp, copiar, fechar). A mensagem pronta fica recolhida em "Ver a mensagem".
  const RECEBE = {
    convite: "Um e-mail da Rede Tranquilo com o link para entrar. Ao tocar no link, a conta abre e a primeira tela pede para criar a senha. O link abre uma vez só; se vencer, é só reenviar.",
    senha: "Um e-mail com o link para criar uma senha nova. Ao tocar no link, a pessoa escolhe a senha e já entra na conta.",
  };
  function dialogoResultado(o) {
    S.envioRes = o;
    const r = o.resultado || {}, quem = esc(o.email || ""), oque = esc(o.oque);
    const topo = r.enviado ? `<div class="envio-ok" style="color:var(--good, #1f7a3a);font-size:24px;font-weight:700;line-height:1.25;margin:4px 0 8px">✓ ${oque} enviado para <span style="display:inline-block;max-width:100%;overflow-wrap:anywhere">${quem}</span></div>`
      : r.demo ? `<div class="envio-ok" style="color:var(--good, #1f7a3a);font-size:24px;font-weight:700;line-height:1.25;margin:4px 0 8px">✓ ${oque} criado para <span style="display:inline-block;max-width:100%;overflow-wrap:anywhere">${quem}</span></div><div class="alert warn" style="margin-bottom:10px">No modo demonstração nenhum e-mail sai. Mande pelo WhatsApp ou copie a mensagem.</div>`
      : `<div class="envio-erro" style="color:var(--bad, #b42318);font-size:22px;font-weight:700;line-height:1.25;margin:4px 0 8px">✕ O e-mail não saiu para <span style="display:inline-block;max-width:100%;overflow-wrap:anywhere">${quem}</span></div><div class="alert warn" style="margin-bottom:10px">${esc(r.erro || "Tente de novo em instantes.")} Tente "Reenviar o e-mail" daqui a pouco ou mande pelo WhatsApp.</div>`;
    const wa = `https://wa.me/${soDigitos(o.whatsapp)}?text=${encodeURIComponent(o.texto)}`;
    const mail = `mailto:${encodeURIComponent(o.email || "")}?subject=${encodeURIComponent(o.assunto)}&body=${encodeURIComponent(o.texto)}`;
    $("#dlgIn").innerHTML = `<div class="tag">${esc(o.nome || o.oque)}</div>${topo}
    <p style="margin:0 0 4px"><b>O que a pessoa vai receber</b></p><p class="sub" style="margin-top:0">${esc(o.recebe)}</p>
    ${o.nota ? `<p class="muted" style="font-size:13px">${esc(o.nota)}</p>` : ""}
    <div class="err" role="status" aria-live="polite" id="envSt"></div>
    <div class="barra-acoes" style="margin-top:6px">${o.reenviar ? `<button class="btn sm" id="envReenviar">Reenviar o e-mail</button>` : ""}<a class="btn sm" data-envio href="${escHref(wa)}" target="_blank" rel="noopener" style="white-space:normal">Mandar também pelo WhatsApp</a><button class="btn sm" data-copiar-envio>Copiar mensagem</button><button class="btn sm pri" onclick="dlg.close()">Fechar</button></div>
    <details style="margin-top:12px"><summary>Ver a mensagem</summary>
    <textarea id="envTxt" aria-label="Mensagem a enviar" rows="7" style="width:100%;margin-top:8px;border:1px solid var(--line);border-radius:9px;padding:10px;font:inherit;background:var(--surface)">${esc(o.texto)}</textarea>
    <p class="muted" style="font-size:13px">O WhatsApp abre com a mensagem pronta; nada sai sem você confirmar lá. Prefere o seu e-mail? <a data-envio href="${escHref(mail)}">Abrir no programa de e-mail</a>.</p></details>`;
    $("#dlg").dataset.alvo = "envio"; S.aoEnviar = o.aoEnviar; if (!$("#dlg").open) $("#dlg").showModal();
  }

  // ---------- eventos ----------
  async function cliquesContrato(t) {
    const erro = (m) => { const e = $("#ctErr") || $("#mcErr"); if (e) diz(e, m); };
    const ab = t.closest("[data-ct-abrir]"); if (ab) { S.contrAberto = ab.dataset.ctAbrir; if (!["contratos", "contratos_meus"].includes(S.aba)) irPara("passos"); render(); scrollTo(0, 0); return true; }
    if (t.closest("[data-ct-voltar]")) { S.contrAberto = null; render(); scrollTo(0, 0); return true; }
    const ver = t.closest("[data-ct-ver]"); if (ver) { const c = [...(S.eq?.contr || []), ...(S.conta.contr || [])].find((x) => x.id === ver.dataset.ctVer); if (c) abrirImpressao(c.status === "assinado" ? c : { ...c, texto: textoContrato(c) }); return true; }
    const me = t.closest("[data-ct-mod-editar]"); if (me) { S.cModEd = me.dataset.ctModEditar || null; S.cModAberto = true; render(); $("#mcNome")?.focus(); return true; }
    if (t.id === "mcOk") {
      const nome = $("#mcNome").value.trim(), texto = $("#mcTexto").value.trim(), em = $("#mcErr"), era = S.cModEd;
      if (barrar(em, [[$("#mcNome"), nome.length < 2 && "dê um nome ao modelo (pelo menos 2 letras)"], [$("#mcTexto"), texto.length < 50 && `cole o texto completo do modelo (pelo menos 50 caracteres; agora tem ${texto.length})`]])) return true;
      await acao(t, async () => { await api.salvarModeloContrato({ id: era || undefined, nome, texto }); S.cModEd = null; S.cModAberto = true; S.eq = null; render(); },
        { st: "#mcErr", ok: era ? "Modelo atualizado." : "Modelo salvo. Já aparece na lista de modelos." });
      return true;
    }
    if (t.id === "ctPrep") {
      const conta = $("#ctConta").value, ev = $("#ctEv").value, modelo = $("#ctMod").value;
      if (barrar($("#ctErr"), [[$("#ctConta"), !conta && "escolha a conta da artista ou da casa"], [$("#ctMod"), !modelo && "escolha um modelo de contrato"]], "Falta escolher")) return true;
      const m = S.eq.modContr.find((x) => x.id === modelo);
      const e = (S.pub?.agenda || []).find((x) => x.id === ev) || S.pac?.eventos?.find((x) => x.id === ev) || (S.eq.datasP || []).map(eventoDoPortal).find((x) => x.id === ev);
      // O que já está no portal: Ficha da casa (ou inscrição da artista). O que a pessoa preencheu em contratos
      // anteriores ela mesma confere na hora de assinar (dadosAnteriores).
      const la = e?.portal ? (e.portal.artistas || []).find((a) => a.user_id === conta) : null;
      S.cPrep = { conta, ev, modelo, ...montarContrato(m, conta, e, la) };
      render(); $("#ctTit")?.scrollIntoView({ block: "center" }); return true;
    }
    if (t.id === "ctDescartar") { S.cPrep = null; S.cPre = null; render(); return true; }
    // Criar datas (Central)
    if (t.closest("[data-dp-novo]")) { S.dpEd = null; S.dpPre = null; S.dpN = null; S.dpConf = null; S.dpExcAuto = null; S.dpOutros = S.dpOutrasC = false; render(); return true; }
    // Line-up editável: adicionar e tirar linhas (mínimo 1).
    if (t.closest("[data-dp-add]")) { const L = linhasDp(); S.dpPre = { ...lerFormDp(), artistas: L }; S.dpN = Math.min(R.LINEUP_MAX, L.length + 1); render(); $(`[data-dp-art="${S.dpN - 1}"]`)?.focus(); return true; }
    const rem = t.closest("[data-dp-rem]"); if (rem) { const L = linhasDp(); L.splice(+rem.dataset.dpRem, 1); S.dpPre = { ...lerFormDp(), artistas: L }; S.dpN = Math.max(1, L.length); render(); return true; }
    if (t.closest("[data-dp-conf-nao]")) { S.dpConf = null; S.dpPre = lerFormDp(); render(); diz($("#dpErr"), "Nada foi salvo. O line-up continua como estava na data; ajuste e salve de novo."); return true; }
    // Line-up e contratos (quadro da data): abrir/fechar, preparar e gerar os contratos que faltam.
    const det = t.closest("[data-lp-det] > summary"); if (det) { const d = det.parentElement; S.lpAberto = d.open ? null : d.dataset.lpDet; return false; }
    const lpa = t.closest("[data-lp-abrir]"); if (lpa) { S.lpPrep = lpa.dataset.lpAbrir; S.lpAberto = S.lpPrep; S.lpVal = {}; render(); return true; }
    if (t.closest("[data-lp-fechar]")) { S.lpPrep = null; render(); return true; }
    const lpg = t.closest("[data-lp-gerar]"); if (lpg) { await gerarContratosLineup(lpg); return true; }
    if (t.closest("[data-dp-abrir-form]")) { const ab = !!(S.dpFormAberto || S.dpPre || S.dpEd); S.dpFormAberto = !ab; if (ab) { S.dpPre = null; S.dpEd = null; } render(); return true; }
    const sug = t.closest("[data-dp-dia-sug]"); if (sug) { S.dpPre = { ...lerFormDp(), dia: sug.dataset.dpDiaSug }; render(); $("#dpForm")?.scrollIntoView({ block: "start" }); return true; }
    // Busca rápida por modelo: formato, troca, "Criar este evento" (com confirmação na página) e Turnê.
    const guarda = guardaDp;
    if (t.closest("[data-dpb-limpar]")) { guarda(); Object.assign(S.dpb ||= {}, { cid: "", casa: "", art: "", lim: 12 }); render(); return true; }
    const bm = t.closest("[data-dpb-modo]"); if (bm) { guarda(); Object.assign(S.dpb ||= {}, { modo: bm.dataset.dpbModo, lim: 12 }); S.dpbConf = null; if (S.dpbTur) S.dpbTur.conf = false; render(); return true; }
    if (t.closest("[data-dpb-mais]")) { guarda(); S.dpb.lim = (S.dpb.lim || 12) + 12; render(); return true; }
    const bcr = t.closest("[data-dpb-criar]"); if (bcr) { guarda(); S.dpbConf = bcr.dataset.dpbCriar; render(); $(`[data-dpb-ok="${CSS.escape(S.dpbConf)}"]`)?.focus(); return true; }
    if (t.closest("[data-dpb-nao]")) { guarda(); S.dpbConf = null; if (S.dpbTur) S.dpbTur.conf = false; render(); return true; }
    if (t.closest("[data-dpb-tur-criar]")) { guarda(); S.dpbTur.conf = true; render(); $("[data-dpb-tur-ok]")?.focus(); return true; }
    const bok = t.closest("[data-dpb-ok]"); if (bok) {
      const k = cartoesModelo(S.eq, S.dpb).find((x) => x.key === bok.dataset.dpbOk);
      if (!k) { S.dpbConf = null; render(); diz($("#dpbMsg"), "⚠ Esta combinação não está mais livre (alguém criou uma data agora). Confira os cartões de novo."); return true; }
      await criarDatasRapidas(bok, [{ dia: k.dia, casa: k.casa, produto: k.F.nome, lineup: lineupDoCartao(k) }], `${k.F.nome} criado em ${dt(k.dia)} na ${k.casa.nome}. Já aparece para a casa e para os artistas; os contratos ficam em "Datas criadas no portal".`);
      return true;
    }
    const btok = t.closest("[data-dpb-tur-ok]"); if (btok) {
      const P = planoTurne(S.eq, S.dpb), esc_ = P.cidades.filter((c) => c.escolha), dias = esc_.map((c) => c.escolha.dia);
      if (!P.art || !esc_.length || dias.some((d, i) => dias.indexOf(d) !== i)) { S.dpbTur.conf = false; render(); diz($("#dpbMsg"), "⚠ Confira as cidades: precisa de pelo menos uma, sem duas no mesmo dia."); return true; }
      await criarDatasRapidas(btok, esc_.map((c, i) => ({ dia: c.escolha.dia, casa: c.escolha.casa, produto: "Turnê", lineup: [...(c.abertura ? [{ nome: c.abertura }] : []), { nome: P.art.nome }], observacao: `Turnê de ${P.art.nome}: data ${i + 1} de ${esc_.length}.` })),
        `${esc_.length} ${esc_.length === 1 ? "data" : "datas"} da turnê de ${P.art.nome} ${esc_.length === 1 ? "criada" : "criadas"}. Já aparecem para as casas e para os artistas.`);
      return true;
    }
    const bc = t.closest("[data-dpb-casa]"), ba = t.closest("[data-dpb-art]"); if (bc || ba) {
      const f = S.dpEd ? {} : lerFormDp(); S.dpEd = null;
      if (bc) { const [cid, dia] = bc.dataset.dpbCasa.split("|"), c = (S.eq?.casas || []).find((x) => x.id === cid); Object.assign(f, { casa_id: cid, dia, cidade: c?.dados?.cidade_uf || c?.dados?.cidade || f.cidade || "" }); }
      else { const i = ba.dataset.dpbArt.lastIndexOf("|"), nome = ba.dataset.dpbArt.slice(0, i), dia = ba.dataset.dpbArt.slice(i + 1); f.artistas = f.artistas || [];
        if (!f.dia) f.dia = dia;
        if (!f.artistas.some((a) => a.nome.toLowerCase() === nome.toLowerCase())) { const vaga = f.artistas.findIndex((a) => !a.nome); if (vaga >= 0) f.artistas[vaga] = { ...f.artistas[vaga], nome }; else if (f.artistas.length < R.LINEUP_MAX) { f.artistas.push({ nome }); S.dpN = Math.max(S.dpN || 0, f.artistas.length); } } }
      S.dpPre = f; render(); $("#dpForm")?.scrollIntoView({ block: "start" });
      if (ba && f.dia !== ba.dataset.dpbArt.slice(ba.dataset.dpbArt.lastIndexOf("|") + 1)) diz($("#dpErr"), "⚠ Este artista marcou outro dia como livre. Confira o dia da data.");
      return true;
    }
    const dm = t.closest("[data-dispa-mes]"); if (dm) {
      if (dm.dataset.dispaMes === "limpar" && !confirmaAqui(dm, "Limpar todas as marcações deste mês?", "Os dias voltam a ficar sem informação. A Isa deixa de ver você livre neles.", "Sim, limpar o mês")) return true;
      if (dm.dataset.dispaMes === "semana" && !lerDiasSemana().length) { diz($("#dispaErr"), "⚠ Marque antes, na Ficha, os dias da semana em que você pode tocar."); return true; }
      const modo = dm.dataset.dispaMes, mes = S.dispMes || hojeIso().slice(0, 7), [a, m] = mes.split("-").map(Number), total = new Date(Date.UTC(a, m, 0)).getUTCDate(), eu = S.conta.perfil.id;
      const evs = new Set((S.pac?.eventos || []).filter((e) => !e.z).map((e) => e.d));
      await acao(dm, async () => {
        for (let d = 1; d <= total; d++) {
          const dia = `${mes}-${String(d).padStart(2, "0")}`, wd = new Date(dia + "T12:00:00Z").getUTCDay(), atual = S.dispA.find((x) => x.user_id === eu && x.dia === dia);
          if (dia < hojeIso()) continue;
          const semana = modo === "semana" ? lerDiasSemana().map((d) => DIAS_JS[d]) : [4, 5, 6, 0];
          const quer = modo === "limpar" ? null : modo === "todos" || semana.includes(wd) ? "disponivel" : atual?.situacao || null;
          if ((atual?.situacao || null) === quer) continue;
          await api.marcarDispArtista(dia, quer); S.dispA = S.dispA.filter((x) => x !== atual); if (quer) S.dispA.push({ user_id: eu, dia, situacao: quer });
        }
        TQDiario.registrar("disponibilidade_artista", { mes: modo }); render();
      }, { st: "#dispaErr", ok: modo === "limpar" ? "Mês limpo." : modo === "todos" ? "Todos os dias deste mês marcados como disponíveis." : modo === "semana" ? "Dias da semana da Ficha marcados como disponíveis neste mês." : "Quintas a domingos marcados como disponíveis.",
        erro: (x) => { render(); return traduz(x.message || "") + " O que já tinha sido marcado continua marcado."; } });
      return true;
    }
    const dad = t.closest("[data-dispa-dia]"); if (dad) {
      const dia = dad.dataset.dispaDia, atual = (S.dispA || []).find((x) => x.user_id === S.conta.perfil.id && x.dia === dia);
      const naSemana = semanaDe(S.sem, { userId: S.conta.perfil.id }).includes(wdDe(dia));
      const prox = naSemana ? (atual ? null : "indisponivel") : !atual ? "disponivel" : atual.situacao === "disponivel" ? "indisponivel" : null;
      await acao(dad, async () => { await api.marcarDispArtista(dia, prox); S.dispA = (S.dispA || []).filter((x) => x !== atual); if (prox) S.dispA.push({ user_id: S.conta.perfil.id, dia, situacao: prox, nota: atual?.nota || null }); TQDiario.registrar("disponibilidade_artista", { situacao: prox || "limpa" }); render(); },
        { st: "#dispaErr", ok: `${dt(dia)}: ${prox === "disponivel" ? "disponível" : prox === "indisponivel" ? "indisponível" : "sem marcação"}.` });
      return true;
    }
    const dpe = t.closest("[data-dp-editar]"); if (dpe) { S.dpEd = dpe.dataset.dpEditar; S.dpPre = null; S.dpN = null; S.dpConf = null; render(); $("#dpForm")?.scrollIntoView({ block: "start" }); return true; }
    const dpc = t.closest("[data-dp-cancelar]"); if (dpc) {
      if (!confirm("Cancelar esta data? Ela some das áreas da casa e das artistas. Contratos já gerados continuam na lista para você cancelar.")) return true;
      await acao(dpc, async () => { await api.salvarDataPortal({ id: dpc.dataset.dpCancelar, status: "cancelada" }); TQDiario.registrar("data_portal", { cancelou: true }); S.eq = null; render(); }, { ok: "Data cancelada. Ela saiu das áreas da casa e das artistas." });
      return true;
    }
    const dpk = t.closest("[data-dp-contrato]"); if (dpk) {
      const x = (S.eq?.datasP || []).find((d) => d.id === dpk.dataset.dpContrato), e = x && eventoDoPortal(x);
      S.cPrep = null; S.cPre = { ev: e?.id || "", conta: e?.au?.[0] || "" }; S.lpAberto = x?.id || null; irPara("documentos"); render();
      setTimeout(() => { $("#contrAuto")?.scrollIntoView({ block: "start" }); ($("#ctConta")?.value ? $("#ctMod") : $("#ctConta"))?.focus(); }, 50);
      return true;
    }
    if (t.closest("[data-dp-salvar]") || t.closest("[data-dp-conf-ok]")) {
      const confirmado = !!t.closest("[data-dp-conf-ok]");
      const err = $("#dpErr"), E = S.eq, v = (id) => ($(id)?.value || "").trim();
      const casa = (E.casas || []).find((c) => c.id === v("#dpCasa"));
      const contas = (E.perfis || []).filter((p) => p.tipo === "artista"), k = (x) => String(x || "").trim().toLowerCase();
      const NL = R.normalizarLineup(linhasDp());
      if (NL.repetidos.length) { marcar([...document.querySelectorAll("[data-dp-art]")].filter((el) => NL.repetidos.some((n) => k(n) === k(el.value)))); return diz(err, `Não salvou: ${NL.erro}. Cada artista entra uma vez só.`), true; }
      const artistas = NL.lista.map((a, i) => { const c = contas.find((p) => k(p.vinculo_nome || p.nome || p.email) === k(a.nome));
          // WhatsApp do artista (inscrição ou perfil) vai junto: a casa monta o grupo do cronograma sem pedir telefone.
          const w = c && ((E.insc || []).find((x) => x.user_id === c.id)?.dados?.whatsapp || c.whatsapp);
          return { ...a, ordem: i + 1, ...(c ? { user_id: c.id } : {}), ...(w ? { whatsapp: VAL.tel(w) ? VAL.fTel(w) : w } : {}) }; });
      const falta = [!v("#dpDia") && "o dia", !casa && "a casa", !artistas.length && "pelo menos um artista"].filter(Boolean);
      if (falta.length) { document.querySelectorAll(".campo-falta").forEach((el) => el.classList.remove("campo-falta")); marcar([!v("#dpDia") && $("#dpDia"), !casa && $("#dpCasa"), !artistas.length && $('[data-dp-art="0"]')]); return diz(err, `Não salvou: falta ${falta.join(", ")}.`), true; }
      if (!v("#dpAbre")) { marcar($("#dpAbre")); return diz(err, "Não salvou: falta o horário de abertura da casa."), true; }
      if (!S.dpExc) {
        const ed = S.dpEd ? (E.datasP || []).find((x) => x.id === S.dpEd) : null, mesmoDia = ed && String(ed.dia).slice(0, 10) === v("#dpDia");
        const cs = (E.casas || []).filter((c) => c.status !== "encerrada").map((c) => ({ id: c.id, nome: c.dados?.nome || c.perfil?.vinculo_nome || c.perfil?.nome || "Casa sem nome", cidade: c.dados?.cidade_uf || c.dados?.cidade || "" }));
        const cidCasa = (cs.find((x) => x.id === casa.id)?.cidade || "").trim(), L = livresNoDia(E, cs, S.dpEd)(v("#dpDia"), cidCasa, true);
        const casaOk = (L.cs.some((x) => x.id === casa.id) && casa.status === "habilitada") || (mesmoDia && ed.casa_id === casa.id);
        const fora = artistas.filter((a) => !L.as.some((x) => k(x.nome) === k(a.nome)) && !(mesmoDia && (ed.artistas || []).some((x) => k(x.nome) === k(a.nome)))).map((a) => a.nome);
        if (!casaOk || fora.length) return diz(err, `Não salvou: ${[!casaOk && (casa.status !== "habilitada" ? "a Ficha da casa ainda não está habilitada" : `a casa não marcou ${dt(v("#dpDia"))} como livre (ou já tem show)`), fora.length && `${fora.join(", ")} não ${fora.length > 1 ? "marcaram" : "marcou"} esse dia como livre`].filter(Boolean).join("; ")}. Se já confirmaram por fora, marque "Exceção".`), true;
      }
      if (v("#dpLink") && !/^https:\/\/\S+\.\S+/i.test(v("#dpLink"))) { marcar($("#dpLink")); return diz(err, "Não salvou: o link de ingressos precisa ser um endereço completo, começando com https://"), true; }
      if (v("#dpDia") < hojeIso() && !confirm("Essa data já passou. Salvar mesmo assim?")) return true;
      const era = S.dpEd;
      const semConta = artistas.filter((a) => !a.user_id).map((a) => a.nome);
      // Tirou do line-up quem já tem contrato desta data: confirma na página (sem janela do navegador) e cancela o contrato.
      const edAnt = era ? (E.datasP || []).find((x) => x.id === era) : null, sairam = edAnt ? R.lineupRemovidos(edAnt.artistas, artistas).filter((a) => a.user_id) : [];
      const ctsSai = sairam.flatMap((a) => (E.contr || []).filter((c) => c.evento_id === "p:" + era && c.user_id === a.user_id && c.status !== "cancelado").map((c) => ({ c, nome: a.nome })));
      const cancelar = ctsSai.filter(({ c }) => c.status === "enviado" && !c.conferido_em), travados = [...new Set(ctsSai.filter(({ c }) => !(c.status === "enviado" && !c.conferido_em)).map((x) => x.nome))];
      if (ctsSai.length && !confirmado) { S.dpConf = { cancelar: cancelar.map(({ c, nome }) => ({ id: c.id, nome })), travados }; S.dpPre = lerFormDp(); render(); $("#dpConf")?.scrollIntoView({ block: "center" }); $("[data-dp-conf-ok]")?.focus({ preventScroll: true }); return true; }
      S.dpConf = null;
      await acao(t.closest("[data-dp-salvar]") || t.closest("[data-dp-conf-ok]"), async () => {
        for (const { c } of cancelar) await api.cancelarContrato(c.id);
        const salvo = await api.salvarDataPortal({ ...(S.dpEd ? { id: S.dpEd } : {}), dia: v("#dpDia"), abertura: v("#dpAbre") || "19:00", produto: v("#dpProd") || "Descubra", casa_id: casa.id,
          casa_nome: casa.dados?.nome || casa.perfil?.vinculo_nome || casa.perfil?.nome || "Casa", cidade: valorCidade($("#dpCidade")) || casa.dados?.cidade_uf || null,
          artistas, link_ingressos: v("#dpLink") || null, observacao: v("#dpObs") || null });
        TQDiario.registrar("data_portal", { editou: !!S.dpEd, artistas: artistas.length });
        S.dpEd = null; S.dpPre = null; S.dpN = null; S.dpExc = false; S.dpExcAuto = null; S.dpOutros = S.dpOutrasC = false; S.eq = null; S.lpAberto = era || salvo?.id || S.lpAberto; await carregarEquipe(); render();
      }, { st: "#dpErr", ok: `Data ${era ? "atualizada" : "criada"}. Já aparece para a casa${artistas.some((a) => a.user_id) ? " e para as artistas com conta" : ""}.${cancelar.length ? ` Contrato cancelado: ${cancelar.map((x) => x.nome).join(", ")}.` : ""}${semConta.length ? ` ${semConta.join(", ")} ainda não tem conta no portal: convide em Convites para ver a data e assinar o contrato.` : ""}` });
      return true;
    }
    const pr = t.closest("[data-ct-pre]"); if (pr) {
      const [ev, conta] = pr.dataset.ctPre.split("|"); S.cPrep = null; S.cPre = { ev, conta: conta || "" }; render();
      $("#contrAuto")?.scrollIntoView({ block: "start" }); ($("#ctConta")?.value ? $("#ctMod") : $("#ctConta"))?.focus(); return true;
    }
    if (t.id === "ctEnviar") {
      const P = S.cPrep; if (!P) return true;
      document.querySelectorAll("[data-ct-campo]").forEach((i) => { P.valores[i.dataset.ctCampo] = i.value.trim(); });
      P.titulo = $("#ctTit").value.trim();
      const chaves = [...document.querySelectorAll("[data-ct-campo]")].filter((i) => /[{}]{2}/.test(i.value));
      if (barrar($("#ctErr"), [[$("#ctTit"), P.titulo.length < 2 && "dê um nome ao contrato (pelo menos 2 letras)"], ...chaves.map((i) => [i, "os campos não podem ter {{ ou }}"])], "Não enviou")) return true;
      const daEquipe = P.campos.filter((c) => P.valores[c.chave]), daPessoa = P.campos.filter((c) => !P.valores[c.chave]);
      const texto = TQContrato.preencher(P.texto, daEquipe, P.valores);
      if (texto.length < 50) return erro("O texto do modelo está curto demais."), true;
      const igual = (S.eq?.contr || []).find((x) => x.user_id === P.conta && (x.evento_id || null) === (P.ev || null) && x.modelo_id === P.modelo && x.status !== "cancelado");
      if (igual && !confirmaAqui(t, `Já existe um contrato deste modelo para esta pessoa${P.ev ? " nesta data" : ""} (${igual.status === "assinado" ? "assinado" : "aguardando assinatura"}). Criar outro mesmo assim?`, "A pessoa passa a ver os dois pedidos de assinatura. Se foi engano, toque em \"Não, voltar\".", "Sim, criar outro")) return true;
      if (P.enviando) return true; P.enviando = true;
      await acao(t, async () => {
        await api.criarContrato({ user_id: P.conta, evento_id: P.ev || null, titulo: P.titulo, modelo_id: P.modelo, texto, campos: daPessoa });
        TQDiario.registrar("contrato_enviado", { campos_pessoa: daPessoa.length });
        S.cPrep = null; S.cPre = null; S.eq = null; render();
      }, { st: "#ctErr", espera: "Enviando…", ok: "Contrato enviado para assinatura. A pessoa já vê o pedido na área dela. Próximo passo: quando ela devolver assinado, confira em \"Contratos para assinar\"." });
      P.enviando = false; return true;
    }
    const dv = t.closest("[data-ct-devolver]"); if (dv) { S.ctDevolver = dv.dataset.ctDevolver || null; render(); $("#ctMotivo")?.focus(); return true; }
    const cf = t.closest("[data-ct-conferir], [data-ct-devolver-ok]"); if (cf) {
      const aceitar = !!cf.dataset.ctConferir, cid = cf.dataset.ctConferir || cf.dataset.ctDevolverOk, motivo = aceitar ? null : ((cf.closest(".ct-devolver-box")?.querySelector("textarea") || $("#ctMotivo"))?.value || "").trim();
      // No quadro "Line-up e contratos", a mensagem aparece no próprio quadro; na tabela, em cima dela.
      const caixa = cf.closest("[data-ct-msg]")?.dataset.ctMsg, msgEl = () => (caixa && $(`[data-ct-msg="${CSS.escape(caixa)}"] .ct-msg`)) || $("#ctConfMsg");
      const c = (S.eq?.contr || []).find((x) => x.id === cid), msg = msgEl();
      if (!c) return true;
      if (!aceitar && motivo.length < 5) { diz(msg, "Escreva o motivo: a pessoa vai ler o que precisa corrigir."); $("#ctMotivo")?.focus(); return true; }
      if (aceitar && !confirmaAqui(cf, `Confirmar que o arquivo assinado de "${c.titulo}" está certo?`, "Depois de conferido, o contrato não muda mais e a pessoa vê \"Assinado e conferido\".", "Sim, está certo")) return true;
      diz(msg, "Salvando…"); cf.disabled = true;
      try {
        const r = await api.conferirContrato(cid, aceitar, motivo), quem = (S.eq?.perfis || []).find((x) => x.id === c.user_id); Object.assign(c, r || {}); S.ctDevolver = null;
        TQDiario.registrar(aceitar ? "contrato_conferido" : "contrato_pedido_de_novo", { contrato: cid });
        render(); diz(msgEl(), aceitar ? `✓ Contrato conferido e confirmado: ${c.titulo}.` : `✓ Pedido enviado: ${quem ? nomeDaConta(quem) : "a pessoa"} vai ver o motivo na tela do contrato e enviar o arquivo de novo.`);
      } catch (x) { cf.disabled = false; diz(msg, traduz(x.message || "")); }
      return true;
    }
    const can = t.closest("[data-ct-cancelar]"); if (can) {
      if (!confirmaAqui(can, "Cancelar este contrato?", "A pessoa deixa de ver o pedido de assinatura. O contrato fica na lista como cancelado.", "Sim, cancelar o contrato")) return true;
      await acao(can, async () => { await api.cancelarContrato(can.dataset.ctCancelar); S.eq = null; render(); }, { ok: "Contrato cancelado. A pessoa não vê mais o pedido de assinatura." }); return true;
    }
    if (t.id === "ctSalvarDados") {
      const c = meusContratos().find((x) => x.id === S.contrAberto); if (!c) return true;
      const d = {}, erros = []; document.querySelectorAll("[data-ct-dado]").forEach((i) => { const campo = c.campos.find((x) => x.chave === i.dataset.ctDado), rot = campo?.rotulo || i.dataset.ctDado;
        const comb = i.hasAttribute("data-cid-uf"), val = comb ? valorCidade(i) : i.value, pc = comb && val ? problemaCidadeUF(val, rot) : null;
        const r = pc ? { erro: pc } : i.matches("select[data-uf]") ? (UF_OK.has(ufDe(val)) ? { v: ufDe(val) } : { erro: `${rot}: escolha o estado` }) : VAL.porRotulo(rot, val);
        i.classList.toggle("campo-falta", !!r.erro); if (r.erro) erros.push(r.erro); else { d[i.dataset.ctDado] = r.v; if (!comb) i.value = r.v; } });
      const msg = $("#ctDadosMsg");
      if (erros.length) { diz(msg, `✕ Não salvou. Corrija: ${erros.join("; ")}.`); marcar([...document.querySelectorAll("[data-ct-dado].campo-falta")]); return true; }
      await acao(t, async () => { await api.contratoSalvarDados(c.id, d); store.del("tq-rascunho-ct-" + c.id); S.conta.contr = await api.contratos(); render(); }, { st: "#ctDadosMsg", ok: "Dados salvos. Agora baixe o PDF." });
      return true;
    }
    if (t.id === "ctAssinar") {
      const c = meusContratos().find((x) => x.id === S.contrAberto); if (!c) return true;
      if (barrar($("#ctErr"), [[$("#ctConcordo"), !$("#ctConcordo")?.checked && "marque que leu e concorda com os termos"], [$("#ctNome"), !VAL.nome($("#ctNome")?.value) && "escreva o seu nome completo (nome e sobrenome)"]], "Não assinou")) return true;
      const h = await TQContrato.hash(TQContrato.preencher(c.texto, c.campos, c.dados));
      const r = await acao(t, () => api.assinarContrato(c.id, $("#ctNome").value, h), { st: "#ctErr", espera: "Assinando…", ok: "Contrato assinado. Próximo passo: o Tranquilo confere e você vê \"Assinado e conferido\" aqui." });
      if (!r.ok) return true;
      TQDiario.registrar("contrato_assinado", { contrato: c.id });
      S.conta.contr = await api.contratos(); render(); scrollTo(0, 0); return true;
    }
    return false;
  }
  // "Preparar contratos do line-up": um contrato para cada artista (e a casa) da data que ainda não tem, sem duplicar.
  async function gerarContratosLineup(btn) {
    const id = btn.dataset.lpGerar, x = (S.eq?.datasP || []).find((d) => d.id === id); if (!x || btn.disabled) return;
    lerLpVal();
    const E = S.eq, e = eventoDoPortal(x), L = lineupDe(E, x), artOk = temArea("agenda");
    const aPrep = [...(artOk ? L.artistas : []), ...(L.casa ? [L.casa] : [])].filter((l) => l.etapa === "sem");
    const mods = (E.modContr || []).filter((m) => m.ativo !== false), mA = modeloLineup("art", mods.filter((m) => !ehCasaModelo(m)), x), mC = modeloLineup("casa", mods.filter(ehCasaModelo), x);
    const msg = () => $(`#lpMsg-${CSS.escape(id)}`), feitos = [], sem = [];
    btn.disabled = true; diz(msg(), "Preparando…");
    try {
      for (const l of aPrep) {
        const ehCasa = (E.perfis || []).find((p) => p.id === l.user_id)?.tipo === "casa", m = ehCasa ? mC : mA;
        if (!m) { sem.push(l.nome); continue; }
        // Sem duplicar: confere de novo na hora (outra pessoa da equipe pode ter gerado enquanto isso).
        if ((E.contr || []).some((c) => c.user_id === l.user_id && c.evento_id === "p:" + id && c.status !== "cancelado")) continue;
        const P = montarContrato(m, l.user_id, e, l);
        for (const c of P.campos) { const v = (S.lpVal || {})[l.user_id + "|" + c.chave]; if (v && !/[{}]{2}/.test(v)) P.valores[c.chave] = v; }
        const daEquipe = P.campos.filter((c) => P.valores[c.chave]), daPessoa = P.campos.filter((c) => !P.valores[c.chave]);
        const n = await api.criarContrato({ user_id: l.user_id, evento_id: "p:" + id, titulo: P.titulo, modelo_id: m.id, texto: TQContrato.preencher(P.texto, daEquipe, P.valores), campos: daPessoa });
        (E.contr ||= []).unshift(n || { user_id: l.user_id, evento_id: "p:" + id, status: "enviado" }); feitos.push(l.nome);
      }
      TQDiario.registrar("contratos_lineup", { contratos: feitos.length });
      S.lpPrep = null; S.lpVal = {}; S.lpAberto = id; S.eq = null; await carregarEquipe(); render();
      diz(msg(), `✓ ${feitos.length ? `${feitos.length} ${feitos.length === 1 ? "contrato preparado" : "contratos preparados"}: ${feitos.join(", ")}. Cada um já vê o pedido na própria área.` : "Nenhum contrato novo: todos já tinham."}${sem.length ? ` Sem modelo de contrato para: ${sem.join(", ")} (cadastre em Modelos de contrato).` : ""}`);
    } catch (x) {
      btn.disabled = false; S.eq = null; await carregarEquipe(); render();
      diz(msg(), `✕ ${traduz(x.message || "")}${feitos.length ? ` Já preparados: ${feitos.join(", ")}. Toque de novo para gerar os que faltam (sem duplicar).` : ""}`);
    }
  }
  // Calendário de um mês (segunda a domingo). celula(dia) → { classe, rotulo, clicavel }.
  // Criar datas: cruza a disponibilidade das casas (Datas da casa) com a dos artistas (banco v24) num período e cidade,
  // tirando quem já tem show no dia (Notion e datas do portal). Clicar numa casa ou artista já preenche a Nova data.
  // Calendário de disponibilidade da artista (banco v24): igual ao da casa. Aparece na Ficha (inscrição) e na aba Disponibilidade.
  // Dias fixos da semana (banco v27): marcar "segunda" deixa toda segunda disponível no calendário e no cruzamento da Isa.
  // Um dia marcado no calendário vale sobre a semana. Casa sem semana salva usa os dias da Ficha (campo do modelo do Gui).
  const SEM = [[1, "Seg"], [2, "Ter"], [3, "Qua"], [4, "Qui"], [5, "Sex"], [6, "Sáb"], [0, "Dom"]];
  const NOME_SEM = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
  const FICHA_DIA = { domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6 };
  const wdDe = (dia) => new Date(dia + "T12:00:00Z").getUTCDay();
  function semanaDe(rows, { casaRef, userId, fichaDias, cidade, soGeral }) {
    const k = (x) => String(x || "").trim().toLowerCase(), c1 = (x) => k(String(x || "").split("/")[0]);
    if (!casaRef && userId) {
      // Artista (v29): a linha sem cidade vale para qualquer cidade; com cidade, só para ela. Sem cidade pedida, soma todas.
      const rs = (rows || []).filter((x) => x.user_id === userId && (soGeral ? !x.cidade : !x.cidade || cidade === undefined || c1(x.cidade) === c1(cidade)));
      return [...new Set(rs.flatMap((x) => (x.dias || []).map(Number)))];
    }
    const r = (rows || []).find((x) => casaRef ? x.casa_ref && k(x.casa_ref) === k(casaRef) : x.user_id && x.user_id === userId);
    return r ? (r.dias || []).map(Number) : (fichaDias || []).map((d) => FICHA_DIA[d]).filter((n) => n != null);
  }
  // disponivel | indisponivel | semana (livre pela semana fixa) | null
  const situacaoDia = (explicito, dias, dia) => explicito?.situacao || (dias.includes(wdDe(dia)) ? "semana" : null);
  const livreNo = (sit) => sit === "disponivel" || sit === "semana";
  // Artista (v29): para cada cidade que ele escolheu, os dias da semana em que pode tocar ali; "Qualquer cidade" vale para todas.
  function blocoSemanaCidades() {
    const d = S.conta.insc?.dados || {}, eu = S.conta.perfil.id;
    const cids = [...new Set([...(d.cidades_interesse || []), d.cidade_base, ...String(d.outras_cidades || "").split(/[,;]/)].map((x) => String(x || "").trim()).filter(Boolean))];
    const linha = (cid) => { const dias = semanaDe(S.sem, cid ? { userId: eu, cidade: cid } : { userId: eu, soGeral: true }).filter((n) => cid ? (S.sem || []).some((x) => x.user_id === eu && x.cidade && x.cidade.toLowerCase() === cid.toLowerCase() && (x.dias || []).map(Number).includes(n)) : true);
      return `<div class="sem-cid"><b>${cid ? esc(cid) : "Qualquer cidade"}</b><div class="fcidades">${SEM.map(([n, t]) => `<label><input type="checkbox" data-sem="artista" data-cid="${esc(cid)}" value="${n}"${dias.includes(n) ? " checked" : ""}> ${t}</label>`).join("")}</div></div>`; };
    return `<div class="card" style="margin:0 0 12px"><b>Dias da semana em cada cidade</b>
      <p class="muted" style="font-size:13px;margin:4px 0 8px">Para cada cidade, marque os dias em que você pode tocar lá (ex.: São Paulo seg, ter e qua; Campinas ter e qua; BH qui ou sex). "Qualquer cidade" vale para todas. A Isa cruza isso com as casas de cada cidade. Exceções (um dia bloqueado ou liberado) você ajusta em "Ajustar uma data", abaixo do calendário.</p>
      ${cids.map(linha).join("")}${linha("")}
      ${cids.length ? "" : `<p class="muted" style="font-size:13px">Marque as cidades onde quer tocar na sua ficha para aparecerem aqui.</p>`}
      <div class="err" role="status" aria-live="polite" id="semErr"></div></div>`;
  }
  // ---------- exceções ao padrão semanal (pedido da Marina, 18/11/2026) ----------
  // O padrão (dias fixos da semana) já preenche o calendário. A exceção é um dia marcado por data em
  // disponibilidade_casa / disponibilidade_artista: "indisponível" bloqueia um dia que estaria livre (feriado,
  // evento privado) e "disponível" libera um dia fora do padrão. O dia marcado vale sobre a semana, inclusive
  // no cruzamento de Criar datas (livresNoDia lê as mesmas tabelas).
  function contextoDisp(alvo) {
    if (alvo === "casa") {
      const ref = S.conta.perfil.vinculo_nome, k = (x) => String(x || "").toLowerCase();
      return { linhas: (S.disp || []).filter((x) => k(x.casa_ref) === k(ref)), sem: semanaDe(S.sem, { casaRef: ref, fichaDias: S.conta.casa?.dados?.dias_semana }), pode: !funcoesDe(),
        marcar: (dia, sit, nota) => api.marcarDisponibilidade(ref, dia, sit, nota), lista: () => (S.disp ||= []), nova: (dia, sit, nota) => ({ casa_ref: ref, dia, situacao: sit, nota }) };
    }
    const eu = S.conta.perfil.id;
    return { linhas: (S.dispA || []).filter((x) => x.user_id === eu), sem: semanaDe(S.sem, { userId: eu }), pode: true,
      marcar: (dia, sit, nota) => api.marcarDispArtista(dia, sit, nota), lista: () => (S.dispA ||= []), nova: (dia, sit, nota) => ({ user_id: eu, dia, situacao: sit, nota }) };
  }
  /** A linha por data é exceção ao padrão? (bloqueio, ou dia liberado fora dos dias fixos) */
  const ehExcecao = (r, sem) => !!r && (r.situacao === "indisponivel" || (r.situacao === "disponivel" && !sem.includes(wdDe(r.dia))));
  const rotuloExc = (r) => (r.situacao === "indisponivel" ? "bloqueado" : "liberado") + (r.nota ? ` · ${r.nota}` : "");
  function dicaExc(alvo, dia) {
    if (!dia) return "Escolha o dia para ver como ele está hoje.";
    const c = contextoDisp(alvo), r = c.linhas.find((x) => x.dia === dia), padrao = c.sem.includes(wdDe(dia));
    return `${NOME_SEM[wdDe(dia)].replace(/^./, (x) => x.toUpperCase())}, ${dt(dia)}: ${r ? `já tem exceção (${rotuloExc(r)}). Salvar troca por esta.` : padrao ? "pelo padrão semanal, está livre. Para fechar, escolha Bloquear." : "fora do padrão semanal. Para abrir, escolha Liberar."}`;
  }
  function blocoExcecoes(alvo) {
    const c = contextoDisp(alvo), hoje = hojeIso();
    const exc = c.linhas.filter((r) => r.dia >= hoje && ehExcecao(r, c.sem)).sort((a, b) => a.dia.localeCompare(b.dia));
    const aberto = c.pode && S.excAberto === alvo, pre = S.excPre || {};
    const MAX = 30, item = (r) => `<div class="card row exc-item" data-exc-item="${r.dia}"><span><b>${esc(NOME_SEM[wdDe(r.dia)].replace(/^./, (x) => x.toUpperCase()))}, ${dt(r.dia)}</b>
      <span class="badge ${r.situacao === "indisponivel" ? "b-warn" : "b-good"}">${r.situacao === "indisponivel" ? "Bloqueado" : "Liberado"}</span>${r.nota ? `<div class="muted" style="font-size:13px">${esc(r.nota)}</div>` : ""}</span>
      ${c.pode ? `<button class="btn sm" data-exc-rm="${alvo}|${r.dia}" aria-label="Remover a exceção de ${dt(r.dia)}">Remover</button>` : ""}</div>`;
    return `<section class="card" id="excCaixa" style="margin-top:12px"><div class="row"><div><h3 style="margin:0">Exceções ao padrão</h3>
      <p class="muted" style="font-size:13px;margin:4px 0 0">Feriado, evento privado ou um dia extra: ajuste só aquela data, sem mexer nos dias fixos.${alvo === "artista" ? " A exceção vale para todas as cidades." : ""}</p></div>
      ${c.pode && !aberto ? `<button class="btn pri" data-exc-abrir="${alvo}">Ajustar uma data</button>` : ""}</div>
      ${aberto ? `<div class="card" id="excForm" style="margin:12px 0 0"><b>Ajustar uma data</b>
        <div class="fgrid" style="margin-top:8px"><label class="fcampo"><b>Dia</b><input type="date" id="excDia" min="${hoje}" value="${esc(pre.dia || "")}"></label>
        <label class="fcampo"><b>Motivo (opcional)</b><input id="excMotivo" maxlength="200" placeholder="Ex.: feriado, evento fechado, show extra" value="${esc(pre.nota || "")}"></label></div>
        <div class="filters" style="margin:6px 0" role="radiogroup" aria-label="O que fazer com o dia">
          <label class="fcheck"><input type="radio" name="excTipo" value="bloquear"${pre.tipo === "bloquear" ? " checked" : ""}> <span><b>Bloquear</b>: neste dia não dá</span></label>
          <label class="fcheck"><input type="radio" name="excTipo" value="liberar"${pre.tipo === "liberar" ? " checked" : ""}> <span><b>Liberar</b>: neste dia dá, mesmo fora do padrão</span></label></div>
        <p class="muted" id="excDica" style="font-size:13px;margin:4px 0">${esc(dicaExc(alvo, pre.dia))}</p>
        <div class="barra-acoes"><button class="btn pri" data-exc-ok="${alvo}">Salvar exceção</button><button class="btn" data-exc-fechar="">Cancelar</button></div></div>` : ""}
      <div class="err" role="status" aria-live="polite" id="excErr"></div>
      ${exc.length ? `<div class="list" style="margin-top:10px">${exc.slice(0, MAX).map(item).join("")}</div>${exc.length > MAX ? `<details style="margin-top:8px"><summary class="muted" style="font-size:13px;cursor:pointer">E mais ${exc.length - MAX} ${exc.length - MAX === 1 ? "exceção" : "exceções"} (toque para ver)</summary><div class="list" style="margin-top:8px">${exc.slice(MAX).map(item).join("")}</div></details>` : ""}`
        : `<p class="muted" style="font-size:13px;margin:10px 0 0">Nenhuma exceção marcada. O calendário segue o padrão semanal.</p>`}</section>`;
  }
  function blocoSemana(dias, alvo) {
    return `<div class="card" style="margin:0 0 12px"><b>Dias fixos da semana</b>
      <p class="muted" style="font-size:13px;margin:4px 0 8px">Marque os dias em que ${alvo === "casa" ? "a casa sempre pode receber" : "você sempre pode tocar"}: eles ficam verdes no calendário e já aparecem para a Isa. Para uma exceção (feriado, evento privado, dia extra), use "Ajustar uma data", abaixo do calendário.</p>
      <div class="fcidades">${SEM.map(([n, t]) => `<label><input type="checkbox" data-sem="${alvo}" value="${n}"${dias.includes(n) ? " checked" : ""}> ${t}</label>`).join("")}</div>
      <div class="err" role="status" aria-live="polite" id="semErr"></div></div>`;
  }
  // (antigo) Dias da semana da Ficha do artista: o que está na tela (ainda não salvo) vale; senão, o que foi salvo.
  const DIAS_JS = { domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6 };
  const nomesDias = (ds) => ds.map((d) => ({ segunda: "segundas", terca: "terças", quarta: "quartas", quinta: "quintas", sexta: "sextas", sabado: "sábados", domingo: "domingos" }[d] || d)).join(", ");
  function lerDiasSemana() {
    const tela = [...document.querySelectorAll('[data-multi="dias_semana"]')];
    return tela.length ? tela.filter((x) => x.checked).map((x) => x.value) : (S.conta?.insc?.dados?.dias_semana || []);
  }
  function calendarioArtista() {
    if (S.dispA === undefined) { if (!S.dispACarregando) { S.dispACarregando = true; Promise.all([api.dispArtistas(), api.semanal().catch(() => [])]).then(([r, sm]) => { S.dispA = r; S.sem = sm; }, () => { S.dispA = null; }).finally(() => { S.dispACarregando = false; render(); }); } return carregando("a disponibilidade"); }
    if (S.dispA === null) return faltaSchema("Disponibilidade");
    const k = (x) => String(x || "").trim().toLowerCase(), mes = S.dispMes || hojeIso().slice(0, 7), eu = S.conta.perfil.id;
    const meu = k(S.conta.perfil.vinculo_nome || S.conta.insc?.dados?.nome_artistico || "");
    const evs = (S.pac?.eventos || []).filter((e) => !e.z && meu && (e.a || []).some((n) => k(n) === meu));
    const sem = semanaDe(S.sem, { userId: eu });
    const nLivres = S.dispA.filter((x) => x.user_id === eu && x.situacao === "disponivel" && x.dia >= hojeIso()).length;
    return `${blocoSemanaCidades()}
      <p class="muted" style="font-size:13px;margin:0 0 8px">O calendário já vem preenchido pelos dias fixos. Para bloquear um dia (viagem, compromisso) ou liberar um dia fora do padrão, use <b>Ajustar uma data</b> logo abaixo, ou toque no dia: disponível, indisponível, limpar. A Isa cruza estes dias com as casas livres. Disponível não é data fechada: a data só vale quando o Tranquilo confirma com você.</p>
      ${calendarioMes(mes, (dia) => { const r = S.dispA.find((x) => x.user_id === eu && x.dia === dia), e = evs.filter((x) => x.d === dia), sit = situacaoDia(r, sem, dia);
        return celulaDisp(sit, r, sem, e.length ? e.map((x) => x.h || x.c || "show").join(" · ") : "", dia >= hojeIso() && !e.length); }, "data-dispa-dia")}
      <div class="barra-acoes"><button class="btn sm" data-dispa-mes="todos">Marcar todos os dias deste mês</button><button class="btn sm ghost" data-dispa-mes="limpar" title="Pede confirmação antes.">Limpar as marcações deste mês</button></div>
      <p class="muted" style="font-size:13px;margin:6px 0 0">${sem.length ? `Toda semana: <b>${esc(sem.map((n) => NOME_SEM[n]).join(", "))}</b>. ` : ""}${nLivres ? `Mais <b>${nLivres} ${nLivres === 1 ? "dia avulso" : "dias avulsos"}</b> marcados daqui para frente.` : sem.length ? "" : "Você ainda não marcou nenhum dia livre."}</p>
      <div class="err" role="status" aria-live="polite" id="dispaErr"></div>
      ${blocoExcecoes("artista")}`;
  }
  // Célula do calendário de disponibilidade: evento, padrão ("toda semana") ou exceção (contorno destacado).
  function celulaDisp(sit, r, sem, evento, clicavel) {
    if (evento) return { classe: "cal-ev", rotulo: evento, clicavel };
    const exc = ehExcecao(r, sem);
    return { classe: [livreNo(sit) ? "livre" : sit === "indisponivel" ? "ocupado" : "", exc ? "exc" : ""].filter(Boolean).join(" "),
      rotulo: exc ? (r.situacao === "indisponivel" ? "bloqueado" : "liberado") + (r.nota ? ` · ${r.nota}` : "") : sit === "semana" ? "toda semana" : sit === "disponivel" ? "disponível" : sit === "indisponivel" ? "indisponível" : "", clicavel };
  }
  // Quem está livre num dia: casa que marcou "disponível" em Datas e artista que marcou em Disponibilidade, sem show
  // nesse dia (Notion ou datas do portal). ignorarId = a data do portal que está sendo editada (não conta contra ela mesma).
  // Pendências da equipe organizadas por AÇÃO (pedido da Marina, 18/11/2026): cada bloco é um verbo ("Habilitar casas",
  // "Conferir contrato assinado"…) e cada linha diz quem, onde e quando, e abre direto o item (data-abrir).
  // Usado no "Para você" (Gui, Isa, Bruno) e no "Comece por aqui" da administração.
  // Ordem: o que trava o evento mais próximo primeiro; o que não tem data vai depois, pela prioridade (prio).
  function pendenciasEquipe(E, areas) {
    const k = (x) => String(x || "").trim().toLowerCase(), hoje = hojeIso(), mais = (n) => new Date(Date.parse(hoje + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
    const evsNotion = (S.pac?.eventos || []).filter((e) => !e.z), evsPortal = (E.datasP || []).filter((x) => x.status !== "cancelada").map(eventoDoPortal);
    const todos = [...evsNotion, ...evsPortal], futuros = todos.filter((e) => e.d >= hoje).sort((a, b) => a.d.localeCompare(b.d));
    const proximas = (n) => futuros.filter((e) => e.d <= mais(n));
    const evDe = (id) => id && todos.find((e) => e.id === id);
    const casaDoEv = (e) => (E.casas || []).find((c) => c.id === e.kc || (e.h && (k(c.dados?.nome) === k(e.h) || k(c.perfil?.vinculo_nome) === k(e.h))));
    const nomeCasa = (c) => c?.dados?.nome || c?.perfil?.vinculo_nome || "Casa";
    const cidadeCasa = (c) => c?.dados?.cidade_uf || c?.dados?.cidade || "";
    const proxDaCasa = (c) => c && futuros.find((e) => e.kc === c.id || [k(c.dados?.nome), k(c.perfil?.vinculo_nome)].filter(Boolean).includes(k(e.h)));
    const perfilDe = (uid) => (E.perfis || []).find((p) => p.id === uid), nomeDe = (uid) => { const p = perfilDe(uid); return p ? nomeDaConta(p) : "conta"; };
    const casaDoUser = (uid) => (E.casas || []).find((c) => c.user_id === uid);
    const blocos = [];
    // item: { abrir, quem, onde, quando (ISO do evento que ele trava), extra }; sem "abrir" vira linha só de leitura.
    const bloco = (acao, dica, aba, itens, o = {}) => { if (itens.length) blocos.push({ acao, dica, aba, itens: itens.map((x, i) => ({ ...x, i })).sort((a, b) => (a.quando || "9999").localeCompare(b.quando || "9999") || a.i - b.i), prio: 5, info: false, ...o }); };
    const areaCt = (c) => (perfilDe(c.user_id)?.tipo === "casa" ? "operacoes" : "agenda");
    const itemCt = (c, extra) => { const e = evDe(c.evento_id) || proxDaCasa(casaDoUser(c.user_id));
      return { abrir: "ct:" + c.id, quem: nomeDe(c.user_id), onde: e?.h || "", quando: e && e.d >= hoje ? e.d : null, ev: e && e.d >= hoje ? e : null, extra: extra || (c.evento_id ? "" : esc(c.titulo)) }; };
    const contratos = (area) => {
      const L = (E.contr || []).filter((c) => c.status !== "cancelado" && areaCt(c) === area);
      const chegou = (c) => arqsNovos(c).map((f) => String(f.em || "")).sort().pop();
      bloco("Conferir contrato assinado", "O arquivo assinado já chegou: abra, confira e confirme (ou peça de novo com o motivo).", "documentos",
        L.filter((c) => c.status === "enviado" && !c.conferido_em && arqsNovos(c).length).map((c) => itemCt(c, chegou(c) ? "chegou " + dm(chegou(c).slice(0, 10)) : "")), { prio: 1, grupo: ["contrato para conferir", "contratos para conferir"] });
      bloco("Cobrar reenvio de contrato devolvido", "Você pediu o arquivo de novo. Se passar de 3 dias, vale um alô.", "documentos",
        L.filter(ctPedidoDeNovo).map((c) => itemCt(c, `${c.devolvido_em ? "devolvido " + dm(c.devolvido_em.slice(0, 10)) + " · " : ""}${esc(c.devolvido_motivo || "")}`)), { prio: 6, grupo: ["contrato devolvido", "contratos devolvidos"] });
      bloco("Acompanhar a assinatura", "O contrato já está com a pessoa: ela completa os dados, assina e envia de volta.", "documentos",
        L.filter((c) => c.status === "enviado" && !ctRecebido(c) && !ctPedidoDeNovo(c)).map((c) => itemCt(c)), { prio: 8, info: true, grupo: ["contrato esperando assinatura", "contratos esperando assinatura"] });
    };
    // Casa (ou casa e artista) livre e com match: primeiro dia nos próximos 30 dias.
    const casasL = (E.casas || []).filter((c) => c.status !== "encerrada").map((c) => ({ id: c.id, nome: nomeCasa(c), cidade: cidadeCasa(c) }));
    let livres = null; const livresDe = () => (livres ||= livresNoDia(E, casasL, null));
    const diasLivres = (c) => { const L = livresDe(); for (let i = 0; i <= 30; i++) { const d = mais(i); if (!L(d).cs.some((x) => x.id === c.id)) continue; const as = L(d, cidadeCasa(c), true).as; if (as.length) return { d, as }; } return null; };
    const semData = (c) => !futuros.some((e) => e.d <= mais(30) && (e.kc === c.id || [k(c.dados?.nome), k(c.perfil?.vinculo_nome)].filter(Boolean).includes(k(e.h))));
    const quandoLivre = (m) => m ? `livre ${NOME_SEM[wdDe(m.d)].slice(0, 3)}, ${dm(m.d)}` : "sem dia livre com artista nos próximos 30 dias";
    // Propostas de atualização (v34): o que espera resposta e o que foi aceito hoje.
    const propostasBl = (tipo, aba) => {
      const L = (E.prop || []).filter((p) => p.alvo_tipo === tipo);
      bloco("Propostas aguardando resposta", "Você mandou a atualização da ficha e a pessoa ainda não respondeu. Passou de 3 dias? Vale um alô.", aba,
        L.filter((p) => p.status === "pendente").map((p) => ({ abrir: "pp:" + p.id, quem: nomeAlvoPP(p, E), extra: `enviada ${dm(p.criado_em.slice(0, 10))}${p.convite_email && !p.alvo_user ? " · convite ainda não aceito" : ""}` })), { prio: 8, info: true, grupo: ["proposta aguardando resposta", "propostas aguardando resposta"] });
      bloco("Propostas aceitas hoje", "A ficha já foi atualizada com o que a pessoa aceitou.", aba,
        L.filter((p) => ["aceita", "ajustada"].includes(p.status) && String(p.respondido_em || "").slice(0, 10) === hoje).map((p) => ({ abrir: "pp:" + p.id, quem: nomeAlvoPP(p, E), extra: p.status === "ajustada" ? "aceita com ajustes" : "aceita" })), { prio: 9, info: true, grupo: ["proposta aceita hoje", "propostas aceitas hoje"] });
    };
    // Trabalho real em produção (pedido da Marina, 18/11/2026): mesmo sem nenhuma casa ou artista com conta, a agenda e
    // as bases do Notion já dizem o que fazer. Cada linha abre a pré-ficha (o que já sabemos e o que falta).
    // Evento com o nome real da casa (o título do Notion às vezes traz só "Casa em Belo Horizonte · 061c").
    const comNomeReal = (e) => { const pf = casaDoNotion(e); return pf && !PF().generica(pf.nome) && PF().generica(e.h) ? { ...e, h: pf.nome } : e; };
    function blocosReaisOperacoes() {
      if (!PF()) return;
      const D = preFichas(), vistos = new Set(), conv = [];
      for (const e of futuros.filter((x) => !x.portal && x.d <= mais(60))) {
        if (casaDoEv(e)) continue;
        const pf = casaDoNotion(e), ch = pf ? pf.id : "h:" + k(e.h); if (vistos.has(ch)) continue; vistos.add(ch);
        const sit = pf && situacaoPF("casa", pf, E); if (sit?.ficha) continue;
        const n = pf ? pf.proximas.filter((x) => x.d <= mais(60)).length : 1;
        conv.push({ abrir: pf ? `pf:casa|${pf.id}` : "ev:" + e.id, quem: pf?.nome || e.h || "casa a definir", onde: e.c || "", quando: e.d, ev: comNomeReal(e),
          extra: [sit ? (sit.prop ? "pedido enviado, aguardando a casa" : sit.txt) : "casa sem cadastro no Notion", n > 1 ? `${n} datas em 60 dias` : ""].filter(Boolean).join(" · ") });
      }
      bloco("Convidar a casa e completar a Ficha", "Casa com data no Notion nos próximos 60 dias e sem Ficha no portal. Abre a Ficha já pré-preenchida pelo Notion; o que falta você pede em “Solicitar à casa” (convite e proposta, com a mensagem de WhatsApp pronta).", "casas_cad",
        conv, { prio: 3, grupo: ["casa sem Ficha", "casas sem Ficha"] });
      const incompletas = new Map();
      for (const c of (E.casas || []).filter((x) => ["rascunho", "incompleto", "ajustes"].includes(x.status))) incompletas.set(c.id, { c, falta: [...(c.pendencias?.habilitacao || [])] });
      for (const a of alvosComFalta("casa", E)) { const c = casaDoUser(a.user_id); if (c && c.status !== "encerrada") { const x = incompletas.get(c.id) || { c, falta: [] }; x.falta = [...new Set([...x.falta, ...a.falta.map((f) => f.rotulo)])]; incompletas.set(c.id, x); } }
      bloco("Completar a Ficha da casa", "A casa já tem Ficha no portal, mas falta informação. Abre a Ficha; dá para pedir o que falta com “Propor atualização”.", "casas_cad",
        [...incompletas.values()].map(({ c, falta }) => { const e = proxDaCasa(c); return { abrir: "casa:" + c.id, quem: nomeCasa(c), onde: cidadeCasa(c), quando: e?.d || null, ev: e || null, extra: falta.length ? "falta: " + esc(falta.slice(0, 4).join(", ").toLowerCase()) + (falta.length > 4 ? ` e mais ${falta.length - 4}` : "") : esc(STATUS_CASA[c.status]?.[1] || "") }; }), { prio: 6, grupo: ["Ficha incompleta", "Fichas incompletas"] });
      bloco("Reativar casa sem data", "Recebeu o Tranquilo nos últimos 6 meses e não tem nenhuma data marcada. Abre a Ficha pré-preenchida, com as noites e os dias em que a casa costuma receber.", "casas_cad",
        D.casas.filter((c) => c.ultima >= mais(-180) && !c.proximas.length && !proxDaCasa(situacaoPF("casa", c, E).ficha)).sort((a, b) => b.ultima.localeCompare(a.ultima))
          .map((c) => ({ abrir: `pf:casa|${c.id}`, quem: c.nome, onde: c.valores.cidade_uf || c.cidade, quando: null, extra: `última noite ${dt(c.ultima)} · ${c.noites} ${c.noites === 1 ? "noite" : "noites"}` })), { prio: 8 });
    }
    function blocosReaisAgenda() {
      if (!PF()) return;
      const B = basesPub(), vistos = new Set(), pedir = [];
      for (const e of futuros.filter((x) => !x.portal && x.d <= mais(60))) for (const nome of e.a || []) {
        if (vistos.has(k(nome))) continue; vistos.add(k(nome));
        const pf = pfDe("artista", "n:" + PF().chave(nome)), sit = pf ? situacaoPF("artista", pf, E) : null;
        if (sit?.ficha) { const falta = ["whatsapp", "contato_producao"].filter((c) => PP().vazio(sit.ficha.dados?.[c])); if (falta.length) pedir.push({ abrir: "insc:" + sit.ficha.id, quem: nome, onde: e.h || e.c || "", quando: e.d, ev: comNomeReal(e), extra: "falta para o contrato: " + falta.map((c) => PP().rotulo("artista", c).toLowerCase()).join(", ") }); continue; }
        pedir.push({ abrir: pf ? `pf:artista|${refPF(pf)}` : "ev:" + e.id, quem: nome, onde: e.h || e.c || "", quando: e.d, ev: comNomeReal(e), extra: sit ? (sit.prop ? "pedido enviado, aguardando a artista" : sit.txt) : "sem conta no portal" });
      }
      bloco("Convidar artista e pedir os dados", "Artista no line-up de uma data do Notion (60 dias) sem conta no portal ou sem os dados para o contrato. Abre a inscrição pré-preenchida pelo Notion e o “Solicitar à artista”.", "curadoria",
        pedir, { prio: 3, grupo: ["artista sem dados", "artistas sem dados"] });
      const FILA = /^(Avaliando|Para avaliar|Pré-aprovado|Falta link)/;
      if (B?.fila) bloco("Decidir na fila de curadoria do Notion", "Avaliando, Para avaliar, Pré-aprovado e Falta dados, na base Artistas e bandas. A decisão ainda é no Notion; a linha abre o que já sabemos da artista.", "curadoria",
        B.fila.filter((a) => FILA.test(a.status)).sort((a, b) => (B.ordemFila || []).indexOf(a.status) - (B.ordemFila || []).indexOf(b.status))
          .map((a) => ({ abrir: `pf:artista|${semTraco(a.id)}`, quem: a.nome, onde: a.mora || "", quando: null, extra: esc(a.status) })), { prio: 6 });
      const ocupados = new Set(futuros.map((e) => `${PF().chave(e.h)}|${e.d}`)), NS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
      if (B) bloco("Sugestões por histórico para as próximas semanas", "Casa no dia em que mais recebe o Tranquilo ↔ artistas ligadas à cidade, pelo Notion. Não é disponibilidade marcada: confirme antes de criar a data.", "datas_portal",
        PF().sugestoes(B, ocupados, hoje, mais(30), 20).map((x) => ({ abrir: "sughist:", quem: `${x.casa.nome} ↔ ${x.artistas.map((a) => a.nome).join(", ")}`, onde: x.casa.cidade || "", quando: null, extra: `${NS[wdDe(x.dia)]} ${dm(x.dia)}` })), { prio: 9, info: true });
    }
    if (areas.includes("operacoes")) propostasBl("casa", "casas_cad");
    if (areas.includes("agenda")) propostasBl("artista", "curadoria");
    if (areas.includes("operacoes")) {
      contratos("operacoes");
      bloco("Habilitar casas", "Abra a Ficha para habilitar ou pedir ajustes.", "casas_cad",
        (E.casas || []).filter((c) => c.status === "em_analise").map((c) => { const e = proxDaCasa(c); return { abrir: "casa:" + c.id, quem: nomeCasa(c), onde: cidadeCasa(c), quando: e?.d || null, ev: e, extra: e ? "" : "sem data marcada" }; }), { prio: 2 });
      if (E.contr !== null) bloco("Preparar contrato da casa", "Abre \"Preparar contrato\" com a casa já escolhida; a Ficha preenche o que já sabe.", "documentos",
        (E.casas || []).filter((c) => c.status === "habilitada" && etapaCasaEq(E, c)[1] === "Habilitada · aguardando contrato").map((c) => { const e = proxDaCasa(c); return { abrir: `ctpre:|${c.user_id}`, quem: nomeCasa(c), onde: cidadeCasa(c), quando: e?.d || null, ev: e }; }), { prio: 3, grupo: ["casa sem contrato", "casas sem contrato"] });
      bloco("Revisar pedido de atualização de Ficha", "A casa pediu para mudar dados que já tinha enviado.", "casas_cad",
        (E.sol || []).filter((x) => x.status === "pendente").map((x) => { const c = (E.casas || []).find((y) => y.id === x.casa_id), e = proxDaCasa(c); return { abrir: "casa:" + x.casa_id, quem: nomeCasa(c), onde: cidadeCasa(c), quando: e?.d || null, ev: e }; }), { prio: 4 });
      bloco("Chamar casa para completar a Ficha", "Data nos próximos 14 dias com a Ficha da casa ainda não habilitada: vale um alô para a casa terminar.", "casas_cad",
        proximas(14).filter((e) => { const c = casaDoEv(e); return c && c.status !== "habilitada"; }).map((e) => { const c = casaDoEv(e); return { abrir: "casa:" + c.id, quem: e.h || nomeCasa(c), onde: e.c || "", quando: e.d, ev: e, extra: STATUS_CASA[c.status]?.[1] || "" }; }), { prio: 5 });
      blocosReaisOperacoes();
      // Criar datas é da Agenda: quem tem a área abre a Nova data já preenchida; quem não tem (o Gui) abre a Ficha e combina com a Isa.
      const criaDatas = areas.includes("agenda");
      bloco("Fechar data para casa habilitada sem data", criaDatas ? "Casas prontas sem nenhuma data nos próximos 30 dias. Abre a Nova data com a casa (e o dia livre) já escolhidos."
        : "Casas prontas sem nenhuma data nos próximos 30 dias. Abre a Ficha da casa; o dia livre com artista já vem indicado para combinar com a Agenda.", criaDatas ? "datas_portal" : "casas_cad",
        (E.casas || []).filter((c) => c.status === "habilitada" && semData(c)).map((c) => { const m = diasLivres(c); return { abrir: criaDatas ? `dpnova:${c.id}|${m?.d || ""}|` : "casa:" + c.id, quem: nomeCasa(c), onde: cidadeCasa(c), quando: null, extra: quandoLivre(m) }; }), { prio: 7 });
      bloco("Reenviar convite de casa", "Convidada há mais de 3 dias e ainda não entrou: dá pra reenviar ou mandar o link pelo WhatsApp.", "convites",
        (E.conv || []).filter((c) => c.tipo === "casa" && !c.aceito_em && String(c.criado_em || "") < mais(-3)).map((c) => ({ abrir: "conv:" + (c.email || c.id), quem: c.vinculo_nome || c.nome || c.email, extra: c.criado_em ? "convidada em " + dm(c.criado_em.slice(0, 10)) : "" })), { prio: 9, info: true });
    }
    if (areas.includes("agenda")) {
      contratos("agenda");
      bloco("Avaliar na curadoria", "Aprovar, pedir ajustes ou não seguir. A inscrição mais antiga vem primeiro.", "curadoria",
        (E.insc || []).filter((i) => i.status === "em_curadoria").sort((a, b) => String(a.enviado_em || "").localeCompare(String(b.enviado_em || "")))
          .map((i) => ({ abrir: "insc:" + i.id, quem: i.dados?.nome_artistico || "sem nome", onde: [i.dados?.cidade_base, i.dados?.estado].filter(Boolean).join("/"), quando: null, extra: i.enviado_em ? "enviada " + dm(i.enviado_em.slice(0, 10)) : "" })), { prio: 2 });
      // Uma linha por artista da data do portal (30 dias) ainda sem contrato: "Preparar contrato" já escolhe a data e a conta.
      const temCtEv = (e) => (E.contr || []).some((c) => c.evento_id === e.id && c.status !== "cancelado") || (E.docs || []).some((d) => d.evento_id === e.id && d.tipo === "contrato");
      const temCtArt = (e, uid) => (E.contr || []).some((c) => c.evento_id === e.id && c.status !== "cancelado" && c.user_id === uid);
      if (E.contr !== null) bloco("Preparar contrato de artista", "Abre o line-up da data: \"Preparar contratos do line-up\" gera um para cada artista que falta.", "documentos",
        futuros.filter((e) => e.portal && e.d <= mais(30)).flatMap((e) => { const arts = [...(e.portal.artistas || [])].sort((a, b) => (a.ordem || 99) - (b.ordem || 99));
          const sem = arts.filter((a) => a.user_id ? !temCtArt(e, a.user_id) : !temCtEv(e));
          return (sem.length ? sem : arts.length ? [] : temCtEv(e) ? [] : [{}]).map((a) => ({ abrir: a.user_id ? `lp:${e.portal.id}` : `ctpre:${e.id}|`, quem: a.nome || "line-up a definir", onde: e.h || "", quando: e.d, ev: e, extra: a.nome && !a.user_id ? "artista sem conta no portal" : "" })); }), { prio: 3, grupo: ["artista sem contrato", "artistas sem contrato"] });
      bloco("Completar line-up", "Data nos próximos 30 dias com menos de 2 artistas no line-up. Fechado o line-up, a casa recebe a mensagem de cronograma.", "datas_portal",
        proximas(30).filter((e) => ((noiteDe(e)?.artistas || []).filter((a) => a.status === "Confirmado").length || (e.a || []).length) < 2)
          .map((e) => ({ abrir: e.portal && areas.includes("agenda") ? "dp:" + e.portal.id : "ev:" + e.id, quem: (e.a || []).join(", ") || "line-up a definir", onde: e.h || e.c || "", quando: e.d, ev: e, extra: e.portal ? "" : "data do Notion" })), { prio: 5, grupo: ["line-up incompleto", "line-ups incompletos"] });
      bloco("Fechar data / montar line-up", "Casa e artista livres no mesmo dia, com match de cidade, e a casa sem data nos próximos 30 dias. Abre a Nova data já preenchida.", "datas_portal",
        (E.casas || []).filter((c) => c.status !== "encerrada" && semData(c)).map((c) => ({ c, m: diasLivres(c) })).filter((x) => x.m).sort((a, b) => a.m.d.localeCompare(b.m.d))
          .map(({ c, m }) => ({ abrir: `dpnova:${c.id}|${m.d}|${m.as[0].nome}`, quem: `${nomeCasa(c)} ↔ ${m.as.slice(0, 3).map((a) => a.nome).join(", ")}${m.as.length > 3 ? ` e mais ${m.as.length - 3}` : ""}`, onde: cidadeCasa(c), quando: null, extra: quandoLivre(m) })), { prio: 7 });
      blocosReaisAgenda();
    }
    if (areas.includes("marketing")) {
      const H = S.hub;
      if (H) {
        const kc = TQCampanha.chaveCasa, casaRef = (ref) => (E.casas || []).find((c) => [kc(c.dados?.nome), kc(c.perfil?.vinculo_nome)].includes(kc(ref)));
        const proxRef = (ref) => proxDaCasa(casaRef(ref)) || futuros.find((e) => kc(e.h) === kc(ref));
        bloco("Cobrar campanha atrasada", "Dias que passaram sem \"Feito\" da casa: talvez valha um alô.", "campanhas",
          (H.andamento || []).filter((a) => a.atrasados > 0).map((a) => ({ abrir: "camp:" + a.campanha_id, quem: a.casa_ref, onde: "", quando: proxRef(a.casa_ref)?.d || null, ev: proxRef(a.casa_ref) || null, extra: `${a.atrasados} ${a.atrasados === 1 ? "dia atrasado" : "dias atrasados"}` })), { prio: 2 });
        bloco("Acompanhar campanha de hoje", "A casa tem um dia da campanha para hoje.", "campanhas",
          (H.andamento || []).filter((a) => a.proximo && String(a.proximo).slice(0, 10) === hoje).map((a) => { const it = (H.itens || []).find((i) => i.campanha_id === a.campanha_id && String(i.dia).slice(0, 10) === hoje);
            const canais = [...new Set((it?.acoes || []).map((x) => x.canal).filter(Boolean))].join(", ");
            return { abrir: "camp:" + a.campanha_id, quem: a.casa_ref, onde: "", quando: proxRef(a.casa_ref)?.d || null, ev: proxRef(a.casa_ref) || null, extra: "hoje" + (canais ? ": " + esc(canais) : "") }; }), { prio: 3 });
        // Datas reais do Notion com vendas abertas ou confirmadas (30 dias) e sem campanha carregada no portal.
        bloco("Carregar campanha para a data", "Vendas abertas ou data confirmada no Notion, nos próximos 30 dias, e nenhuma campanha carregada para a casa no portal. Abre a data; a campanha se carrega em Campanhas." + (H.erro ? " (As campanhas não carregaram agora: confira em Campanhas.)" : ""), "campanhas",
          proximas(30).filter((e) => (e.portal || /vendas|confirmad/i.test(e.s || "")) && !(H.erro ? [] : H.campanhas || []).some((c) => kc(c.casa_ref) === kc(e.h) || (casaDoNotion(e) && kc(c.casa_ref) === kc(casaDoNotion(e).nome)))).map((e) => ({ abrir: "ev:" + e.id, quem: casaDoNotion(e)?.nome || e.h || "casa a definir", onde: e.c || "", quando: e.d, ev: comNomeReal(e), extra: esc(e.s || "") })), { prio: 4, grupo: ["data sem campanha", "datas sem campanha"] });
        bloco("Campanhas no ar", "Campanhas com dias pela frente e sem atraso.", "campanhas",
          (H.andamento || []).filter((a) => !a.atrasados && a.proximo && String(a.proximo).slice(0, 10) > hoje).map((a) => ({ abrir: "camp:" + a.campanha_id, quem: a.casa_ref, onde: "", quando: proxRef(a.casa_ref)?.d || null, ev: proxRef(a.casa_ref) || null, extra: "próximo dia " + dm(String(a.proximo).slice(0, 10)) })), { prio: 9, info: true, grupo: ["campanha no ar", "campanhas no ar"] });
      }
    }
    const chave = (b) => b.itens.find((x) => x.quando)?.quando || "9999";
    return blocos.sort((a, b) => chave(a).localeCompare(chave(b)) || a.prio - b.prio);
  }
  const dm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  // ---------- Modelo de cada papel e acompanhamento (pedido da Marina, 18/11/2026; regras em src/modelos.js) ----------
  // O mesmo formato da campanha do Bruno para todos: PADRÃO por data, AÇÃO FUNCIONANDO (o próximo passo), AÇÃO SOS
  // (alerta com socorro pronto), ACOMPANHAMENTO (% feito, atrasados, SOS) e MÉTODO (cada ação abre o "como fazer").
  // O "Feito" da equipe usa a tabela checklist (item "op:…", "ag:…", "mk:…"), com quem marcou e quando.
  const MD = () => window.TQModelos;
  // O modelo de trabalho entrou no ar em 18/11/2026: prazos anteriores não contam como "aberto" nem entram nas métricas.
  const INICIO_MODELO = "2026-11-18";
  const NOME_PAPEL = { operacoes: "Gui · Operações", agenda: "Isa · Agenda", marketing: "Bruno · Marketing", casa: "Casa", artista: "Artistas" };
  /** Datas que entram no acompanhamento (de 3 dias atrás a 35 dias à frente) com os passos de cada papel e os SOS. */
  // janela = [de, até] em dias a partir de hoje; o painel de desempenho (só adm) e o "aberto em datas que passaram" usam -60.
  function modeloDatas(E, janela = [-3, 35]) {
    const k = (x) => String(x || "").trim().toLowerCase(), hoje = hojeIso(), mais = (n) => new Date(Date.parse(hoje + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
    const chave = `${hoje}|${janela.join(",")}|${(E.chk || []).length}|${(E.contr || []).length}|${(E.datasP || []).length}|${(E.eqc || []).length}|${S.hub ? 1 : 0}|${(S.pac?.eventos || []).length}`;
    E._modelos ||= {}; const cache = E._modelos[janela.join(",")];
    if (cache?.chave === chave) return cache.datas;
    const vistos = new Set(), evs = [...(S.pac?.eventos || []).filter((e) => !e.z), ...(E.datasP || []).filter((x) => x.status !== "cancelada").map(eventoDoPortal)]
      .filter((e) => e.d >= mais(janela[0]) && e.d <= mais(janela[1]) && !vistos.has(e.id) && vistos.add(e.id)).sort((a, b) => a.d.localeCompare(b.d));
    const perfis = E.perfis || [], tipoDe = (uid) => perfis.find((p) => p.id === uid)?.tipo, H = S.hub, kc = TQCampanha.chaveCasa;
    const datas = evs.map((e) => {
      const casa = (E.casas || []).find((c) => c.id === e.kc || (e.h && (k(c.dados?.nome) === k(e.h) || k(c.perfil?.vinculo_nome) === k(e.h))));
      const ref = casa?.perfil?.vinculo_nome || casa?.dados?.nome || e.h || "";
      const casaUsers = perfis.filter((p) => p.tipo === "casa" && (p.id === casa?.user_id || (ref && k(p.vinculo_nome) === k(ref)))).map((p) => p.id);
      const cts = (E.contr || []).filter((c) => c.evento_id === e.id && c.status !== "cancelado");
      const pdf = (E.docs || []).some((d) => d.evento_id === e.id && d.tipo === "contrato");
      const estado = (cs) => !cs.length ? (pdf ? "assinado" : "sem") : cs.every(ctAssinado) ? "assinado" : "enviado";
      const fCasa = MD().feitosDe(E.chk, e.id, (c) => casaUsers.includes(c.user_id));
      const casaPs = casaUsers.length ? MD().passos("casa", e.d, fCasa, hoje, e.m) : [];
      const arts = e.portal ? [...(e.portal.artistas || [])].sort((a, b) => (a.ordem || 99) - (b.ordem || 99))
        : (e.a || []).map((nome) => ({ nome, user_id: perfis.find((p) => p.tipo === "artista" && k(p.vinculo_nome) === k(nome))?.id || null }));
      const artistas = arts.map((a) => {
        const cA = a.user_id ? cts.filter((c) => c.user_id === a.user_id) : [], f = a.user_id ? MD().feitosDe(E.chk, e.id, (c) => c.user_id === a.user_id) : {};
        if (cA.some(ctRecebido)) f.contrato ||= true;
        const ps = a.user_id ? MD().passos("artista", e.d, f, hoje, e.m) : [];
        const wa = a.whatsapp || (E.insc || []).find((i) => i.user_id === a.user_id)?.dados?.whatsapp || perfis.find((p) => p.id === a.user_id)?.whatsapp || "";
        return { nome: a.nome, user_id: a.user_id || null, passos: ps, whatsapp: wa, contrato: a.user_id || e.portal ? estado(cA) : null, atrasados: ps.filter((p) => p.atrasado).map((p) => p.titulo) };
      });
      const eqc = E.eqc == null || !ref ? null : E.eqc.filter((m) => k(m.casa_ref) === k(ref)), cob = eqc && casaUsers.length ? TQEquipe.cobertura(eqc) : null;
      const camp = H && !H.erro && ref ? (H.campanhas || []).find((c) => kc(c.casa_ref) === kc(ref)) : null;
      const and = camp && (H.andamento || []).find((a) => a.campanha_id === camp.id);
      const campanha = H && !H.erro && ref ? { existe: !!camp, atrasados: and?.atrasados || 0 } : null;
      const lineup = { n: (noiteDe(e)?.artistas || []).filter((a) => a.status === "Confirmado").length || arts.length, minimo: R.vagasFormato(e.m).minimo };
      const ctCasa = casaUsers.length ? estado(cts.filter((c) => casaUsers.includes(c.user_id))) : null;
      const auto = { ficha: casa?.status === "habilitada", treino: (S.pac?.eventos || []).some((x) => x.d < hoje && !x.z && k(x.h) === k(e.h)) || !!S.tri?.find?.((t) => k(t.casa_ref) === k(ref) && t.concluida),
        equipe: !!cob?.completa, ct_casa: ctCasa === "assinado", casa_em_dia: casaPs.length > 0 && !casaPs.some((p) => p.atrasado), registro: (E.reg || []).some((r) => r.evento_id === e.id) || !!fCasa.publico,
        fechamento: !!(fCasa.fechamento && fCasa.estoque), material: !!fCasa.material_social, lineup: lineup.n >= lineup.minimo,
        ct_art_env: artistas.length > 0 && artistas.every((a) => a.contrato !== "sem"), ct_art_ok: artistas.length > 0 && artistas.every((a) => a.contrato === "assinado" || a.contrato === null && pdf),
        campanha: !!campanha?.existe, campanha_em_dia: !!campanha?.existe && !campanha.atrasados, art_ok: artistas.some((a) => a.user_id) && artistas.filter((a) => a.user_id).every((a) => a.passos.some((p) => p.chave === "camp_ok" && p.feito)) };
      const fEq = MD().feitosDe(E.chk, e.id, (c) => /^(op|ag|mk):/.test(c.item) && ["equipe", "adm"].includes(tipoDe(c.user_id)));
      // Repasse incompleto: alguém marcou "Feito" à mão, mas o portal ainda não confere (ex.: contratos "enviados" sem contrato no portal).
      const eq = Object.fromEntries(MD().PAPEIS_EQUIPE.map((p) => [p, MD().passos(p, e.d, fEq, hoje, e.m, auto).map((y) => y.auto && y.marca?.por && !auto[y.auto] ? { ...y, incompleto: true } : y)]));
      const whatsCasa = casa?.dados?.whatsapp || casa?.perfil?.whatsapp || (ref ? waDaCasa(ref) : "");
      const sos = MD().sosDaData({ id: e.id, dia: e.d, hoje, casa: e.h || ref, produto: e.m, lineup, artistas, contratoCasa: ctCasa, equipe: cob ? { completa: cob.completa, falta: TQEquipe.listaFalta(cob) } : null,
        campanha, casaAtrasados: casaPs.filter((p) => p.atrasado).map((p) => p.titulo), whatsCasa });
      const escalados = MD().feitosDe(E.chk, e.id, (c) => /^sos:/.test(c.item));
      return { e, ref, casa, casaUsers, casaPs, artistas, eq, sos, escalados, whatsCasa, auto };
    });
    E._modelos[janela.join(",")] = { chave, datas };
    return datas;
  }
  /** SOS de todas as datas e das Fichas paradas, só dos papéis pedidos. */
  function sosAbertos(E, papeis) {
    const fichas = MD().sosFichas((E.casas || []).map((c) => ({ id: c.id, nome: c.dados?.nome || c.perfil?.vinculo_nome || "Casa", status: c.status, enviado_em: c.enviado_em })), hojeIso())
      .map((s) => ({ ...s, x: null, escalado: MD().feitosDe(E.chk, "ficha:" + s.chave.split("|")[1], (c) => /^sos:/.test(c.item))["sos:ficha"] }));
    const porData = modeloDatas(E).flatMap((x) => x.sos.map((s) => ({ ...s, x, escalado: x.escalados["sos:" + s.chave.split("|").slice(1).join("|")] })));
    return [...porData, ...fichas].filter((s) => papeis.includes(s.papel));
  }
  const nomeMarcou = (uid) => { if (!uid) return ""; if (uid === S.conta?.perfil.id) return "você"; const p = (S.eq?.perfis || []).find((x) => x.id === uid); return p ? (p.tipo === "casa" || p.tipo === "artista" ? nomeDaConta(p) : String(p.nome || p.email || "").split(" ")[0]) : "a equipe"; };
  const quandoMarcou = (iso) => iso ? ` em ${dm(String(iso).slice(0, 10))}` : "";
  /** "Como fazer": o trecho do Método, o Guia, o Manual do formato ou o material do Bruno. */
  function linkMetodo(m, produto) {
    if (!m) return "";
    if (m.ler) return `<button type="button" class="link-doc" data-ler="${esc(m.ler)}">Como fazer: ${esc(DOCS[m.ler]?.titulo || "material")} →</button>`;
    if (m.manual) { const f = R.produtoBase(produto) || "Descubra"; return `<button type="button" class="link-doc" data-manual="${f}">Como fazer: Manual do ${f} →</button>`; }
    if (m.metodo) return `<button type="button" class="link-doc" data-metodo-sec="${esc(m.metodo)}">Como fazer: Método, “${esc(m.metodo)}” →</button>`;
    if (m.ir) return `<button type="button" class="link-doc" data-ir="${esc(m.ir)}">Onde fazer: ${esc(m.rotulo || "abrir")} →</button>`;
    return "";
  }
  /** Uma ação do modelo: Feito (com quem e quando), prazo, quem faz, o que conta como feito e o método. */
  // Tudo vira anexo (pedido da Marina, 17/11/2026): cada passo tem "Anexar comprovante". O arquivo vai para a pasta
  // passo_<chave>_<data> da própria conta (mesmo armazenamento do contrato assinado); anexar marca o passo como feito,
  // e a equipe vê o anexo no mesmo passo.
  const pastaPasso = (evId, chave) => `passo_${String(chave).replace(/[^\w-]+/g, "_")}_${String(evId).replace(/[^\w-]+/g, "_")}`.slice(0, 120);
  function anexoPasso(evId, chave) {
    if (!evId || !chave || !S.conta) return "";
    const pasta = pastaPasso(evId, chave), equipe = ["equipe", "adm"].includes(S.conta.perfil.tipo);
    const fs = equipe ? (S.eq?.arqs || []).filter((f) => f.evento_id === pasta) : ((S.conta.arqs || {})[pasta] || []);
    const lista = fs.length ? `<span class="md-anexos" style="display:block;font-size:13px;margin-top:4px">📎 ${fs.map((f) => `<a href="#" data-arquivo="${esc(f.caminho)}">${esc(String(f.nome).replace(/^\d+-/, ""))}</a>`).join(" · ")}</span>` : "";
    if (equipe) return lista;
    return `${lista}<details class="md-anexar" style="margin-top:4px"><summary style="font-size:13px">${fs.length ? "Anexar outro comprovante" : "Anexar comprovante"}</summary>
      <input type="file" data-enviar-arquivo="${esc(pasta)}" data-anexo-passo="${esc(evId)}|${esc(chave)}" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.zip,.mp3,.mp4,.mov" aria-label="Anexar comprovante: arquivo">
      <span class="muted" style="font-size:12px;display:block">Print, foto, PDF ou vídeo curto. Ao anexar, o passo fica feito e a equipe do Tranquilo vê o arquivo.</span></details>
      <div class="err" role="status" aria-live="polite" id="arqErr-${esc(pasta)}"></div>`;
  }
  function linhaModelo(p, { evId, produto, marcar = false, quemMarcou = nomeMarcou, campo = "passo-eq", soQuemMarcou = true }) {
    const marca = p.marca?.auto ? "✓ conferido pelo portal" : p.marca?.por ? `✓ feito por ${esc(quemMarcou(p.marca.por))}${quandoMarcou(p.marca.em)}` : p.feito ? "✓ feito" : "";
    const meu = !soQuemMarcou || !p.marca?.por || p.marca.por === S.conta?.perfil.id;
    const caixa = marcar && !p.marca?.auto ? `<input type="checkbox" data-${campo}="${esc(evId)}|${esc(p.chave)}"${p.feito ? " checked" : ""}${meu ? "" : ` disabled title="Marcado por ${esc(quemMarcou(p.marca.por))}: só quem marcou desmarca"`} aria-label="Feito: ${esc(p.titulo)}">` : `<span class="md-marca" aria-hidden="true">${p.feito ? "✓" : p.atrasado ? "!" : "○"}</span>`;
    return `<li class="${p.feito ? "feito" : p.atrasado ? "atrasado" : p.passou ? "passou" : ""}"><label>${caixa} <span><b>${esc(p.titulo)}</b> <span class="muted">· ${MD().rotuloD(p.dias)} (${dtc(p.prazo)})${p.curto ? " · data curta: fazer o quanto antes" : ""}${p.atrasado ? " · atrasado" : p.passou ? " · não registrado" : ""} · quem faz: ${esc(p.quem)}</span>
      <br><span class="muted" style="font-size:13px">${esc(p.texto)} <span class="md-cf">Conta como feito:</span> ${esc(p.feitoQuando || "marcar Feito")}</span>${marca ? `<br><span class="md-feito">${marca}</span>` : ""}${p.incompleto ? `<br><span class="md-incompleto">⚠ Marcado como feito, mas o portal ainda não confere: ${esc(p.feitoQuando || "")}</span>` : ""}</span></label>${linkMetodo(p.metodo, produto)}${anexoPasso(evId, p.chave)}</li>`;
  }
  /** Botões do SOS: cobrar no WhatsApp (mensagem pronta), abrir, ir e escalar para a adm. */
  function acoesSos(s) {
    const x = s.x, ev = x?.e, regra = s.chave.split("|").slice(1).join("|"), evId = ev ? ev.id : "ficha:" + s.chave.split("|")[1];
    return `<div class="barra-acoes" style="margin-top:6px">${s.acoes.map((a) => {
      if (a.tipo === "whatsapp") return `<a class="btn sm pri" href="https://wa.me/${soDigitos(a.para)}?text=${encodeURIComponent(a.texto)}" target="_blank" rel="noopener">${esc(a.rotulo)}${a.para ? "" : " (escolher contato)"}</a>`;
      if (a.tipo === "abrir") return `<button class="btn sm" data-abrir="${esc(a.alvo === "ev" ? (ev.portal ? "lp:" + ev.portal.id : "ev:" + ev.id) : a.alvo)}">${esc(a.rotulo)}</button>`;
      if (a.tipo === "ir") return `<button class="btn sm" data-ir="${esc(a.alvo)}">${esc(a.rotulo)}</button>`;
      if (a.tipo === "escalar") return s.escalado ? `<span class="badge b-warn">escalado por ${esc(nomeMarcou(s.escalado.por))}${quandoMarcou(s.escalado.em)}</span>` : `<button class="btn sm" data-sos-escalar="${esc(evId)}|${esc(regra)}" title="${esc(a.texto)}">${esc(a.rotulo)}</button>`;
      return "";
    }).join("")}</div>`;
  }
  function htmlSos(s) {
    const ev = s.x?.e, onde = ev ? `${NOME_SEM[wdDe(ev.d)].slice(0, 3)} ${dm(ev.d)} · ${esc(ev.h || ev.c || "casa a definir")} · ` : "";
    return `<li class="md-sos"><b>🆘 ${esc(s.titulo)}</b> <span class="muted">· ${onde}${esc(NOME_PAPEL[s.papel])}</span><br><span class="muted" style="font-size:13px">${esc(s.porque)}</span>${acoesSos(s)}</li>`;
  }
  const pctBadge = (r) => `<span class="badge ${r.atrasados || r.sos ? "b-crit" : r.pct === 100 ? "b-good" : "b-warn"}">${r.pct}%${r.atrasados ? ` · ${r.atrasados} atrasado${r.atrasados > 1 ? "s" : ""}` : ""}${r.sos ? ` · ${r.sos} SOS` : ""}</span>`;
  /** Resumo de um papel numa data (passos e SOS daquele papel). */
  function resumoPapel(x, papel) {
    const ps = papel === "casa" ? x.casaPs : papel === "artista" ? x.artistas.flatMap((a) => a.passos) : x.eq[papel];
    return MD().resumo(ps, x.sos.filter((s) => s.papel === papel));
  }
  // ---------- Desempenho da equipe (pedido do Thales e da Marina, 23/11/2026; SÓ a administração vê) ----------
  // Sai dos mesmos passos do modelo de cada papel: prazo de cada passo × quando foi marcado "Feito" (e por quem), a
  // conferência automática do portal e as datas que já passaram. Conta só prazos a partir de INICIO_MODELO.
  const diasEntre = (a, b) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 864e5);
  function metricasPapel(E, papel) {
    const hoje = hojeIso(), datas = modeloDatas(E, [-60, 35]);
    const donos = new Set((E.perfis || []).filter((p) => p.tipo === "equipe" && (p.areas || []).includes(papel)).map((p) => p.id));
    const todos = datas.flatMap((x) => x.eq[papel].map((y) => ({ ...y, x })));
    const vencidos = todos.filter((y) => y.prazo < hoje && y.prazo >= INICIO_MODELO);
    const manual = vencidos.filter((y) => y.feito && y.marca?.por && y.marca.em);
    const noPrazo = vencidos.filter((y) => y.feito && (!y.marca?.em || String(y.marca.em).slice(0, 10) <= y.prazo));
    const tarde = manual.filter((y) => String(y.marca.em).slice(0, 10) > y.prazo);
    const naoFeitos = vencidos.filter((y) => !y.feito);
    const incompletos = todos.filter((y) => y.incompleto && y.prazo >= INICIO_MODELO);
    const porOutro = donos.size ? todos.filter((y) => y.marca?.por && !donos.has(y.marca.por) && y.prazo >= INICIO_MODELO) : [];
    const passadas = datas.filter((x) => x.e.d < hoje && x.e.d >= INICIO_MODELO);
    const fechadas = passadas.filter((x) => x.eq[papel].filter((y) => y.prazo < hoje).every((y) => y.feito));
    const sos = sosAbertos(E, [papel]);
    const pct = (a, b) => b ? Math.round((a / b) * 100) : null;
    const atrasoMedio = tarde.length ? Math.round(tarde.reduce((t, y) => t + diasEntre(y.prazo, String(y.marca.em).slice(0, 10)), 0) / tarde.length) : 0;
    return { papel, vencidos, noPrazo, tarde, naoFeitos, incompletos, porOutro, passadas, fechadas, sos, atrasoMedio,
      pctPrazo: pct(noPrazo.length, vencidos.length), pctFechadas: pct(fechadas.length, passadas.length), pctIncompleto: pct(incompletos.length, todos.filter((y) => y.marca?.por && y.auto).length),
      atrasadosAgora: todos.filter((y) => y.atrasado && y.prazo >= INICIO_MODELO), escalados: sos.filter((s) => s.escalado),
      autoConf: todos.filter((y) => y.marca?.auto).length, feitosTotal: todos.filter((y) => y.feito && y.prazo >= INICIO_MODELO).length };
  }
  /** Leitura em uma frase do que os números dizem, com o foco de cada papel (Isa: qualidade e prazo; Bruno: fechar até o fim). */
  function leituraPapel(m) {
    const fr = [];
    if (!m.vencidos.length && !m.passadas.length) return "Ainda sem prazos vencidos desde 18/11: os números aparecem conforme as datas avançam.";
    if (m.pctPrazo != null) fr.push(m.pctPrazo >= 80 ? `Previsível: ${m.pctPrazo}% dos passos no prazo.` : `Pouco previsível: só ${m.pctPrazo}% dos passos no prazo${m.tarde.length ? `, os atrasados com ${m.atrasoMedio} ${m.atrasoMedio === 1 ? "dia" : "dias"} de atraso em média` : ""}.`);
    if (m.incompletos.length) fr.push(`${m.incompletos.length} ${m.incompletos.length === 1 ? "passo marcado" : "passos marcados"} como feito sem estar completo (repasse incompleto).`);
    if (m.pctFechadas != null) fr.push(m.pctFechadas === 100 ? "Fechou todas as datas que já passaram." : `Fechou ${m.fechadas.length} de ${m.passadas.length} datas que já passaram: ${m.passadas.length - m.fechadas.length} ficaram com passo aberto.`);
    if (m.porOutro.length) fr.push(`${m.porOutro.length} ${m.porOutro.length === 1 ? "passo foi fechado" : "passos foram fechados"} por outra pessoa.`);
    return fr.join(" ");
  }
  // Olhar humano (combinado com a Marina, 24/11/2026): os números não servem para ranquear nem descartar ninguém. Cada papel
  // ganha "Como ajudar a evoluir": a força que os dados mostram, o próximo passo de desenvolvimento ligado ao número, o
  // que o portal já tira das costas da pessoa e o papel mais estratégico que esse tempo libera.
  const EVOLUIR = {
    agenda: { pessoa: "Isa", estrategico: "Curadoria e relação com artistas: descobrir talentos, montar line-ups melhores e cuidar da carreira de quem toca no Tranquilo.",
      forca: "Corre atrás da meta: fecha line-up e contrato mesmo com pouco tempo.",
      passos: [
        [(m) => m.incompletos.length > 0, "Combinar com ela o que é \"pronto para passar adiante\" em cada etapa (line-up, contratos, assinaturas, rider, cronograma). O portal já confere 3 sozinho; ela define os critérios dos outros. Quem define o critério passa a cuidar da qualidade."],
        [(m) => m.pctPrazo != null && m.pctPrazo < 80, "Planejar a semana pelos prazos: toda segunda, abrir o \"Para você\" e fechar primeiro o que vence em 7 dias. Previsibilidade vira hábito antes de virar cobrança."],
        [(m) => m.naoFeitos.length > 0, "Registrar o que fez: o que não é marcado parece não feito. Pedir que marque o Feito na hora (ou anexe o print) protege o trabalho dela."],
      ],
      pergunta: "O que mais te atrapalha para fechar uma etapa completa antes de passar para a próxima?" },
    marketing: { pessoa: "Bruno", estrategico: "Dono dos sistemas de marketing e da estratégia de marca: modelos de campanha, briefings e automações com IA, com a execução nas casas e nos artistas.",
      forca: "Organizado e bom em transformar processo em sistema automatizado com IA.",
      passos: [
        [(m) => m.pctFechadas != null && m.pctFechadas < 100, "Rotina de fechamento: toda segunda, abrir \"Acompanhar até o fim\" e, para cada data da semana anterior, fechar ou cobrar o que ficou aberto. Liderança é levar até o fim, não só começar."],
        [(m) => m.porOutro.length > 0, "Combinar quem acompanha o quê: o que outra pessoa precisou fechar no lugar dele vira um combinado claro, sem resgate."],
        [(m) => m.atrasadosAgora.length > 0, "Usar as cobranças prontas do SOS (WhatsApp com a mensagem pronta) assim que algo atrasar, em vez de esperar o fim da campanha."],
      ],
      pergunta: "Onde você sente que perde o fio de uma entrega depois de passar para a casa ou para o artista?" },
    operacoes: { pessoa: "Gui", estrategico: "Expansão da rede: abrir e treinar casas novas e cuidar da experiência das que já estão, com a parte repetitiva no portal.",
      forca: "Conduz a casa da Ficha até a noite.",
      passos: [
        [(m) => m.pctPrazo != null && m.pctPrazo < 80, "Antecipar os prazos da casa: equipe completa e contrato assinado antes do D-10, com a cobrança pronta do SOS."],
        [(m) => m.naoFeitos.length > 0, "Registrar o fechamento (D+2) de cada noite: é o que dá dado para decidir onde abrir mais datas."],
      ],
      pergunta: "Qual etapa com a casa mais toma o seu tempo e poderia ser feita pela própria casa no portal?" },
  };
  function evolucaoPapel(m) {
    const ev = EVOLUIR[m.papel]; if (!ev) return "";
    const passos = ev.passos.filter(([se]) => se(m)).map(([, t]) => t);
    const forcaDados = m.noPrazo.length ? ` Nos dados: ${m.noPrazo.length} ${m.noPrazo.length === 1 ? "passo feito" : "passos feitos"} no prazo desde 18/11.` : "";
    const portal = `${m.autoConf} ${m.autoConf === 1 ? "passo conferido" : "passos conferidos"} sozinho pelo portal e ${m.sos.length} ${m.sos.length === 1 ? "alerta" : "alertas"} com a cobrança pronta: tempo que deixa de ir para conferir e cobrar.`;
    return `<div class="dsp-evoluir"><h4 style="margin:12px 0 6px">🌱 Como ajudar ${esc(ev.pessoa)} a evoluir</h4><ul class="passos md-lista">
      <li><b>Força:</b> ${esc(ev.forca + forcaDados)}</li>
      <li><b>Próximo passo de desenvolvimento:</b> ${passos.length ? passos.map(esc).join(" ") : "Sem ponto de atenção nos números: vale reconhecer e dar mais autonomia."}</li>
      <li><b>O que o portal já tira das costas:</b> ${esc(portal)}</li>
      <li><b>Para onde esse tempo pode ir:</b> ${esc(ev.estrategico)}</li>
      <li><b>Pergunta para a conversa 1:1:</b> “${esc(ev.pergunta)}”</li></ul></div>`;
  }
  function telaDesempenho() {
    if (S.conta?.perfil.tipo !== "adm") return `<div class="alert"><b>Só a administração vê esta tela.</b></div>`;
    const E = S.eq; if (!E) { carregarEquipe(); return carregando("o desempenho da equipe"); }
    if (!S.hub) carregarHub();
    const num = (v, rot, cls = "") => `<div class="dsp-num ${cls}"><b>${v}</b><span>${rot}</span></div>`;
    const lista = (xs, vazioTxt) => xs.length ? `<ul class="passos md-lista">${xs.slice(0, 30).map((y) => `<li class="md-data"><span class="muted" style="font-size:13px">${NOME_SEM[wdDe(y.x.e.d)].slice(0, 3)} ${dm(y.x.e.d)} · ${esc(y.x.e.h || y.x.e.c || "casa a definir")}</span></li>${linhaModelo(y, { evId: y.x.e.id, produto: y.x.e.m })}`).join("")}</ul>${xs.length > 30 ? `<p class="muted" style="font-size:13px">e mais ${xs.length - 30}.</p>` : ""}` : `<p class="muted" style="font-size:13px">${vazioTxt}</p>`;
    const FOCO = { agenda: "Foco: qualidade do repasse, prazo e previsibilidade.", marketing: "Foco: acompanhar até o fim (nada fica pelo caminho).", operacoes: "Foco: casa pronta no prazo." };
    const card = (p) => {
      const m = metricasPapel(E, p), id = "dsp-" + p;
      const nums = [num(m.pctPrazo == null ? "–" : m.pctPrazo + "%", `no prazo (${m.noPrazo.length} de ${m.vencidos.length} passos vencidos)`, m.pctPrazo == null ? "" : m.pctPrazo >= 80 ? "bom" : "ruim"),
        num(m.pctFechadas == null ? "–" : m.pctFechadas + "%", `datas fechadas até o fim (${m.fechadas.length} de ${m.passadas.length})`, m.pctFechadas == null ? "" : m.pctFechadas === 100 ? "bom" : "ruim"),
        num(m.incompletos.length, "repasses incompletos (feito sem estar completo)", m.incompletos.length ? "ruim" : "bom"),
        num(m.atrasadosAgora.length, "atrasados agora", m.atrasadosAgora.length ? "ruim" : "bom"),
        num(m.tarde.length ? m.atrasoMedio + "d" : "–", `atraso médio quando atrasa (${m.tarde.length} passos)`),
        num(m.porOutro.length, "fechados por outra pessoa"),
        num(m.sos.length, `SOS abertos${m.escalados.length ? ` · ${m.escalados.length} escalados` : ""}`, m.sos.length ? "ruim" : "")].join("");
      const corpo = `<p class="dsp-leitura">${esc(leituraPapel(m))}</p><div class="dsp-grid">${nums}</div>${evolucaoPapel(m)}
        ${dobra(id + "-inc", "Repasses incompletos", `${m.incompletos.length} · marcado como feito, mas o portal não confere`, lista(m.incompletos, "Nenhum."))}
        ${dobra(id + "-abertos", "Ficou aberto ou não registrado", `${m.naoFeitos.length} passos com prazo vencido sem Feito`, lista(m.naoFeitos, "Nenhum."))}
        ${dobra(id + "-tarde", "Feito com atraso", `${m.tarde.length} passos`, lista(m.tarde, "Nenhum."))}
        ${dobra(id + "-outro", "Fechado por outra pessoa", `${m.porOutro.length} passos que outra pessoa marcou`, lista(m.porOutro, "Nenhum."))}`;
      return dobra(id, `${NOME_PAPEL[p]}`, `${m.pctPrazo == null ? "sem prazos vencidos ainda" : m.pctPrazo + "% no prazo"} · ${m.pctFechadas == null ? "nenhuma data passada" : m.pctFechadas + "% das datas fechadas"} · ${m.incompletos.length} incompleto${m.incompletos.length === 1 ? "" : "s"} · ${esc(FOCO[p])}`, corpo, { classe: "card" });
    };
    return `<div class="tag">Administração · só a adm vê</div><h1>Desempenho da equipe</h1>
      <p class="sub">Para entender como cada papel está entregando e como ajudar cada pessoa a evoluir: os números mostram onde apoiar, não servem para ranquear ninguém. Sai do que cada um marca no modelo de trabalho: o prazo de cada passo, quando foi marcado e por quem, o que o portal confere sozinho e as datas que já passaram. Conta a partir de 18/11/2026, quando o modelo entrou no ar. A equipe não vê esta tela, só os próprios avisos no "Para você".</p>
      <div class="barra-acoes" style="margin-bottom:10px"><button class="btn sm" data-acomp-atualizar>Atualizar agora</button></div>
      ${["agenda", "marketing", "operacoes"].map(card).join("")}
      ${dobra("dsp-como", "Como cada número é calculado", "no prazo, datas fechadas, repasse incompleto, atraso médio", `<ul class="passos md-lista">
        <li><b>No prazo:</b> passos com prazo vencido que foram marcados Feito até o dia do prazo (ou que o portal conferiu sozinho), sobre todos os passos vencidos.</li>
        <li><b>Datas fechadas até o fim:</b> datas que já passaram em que todos os passos do papel com prazo vencido estão feitos.</li>
        <li><b>Repasse incompleto:</b> a pessoa marcou Feito, mas o portal ainda não confere (ex.: "contratos enviados" com artista sem contrato no portal). É o sinal de qualidade: passou adiante sem estar pronto.</li>
        <li><b>Atraso médio:</b> dias entre o prazo e o Feito, só nos passos feitos com atraso.</li>
        <li><b>Fechado por outra pessoa:</b> passo do papel marcado por alguém que não é da área (sinal de que alguém precisou resgatar).</li>
        <li>Nada disso aparece para a equipe. Eles veem só, no "Para você", o que ficou aberto em datas passadas e o que foi marcado sem estar completo, para corrigir.</li></ul>`)}`;
  }
  /** Painel compacto do "Para você" e do "Comece por aqui": % feito, atrasados, SOS, e o que fazer agora. */
  function painelModelo(E, papeis) {
    if (!MD()) return "";
    const datas = modeloDatas(E).filter((x) => x.e.d >= hojeIso());
    const ps = datas.flatMap((x) => papeis.flatMap((p) => x.eq[p].map((y) => ({ ...y, x }))));
    const sos = sosAbertos(E, papeis), r = MD().resumo(ps, sos);
    const agora = datas.flatMap((x) => papeis.map((p) => ({ p, x, prox: MD().proximo(x.eq[p]) })).filter((y) => y.prox)).sort((a, b) => a.prox.prazo.localeCompare(b.prox.prazo)).slice(0, 8);
    const quem = papeis.length === 3 ? "da equipe" : papeis.map((p) => NOME_PAPEL[p]).join(" e ");
    // Automação pedida pelo Thales (21/11/2026): o que ficou aberto em datas que já passaram (acompanhar até o fim) e
    // o que foi marcado como feito mas o portal não confere (repasse incompleto). Mostra o passo com o Feito para fechar.
    const linhaData = (p, x) => `<li class="md-data"><span class="muted" style="font-size:13px">${NOME_SEM[wdDe(x.e.d)].slice(0, 3)} ${dm(x.e.d)} · ${esc(x.e.h || x.e.c || "casa a definir")}${papeis.length > 1 ? " · " + esc(NOME_PAPEL[p]) : ""}</span></li>`;
    const passadas = modeloDatas(E, [-30, -1]).filter((x) => x.e.d < hojeIso());
    const abertos = passadas.flatMap((x) => papeis.flatMap((p) => x.eq[p].filter((y) => !y.feito && y.prazo < hojeIso() && y.prazo >= INICIO_MODELO).map((y) => ({ p, x, y }))));
    const incompletos = [...passadas, ...datas].flatMap((x) => papeis.flatMap((p) => x.eq[p].filter((y) => y.incompleto).map((y) => ({ p, x, y }))));
    const listaPassos = (xs) => `<ul class="passos md-lista">${xs.slice(0, 10).map(({ p, x, y }) => linhaData(p, x) + linhaModelo(y, { evId: x.e.id, produto: x.e.m, marcar: temArea(p) })).join("")}</ul>${xs.length > 10 ? `<p class="muted" style="font-size:13px">e mais ${xs.length - 10}.</p>` : ""}`;
    const fimHtml = (incompletos.length ? `<h4 style="margin:12px 0 6px">⚠ Marcado como feito, mas o portal ainda não confere (${incompletos.length})</h4><p class="muted" style="font-size:13px;margin:0 0 4px">Antes de passar adiante, complete o que falta: quem recebe depende disso.</p>${listaPassos(incompletos)}` : "")
      + (abertos.length ? `<h4 style="margin:12px 0 6px">Acompanhar até o fim: ficou aberto em datas que já passaram (${abertos.length})</h4><p class="muted" style="font-size:13px;margin:0 0 4px">A data passou e estes passos não foram fechados. Confira se aconteceu e marque, ou cobre quem ficou devendo.</p>${listaPassos(abertos)}` : "");
    const corpo = `${fimHtml}${sos.length ? `<h4 style="margin:4px 0 6px">SOS: algo atrasou ou travou</h4><ul class="passos md-lista">${sos.slice(0, 6).map(htmlSos).join("")}</ul>${sos.length > 6 ? `<p class="muted" style="font-size:13px">e mais ${sos.length - 6} em Acompanhamento.</p>` : ""}` : `<p class="muted" style="font-size:13px">Nenhum SOS aberto: nada atrasado ou travado.</p>`}
      <h4 style="margin:12px 0 6px">Ação funcionando: o próximo passo de cada data</h4>
      ${agora.length ? `<ul class="passos md-lista">${agora.map(({ p, x, prox }) => `<li class="md-data"><span class="muted" style="font-size:13px">${NOME_SEM[wdDe(x.e.d)].slice(0, 3)} ${dm(x.e.d)} · ${esc(x.e.h || x.e.c || "casa a definir")}${papeis.length > 1 ? " · " + esc(NOME_PAPEL[p]) : ""}</span></li>${linhaModelo(prox, { evId: x.e.id, produto: x.e.m, marcar: temArea(p) })}`).join("")}</ul>` : `<p class="muted" style="font-size:13px">Tudo em dia nas próximas datas.</p>`}
      <div class="barra-acoes" style="margin-top:8px"><button class="btn sm" data-ir="acompanhamento">Ver o acompanhamento de todos os papéis →</button></div>`;
    return dobra("md-painel", `Seu modelo de trabalho ${quem === "da equipe" ? "(todos os papéis)" : "· " + esc(quem)}`,
      `${r.total ? `${r.pct}% feito ${datas.length === 1 ? "na próxima data" : `nas próximas ${datas.length} datas`}` : "sem datas nos próximos 35 dias"} · ${r.atrasados} ${r.atrasados === 1 ? "atrasado" : "atrasados"} · ${sos.length} SOS${abertos.length ? ` · ${abertos.length} aberto${abertos.length > 1 ? "s" : ""} em datas passadas` : ""}${incompletos.length ? ` · ${incompletos.length} sem conferir` : ""} · toque para ver`, corpo, { classe: "md-painel" + (sos.length || abertos.length || incompletos.length ? " md-tem-sos" : "") });
  }
  /** O PADRÃO de cada papel: a sequência de ações por data, com prazo, quem faz, o que conta como feito e o método. */
  function padraoDosPapeis() {
    const linha = (dias, titulo, quem, feito, met, prod = "Descubra") => `<tr><td><b>${MD().rotuloD(dias)}</b></td><td>${esc(titulo)}</td><td>${esc(quem)}</td><td>${esc(feito)}</td><td>${linkMetodo(met, prod)}</td></tr>`;
    const tab = (linhas) => `<div class="tbl-wrap" style="overflow-x:auto"><table class="tbl pilha"><thead><tr><th>Prazo</th><th>Ação</th><th>Quem faz</th><th>Conta como feito</th><th>Método</th></tr></thead><tbody>${linhas}</tbody></table></div>`;
    const eq = MD().PAPEIS_EQUIPE.map((p) => dobra("md-padrao-" + p, `${esc(NOME_PAPEL[p])}`, `${MD().PASSOS_EQUIPE[p].length} ações · ${esc(MD().PAPEIS[p].faz)}`,
      tab(MD().PASSOS_EQUIPE[p].map((l) => linha(l[1], l[2], MD().PAPEIS[p].pessoa, l[4] + (l[6] ? " (o portal confere sozinho)" : ""), l[5])).join(""))));
    const casa = dobra("md-padrao-casa", "Casa (dono e equipe da casa)", `${R.PASSOS_CASA.length} ações · líder, anfitrião, social media, som e porta`,
      tab(R.PASSOS_CASA.map(([k, d, t]) => linha(d, t, MD().quemNaCasa(k), MD().FEITO_CASA[k] || "", MD().METODO_CASA[k])).join("")));
    const art = dobra("md-padrao-artista", "Artista", `${R.PASSOS_ARTISTA.length} ações e a campanha do formato`,
      tab([...R.PASSOS_ARTISTA, ...R.CAMPANHA_ARTISTA.Descubra].sort((a, b) => a[1] - b[1]).map(([k, d, t]) => linha(d, t, "Artista", MD().FEITO_ARTISTA[k] || "", MD().metodoArtista(k))).join("")) + `<p class="muted" style="font-size:13px">A campanha do artista muda com o formato: acima, a do Descubra; no Apresenta, o kit sai no D-35.</p>`);
    const sos = dobra("md-padrao-sos", "Regras do SOS", `${MD().REGRAS_SOS.length} alertas com a ação de socorro pronta`,
      `<div class="tbl-wrap" style="overflow-x:auto"><table class="tbl pilha"><thead><tr><th>Quando dispara</th><th>De quem</th><th>Ação de socorro</th></tr></thead><tbody>${MD().REGRAS_SOS.map((r) => `<tr><td>${esc(r.quando)}</td><td>${esc(NOME_PAPEL[r.papel])}</td><td>${esc(r.acao)}</td></tr>`).join("")}</tbody></table></div>`);
    return eq.join("") + casa + art + sos;
  }
  /** Uma data no acompanhamento: resumo por papel na linha; abre para os passos de cada um, com Feito e SOS. */
  function dataNoAcomp(x, ver) {
    const e = x.e, pap = ver ? [ver] : ["operacoes", "agenda", "marketing", "casa", "artista"];
    const chip = (p) => { const r = resumoPapel(x, p); return r.total ? `<span class="md-chip"><span class="muted">${esc(NOME_PAPEL[p].split(" · ")[0])}</span> ${pctBadge(r)}</span>` : `<span class="md-chip muted">${esc(NOME_PAPEL[p].split(" · ")[0])}: sem conta</span>`; };
    const parte = (p) => {
      const sos = x.sos.filter((s) => s.papel === p).map((s) => ({ ...s, x, escalado: x.escalados["sos:" + s.chave.split("|").slice(1).join("|")] }));
      const sosHtml = sos.length ? `<ul class="passos md-lista">${sos.map(htmlSos).join("")}</ul>` : "";
      if (p === "casa") return `<h4>${esc(x.ref || e.h || "Casa")}</h4>${x.casaPs.length ? `<ul class="passos">${x.casaPs.map((y) => linhaModelo(y, { evId: e.id, produto: e.m })).join("")}</ul>` : `<p class="muted" style="font-size:13px">A casa ainda não tem conta no portal: os passos aparecem quando ela entrar.</p>`}`;
      if (p === "artista") return `<h4>Artistas</h4>${x.artistas.length ? x.artistas.map((a) => a.passos.length ? `<details class="pp-det" data-dobra="md-art:${esc(e.id)}:${esc(a.nome)}"${S.dobras?.[`md-art:${e.id}:${a.nome}`] ? " open" : ""}><summary><b>${esc(a.nome)}</b> ${pctBadge(MD().resumo(a.passos))}</summary><ul class="passos">${a.passos.map((y) => linhaModelo(y, { evId: e.id, produto: e.m })).join("")}</ul></details>` : `<p class="muted" style="font-size:13px">${esc(a.nome)}: sem conta no portal.</p>`).join("") : `<p class="muted" style="font-size:13px">Line-up a definir.</p>`}`;
      const prox = MD().proximo(x.eq[p]);
      return `<h4>${esc(NOME_PAPEL[p])}</h4>${sosHtml}${prox ? `<p style="font-size:13px;margin:4px 0"><b>Ação funcionando:</b> ${esc(prox.titulo)} <span class="muted">· ${MD().rotuloD(prox.dias)} (${dtc(prox.prazo)})</span></p>` : `<p class="muted" style="font-size:13px">Tudo feito para esta data.</p>`}
        <details data-dobra="md-eq:${esc(e.id)}:${p}"${S.dobras?.[`md-eq:${e.id}:${p}`] ? " open" : ""}><summary>Ver as ${x.eq[p].length} ações</summary><ul class="passos">${x.eq[p].map((y) => linhaModelo(y, { evId: e.id, produto: e.m, marcar: temArea(p) })).join("")}</ul></details>`;
    };
    return `<details class="card md-data-card" data-dobra="md-data:${esc(e.id)}"${S.dobras?.["md-data:" + e.id] ? " open" : ""}><summary><span class="dp-sum-tit"><b>${esc(NOME_SEM[wdDe(e.d)].slice(0, 3))} ${dt(e.d)} · ${esc(e.h || e.c || "casa a definir")}</b> <span class="badge">${esc(e.m || "")}</span>${x.sos.length ? ` <span class="badge b-crit">${x.sos.length} SOS</span>` : ""}</span><span class="md-chips">${pap.map(chip).join("")}</span></summary>
      <div class="md-partes">${pap.map((p) => `<div class="md-parte">${parte(p)}</div>`).join("")}</div>
      <div class="barra-acoes" style="margin-top:8px"><button class="btn sm" data-abrir="${esc(e.portal && (temArea("agenda") || temArea("operacoes")) ? "lp:" + e.portal.id : "ev:" + e.id)}">Abrir a data</button></div></details>`;
  }
  // Um bloco de ação: título com verbo e quantos, a dica, o "Abrir" (a lista toda) e cada linha clicável.
  // ---------- "Seu histórico" (pedido da Marina, 18/11/2026: "fiz coisa e meu histórico continuou sem nada") ----------
  // Para todo acesso: equipe (Gui, Isa, Bruno, adm), casa e artista. As linhas vêm de src/historico.js (colunas de quem e
  // quando do banco e, para a equipe, o diário de uso). Agrupado por dia, os últimos 7 dias abertos e o resto recolhido,
  // filtro por tipo e cada linha abre o item.
  const HIST_DIAS = 30;
  function carregarHistorico() {
    if (S.histCarregando || !S.conta) return; S.histCarregando = true;
    const quem = S.conta.perfil.id;
    Promise.resolve().then(() => api.meuHistorico(S.conta.perfil.tipo, new Date(Date.now() - HIST_DIAS * 864e5).toISOString())).catch(() => ({}))
      .then((x) => { if (S.conta?.perfil.id === quem) S.histX = { ...(x || {}), t: Date.now(), quem }; })
      .finally(() => { S.histCarregando = false; render(); });
  }
  function dadosHistorico() {
    const c = S.conta, eu = c.perfil.id;
    if (["equipe", "adm"].includes(c.perfil.tipo)) { const E = S.eq; return { insc: E.insc, casas: E.casas, sol: E.sol, datasP: E.datasP, contr: E.contr, conv: E.conv, docs: E.docs, arqs: E.arqs, eqc: E.eqc }; }
    const arqs = Object.entries(c.arqs || {}).flatMap(([ev, fs]) => (fs || []).map((f) => ({ user_id: eu, evento_id: ev, ...f })));
    const marcos = c.trilha && !funcoesDe() ? Object.entries(c.trilha.marcos || {}).filter(([k]) => TQEquipe.ETAPAS_CASA.includes(k)).map(([etapa, em]) => ({ etapa, feito_em: em })) : [];
    return { insc: c.insc ? [c.insc] : [], casas: c.casa ? [c.casa] : [], sol: c.sol || [], contr: c.contr || [], chk: c.chk || [], arqs, marcos };
  }
  function nomePassoHist(k) {
    if (!S.passosNomes) { S.passosNomes = {}; const d = "2030-01-01"; for (const m of ["artista", "casa"]) for (const pr of ["Descubra", "Apresenta"]) for (const x of R.passosDaData(m, d, {}, d, pr)) S.passosNomes[x.chave] ||= x.titulo; }
    if (window.TQModelos && !S.passosNomes["op:ficha"]) for (const ls of Object.values(TQModelos.PASSOS_EQUIPE)) { for (const l of ls) S.passosNomes[l[0]] = l[2]; }
    if (/^sos:/.test(k)) return "SOS escalado para a adm";
    return k === "contrato" ? "Contrato" : S.passosNomes[k] || "";
  }
  function telaHistorico() {
    const p = S.conta.perfil, eqp = ["equipe", "adm"].includes(p.tipo);
    if (eqp && !S.eq) { carregarEquipe(); return carregando("o que você fez"); }
    const X = S.histX && S.histX.quem === p.id ? S.histX : null;
    if (!X || Date.now() - X.t > 15000) carregarHistorico();
    if (!X) return carregando("o que você fez");
    const k = (x) => String(x || "").trim().toLowerCase();
    const evs = [...(S.pac?.eventos || []), ...[...(S.eq?.datasP || []), ...(S.conta.datasP || [])].map(eventoDoPortal)];
    const nomeEvento = (id) => { const e = evs.find((x) => x.id === id); return e ? `data de ${dm(e.d)}${e.h ? " · " + e.h : ""}` : ""; };
    const etapas = Object.fromEntries([...TQEquipe.TRILHA, ...TQEquipe.DEPOIS_TRILHA].map((e) => [e[0], e[3]]));
    const linhas = TQHistorico.montar({ ...dadosHistorico(), ...X }, {
      eu: p.id, papel: eqp ? "equipe" : p.tipo, desde: new Date(Date.now() - HIST_DIAS * 864e5).toISOString(),
      nome: (uid) => { const x = (S.eq?.perfis || []).find((y) => y.id === uid); return x ? nomeDaConta(x) : ""; },
      nomeCasa: (cid) => (S.eq?.casas || []).find((c) => c.id === cid)?.dados?.nome || "",
      statusInsc: (st) => STATUS_INSC[st]?.[1] || st, statusCasa: (st) => STATUS_CASA[st]?.[1] || st,
      nomePasso: nomePassoHist, nomeEtapa: (e) => etapas[e] || "", nomeEvento,
    });
    const tipos = TQHistorico.TIPOS.filter(([t]) => linhas.some((l) => l.tipo === t)), f = tipos.some(([t]) => t === S.histF) ? S.histF : "";
    const vis = f ? linhas.filter((l) => l.tipo === f) : linhas;
    const hoje = hojeIso(), diaMenos = (n) => new Date(Date.parse(hoje + "T12:00:00Z") - n * 864e5).toISOString().slice(0, 10);
    const rotuloDia = (d) => d === hoje ? "Hoje" : d === diaMenos(1) ? "Ontem" : `${NOME_SEM[wdDe(d)]}, ${dt(d)}`;
    const hora = (em) => { const t = new Date(em); return isNaN(t) ? "" : t.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); };
    const linha = (l) => { const alvo = l.abrir ? ` data-abrir="${esc(l.abrir)}"` : l.ir ? ` data-ir="${esc(l.ir)}"` : "";
      const txt = `<span class="pl-quem">${esc(l.titulo)}</span>${[l.detalhe && esc(l.detalhe), esc(TQHistorico.NOME_TIPO[l.tipo] || ""), hora(l.em)].filter(Boolean).map((t) => `<span class="pl-sep"> · </span><span class="muted">${t}</span>`).join("")}`;
      return alvo ? `<li><button type="button" class="pend-linha" data-hist-linha="${esc(l.tipo)}"${alvo}>${txt}<span class="pl-ir" aria-hidden="true">→</span></button></li>` : `<li class="pend-txt" data-hist-linha="${esc(l.tipo)}">${txt}</li>`; };
    const dias = TQHistorico.porDia(vis), recente = diaMenos(6);
    const antigos = dias.filter(([d]) => d < recente).reduce((n, [, ls]) => n + ls.length, 0);
    const grupo = ([d, ls]) => `<details class="card hist-dia" data-hist-dia="${d}" data-dobra="hist:${d}"${S.dobras?.["hist:" + d] ? " open" : ""}><summary><b>${esc(rotuloDia(d))}</b> <span class="muted">· ${ls.length} ${ls.length === 1 ? "ação" : "ações"}</span></summary><ul class="pend">${ls.map(linha).join("")}</ul></details>`;
    const onde = eqp ? "" : p.tipo === "casa" ? " Fica em Próximos passos." : "";
    return `<div class="tag">Seu histórico</div><h1>Seu histórico</h1><p class="sub">O que você fez nos últimos ${HIST_DIAS} dias, organizado por dia.${onde} Toque numa linha para abrir aquele item.</p>
      ${linhas.length ? `<div class="filters"><select data-hist-f aria-label="Filtrar por tipo"><option value="">Tudo (${linhas.length})</option>${tipos.map(([t, n]) => `<option value="${t}"${t === f ? " selected" : ""}>${esc(n)} (${linhas.filter((l) => l.tipo === t).length})</option>`).join("")}</select></div>
      <div class="list hist">${dias.filter(([d]) => d >= recente).map(grupo).join("") || `<p class="muted">Nada nos últimos 7 dias${f ? " com esse filtro" : ""}.</p>`}</div>
      ${antigos ? `<details class="hist-antes"><summary>Antes disso: ${antigos} ${antigos === 1 ? "ação" : "ações"} (até ${HIST_DIAS} dias)</summary><div class="list hist">${dias.filter(([d]) => d < recente).map(grupo).join("")}</div></details>` : ""}`
        : vazio("Nada por aqui ainda", eqp ? "Quando você aprovar, criar, conferir, publicar ou marcar algo, fica guardado aqui." : "Quando você salvar a ficha, marcar um passo, a disponibilidade ou assinar um contrato, fica guardado aqui.", `<button class="btn" data-ir="${eqp ? (comAreas() ? "hoje" : "inicio") : "passos"}">Voltar ao início</button>`, "feito")}`;
  }
  // Linhas do MESMO evento ficam juntas (Marina, 18/11/2026): um cabeçalho compacto da data ("Sex 19/11 · Sala Jabuticaba ·
  // Descubra · 3 artistas sem contrato"), que abre o quadro "Line-up e contratos" da data, e as linhas recuadas embaixo;
  // com mais de 3 linhas, o evento começa recolhido e expande.
  function blocoAcao(b, max = 6) {
    const linha = (x, noGrupo) => { const txt = `<span class="pl-quem">${esc(x.quem)}</span>${[!noGrupo && x.onde && esc(x.onde), !noGrupo && x.quando && dm(x.quando), x.extra].filter(Boolean).map((t) => `<span class="pl-sep"> · </span><span class="muted">${t}</span>`).join("")}`;
      return x.abrir ? `<li><button type="button" class="pend-linha" data-abrir="${esc(x.abrir)}">${txt}<span class="pl-ir" aria-hidden="true">→</span></button></li>` : `<li class="pend-txt">${txt}</li>`; };
    const eq = S.conta?.perfil, verLp = eq && (eq.tipo === "adm" || !eq.areas?.length || eq.areas.some((a) => a === "agenda" || a === "operacoes"));
    const [um, varios] = b.grupo || ["pendência", "pendências"];
    // Agrupa na ordem em que os itens já vêm (o evento mais próximo primeiro); item sem evento fica sozinho.
    const grupos = []; for (const x of b.itens) { const id = x.ev?.id, g = id && grupos.find((y) => y.ev?.id === id); if (g) g.itens.push(x); else grupos.push({ ev: id ? x.ev : null, itens: [x] }); }
    const grupoHtml = (g) => {
      if (!g.ev) return linha(g.itens[0]);
      const e = g.ev, n = g.itens.length, sem = NOME_SEM[wdDe(e.d)].slice(0, 3);
      const cab = `${sem[0].toUpperCase()}${sem.slice(1)} ${dm(e.d)} · ${esc(e.h || e.c || "casa a definir")}${e.m && !/^sem /i.test(e.m) ? ` · ${esc(e.m)}` : ""} · ${n} ${n === 1 ? um : varios}`;
      const alvo = e.portal && verLp ? "lp:" + e.portal.id : "ev:" + e.id;
      const subs = `<ul class="pend pend-sub">${g.itens.map((x) => linha(x, true)).join("")}</ul>`;
      return `<li class="pend-grupo"><button type="button" class="pend-ev" data-abrir="${esc(alvo)}" title="Abrir o line-up e os contratos da data">${cab}<span class="pl-ir" aria-hidden="true">→</span></button>
        ${n > 3 ? `<details class="pend-exp"><summary>Ver as ${n} linhas deste evento</summary>${subs}</details>` : subs}</li>`;
    };
    // Mostra eventos inteiros até passar de "max" linhas; o resto vai para "e mais".
    let cont = 0, corte = grupos.length; for (let i = 0; i < grupos.length; i++) { if (i > 0 && cont + Math.min(grupos[i].itens.length, 4) > max) { corte = i; break; } cont += Math.min(grupos[i].itens.length, 4); }
    const restoN = grupos.slice(corte).reduce((t, g) => t + g.itens.length, 0);
    const resto = restoN ? `<details class="pend-mais"><summary>e mais ${restoN}</summary><ul class="pend">${grupos.slice(corte).map(grupoHtml).join("")}</ul></details>` : "";
    return `<div class="card bloco-acao"><div class="row"><div><h3 class="acao">${esc(b.acao)} <span class="n">(${b.n ?? b.itens.length})</span></h3><div class="muted" style="font-size:13px">${b.dica}</div></div>${b.aba ? `<button class="btn sm${b.info ? "" : " pri"}" data-ir="${b.aba}" title="Abrir a lista toda">Abrir</button>` : ""}</div>
      ${b.itens.length ? `<ul class="pend">${grupos.slice(0, corte).map(grupoHtml).join("")}</ul>${resto}` : ""}</div>`;
  }
  // Regra do formato numa linha (embaixo do seletor), com "a validar" quando o Método ainda não descreve tudo.
  function regraFormato(produto, id) {
    const F = R.formatoDe(produto) || R.FORMATOS.Descubra;
    return `<p class="muted regra-formato" id="${id}" style="font-size:13px;margin:0 0 10px"><b>${esc(F.nome)}:</b> ${esc(F.regra)}${F.validar ? ` <span class="badge b-warn" title="Ainda não está claro no Método">a validar: ${esc(F.validar)}</span>` : ""}</p>`;
  }
  const padraoLineup = (produto) => { const F = R.formatoDe(produto) || R.FORMATOS.Descubra;
    return F.abertura ? `o ${F.nome} tem ${F.artistas === 1 ? "1 artista principal" : F.artistas + " artistas principais"} e abertura opcional` : `o ${F.nome} tem ${F.artistas} artistas por padrão`; };
  function livresNoDia(E, casas, ignorarId) {
    const k = (x) => String(x || "").trim().toLowerCase();
    const casaRef = (c) => [k(c.nome), ...(E.casas || []).filter((x) => x.id === c.id).map((x) => k(x.perfil?.vinculo_nome))].filter(Boolean);
    const artistas = (E.perfis || []).filter((p) => p.tipo === "artista").map((p) => { const i = (E.insc || []).find((x) => x.user_id === p.id), d = i?.dados || {};
      return { id: p.id, nome: p.vinculo_nome || d.nome_artistico || p.nome || p.email, status: i?.status, interesse: d.formato_interesse || "", cidades: (d.cidades_interesse || []).map(k), querTocar: d.cidades_interesse || [],
        mora: [d.cidade_base, d.estado].filter(Boolean).join("/"), sem: semanaDe(E.sem, { userId: p.id }) }; });
    const semCasa = (c) => { const x = (E.casas || []).find((y) => y.id === c.id); return semanaDe(E.sem, { casaRef: x?.perfil?.vinculo_nome || c.nome, fichaDias: x?.dados?.dias_semana }); };
    const evs = [...(S.pac?.eventos || []).filter((e) => !e.z).map((e) => ({ d: e.d, casa: k(e.h), arts: (e.a || []).map(k) })),
      ...(E.datasP || []).filter((x) => x.status !== "cancelada" && x.id !== ignorarId).map((x) => ({ d: String(x.dia).slice(0, 10), casa: k(x.casa_nome), casaId: x.casa_id, arts: (x.artistas || []).map((a) => k(a.nome)), ids: (x.artistas || []).map((a) => a.user_id) }))];
    return (dia, cid = "", soDaCidade = false) => {
      const doDia = evs.filter((e) => e.d === dia), cidadeK = k(String(cid).split("/")[0]);
      // motivo: null = livre; senão o porquê de não estar livre (vai para o grupo recolhido "Não marcaram este dia").
      const motivoC = (c) => doDia.some((e) => e.casaId === c.id || casaRef(c).includes(e.casa)) ? "já tem show neste dia"
        : !livreNo(situacaoDia((E.disp || []).find((x) => x.dia === dia && casaRef(c).includes(k(x.casa_ref))), semCasa(c), dia)) ? "não marcou este dia como livre" : null;
      const motivoA = (a) => doDia.some((e) => e.arts.includes(k(a.nome)) || (e.ids || []).includes(a.id)) ? "já tem data neste dia"
        : !livreNo(situacaoDia((E.dispA || []).find((x) => x.user_id === a.id && x.dia === dia), cid ? semanaDe(E.sem, { userId: a.id, cidade: cid }) : a.sem, dia)) ? `não marcou este dia como livre${cidadeK ? " para " + String(cid).split("/")[0].trim() : ""}`
        : soDaCidade && cidadeK && !a.quer && !k(a.mora).includes(cidadeK) ? `livre, mas não mora nem topa tocar em ${String(cid).split("/")[0].trim()}` : null;
      const ordem = (x, y) => (y.quer - x.quer) || (y.status === "aprovada") - (x.status === "aprovada");
      const todasC = casas.filter((c) => !cid || c.cidade === cid).map((c) => ({ ...c, motivo: motivoC(c) }));
      const todosA = artistas.map((a) => ({ ...a, quer: !!cidadeK && a.cidades.some((c) => c.includes(cidadeK)) })).map((a) => ({ ...a, motivo: motivoA(a) }));
      const cs = todasC.filter((c) => !c.motivo), as = todosA.filter((a) => !a.motivo).sort(ordem);
      return { cs, as, artistas, todasC, todosA, foraA: todosA.filter((a) => a.motivo).sort((x, y) => x.nome.localeCompare(y.nome, "pt-BR")) };
    };
  }
  // ---------- Busca rápida por modelo (pedido da Marina, 18/11/2026) ----------
  // Escolhido o formato, a busca devolve cartões "casa + dia com match": casa livre e com Ficha habilitada no dia, com
  // artistas livres para a cidade dela que topam o formato (formato_interesse da inscrição) em número suficiente. O
  // line-up já vem escolhido na quantidade do formato, com troca, e "Criar este evento" cria a data de uma vez.
  // Turnê: escolhido o artista, a sequência de casas e dias livres em cidades diferentes, uma data por cidade.
  const casasDp = (E) => (E.casas || []).filter((c) => c.status !== "encerrada").map((c) => ({ id: c.id, nome: c.dados?.nome || c.perfil?.vinculo_nome || c.perfil?.nome || "Casa sem nome", cidade: c.dados?.cidade_uf || c.dados?.cidade || "", status: c.status }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  // Filtros da Criar datas (Marina, 18/11/2026: "os filtros podem ser por cidade, artista, casa, modelo"). Valem para os
  // cartões da busca, a sugestão por histórico e as datas criadas. Casa e artista aceitam parte do nome (busca).
  const kfd = (x) => String(x || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  function filtroDp() {
    const b = S.dpb || {}, c = kfd(String(b.cid || "").split("/")[0]), ca = kfd(b.casa), a = kfd(b.art);
    return { ativo: !!(c || ca || a), cid: (x) => !c || kfd(String(x || "").split("/")[0]) === c, casa: (x) => !ca || kfd(x).includes(ca),
      art: (ns) => !a || (ns || []).some((n) => kfd(n).includes(a)), temArt: !!a };
  }
  // Uma linha só, guardando a Nova data apenas se ela está aberta (senão qualquer clique na busca a abria).
  const guardaDp = () => { if (!S.dpEd && $("#dpForm") && !$("#dpForm.dp-fechado")) S.dpPre = lerFormDp(); };
  function filtrosDp(E, casas) {
    const hoje = hojeIso(), b = S.dpb ||= { de: hoje, ate: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10), cid: "", ambos: true };
    const cidades = [...new Set(casas.map((c) => c.cidade).filter(Boolean))].sort((a, c) => a.localeCompare(c, "pt-BR"));
    const nomesA = [...new Set([...(E.perfis || []).filter((p) => p.tipo === "artista").map((p) => p.vinculo_nome || p.nome).filter(Boolean),
      ...(E.datasP || []).flatMap((x) => (x.artistas || []).map((a) => a.nome)).filter(Boolean)])].sort((a, c) => a.localeCompare(c, "pt-BR"));
    const F = filtroDp();
    return `<div class="card dp-filtros" id="dpFiltros" style="padding:12px 16px"><div class="row" style="margin-bottom:6px"><b>Filtros</b><span class="muted" style="font-size:13px">valem para a busca, a sugestão por histórico e as datas criadas</span></div>
      <div class="fgrid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))"><label class="fcampo"><b>De</b><input type="date" data-dpb="de" value="${esc(b.de)}"></label><label class="fcampo"><b>Até</b><input type="date" data-dpb="ate" value="${esc(b.ate)}"></label>
        <label class="fcampo"><b>Cidade</b><select data-dpb="cid"><option value="">Todas as cidades (${cidades.length})</option>${cidades.map((c) => { const n = casas.filter((x) => x.cidade === c).length; return `<option value="${esc(c)}"${c === b.cid ? " selected" : ""}>${esc(c)} (${n} ${n === 1 ? "casa" : "casas"})</option>`; }).join("")}</select></label>
        <label class="fcampo"><b>Casa</b><input type="search" data-dpb="casa" list="dpbCasas" value="${esc(b.casa || "")}" placeholder="Todas as casas (${casas.length})" autocomplete="off"><datalist id="dpbCasas">${casas.map((c) => `<option value="${esc(c.nome)}"${c.cidade ? ` label="${esc(c.cidade)}"` : ""}>`).join("")}</datalist></label>
        <label class="fcampo"><b>Artista</b><input type="search" data-dpb="art" list="dpbArts" value="${esc(b.art || "")}" placeholder="Todos os artistas (${nomesA.length})" autocomplete="off"><datalist id="dpbArts">${nomesA.map((n) => `<option value="${esc(n)}">`).join("")}</datalist></label></div>
      ${F.ativo ? `<button class="btn sm" data-dpb-limpar>Limpar cidade, casa e artista</button>` : ""}</div>`;
  }
  function diasDaBusca(b) { const dias = []; for (let d = new Date(b.de + "T12:00:00Z"); d.toISOString().slice(0, 10) <= b.ate && dias.length < 62; d = new Date(d.getTime() + 864e5)) dias.push(d.toISOString().slice(0, 10)); return dias; }
  /** Candidatos de um formato: livres para a cidade e que topam o formato (quem escolheu o formato primeiro). */
  const quemTopa = (as, produto, tirar) => as.map((a) => ({ ...a, topa: R.topaFormato(a.interesse, produto) })).filter((a) => a.topa > 0 && !(tirar || []).includes(a.id)).sort((x, y) => y.topa - x.topa);
  const rotTopa = (a, F) => a.topa === 2 ? `escolheu ${F.nome}` : !a.interesse || a.interesse === "nao_sei" ? "ainda não escolheu formato" : "topa o formato";
  function cartoesModelo(E, b) {
    const F = R.formatoDe(b.modo) || R.FORMATOS.Descubra, casas = casasDp(E), livres = livresNoDia(E, casas, null), FL = filtroDp();
    const cartoes = [];
    for (const dia of diasDaBusca(b)) for (const c of livres(dia, b.cid).cs) {
      if (c.status !== "habilitada" || !FL.casa(c.nome)) continue;
      let cands = quemTopa(livres(dia, c.cidade || "", true).as, F.nome);
      if (cands.length < F.artistas) continue;
      // Filtro por artista: só as casas e dias em que ele está livre, e ele já entra no line-up sugerido.
      if (FL.temArt) { const sim = cands.filter((a) => FL.art([a.nome])); if (!sim.length) continue; cands = [...sim, ...cands.filter((a) => !sim.includes(a))]; }
      const key = `${F.nome}|${c.id}|${dia}`, padrao = cands.slice(0, F.artistas + (F.abertura ? 1 : 0)).map((a) => a.nome);
      // Escolha da equipe (troca) vale enquanto os escolhidos seguirem livres; senão volta ao sugerido.
      const salvo = (S.dpbSel || {})[key], ok = salvo && salvo.every((n) => !n || cands.some((a) => a.nome === n));
      const sel = ok ? salvo : F.abertura ? [padrao[0], padrao[1] || ""] : padrao;
      cartoes.push({ key, dia, casa: c, F, cands, sel });
    }
    return cartoes;
  }
  // Line-up na ordem da noite: no Apresenta (e na Turnê) a abertura vem primeiro e a atração por último.
  const lineupDoCartao = (k) => (k.F.abertura ? [k.sel[1], k.sel[0]] : k.sel).filter(Boolean).map((nome) => ({ nome }));
  // WhatsApp e conta de cada artista vão junto (mesma regra da Nova data).
  function artistasParaSalvar(E, lista) {
    const contas = (E.perfis || []).filter((p) => p.tipo === "artista"), k = (x) => String(x || "").trim().toLowerCase();
    return lista.map((a, i) => { const c = contas.find((p) => k(p.vinculo_nome || p.nome || p.email) === k(a.nome));
      const w = c && ((E.insc || []).find((x) => x.user_id === c.id)?.dados?.whatsapp || c.whatsapp);
      return { ...a, ordem: i + 1, ...(c ? { user_id: c.id } : {}), ...(w ? { whatsapp: VAL.tel(w) ? VAL.fTel(w) : w } : {}) }; });
  }
  async function criarDatasRapidas(btn, datas, okMsg) {
    const E = S.eq, abre = ($("#dpbAbre")?.value || "19:00").trim() || "19:00";
    guardaDp();
    await acao(btn, async () => {
      for (const d of datas) {
        const casa = (E.casas || []).find((c) => c.id === d.casa.id), NL = R.normalizarLineup(d.lineup);
        if (NL.erro) throw new Error(`Não criou: ${NL.erro}.`);
        const r = await api.salvarDataPortal({ dia: d.dia, abertura: abre, produto: d.produto, casa_id: d.casa.id, casa_nome: casa?.dados?.nome || d.casa.nome, cidade: casa?.dados?.cidade_uf || d.casa.cidade || null,
          artistas: artistasParaSalvar(E, NL.lista), link_ingressos: null, observacao: d.observacao || null });
        if (datas.length === 1 && r?.id) S.lpAberto = r.id;
      }
      TQDiario.registrar("data_portal", { rapida: true, datas: datas.length, formato: datas[0]?.produto });
      S.dpbConf = null; S.dpbTur = datas[0]?.produto === "Turnê" ? {} : S.dpbTur; S.eq = null; await carregarEquipe(); render();
    }, { st: "#dpbMsg", espera: "Criando…", ok: okMsg });
  }
  function htmlCartoes(E, b) {
    const F = R.formatoDe(b.modo) || R.FORMATOS.Descubra, todos = cartoesModelo(E, b), lim = b.lim || 12, cs = todos.slice(0, lim);
    const vaga = (k, i) => { const outros = k.sel.filter((n, j) => j !== i && n), atual = k.sel[i] || "";
      const rot = F.abertura ? (i === 0 ? "Atração" : "Abertura (opcional)") : `${i + 1}º artista`;
      return `<label class="fcampo dpb-vaga"><b>${rot}</b><select data-dpb-troca="${esc(k.key)}|${i}">${F.abertura && i === 1 ? `<option value="">Sem abertura</option>` : ""}${k.cands.filter((a) => !outros.includes(a.nome)).map((a) => `<option value="${esc(a.nome)}"${a.nome === atual ? " selected" : ""}>${esc([a.nome, a.mora && "mora em " + a.mora, rotTopa(a, F)].filter(Boolean).join(" · "))}</option>`).join("")}</select></label>`; };
    const conf = (k) => S.dpbConf !== k.key ? "" : `<div class="alert warn dpb-conf" style="margin:10px 0 0"><b>Criar ${esc(F.nome)} em ${esc(NOME_SEM[wdDe(k.dia)])}, ${dt(k.dia)}, na ${esc(k.casa.nome)}?</b>Line-up, na ordem da noite: ${esc(lineupDoCartao(k).map((a) => a.nome).join(", "))}. A data aparece na hora para a casa e para os artistas.
      <div class="fgrid" style="margin-top:8px"><label class="fcampo"><b>Abertura da casa</b><input type="time" id="dpbAbre" value="19:00"></label></div>
      <div class="barra-acoes"><button class="btn pri" data-dpb-ok="${esc(k.key)}">Sim, criar a data</button><button class="btn" data-dpb-nao>Voltar</button></div></div>`;
    // Fechadinho (Marina, 18/11/2026): cada casa + dia é uma linha só, com "Criar este evento" já usando o line-up sugerido;
    // expandir mostra quem está no line-up e os seletores para trocar.
    const card = (k) => { const nomes = lineupDoCartao(k).map((a) => a.nome);
      const btn = S.dpbConf === k.key ? "" : `<button class="btn pri sm dpb-criar" data-dpb-criar="${esc(k.key)}" title="Cria com o line-up sugerido: ${esc(nomes.join(", "))}">Criar este evento</button>`;
      return `<div class="dpb-card" data-dpb-card="${esc(k.key)}">${dobra("dpb:" + k.key, `${esc(NOME_SEM[wdDe(k.dia)].slice(0, 3))} ${dt(k.dia)} · ${esc(k.casa.nome)}`,
        `${esc(k.casa.cidade || "cidade não informada")} · ${k.cands.length} ${k.cands.length === 1 ? "artista livre" : "artistas livres"} · ${esc(F.nome)}`,
        `<p class="muted" style="font-size:13px;margin:0 0 6px">Line-up sugerido, na ordem da noite: <b>${esc(nomes.join(", "))}</b>. Troque quem quiser:</p><div class="fgrid">${k.sel.map((_, i) => vaga(k, i)).join("")}</div>`,
        { classe: "dpb-dobra", extra: btn })}${conf(k)}</div>`; };
    return `<div class="list dpb-cartoes">${cs.map(card).join("")}</div>
      ${todos.length > lim ? `<button class="btn sm" style="margin-top:8px" data-dpb-mais>Ver mais ${Math.min(12, todos.length - lim)} (de ${todos.length - lim})</button>` : ""}
      ${todos.length ? "" : `<p class="muted" id="dpbVazio">Nenhuma casa livre com ${F.artistas} ${F.artistas === 1 ? "artista livre que topa" : "artistas livres que topam"} o ${esc(F.nome)} nesse período${b.cid ? " em " + esc(b.cid) : ""}. Em "Todos os dias" aparecem os dias com menos artistas.</p>`}`;
  }
  // Turnê: o artista e a sequência de casas e dias livres, uma cidade por data, sem dois shows no mesmo dia.
  function planoTurne(E, b) {
    const F = R.FORMATOS["Turnê"], casas = casasDp(E), livres = livresNoDia(E, casas, null), T = S.dpbTur ||= {};
    const FL = filtroDp(), arts = quemTopa(livres(hojeIso()).artistas, F.nome).filter((a) => FL.art([a.nome])).sort((x, y) => (y.topa - x.topa) || x.nome.localeCompare(y.nome, "pt-BR"));
    const art = arts.find((a) => a.id === T.art) || (FL.temArt && arts.length === 1 ? arts[0] : null);
    if (!art) return { F, arts, art: null, cidades: [] };
    const k = (x) => String(x || "").split("/")[0].trim().toLowerCase(), porCid = new Map();
    for (const dia of diasDaBusca(b)) for (const c of livres(dia, b.cid).cs) {
      if (c.status !== "habilitada" || !FL.casa(c.nome)) continue;
      const L = livres(dia, c.cidade || "", true).as; if (!L.some((a) => a.id === art.id)) continue;
      const ck = k(c.cidade) || "?"; if (!porCid.has(ck)) porCid.set(ck, { ck, nome: String(c.cidade || "cidade não informada"), opcoes: [] });
      porCid.get(ck).opcoes.push({ v: `${dia}|${c.id}`, dia, casa: c, ab: quemTopa(L, "Apresenta", [art.id]) });
    }
    const cidades = [...porCid.values()].sort((x, y) => x.opcoes[0].dia.localeCompare(y.opcoes[0].dia));
    // Sugestão: em cada cidade, o primeiro dia livre que ainda não foi usado por outra cidade.
    const usados = new Set(), sel = T.sel ||= {};
    for (const c of cidades) {
      if (sel[c.ck] !== undefined && (sel[c.ck] === "" || c.opcoes.some((o) => o.v === sel[c.ck]))) { if (sel[c.ck]) usados.add(sel[c.ck].split("|")[0]); continue; }
      const o = c.opcoes.find((x) => !usados.has(x.dia)); sel[c.ck] = o ? o.v : ""; if (o) usados.add(o.dia);
    }
    cidades.forEach((c) => { c.escolha = c.opcoes.find((o) => o.v === sel[c.ck]) || null;
      const ab = (T.ab ||= {})[c.ck]; c.abertura = c.escolha ? (ab === "" ? "" : c.escolha.ab.some((a) => a.nome === ab) ? ab : c.escolha.ab[0]?.nome || "") : ""; });
    return { F, arts, art, cidades };
  }
  function htmlTurne(E, b) {
    const P = planoTurne(E, b), F = P.F, T = S.dpbTur;
    const selArt = `<label class="fcampo"><b>Artista da turnê</b><select data-dpb-tur-art><option value="">Escolha o artista</option>${P.arts.map((a) => `<option value="${esc(a.id)}"${P.art?.id === a.id ? " selected" : ""}>${esc([a.nome, a.mora && "mora em " + a.mora, rotTopa(a, F)].filter(Boolean).join(" · "))}</option>`).join("")}</select></label>`;
    if (!P.art) return `<div class="fgrid">${selArt}</div><p class="muted" style="font-size:13px">${P.arts.length ? "Escolha o artista para ver as casas e os dias livres dele em cidades diferentes." : "Nenhum artista topa a Turnê ainda (\"Formato que mais te interessa\" na Ficha)."}</p>`;
    const escolhidas = P.cidades.filter((c) => c.escolha), dias = escolhidas.map((c) => c.escolha.dia), repetido = dias.find((d, i) => dias.indexOf(d) !== i);
    const linha = (c) => `<div class="card dpb-tur-cid" data-dpb-tur-cid="${esc(c.ck)}" style="margin:0"><b>${esc(c.nome)}</b>
      <div class="fgrid" style="margin-top:6px"><label class="fcampo"><b>Casa e dia</b><select data-dpb-tur="${esc(c.ck)}"><option value="">Não incluir esta cidade</option>${c.opcoes.map((o) => `<option value="${o.v}"${c.escolha?.v === o.v ? " selected" : ""}>${esc(`${NOME_SEM[wdDe(o.dia)]}, ${dt(o.dia)} · ${o.casa.nome}`)}</option>`).join("")}</select></label>
      ${c.escolha ? `<label class="fcampo"><b>Abertura local (opcional)</b><select data-dpb-tur-ab="${esc(c.ck)}"><option value="">Sem abertura</option>${c.escolha.ab.map((a) => `<option value="${esc(a.nome)}"${a.nome === c.abertura ? " selected" : ""}>${esc([a.nome, a.mora && "mora em " + a.mora].filter(Boolean).join(" · "))}</option>`).join("")}</select></label>` : ""}</div></div>`;
    return `<div class="fgrid">${selArt}</div>
      ${P.cidades.length ? `<p class="muted" style="font-size:13px;margin:0 0 8px">${esc(P.art.nome)} está livre em ${P.cidades.length} ${P.cidades.length === 1 ? "cidade" : "cidades"} com casa livre no período. Uma data por cidade; troque o dia ou tire a cidade.</p>
        <div class="list">${P.cidades.map(linha).join("")}</div>
        ${repetido ? `<div class="alert warn" style="margin:8px 0 0"><b>Dois shows no mesmo dia</b>${dt(repetido)} aparece em duas cidades. Troque o dia de uma delas.</div>` : ""}
        ${T.conf ? `<div class="alert warn" id="dpbTurConf" style="margin:10px 0 0"><b>Criar ${escolhidas.length} ${escolhidas.length === 1 ? "data" : "datas"} da turnê de ${esc(P.art.nome)}?</b>${escolhidas.map((c) => `${dt(c.escolha.dia)} · ${esc(c.escolha.casa.nome)} (${esc(c.nome.split("/")[0])})${c.abertura ? ", abertura " + esc(c.abertura) : ""}`).join("; ")}.
          <div class="fgrid" style="margin-top:8px"><label class="fcampo"><b>Abertura da casa</b><input type="time" id="dpbAbre" value="19:00"></label></div>
          <div class="barra-acoes"><button class="btn pri" data-dpb-tur-ok>Sim, criar as datas</button><button class="btn" data-dpb-nao>Voltar</button></div></div>`
        : `<div class="barra-acoes" style="margin-top:10px"><button class="btn pri" data-dpb-tur-criar${!escolhidas.length || repetido ? " disabled" : ""}>Criar ${escolhidas.length} ${escolhidas.length === 1 ? "data" : "datas"} da turnê</button></div>`}`
        : `<p class="muted" id="dpbVazio">${esc(P.art.nome)} não tem dia livre com casa livre (Ficha habilitada) nesse período${b.cid ? " em " + esc(b.cid) : ""}. Aumente o período ou peça para marcar a disponibilidade.</p>`}`;
  }
  // Dias com casa e artista livres no período (modo "Todos os dias" da busca).
  function linhasDoDia(E, casas, b) {
    const livres = livresNoDia(E, casas, S.dpEd), FL = filtroDp();
    return diasDaBusca(b).map((dia) => { const r0 = livres(dia, b.cid), r = { cs: r0.cs.filter((c) => FL.casa(c.nome)), as: r0.as.filter((a) => FL.art([a.nome])) };
      // Match por cidade: a casa só conta se há artista livre que mora ou quer tocar na cidade dela, e vice-versa.
      const cs = r.cs.filter((c) => livres(dia, c.cidade || "", true).as.some((a) => FL.art([a.nome])));
      const as = [...new Map(cs.flatMap((c) => livres(dia, c.cidade || "", true).as).filter((a) => FL.art([a.nome])).map((a) => [a.id || a.nome, a])).values()];
      return { dia, cs: b.ambos ? cs : r.cs, as: b.ambos ? as : r.as }; }).filter((l) => b.ambos ? l.cs.length && l.as.length : l.cs.length || l.as.length);
  }
  // Sugestão POR HISTÓRICO (pedido da Marina, 18/11/2026): ponte até as casas e artistas reais marcarem a disponibilidade
  // no portal. Vem das bases do Notion (bases.json, só dados públicos): os dias da semana em que cada casa mais recebeu o
  // Tranquilo e os artistas ligados àquela cidade (praça preferida, onde mora, onde já tocou), sem bloqueio de concorrência.
  // Nunca se mistura com a disponibilidade marcada no portal: é sempre "confirmar com a casa e o artista".
  // Fila de curadoria que está no Notion (pedido da Marina, 18/11/2026): enquanto as artistas não se inscrevem pelo portal,
  // a Isa vê aqui o que espera decisão na base Artistas e bandas, por status, começando pequeno. Abrir leva ao Notion.
  function filaNotionCuradoria() {
    if (S.basesPub === undefined) { S.basesPub = null; fetch("bases.json", { cache: "no-store" }).then((r) => r.ok ? r.json() : null).then((j) => { S.basesPub = j || false; render(); }, () => { S.basesPub = false; }); }
    const B = S.basesPub; if (!B?.fila?.length) return "";
    const grupos = (B.ordemFila || []).map((st) => [st, B.fila.filter((a) => a.status === st)]).filter(([, l]) => l.length);
    const linha = (a) => `<div class="row" style="padding:6px 0;border-top:1px solid var(--line)"><span><b>${esc(a.nome)}</b> <span class="muted" style="font-size:13px">${esc([a.mora, a.generos].filter(Boolean).join(" · "))}</span></span>
      <span style="display:flex;gap:6px;flex-wrap:wrap">${a.instagram ? `<a class="btn sm" href="${escHref(a.instagram)}" target="_blank" rel="noopener">Instagram</a>` : ""}${a.spotify ? `<a class="btn sm" href="${escHref(a.spotify)}" target="_blank" rel="noopener">Spotify</a>` : ""}<a class="btn sm" href="https://www.notion.so/${esc(String(a.id).replace(/-/g, ""))}" target="_blank" rel="noopener">Abrir no Notion</a></span></div>`;
    const MAX = 40;
    return `<div class="card" style="margin:0 0 16px;border-left:4px solid var(--accent, #7c8cff)"><b style="font-size:17px">No Notion: ${B.fila.length - (grupos.find(([s]) => /^Novo/.test(s))?.[1].length || 0)} esperando decisão da curadoria</b>
      <div class="muted" style="font-size:13px;margin:4px 0 8px">Da base Artistas e bandas (${esc(B.gerado || "")}). A decisão ainda é feita no Notion; quando a artista se inscrever pelo portal, ela entra na fila abaixo.</div>
      ${grupos.map(([st, l]) => `<details style="margin-top:6px" data-dobra="fila:${esc(st)}"${S.dobras?.["fila:" + st] ? " open" : ""}><summary style="cursor:pointer"><b>${esc(st)}</b> <span class="badge">${l.length}</span></summary>${l.slice(0, MAX).map(linha).join("")}${l.length > MAX ? `<p class="muted" style="font-size:13px">e mais ${l.length - MAX}: veja no Notion.</p>` : ""}</details>`).join("")}</div>`;
  }
  function sugestaoHistorico() {
    const B = basesPub(); if (!B) return "";
    const ppCasa = PP()?.podePropor(S.conta?.perfil, "casa"), ppArt = PP()?.podePropor(S.conta?.perfil, "artista");
    const k = (x) => String(x || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    const b = S.dpb || {}, de = b.de || hojeIso(), ate = b.ate || new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10), cidF = k(String(b.cid || "").split("/")[0]), FL = filtroDp();
    const ocupado = new Set((S.pac?.eventos || []).filter((e) => !e.z).map((e) => `${k(e.h)}|${e.d}`));
    const dias = []; for (let d = new Date(de + "T12:00:00Z"); d.toISOString().slice(0, 10) <= ate; d.setUTCDate(d.getUTCDate() + 1)) dias.push(d.toISOString().slice(0, 10));
    const NS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
    const cards = [];
    for (const c of B.casas.filter((c) => c.noites >= 2 && (!cidF || k(c.cidade) === cidF) && FL.casa(c.nome))) {
      const tops = c.dias.map((n, i) => [i, n]).filter(([, n]) => n >= 2 && n >= Math.max(...c.dias) / 2).map(([i]) => i);
      if (!tops.length) continue;
      const arts = B.artistas.filter((a) => [a.praca, a.mora, ...(a.cidades || [])].some((x) => k(x) === k(c.cidade)))
        .map((a) => ({ a, pts: (k(a.praca) === k(c.cidade) ? 3 : 0) + (k(a.mora) === k(c.cidade) ? 2 : 0) + ((a.cidades || []).some((x) => k(x) === k(c.cidade)) ? 2 : 0) + (a.ja_tocou ? 1 : 0) + Math.min(a.vezes || 0, 3) }))
        .sort((x, y) => y.pts - x.pts);
      for (const dia of dias.filter((d) => tops.includes(new Date(d + "T12:00:00Z").getUTCDay())).slice(0, 2)) {
        if (ocupado.has(`${k(c.nome)}|${dia}`)) continue;
        let livres = arts.filter(({ a }) => !a.bloqueio_ate || a.bloqueio_ate < dia);
        if (FL.temArt) { const sim = livres.filter(({ a }) => FL.art([a.nome])); if (!sim.length) continue; livres = [...sim, ...livres.filter((x) => !sim.includes(x))]; }
        livres = livres.slice(0, 4);
        if (livres.length) cards.push({ c, dia, livres });
      }
    }
    cards.sort((x, y) => x.dia.localeCompare(y.dia));
    const motivo = (a, c) => [k(a.praca) === k(c.cidade) && "prefere " + c.cidade, k(a.mora) === k(c.cidade) && "mora em " + c.cidade, (a.cidades || []).some((x) => k(x) === k(c.cidade)) && "já tocou em " + c.cidade, a.vezes ? `${a.vezes}x no Tranquilo` : ""].filter(Boolean).join(" · ");
    // Fechadinho (Marina, 18/11/2026): cada sugestão é uma linha (dia · casa · cidade · nº de artistas); abrir mostra os
    // artistas, o motivo de cada um e os botões "Propor atualização".
    const card = ({ c, dia, livres }) => dobra(`dph:${c.id}|${dia}`, `${esc(NS[new Date(dia + "T12:00:00Z").getUTCDay()])} ${dt(dia)} · ${esc(c.nome)}`,
      `${esc(c.cidade)}${c.uf ? "/" + esc(c.uf) : ""} · ${livres.length} ${livres.length === 1 ? "artista sugerido" : "artistas sugeridos"}`,
      `<div class="row"><div class="muted" style="font-size:13px">Costuma receber às ${c.dias.map((n, i) => [i, n]).filter(([, n]) => n >= 2).sort((x, y) => y[1] - x[1]).map(([i, n]) => `${NS[i]} (${n}x)`).join(", ")} · ${c.noites} noites no histórico${c.cap ? ` · ${c.cap} lugares` : ""}</div>${ppCasa ? `<button class="btn sm" data-pp-novo="casa|base:${esc(c.id)}" title="Mandar para a casa atualizar a ficha e os dias, pelo histórico">Propor atualização da casa</button>` : ""}</div>
      <ul style="margin:8px 0 0;padding-left:18px">${livres.map(({ a }) => `<li><b>${esc(a.nome)}</b> <span class="muted" style="font-size:13px">${esc(motivo(a, c))}${a.formatos?.length ? " · " + esc(a.formatos.join(", ")) : ""}${a.instagram ? ` · <a href="${escHref(a.instagram)}" target="_blank" rel="noopener">Instagram</a>` : ""}</span>${ppArt ? ` <button class="btn sm" data-pp-novo="artista|base:${esc(a.id)}" title="Mandar para a artista atualizar a ficha e os dias, pelo histórico">Propor atualização</button>` : ""}</li>`).join("")}</ul>`,
      { classe: "dph-sug", extra: `<span class="badge b-warn">confirmar</span>` });
    return `<details class="dobra dp-bloco dp-sug-hist" id="dpSugHist"${S.dpSugAberta ? " open" : ""}><summary><span class="dobra-tit">💡 Sugestão POR HISTÓRICO</span><span class="dobra-st">${cards.length} ${cards.length === 1 ? "sugestão" : "sugestões"} no período${FL.ativo || b.cid ? " (com os filtros)" : ""} · Confirme com a casa e com o artista antes de criar a data.</span></summary><div class="dobra-corpo">
      <p class="muted" style="font-size:13px;margin:0 0 8px">Não é disponibilidade marcada: são as casas nos dias em que mais receberam o Tranquilo e os artistas ligados àquela cidade, pelo Notion. Abra uma linha para ver os artistas.</p>
      ${cards.length ? `<div class="list">${cards.slice(0, 30).map(card).join("")}</div>${cards.length > 30 ? `<p class="muted">Mostrando 30 de ${cards.length}. Diminua o período ou use os filtros.</p>` : ""}` : `<p class="muted">Nenhuma sugestão no período${b.cid ? " em " + esc(b.cid) : ""}.</p>`}
      <p class="muted" style="font-size:12px;margin-bottom:0">Base do Notion de ${esc(B.gerado || "")} (${B.casas.length} casas · ${B.artistas.length} artistas). Artistas com bloqueio de concorrência no dia não aparecem.</p></div></details>`;
  }
  // ---------- propostas de atualização (pedido da Marina, 18/11/2026; banco v34) ----------
  // A Isa (artistas) e o Gui (casas) mandam para a pessoa o que falta na ficha, já preenchido pelo histórico das bases do
  // Notion; a pessoa vê o antes → depois em Próximos passos e aceita, ajusta ou recusa. Regras puras em src/propostas.js.
  const PP = () => window.TQPropostas;
  const kpp = (x) => PP().chave(x);
  function basesPub() {
    if (S.basesPub === undefined) { S.basesPub = null; fetch("bases.json", { cache: "no-store" }).then((r) => r.ok ? r.json() : null).then((j) => { S.basesPub = j || false; render(); }, () => { S.basesPub = false; }); }
    return S.basesPub || null;
  }
  const STATUS_PP = { pendente: ["b-warn", "aguardando resposta"], aceita: ["b-good", "aceita"], ajustada: ["b-good", "aceita com ajustes"], recusada: ["b-serious", "recusada"] };
  const badgePP = (s) => `<span class="badge ${(STATUS_PP[s] || [""])[0]}">${esc((STATUS_PP[s] || [, s])[1])}</span>`;
  // Conta do portal de uma artista ou casa: { user_id, nome, dados, whatsapp, email, ref (casa) }.
  function contaPP(tipo, { uid, nome }, E) {
    const n = kpp(nome);
    if (tipo === "casa") {
      const c = (E.casas || []).find((x) => (uid && x.user_id === uid) || (n && (kpp(x.dados?.nome) === n || kpp(x.perfil?.vinculo_nome) === n)));
      const p = c?.perfil || (E.perfis || []).find((x) => x.tipo === "casa" && !x.funcoes && ((uid && x.id === uid) || (n && kpp(x.vinculo_nome) === n)));
      if (!c && !p) return null;
      return { user_id: c?.user_id || p.id, nome: c?.dados?.nome || p?.vinculo_nome || p?.nome || nome, dados: c?.dados || {}, whatsapp: p?.whatsapp || "", email: p?.email || "", ref: p?.vinculo_nome || c?.dados?.nome || "" };
    }
    const i = (E.insc || []).find((x) => (uid && x.user_id === uid) || (n && (kpp(x.dados?.nome_artistico) === n || kpp(x.perfil?.vinculo_nome) === n)));
    const p = i?.perfil || (E.perfis || []).find((x) => x.tipo === "artista" && ((uid && x.id === uid) || (n && (kpp(x.vinculo_nome) === n || kpp(x.nome) === n))));
    if (!i && !p) return null;
    return { user_id: i?.user_id || p.id, nome: i?.dados?.nome_artistico || p?.vinculo_nome || p?.nome || nome, dados: i?.dados || {}, whatsapp: i?.dados?.whatsapp || p?.whatsapp || "", email: p?.email || "" };
  }
  const semanalPP = (tipo, conta, E) => (E.sem || []).filter((s) => tipo === "casa" ? s.casa_ref && conta.ref && kpp(s.casa_ref) === kpp(conta.ref) : s.user_id === conta.user_id);
  function nomeAlvoPP(p, E) { if (p.alvo_ref) return p.alvo_ref; const pf = (E.perfis || []).find((x) => x.id === p.alvo_user); return pf ? nomeDaConta(pf) : "conta"; }
  // Contas do portal com informação importante faltando (cidades, formato, disponibilidade, dados de contrato, equipe…).
  function alvosComFalta(tipo, E) {
    if (tipo === "casa") return (E.casas || []).filter((c) => c.status !== "encerrada" && !c.perfil?.funcoes).map((c) => {
      const conta = contaPP("casa", { uid: c.user_id }, E), semEquipe = Array.isArray(E.eqc) && !E.eqc.some((m) => kpp(m.casa_ref) === kpp(conta.ref));
      return { user_id: c.user_id, nome: conta.nome || "(casa sem nome)", onde: c.dados?.cidade_uf || "", falta: PP().faltando("casa", c.dados, semanalPP("casa", conta, E), { semEquipe }) }; }).filter((x) => x.falta.length);
    return (E.insc || []).filter((i) => i.status !== "encerrada").map((i) => {
      const conta = contaPP("artista", { uid: i.user_id }, E);
      return { user_id: i.user_id, nome: conta.nome || "(sem nome)", onde: [i.dados?.cidade_base, i.dados?.estado].filter(Boolean).join("/"), falta: PP().faltando("artista", i.dados, semanalPP("artista", conta, E)) }; }).filter((x) => x.falta.length);
  }
  // Quem já trabalhou com o Tranquilo (bases do Notion) e ainda não tem conta no portal.
  function historicoSemConta(tipo, E, B) {
    const L = tipo === "casa" ? B.casas.filter((c) => c.noites >= 1).sort((a, b) => b.noites - a.noites) : B.artistas.filter((a) => a.vezes >= 1 || a.ja_tocou).sort((a, b) => (b.vezes || 0) - (a.vezes || 0));
    return L.filter((x) => !contaPP(tipo, { nome: x.nome }, E));
  }
  // Bloco da equipe (Curadoria para artistas, Fichas das casas para casas): começa fechado e mostra os números.
  function blocoPropostas(tipo) {
    const E = S.eq; if (!E || !PP()?.podePropor(S.conta.perfil, tipo)) return "";
    const B = basesPub(), hoje = hojeIso(), aberto = !!S.ppAberto?.[tipo], mais = S.ppMais || {};
    const minhas = (E.prop || []).filter((p) => p.alvo_tipo === tipo), aguard = minhas.filter((p) => p.status === "pendente");
    const aceitasHoje = minhas.filter((p) => ["aceita", "ajustada"].includes(p.status) && String(p.respondido_em || "").slice(0, 10) === hoje);
    const pendUser = new Set(aguard.map((p) => p.alvo_user).filter(Boolean)), pendRef = new Set(aguard.map((p) => kpp(p.alvo_ref)).filter(Boolean));
    const falta = alvosComFalta(tipo, E), semConta = B ? historicoSemConta(tipo, E, B) : [];
    const quem = tipo === "casa" ? "a casa" : "a artista";
    const botao = (chave, enviada) => enviada ? `<span class="badge b-warn">proposta enviada</span>` : `<button class="btn sm" data-pp-novo="${esc(chave)}">Propor atualização</button>`;
    const linha = (titulo, sub, acao, attr = "") => `<li class="pp-linha"${attr}><div style="min-width:0"><b>${titulo}</b><div class="muted" style="font-size:13px">${sub}</div></div>${acao}</li>`;
    const lista = (id, L, f) => { const n = mais[id] ? L.length : Math.min(L.length, 5);
      return L.length ? `<ul class="pp-lista">${L.slice(0, n).map(f).join("")}</ul>${L.length > n ? `<button class="btn sm ghost" data-pp-mais="${id}">Mostrar mais ${L.length - n}</button>` : ""}` : ""; };
    const corpo = !aberto ? "" : `
      <h3 class="pp-h">Faltando informação importante <span class="muted">(${falta.length})</span></h3>
      ${falta.length ? lista(tipo + "f", falta, (x) => linha(esc(x.nome) + (x.onde ? ` <span class="muted" style="font-weight:400">· ${esc(x.onde)}</span>` : ""), "Falta: " + esc(x.falta.map((f) => f.rotulo.toLowerCase()).join(", ")), botao(`${tipo}|user:${x.user_id}`, pendUser.has(x.user_id)))) : `<p class="muted" style="font-size:13px">Ninguém com informação importante faltando 🌿</p>`}
      <h3 class="pp-h">Pelo histórico, ainda sem conta no portal <span class="muted">(${B ? semConta.length : "…"})</span></h3>
      <p class="muted" style="font-size:13px;margin:0 0 6px">Já trabalhou com o Tranquilo, mas ainda não entrou no portal. A proposta vai junto com o convite (mensagem de WhatsApp pronta).</p>
      ${B ? lista(tipo + "h", semConta, (x) => linha(esc(x.nome) + ` <span class="muted" style="font-weight:400">· ${esc(tipo === "casa" ? [x.cidade, x.uf].filter(Boolean).join("/") : x.mora || "")}</span>`,
        esc(tipo === "casa" ? `${x.noites} ${x.noites === 1 ? "noite" : "noites"} no histórico` : `${x.vezes || 0}x no Tranquilo${x.cidades?.length ? " · " + x.cidades.join(", ") : ""}`), botao(`${tipo}|base:${x.id}`, pendRef.has(kpp(x.nome))))) : `<p class="muted">Carregando o histórico…</p>`}
      <h3 class="pp-h">Propostas enviadas <span class="muted">(${minhas.length})</span></h3>
      ${minhas.length ? lista(tipo + "e", minhas, (p) => linha(esc(nomeAlvoPP(p, E)) + " " + badgePP(p.status),
        esc(`${PP().linhas(tipo, p, {}, []).map((l) => l.rotulo).join(", ")} · enviada ${dt(p.criado_em.slice(0, 10))}${p.respondido_em ? " · respondida " + dt(p.respondido_em.slice(0, 10)) : ""}${p.convite_email && !p.alvo_user ? " · convite ainda não aceito" : ""}`), "", ` data-pp-id="${esc(p.id)}"`)) : `<p class="muted" style="font-size:13px">Nenhuma proposta enviada ainda.</p>`}`;
    return `<section class="card pp-bloco" id="ppBloco-${tipo}" style="margin:0 0 14px">
      <button type="button" class="pp-topo" data-pp-bloco="${tipo}" aria-expanded="${aberto}"><span><b style="font-size:16px">📝 Propostas de atualização ${tipo === "casa" ? "das casas" : "dos artistas"}</b>
      <span class="pp-chips"><span class="badge b-warn">${aguard.length} aguardando resposta</span><span class="badge b-good">${aceitasHoje.length} ${aceitasHoje.length === 1 ? "aceita" : "aceitas"} hoje</span><span class="badge">${falta.length} com informação faltando</span></span>
      <span class="muted" style="display:block;font-size:13px;margin-top:4px;font-weight:400">Mande para ${quem} o que falta na ficha, já preenchido pelo histórico. ${quem[0].toUpperCase() + quem.slice(1)} vê o antes → depois e aceita, ajusta ou recusa; aceitando, a ficha muda na hora.</span></span>
      <span class="pp-seta" aria-hidden="true">${aberto ? "▲" : "▼"}</span></button>${corpo}</section>`;
  }
  // ---------- pré-fichas pelo Notion (pedido da Marina, 18/11/2026: "preciso de tudo em produção") ----------
  // Cada casa e artista real (bases do Notion e agenda do pacote da equipe), mesmo sem conta no portal: os campos da Ficha
  // que já sabemos aparecem "do Notion"; os que faltam, "falta", com "Solicitar à casa/artista" (convite + proposta com o
  // que já temos; ao criar a conta, a Ficha nasce preenchida). Regras puras em src/prefichas.js.
  const PF = () => window.TQPreFicha;
  const semTraco = (id) => String(id || "").replace(/-/g, "");
  function preFichas() {
    const P = S.pac, B = basesPub(), hoje = hojeIso(), C = S.pfCache;
    if (C && C.P === P && C.B === B && C.hoje === hoje) return C;
    const evs = P?.eventos || [];
    const casas = PF().casas({ notion: P?.notion?.casas, bases: B?.casas, eventos: evs, enderecos: P?.enderecos, fichas: P?.fichas, hoje });
    const artistas = PF().artistas({ notion: P?.notion?.artistas, bases: B?.artistas, fila: B?.fila, eventos: evs, hoje });
    return (S.pfCache = { P, B, hoje, casas, artistas, casa: new Map(casas.map((c) => [c.id, c])), art: new Map(artistas.map((a) => [PF().chave(a.nome), a])) });
  }
  const refPF = (pf) => pf.id || "n:" + PF().chave(pf.nome);
  function pfDe(tipo, ref) {
    const D = preFichas(); ref = String(ref || "");
    if (tipo === "casa") return D.casa.get(semTraco(ref)) || D.casas.find((c) => PF().chave(c.nome) === PF().chave(ref.replace(/^n:/, ""))) || null;
    return ref.startsWith("n:") ? D.art.get(ref.slice(2)) || null : D.artistas.find((a) => a.id === semTraco(ref)) || D.art.get(PF().chave(ref)) || null;
  }
  const casaDoNotion = (e) => e?.k ? pfDe("casa", e.k) : null;
  // Situação no portal: conta (e Ficha), convite e proposta pendente.
  function situacaoPF(tipo, pf, E) {
    let conta = null, ficha = null;
    if (tipo === "casa") {
      ficha = (E.casas || []).find((c) => (c.notion_casa_id && semTraco(c.notion_casa_id) === pf.id) || kpp(c.dados?.nome) === kpp(pf.nome) || kpp(c.perfil?.vinculo_nome) === kpp(pf.nome)) || null;
      conta = ficha ? { user_id: ficha.user_id } : contaPP("casa", { nome: pf.nome }, E);
    } else { conta = contaPP("artista", { nome: pf.nome }, E); ficha = conta ? (E.insc || []).find((i) => i.user_id === conta.user_id) || null : null; }
    const conv = (E.conv || []).find((c) => c.tipo === tipo && kpp(c.vinculo_nome || c.nome) === kpp(pf.nome)) || null;
    const prop = (E.prop || []).find((p) => p.alvo_tipo === tipo && p.status === "pendente" && ((conta && p.alvo_user === conta.user_id) || (p.alvo_ref && kpp(p.alvo_ref) === kpp(pf.nome)))) || null;
    const txt = ficha ? (tipo === "casa" ? "Ficha no portal" : "inscrição no portal") : conta ? "tem conta no portal" : conv ? (conv.aceito_em ? "convite aceito" : `convite enviado${conv.criado_em ? " " + dm(conv.criado_em.slice(0, 10)) : ""}, ainda não entrou`) : "sem conta no portal";
    return { conta, ficha, conv, prop, txt };
  }
  const SECOES_PF = (tipo) => tipo === "casa" ? F_CASA.map(([t, , cs, sens]) => [t, cs, !!sens]) : F_ARTISTA.map(([t, cs]) => [t, cs.filter((c) => c[2] !== "check"), false]);
  function contagemPF(tipo, pf) {
    let tem = 0, total = 0;
    for (const [, cs, sens] of SECOES_PF(tipo)) { total += cs.length; if (!sens) tem += PF().marcar(pf, cs).filter((x) => x.fonte === "notion").length; }
    return { tem, total, falta: total - tem };
  }
  function valorPFHtml(c, v) {
    const [, , tipo, opts] = c;
    if (Array.isArray(v)) return esc(v.join(", "));
    if ((tipo === "select" || tipo === "multi") && opts) return esc((opts.find(([o]) => o === v) || [, v])[1]);
    if (/^https?:\/\//.test(String(v))) return `<a href="${escHref(v)}" target="_blank" rel="noopener">${esc(String(v).replace(/^https?:\/\/(www\.)?/, "").slice(0, 60))}</a>`;
    return esc(String(v).length > 160 ? String(v).slice(0, 160) + "…" : v);
  }
  const linhaEvPF = (e, futuro) => `<li><b>${NOME_SEM[wdDe(e.d)].slice(0, 3)}, ${dt(e.d)}</b> · ${esc(e.c || "")}${futuro ? "" : e.h ? " · " + esc(e.h) : ""}${(e.a || []).length ? " · " + esc(e.a.join(", ")) : ""}${e.s ? ` <span class="muted">· ${esc(e.s)}</span>` : ""}${e.p != null ? ` <span class="muted">· ${fmt(e.p)} pessoas</span>` : ""}${futuro && e.l ? ` · <a href="${escHref(e.l)}" target="_blank" rel="noopener">ingressos</a>` : ""}</li>`;
  // A pré-ficha: situação, o que já sabemos e o que falta (por parte da Ficha), o histórico e o botão de solicitar.
  function htmlPreFicha(tipo, pf) {
    const E = S.eq || {}, sit = situacaoPF(tipo, pf, E), n = contagemPF(tipo, pf), quem = tipo === "casa" ? "à casa" : "à artista";
    const pode = PP()?.podePropor(S.conta?.perfil, tipo);
    const secoes = SECOES_PF(tipo).map(([t, cs, sens]) => {
      if (sens) return `<details class="pf-sec"><summary><b>${esc(t)}</b> <span class="muted">· ${cs.length} faltam (a ${tipo === "casa" ? "casa" : "artista"} preenche)</span></summary><p class="muted" style="font-size:13px;margin:4px 0">Dados pessoais e bancários não vêm do Notion: ${tipo === "casa" ? "a casa preenche" : "a artista preenche"} ao criar a conta.</p></details>`;
      const ms = PF().marcar(pf, cs), tem = ms.filter((x) => x.fonte === "notion").length;
      return `<details class="pf-sec"><summary><b>${esc(t)}</b> <span class="muted">· ${tem} do Notion · ${ms.length - tem} ${ms.length - tem === 1 ? "falta" : "faltam"}</span></summary><ul class="pf-campos">${ms.map((x) => { const c = cs.find((y) => y[0] === x.chave);
        return `<li data-pf-campo="${esc(x.chave)}"><span>${esc(x.rotulo.length > 70 ? x.rotulo.slice(0, 70) + "…" : x.rotulo)}</span><span class="pf-v">${x.fonte === "notion" ? valorPFHtml(c, x.valor) : '<span class="muted">–</span>'}</span>${x.fonte === "notion" ? '<span class="badge b-good">do Notion</span>' : '<span class="badge b-warn">falta</span>'}</li>`; }).join("")}</ul></details>`;
    }).join("");
    const NS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
    const dias = tipo === "casa" && pf.diasFortes?.length ? `<p style="margin:6px 0;font-size:14px"><b>Dias em que costuma receber:</b> ${pf.diasFortes.map((i) => `${NS[i]} (${pf.dias[i]}x)`).join(", ")}</p>` : "";
    const tocou = tipo === "artista" && (pf.cidadesTocou?.length || pf.status) ? `<p style="margin:6px 0;font-size:14px">${pf.cidadesTocou?.length ? `<b>Já tocou em:</b> ${esc(pf.cidadesTocou.join(", "))}. ` : ""}${pf.status ? `<b>Status no Notion:</b> ${esc(pf.status)}` : ""}</p>` : "";
    const hist = `<details class="pf-sec" data-pf-hist><summary><b>Noites no histórico</b> <span class="muted">· ${pf.realizadas.length}${pf.realizadas[0] ? ", a última em " + dt(pf.realizadas[0].d) : ""}</span></summary>${pf.realizadas.length ? `<ul class="pf-ev">${pf.realizadas.slice(0, 40).map((e) => linhaEvPF(e, false)).join("")}</ul>${pf.realizadas.length > 40 ? `<p class="muted" style="font-size:13px">e mais ${pf.realizadas.length - 40} no Notion.</p>` : ""}` : `<p class="muted" style="font-size:13px">Nenhuma noite registrada no Notion.</p>`}</details>
      <details class="pf-sec"${pf.proximas.length ? "" : ""}><summary><b>Próximas datas no Notion</b> <span class="muted">· ${pf.proximas.length}</span></summary>${pf.proximas.length ? `<ul class="pf-ev">${pf.proximas.map((e) => linhaEvPF(e, true)).join("")}</ul>` : `<p class="muted" style="font-size:13px">Nenhuma data marcada.</p>`}</details>`;
    const acoes = [
      sit.ficha ? `<button class="btn sm" data-abrir="${tipo === "casa" ? "casa:" : "insc:"}${esc(sit.ficha.id)}">${tipo === "casa" ? "Abrir a Ficha no portal" : "Abrir a inscrição"}</button>` : "",
      sit.prop ? `<span class="badge b-warn">pedido enviado ${dm(sit.prop.criado_em.slice(0, 10))}, aguardando resposta</span>` : !pode ? `<span class="muted" style="font-size:13px">Quem solicita é a área de ${tipo === "casa" ? "Operações" : "Agenda"}.</span>`
        : sit.conta ? `<button class="btn sm pri" data-pp-novo="${tipo}|user:${esc(sit.conta.user_id)}">Pedir o que falta ${quem}</button>`
        : `<button class="btn sm pri" data-pp-novo="${tipo}|pf:${esc(refPF(pf))}" title="Gera o convite e a proposta com o que já sabemos; a mensagem de WhatsApp sai pronta.">Solicitar ${quem}</button>`,
      pf.id ? `<a class="btn sm ghost" href="https://www.notion.so/${esc(pf.id)}" target="_blank" rel="noopener">Abrir no Notion</a>` : "",
    ].filter(Boolean).join("");
    return `<div class="pf-ficha" data-pf-ficha="${esc(tipo + "|" + refPF(pf))}">
      <p style="margin:0 0 6px;font-size:14px"><span class="badge ${sit.ficha ? "b-good" : sit.conv ? "b-warn" : ""}">${esc(sit.txt)}</span> <b>${n.tem} de ${n.total}</b> campos da ${tipo === "casa" ? "Ficha" : "inscrição"} já preenchidos pelo Notion · <b>${n.falta}</b> ${n.falta === 1 ? "falta" : "faltam"}.</p>
      <p class="muted" style="font-size:13px;margin:0 0 6px">"do Notion" = já sabemos e vai preenchido; "falta" = ${tipo === "casa" ? "a casa" : "a artista"} completa. Toque em cada parte para ver os campos.</p>
      ${dias}${tocou}${secoes}${hist}
      <div class="barra-acoes" style="margin-top:10px">${acoes}</div></div>`;
  }
  function abrirPreFicha(tipo, ref) {
    const pf = pfDe(tipo, ref); if (!pf) return;
    $("#dlgIn").innerHTML = `<div class="tag">${tipo === "casa" ? "Ficha da casa" : "Inscrição da artista"} · pré-preenchida pelo Notion</div><h2 style="margin-top:4px">${esc(pf.nome)}</h2>
      <p class="muted" style="margin-top:0">${esc(tipo === "casa" ? pf.valores.cidade_uf || pf.cidade || "" : pf.valores.cidade_base || "")}</p>${htmlPreFicha(tipo, pf)}
      <div class="barra-acoes" style="margin-top:10px"><button class="btn ghost" onclick="dlg.close()">Fechar</button></div>`;
    $("#dlg").dataset.alvo = "pf:" + tipo; if (!$("#dlg").open) $("#dlg").showModal();
  }
  // Lista das telas Casas (Gui) e Curadoria (Isa): começa fechada; cada linha expande a pré-ficha.
  function blocoPreFichas(tipo) {
    const E = S.eq; if (!E || !PF()) return "";
    const D = preFichas(), hoje = hojeIso(), aberto = !!S.pfBloco?.[tipo];
    if (!D.B && !D.P) return `<section class="card" style="margin:0 0 14px"><p class="muted" style="margin:0">Carregando as ${tipo === "casa" ? "casas" : "artistas"} do Notion…</p></section>`;
    const FILA = /^(Avaliando|Para avaliar|Pré-aprovado|Falta link)/;
    const base = tipo === "casa" ? D.casas : D.artistas.filter((a) => a.proximas.length || a.realizadas.length || a.vezes || FILA.test(a.status));
    const L = base.map((pf) => ({ pf, sit: situacaoPF(tipo, pf, E) }))
      .sort((a, b) => (!!a.sit.ficha - !!b.sit.ficha) || ((a.pf.proximas[0]?.d || "9999").localeCompare(b.pf.proximas[0]?.d || "9999")) || (b.pf.realizadas.length - a.pf.realizadas.length) || a.pf.nome.localeCompare(b.pf.nome, "pt-BR"));
    const semConta = L.filter((x) => !x.sit.conta).length, comData = L.filter((x) => !x.sit.ficha && x.pf.proximas.some((e) => e.d >= hoje)).length;
    const LIM = 12, todas = !!S.pfTodas?.[tipo];
    const item = ({ pf, sit }, i) => { const ref = refPF(pf), ab = S.pfAberto === tipo + "|" + ref, n = contagemPF(tipo, pf), prox = pf.proximas[0];
      const onde = tipo === "casa" ? pf.valores.cidade_uf || pf.cidade : pf.valores.cidade_base || "";
      return `<li class="pf-item" data-pf-item data-busca="${esc(PF().chave([pf.nome, onde].join(" ")))}"${!todas && i >= LIM ? " hidden" : ""}><button type="button" class="pf-linha" data-pf-abrir="${esc(tipo + "|" + ref)}" aria-expanded="${ab}"><b>${esc(pf.nome)}</b>${onde ? `<span class="muted">${esc(onde)}</span>` : ""}
        <span class="badge ${sit.ficha ? "b-good" : sit.conv ? "b-warn" : ""}">${esc(sit.txt)}</span>${prox ? `<span class="badge b-warn">próxima data ${dm(prox.d)}</span>` : ""}<span class="muted" style="font-size:13px">${pf.realizadas.length} ${pf.realizadas.length === 1 ? "noite" : "noites"} · ${n.tem} de ${n.total} campos do Notion</span></button>
        ${ab ? `<div class="pf-corpo">${htmlPreFicha(tipo, pf)}</div>` : ""}</li>`; };
    const corpo = !aberto ? "" : `<div class="filters" style="margin:10px 0 0"><input data-pf-busca="${tipo}" placeholder="Buscar ${tipo === "casa" ? "casa ou cidade" : "artista ou cidade"}" aria-label="Buscar" value="${esc(S.pfBusca?.[tipo] || "")}"></div>
      <ul class="pf-lista" data-pf-lista="${tipo}">${L.map(item).join("")}</ul>
      ${L.length > LIM && !todas ? `<button class="btn sm ghost" data-pf-todas="${tipo}" style="margin-top:6px">Mostrar ${tipo === "casa" ? "todas as" : "todos os"} ${L.length}</button>` : ""}`;
    return `<section class="card pp-bloco" id="pfBloco-${tipo}" style="margin:0 0 14px">
      <button type="button" class="pp-topo" data-pf-bloco="${tipo}" aria-expanded="${aberto}"><span><b style="font-size:16px">🗂️ ${tipo === "casa" ? "Casas reais do Notion: Ficha pré-preenchida" : "Artistas reais do Notion: inscrição pré-preenchida"}</b>
      <span class="pp-chips"><span class="badge b-warn">${semConta} sem conta no portal</span><span class="badge">${comData} com data marcada e sem ${tipo === "casa" ? "Ficha" : "inscrição"}</span><span class="badge">${L.length} no total</span></span>
      <span class="muted" style="display:block;font-size:13px;margin-top:4px;font-weight:400">${tipo === "casa" ? "Toda casa do Notion" : "Quem está nos line-ups, já tocou ou está na fila de curadoria do Notion"}, mesmo sem conta: o que já sabemos aparece "do Notion" e o que falta, "falta". "Solicitar" gera o convite e a proposta com o que já temos; ao criar a conta, ${tipo === "casa" ? "a Ficha" : "a inscrição"} já nasce preenchida.</span></span>
      <span class="pp-seta" aria-hidden="true">${aberto ? "▲" : "▼"}</span></button>${corpo}</section>`;
  }
  function filtrarPF(tipo) {
    const q = PF().chave(S.pfBusca?.[tipo] || ""), todas = !!S.pfTodas?.[tipo]; let i = 0;
    document.querySelectorAll(`[data-pf-lista="${tipo}"] [data-pf-item]`).forEach((li) => { const bate = !q || li.dataset.busca.includes(q); li.hidden = !bate || (!q && !todas && i >= 12); if (bate) i++; });
  }
  document.addEventListener("input", (ev) => { const t = ev.target; if (!t.matches?.("[data-pf-busca]")) return; (S.pfBusca ||= {})[t.dataset.pfBusca] = t.value; filtrarPF(t.dataset.pfBusca); });
  function cliquesPreFichas(t) {
    const bl = t.closest("[data-pf-bloco]"); if (bl) { const k = bl.dataset.pfBloco; (S.pfBloco ||= {})[k] = !S.pfBloco[k]; render(); return true; }
    const ab = t.closest("[data-pf-abrir]"); if (ab) { const k = ab.dataset.pfAbrir; S.pfAberto = S.pfAberto === k ? null : k; render(); if (S.pfBusca?.[k.split("|")[0]]) filtrarPF(k.split("|")[0]); $(`[data-pf-abrir="${CSS.escape(k)}"]`)?.focus({ preventScroll: true }); return true; }
    const td = t.closest("[data-pf-todas]"); if (td) { (S.pfTodas ||= {})[td.dataset.pfTodas] = true; render(); return true; }
    return false;
  }
  // Controle de um campo da proposta (equipe e ajuste da pessoa): texto, lista (vírgulas), opção ou número.
  function controlePP(tipo, k, v, attr) {
    const c = PP().campo(tipo, k) || [k, k, "texto"], [, rot, tp, opts] = c;
    if (tp === "opcao") return `<select ${attr}="${k}" aria-label="${esc(rot)}"><option value="">Escolha</option>${opts.map(([o, t]) => `<option value="${o}"${o === v ? " selected" : ""}>${esc(t)}</option>`).join("")}</select>`;
    return `<input ${attr}="${k}" aria-label="${esc(rot)}" value="${esc(Array.isArray(v) ? v.join(", ") : v ?? "")}"${tp === "numero" ? ' inputmode="numeric"' : ""}${tp === "lista" ? ' placeholder="separe por vírgula"' : ""}>`;
  }
  function valorPP(tipo, k, bruto) {
    const tp = PP().campo(tipo, k)?.[2], x = String(bruto ?? "").trim();
    if (tp === "lista") return x.split(",").map((s) => s.trim()).filter(Boolean);
    if (tp === "numero") return /^\d+$/.test(x) ? +x : x;
    return x;
  }
  function linhaDispPP(tipo, x, i, attr) {
    return `<div class="pp-disp" data-pp-disp="${i}">${tipo === "artista" ? `<label class="fcampo" style="margin:0"><b>Cidade</b><input data-${attr}-dcid="${i}" value="${esc(x.cidade || "")}" placeholder="ex.: Campinas"></label>` : ""}
      <div class="pp-dias" role="group" aria-label="Dias da semana${x.cidade ? " em " + esc(x.cidade) : ""}">${PP().DIAS.map((d, j) => `<label class="fcheck"><input type="checkbox" data-${attr}-dia="${i}|${j}"${(x.dias || []).includes(j) ? " checked" : ""}> <span>${d}</span></label>`).join("")}</div></div>`;
  }
  const lerDispPP = (attr, tipo) => [...document.querySelectorAll("[data-pp-disp]")].map((el) => { const i = el.dataset.ppDisp;
    return { cidade: tipo === "artista" ? (el.querySelector(`[data-${attr}-dcid="${i}"]`)?.value || "").trim() || null : null, dias: [...el.querySelectorAll(`[data-${attr}-dia]:checked`)].map((c) => +c.dataset[attr === "pp" ? "ppDia" : "aj" + "Dia"].split("|")[1]).sort((a, b) => a - b) }; });
  // "Propor atualização": abre o formulário já preenchido pelo histórico (editável).
  function abrirFormProposta(chave) {
    const E = S.eq, B = basesPub(); if (!E) return;
    const [tipo, ref] = chave.split("|"), i = ref.indexOf(":"), modo = ref.slice(0, i), id = ref.slice(i + 1);
    const base = B ? (tipo === "casa" ? B.casas : B.artistas) : [];
    let conta, item, pf = null;
    if (modo === "user") { conta = contaPP(tipo, { uid: id }, E); item = base.find((x) => kpp(x.nome) === kpp(conta?.nome)); }
    else if (modo === "pf") { pf = pfDe(tipo, id); item = pf && (base.find((x) => pf.id && semTraco(x.id) === pf.id) || base.find((x) => kpp(x.nome) === kpp(pf.nome))); conta = pf && contaPP(tipo, { nome: pf.nome }, E); }
    else { item = base.find((x) => x.id === id); conta = item && contaPP(tipo, { nome: item.nome }, E); }
    if (!conta && !item && !pf) return;
    // Pré-ficha pelo Notion: tudo o que já sabemos vai junto (nome, capacidade, site, rider, endereço…), não só o histórico.
    pf ||= PF() && pfDe(tipo, item?.id || conta?.nome || "");
    const hist = PP().doHistorico(tipo, item, B);
    if (pf) {
      hist.campos = { ...hist.campos, ...PF().campos(pf, PP().todos(tipo).map(([c]) => c)) };
      if (tipo === "casa" && !hist.disponibilidade.length && pf.diasFortes?.length) hist.disponibilidade = [{ cidade: null, dias: [...pf.diasFortes] }];
      if (!hist.motivo) hist.motivo = pf.realizadas.length ? `Pelo histórico do Tranquilo: ${pf.realizadas.length} ${pf.realizadas.length === 1 ? "noite" : "noites"}${tipo === "casa" ? " na casa" : ""}.` : `Pelo que o Tranquilo já tem ${tipo === "casa" ? "da sua casa" : "de você"} no Notion.`;
    }
    const sem = conta ? semanalPP(tipo, conta, E) : [], sug = conta ? PP().soOQueFalta(tipo, hist, conta.dados, sem) : hist;
    const precisaDisp = !sug.disponibilidade.length && !sem.some((s) => (s.dias || []).length);
    const conv = !conta && (E.conv || []).find((c) => c.tipo === tipo && kpp(c.vinculo_nome || c.nome) === kpp(item?.nome || pf?.nome));
    S.ppForm = { tipo, conta, nome: conta?.nome || item?.nome || pf?.nome || "", dados: conta?.dados || {}, campos: { ...sug.campos }, incluir: Object.keys(sug.campos),
      disp: sug.disponibilidade.length ? sug.disponibilidade.map((x) => ({ ...x, dias: [...x.dias] })) : precisaDisp ? [{ cidade: tipo === "artista" ? conta?.dados?.cidade_base || item?.mora || null : null, dias: [] }] : [],
      motivo: sug.motivo || "", email: conv?.email || "", whatsapp: conta?.whatsapp || conv?.whatsapp || "", falta: conta ? PP().faltando(tipo, conta.dados, sem) : [] };
    desenharFormProposta();
  }
  function lerFormProposta() {
    const F = S.ppForm; if (!F || !$("#ppForm")) return F;
    document.querySelectorAll("[data-pp-campo]").forEach((el) => { F.campos[el.dataset.ppCampo] = valorPP(F.tipo, el.dataset.ppCampo, el.value); });
    F.incluir = [...document.querySelectorAll("[data-pp-inc]:checked")].map((x) => x.dataset.ppInc);
    F.disp = lerDispPP("pp", F.tipo); F.motivo = ($("#ppMotivo")?.value || "").trim();
    if ($("#ppEmail")) { F.nome = $("#ppNome").value.trim(); F.email = $("#ppEmail").value.trim().toLowerCase(); F.whatsapp = $("#ppWa").value.trim(); }
    return F;
  }
  function desenharFormProposta() {
    const F = S.ppForm, P = PP(), C = P.todos(F.tipo);
    const linhaCampo = ([k, rot]) => { const agora = P.fmtValor(F.tipo, k, F.dados[k]);
      return `<div class="pp-campo"><label class="fcheck"><input type="checkbox" data-pp-inc="${k}"${F.incluir.includes(k) ? " checked" : ""}> <span><b>${esc(rot)}</b></span></label>${controlePP(F.tipo, k, F.campos[k], "data-pp-campo")}
        <div class="muted" style="font-size:12px">${F.conta ? (agora ? "Hoje na ficha: " + esc(agora) : "Hoje na ficha: vazio") : ""}</div></div>`; };
    const principais = C.filter(([k]) => F.incluir.includes(k) || (F.conta && P.vazio(F.dados[k]))), outros = C.filter((c) => !principais.includes(c));
    const avisoEquipe = F.falta.some((f) => f.chave === "equipe") ? `<p class="muted" style="font-size:13px">A casa também não cadastrou a equipe (em Equipe → Quem é quem). Vale lembrar na mensagem.</p>` : "";
    $("#dlgIn").innerHTML = `<div class="tag">Proposta de atualização · ${F.tipo === "casa" ? "casa" : "artista"}</div><h2 style="margin-top:4px">${esc(F.nome)}</h2>
      <p class="sub" style="margin-top:0">Já preenchemos com o que o histórico sugere. Confira, mude o que precisar e marque o que vai na proposta. Nada muda na ficha antes de ${F.tipo === "casa" ? "a casa" : "a artista"} aceitar.</p>
      <div id="ppForm">
      ${F.conta ? "" : `<div class="alert warn" style="margin-bottom:10px"><b>${esc(F.nome)} ainda não tem conta no portal</b>A proposta vai junto com o convite: ao entrar pelo link, ${F.tipo === "casa" ? "a casa" : "a artista"} vê a sugestão logo no começo, em Próximos passos.</div>
        <div class="fgrid"><label class="fcampo"><b>Nome</b><input id="ppNome" value="${esc(F.nome)}"></label><label class="fcampo"><b>E-mail para o convite</b><input id="ppEmail" type="email" value="${esc(F.email)}" placeholder="nome@email.com"></label><label class="fcampo"><b>WhatsApp (opcional)</b><input id="ppWa" value="${esc(F.whatsapp)}" placeholder="11 99999-9999"></label></div>`}
      <h3 class="pp-h">Informações da ficha</h3>
      <div class="pp-campos">${principais.map(linhaCampo).join("") || `<p class="muted" style="font-size:13px">A ficha já tem as informações importantes. Abra "Mudar outra informação" se quiser propor outra.</p>`}</div>
      ${outros.length ? `<details style="margin-top:6px"><summary>Mudar outra informação (${outros.length})</summary><div class="pp-campos">${outros.map(linhaCampo).join("")}</div></details>` : ""}
      <h3 class="pp-h">${F.tipo === "casa" ? "Dias da semana em que a casa pode receber" : "Dias da semana em que pode tocar, por cidade"}</h3>
      <p class="muted" style="font-size:13px;margin:0 0 6px">Os dias aceitos somam aos que a pessoa já marcou em Disponibilidade (nada é apagado).</p>
      <div class="pp-disps">${F.disp.map((x, i) => linhaDispPP(F.tipo, x, i, "pp")).join("") || `<p class="muted" style="font-size:13px">Sem dias na proposta.</p>`}</div>
      <div class="barra-acoes" style="margin-top:6px">${F.tipo === "artista" || !F.disp.length ? `<button class="btn sm" data-pp-dmais>+ ${F.tipo === "artista" ? "Adicionar cidade" : "Propor dias da semana"}</button>` : ""}</div>
      ${avisoEquipe}
      <label class="fcampo"><b>Por que estamos sugerindo (a pessoa lê)</b><textarea id="ppMotivo" rows="2" maxlength="1000">${esc(F.motivo)}</textarea></label>
      <div class="err" role="status" aria-live="polite" id="ppErr"></div>
      <div class="barra-acoes"><button class="btn pri" id="ppEnviar">${F.conta ? "Enviar proposta" : "Enviar proposta e criar convite"}</button><button class="btn" onclick="dlg.close()">Cancelar</button></div></div>`;
    $("#dlg").dataset.alvo = "proposta"; if (!$("#dlg").open) $("#dlg").showModal();
  }
  async function enviarProposta(btn) {
    const F = lerFormProposta(), P = PP();
    const campos = Object.fromEntries(F.incluir.map((k) => [k, F.campos[k]]).filter(([, v]) => !P.vazio(v)));
    const disp = F.disp.filter((x) => x.dias.length).map((x) => ({ cidade: F.tipo === "artista" ? x.cidade || null : null, dias: x.dias }));
    const err = $("#ppErr");
    if (!Object.keys(campos).length && !disp.length) { err.textContent = "✕ Não enviou: marque pelo menos uma informação (a caixinha ao lado do nome) ou um dia da semana."; return; }
    if (!F.conta && barrar(err, [[$("#ppNome"), !F.nome && "escreva o nome"], [$("#ppEmail"), !VAL.email(F.email) && (F.email ? "esse e-mail não parece válido (ex.: nome@gmail.com)" : "escreva o e-mail para o convite")],
      [$("#ppWa"), F.whatsapp && !VAL.tel(F.whatsapp) && "WhatsApp: número com DDD (ex.: 11 99999-9999)"]], "Não enviou")) return;
    const conv = F.conta ? null : { email: F.email, tipo: F.tipo, nome: F.nome, whatsapp: F.whatsapp || null, codigo_acesso: null, vinculo_nome: F.nome };
    const res = await acao(btn, async () => {
      const prop = await api.criarProposta({ alvo_tipo: F.tipo, alvo_user: F.conta?.user_id || null, alvo_ref: F.conta ? null : F.nome, convite_email: conv?.email || null, campos, disponibilidade: disp, motivo: F.motivo });
      const r = conv ? await api.convidar(conv) : null;
      return { prop, r };
    }, { st: "#ppErr", espera: "Enviando…", ok: "Proposta enviada." });
    if (!res.ok) return;
    if (S.eq) { S.eq.prop = [res.r.prop, ...(S.eq.prop || [])]; if (conv) S.eq = null; }
    const texto = P.mensagem({ nome: F.nome, tipo: F.tipo, prop: { campos, disponibilidade: disp, motivo: F.motivo }, convite: !!conv, link: conv ? `${site()}#criar&email=${encodeURIComponent(conv.email)}&tipo=${F.tipo}` : site() });
    S.ppForm = null; render();
    if (conv) dialogoResultado({ oque: "Convite com a proposta", nome: F.nome, email: conv.email, whatsapp: conv.whatsapp, texto, assunto: "Sua ficha na Rede Tranquilo", resultado: res.r.r, recebe: RECEBE.convite + " Ao entrar, a proposta aparece logo no começo, em Próximos passos.", reenviar: () => api.convidar(conv) });
    else dialogoEnvio({ titulo: `Proposta enviada para ${F.nome}`, texto, email: F.conta.email, whatsapp: F.conta.whatsapp, assunto: "Sugestão para atualizar sua ficha", aviso: `✓ Proposta enviada. Ela já aparece para ${F.tipo === "casa" ? "a casa" : "a artista"} em Próximos passos. Se quiser, avise pelo WhatsApp com a mensagem abaixo.` });
  }
  // Campos das propostas pendentes da própria conta (a mais nova vale), para a Ficha/inscrição nascer preenchida.
  function doConvitePP(tipo) {
    if (S.conta?.perfil.tipo !== tipo || funcoesDe()) return [];
    return (S.conta.prop || []).filter((p) => p.status === "pendente" && p.alvo_tipo === tipo).sort((a, b) => String(a.criado_em).localeCompare(String(b.criado_em))).flatMap((p) => Object.entries(p.campos || {}));
  }
  // Cartão da pessoa, no topo de Próximos passos: o antes → depois, "Aceitar tudo", "Ajustar" e "Recusar".
  function cartaoPropostas() {
    const C = S.conta, tipo = C.perfil.tipo; if (!["artista", "casa"].includes(tipo) || funcoesDe() || !PP()) return "";
    const msg = S.ppMsg ? `<div class="alert ${S.ppMsg.ok ? "good" : "warn"}" id="ppMsg" role="status" style="margin-bottom:14px"><b>${esc(S.ppMsg.t)}</b>${esc(S.ppMsg.d)}</div>` : "";
    const L = (C.prop || []).filter((p) => p.status === "pendente"); if (!L.length) return msg;
    const dados = (tipo === "casa" ? C.casa : C.insc)?.dados || {}, sem = (C.sem || []).filter((s) => tipo === "casa" ? !!s.casa_ref : s.user_id === C.perfil.id);
    const um = (p) => { const ls = PP().linhas(tipo, p, dados, sem), aj = S.ppAjuste === p.id;
      const ajuste = `<div class="pp-ajuste" id="ppAjuste"><p class="muted" style="font-size:13px;margin:0 0 6px">Mude o que não estiver certo. Deixe em branco o que não quer na sua ficha.</p>
        <div class="pp-campos">${Object.entries(p.campos || {}).map(([k, v]) => `<label class="fcampo"><b>${esc(PP().rotulo(tipo, k))}</b>${controlePP(tipo, k, v, "data-aj-campo")}<span class="muted" style="font-size:12px">Hoje: ${esc(PP().fmtValor(tipo, k, dados[k]) || "vazio")}</span></label>`).join("")}</div>
        ${(p.disponibilidade || []).length ? `<b style="display:block;margin-top:8px">Dias da semana</b>${p.disponibilidade.map((x, i) => linhaDispPP(tipo, x, i, "aj")).join("")}` : ""}
        <div class="barra-acoes" style="margin-top:8px"><button class="btn pri" data-pp-ajok="${p.id}">Salvar os ajustes e atualizar a ficha</button><button class="btn" data-pp-ajustar="">Voltar</button></div></div>`;
      return `<div class="pp-prop" data-pp-prop="${p.id}">
        <p style="margin:0 0 6px"><b>${ls.length} ${ls.length === 1 ? "informação" : "informações"}:</b> ${esc(ls.map((l) => l.rotulo).join(", "))}</p>
        ${p.motivo ? `<p class="muted" style="font-size:13px;margin:0 0 6px">${esc(p.motivo)}</p>` : ""}
        <details class="pp-det"><summary>Ver o antes → depois</summary><ul class="pp-ad">${ls.map((l) => `<li><b>${esc(l.rotulo)}</b><span><span class="pp-antes">${esc(l.antes || "vazio")}</span> <span aria-hidden="true">→</span><span class="sr-only">passa a ser</span> <span class="pp-depois">${esc(l.depois)}</span></span></li>`).join("")}</ul></details>
        ${aj ? ajuste : `<div class="barra-acoes" style="margin-top:8px"><button class="btn pri" data-pp-aceitar="${p.id}">Aceitar tudo</button><button class="btn" data-pp-ajustar="${p.id}">Ajustar</button><button class="btn" data-pp-recusar="${p.id}">Recusar</button></div>`}
        <div class="err" role="status" aria-live="polite" id="ppSt-${p.id}"></div></div>`; };
    return msg + `<section class="card pp-cartao" id="ppCartao" style="margin-bottom:14px;border:2px solid var(--violet, #7c8ff3)"><h2 style="margin:0 0 4px;font-size:19px">✨ O Tranquilo sugeriu atualizar sua ficha</h2>
      <p class="muted" style="font-size:13px;margin:0 0 10px">Pelo nosso histórico com ${tipo === "casa" ? "a sua casa" : "você"}. Confira o antes → depois: aceitando, a sua ficha${tipo === "casa" ? " e os dias da semana" : " e a sua disponibilidade"} mudam na hora. Você também pode ajustar ou recusar.</p>
      ${L.map(um).join('<hr style="border:0;border-top:1px solid var(--line);margin:12px 0">')}</section>`;
  }
  async function responderPP(btn, pid, aceitar, ajustes) {
    const tipo = S.conta.perfil.tipo, p = (S.conta.prop || []).find((x) => x.id === pid);
    const res = await acao(btn, async () => {
      const r = await api.responderProposta(pid, aceitar, ajustes);
      const [prop, ficha, sem] = await Promise.all([api.propostas().catch(() => S.conta.prop), tipo === "casa" ? api.minhaCasa() : api.minhaInscricao(), api.semanal().catch(() => [])]);
      S.conta.prop = prop; S.conta.sem = sem; if (tipo === "casa") S.conta.casa = ficha; else S.conta.insc = ficha;
      S.disp = undefined; S.sem = undefined; return r;
    }, { st: "#ppSt-" + pid, espera: aceitar ? "Atualizando a sua ficha…" : "Registrando…", ok: aceitar ? "Ficha atualizada." : "Proposta recusada." });
    if (!res.ok) return;
    const nomes = p ? PP().linhas(tipo, res.r?.aplicado ? { campos: res.r.aplicado.campos || {}, disponibilidade: res.r.aplicado.disponibilidade || [] } : p, {}, []).map((l) => l.rotulo.toLowerCase()) : [];
    S.ppAjuste = null;
    S.ppMsg = aceitar ? { ok: true, t: "✓ Pronto! Sua ficha foi atualizada.", d: `Atualizamos: ${nomes.join(", ") || "o que você aceitou"}. Confira em ${tipo === "casa" ? "Cadastro e Disponibilidade" : "Minha ficha e Disponibilidade"} quando quiser.` }
      : { ok: false, t: "Proposta recusada", d: "Nada mudou na sua ficha. Se algo estiver diferente do que sugerimos, fale com a equipe do Tranquilo." };
    render(); $("#ppMsg")?.scrollIntoView({ block: "center" });
  }
  async function cliquesPropostas(t) {
    const nv = t.closest("[data-pp-novo]"); if (nv) { abrirFormProposta(nv.dataset.ppNovo); return true; }
    const bl = t.closest("[data-pp-bloco]"); if (bl) { const k = bl.dataset.ppBloco; (S.ppAberto ||= {})[k] = !S.ppAberto[k]; render(); return true; }
    const mm = t.closest("[data-pp-mais]"); if (mm) { (S.ppMais ||= {})[mm.dataset.ppMais] = true; render(); return true; }
    if (t.closest("[data-pp-dmais]")) { const F = lerFormProposta(); F.disp.push({ cidade: null, dias: [] }); desenharFormProposta(); return true; }
    if (t.id === "ppEnviar") { await enviarProposta(t); return true; }
    const ac = t.closest("[data-pp-aceitar]"); if (ac) { await responderPP(ac, ac.dataset.ppAceitar, true, null); return true; }
    const rc = t.closest("[data-pp-recusar]"); if (rc) {
      if (!confirm("Recusar a sugestão? Nada muda na sua ficha.")) return true;
      await responderPP(rc, rc.dataset.ppRecusar, false, null); return true;
    }
    const aj = t.closest("[data-pp-ajustar]"); if (aj) { S.ppAjuste = aj.dataset.ppAjustar || null; render(); if (S.ppAjuste) $("#ppAjuste")?.scrollIntoView({ block: "center" }); return true; }
    const ok = t.closest("[data-pp-ajok]"); if (ok) {
      const pid = ok.dataset.ppAjok, p = (S.conta.prop || []).find((x) => x.id === pid), tipo = S.conta.perfil.tipo;
      const campos = {}; document.querySelectorAll(`[data-pp-prop="${CSS.escape(pid)}"] [data-aj-campo]`).forEach((el) => { campos[el.dataset.ajCampo] = valorPP(tipo, el.dataset.ajCampo, el.value); });
      const ajustes = { campos }; if ((p?.disponibilidade || []).length) ajustes.disponibilidade = lerDispPP("aj", tipo).filter((x) => x.dias.length);
      await responderPP(ok, pid, true, ajustes); return true;
    }
    return false;
  }
  function buscaDatas(E, casas, aberta = true) {
    const b = S.dpb; b.modo ||= "Descubra";
    const modos = [...R.NOMES_FORMATO, "dia"], rotModo = (m) => m === "dia" ? "Todos os dias" : m;
    // Fluxo numerado (Marina, 18/11/2026: os formatos não pareciam filtros): 1. formato → 2. combinação → 3. criar.
    // Período, cidade, casa e artista ficam nos Filtros do topo, que valem para a página toda.
    // Cada formato mostra quantas combinações tem no período, para ficar claro que é uma escolha e o que ela traz.
    const passo = (n, t) => `<div class="passo-rot"><i>${n}</i>${t}</div>`;
    const contaModo = (m) => { try {
      if (m === "dia") { const n = linhasDoDia(E, casas, b).length; return `${n} ${n === 1 ? "dia" : "dias"}`; }
      const F = R.formatoDe(m); if (F?.mesmoArtista) { const n = planoTurne(E, { ...b, modo: m }).arts.length; return `${n} ${n === 1 ? "artista topa" : "artistas topam"}`; }
      const n = cartoesModelo(E, { ...b, modo: m }).length; return `${n} ${n === 1 ? "combinação" : "combinações"}`; } catch { return ""; } };
    const nAtual = contaModo(b.modo);
    const bloco = (corpo) => dobra("dp-busca", "Encontrar data", `${esc(rotModo(b.modo))}${nAtual ? " · " + esc(nAtual) + " no período" : ""}`, `<div id="dpBusca">${corpo}</div>`, { aberta, classe: "dp-bloco" });
    const topo = `${passo(1, "Escolha o formato")}
      <div class="dpb-modos seg-opcoes" role="group" aria-label="1. Escolha o formato" style="margin:0 0 8px">${modos.map((m) => { const n = m === b.modo ? nAtual : contaModo(m); return `<button type="button" data-dpb-modo="${esc(m)}" aria-pressed="${b.modo === m}"><b>${esc(rotModo(m))}</b>${n ? `<span class="seg-n">${esc(n)}</span>` : ""}</button>`; }).join("")}</div>
      ${b.modo === "dia" ? "" : regraFormato(b.modo, "dpbRegra")}`;
    const msg = `<div class="err" role="status" aria-live="polite" id="dpbMsg"></div>`;
    if (b.modo !== "dia") {
      const F = R.formatoDe(b.modo);
      return bloco(`${topo}<p class="muted" style="font-size:13px;margin-top:0">${F.mesmoArtista ? "Escolha o artista: aparecem as casas livres (Ficha habilitada) em cidades diferentes nos dias em que ele está livre." : `Casas livres (Ficha habilitada) em cada dia com ${F.artistas} ${F.artistas === 1 ? "artista livre que topa" : "artistas livres que topam"} o ${esc(F.nome)} na cidade delas. O line-up já vem escolhido: crie direto, ou abra a linha para trocar quem quiser.`}</p>
        ${passo(2, F.mesmoArtista ? "Escolha o artista e as cidades" : "Escolha a combinação (abra a linha para trocar artistas)")}<p class="muted" style="font-size:13px;margin:-4px 0 8px"><b>3.</b> Depois, toque em ${F.mesmoArtista ? "criar a turnê" : "\"Criar este evento\""}: o site pergunta antes de criar.</p>${msg}${F.mesmoArtista ? htmlTurne(E, b) : htmlCartoes(E, b)}`);
    }
    const linhas = linhasDoDia(E, casas, b);
    const semDisp = !(E.dispA || []).length;
    const chipC = (c, dia) => `<button class="btn sm" data-dpb-casa="${c.id}|${dia}" title="Preencher a Nova data com esta casa e este dia" style="text-align:left;line-height:1.3"><b>${esc(c.nome)}</b>${c.status && c.status !== "habilitada" ? ` <span class="muted">(Ficha: ${esc(String(STATUS_CASA[c.status]?.[1] || c.status).toLowerCase())})</span>` : ""}<br><span class="muted" style="font-size:12px">📍 ${esc(c.cidade || "cidade não informada")}</span></button>`;
    const chipA = (a, dia) => `<button class="btn sm" data-dpb-art="${esc(a.nome)}|${dia}" title="Colocar no line-up da Nova data" style="text-align:left;line-height:1.3"><b>${esc(a.nome)}${a.quer ? " ★" : ""}</b>${a.status && a.status !== "aprovada" ? ` <span class="muted">(${esc(STATUS_INSC[a.status]?.[1] || a.status)})</span>` : ""}<br><span class="muted" style="font-size:12px">🏠 mora em ${esc(a.mora || "cidade não informada")}${a.querTocar.length ? ` · quer tocar em ${esc(a.querTocar.join(", "))}` : ""}</span></button>`;
    // Cada dia é uma linha (dia · nº de casas · nº de artistas); abrir mostra as casas e os artistas para tocar.
    const linhaDia = (l) => dobra("dpd:" + l.dia, `${esc(NOME_SEM[wdDe(l.dia)].slice(0, 3))} ${dt(l.dia)}`, `${l.cs.length} ${l.cs.length === 1 ? "casa livre" : "casas livres"} · ${l.as.length} ${l.as.length === 1 ? "artista livre" : "artistas livres"}`,
      `<div><span class="muted" style="font-size:12px">Casas:</span> <span style="display:inline-flex;gap:6px;flex-wrap:wrap">${l.cs.map((c) => chipC(c, l.dia)).join("") || '<span class="muted">nenhuma</span>'}</span></div>
        <div style="margin-top:6px"><span class="muted" style="font-size:12px">Artistas:</span> <span style="display:inline-flex;gap:6px;flex-wrap:wrap">${l.as.map((a) => chipA(a, l.dia)).join("") || '<span class="muted">nenhum</span>'}</span></div>`, { classe: "dpd-dia" });
    return bloco(`${topo}<p class="muted" style="font-size:13px;margin-top:0">Casa e artista livres no mesmo dia: cruza o que as casas marcaram em Datas com o que os artistas marcaram em Disponibilidade, sem quem já tem show no dia. Abra um dia e toque numa casa ou num artista para já preencher a Nova data abaixo. ★ = o artista quer tocar nessa cidade.</p>
      <label class="fcheck" style="margin:0 0 8px"><input type="checkbox" data-dpb="ambos"${b.ambos ? " checked" : ""}> <span>só dias com casa e artista livres</span></label>
      ${passo(2, "Abra um dia e toque numa casa ou num artista: a Nova data, abaixo, já vem preenchida")}
      ${semDisp ? `<div class="alert warn" style="margin-bottom:10px"><b>⚠ Nenhum artista marcou a disponibilidade ainda</b>Os artistas marcam os dias na área deles, em Disponibilidade. Enquanto isso, desmarque "só dias com casa e artista livres" para ver as casas livres.</div>` : ""}
      ${linhas.length ? `<div class="list dpd-lista">${linhas.map(linhaDia).join("")}</div>`
        : `<p class="muted">Nenhum dia ${b.ambos ? "com casa e artista livres" : "com casa ou artista livre"} nesse período${b.cid ? " em " + esc(b.cid) : ""}.</p>`}`);
  }
  // O que já está digitado na Nova data, para não perder ao preencher pela busca.
  function lerFormDp() {
    const v = (id) => ($(id)?.value || "").trim();
    // "__outros"/"__outrasC" é só o botão que abre o grupo recolhido: vale o que estava escolhido antes.
    const val = (el) => { const x = (el?.value || "").trim(); return x.startsWith("__outr") ? (el.dataset.valor || "") : x; };
    return { dia: v("#dpDia"), abertura: v("#dpAbre") || "19:00", produto: v("#dpProd") || "Descubra", casa_id: val($("#dpCasa")), cidade: valorCidade($("#dpCidade")), link_ingressos: v("#dpLink"), observacao: v("#dpObs"),
      artistas: linhasDp() };
  }
  // Linhas do line-up como estão na tela (vazias inclusive, para cada uma ficar no lugar).
  function linhasDp() {
    return [...document.querySelectorAll("[data-dp-art]")].map((el) => ({ nome: ((el.value || "").trim().startsWith("__outr") ? el.dataset.valor || "" : (el.value || "").trim()), producao: !!$(`[data-dp-prod="${el.dataset.dpArt}"]`)?.checked }));
  }
  function lerLpVal() { document.querySelectorAll("[data-lp-campo]").forEach((i) => { (S.lpVal ||= {})[i.dataset.lpCampo] = i.value.trim(); }); }
  function calendarioMes(mes, celula, attr) {
    const [a, m] = mes.split("-").map(Number), primeiro = new Date(Date.UTC(a, m - 1, 1)), total = new Date(Date.UTC(a, m, 0)).getUTCDate();
    const vazios = (primeiro.getUTCDay() + 6) % 7, nome = primeiro.toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
    const ant = new Date(Date.UTC(a, m - 2, 1)).toISOString().slice(0, 7), prox = new Date(Date.UTC(a, m, 1)).toISOString().slice(0, 7);
    let html = `<div class="cal"><div class="row" style="margin-bottom:8px"><button class="btn sm" data-cal-mes="${ant}" aria-label="Mês anterior">‹</button><b>${esc(nome.charAt(0).toUpperCase() + nome.slice(1))}</b><button class="btn sm" data-cal-mes="${prox}" aria-label="Próximo mês">›</button></div>
      <div class="cal-grade">${["seg", "ter", "qua", "qui", "sex", "sáb", "dom"].map((d) => `<div class="cal-cab">${d}</div>`).join("")}${'<div></div>'.repeat(vazios)}`;
    for (let d = 1; d <= total; d++) {
      const dia = `${mes}-${String(d).padStart(2, "0")}`, c = celula(dia);
      html += attr && c.clicavel ? `<button class="cal-dia ${c.classe}" ${attr}="${dia}" aria-label="${dt(dia)}: ${esc(c.rotulo || "sem informação")}"><b>${d}</b><span>${esc(c.rotulo)}</span></button>`
        : `<div class="cal-dia ${c.classe}${attr ? " passado" : ""}"><b>${d}</b><span>${esc(c.rotulo)}</span></div>`;
    }
    return html + `</div><div class="cal-legenda"><span class="cal-dia livre">disponível</span><span class="cal-dia ocupado">indisponível</span><span class="cal-dia cal-ev">evento confirmado</span>${attr ? '<span class="cal-dia exc">exceção (data ajustada)</span>' : '<span class="cal-dia conflito">conflito</span>'}<span class="cal-dia">sem informação</span></div>${attr ? '<p class="muted" style="font-size:12px">Toque num dia para mudar: sem informação → disponível → indisponível.</p>' : ""}</div>`;
  }
  async function carregarDisp() {
    if (S.dispCarregando) return; S.dispCarregando = true;
    try { [S.disp, S.sem] = await Promise.all([api.disponibilidade(), api.semanal().catch(() => [])]); } catch { S.disp = null; } finally { S.dispCarregando = false; }
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
    const ed = t.closest("[data-eqc-editar]"); if (ed) { S.eqcEd = ed.dataset.eqcEditar || null; S.eqcNovo = null; render(); $("#eqcForm")?.scrollIntoView({ block: "center" }); return true; }
    // "Adicionar <função>" (cartão do que falta) e "+ Adicionar mais um membro": abre o formulário com a função já escolhida.
    const nv = t.closest("[data-eqc-nova]"); if (nv) { S.eqcEd = null; S.eqcNovo = nv.dataset.eqcNova; render(); $("#eqcForm")?.scrollIntoView({ block: "center" }); $("#eqcNome")?.focus({ preventScroll: true }); return true; }
    if (t.id === "eqcOk") {
      const err = $("#eqcErr"), funcoes = [...document.querySelectorAll("[data-eqc-funcao]")].filter((x) => x.checked).map((x) => x.dataset.eqcFuncao);
      const m = { id: S.eqcEd || null, casa_ref: S.conta.perfil.vinculo_nome, nome: $("#eqcNome").value.trim(), whatsapp: $("#eqcWa").value.trim(), email: $("#eqcEmail").value.trim().toLowerCase(), instagram: $("#eqcInsta").value.trim(), observacao: $("#eqcObs").value.trim(), funcoes, reserva: $("#eqcReserva").checked };
      const fe = TQEquipe.funcoesErro(funcoes);
      if (barrar(err, [[$("#eqcNome"), m.nome.length < 2 && "coloque o nome da pessoa"], [document.querySelector("[data-eqc-funcao]"), fe && fe.replace(/\.$/, "")],
        [$("#eqcWa"), m.whatsapp && !VAL.tel(m.whatsapp) && "WhatsApp: número com DDD (ex.: 11 99999-9999)"], [$("#eqcEmail"), m.email && !VAL.email(m.email) && "esse e-mail não parece válido. Confira se está escrito certo (ex.: nome@gmail.com)"]])) return true;
      if (m.whatsapp) m.whatsapp = VAL.fTel(m.whatsapp);
      await acao(t, async () => { await api.salvarMembro(m); TQDiario.registrar("equipe_casa", { acao: m.id ? "editou" : "adicionou", funcoes }); abrirLinhaEq(`eqc:${m.reserva ? "reserva" : funcoes[0]}`); S.eqcEd = null; S.eqcNovo = null; S.conta.equipe = undefined; await carregarEquipeCasa(); },
        { st: "#eqcErr", ok: () => { const c = Array.isArray(S.conta.equipe) ? TQEquipe.cobertura(S.conta.equipe) : null;
          return `${m.id ? `${m.nome}: alterações salvas.` : `${m.nome} entrou na equipe.`}${c ? c.completa ? " Equipe completa: a Disponibilidade da casa está liberada." : TQEquipe.faltando(c).length ? ` Faltam: ${TQEquipe.listaFalta(c)}.` : "" : ""}`; }, erro: (x) => /equipe_casa_email|duplicate/i.test(x.message || "") ? "Já tem alguém da equipe com este e-mail." : traduz(x.message || "") });
      return true;
    }
    const rm = t.closest("[data-eqc-remover]"); if (rm) {
      const m = (S.conta.equipe || []).find((x) => x.id === rm.dataset.eqcRemover);
      if (!m || !confirm(`Tirar ${m.nome} da equipe?${m.acesso === "ativo" ? " A conta dessa pessoa deixa de ver a casa." : ""}`)) return true;
      await acao(rm, async () => { await api.removerMembro(m.id); TQDiario.registrar("equipe_casa", { acao: "tirou" }); S.conta.equipe = undefined; await carregarEquipeCasa(); }, { espera: "Tirando…", ok: `${m.nome} saiu da equipe.` });
      return true;
    }
    const cv = t.closest("[data-eqc-convidar]"); if (cv) {
      const m = (S.conta.equipe || []).find((x) => x.id === cv.dataset.eqcConvidar); if (!m) return true;
      const site = location.origin + location.pathname, criar = `${site}#criar&email=${encodeURIComponent(m.email)}&tipo=casa&equipe=1`;
      const zap = `Oi, ${m.nome}! Você entrou na equipe de ${S.conta.perfil.vinculo_nome} na Rede Tranquilo (${nomesFuncoes(m.funcoes)}). Mandei um link de acesso para ${m.email}. Se não chegar, crie a sua senha com esse mesmo e-mail aqui: ${criar}\n\nNo primeiro acesso, um tutorial mostra o que é seu.`;
      const res = await acao(cv, async () => { const r = await api.convidarMembro(m.id, m.email, m.nome); TQDiario.registrar("equipe_convite", { funcoes: m.funcoes }); S.conta.equipe = undefined; await carregarEquipeCasa(); return r; },
        { espera: "Enviando…", ok: (r) => r.ja ? `${m.nome} já tem acesso.` : `Acesso de ${m.nome} criado.` });
      if (res.ok && !res.r?.ja) dialogoResultado({ oque: "Convite", nome: m.nome, email: m.email, whatsapp: m.whatsapp, texto: zap, assunto: "Seu acesso à Rede Tranquilo", resultado: res.r, recebe: RECEBE.convite, reenviar: () => api.convidarMembro(m.id, m.email, m.nome) });
      return true;
    }
    if (t.dataset?.trilhaCasa) {
      const etapa = t.dataset.trilhaCasa;
      const feito = t.checked;
      const r = await acao(t, async () => { await api.trilhaMarcarCasa(etapa, feito); TQDiario.registrar("trilha_casa", { etapa, feito }); S.conta.trilha = await api.minhaTrilha(); const y = scrollY; render(); scrollTo(0, y); },
        { ok: feito ? "Etapa marcada como feita." : "Etapa desmarcada." });
      if (!r.ok && t.isConnected) t.checked = !feito;
      return true;
    }
    // Central: trilhas das casas novas.
    if (t.dataset?.triMarco) {
      const v = t.dataset.triMarco, i = v.lastIndexOf("|"), ref = v.slice(0, i), etapa = v.slice(i + 1); S.triAberta = ref;
      const feito = t.checked;
      const r = await acao(t, async () => { await api.marcarTrilha(ref, etapa, feito); TQDiario.registrar("trilha_marco", { etapa, feito }); const y = scrollY; S.tri = null; await carregarTrilhas(); scrollTo(0, y); },
        { ok: feito ? "Etapa marcada como feita." : "Etapa desmarcada." });
      if (!r.ok && t.isConnected) t.checked = !feito;
      return true;
    }
    const te = t.closest("[data-tri-editar]"); if (te) { S.triEd = te.dataset.triEditar || null; render(); $("#triForm")?.scrollIntoView({ block: "center" }); return true; }
    if (t.id === "triOk") {
      const err = $("#triErr"), casa_ref = $("#triCasa").value.trim(), inicio = $("#triInicio").value, nota = $("#triNota").value.trim();
      if (barrar(err, [[$("#triCasa"), casa_ref.length < 2 && "escolha a casa"], [$("#triInicio"), !/^\d{4}-\d{2}-\d{2}$/.test(inicio) && "escolha o dia 1"]])) return true;
      if (!S.triEd && S.tri.trilhas.some((x) => x.casa_ref.toLowerCase() === casa_ref.toLowerCase())) { marcar($("#triCasa")); diz(err, "Esta casa já tem trilha: use \"Editar dia 1 e nota\"."); return true; }
      const era = S.triEd;
      await acao(t, async () => { await api.salvarTrilha({ casa_ref, inicio, nota }); TQDiario.registrar("trilha", { acao: S.triEd ? "editou" : "comecou" }); S.triEd = null; S.triAberta = casa_ref; S.tri = null; await carregarTrilhas(); },
        { st: "#triErr", ok: era ? `Trilha de ${casa_ref} salva.` : `Trilha de ${casa_ref} começou.` });
      return true;
    }
    const ta = t.closest("[data-tri-apagar]"); if (ta) {
      if (!confirmaAqui(ta, `Apagar a trilha de ${ta.dataset.triApagar}?`, "As etapas marcadas também saem. Não dá para desfazer.", "Sim, apagar a trilha")) return true;
      await acao(ta, async () => { await api.apagarTrilha(ta.dataset.triApagar); S.tri = null; await carregarTrilhas(); }, { espera: "Apagando…", ok: `Trilha de ${ta.dataset.triApagar} apagada.` });
      return true;
    }
    return false;
  }
  // Ficha da Casa: pedido de atualização, cancelamento e "Copiar respostas" (como no modelo do Gui).
  async function cliquesDatas(t) {
    const cm = t.closest("[data-cal-mes]"); if (cm) { S.dispMes = cm.dataset.calMes; render(); return true; }
    // Exceções ao padrão semanal: abrir o formulário, salvar e remover.
    const xa = t.closest("[data-exc-abrir]"); if (xa) { S.excAberto = xa.dataset.excAbrir; S.excPre = {}; render(); $("#excDia")?.focus(); $("#excForm")?.scrollIntoView({ block: "center" }); return true; }
    if (t.closest("[data-exc-fechar]")) { S.excAberto = null; S.excPre = null; render(); return true; }
    const xo = t.closest("[data-exc-ok]"); if (xo) {
      const alvo = xo.dataset.excOk, c = contextoDisp(alvo), dia = $("#excDia").value, tipo = document.querySelector('input[name="excTipo"]:checked')?.value, nota = $("#excMotivo").value.trim();
      S.excPre = { dia, tipo, nota };
      if (barrar($("#excErr"), [[$("#excDia"), !dia ? "escolha o dia" : dia < hojeIso() && "esse dia já passou"], [document.querySelector('input[name="excTipo"]'), !tipo && "escolha Bloquear ou Liberar"]])) return true;
      const sit = tipo === "bloquear" ? "indisponivel" : "disponivel", atual = c.linhas.find((x) => x.dia === dia);
      if (sit === "disponivel" && !atual && c.sem.includes(wdDe(dia))) { diz($("#excErr"), `⚠ ${dt(dia)} já está livre pelo padrão semanal. Não precisa de exceção.`); return true; }
      await acao(xo, async () => { await c.marcar(dia, sit, nota || null); const L = c.lista(); if (atual) L.splice(L.indexOf(atual), 1); L.push(c.nova(dia, sit, nota || null));
        TQDiario.registrar(alvo === "casa" ? "disponibilidade" : "disponibilidade_artista", { excecao: tipo }); S.excAberto = null; S.excPre = null; render(); },
        { st: "#excErr", ok: `${dt(dia)} ${sit === "indisponivel" ? "bloqueado" : "liberado"}${nota ? ` (${nota})` : ""}. Já vale para a Isa.` });
      return true;
    }
    const xr = t.closest("[data-exc-rm]"); if (xr) {
      const [alvo, dia] = xr.dataset.excRm.split("|"), c = contextoDisp(alvo), atual = c.linhas.find((x) => x.dia === dia);
      await acao(xr, async () => { await c.marcar(dia, null); const L = c.lista(); if (atual) L.splice(L.indexOf(atual), 1);
        TQDiario.registrar(alvo === "casa" ? "disponibilidade" : "disponibilidade_artista", { excecao: "removida" }); render(); },
        { st: "#excErr", espera: "Removendo…", ok: `Exceção de ${dt(dia)} removida: o dia volta a seguir o padrão semanal.` });
      return true;
    }
    const dd = t.closest("[data-disp-dia]"); if (dd) {
      const ref = S.conta.perfil.vinculo_nome, dia = dd.dataset.dispDia, atual = (S.disp || []).find((x) => x.casa_ref.toLowerCase() === ref.toLowerCase() && x.dia === dia);
      const naSemana = semanaDe(S.sem, { casaRef: ref, fichaDias: S.conta.casa?.dados?.dias_semana }).includes(wdDe(dia));
      const prox = naSemana ? (atual ? null : "indisponivel") : !atual ? "disponivel" : atual.situacao === "disponivel" ? "indisponivel" : null;
      await acao(dd, async () => { await api.marcarDisponibilidade(ref, dia, prox); S.disp = (S.disp || []).filter((x) => !(x === atual)); if (prox) S.disp.push({ casa_ref: ref, dia, situacao: prox, nota: atual?.nota || null }); TQDiario.registrar("disponibilidade", { situacao: prox || "limpa" }); render(); },
        { st: "#dispErr", ok: `${dt(dia)}: ${prox === "disponivel" ? "disponível" : prox === "indisponivel" ? "indisponível" : "sem marcação"}.` });
      return true;
    }
    if (t.closest("[data-disp-semana]")) {
      const ref = S.conta.perfil.vinculo_nome, mes = S.dispMes || hojeIso().slice(0, 7), quer = S.conta.casa?.dados?.dias_semana || [];
      const nomes = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"], [a, m] = mes.split("-").map(Number), total = new Date(Date.UTC(a, m, 0)).getUTCDate();
      await acao(t.closest("[data-disp-semana]"), async () => { for (let d = 1; d <= total; d++) { const dia = `${mes}-${String(d).padStart(2, "0")}`; if (dia < hojeIso() || (S.pac?.eventos || []).some((e) => !e.z && e.d === dia) || !quer.includes(nomes[new Date(dia + "T12:00:00Z").getUTCDay()]) || (S.disp || []).some((x) => x.casa_ref.toLowerCase() === ref.toLowerCase() && x.dia === dia)) continue;
          await api.marcarDisponibilidade(ref, dia, "disponivel"); S.disp.push({ casa_ref: ref, dia, situacao: "disponivel" }); }
        render(); }, { st: "#dispErr", ok: "Dias da semana da Ficha marcados como disponíveis neste mês.", erro: (x) => { render(); return traduz(x.message || ""); } });
      return true;
    }
    return false;
  }
  async function cliquesFicha(t) {
    // Central: responder pedido de atualização e salvar combinados.
    const sr = t.closest("[data-sol-responder]"); if (sr) {
      const [sid, ap] = sr.dataset.solResponder.split("|"), resp = document.querySelector(`[data-sol-resp="${sid}"]`)?.value || "";
      await acao(sr, async () => { await api.responderSolicitacao(sid, ap === "1", resp); TQDiario.registrar("ficha_pedido_resposta", { aprovado: ap === "1" }); $("#dlg").close(); S.eq = null; render(); },
        { st: "#derr", ok: ap === "1" ? "Pedido aprovado. A Ficha da casa já foi atualizada." : "Pedido recusado. A casa vê a sua resposta." });
      return true;
    }
    if (t.closest("[data-hist-recarregar]")) { S.hist = undefined; render(); return true; }
    if (t.closest("[data-hist-mais]")) { S.histMax = (S.histMax || 50) + 50; render(); return true; }
    const ef = t.closest("[data-editar-ficha]"); if (ef) { const id = ef.dataset.editarFicha || S.fichaEdit; S.fichaEdit = ef.dataset.editarFicha || null; fichaCasa(id); return true; }
    const sf = t.closest("[data-salvar-ficha]"); if (sf) {
      const c = S.eq.casas.find((x) => x.id === sf.dataset.salvarFicha); if (!c) return true;
      const dados = { ...(c.dados || {}), ...lerForm($("#formCentral")) }, erros = conferirFormato(dados);
      if (erros.length) { marcarFormato($("#formCentral"), erros); diz($("#derr"), `Não salvou. Confira: ${erros.join("; ")}.`); return true; }
      await acao(sf, async () => { await api.editarFichaCasa(c.id, dados); c.dados = dados; c.pendencias = R.pendenciasCasa(dados); S.fichaEdit = null; fichaCasa(c.id); }, { st: "#derr", ok: "Ficha salva." });
      return true;
    }
    const cpm = t.closest("[data-copiar-msg]"); if (cpm) {
      const ta = document.getElementById(cpm.dataset.copiarMsg), ok = cpm.nextElementSibling;
      try { await navigator.clipboard.writeText(ta.value); if (ok) ok.textContent = "✓ Copiada."; } catch { ta.select(); if (ok) ok.textContent = "✕ O navegador não deixou copiar. O texto ficou selecionado: copie com Ctrl+C."; }
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
      try { await navigator.clipboard.writeText(txt); diz($("#tranksOk"), "✓ Copiado. Cole na conversa com a Tranks."); } catch { diz($("#tranksOk"), "O navegador não deixou copiar. Selecione o texto e copie com Ctrl+C."); }
      return true;
    }
    const cs = t.closest("[data-cb-salvar]"); if (cs) {
      const cb = {}; for (const el of document.querySelectorAll("[data-cb]")) { const v = el.value.trim(); if (!v) continue; const [a, b] = el.dataset.cb.split("."); (cb[a] ||= {})[b] = /^\d+([.,]\d+)?$/.test(v) && !["contatos", "bonificacao"].includes(a) ? Number(v.replace(",", ".")) : v; }
      for (const [g, nome] of [["bilheteria", "Bilheteria"], ["aeb", "Alimentos e bebidas"]]) {
        const vs = Object.values(cb[g] || {}); if (!vs.length) continue;
        const els = [...document.querySelectorAll(`[data-cb^="${g}."]`)].filter((el) => el.value.trim());
        if (vs.some((v) => typeof v !== "number" || v < 0 || v > 100)) { marcar(els.filter((el) => { const n = Number(el.value.trim().replace(",", ".")); return !/^\d+([.,]\d+)?$/.test(el.value.trim()) || n > 100; })); diz($("#derr"), `Não salvou. ${nome}: use só números de 0 a 100.`); return true; }
        const soma = vs.reduce((a, b) => a + b, 0); if (Math.abs(soma - 100) > 0.01) { marcar(els); diz($("#derr"), `Não salvou. ${nome}: os percentuais somam ${soma}%, precisam somar 100%.`); return true; }
      }
      await acao(cs, async () => { await api.definirCombinados(cs.dataset.cbSalvar, cb); const c = S.eq.casas.find((x) => x.id === cs.dataset.cbSalvar); if (c) c.combinados = cb; }, { st: "#derr", ok: "Combinados salvos. A casa já vê na Parte 1 da Ficha." });
      return true;
    }
    if (t.id === "solPedir") { S.fichaPedido = true; render(); $("#form [data-k]")?.focus(); return true; }
    if (t.id === "solVoltar") { S.fichaPedido = false; render(); return true; }
    if (t.id === "solEnviar") {
      const err = $("#ferr"), novo = lerForm($("#form")), erros = conferirFormato(novo);
      if (erros.length) { marcarFormato($("#form"), erros); diz(err, `Não enviado. Confira antes de enviar: ${erros.join("; ")}.`); return true; }
      // Pedido sem nenhuma mudança não vai para a Central.
      const atual = S.conta.casa?.dados || {}, mudou = Object.entries(novo).some(([k, v]) => JSON.stringify(vazioV(v) ? "" : v) !== JSON.stringify(vazioV(valorCasa(atual, k)) ? "" : valorCasa(atual, k)));
      if (!mudou) { diz(err, "⚠ Você ainda não mudou nenhum campo. Altere o que precisa mudar e toque em \"Enviar pedido de atualização\" de novo."); return true; }
      const msgSol = ($("#solMsg")?.value || "").trim();
      if (msgSol.length < 10) { marcar($("#solMsg")); diz(err, `Não enviado: conte em "O que mudou" o que mudou e por quê (pelo menos 10 caracteres${msgSol.length ? `; agora tem ${msgSol.length}` : ""}). É o que a Central lê para aprovar.`); return true; }
      await acao(t, async () => { await api.solicitarAtualizacao(novo, msgSol); TQDiario.registrar("ficha_pedido", {});
        S.fichaPedido = false; S.conta.sol = await api.minhasSolicitacoes(); render(); }, { st: "#ferr", espera: "Enviando…", ok: "Pedido enviado ao Gui. Próximo passo: quando ele aprovar, a Ficha muda sozinha; a resposta aparece aqui." });
      return true;
    }
    const sc = t.closest("[data-sol-cancelar]"); if (sc) {
      if (!confirmaAqui(sc, "Cancelar o pedido de atualização?", "O Gui deixa de ver o pedido e a Ficha continua como estava.", "Sim, cancelar o pedido")) return true;
      await acao(sc, async () => { await api.cancelarSolicitacao(sc.dataset.solCancelar); S.conta.sol = await api.minhasSolicitacoes(); render(); }, { st: "#ferr", ok: "Pedido de atualização cancelado. A Ficha continua como estava." });
      return true;
    }
    if (t.id === "copiarFicha") {
      const d = { ...(S.conta.casa?.dados || {}), ...lerForm($("#form")) };
      const txt = textoFicha(d, true, S.conta.equipe);
      // Como no modelo do Gui: as respostas vão para o WhatsApp dele; também por e-mail ou cópia (e-mail a validar).
      dialogoEnvio({ titulo: "Enviar as respostas da Ficha", texto: txt, whatsapp: S.conta.casa?.combinados?.contatos?.gui || "(11) 99625-3334", email: "gui.monteiro@tranquilomusica.com.br", assunto: `Ficha da unidade · ${d.nome || S.conta.perfil.vinculo_nome || ""}` });
      return true;
    }
    return false;
  }
  // "Para você" e "Comece por aqui": cada item abre direto o que espera a pessoa (contrato, Ficha, inscrição, campanha, data).
  function abrirItem(alvo) {
    const i = alvo.indexOf(":"), tipo = alvo.slice(0, i), id = alvo.slice(i + 1);
    const depois = (fn) => setTimeout(fn, 60);
    if (tipo === "pf") { const j = id.indexOf("|"); abrirPreFicha(id.slice(0, j), id.slice(j + 1)); return; }
    if ($("#dlg")?.open) $("#dlg").close();   // item aberto de dentro de uma pré-ficha
    if (tipo === "sughist") { irPara("datas_portal"); S.dpSugAberta = true; render(); depois(() => $("#dpSugHist")?.scrollIntoView({ block: "start" })); return; }
    if (tipo === "ct") {
      S.ctFoco = id; S.ctDevolver = null; irPara("documentos"); render(); scrollTo(0, 0);
      depois(() => { const tr = $(`[data-ct-ver="${CSS.escape(id)}"]`)?.closest("tr"); if (tr) { tr.classList.add("foco"); tr.scrollIntoView({ block: "center" }); (tr.querySelector("[data-ct-conferir]") || tr.querySelector("button"))?.focus({ preventScroll: true }); } });
    } else if (tipo === "ctpre") {
      const [ev, conta] = id.split("|"); S.cPrep = null; S.cPre = { ev, conta: conta || "" }; irPara("documentos"); render();
      depois(() => { $("#contrAuto")?.scrollIntoView({ block: "start" }); ($("#ctConta")?.value ? $("#ctMod") : $("#ctConta"))?.focus({ preventScroll: true }); });
    } else if (tipo === "casa") { irPara("casas_cad"); render(); scrollTo(0, 0); fichaCasa(id); }
    else if (tipo === "insc") { irPara("curadoria"); render(); scrollTo(0, 0); fichaInscricao(id); }
    else if (tipo === "camp") { irPara("campanhas"); S.campAbertas = new Set([...(S.campAbertas || []), id]); render(); depois(() => $(`[data-camp="${CSS.escape(id)}"]`)?.scrollIntoView({ block: "start" })); }
    else if (tipo === "lp") { S.lpAberto = id; irPara("documentos"); render(); depois(() => $(`[data-lp-det="${CSS.escape(id)}"]`)?.scrollIntoView({ block: "start" })); }
    else if (tipo === "ev") abrirEvento(id);
    else if (tipo === "conv") { irPara("convites"); S.tblTodas = { ...(S.tblTodas || {}), conv: true }; render(); depois(() => { const tr = [...document.querySelectorAll('table[data-tbl="conv"] tbody tr')].find((x) => x.textContent.includes(id)); if (tr) { tr.classList.add("foco"); tr.scrollIntoView({ block: "center" }); abrirDetalhe(tr); } }); }
    else if (tipo === "dpnova") {
      // Nova data já preenchida: a casa, o dia livre com match e (se houver) o primeiro artista livre.
      const [cid, dia, art] = id.split("|"), c = (S.eq?.casas || []).find((x) => x.id === cid);
      irPara("datas_portal"); S.dpEd = null; S.dpPre = { casa_id: cid, dia: dia || "", cidade: c?.dados?.cidade_uf || c?.dados?.cidade || "", artistas: art ? [{ nome: art }] : [] }; render();
      depois(() => { $("#dpForm")?.scrollIntoView({ block: "start" }); (dia ? $("#dpCasa") : $("#dpDia"))?.focus({ preventScroll: true }); });
    }
    else if (tipo === "pp") {
      const x = (S.eq?.prop || []).find((y) => y.id === id), tp = x?.alvo_tipo || "artista";
      (S.ppAberto ||= {})[tp] = true; (S.ppMais ||= {})[tp + "e"] = true; irPara(tp === "casa" ? "casas_cad" : "curadoria"); render(); scrollTo(0, 0);
      depois(() => { const el = $(`[data-pp-id="${CSS.escape(id)}"]`); if (el) { el.classList.add("foco"); el.scrollIntoView({ block: "center" }); } });
    }
    else if (tipo === "dp") { irPara("datas_portal"); S.dpEd = id; S.dpPre = null; render(); depois(() => $("#dpForm")?.scrollIntoView({ block: "start" })); }
  }
  async function cliques(ev) {
    const t = ev.target;
    const ler = t.closest("[data-ler]"); if (ler) { ev.preventDefault(); abrirLeitor({ slug: ler.dataset.ler }); return; }
    const man = t.closest("[data-manual]"); if (man) { ev.preventDefault(); abrirLeitor({ manual: man.dataset.manual }); return; }
    if (t.closest("[data-ler-voltar]")) { fecharLeitor(); return; }
    const sb = t.closest("[data-sub]"); if (sb) { await salvarPendente(); const [a, k] = sb.dataset.sub.split("|"); (S.sub ||= {})[a] = k; S.aba = a; render(); scrollTo(0, 0); return; }
    const ab = t.closest("[data-abrir]"); if (ab) { ev.preventDefault(); abrirItem(ab.dataset.abrir); return; }
    // Modelo de cada papel: "como fazer" no Método, filtro do acompanhamento, atualizar e escalar um SOS para a adm.
    const ms = t.closest("[data-metodo-sec]"); if (ms) {
      ev.preventDefault(); const sec = ms.dataset.metodoSec; irPara("metodo"); render(); scrollTo(0, 0);
      setTimeout(() => { const h = [...document.querySelectorAll("#app h2, #app h3")].find((x) => x.textContent.trim() === sec); if (h) { h.classList.add("foco"); h.scrollIntoView({ block: "start" }); } }, 80); return;
    }
    const av = t.closest("[data-acomp-ver]"); if (av) { S.acompVer = av.dataset.acompVer; render(); return; }
    if (t.closest("[data-acomp-atualizar]")) { S.eq = null; S.hub = null; carregarEquipe(); carregarHub(); render(); return; }
    const sosB = t.closest("[data-sos-escalar]"); if (sosB) {
      const v = sosB.dataset.sosEscalar, i = v.indexOf("|");
      await acao(sosB, async () => { await api.marcar(v.slice(0, i), "sos:" + v.slice(i + 1), true); TQDiario.registrar("sos_escalado", { regra: v.slice(i + 1).split(":")[0] }); const y = scrollY; S.eq.chk = await api.checklistTodos(); render(); scrollTo(0, y); },
        { ok: "Escalado: a adm já vê no Acompanhamento.", espera: "Escalando…" });
      return;
    }
    const ir = t.closest("[data-ir]"); if (ir) { ev.preventDefault(); irPara(ir.dataset.ir); render(); scrollTo(0, 0); return; }
    if (await cliquesPropostas(t)) return;
    if (cliquesPreFichas(t)) return;
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
      const email = $("#email").value.trim(), senha = $("#esenha").value, err = $("#eerr"), criar = (S.entrada || "entrar") === "criar";
      if (criar ? barrar(err, [[$("#enome"), ($("#enome")?.value || "").trim().length < 2 && "escreva o seu nome"], [$("#email"), !email ? "escreva o seu e-mail" : !EMAIL_OK.test(email) && "esse e-mail parece incompleto. Confira se tem @ e o final (ex.: nome@gmail.com)"], [$("#esenha"), senha.length < 8 && `a senha precisa ter pelo menos 8 caracteres${senha.length ? ` (agora tem ${senha.length})` : ""}`]], "Não criou a conta")
        : barrar(err, [[$("#email"), !email && "escreva o seu e-mail"], [$("#esenha"), !senha && "escreva a sua senha"]], "Falta preencher")) return;
      diz(err, criar ? "Criando a conta…" : "Entrando…");
      try {
        if (criar) {
          const nome = $("#enome").value.trim();
          const r = await api.cadastrar({ email, senha, nome, tipo: S.tipoNovo || "artista" });
          if (r.confirmar) { diz(err, ""); $("#eok").outerHTML = `<div class="alert good"><b>Confira seu e-mail</b>Enviamos um link de confirmação para ${esc(email)}. Depois de confirmar, entre com e-mail e senha.</div>`; return; }
          return aposEntrar(r.perfil);
        }
        return aposEntrar(await api.entrar(email, senha));
      } catch (e) { diz(err, traduz(e.message || "")); }
      return;
    }
    if (t.id === "esqueci") {
      ev.preventDefault(); const email = $("#email").value.trim();
      if (!EMAIL_OK.test(email)) { marcar($("#email")); diz($("#eerr"), email ? "Esse e-mail parece incompleto. Confira se tem @ e o final (ex.: nome@gmail.com)." : "Escreva seu e-mail acima e clique de novo."); return; }
      diz($("#eerr"), "Enviando…");
      try { await api.recuperar(email); diz($("#eerr"), REAL ? "✓ Se existir conta com esse e-mail, o link para trocar a senha chega em até 2 minutos. Olhe também o spam." : "⚠ No modo demonstração não há envio de e-mail."); }
      catch (e) { diz($("#eerr"), traduz(e.message || "")); }
      return;
    }
    const irCampo = t.closest("[data-ir-campo]"); if (irCampo) { ev.preventDefault(); irParaCampo(irCampo.dataset.irCampo); return; }
    const parte = t.closest("[data-salvar-parte]");
    if (parte) {
      const det = parte.closest("details"), i = +parte.dataset.salvarParte, def = S.conta.perfil.tipo === "casa" ? F_CASA : F_ARTISTA, m = det.querySelector("[data-parte-msg]");
      const salvas = partesSalvas(); salvas.add(secoesDe(def)[i].titulo); store.set(chavePartes(), JSON.stringify([...salvas]));
      parte.disabled = true; diz(m, "Salvando…");
      const okSalvo = await salvarPendente(); parte.disabled = false;
      if (okSalvo === false) { diz(m, "Não salvou agora. O que você digitou está guardado neste aparelho; tente de novo."); return; }
      atualizarPartes();
      const completa = det.querySelector("[data-parte-n]").classList.contains("ok"), hora = new Date().toTimeString().slice(0, 5);
      if (!completa) {
        // Rascunho guardado, mas a parte não está completa: diz o que falta pelo nome e marca os campos em vermelho.
        const raiz = $("#form"), dv = dadosVistos(def, { ...(def === F_CASA ? S.conta.casa?.dados : S.conta.insc?.dados) || {}, ...lerForm(raiz) });
        const pend = pendenciasForm(def, dv).filter((x) => x.sec === i), frases = pend.map((x) => x.frase || x.txt);
        diz(m, `⚠ Rascunho salvo às ${hora}. Para completar esta parte: ${frases.join("; ")}.`);
        det.querySelectorAll(".campo-falta").forEach((el) => el.classList.remove("campo-falta"));
        marcar(pend.map((x) => campoVisivel(det, x.k)));
        return;
      }
      diz(m, `✓ Parte salva às ${hora}.`);
      // Completa: fecha esta parte e abre a próxima que ainda falta.
      const dets = [...$("#form").querySelectorAll("details[data-parte]")], prox = dets.slice(i + 1).concat(dets.slice(0, i)).find((x) => !x.querySelector("[data-parte-n]").classList.contains("ok"));
      det.open = false;
      if (prox) { prox.open = true; prox.scrollIntoView({ block: "start" }); }
      return;
    }
    if (t.id === "salvarVazios") {
      const casa = S.conta.perfil.tipo === "casa", atual = casa ? S.conta.casa : S.conta.insc, err = $("#ferr");
      const d = { ...(atual?.dados || {}), ...Object.fromEntries(Object.entries(lerForm($("#form"))).filter(([k, v]) => vazioV(atual?.dados?.[k]) && !vazioV(v))) };
      if (JSON.stringify(d) === JSON.stringify(atual?.dados || {})) return diz(err, "⚠ Você ainda não escreveu nada nos campos em branco. Preencha um deles e toque em \"Salvar os campos que estavam em branco\" de novo."), undefined;
      const erros = conferirFormato(d); if (erros.length) { marcarFormato($("#form"), erros); return diz(err, `✕ Não salvou. Corrija: ${erros.join("; ")}.`), undefined; }
      await acao(t, async () => {
        if (casa) S.conta.casa = await api.salvarCasa(d, { enviar: false, ja_parceira: atual.ja_parceira, notion_casa_id: atual.notion_casa_id });
        else S.conta.insc = await api.salvarInscricao(d, false);
        TQDiario.registrar("ficha_vazios", { casa }); render();
      }, { st: "#ferr", ok: "Salvo. O que você preencheu já chegou ao Tranquilo; não precisa fazer mais nada." });
      return;
    }
    if (t.id === "salvar" || t.id === "enviar") {
      const casa = S.conta.perfil.tipo === "casa";
      // Guarda também o que veio de versões anteriores da ficha e campos que saíram do formulário (nenhum dado some).
      const enviar = t.id === "enviar", raiz = $("#form"), def = casa ? F_CASA : F_ARTISTA, d = { ...((casa ? S.conta.casa : S.conta.insc)?.dados || {}), ...lerForm(raiz) }, err = $("#ferr");
      // Enviar exige todos os obrigatórios preenchidos e válidos (o botão fica desabilitado até lá). O rascunho salva sem eles.
      const pend = enviar ? pendenciasForm(def, dadosVistos(def, d)) : [];
      if (pend.length) {
        marcarFaltando(raiz, def, d); const fmt = pend.filter((x) => x.formato).map((x) => x.k); if (fmt.length) marcarFormato(raiz, { chaves: fmt });
        diz(err, `Não enviado: falta ${pend.map((x) => x.txt).join(", ").replace(/\.+$/, "")}. Os campos estão marcados em vermelho. O que você já digitou fica salvo como rascunho.`); return;
      }
      if (casa && document.querySelector('input[name="parceira"]:checked')?.value === "sim" && !$("#casaNotion")?.value && enviar) { marcar($("#casaNotion")); diz(err, "Não enviado: escolha a sua casa na lista (ou \"Minha casa não aparece na lista\")."); return; }
      // Enviar trava as respostas: pergunta na própria página antes, dizendo o que acontece.
      if (enviar && !confirmaAqui(t, casa ? "Enviar a Ficha ao Tranquilo agora?" : "Enviar a inscrição para a curadoria agora?",
        casa ? "O Gui (Operações) confere e habilita a casa. Depois de enviada, campo em branco você ainda preenche; o que já respondeu só muda por pedido."
          : "A pré-curadoria sai na hora e a equipe avalia. Depois de enviada, o que você respondeu só muda se a curadoria pedir ajustes.", "Sim, enviar")) return;
      clearTimeout(S.tauto); S.tauto = null;
      const r = await acao(t, async () => {
        if (casa) {
          const parceira = document.querySelector('input[name="parceira"]:checked')?.value === "sim";
          S.conta.casa = await api.salvarCasa(d, { enviar, ja_parceira: parceira, notion_casa_id: parceira ? $("#casaNotion")?.value : null });
        } else S.conta.insc = await api.salvarInscricao(d, enviar);
      }, { st: "#ferr", espera: enviar ? "Enviando…" : "Salvando…", ok: enviar ? "Enviado." : "Rascunho salvo. Ainda não foi para o Tranquilo: volte quando quiser para continuar e enviar." });
      if (r.ok) limparLocal(enviar ? null : d);
      if (r.ok && !enviar) {
        // Rascunho guardado, mas sem enganar: se ainda falta algo para enviar, o aviso fica amarelo e diz o quê.
        const falta = pendenciasForm(def, dadosVistos(def, d));
        if (falta.length) diz($("#ferr"), `⚠ Rascunho salvo. Para enviar, ainda falta${falta.length > 1 ? "m" : ""} ${falta.length} ${falta.length > 1 ? "itens" : "item"}: ${falta.map((x) => x.txt).join("; ").replace(/\.+$/, "")}.`);
      }
      if (!r.ok || !enviar) return;
      if (casa && S.conta.casa?.status === "incompleto") { render(); const f = R.pendenciasCasa(d).habilitacao; const e2 = $("#ferr"); if (e2) { diz(e2, `⚠ A Ficha foi salva, mas ainda não foi para análise. Falta preencher: ${f.join(", ")}.`); e2.scrollIntoView({ block: "center" }); } }
      else { irPara(casa ? "cadastro_casa" : "passos"); render(); scrollTo(0, 0); avisoGeral(casa ? "✓ Ficha enviada ao Tranquilo. Próximo passo: o Gui (Operações) confere e responde aqui na Ficha; a equipe da casa e a disponibilidade liberam assim que a casa for habilitada." : "✓ Inscrição enviada. Próximo passo: veja a pré-curadoria em Próximos passos; a resposta da equipe também aparece lá."); }
      return;
    }
    if (t.id === "vok") {
      const cod = $("#vcod").value, err = $("#verr");
      if (normCod(cod).length < 12) { marcar($("#vcod")); diz(err, "Não vinculou: cole o código completo, no formato XXXX-XXXX-XXXX."); return; }
      diz(err, "Conferindo…");
      try {
        const pac = await abrirPacote(cod);
        if (pac.perfil !== S.conta.perfil.tipo) { diz(err, `Este código é de ${PERFIS[pac.perfil].rotulo.toLowerCase()}, e a conta é de ${ROTULO[S.conta.perfil.tipo].toLowerCase()}.`); return; }
        await api.vincularCodigo(normCod(cod).replace(/(.{4})(.{4})(.{4})/, "$1-$2-$3"), pac.nome);
        return recarregar();
      } catch (e) { diz(err, traduz(e.message || "")); }
      return;
    }
    if (t.id === "sairConta") { await sairDeTudo(); return; }
    const reg = t.closest("[data-registrar]"); if (reg) return fichaRegistro(reg.dataset.registrar);
    if (t.id === "rsalvar") {
      const eventoId = $("#dlg").dataset.alvo.slice(4), pub = inteiroBR($("#rpub").value);
      const occ = $("#rocc").value.trim(), grave = $("#rgrav").value === "excecao";
      if (barrar($("#derr"), [[$("#rpub"), pub !== "" && (+pub < 0 || +pub > 20000) ? "confira o público: um número entre 0 e 20.000 pessoas" : pub === "" && !occ && "escreva o público presente (ou conte a ocorrência)"],
        [$("#rocc"), grave && occ.length < 10 && "exceção crítica: conte em Ocorrência o que aconteceu (pelo menos 10 caracteres)"]])) return;
      await acao(t, async () => {
        await api.registrar(eventoId, { publico: pub === "" ? null : +pub, ocorrencia: occ || null, gravidade: $("#rgrav").value, como_resolveu: $("#rres").value.trim() || null });
        S.conta.reg = await api.meusRegistros();
        const chk = S.conta.chk; if (!chk.some((c) => c.evento_id === eventoId && c.item === "publico")) { await api.marcar(eventoId, "publico", true); S.conta.chk = await lerChecklist(); }
        $("#dlg").close(); render();
      }, { st: "#derr", ok: "Noite registrada." });
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
      const err = $("#camperr"); diz(err, "");
      const casa = $("#cfCasa").value.trim(), slug = slugDe($("#cfSlug").value), titulo = $("#cfTit").value.trim() || "Campanha", fonte = $("#cfFonte").value.trim();
      if (barrar(err, [[$("#cfCasa"), casa.length < 2 && "escreva o nome da casa exatamente como no convite (é assim que a casa passa a ver a campanha)"],
        [$("#cfSlug"), slug.length < 3 && "dê um identificador curto, com pelo menos 3 letras ou números (ex.: rooftap-nov26)"],
        [$("#cfFonte"), fonte && !/^https:\/\/\S+\.\S+/i.test(fonte) && "o link da página precisa ser um endereço completo, começando com https://"]], "Não carregou")) return;
      const kc = TQCampanha.chaveCasa(casa), E = S.eq || {};
      const semConta = !(E.conv || []).some((c) => c.tipo === "casa" && TQCampanha.chaveCasa(c.vinculo_nome) === kc) && !(E.perfis || []).some((p) => p.tipo === "casa" && TQCampanha.chaveCasa(p.vinculo_nome) === kc)
        && !(E.casas || []).some((c) => TQCampanha.chaveCasa(c.dados?.nome) === kc);
      if (semConta && !confirm(`Nenhuma conta de casa está ligada a "${casa}" (nem por convite, nem pela Ficha). A campanha fica carregada, mas ninguém da casa vê até a conta ser ligada a uma casa com esse nome. Continuar?`)) return;
      const d = { slug, titulo, casa, fonte_url: fonte || null, itens: S.campPrevia.itens.map(({ chave, dia, rotulo, acoes }) => ({ chave, dia, rotulo, acoes })) };
      const cie = $("#cfCie").checked;
      await acao(t.closest("[data-camp-importar]"), async () => {
        await api.importarCampanha(d);
        if (cie) await pedirCienciaCampanha(d);
        TQDiario.registrar("campanha_importada", { dias: d.itens.length });
        S.campPrevia = null; S.campAberto = true; S.hub = null; await carregarHub();
      }, { st: "#camperr", espera: "Carregando a campanha…", ok: `Campanha de ${casa} carregada: ${d.itens.length} dias.${cie ? " A casa vai ver o pedido de confirmação de leitura em Materiais." : ""}` });
      return;
    }
    if (t.closest("[data-mat-versao], [data-mat-novo]")) {
      const err = $("#materr"); diz(err, ""); S.matAberto = true;
      const LINK = /^https:\/\/\S+\.\S+/i, botao = t.closest("[data-mat-versao], [data-mat-novo]");
      let salvar, ok;
      if (t.closest("[data-mat-versao]")) {
        const versao = $("#mvVer").value.trim(), u = $("#mvUrl").value.trim();
        if (barrar(err, [[$("#mvVer"), !versao && "dê um nome à versão (ex.: 2)"], [$("#mvUrl"), u && !LINK.test(u) && "o link precisa ser um endereço completo, começando com https://"]], "Não publicou")) return;
        const pede = $("#mvCie").checked;
        if (!confirmaAqui(botao, pede ? "Publicar e pedir que todos confirmem a leitura de novo?" : "Publicar esta versão sem pedir nova confirmação?", pede ? "Todas as artistas e casas veem o aviso \"Leia e confirme\" até confirmarem." : "A versão nova aparece para todos, sem aviso de leitura.", "Sim, publicar")) return;
        const dados = { material_id: $("#mvMat").value, versao, resumo: $("#mvRes").value.trim() || null, url: u || null, exige_ciencia: pede };
        salvar = () => api.publicarVersao(dados); ok = `Versão ${versao} publicada.${pede ? " Todos vão confirmar a leitura de novo." : ""}`;
      } else {
        const titulo = $("#mnTit").value.trim(), u = $("#mnUrl").value.trim(), publico = [$("#mnCasa").checked && "casa", $("#mnArt").checked && "artista"].filter(Boolean);
        if (barrar(err, [[$("#mnTit"), titulo.length < 3 && "escreva o título do material (pelo menos 3 letras)"], [$("#mnUrl"), !LINK.test(u) && "cole o link completo do material, começando com https://"],
          [$("#mnCasa"), !publico.length && "escolha quem vê: casas, artistas ou os dois"]], "Não cadastrou")) return;
        const ref = $("#mnRef").value.trim();
        const slug = (titulo + (ref ? "-" + ref : "")).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
        const m = { slug, titulo, tipo_material: $("#mnTipo").value, publico, fonte_url: u, casa_ref: ref || null, fonte_tipo: "link" }, v = { versao: "1", resumo: "Primeira versão", exige_ciencia: $("#mnCie").checked };
        salvar = () => api.novoMaterial(m, v); ok = `Material "${titulo}" cadastrado.`;
      }
      await acao(botao, async () => { await salvar(); TQDiario.registrar("material_publicado", {}); S.hub = null; await carregarHub(); },
        { st: "#materr", espera: "Publicando…", ok, erro: (e) => /duplicate|unique|já foi salvo/i.test(e.message) ? "Já existe uma versão (ou um material) com esse nome. Use outro." : traduz(e.message || "") });
      return;
    }
    const cie = t.closest("[data-ciencia]"); if (cie) {
      if (!confirmaAqui(cie, "Confirmar que você leu esta versão do material?", "A confirmação fica registrada com data e hora e a equipe do Tranquilo vê.", "Sim, li")) return;
      await acao(cie, async () => { await api.darCiencia(cie.dataset.ciencia); TQDiario.registrar("ciencia", { versao: cie.dataset.ciencia }); const y = scrollY; S.hub = null; await carregarHub(); scrollTo(0, y); },
        { espera: "Registrando…", ok: "Leitura confirmada, com data e hora." });
      return;
    }
    const arq = t.closest("[data-arquivo]"); if (arq) {
      ev.preventDefault();
      const url = await api.linkArquivo(arq.dataset.arquivo);
      if (url) window.open(url, "_blank", "noopener"); else alert("✕ Erro: não foi possível abrir o arquivo agora. Tente de novo em instantes.");
      return;
    }
    if (await cliquesContrato(t)) return;
    const vc = t.closest("[data-vinculo-confirmar], [data-vinculo-recusar]"); if (vc) {
      const pid = vc.dataset.vinculoConfirmar || vc.dataset.vinculoRecusar, p = (S.eq?.perfis || []).find((x) => x.id === pid); if (!p) return;
      const a = vc.dataset.vinculoConfirmar && (S.pac?.acessos || []).find((x) => x.codigo === p.vinculo_pedido && x.tipo === p.tipo);
      await acao(vc, async () => { await api.atualizarPerfil(pid, a ? { codigo_acesso: a.codigo, vinculo_nome: a.nome, vinculo_pedido: null, vinculo_pedido_nome: null } : { vinculo_pedido: null, vinculo_pedido_nome: null }); S.eq = null; render(); },
        { ok: a ? `Vínculo com ${a.nome} confirmado.` : "Pedido de vínculo recusado." });
      return;
    }
    const docDel = t.closest("[data-apagar-doc]"); if (docDel) {
      if (!confirmaAqui(docDel, "Remover este documento?", "A pessoa deixa de ver o link.", "Sim, remover")) return;
      await acao(docDel, async () => { await api.apagarDocumento(docDel.dataset.apagarDoc); S.eq = null; render(); }, { espera: "Removendo…", ok: "Documento removido. A pessoa não vê mais o link." });
      return;
    }
    if (t.id === "docOk") {
      const err = $("#docErr"), url = $("#docUrl").value.trim(), titulo = $("#docTit").value.trim(), tipo = $("#docTipo").value;
      const [user_id, evento_id] = [$("#docConta").value || null, $("#docEv").value || null];
      if (barrar(err, [[$("#docUrl"), !/^https:\/\/\S+\.\S+/i.test(url) && "cole o link completo, começando com https:// (Drive, Dropbox, DocuSign…)"], [$("#docTit"), titulo.length < 2 && "dê um nome curto ao documento"],
        [$("#docConta"), tipo === "contrato" && !user_id && "contrato precisa da conta"], [$("#docEv"), tipo === "contrato" && !evento_id && "contrato precisa da data"]], "Não anexou")) return;
      await acao(t, async () => { await api.criarDocumento({ tipo, titulo, url, user_id: tipo === "modelo" ? null : user_id, evento_id: tipo === "modelo" ? null : evento_id }); S.eq = null; render(); },
        { st: "#docErr", ok: `Documento "${titulo}" anexado.` });
      return;
    }
    const dec = t.closest("[data-decisao]"); if (dec) {
      const [tipo, id] = $("#dlg").dataset.alvo.split(":"), status = dec.dataset.decisao;
      const campos = { parecer: $("#parecer").value.trim() || null, nota_interna: $("#nota").value.trim() || null };
      if (status) campos.status = status;
      if (tipo === "casa") campos.classificacao = $("#classe").value || null;
      if (status === "ajustes" && (campos.parecer || "").length < 10) { marcar($("#parecer")); diz($("#derr"), "Não enviou: escreva na mensagem o que precisa ser ajustado (pelo menos 10 caracteres). É o que a pessoa vai ler."); return; }
      // Habilitar só com a Ficha mínima completa (o banco confere de novo, v19).
      if (tipo === "casa" && status === "habilitada") { const c = (S.eq?.casas || []).find((x) => x.id === id), f = R.pendenciasCasa(c?.dados || {}).habilitacao;
        if (f.length) { diz($("#derr"), `Não dá para habilitar: falta preencher na Ficha ${f.join(", ")}. Peça ajustes à casa com a lista do que falta.`); return; } }
      // Encerrar uma inscrição é a resposta mais delicada para a artista: exige mensagem e confirmação.
      if (status === "reprovada" && (campos.parecer || "").length < 10) { marcar($("#parecer")); diz($("#derr"), "Não enviou: escreva uma mensagem para a artista explicando que, por agora, não vai seguir (pelo menos 10 caracteres)."); return; }
      if (status === "reprovada" && !confirmaAqui(dec, "Encerrar esta inscrição?", "A artista recebe a sua mensagem e a inscrição sai da fila.", "Sim, encerrar")) return;
      if (status === "encerrada" && (campos.parecer || "").length < 10) { marcar($("#parecer")); diz($("#derr"), "Não encerrou: escreva na mensagem o motivo do encerramento (pelo menos 10 caracteres). É o que a pessoa vai ler."); return; }
      if (status === "encerrada" && !confirmaAqui(dec, tipo === "casa" ? "Encerrar a parceria com esta casa?" : "Encerrar a participação desta artista?", tipo === "casa"
        ? "A equipe da casa perde o acesso, o dono vê só a sua mensagem e a Ficha. Nada é apagado. As datas futuras precisam ser canceladas no Notion."
        : "Ela perde o acesso às datas e vê a sua mensagem. Nada é apagado. As datas futuras precisam ser canceladas no Notion (Line-up).", "Sim, encerrar")) return;
      const OK = { aprovada: "Inscrição aprovada.", habilitada: "Casa habilitada.", ajustes: "Pedido de ajustes enviado. A pessoa vê a sua mensagem.", reprovada: "Inscrição encerrada. A artista vê a sua mensagem.", encerrada: "Encerrado. A pessoa vê a sua mensagem." };
      await acao(dec, async () => {
        if (tipo === "insc") await api.avaliarInscricao(id, campos); else await api.avaliarCasa(id, campos);
        const v = $("#dlg").querySelector("[data-vinculo]");
        if (v) { const [codigo, nome] = v.value ? v.value.split("|") : [null, null]; const p = (S.eq.perfis || []).find((x) => x.id === v.dataset.vinculo); if (p && p.codigo_acesso !== codigo) await api.atualizarPerfil(p.id, { codigo_acesso: codigo, vinculo_nome: nome }); }
        $("#dlg").close(); S.eq = null; render();
      }, { st: "#derr", ok: OK[status] || "Avaliação salva." });
      return;
    }
    if (t.closest("[data-copiar-ficha]")) {
      const i = S.eq.insc.find((x) => "insc:" + x.id === $("#dlg").dataset.alvo), d = i.dados;
      const txt = [`Nome artístico: ${d.nome_artistico}`, `Cidade: ${d.cidade_base}/${d.estado}`, `Gêneros: ${d.generos}`, `Instagram: ${d.instagram}`, `Spotify: ${d.spotify}`, `Contato: ${d.whatsapp} ${d.contato_producao || ""}`, `Rider: ${d.rider_tipo} ${d.rider_link || ""}`, `Cidades: ${(d.cidades_interesse || []).join(", ")}`, `Pré-curadoria: ${i.score}/100 (${i.faixa})`, `Mini release: ${d.release}`].join("\n");
      navigator.clipboard?.writeText(txt); t.textContent = "✓ Copiada"; return;
    }
    // ---------- primeiro acesso, convites e avisos ----------
    if (t.closest("[data-mudar-senha]")) { pedirSenha(true); return; }
    if (t.closest("[data-rever-tutorial]")) { abrirTutorial(roteiroConta(), false); return; }
    if (t.id === "nsdepois" || t.closest?.("[data-ns-fechar]")) {
      const naTela = !!t.closest?.(".tela-senha");
      if (naTela) { S.senhaDepois = true; try { sessionStorage.setItem("tq-senha-depois", "1"); } catch { /* só nesta página */ } render(); scrollTo(0, 0); primeiroAcesso(); }
      else { $("#dlg").close(); if (!$("#dlg").dataset.trocar) { S.senhaDepois = true; primeiroAcesso(); } }
      return;
    }
    if (t.id === "nsok") {
      const a = $("#ns1").value, b = $("#ns2").value, err = $("#nserr");
      if (barrar(err, [[$("#ns1"), a.length < 8 && `use pelo menos 8 caracteres${a.length ? ` (agora tem ${a.length})` : ""}`], [$("#ns2"), a.length >= 8 && a !== b && "as duas senhas não são iguais. Escreva a mesma senha nos dois campos"]])) return;
      const naTela = !!t.closest(".tela-senha");
      const r = await acao(t, async () => { await api.definirSenha(a); Object.assign(S.conta.perfil, { senha_definida: true, senha_portal: true }); try { sessionStorage.removeItem("tq-veio-link"); } catch { /* segue */ } }, { st: "#nserr", ok: "senha salva. Das próximas vezes, entre com o seu e-mail e essa senha." });
      if (r.ok) setTimeout(() => { if (naTela) { render(); scrollTo(0, 0); } else $("#dlg").close(); primeiroAcesso(); }, 1200);
      return;
    }
    if (t.id === "cvOk") {
      const err = $("#cverr"), email = $("#cvEmail").value.trim().toLowerCase(), nome = $("#cvNome").value.trim();
      const wa = $("#cvWa").value.trim();
      if (barrar(err, [[$("#cvEmail"), !VAL.email(email) && (email ? "esse e-mail não parece válido. Confira se está escrito certo (ex.: nome@gmail.com)" : "escreva o e-mail da pessoa")],
        [$("#cvWa"), wa && !VAL.tel(wa) && "WhatsApp: número com DDD (ex.: 11 99999-9999)"]], "Não enviou")) return;
      const [codigo_acesso, vinculo_nome] = ($("#cvVinc")?.value || "").split("|");
      const areas = (S.convTipo === "equipe") ? [...document.querySelectorAll("[data-cv-area]:checked")].map((x) => x.value) : [];
      const c = { email, tipo: t.dataset.tipo || S.convTipo || "artista", nome: nome || vinculo_nome || "", whatsapp: $("#cvWa").value.trim() || null, codigo_acesso: codigo_acesso || null, vinculo_nome: vinculo_nome || null, areas: areas.length ? areas : null };
      const res = await acao(t, async () => { const r = await api.convidar(c); S.convPre = null; S.convRasc = null; S.eq = null; render(); return r; },
        { st: "#cverr", espera: "Enviando…", ok: `Convite para ${c.nome || c.email} criado. Próximo passo: mande também a mensagem pelo WhatsApp, na janela que abriu.` });
      if (res.ok) dialogoResultado({ oque: "Convite", nome: c.nome, email: c.email, whatsapp: c.whatsapp, texto: mensagemConvite(c), assunto: "Seu acesso à Rede Tranquilo", resultado: res.r, recebe: RECEBE.convite, reenviar: () => api.convidar(c) });
      return;
    }
    const rc = t.closest("[data-reconvidar]"); if (rc) {
      const c = (S.eq?.conv || []).find((x) => x.email === rc.dataset.reconvidar); if (!c) return;
      const res = await acao(rc, async () => { const r = await api.convidar(c); S.eq = null; render(); return r; }, { espera: "Enviando…", ok: `Acesso de ${c.nome || c.email} enviado.` });
      if (res.ok) dialogoResultado({ oque: c.aceito_em ? "Link de entrada" : "Convite", nome: c.nome, email: c.email, whatsapp: c.whatsapp, texto: mensagemConvite(c), assunto: "Seu acesso à Rede Tranquilo", resultado: res.r,
        recebe: c.aceito_em ? "Um e-mail com o link para entrar direto na conta. O link abre uma vez só; se a pessoa ainda não criou a senha, a primeira tela pede para criar." : RECEBE.convite, reenviar: () => api.convidar(c) });
      return;
    }
    const cc = t.closest("[data-cancelar-convite]"); if (cc) {
      if (!confirmaAqui(cc, `Cancelar o convite de ${cc.dataset.cancelarConvite}?`, "O link do e-mail deixa de funcionar. Dá para convidar de novo depois.", "Sim, cancelar o convite")) return;
      await acao(cc, async () => { await api.cancelarConvite(cc.dataset.cancelarConvite); S.eq = null; render(); }, { espera: "Cancelando…", ok: "Convite cancelado." });
      return;
    }
    const et = t.closest("[data-enviar-tutorial]"); if (et) { const [tipo, email, nome, wa] = et.dataset.enviarTutorial.split("|"); enviarTutorial(tipo, nome, email, wa); return; }
    const ls = t.closest("[data-link-senha]"); if (ls) {
      const email = ls.dataset.linkSenha, p = (S.eq?.perfis || []).find((x) => x.email === email) || {};
      const res = await acao(ls, () => api.enviarLinkSenha(email), { espera: "Enviando…", ok: (r) => r.enviado ? "Link de senha enviado por e-mail." : r.demo ? "Link de senha pronto (modo demonstração)." : "pedido registrado, mas o e-mail não saiu: veja as opções na janela." });
      if (res.ok) dialogoResultado({ oque: "Link de senha", nome: p.nome, email, whatsapp: p.whatsapp, assunto: "Crie a sua senha na Rede Tranquilo", resultado: res.r, recebe: RECEBE.senha, reenviar: () => api.enviarLinkSenha(email),
        texto: `Oi${p.nome ? ", " + p.nome : ""}! Mandei para ${email} um link para você criar a sua senha da Rede Tranquilo. Toque no link, escolha a senha e pronto: das próximas vezes, entre com o seu e-mail e essa senha em ${site()}\n\nSe o e-mail não aparecer, olhe também no spam ou na aba Promoções.` });
      return;
    }
    if (t.id === "envReenviar" && S.envioRes?.reenviar) {
      const o = S.envioRes;
      const res = await acao(t, () => o.reenviar(), { st: "#envSt", espera: "Reenviando…", ok: (r) => r.enviado ? "e-mail reenviado." : r.demo ? "modo demonstração: nenhum e-mail sai." : "tentativa feita, mas o e-mail não saiu." });
      if (res.ok && $("#dlg").open && S.envioRes === o) dialogoResultado({ ...o, resultado: res.r, nota: res.r.enviado ? `Reenviado às ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}. Vale o e-mail mais recente.` : o.nota });
      return;
    }
    if (t.closest("[data-envio]")) { try { S.aoEnviar?.(); } catch { /* registro opcional */ } return; }
    if (t.closest("[data-copiar-envio]")) { navigator.clipboard?.writeText($("#envTxt").value).then(() => { t.textContent = "✓ Copiada"; }); return; }
    if (t.id === "avOk") { await avisarCidade(); return; }
    const cl = t.closest("[data-click]");
    // Campanhas (equipe): marcar como feito pela casa, ajustar o dia, desfazer.
    const cpForm = t.closest("[data-camp-pela-casa], [data-camp-ajustar]");
    if (cpForm) { const pela = cpForm.dataset.campPelaCasa; S.campForm = { id: pela || cpForm.dataset.campAjustar, tipo: pela ? "pela" : "ajustar" }; render(); setTimeout(() => $(`[data-camp-dia="${CSS.escape(S.campForm.id)}"]`)?.querySelector("input, textarea")?.focus(), 30); return; }
    if (t.closest("[data-camp-form-x]")) { S.campForm = null; render(); return; }
    const cpOk = t.closest("[data-camp-pela-ok], [data-camp-ajustar-ok], [data-camp-desfazer]");
    if (cpOk) {
      const idP = cpOk.dataset.campPelaOk, idA = cpOk.dataset.campAjustarOk, idD = cpOk.dataset.campDesfazer, it = S.hub?.itens?.find((x) => x.id === (idP || idA || idD)); if (!it) return;
      let fn, okMsg;
      if (idP) {
        const quem = $("#cpQuem").value.trim(), quando = $("#cpQuando").value || hojeSP(), eu = S.conta.perfil.nome || "equipe do Tranquilo";
        if (quando > hojeSP()) return diz($("#cperr"), "A data não pode ser no futuro.");
        const nota = `Feito pela casa${quem ? ` (${quem})` : ""} em ${dt(quando).slice(0, 5)}; anotado por ${eu}`;
        fn = () => api.marcarCampanha(it.id, true, nota); okMsg = "Marcado como feito pela casa. A casa vê o feito com a anotação.";
      } else if (idA) {
        const dia = $("#cpDia").value; if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return diz($("#cperr"), "Escolha o dia.");
        const textos = [...document.querySelectorAll("[data-cp-texto]")].map((x) => x.value.trim());
        const acoes = (it.acoes || []).map((a, j) => ({ ...a, texto: textos[j] ?? a.texto }));
        fn = () => api.ajustarDiaCampanha(it.id, { dia, rotulo: TQCampanha.rotuloDe(dia), acoes }); okMsg = "Dia ajustado. A casa já vê assim.";
      } else {
        if (!confirm("Desfazer o \"feito\" deste dia? A casa volta a ver o dia como pendente.")) return;
        fn = () => api.marcarCampanha(it.id, false); okMsg = "Desfeito: o dia voltou a ficar pendente.";
      }
      await acao(cpOk, async () => { await fn(); TQDiario.registrar(idA ? "campanha_ajustada" : "campanha_feito", { item: it.id, feito: !idD, pela_equipe: true }); const y = scrollY; S.campForm = null; S.hub = null; await carregarHub(); scrollTo(0, y); }, { ok: okMsg });
      return;
    }
    if (cl && /^(insc|casacad):/.test(cl.dataset.click)) { ev.stopImmediatePropagation(); const [k, id] = cl.dataset.click.split(":"); return k === "insc" ? fichaInscricao(id) : fichaCasa(id); }
  }
  // Um clique por vez: enquanto a ação de um botão não termina, novos cliques nele são ignorados
  // (evita conta, inscrição, convite ou registro em dobro). Antes de o banco responder, nada é enviado.
  document.addEventListener("click", async (ev) => {
    const conf = ev.target.closest?.("[data-conf-sim], [data-conf-nao]");
    if (conf) { ev.preventDefault(); ev.stopImmediatePropagation(); respostaConfirma(conf); return; }
    // Bloco recolhível: guarda na hora o que a pessoa abriu ou fechou (o evento "toggle" chega depois de um redesenho rápido).
    const sumDobra = ev.target.closest?.("summary"), detDobra = sumDobra?.parentElement;
    if (detDobra?.matches?.("details[data-dobra]") && detDobra.firstElementChild === sumDobra && !ev.target.closest("button, a, input, select")) S.dobras = { ...(S.dobras || {}), [detDobra.dataset.dobra]: !detDobra.open };
    const b = ev.target.closest("button, a[data-demo]");
    if (b?.dataset.ocupado) { ev.preventDefault(); ev.stopImmediatePropagation(); return; }
    if (!api && ev.target.closest("#eok, #esqueci, [data-demo], #avOk, #salvar, #enviar")) {
      ev.preventDefault(); ev.stopImmediatePropagation();
      const e = $("#eerr") || $("#averr") || $("#ferr"); if (e) diz(e, "⚠ Ainda conectando ao servidor. Espere alguns segundos e clique de novo.");
      return;
    }
    if (b) b.dataset.ocupado = "1";
    try { await cliques(ev); }
    catch (e) { console.error(e); const m = $("#ctErr") || $("#mcErr") || $("#eerr") || $("#ferr") || $("#derr") || $("#averr"); if (m) diz(m, traduz(e.message || "")); }
    finally { if (b) delete b.dataset.ocupado; }
  }, true);

  document.addEventListener("change", async (ev) => {
    if (ev.target.matches?.("[data-dp-todas]")) { S.dpVerTodas = ev.target.checked; render(); return; }
    if (ev.target.matches?.("[data-gf]")) { (S.gf ||= {})[ev.target.dataset.gf] = ev.target.value; render(); return; }
    if (ev.target.matches?.("[data-hist-f]")) { S.histF = ev.target.value; render(); $("[data-hist-f]")?.focus(); return; }
    if (ev.target.id === "excDia") {
      const alvo = S.excAberto, dia = ev.target.value, c = alvo && contextoDisp(alvo); if (!c) return;
      const livre = dia && livreNo(situacaoDia(c.linhas.find((x) => x.dia === dia), c.sem, dia));
      const r = dia && document.querySelector(`input[name="excTipo"][value="${livre ? "bloquear" : "liberar"}"]`); if (r) r.checked = true;
      const dica = $("#excDica"); if (dica) dica.textContent = dicaExc(alvo, dia); return;
    }
    if (ev.target.matches?.("[data-sem]")) {
      const alvo = ev.target.dataset.sem, cid = ev.target.dataset.cid ?? null, err = $("#semErr");
      const dias = [...document.querySelectorAll(`[data-sem="${alvo}"]:checked`)].filter((x) => cid === null || (x.dataset.cid ?? "") === cid).map((x) => Number(x.value));
      const caixa = ev.target, marcada = caixa.checked;
      const r = await acao(caixa, async () => { await api.salvarSemanal(alvo, dias, cid || null); S.sem = await api.semanal().catch(() => S.sem); render(); },
        { st: err, ok: dias.length ? `${cid ? cid + ": " : ""}toda semana: ${[...dias].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((n) => NOME_SEM[n]).join(", ")}. Já aparece para a Isa.` : "Sem dias fixos. Valem só os dias marcados no calendário." });
      if (!r.ok && caixa.isConnected) caixa.checked = !marcada;
      return;
    }
    // Trocar o formato ajusta o line-up ao padrão dele (se ninguém mexeu nas linhas) e mostra a regra.
    if (ev.target.id === "dpProd") { S.dpPre = lerFormDp(); if (!S.dpEd && !S.dpPre.artistas.some((a) => a.nome)) S.dpN = null; render(); return; }
    if (ev.target.id === "dpDia" || ev.target.matches?.("[data-dp-exc]")) { S.dpPre = lerFormDp(); if (ev.target.matches("[data-dp-exc]")) { S.dpExc = ev.target.checked; if (!S.dpExc) S.dpExcAuto = null; } render(); return; }
    // Criar datas: "▸ Não marcaram este dia" abre o grupo recolhido; escolher alguém de lá (ou casa fora) liga a Exceção, com aviso.
    if (ev.target.matches?.("select[data-dp-art]") || ev.target.id === "dpCasa") {
      const x = ev.target, casa = x.id === "dpCasa", opc = x.selectedOptions?.[0];
      if (x.value === "__outros" || x.value === "__outrasC") { S.dpPre = lerFormDp(); if (casa) S.dpOutrasC = true; else S.dpOutros = true; render(); setTimeout(() => (casa ? $("#dpCasa") : $(`[data-dp-art="${x.dataset.dpArt}"]`))?.focus(), 30); return; }
      if (casa) { const c = (S.eq?.casas || []).find((y) => y.id === x.value), ci = $("#dpCidade"), ant = (S.eq?.casas || []).find((y) => y.id === x.dataset.valor);
        const cidDe = (y) => y?.dados?.cidade_uf || y?.dados?.cidade || ""; if (c && ci && (!valorCidade(ci) || valorCidade(ci) === cidDe(ant) || !ci.value)) definirCidade(ci, cidDe(c)); }
      S.dpPre = lerFormDp();
      if (opc?.dataset.fora) { S.dpExc = true; S.dpExcAuto = [...(S.dpExcAuto || []).filter((y) => y.nome !== opc.value && y.nome !== opc.textContent.split(" · ")[0]), { nome: casa ? opc.textContent.split(" · ")[0] : opc.value, motivo: opc.dataset.fora }]; }
      render(); return;
    }
    // Modelo do "Preparar contratos do line-up".
    if (ev.target.matches?.("[data-lp-mod]")) { lerLpVal(); (S.lpMod ||= {})[ev.target.dataset.lpMod] = ev.target.value; render(); return; }
    if (ev.target.matches?.("[data-dpb-troca]")) { const x = ev.target, i = x.dataset.dpbTroca.lastIndexOf("|"), key = x.dataset.dpbTroca.slice(0, i);
      guardaDp();
      (S.dpbSel ||= {})[key] = [...document.querySelectorAll(`[data-dpb-card="${CSS.escape(key)}"] [data-dpb-troca]`)].map((el) => el.value); S.dpbConf = null; render(); return; }
    if (ev.target.matches?.("[data-dpb-tur-art], [data-dpb-tur], [data-dpb-tur-ab]")) { const x = ev.target; guardaDp();
      if (x.matches("[data-dpb-tur-art]")) S.dpbTur = { art: x.value };
      else { const T = S.dpbTur ||= {}; T.conf = false; if (x.dataset.dpbTur !== undefined) { (T.sel ||= {})[x.dataset.dpbTur] = x.value; } else (T.ab ||= {})[x.dataset.dpbTurAb] = x.value; }
      render(); return; }
    if (ev.target.matches?.("[data-dpb]")) { const x = ev.target, b = S.dpb ||= {}; guardaDp(); b[x.dataset.dpb] = x.type === "checkbox" ? x.checked : x.value.trim(); b.lim = 12; render(); return; }
    if (ev.target.id === "dpArq" && ev.target.files?.length) { const fs = ev.target.files; await publicarDocsPagina(fs); return; }
    const t = ev.target;
    if (t.dataset?.pf) { (S.pf ||= {})[t.dataset.pf] = t.value; render(); return; }
    if (t.hasAttribute?.("data-ag-casa")) { S.agCasa = t.value; render(); return; }
    if (t.id === "cfArq" && t.files?.[0]) {
      const arq = t.files[0]; S.campAberto = true;
      try {
        if (arq.size > 3e6) throw new Error("Arquivo grande demais para uma campanha (mais de 3 MB). Confira se é o arquivo certo.");
        // Documento do Bruno (semana do social media, briefings…) não é campanha de casa: vai em Materiais › Publicar documentos.
        const doc = DOCS[arq.name.replace(/\.html?$/i, "").toLowerCase()];
        if (doc) throw new Error(`"${arq.name}" é o documento "${doc.titulo}", não a campanha de uma casa. Documentos se publicam em Materiais › "Publicar documentos para abrir na página". Aqui entra a página da campanha de cada casa (a do Rooftap, por exemplo).`);
        const r = TQCampanha.ler(await arq.text(), { ano: new Date().getFullYear() });
        const anterior = S.hub?.campanhas?.find((c) => r.casa && TQCampanha.chaveCasa(c.casa_ref) === TQCampanha.chaveCasa(r.casa));
        const slug = r.slug || anterior?.slug || slugDe(`${r.casa || "casa"}-${r.itens[0].dia.slice(0, 7)}`);
        S.campPrevia = { ...r, arquivo: arq.name, slug, fonte_url: r.fonte_url || anterior?.fonte_url || "" };
        render();
      } catch (e) { S.campPrevia = null; render(); diz($("#camperr"), e.message); }
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
      if (msg) diz(msg, "Enviando…"); else avisoGeral("Enviando…");
      t.disabled = true;
      try { await api.enviarArquivo(ev, t.files[0]); t.disabled = false; S.conta.arqs = await api.meusArquivos();
        // Contrato assinado enviado: o passo "contrato" da data fica feito sozinho.
        if (t.dataset.anexoPasso) { const [pe, pc] = [t.dataset.anexoPasso.slice(0, t.dataset.anexoPasso.lastIndexOf("|")), t.dataset.anexoPasso.slice(t.dataset.anexoPasso.lastIndexOf("|") + 1)];
          try { await api.marcar(pe, pc, true); S.conta.chk = await lerChecklist(); } catch { /* o arquivo já foi; a equipe vê o anexo */ } }
        const ctId = ev.startsWith("contrato_") && ev.slice(9), ct = ctId && meusContratos().find((x) => x.id === ctId);
        if (ct?.evento_id) { try { await api.marcar(ct.evento_id, "contrato", true); S.conta.chk = await lerChecklist(); } catch { /* o arquivo já foi; o passo aparece feito pelo arquivo */ } } TQDiario.registrar("enviou_arquivo", { evento: ev }); render(); document.querySelectorAll("details").forEach((d) => { if (d.querySelector(`[data-enviar-arquivo="${ev}"]`)) { d.open = true; d.closest(".card")?.querySelectorAll("details").forEach((x) => { if (x.contains(d)) x.open = true; }); } }); const m2 = $(`#arqErr-${CSS.escape(ev)}`); if (m2) diz(m2, "✓ Arquivo enviado. A equipe do Tranquilo já consegue ver."); else avisoGeral("✓ Arquivo enviado. A equipe do Tranquilo já consegue ver."); }
      catch (e) { t.disabled = false; const m = (msg?.isConnected && msg) || $(`#arqErr-${CSS.escape(ev)}`); const tx = traduz(e.message || "") + " O arquivo não foi enviado: escolha de novo."; if (m) diz(m, tx); else avisoGeral(tx); t.value = ""; }
      return;
    }
    if (t.dataset?.campFeito) {
      const feito = t.checked;
      const r = await acao(t, async () => { await api.marcarCampanha(t.dataset.campFeito, feito); TQDiario.registrar("campanha_feito", { item: t.dataset.campFeito, feito }); const y = scrollY; S.hub = null; await carregarHub(); scrollTo(0, y); },
        { ok: feito ? "Marcado como feito." : "Desmarcado." });
      if (!r.ok && t.isConnected) t.checked = !feito;
      return;
    }
    // "Feito" da equipe no modelo do papel (Acompanhamento e "Para você"): fica com quem marcou e quando.
    const pe = t.dataset?.passoEq; if (pe) {
      const i = pe.indexOf("|"), eventoId = pe.slice(0, i), item = pe.slice(i + 1), feito = t.checked;
      const r = await acao(t, async () => { await api.marcar(eventoId, item, feito); TQDiario.registrar("modelo_feito", { item, feito }); const y = scrollY; S.eq.chk = await api.checklistTodos(); render(); scrollTo(0, y); },
        { ok: feito ? "Feito: quem acompanha já vê." : "Desmarcado." });
      if (!r.ok && t.isConnected) t.checked = !feito;
      return;
    }
    const ps = t.dataset?.passo; if (ps) {
      const [eventoId, item] = ps.split("|"), feito = t.checked;
      const r = await acao(t, async () => { if (!feito && S.conta.perfil.tipo === "casa") await api.desmarcarCasa(eventoId, item); else await api.marcar(eventoId, item, feito); S.conta.chk = await lerChecklist(); const aberto = t.closest("details")?.open; render(); if (aberto) document.querySelectorAll("details").forEach((d) => { if (d.querySelector(`[data-passo^="${eventoId}|"]`)) d.open = true; }); },
        { ok: feito ? "Passo marcado como feito." : "Passo desmarcado." });
      if (!r.ok && t.isConnected) t.checked = !feito;
      return;
    }
    if (t.dataset?.areaConta) {
      const pid = t.dataset.areaConta, areas = [...document.querySelectorAll(`[data-area-conta="${pid}"]:checked`)].map((x) => x.value), feito = t.checked;
      const r = await acao(t, async () => { await api.definirAreas(pid, areas); const p = (S.eq?.perfis || []).find((x) => x.id === pid); if (p) p.areas = areas.length ? areas : null; },
        { st: t.closest("td")?.querySelector(".err"), ok: areas.length ? nomesAreas(areas) : "sem área: vê tudo da equipe" });
      if (!r.ok && t.isConnected) t.checked = !feito;
      return;
    }
    if (t.dataset?.tipo) {
      // Mudar perfil muda o que a pessoa vê (e pode dar acesso de equipe): só com confirmação.
      const nome = t.closest("tr")?.querySelector("b")?.textContent || "esta conta";
      if (!confirm(`Mudar o perfil de ${nome} de ${ROTULO[t.dataset.antes] || t.dataset.antes} para ${ROTULO[t.value]}? O vínculo com o histórico atual é desfeito.`)) { t.value = t.dataset.antes; return; }
      const r = await acao(t, async () => { await api.atualizarPerfil(t.dataset.tipo, { tipo: t.value, codigo_acesso: null, vinculo_nome: null }); S.eq = null; render(); }, { ok: `Perfil de ${nome} mudou para ${ROTULO[t.value]}.` });
      if (r.ok) document.querySelector(`[data-tipo="${t.dataset.tipo}"]`)?.focus(); else if (t.isConnected) t.value = t.dataset.antes;
      return;
    }
    if (t.dataset?.vinculo && !t.closest("dialog")) {
      const [codigo, nome] = t.value ? t.value.split("|") : [null, null];
      await acao(t, async () => { await api.atualizarPerfil(t.dataset.vinculo, { codigo_acesso: codigo, vinculo_nome: nome }); S.eq = null; render(); }, { ok: nome ? `Conta ligada a ${nome}.` : "Vínculo removido." });
      return;
    }
    if (t.id === "histFiltro") { S.histFiltro = t.value; render(); return; }
    if (t.id === "eqStatus" || t.id === "eqFaixa") { S.eqf[t.id === "eqStatus" ? "status" : "faixa"] = t.value; render(); }
    if (t.id === "cvTipo") { S.convRasc = { nome: $("#cvNome")?.value || "", email: $("#cvEmail")?.value || "", wa: $("#cvWa")?.value || "" }; S.convTipo = t.value; S.convPre = null; render(); return; }
    if (t.id === "cvVinc") { const nome = t.value.split("|")[1] || "", n = $("#cvNome"); if (n && !n.value) n.value = nome; return; }
    if (t.id === "avCidade") { const o = $("#avOutra"); if (o) o.hidden = t.value !== "__outra"; return; }
  });
  document.addEventListener("input", (ev) => {
    const t = ev.target;
    // Proposta de atualização: escrever num campo já marca a caixinha "vai na proposta".
    if (t.dataset?.ppCampo && String(t.value).trim()) { const c = document.querySelector(`[data-pp-inc="${CSS.escape(t.dataset.ppCampo)}"]`); if (c) c.checked = true; }
    if (t.closest("#form") && S.aba === "inscricao") { const m = $("#medidor"); if (m) m.innerHTML = medidor(R.preCuradoria(lerForm($("#form")))); }
    if (t.closest("#form") && (S.aba === "inscricao" || (S.aba === "ficha" && (S.sub?.ficha || "cadastro_casa") === "cadastro_casa"))) {
      const raiz = $("#form");
      if (raiz.dataset.editavel === "1") guardarLocal({ ...((S.conta.perfil.tipo === "casa" ? S.conta.casa : S.conta.insc)?.dados || {}), ...lerForm(raiz) });
      atualizarPartes(); clearTimeout(S.tauto); S.tauto = setTimeout(salvarPendente, 1200);
    }
    if (t.dataset?.ctDado != null && S.contrAberto) { const l = lerCtLocal(S.contrAberto); l[t.dataset.ctDado] = valorCidade(t); store.set("tq-rascunho-ct-" + S.contrAberto, JSON.stringify(l)); }
    if (t.id === "eqQ") { S.eqf.q = t.value; clearTimeout(S.tq); S.tq = setTimeout(() => { render(); const i = $("#eqQ"); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 250); }
  });

  // A Sugestão POR HISTÓRICO (Criar datas) continua aberta ao mudar filtro ou formato, se a pessoa abriu.
  document.addEventListener("toggle", (ev) => { if (ev.target.id === "dpbSug") S.dpbSugAberto = ev.target.open; }, true);
  // Lembra quais funções da equipe estão abertas (Equipe da casa, Ficha e Treinamentos), pelo mesmo motivo.
  const abrirLinhaEq = (id) => { if (!(S.eqlinAbertas || []).includes(id)) S.eqlinAbertas = [...(S.eqlinAbertas || []), id]; };
  document.addEventListener("toggle", (ev) => {
    const det = ev.target; if (!det.matches?.("details[data-eqlin]") || det.querySelector("#eqcForm")) return;
    const id = det.dataset.eqlin; if (det.open) abrirLinhaEq(id); else S.eqlinAbertas = (S.eqlinAbertas || []).filter((x) => x !== id);
  }, true);
  // Campanhas: lembra quais estão abertas (casa e equipe), para marcar "Feito" não fechar a campanha.
  document.addEventListener("toggle", (ev) => {
    if (ev.target?.id === "dpSugHist") S.dpSugAberta = ev.target.open;
    const det = ev.target; if (!det.matches?.("details[data-camp]")) return;
    const ab = new Set(S.campAbertas || []); if (det.open) ab.add(det.dataset.camp); else ab.delete(det.dataset.camp); S.campAbertas = ab;
  }, true);
  // Lembra quais partes do formulário estão abertas, para um redesenho da tela não fechar o que a pessoa abriu.
  document.addEventListener("toggle", (ev) => {
    const det = ev.target;
    if (det.matches?.("details[data-dobra]")) { S.dobras = { ...(S.dobras || {}), [det.dataset.dobra]: det.open }; return; } if (!det.matches?.("details[data-parte]") || !det.closest("#form")) return;
    S.partesAbertas = { ...(S.partesAbertas || {}), [S.aba]: [...document.querySelectorAll("#form details[data-parte][open]")].map((x) => +x.dataset.parte) };
  }, true);

  // Salvamento automático do rascunho (inscrição da artista e cadastro da casa), 1,2 s depois da última
  // alteração e também antes de trocar de aba. Atualiza o estado local na hora para a troca de aba não apagar nada.
  function salvarPendente() {
    clearTimeout(S.tauto); S.tauto = null;
    const raiz = $("#form"); if (!raiz || !S.conta || !raiz.querySelector("[data-k]:not(:disabled)")) return Promise.resolve();
    const casa = S.conta.perfil.tipo === "casa";
    if (casa && raiz.dataset.modo !== "edicao") return Promise.resolve();   // ficha enviada: muda só por pedido
    const d = { ...((casa ? S.conta.casa : S.conta.insc)?.dados || {}), ...lerForm(raiz) };
    const msg = (t) => { const e = $("#ferr"); if (e) diz(e, t); };
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
    return p.then(() => { limparLocal(d); msg(`✓ Salvo automaticamente às ${new Date().toTimeString().slice(0, 5)}.`); return true; })
      .catch((e) => { msg(`Não salvou automaticamente: ${traduz(e.message || "")} O que você digitou está guardado neste aparelho. Toque em "Salvar rascunho" para tentar de novo.`); return false; });
  }

  // ---------- público: "me avise de shows na minha cidade" ----------
  async function avisarCidade() {
    const err = $("#averr"), sel = $("#avCidade").value, cidade = (sel === "__outra" ? $("#avOutra").value : sel).trim(), contato = $("#avContato").value.trim();
    if (cidade.length < 2) { marcar(sel === "__outra" ? $("#avOutra") : $("#avCidade")); diz(err, "Escolha ou escreva a sua cidade."); return; }
    const email = /@/.test(contato), digitos = contato.replace(/\D/g, "");
    if (email ? !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contato) : digitos.length < 10) { marcar($("#avContato")); diz(err, "Escreva um e-mail ou um WhatsApp com DDD."); return; }
    if (!$("#avOk2").checked) { marcar($("#avOk2")); diz(err, "Marque a autorização para podermos avisar você."); return; }
    diz(err, "Enviando…");
    try {
      await api.avisar({ cidade, contato: email ? contato.toLowerCase() : digitos, canal: email ? "email" : "whatsapp" });
      $("#avForm").innerHTML = `<div class="alert good"><b>Pronto! Vamos te avisar.</b>Quando abrir show em ${esc(cidade)}, você fica sabendo antes.${REAL ? "" : " (Modo demonstração: o pedido ficou só neste navegador.)"}</div>`;
    } catch (e) { diz(err, traduz(e.message || "")); }
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

  async function sairDeTudo() { try { sessionStorage.removeItem("tq-veio-link"); sessionStorage.removeItem("tq-senha-depois"); } catch { /* segue */ } S.senhaDepois = false; S.partesAbertas = null; S.recuperado = null; S.conta = null; await api?.sair(); store.del("tq-codigo"); S.conta = null; S.pac = null; S.eq = null; S.hub = null; S.campAbertas = null; S.campForm = null; render(); scrollTo(0, 0); }

  const noMenu = (k) => !menuAgrupado() || k === "conta" || k === "convites" || k in GRUPOS_EQ || REFERENCIA.some(([x]) => x === k);
  // Detalhe de data para a equipe (diálogo do index.html): contrato, Ficha da casa e o que falta.
  function eventoPorId(id) {
    const x = (S.eq?.datasP || []).find((d) => "p:" + d.id === id); if (x) return eventoDoPortal(x);
    return (S.pac?.eventos || []).find((e) => e.id === id) || null;
  }
  // Vínculo da base do Notion (Casas / Artistas) com as contas do portal: liga quando o nome bate (sem acento e caixa).
  function vinculoBase(tipo, r) {
    if (!S.conta || !["equipe", "adm"].includes(S.conta.perfil.tipo)) return "";
    const E = S.eq; if (!E) { carregarEquipe(); return `<h3>Vínculo com o portal</h3><p class="muted">Carregando as contas do portal…</p>`; }
    const k = (x) => String(x || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(), alvo = k(r.n);
    if (!alvo) return "";
    let linhas = [];
    if (tipo === "casas") {
      const cs = (E.casas || []).filter((c) => c.notion_casa_id === r.id || k(c.dados?.nome) === alvo || k(c.perfil?.vinculo_nome) === alvo);
      linhas = cs.map((c) => `<dt>Ficha no portal</dt><dd>${esc(c.dados?.nome || c.perfil?.vinculo_nome || "Casa")} ${badgeEtapa(etapaCasaEq(E, c))} <button class="btn sm" data-click="casacad:${c.id}">Abrir a Ficha</button></dd>`);
      const ps = (E.perfis || []).filter((p) => p.tipo === "casa" && k(p.vinculo_nome) === alvo && !cs.some((c) => c.user_id === p.id));
      linhas.push(...ps.map((p) => `<dt>Conta</dt><dd>${esc(p.nome || p.vinculo_nome)} <span class="muted">(${esc(p.email)})</span></dd>`));
    } else {
      const ps = (E.perfis || []).filter((p) => p.tipo === "artista" && (k(p.vinculo_nome) === alvo || k(p.nome) === alvo));
      const is = (E.insc || []).filter((i) => ps.some((p) => p.id === i.user_id) || k(i.dados?.nome_artistico) === alvo);
      linhas = is.map((i) => `<dt>Ficha no portal</dt><dd>${esc(i.dados?.nome_artistico || "Artista")} ${badgeEtapa(etapaArtistaEq(E, i))} <button class="btn sm" data-click="insc:${i.id}">Abrir a ficha</button></dd>`);
      linhas.push(...ps.filter((p) => !is.some((i) => i.user_id === p.id)).map((p) => `<dt>Conta</dt><dd>${esc(p.vinculo_nome || p.nome)} <span class="muted">(${esc(p.email)}) · ainda sem ficha</span></dd>`));
    }
    return `<h3>Vínculo com o portal</h3>${linhas.length ? `<dl class="kv" data-bn-vinculo>${linhas.join("")}</dl>` : `<p class="muted" data-bn-vinculo>Ninguém com este nome tem conta no portal ainda. Dá para convidar em Convidar.</p>`}`;
  }
  function detalheEventoEquipe(e) {
    const E = S.eq; if (!E) return "";
    const k = (x) => String(x || "").trim().toLowerCase();
    const c = (E.casas || []).find((x) => x.id === e.kc || (e.h && (k(x.dados?.nome) === k(e.h) || k(x.perfil?.vinculo_nome) === k(e.h))));
    const cts = (E.contr || []).filter((x) => x.evento_id === e.id && x.status !== "cancelado");
    return `<h3>Na rede</h3><dl class="kv"><dt>Ficha da casa</dt><dd>${c ? `${badgeEtapa(etapaCasaEq(E, c))} <button class="btn sm" data-click="casacad:${c.id}">Abrir a Ficha</button>` : '<span class="muted">sem Ficha no portal</span>'}</dd>
      <dt>Contratos</dt><dd>${cts.length ? cts.map((x) => `<button class="btn sm" data-abrir="ct:${x.id}" onclick="dlg.close()">${esc(x.titulo)} · ${situacaoCt(x).rotulo}</button>`).join(" ") : '<span class="muted">nenhum contrato no portal</span>'}</dd>
      ${e.portal ? `<dt>Origem</dt><dd>Data criada no portal</dd>` : `<dt>Origem</dt><dd>Notion</dd>`}</dl>`;
  }
  return { eventoPorId, detalheEventoEquipe, vinculoBase, bloqueio, telaTravada, telaSenha, roteiroConta: () => roteiroConta(), get REAL() { return REAL; }, get FORA() { return FORA; }, avisoConta, iniciar, abas, areaDe, noMenu, subsDoGrupo, rotuloQuem, telas: TELAS, leitor: () => (S.lendo ? leitor() : null), formEntrada, sairDeTudo, formAviso, tutorialPublico, abrirTutorial, salvarPendente: () => { if (S.tauto) salvarPendente(); } };
})();
