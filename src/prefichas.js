// Pré-fichas pelo Notion (pedido da Marina, 18/11/2026: "preciso de tudo em produção"). Em produção ainda não há casa
// nem artista com conta, mas a equipe já tem muito dado real: a agenda e o histórico do Notion (pacote da equipe) e as
// bases Casas de Shows e Artistas e bandas (src/bases.json e o pacote). Aqui, regras puras (site e testes):
//  - casas() e artistas(): cada casa/artista real com os campos da Ficha que já sabemos ("do Notion"), as noites que
//    já fez, as próximas datas e os dias em que costuma receber;
//  - campos(): o que vai na proposta de atualização que acompanha o convite ("Solicitar à casa");
//  - sugestoes(): casa nos dias em que mais recebe ↔ artistas ligadas à cidade (para a Agenda).
(function (g) {
  "use strict";
  const k = (x) => String(x ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  const vazio = (v) => v == null || v === "" || (Array.isArray(v) && !v.length);
  const generica = (n) => /^Casa (em|da rede)\b/.test(String(n || ""));
  const semTraco = (id) => String(id || "").replace(/-/g, "");
  const instagramDe = (u) => { const s = String(u || "").trim(); const m = s.match(/instagram\.com\/([^/?#]+)/i); return m ? "@" + m[1] : s.startsWith("@") ? s : s ? "@" + s.replace(/^@/, "") : ""; };
  const MENORES = { "permite": "permite", "permite com responsavel legal": "responsavel", "nao permite": "nao" };
  const somaDia = (dias, iso) => { dias[new Date(iso + "T12:00:00Z").getUTCDay()]++; };
  // Status do Notion que contam como "noite que aconteceu ou vai acontecer" (mesmo critério de scripts/bases-publicas.mjs).
  const valeNoite = (e) => !e.z && /realizado|vendas|confirmad|pré|andamento/i.test(e.s || "") && /^\d{4}-\d{2}-\d{2}$/.test(e.d || "");
  const ordenar = (L) => L.sort((a, b) => a.d.localeCompare(b.d));

  // Casas reais: base do Notion (pacote da equipe, mais completo) e bases.json, mais os eventos do pacote.
  // ent: { notion: P.notion.casas, bases: B.casas, eventos: P.eventos, enderecos: P.enderecos, fichas: P.fichas, hoje }
  function casas(ent) {
    const hoje = ent.hoje, porId = new Map(), norm = (o) => Object.fromEntries(Object.entries(o || {}).map(([i, v]) => [semTraco(i), v]));
    const fichas = norm(ent.fichas), enderecos = norm(ent.enderecos);
    const pega = (id) => { id = semTraco(id); if (!porId.has(id)) porId.set(id, { id, nome: "", cidade: "", uf: "", valores: {}, eventos: [], dias: [0, 0, 0, 0, 0, 0, 0], noites: 0, ultima: "", avaliacao: "" }); return porId.get(id); };
    const poe = (c, chave, v) => { if (!vazio(v) && vazio(c.valores[chave])) c.valores[chave] = v; };
    for (const n of ent.notion || []) {
      const c = pega(n.id); c.nome ||= n.n || ""; c.cidade ||= n.cid || ""; c.uf ||= n.uf || ""; c.avaliacao ||= n.av || "";
      poe(c, "capacidade", n.cp); poe(c, "capacidade_sentado", n.cs); poe(c, "instagram", n.ig && instagramDe(n.ig)); poe(c, "site", n.site); poe(c, "rider", n.rider);
      poe(c, "menores", MENORES[k(n.men)]);
    }
    for (const b of ent.bases || []) {
      const c = pega(b.id); c.nome ||= b.nome || ""; c.cidade ||= b.cidade || ""; c.uf ||= b.uf || ""; c.avaliacao ||= b.avaliacao || "";
      poe(c, "capacidade", b.cap_pe); poe(c, "capacidade_sentado", b.cap_sentado || (!b.cap_pe ? b.cap : null)); poe(c, "instagram", b.instagram && instagramDe(b.instagram));
      poe(c, "site", b.site); poe(c, "rider", b.rider); poe(c, "menores", MENORES[k(b.menores)]);
    }
    for (const e of ent.eventos || []) {
      if (!e.k) continue; const c = pega(e.k);
      if (!c.nome && e.h) c.nome = e.h; if (!c.cidade && e.c) c.cidade = e.c;
      if (!e.z) c.eventos.push(e);
      if (valeNoite(e) && e.d <= hoje) { somaDia(c.dias, e.d); c.noites++; if (e.d > c.ultima) c.ultima = e.d; }
      else if (valeNoite(e)) somaDia(c.dias, e.d);
    }
    for (const c of porId.values()) {
      const f = fichas[c.id] || {};
      for (const ch of ["endereco", "complemento", "como_chegar", "capacidade", "capacidade_sentado", "site", "rider"]) poe(c, ch, f[ch]);
      if (f.instagram) poe(c, "instagram", instagramDe(f.instagram));
      if (f.menores) poe(c, "menores", MENORES[k(f.menores)] || f.menores);
      poe(c, "endereco", enderecos[c.id]);
      if (!generica(c.nome)) poe(c, "nome", c.nome); else if (f.nome && !generica(f.nome)) { c.nome = f.nome; poe(c, "nome", f.nome); }
      poe(c, "cidade_uf", c.cidade ? c.cidade + (c.uf ? "/" + c.uf : "") : "");
      ordenar(c.eventos);
      c.realizadas = c.eventos.filter((e) => e.d < hoje && (e.r || valeNoite(e))).reverse();
      c.proximas = c.eventos.filter((e) => e.d >= hoje);
      c.diasFortes = diasFortes(c.dias);
    }
    return [...porId.values()].filter((c) => c.nome);
  }
  // Dias da semana em que a casa mais recebe: pelo menos 2 noites (ou 1, se é o máximo) e pelo menos metade do maior.
  function diasFortes(cont) {
    const max = Math.max(0, ...cont); if (!max) return [];
    return cont.map((n, i) => [i, n]).filter(([, n]) => n >= Math.max(max >= 2 ? 2 : 1, max / 2)).map(([i]) => i);
  }

  // Artistas reais: base Artistas e bandas (pacote e bases.json), fila de curadoria e quem está nos line-ups.
  // ent: { notion: P.notion.artistas, bases: B.artistas, fila: B.fila, eventos: P.eventos, hoje }
  const FORMATO = (f) => { const x = k(f); return /apresenta/.test(x) ? "apresenta" : /descubra/.test(x) ? "descubra" : /turne/.test(x) ? "turne" : ""; };
  function artistas(ent) {
    const hoje = ent.hoje, porChave = new Map();
    const pega = (nome, id) => { const ch = k(nome); if (!ch) return null; if (!porChave.has(ch)) porChave.set(ch, { id: id ? semTraco(id) : "", nome, valores: {}, status: "", eventos: [], cidadesTocou: [], formatos: [], vezes: 0 }); const a = porChave.get(ch); if (!a.id && id) a.id = semTraco(id); return a; };
    const poe = (a, chave, v) => { if (!vazio(v) && vazio(a.valores[chave])) a.valores[chave] = v; };
    for (const n of ent.notion || []) {
      const a = pega(n.n, n.id); if (!a) continue; a.status ||= n.st || "";
      poe(a, "cidade_base", n.mora); poe(a, "generos", (n.gen || []).join(", ")); poe(a, "instagram", n.ig && instagramDe(n.ig)); poe(a, "spotify", n.sp);
      poe(a, "youtube", n.yt); poe(a, "outro_link", n.site || n.dz);
      const cids = [...(n.praca || []), ...((n.sug?.cidades || []).map((x) => x[0]))]; poe(a, "cidades_interesse", [...new Set(cids.filter(Boolean))]);
      a.formatos = [...new Set([...a.formatos, ...((n.sug?.formatos || []).map((x) => x[0]))])];
    }
    for (const b of [...(ent.bases || []), ...(ent.fila || [])]) {
      const a = pega(b.nome, b.id); if (!a) continue; a.status ||= b.status || "";
      poe(a, "cidade_base", b.mora); poe(a, "generos", b.generos); poe(a, "instagram", b.instagram && instagramDe(b.instagram)); poe(a, "spotify", b.spotify);
      poe(a, "cidades_interesse", [...new Set([b.praca, ...(b.cidades || [])].filter(Boolean))]);
      a.formatos = [...new Set([...a.formatos, ...(b.formatos || [])])]; a.vezes = Math.max(a.vezes, b.vezes || 0);
      if (b.praca) a.praca ||= b.praca;
    }
    for (const e of ent.eventos || []) {
      if (e.z) continue;
      for (const nome of e.a || []) { const a = pega(nome); if (!a) continue; a.eventos.push(e); if (e.c && e.d < hoje && !a.cidadesTocou.includes(e.c)) a.cidadesTocou.push(e.c); }
    }
    for (const a of porChave.values()) {
      ordenar(a.eventos); poe(a, "nome_artistico", a.nome);
      a.realizadas = a.eventos.filter((e) => e.d < hoje).reverse(); a.proximas = a.eventos.filter((e) => e.d >= hoje);
      a.vezes = Math.max(a.vezes, a.realizadas.length);
      poe(a, "cidades_interesse", a.cidadesTocou);
      poe(a, "formato_interesse", a.formatos.map(FORMATO).find(Boolean) || [...a.eventos].reverse().map((e) => FORMATO(e.m || e.n)).find(Boolean));
    }
    return [...porChave.values()];
  }

  // O que vai na proposta que acompanha o convite: tudo o que já sabemos (só os campos que a proposta aceita).
  function campos(pf, permitidos) {
    const ok = new Set(permitidos);
    return Object.fromEntries(Object.entries(pf.valores || {}).filter(([c, v]) => ok.has(c) && !vazio(v)));
  }
  // Campos de uma Ficha (lista [chave, rótulo, …]) com a origem: { chave, rotulo, valor, fonte: "notion" | "falta" }.
  function marcar(pf, lista) {
    return lista.map(([chave, rotulo]) => { const v = pf.valores?.[chave]; return { chave, rotulo, valor: v, fonte: vazio(v) ? "falta" : "notion" }; });
  }

  // Sugestão por histórico: casa (com 2+ noites) nos dias em que mais recebe ↔ artistas ligadas à cidade, sem data no dia.
  // B = bases.json; ocupados = Set("casa|dia") já com data.
  function sugestoes(B, ocupados, de, ate, max = 30) {
    if (!B?.casas) return [];
    const dias = []; for (let d = new Date(de + "T12:00:00Z"); d.toISOString().slice(0, 10) <= ate && dias.length < 62; d.setUTCDate(d.getUTCDate() + 1)) dias.push(d.toISOString().slice(0, 10));
    const out = [];
    for (const c of B.casas.filter((x) => x.noites >= 2)) {
      const tops = diasFortes(c.dias || []); if (!tops.length) continue;
      const arts = (B.artistas || []).filter((a) => [a.praca, a.mora, ...(a.cidades || [])].some((x) => k(x) && k(x) === k(c.cidade)))
        .map((a) => ({ a, pts: (k(a.praca) === k(c.cidade) ? 3 : 0) + (k(a.mora) === k(c.cidade) ? 2 : 0) + ((a.cidades || []).some((x) => k(x) === k(c.cidade)) ? 2 : 0) + (a.ja_tocou ? 1 : 0) + Math.min(a.vezes || 0, 3) }))
        .sort((x, y) => y.pts - x.pts);
      for (const dia of dias.filter((d) => tops.includes(new Date(d + "T12:00:00Z").getUTCDay())).slice(0, 1)) {
        if (ocupados?.has(`${k(c.nome)}|${dia}`)) continue;
        const livres = arts.filter(({ a }) => !a.bloqueio_ate || a.bloqueio_ate < dia).slice(0, 3).map(({ a }) => a);
        if (livres.length) out.push({ casa: c, dia, artistas: livres });
      }
    }
    return out.sort((x, y) => x.dia.localeCompare(y.dia)).slice(0, max);
  }

  g.TQPreFicha = { casas, artistas, campos, marcar, sugestoes, diasFortes, instagramDe, chave: k, vazio, generica };
})(typeof window !== "undefined" ? window : globalThis);
