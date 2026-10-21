// Diário de uso: registra telas abertas, cliques, erros mostrados e falhas de chamada, para a equipe
// reconstruir o que cada pessoa fez durante os testes. Nunca grava senha nem o que se digita nos campos.
// Os eventos ficam numa fila no navegador e vão para o banco (tabela diario_uso) a cada poucos segundos;
// se o banco estiver fora do ar ou a tabela ainda não existir, a fila espera e é enviada depois.
"use strict";
const TQDiario = (() => {
  const CH = "tq-diario-fila", MAX = 2000, LOTE = 80;
  const ler = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const gravarLS = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sem espaço ou bloqueado */ } };
  let fila = []; try { fila = JSON.parse(ler(CH)) || []; } catch { fila = []; }
  let sessao = null; try { sessao = sessionStorage.getItem("tq-sessao"); } catch {}
  if (!sessao) { sessao = (crypto.randomUUID?.() || String(Math.random()).slice(2) + Date.now()).replace(/-/g, "").slice(0, 24); try { sessionStorage.setItem("tq-sessao", sessao); } catch {} }
  let enviando = false, espera = 4000, ultimaTela = "";
  const corta = (t, n) => { t = String(t ?? "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1) + "…" : t; };
  // Tira do endereço o que identifica alguém: o código de acesso (#c=) e o e-mail do convite (#criar&email=).
  const urlLimpa = () => (location.pathname + location.hash).replace(/([#&]c=)[^&]*/i, "$1***").replace(/(email=)[^&]*/i, "$1***").slice(0, 300);
  const dispositivo = () => corta(`${innerWidth}x${innerHeight} ${matchMedia("(pointer:coarse)").matches ? "toque" : "mouse"} ${navigator.userAgent.replace(/\(.*?\)|Mozilla\/5\.0|AppleWebKit\/[\d.]+|KHTML, like Gecko|Safari\/[\d.]+/g, "").replace(/\s+/g, " ").trim()}`, 160);
  const estado = () => window.S || {};
  // Visitante só entra no diário se aceitou no banner; quem tem conta (fase de testes) entra sempre.
  const ativo = () => { const s = estado(); return !!(s.conta || s.pac) || ler("tq-consentimento") === "tudo"; };
  function quem() {
    const s = estado();
    if (s.conta) return { perfil: s.conta.perfil.tipo, conta_id: s.conta.perfil.id };
    if (s.pac) return { perfil: s.pac.perfil + " (código)", conta_id: null };
    return { perfil: "visitante", conta_id: null };
  }
  const telaAtual = () => { const s = estado(); if (document.querySelector(".tour")) return "tutorial"; if (document.getElementById("dlg")?.open) return "janela: " + corta(document.querySelector("#dlgIn h2")?.textContent, 60); return (s.conta || s.pac) ? (s.aba || "") : "publica"; };

  function reg(tipo, alvo, detalhe) {
    const q = quem();
    if (q.perfil === "visitante" && ler("tq-consentimento") === "necessarios") return;
    fila.push({ quando_cliente: new Date().toISOString(), sessao, conta_id: q.conta_id, perfil: q.perfil, tipo, tela: corta(telaAtual(), 80),
      alvo: corta(alvo, 240) || null, detalhe: detalhe || null, url: urlLimpa(), dispositivo: dispositivo() });
    if (fila.length > MAX) fila.splice(0, fila.length - MAX);
    gravarLS(CH, JSON.stringify(fila));
  }

  async function enviar() {
    const conta = typeof TQConta !== "undefined" ? TQConta : null;   // definido em conta.js (const, fora de window)
    if (enviando || !fila.length || !conta?.diario) return;
    if (!ativo()) { // escolheu "apenas necessários": descarta o que era de visitante
      if (ler("tq-consentimento")) { fila = fila.filter((e) => e.perfil !== "visitante"); gravarLS(CH, JSON.stringify(fila)); }
      if (!fila.length || !estado().conta) return;
    }
    enviando = true;
    const lote = fila.slice(0, LOTE);
    try {
      const r = await conta.diario(lote);
      if (r !== false) { fila = fila.slice(lote.length); gravarLS(CH, JSON.stringify(fila)); espera = 4000; }
    } catch { espera = Math.min(espera * 2, 120000); }
    finally { enviando = false; }
  }
  (function ciclo() { setTimeout(async () => { await enviar(); ciclo(); }, espera); })();

  // ---------- o que é registrado ----------
  function tela(nome) { if (nome && nome !== ultimaTela) { ultimaTela = nome; reg("tela", nome); } }
  function rotulo(el) {
    const d = el.dataset || {}, chaves = Object.keys(d).filter((k) => !/^(copy|enviarTutorial|linkSenha|reconvidar|cancelarConvite)$/.test(k));
    const dados = chaves.map((k) => `${k}=${corta(d[k], 40)}`).join(" ");
    const txt = el.matches("input,textarea") ? "" : corta(el.getAttribute("aria-label") || el.textContent, 60);
    return corta([el.tagName.toLowerCase() + (el.id ? "#" + el.id : ""), dados, txt && `“${txt}”`].filter(Boolean).join(" "), 240);
  }
  document.addEventListener("click", (ev) => {
    const el = ev.target.closest("button,a,[data-aba],[data-ev],[data-click],[data-tour],[data-ir],summary,label.fcheck,tr.click,.cidade,.atalho");
    if (!el) return;
    const ext = el.tagName === "A" && el.href && !el.href.startsWith(location.origin + location.pathname) ? { destino: corta(el.href.replace(/[?#].*$/, ""), 120) } : null;
    reg("acao", rotulo(el), ext);
  }, true);
  document.addEventListener("change", (ev) => {
    const t = ev.target; if (!t.matches("select,input[type=checkbox],input[type=radio]")) return;
    // Seleções e caixas dizem o que a pessoa escolheu (cidade, filtro, passo); campos de texto nunca são gravados.
    const valor = t.type === "checkbox" ? (t.checked ? "marcou" : "desmarcou") : corta(t.type === "radio" ? t.value : t.options?.[t.selectedIndex]?.text, 60);
    reg("acao", rotulo(t) + " → " + valor);
  }, true);
  // Mensagens de erro que a pessoa vê: campos .err, avisos vermelhos e alert().
  new MutationObserver((ms) => {
    for (const m of ms) {
      const el = m.target.nodeType === 1 ? m.target : m.target.parentElement; if (!el) continue;
      const alvo = el.closest(".err, .alert.crit");
      if (alvo) { const t = corta(alvo.textContent, 200); if (t && !/^(Aguarde|Salvando|Enviando|Conferindo|Abrindo|Procurando)/.test(t) && t !== alvo.dataset.ultimo) { alvo.dataset.ultimo = t; reg("erro", t, { onde: alvo.id || alvo.className }); } }
    }
  }).observe(document.documentElement, { subtree: true, childList: true, characterData: true });
  const alerta = window.alert; window.alert = (m) => { reg("erro", corta(m, 200), { onde: "alert" }); return alerta.call(window, m); };
  addEventListener("error", (e) => reg("erro", corta(e.message, 200), { onde: "javascript", arquivo: corta((e.filename || "").split("/").pop(), 60), linha: e.lineno }));
  addEventListener("unhandledrejection", (e) => reg("erro", corta(e.reason?.message || e.reason, 200), { onde: "promessa" }));
  // Falhas de chamada (banco, login, arquivos do site). A própria gravação do diário fica de fora.
  const fetchOriginal = window.fetch.bind(window);
  window.fetch = async (entrada, init) => {
    const url = String(entrada?.url || entrada), curta = url.replace(/^https?:\/\/[^/]+/, "").replace(/\?.*$/, "").slice(0, 120);
    const doDiario = /diario_uso/.test(url);
    try {
      const r = await fetchOriginal(entrada, init);
      if (!r.ok && !doDiario && !/\/b\/[0-9a-f]+\.bin$/.test(curta)) reg("falha_rede", `${(init?.method || "GET").toUpperCase()} ${curta}`, { status: r.status });
      return r;
    } catch (e) {
      if (!doDiario) reg("falha_rede", `${(init?.method || "GET").toUpperCase()} ${curta}`, { erro: corta(e.message, 120) });
      throw e;
    }
  };
  // Janelas (fichas, convites, registro da noite): registra o título quando abrem.
  const abrirJanela = HTMLDialogElement.prototype.showModal;
  HTMLDialogElement.prototype.showModal = function () { const r = abrirJanela.call(this); setTimeout(() => reg("tela", telaAtual()), 0); return r; };
  addEventListener("pagehide", () => { reg("sessao", "saiu da página"); gravarLS(CH, JSON.stringify(fila)); });
  reg("sessao", "abriu o site", { idioma: navigator.language, tela: `${screen.width}x${screen.height}` });

  // Chamado quando o visitante escolhe "Apenas necessários": apaga o que já estava na fila dele.
  function semVisitante() { fila = fila.filter((e) => e.perfil !== "visitante"); gravarLS(CH, JSON.stringify(fila)); }
  return { tela, reg, semVisitante, pendentes: () => fila.length, enviar };
})();
