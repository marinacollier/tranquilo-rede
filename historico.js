// "Seu histórico" (pedido da Marina, 18/11/2026): tudo o que a própria pessoa fez nos últimos dias, para qualquer acesso.
// Fonte principal: as colunas de quem e quando do banco (avaliado_por, criado_por, conferido_por, devolvido_por, feito_por,
// publicada_por, importada_por, atualizado_por, revisado_por...). Complemento: o diário de uso (tabela diario, só a equipe
// lê), traduzido em frases, para o que não fica em coluna nenhuma (preparar contratos do line-up, cobrar no WhatsApp...).
// Só monta as linhas (texto puro, sem HTML): a tela fica em src/conta.js (feito e meu_hist).
"use strict";
(function (g) {
  const TIPOS = [["ficha", "Ficha e cadastro"], ["curadoria", "Curadoria"], ["casas", "Casas"], ["treinos", "Treinamentos"], ["datas", "Datas"],
    ["contratos", "Contratos"], ["campanhas", "Campanhas"], ["materiais", "Materiais e documentos"], ["convites", "Convites e equipe"],
    ["disponibilidade", "Disponibilidade"], ["passos", "Próximos passos"], ["pedidos", "Pedidos de atualização"], ["outros", "Outros"]];
  const NOME_TIPO = Object.fromEntries(TIPOS);
  const ddmm = (iso) => { const s = String(iso || "").slice(0, 10); return s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : ""; };
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  const seg = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) / 1000;

  // Ações do diário que viram linha. As outras ou já vêm das colunas do banco (contrato enviado/conferido, data criada,
  // campanha marcada, material publicado...) ou não são ações (telas, cliques comuns, erros).
  const DIARIO = {
    contratos_lineup: (d) => ["contratos", `Preparou os contratos do line-up${d.contratos ? ` (${plural(+d.contratos, "contrato", "contratos")})` : ""}`, { ir: "documentos" }],
    campanha_ajustada: () => ["campanhas", "Ajustou um dia de campanha", { ir: "campanhas" }],
    data_portal: (d) => (d.cancelou ? ["datas", "Cancelou uma data do portal", { ir: "datas_portal" }] : d.editou ? ["datas", "Editou uma data do portal", { ir: "datas_portal" }] : null),
    ficha_vazios: (d) => ["casas", `Completou campos vazios da Ficha${d.casa ? ` de ${d.casa}` : " de uma casa"}`, { ir: "casas_cad" }],
    docs_publicados: (d) => ["materiais", d.n ? `Publicou ${plural(+d.n, "documento", "documentos")}` : "Publicou documentos", { ir: "materiais" }],
    leu_documento: () => ["materiais", "Leu um documento", { ir: "materiais" }],
    ciencia: () => ["materiais", "Deu ciência de um documento", { ir: "materiais" }],
    trilha: (d) => (d.acao === "editou" ? ["treinos", "Editou um treinamento", { ir: "trilhas" }] : null),
    equipe_convite: () => ["convites", "Convidou alguém da equipe da casa para o portal", { ir: "equipe_casa" }],
    relato: () => ["outros", "Mandou um relato pelo “Algo deu errado?”", {}],
    clique: (d) => {
      if (d.campCobrar) return ["campanhas", "Cobrou a casa pela campanha no WhatsApp", { abrir: "camp:" + d.campCobrar }];
      if (d.externo === "whatsapp" && /cobrar/i.test(d.texto || "")) return ["outros", `Cobrou no WhatsApp${d.texto ? `: ${String(d.texto).replace(/\s*\(escolher contato\)\s*/, "")}` : ""}`, {}];
      return null;
    },
  };
  const ACOES_DIARIO = Object.keys(DIARIO).filter((k) => k !== "clique");

  /**
   * Linhas do histórico de quem está logado, da mais recente para a mais antiga.
   * d: dados (listas do banco); o: { eu, papel: "equipe" | "casa" | "artista", desde (ISO), nome(uid), nomeCasa(id),
   *   statusInsc(s), statusCasa(s), nomePasso(chave), nomeEtapa(chave), nomeEvento(id) }.
   * Cada linha: { em, tipo, titulo, detalhe, abrir (para abrirItem) ou ir (tela) }.
   */
  function montar(d, o) {
    const eu = o.eu, desde = o.desde || "", eqp = o.papel === "equipe", L = [];
    const nome = o.nome || (() => ""), f = (fn, ...a) => (fn ? fn(...a) : "") || "";
    const add = (em, tipo, titulo, detalhe, alvo) => { if (em && String(em) >= desde) L.push({ em: String(em), tipo, titulo, detalhe: detalhe || "", ...(alvo || {}) }); };
    const L_ = (x) => (Array.isArray(x) ? x : []);
    const ctAlvo = (c) => (eqp ? { abrir: "ct:" + c.id } : { ir: "contratos_meus" });

    // Ficha da artista e cadastro da casa
    for (const i of L_(d.insc)) {
      const nm = i.nome || i.dados?.nome_artistico || "artista";
      if (eqp && i.avaliado_por === eu) add(i.avaliado_em, "curadoria", `Curadoria de ${nm}`, f(o.statusInsc, i.status), { abrir: "insc:" + i.id });
      if (!eqp && i.user_id === eu) {
        add(i.criado_em, "ficha", "Começou a sua ficha de artista", "", { ir: "inscricao" });
        add(i.enviado_em, "ficha", "Enviou a ficha para a curadoria", "", { ir: "inscricao" });
        if (i.atualizado_em && (!i.enviado_em || seg(i.atualizado_em, i.enviado_em) > 60) && (!i.criado_em || seg(i.atualizado_em, i.criado_em) > 60)) add(i.atualizado_em, "ficha", "Salvou a ficha", "", { ir: "inscricao" });
      }
    }
    for (const c of L_(d.casas)) {
      const nm = c.nome || c.dados?.nome || "casa";
      if (eqp && c.avaliado_por === eu) add(c.avaliado_em, "casas", `Ficha da casa ${nm}`, f(o.statusCasa, c.status), { abrir: "casa:" + c.id });
      if (!eqp && c.user_id === eu) {
        add(c.criado_em, "ficha", "Começou o cadastro da casa", "", { ir: "cadastro_casa" });
        add(c.enviado_em, "ficha", "Enviou o cadastro da casa para análise", "", { ir: "cadastro_casa" });
        if (c.atualizado_em && (!c.enviado_em || seg(c.atualizado_em, c.enviado_em) > 60) && (!c.criado_em || seg(c.atualizado_em, c.criado_em) > 60)) add(c.atualizado_em, "ficha", "Salvou o cadastro da casa", "", { ir: "cadastro_casa" });
      }
    }
    const ST_SOL = { pendente: "esperando resposta", aprovada: "aprovado", recusada: "recusado", cancelada: "cancelado" };
    for (const s of L_(d.sol)) {
      if (eqp && s.revisado_por === eu) add(s.revisado_em, "pedidos", `Respondeu o pedido de atualização${f(o.nomeCasa, s.casa_id) ? ` de ${o.nomeCasa(s.casa_id)}` : ""}`, ST_SOL[s.status] || s.status, { abrir: "casa:" + s.casa_id });
      if (!eqp && s.user_id === eu) add(s.criado_em, "pedidos", "Pediu atualização da ficha", ST_SOL[s.status] || s.status, { ir: "cadastro_casa" });
    }

    // Datas do portal (equipe)
    const cancelas = L_(d.diario).filter((r) => r.acao === "data_portal" && r.detalhe?.cancelou).map((r) => r.criado_em);
    for (const x of L_(d.datasP)) {
      if (!eqp || x.criado_por !== eu) continue;
      const det = [x.casa_nome, x.cidade, (x.artistas || []).map((a) => a.nome).filter(Boolean).join(", ")].filter(Boolean).join(" · ");
      add(x.criado_em, "datas", `Criou a data de ${ddmm(x.dia)}`, det, { abrir: "dp:" + x.id });
      // Cancelada: pelo diário, quando ele registrou quem cancelou; senão, avisa na data que a pessoa criou.
      if (x.status === "cancelada" && !cancelas.some((em) => seg(em, x.atualizado_em) < 120)) add(x.atualizado_em, "datas", `Data de ${ddmm(x.dia)} cancelada`, det, { abrir: "dp:" + x.id });
    }

    // Contratos
    for (const c of L_(d.contr)) {
      const quem = f(nome, c.user_id);
      if (eqp) {
        if (c.criado_por === eu) add(c.criado_em, "contratos", "Enviou um contrato", [c.titulo, quem && "para " + quem].filter(Boolean).join(" · "), ctAlvo(c));
        if (c.conferido_por === eu) add(c.conferido_em, "contratos", "Conferiu um contrato assinado", [c.titulo, quem].filter(Boolean).join(" · "), ctAlvo(c));
        if (c.devolvido_por === eu) add(c.devolvido_em, "contratos", "Pediu o contrato de novo", [c.titulo, quem, c.devolvido_motivo].filter(Boolean).join(" · "), ctAlvo(c));
      } else if (c.user_id === eu) {
        add(c.lido_fim_em, "contratos", "Leu o contrato até o fim", c.titulo, ctAlvo(c));
        add(c.assinado_em, "contratos", "Assinou o contrato", c.titulo, ctAlvo(c));
      }
    }
    // Arquivos enviados pela própria pessoa (contrato assinado ou material da data)
    for (const a of L_(d.arqs)) {
      if (a.user_id && a.user_id !== eu) continue;
      const ev = String(a.evento_id || "");
      if (/^contrato_/.test(ev)) { const c = L_(d.contr).find((x) => "contrato_" + x.id === ev); add(a.em, "contratos", "Enviou o contrato assinado", c?.titulo || "", eqp ? { abrir: "ct:" + ev.slice(9) } : { ir: "contratos_meus" }); }
      else add(a.em, "passos", "Enviou um arquivo para a data", [f(o.nomeEvento, ev)].filter(Boolean).join(""), { ir: "passos" });
    }

    // Convites (equipe)
    for (const c of L_(d.conv)) if (eqp && c.criado_por === eu) add(c.criado_em, "convites", `Convidou ${c.vinculo_nome || c.nome || c.email || "uma pessoa"}`, [{ artista: "artista", casa: "casa", equipe: "equipe", adm: "administração" }[c.tipo], c.aceito_em && "já entrou"].filter(Boolean).join(" · "), { abrir: "conv:" + (c.email || "") });

    // Campanhas: importadas e dias marcados (pela casa ou pela equipe em nome dela)
    const itens = Object.fromEntries(L_(d.campItens).map((i) => [i.id, i])), camps = Object.fromEntries(L_(d.campanhas).map((c) => [c.id, c]));
    for (const c of L_(d.campanhas)) if (eqp && c.importada_por === eu) add(c.importada_em, "campanhas", "Importou uma campanha", [c.titulo, c.casa_ref].filter(Boolean).join(" · "), { abrir: "camp:" + c.id });
    const diaCamp = (iid) => { const it = itens[iid], c = it && camps[it.campanha_id]; return { det: [it && `dia ${ddmm(it.dia)}`, c?.titulo || c?.casa_ref].filter(Boolean).join(" · "), alvo: eqp ? (c ? { abrir: "camp:" + c.id } : { ir: "campanhas" }) : { ir: "campanha" } }; };
    const hist = L_(d.campHist).filter((h) => h.por === eu);
    if (hist.length) for (const h of hist) { const x = diaCamp(h.item_id); add(h.em, "campanhas", h.acao === "desfeito" ? "Desmarcou um dia de campanha" : "Marcou um dia de campanha como feito", x.det, x.alvo); }
    else for (const h of L_(d.campFeitos)) if (h.feito_por === eu) { const x = diaCamp(h.item_id); add(h.feito_em, "campanhas", "Marcou um dia de campanha como feito", x.det, x.alvo); }

    // Materiais e documentos publicados (equipe)
    const mats = Object.fromEntries(L_(d.materiais).map((m) => [m.id, m]));
    for (const v of L_(d.versoes)) if (eqp && v.publicada_por === eu) add(v.publicada_em, "materiais", "Publicou um material", [mats[v.material_id]?.titulo, v.versao && "versão " + v.versao].filter(Boolean).join(" · "), { ir: "materiais" });
    for (const x of L_(d.docs)) if (eqp && x.criado_por === eu) add(x.criado_em, "materiais", "Publicou um documento", [x.titulo, x.user_id && f(nome, x.user_id) && "para " + nome(x.user_id)].filter(Boolean).join(" · "), { ir: "documentos" });

    // Treinamentos: a equipe marca as etapas dela; a casa, as dela (pela trilha da própria casa)
    for (const t of L_(d.trilhas)) if (eqp && t.criado_por === eu) add(t.criado_em, "treinos", "Começou um treinamento", t.casa_ref, { ir: "trilhas" });
    for (const m of L_(d.marcos)) {
      if (eqp && m.feito_por === eu) add(m.feito_em, "treinos", "Marcou uma etapa do treinamento", [m.casa_ref, f(o.nomeEtapa, m.etapa) || m.etapa].filter(Boolean).join(" · "), { ir: "trilhas" });
      if (!eqp && (!m.feito_por || m.feito_por === eu)) add(m.feito_em, "treinos", "Marcou uma etapa do treinamento", f(o.nomeEtapa, m.etapa) || m.etapa, { ir: "trilha" });
    }

    // Equipe da casa (quem a casa adicionou)
    for (const m of L_(d.eqc)) if (m.criado_por === eu) add(m.criado_em, "convites", eqp ? "Adicionou uma pessoa à equipe de uma casa" : "Adicionou uma pessoa à equipe", [m.nome, m.casa_ref && eqp ? m.casa_ref : ""].filter(Boolean).join(" · "), { ir: eqp ? "casas_cad" : "equipe_casa" });

    // Disponibilidade: dias e exceções marcados, juntos por dia em que a pessoa mexeu
    const porDiaDisp = {};
    for (const x of [...L_(d.disp).filter((y) => y.atualizado_por === eu), ...L_(d.dispA).filter((y) => !y.user_id || y.user_id === eu)]) {
      const q = String(x.atualizado_em || "").slice(0, 10); if (!q) continue;
      const b = (porDiaDisp[q] ||= { em: x.atualizado_em, livres: 0, nao: 0, dias: [] });
      if (String(x.atualizado_em) > b.em) b.em = x.atualizado_em;
      if (x.situacao === "indisponivel") b.nao++; else b.livres++; b.dias.push(String(x.dia).slice(0, 10));
    }
    const irDisp = o.papel === "artista" ? "disp_artista" : "agenda_casa";
    for (const b of Object.values(porDiaDisp)) {
      const n = b.livres + b.nao, ds = b.dias.sort().slice(0, 4).map(ddmm).join(", ") + (b.dias.length > 4 ? "…" : "");
      add(b.em, "disponibilidade", `Marcou ${plural(n, "dia", "dias")} na disponibilidade`, [b.livres && plural(b.livres, "livre", "livres"), b.nao && `${b.nao} sem poder`, ds].filter(Boolean).join(" · "), { ir: irDisp });
    }
    for (const s of L_(d.sem)) if (s.atualizado_por === eu || (!eqp && !s.atualizado_por && s.user_id === eu))
      add(s.atualizado_em, "disponibilidade", "Atualizou os dias fixos da semana", [s.cidade, (s.dias || []).map((i) => ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"][i]).join(", ") || "nenhum dia"].filter(Boolean).join(" · "), { ir: irDisp });

    // Próximos passos marcados (checklist da data)
    for (const c of L_(d.chk)) if (c.feito && c.user_id === eu) add(c.atualizado_em, "passos", `Marcou como feito: ${f(o.nomePasso, c.item) || c.item}`, f(o.nomeEvento, c.evento_id), { ir: "passos" });

    // Diário (complemento): só o que as colunas não contam
    for (const r of L_(d.diario)) {
      if (r.user_id && r.user_id !== eu) continue;
      const fn = DIARIO[r.acao], x = fn && fn(r.detalhe || {}); if (!x) continue;
      add(r.criado_em, x[0], x[1], "", x[2]);
    }

    // Sem repetir (mesma ação no mesmo minuto) e da mais recente para a mais antiga
    const vistos = new Set();
    return L.filter((l) => { const k = `${l.tipo}|${l.titulo}|${l.detalhe}|${l.em.slice(0, 16)}`; if (vistos.has(k)) return false; vistos.add(k); return true; })
      .sort((a, b) => b.em.localeCompare(a.em));
  }

  /** Agrupa por dia (data local AAAA-MM-DD): [[dia, linhas]], do mais recente para o mais antigo. */
  function porDia(linhas) {
    const m = new Map();
    for (const l of linhas) { const t = new Date(l.em), k = isNaN(t) ? String(l.em).slice(0, 10) : `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`; if (!m.has(k)) m.set(k, []); m.get(k).push(l); }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }

  g.TQHistorico = { TIPOS, NOME_TIPO, ACOES_DIARIO, DIARIO, montar, porDia };
})(typeof window !== "undefined" ? window : globalThis);
