// Contrato automático: campos do modelo, preenchimento e hash do texto assinado.
// As mesmas regras do banco (supabase/schema.sql, contrato_texto e assinar_contrato): o texto que a pessoa vê na tela
// é o texto que o banco monta e guarda, e o hash SHA-256 prova que é o mesmo.
"use strict";
const TQContrato = (() => {
  // Campos que a equipe já sabe: preenchidos sozinhos a partir da data e da conta (dá para corrigir antes de enviar).
  const DA_EQUIPE = {
    artista: "Nome artístico", data: "Data do show", cidade: "Cidade", casa: "Casa de shows", horario: "Horário",
    cache: "Cachê (R$)", evento: "Nome do evento",
  };
  const slug = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "campo";

  // "ENDEREÇO COMPLETO" → "Endereço completo"; siglas (CPF, CNPJ, PIX…) ficam em maiúsculas.
  const SIGLAS = /^(cpf|cnpj|rg|cep|pix|uf|mei|ie|inss)$/i;
  const rotulo = (r) => r.toLowerCase().split(" ").map((w, i) => SIGLAS.test(w) ? w.toUpperCase() : i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w).join(" ");
  /** Lê o modelo: {{chave}} e [PREENCHER rótulo] viram campos. Devolve o texto com tudo como {{chave}} e a lista de campos. */
  function campos(modelo) {
    const lista = [], visto = new Set();
    const add = (chave, rotulo) => { if (!visto.has(chave)) { visto.add(chave); lista.push({ chave, rotulo }); } return `{{${chave}}}`; };
    const texto = String(modelo)
      .replace(/\[\s*PREENCHER\s*:?\s*([^\]]{1,80})\]/gi, (_, r) => { const rot = r.trim().replace(/\s+/g, " "); return add(slug(rot), rotulo(rot)); })
      .replace(/\{\{\s*([a-zA-Z0-9_]{1,40})\s*\}\}/g, (_, k) => add(k.toLowerCase(), DA_EQUIPE[k.toLowerCase()] || k.replace(/_/g, " ")));
    return { texto, campos: lista };
  }

  /** Substitui os campos pelos valores, na mesma ordem do banco. */
  function preencher(texto, lista, dados) {
    let t = String(texto);
    for (const c of lista) t = t.split(`{{${c.chave}}}`).join(dados?.[c.chave] ?? "");
    return t;
  }

  /** Valores que a equipe já sabe para esta data e conta. */
  function sugestoes(evento, conta) {
    const s = {};
    if (conta) s.artista = conta.vinculo_nome || conta.nome || "";
    if (evento) {
      const [y, m, d] = String(evento.d || "").split("-");
      if (y) s.data = `${d}/${m}/${y}`;
      s.cidade = evento.c || ""; s.casa = evento.h || ""; s.evento = evento.t || evento.n || "";
    }
    return s;
  }

  async function hash(texto) {
    const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
    return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
  }

  /** Situação para mostrar na tela. */
  function situacao(c) {
    if (c.status === "assinado") return { rotulo: "Assinado", classe: "b-good" };
    if (c.status === "cancelado") return { rotulo: "Cancelado", classe: "" };
    const falta = (c.campos || []).filter((x) => !String(c.dados?.[x.chave] ?? "").trim());
    if (falta.length) return { rotulo: "Aguardando dados", classe: "b-warn", falta };
    return c.lido_fim_em ? { rotulo: "Lido, falta assinar", classe: "b-warn" } : { rotulo: "Aguardando leitura", classe: "b-warn" };
  }

  /** Página para imprimir ou salvar em PDF: o texto assinado e o registro da assinatura. */
  function paginaImpressao(c, escapar) {
    const quando = c.assinado_em ? new Date(c.assinado_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "";
    const texto = c.texto_final || c.texto;
    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escapar(c.titulo)}</title>
<style>body{font:15px/1.6 Georgia,serif;max-width:720px;margin:40px auto;padding:0 20px;color:#111}h1{font-size:20px}pre{white-space:pre-wrap;font:inherit}
.ass{border-top:2px solid #111;margin-top:32px;padding-top:12px;font:13px/1.5 system-ui,sans-serif}.ass b{display:inline-block;min-width:150px}
.botao{font:600 14px system-ui;padding:10px 16px;margin:0 0 20px;cursor:pointer}@media print{.botao{display:none}}</style></head><body>
<button class="botao" onclick="print()">Imprimir ou salvar em PDF</button>
<h1>${escapar(c.titulo)}</h1><pre>${escapar(texto)}</pre>
${c.status === "assinado" ? `<div class="ass"><div><b>Assinado por</b> ${escapar(c.assinado_nome)}</div><div><b>Em</b> ${escapar(quando)} (horário de Brasília)</div>
<div><b>IP</b> ${escapar(c.ip || "não registrado")}</div><div><b>Navegador</b> ${escapar(c.navegador || "não registrado")}</div>
<div><b>Código de verificação</b> SHA-256 ${escapar(c.hash)}</div>
<p>Assinatura eletrônica: a pessoa leu o contrato até o fim, confirmou que concorda e digitou o nome completo na área dela da Rede Tranquilo. O código acima é a impressão digital do texto: qualquer mudança no texto muda o código.</p></div>` : `<div class="ass">Ainda não assinado.</div>`}
</body></html>`;
  }

  return { campos, preencher, sugestoes, hash, situacao, paginaImpressao, DA_EQUIPE };
})();
if (typeof module !== "undefined") module.exports = TQContrato;
