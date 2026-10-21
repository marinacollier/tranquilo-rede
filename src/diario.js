// Diário de uso: telas abertas, cliques em botões, mensagens mostradas e erros (do navegador, das chamadas
// ao banco e dos arquivos do site). Vai em lotes para a tabela `diario` do Supabase, que só a equipe lê.
// Nunca registra o que a pessoa digita (senhas, e-mails, textos de formulário): só nomes de botões e telas.
"use strict";
const TQDiario = (() => {
  const cfg = window.TQ_CONFIG || {};
  const ativo = !!(cfg.supabaseUrl && cfg.supabaseAnonKey);
  const ref = (cfg.supabaseUrl || "").match(/https:\/\/([^.]+)\./)?.[1] || "";
  const destino = `${cfg.supabaseUrl}/rest/v1/diario`;
  const fila = [];
  let sessao = null, perfil = null, tela = null, ultimaTela = null;
  try { sessao = sessionStorage.getItem("tq-sessao"); } catch { /* aba anônima: segue sem guardar */ }
  if (!sessao) {
    sessao = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    try { sessionStorage.setItem("tq-sessao", sessao); } catch { /* idem */ }
  }
  const curto = (s, n = 120) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
  // Remove códigos de acesso, tokens e e-mails de qualquer texto antes de guardar.
  const limpo = (s, n) => curto(s, n)
    .replace(/[A-Z0-9]{4}-?[A-Z0-9]{4}-?[A-Z0-9]{4}/gi, "[código]")
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[e-mail]")
    .replace(/(access_token|refresh_token|token)=[^&\s]+/gi, "$1=[...]");
  const pagina = () => limpo(location.pathname + location.hash.replace(/#c=.*/, "#c=[código]").replace(/access_token.*/, ""), 200);

  function token() {
    try { const s = JSON.parse(localStorage.getItem(`sb-${ref}-auth-token`) || "null"); return s?.access_token || null; } catch { return null; }
  }

  function registrar(acao, detalhe = {}) {
    if (!ativo) return;
    fila.push({ sessao, perfil, acao: curto(acao, 40), tela, detalhe, pagina: pagina(), navegador: curto(navigator.userAgent, 300), quando_cliente: new Date().toISOString() });
    if (fila.length >= 20) enviar();
  }

  let enviando = false;
  async function enviar(saindo = false) {
    if (!ativo || !fila.length || (enviando && !saindo)) return;
    const lote = fila.splice(0, 50);
    enviando = true;
    const manda = (comToken) => {
      const h = { apikey: cfg.supabaseAnonKey, "Content-Type": "application/json", Prefer: "return=minimal" };
      const t = comToken && token(); if (t) h.Authorization = `Bearer ${t}`;
      return origFetch(destino, { method: "POST", keepalive: saindo, headers: h, body: JSON.stringify(lote) });
    };
    try {
      const r = await manda(true);
      if (r.status === 401) await manda(false);   // sessão vencida: grava sem ligar à conta
    } catch { /* sem rede: o lote se perde, o site segue normal */ }
    finally { enviando = false; }
  }
  setInterval(() => enviar(), 5000);
  addEventListener("pagehide", () => { registrar("saiu"); enviar(true); });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") enviar(true); });

  // Erros de JavaScript.
  addEventListener("error", (e) => registrar("erro_js", { msg: limpo(e.message, 300), arq: curto(e.filename?.split("/").pop(), 60), linha: e.lineno }));
  addEventListener("unhandledrejection", (e) => registrar("erro_promessa", { msg: limpo(e.reason?.message || e.reason, 300) }));

  // Chamadas que falham: arquivos do site (404 de código errado, public.json) e o banco (400/401/500).
  const origFetch = window.fetch.bind(window);
  window.fetch = async (url, op) => {
    const u = String(url?.url || url), t0 = Date.now();
    const alvo = limpo(u.replace(/^https?:\/\/[^/]+/, "").split("?")[0], 120);
    try {
      const r = await origFetch(url, op);
      if (!r.ok && !u.startsWith(destino)) registrar("falha_chamada", { alvo, status: r.status, metodo: op?.method || "GET", ms: Date.now() - t0 });
      else if (Date.now() - t0 > 4000 && !u.startsWith(destino)) registrar("chamada_lenta", { alvo, status: r.status, ms: Date.now() - t0 });
      return r;
    } catch (e) {
      if (!u.startsWith(destino)) registrar("falha_rede", { alvo, msg: limpo(e.message, 120), ms: Date.now() - t0 });
      throw e;
    }
  };

  // Cliques em botões, links e itens clicáveis: só o rótulo e o atalho, nunca valores digitados.
  document.addEventListener("click", (ev) => {
    const el = ev.target.closest("button, a, [data-click], [data-ev], [data-aba], tr.click, .cidade");
    if (!el) return;
    const ds = Object.fromEntries(Object.entries(el.dataset || {}).filter(([k]) => !/senha|email|contato|vinculo|tutorial/i.test(k)).map(([k, v]) => [k, limpo(v, 60)]));
    registrar("clique", { el: el.tagName.toLowerCase(), id: el.id || undefined, texto: limpo(el.getAttribute("aria-label") || el.innerText, 60), ...ds, externo: el.tagName === "A" && el.target === "_blank" ? limpo(el.href, 120) : undefined });
  }, true);

  // Mensagens mostradas na tela (erros, avisos e sucessos), lidas das áreas de aviso.
  const vistas = new WeakMap();
  new MutationObserver((muts) => {
    for (const m of muts) {
      const el = (m.target.nodeType === 1 ? m.target : m.target.parentElement)?.closest?.(".err, .alert, .stale");
      if (!el) continue;
      const txt = limpo(el.textContent, 200);
      if (!txt || vistas.get(el) === txt || /^(Aguarde|Salvando|Conferindo|Abrindo|Conectando)/.test(txt)) continue;
      vistas.set(el, txt);
      registrar("mensagem", { tipo: el.classList.contains("err") ? "formulario" : [...el.classList].find((c) => /crit|warn|good/.test(c)) || "aviso", texto: txt });
    }
  }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });

  /** Chamado a cada render: registra mudança de tela e de perfil (visitante, conta, código). */
  function tela_(novaTela, novoPerfil) {
    perfil = novoPerfil; tela = curto(novaTela, 80);
    const chave = `${perfil}|${tela}`;
    if (chave !== ultimaTela) { ultimaTela = chave; registrar("tela", {}); }
  }

  registrar("abriu", { tela_px: `${innerWidth}x${innerHeight}`, idioma: navigator.language, veio_de: limpo(document.referrer.replace(/\?.*/, ""), 120) || undefined });
  return { registrar, tela: tela_, enviar };
})();
