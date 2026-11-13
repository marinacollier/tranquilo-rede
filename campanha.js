// Lê a campanha de uma casa e devolve { titulo, casa, slug, fonte_url, itens: [{ chave, dia, rotulo, acoes }] }.
// Aceita os dois formatos do Bruno:
//   · a página HTML da campanha (formato atual: <label class="dia"> com <div class="acao">);
//   · o arquivo de dados da casa (JSON): { itens: [{ dia, acoes: [...] }] } ou uma lista de ações
//     [{ dia, canal, texto, show, canva | modelo | link | links }], que é agrupada por dia.
// Usado na tela de Campanhas (equipe importa pelo site) e em scripts/importar-campanha.mjs. Só lê: não altera a fonte.
"use strict";
(function (raiz) {
  const limpa = (s) => String(s ?? "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
  const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  const rotuloDe = (iso) => `${SEMANA[new Date(iso + "T12:00:00Z").getUTCDay()]} ${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  const https = (u) => /^https:\/\/\S+$/i.test(String(u || "").trim());

  // "2026-10-20", "20/10/2026", "20/10" (usa o ano informado) ou data do Excel/Sheets em texto ISO com hora.
  function dataISO(v, ano) {
    const s = String(v ?? "").trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/); if (m) return `${m[3] || ano}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    return null;
  }

  function deHtml(html, ano) {
    const titulo = limpa((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || "") || "Campanha";
    const itens = [];
    for (const m of html.matchAll(/<label class="dia[^"]*">\s*<input type="checkbox" data-k="([^"]+)">([\s\S]*?)<\/label>/g)) {
      const [, chave, corpo] = m;
      const quando = limpa((corpo.match(/class="quando">([\s\S]*?)<\/span>/) || [])[1] || "");
      const dm = quando.match(/(\d{2})\/(\d{2})/);
      if (!dm) continue;
      const acoes = [];
      for (const a of corpo.matchAll(/<div class="acao">([\s\S]*?)<\/div>\s*(?=<div class="acao">|<\/div>\s*$|$)/g)) {
        const bloco = a[1];
        const canal = limpa((bloco.match(/class="canal[^"]*">([\s\S]*?)<\/span>/) || [])[1] || "");
        if (!canal) continue;
        acoes.push({
          canal,
          show: limpa((bloco.match(/class="qual">([\s\S]*?)<\/span>/) || [])[1] || ""),
          texto: limpa((bloco.match(/class="faz">([\s\S]*?)<\/p>/) || [])[1] || ""),
          links: [...bloco.matchAll(/<a href="(https:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map((l) => ({ url: l[1], rotulo: limpa(l[2]) })),
        });
      }
      itens.push({ chave, dia: `${ano}-${dm[2]}-${dm[1]}`, rotulo: quando, acoes });
    }
    return { titulo, itens };
  }

  // Uma ação do arquivo de dados, com os nomes de campo que o build pode usar.
  function acaoDe(a) {
    const links = [];
    for (const l of [].concat(a.links || [])) {
      if (typeof l === "string" && https(l)) links.push({ url: l.trim(), rotulo: "link" });
      else if (l && https(l.url)) links.push({ url: l.url.trim(), rotulo: limpa(l.rotulo || l.nome || "link") });
    }
    for (const [k, rot] of [["canva", "Canva"], ["modelo", "Canva"], ["modelo_canva", "Canva"], ["link", "link"], ["url", "link"], ["link_rastreado", "link"]])
      if (https(a[k]) && !links.some((l) => l.url === a[k].trim())) links.push({ url: a[k].trim(), rotulo: rot });
    return { canal: limpa(a.canal || a.rede || a.onde || ""), show: limpa(a.show || a.qual || a.data_show || ""), texto: limpa(a.texto || a.acao || a.descricao || a.faz || ""), links };
  }

  function deDados(obj, ano) {
    const raizObj = Array.isArray(obj) ? { acoes: obj } : obj || {};
    const porDia = new Map();
    const junta = (dia, chave, rotulo, acoes) => {
      if (!dia) return;
      const it = porDia.get(dia) || { chave: chave || "d" + dia.slice(5, 7) + dia.slice(8, 10), dia, rotulo: rotulo || rotuloDe(dia), acoes: [] };
      it.acoes.push(...acoes.filter((a) => a.canal || a.texto)); porDia.set(dia, it);
    };
    const dias = raizObj.itens || raizObj.dias;
    if (Array.isArray(dias)) for (const d of dias) junta(dataISO(d.dia || d.data, ano), d.chave, d.rotulo, (d.acoes || []).map(acaoDe));
    const soltas = raizObj.acoes || raizObj.campanha;
    if (Array.isArray(soltas)) for (const a of soltas) junta(dataISO(a.dia || a.data, ano), null, null, [acaoDe(a)]);
    const itens = [...porDia.values()].sort((a, b) => a.dia.localeCompare(b.dia));
    return { titulo: limpa(raizObj.titulo || raizObj.nome || "") || "Campanha", casa: limpa(raizObj.casa || ""), slug: raizObj.slug || "", fonte_url: https(raizObj.fonte_url) ? raizObj.fonte_url : "", itens };
  }

  /** texto: conteúdo do arquivo (HTML ou JSON). Lança erro se não achar nenhum dia, para nunca importar campanha vazia. */
  function ler(texto, { ano = new Date().getFullYear() } = {}) {
    const t = String(texto || "").replace(/^﻿/, "").trim();
    let r;
    if (/^[[{]/.test(t)) { let j; try { j = JSON.parse(t); } catch { throw new Error("O arquivo parece JSON, mas não abriu. Confira se ele está completo."); } r = deDados(j, ano); }
    else r = deHtml(t, ano);
    if (!r.itens.length) throw new Error("Nenhum dia de campanha encontrado. O formato do arquivo mudou? Nada foi importado.");
    const semAcao = r.itens.filter((i) => !i.acoes.length).map((i) => i.rotulo);
    return { ...r, avisos: semAcao.length ? [`Dias sem ações lidas: ${semAcao.join(", ")}`] : [] };
  }

  raiz.TQCampanha = { ler, dataISO };
})(typeof window !== "undefined" ? window : globalThis);
