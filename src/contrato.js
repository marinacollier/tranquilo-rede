// Contrato automático: campos do modelo, preenchimento e hash do texto assinado.
// As mesmas regras do banco (supabase/schema.sql, contrato_texto e assinar_contrato): o texto que a pessoa vê na tela
// é o texto que o banco monta e guarda, e o hash SHA-256 prova que é o mesmo.
"use strict";
const TQContrato = (() => {
  // Campos que a equipe já sabe: preenchidos sozinhos a partir da data e da conta (dá para corrigir antes de enviar).
  const DA_EQUIPE = {
    artista: "Nome artístico", data: "Data do show", cidade: "Cidade", casa: "Casa de shows", horario: "Horário",
    cache: "Cachê (R$)", evento: "Nome do evento", formato: "Formato da apresentação", data_assinatura: "Data da assinatura",
  };
  // Nomes que os modelos do Notion usam entre chaves para o que a equipe já sabe ({NOME DO ARTISTA}, {data}…).
  const SINONIMOS = {
    "nome do artista": "artista", "nome artistico": "artista", "artista": "artista",
    "data": "data", "data da edicao": "data", "data do show": "data", "data do evento": "data",
    "cidade": "cidade", "cidade/uf": "cidade", "casa": "casa", "casa de shows": "casa", "local e endereco": "casa",
    "horario": "horario", "horario de abertura": "horario", "formato": "formato", "formato da apresentacao": "formato", "modelo": "formato", "cache": "cache", "valor do cache": "cache",
    "data de hoje": "data_assinatura", "data de assinatura": "data_assinatura",
  };
  const semAcento = (s) => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  const slug = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "campo";

  // "ENDEREÇO COMPLETO" → "Endereço completo"; siglas (CPF, CNPJ, PIX…) ficam em maiúsculas.
  const SIGLAS = /^(cpf|cnpj|rg|cep|pix|uf|mei|ie|inss)$/i;
  const rotulo = (r) => r.toLowerCase().split(" ").map((w, i) => w.split("/").map((x) => SIGLAS.test(x) ? x.toUpperCase() : x).join("/")).map((w, i) => i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w).join(" ");
  /** Lê o modelo: {{chave}}, [PREENCHER rótulo], {rótulo} (como nos modelos do Notion) e [RÓTULO EM MAIÚSCULAS] viram campos.
   *  Devolve o texto com tudo como {{chave}} e a lista de campos. */
  function campos(modelo) {
    const lista = [], visto = new Set();
    const add = (chave, rotulo) => { if (!visto.has(chave)) { visto.add(chave); lista.push({ chave, rotulo }); } return `{{${chave}}}`; };
    const texto = String(modelo)
      .replace(/\[\s*PREENCHER\s*:?\s*([^\]]{1,80})\]/gi, (_, r) => { const rot = r.trim().replace(/\s+/g, " "); return add(slug(rot), rotulo(rot)); })
      .replace(/\{\{\s*([a-zA-Z0-9_]{1,40})\s*\}\}/g, (_, k) => add(k.toLowerCase(), DA_EQUIPE[k.toLowerCase()] || k.replace(/_/g, " ")))
      .replace(/(?<!\{)\{([^{}\n]{1,60})\}(?!\})/g, (_, r) => porNome(r))
      .replace(/\[([A-ZÀ-Ý][A-ZÀ-Ý0-9 /.-]{1,58})\]/g, (_, r) => porNome(r));
    function porNome(r) {
      const rot = r.trim().replace(/\s+/g, " "), k = SINONIMOS[semAcento(rot)];
      return k ? add(k, DA_EQUIPE[k]) : add(slug(rot), rotulo(rot));
    }
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
      const ab = evento.noite?.inicio || (evento.portal?.abertura ? String(evento.portal.abertura).slice(0, 5) : ""); if (ab) s.horario = ab.replace(":00", "h").replace(":", "h");
      if (evento.m) s.formato = evento.m;
    }
    s.data_assinatura = new Date().toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Sao_Paulo" });
    return s;
  }

  // Preenche o contrato com o que já está no portal (pedido da Marina, 17/11/2026): Ficha da casa (empresa, Dono A,
  // combinados), inscrição da artista e contratos anteriores da mesma pessoa. A equipe confere antes de enviar.
  // tipo = "casa" | "artista"; dados = Ficha ou inscrição; extra = { combinados, email, anteriores }.
  function doCadastro(campos, tipo, dados, extra = {}) {
    const d = dados || {}, cb = extra.combinados || {}, ant = extra.anteriores || {}, r = {};
    const cep = (t) => (String(t || "").match(/\b\d{5}-?\d{3}\b/) || [""])[0];
    const casa = [
      [/razao social/, () => d.razao_social], [/nome fantasia|nome da casa/, () => d.nome], [/^cnpj/, () => d.cnpj],
      [/inscri|municipal|estadual/, () => d.inscricao], [/^cep/, () => cep(d.endereco)],
      [/endereco (completo|da casa|comercial|do estabelecimento)|sede/, () => d.endereco],
      [/^endereco|residencial/, () => d.dono_endereco], [/nome completo|responsavel|representante|socio/, () => d.dono_nome],
      [/^rg/, () => d.dono_rg], [/^cpf/, () => d.dono_cpf], [/nascimento/, () => d.dono_nascimento],
      [/e-?mail/, () => d.dono_email || extra.email], [/telefone|whatsapp|celular/, () => d.whatsapp || d.telefone],
      [/^cidade/, () => d.cidade_uf], [/instagram/, () => d.instagram],
      [/(a ?& ?b|alimentos|bebida).*(tranquilo)|tranquilo.*(a ?& ?b|alimentos|bebida)/, () => cb.aeb?.tranquilo],
      [/(a ?& ?b|alimentos|bebida)|percentual da casa/, () => cb.aeb?.casa],
      [/bilheteria.*tranquilo/, () => cb.bilheteria?.tranquilo], [/bilheteria.*artista/, () => cb.bilheteria?.artista], [/bilheteria/, () => cb.bilheteria?.casa],
      [/titular/, () => d.rep_titular], [/^banco/, () => d.rep_banco], [/agencia/, () => d.rep_agencia], [/^conta/, () => d.rep_conta], [/pix/, () => d.rep_pix],
    ];
    const artista = [
      [/nome artistico|nome do artista/, () => d.nome_artistico], [/whatsapp|telefone|celular/, () => d.whatsapp],
      [/e-?mail/, () => extra.email], [/instagram/, () => d.instagram], [/^cidade/, () => [d.cidade_base, d.estado].filter(Boolean).join("/")],
      [/integrantes|pessoas no palco|quantidade de pessoas/, () => d.equipe_viagem || d.integrantes],
      [/redes sociais|perfil principal/, () => d.instagram], [/restri/, () => d.restricoes || "Nenhuma informada"],
    ];
    for (const c of campos) {
      const nome = semAcento(c.rotulo || c.chave);
      let v = ant[c.chave];
      if (!v) for (const [re, f] of tipo === "casa" ? casa : artista) if (re.test(nome)) { v = f(); break; }
      if (v != null && String(v).trim()) r[c.chave] = String(v).trim();
    }
    return r;
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
  /** Contrato para baixar em PDF (pedido da Marina, 17/11/2026): A4 padronizado com a marca do Tranquilo, cláusulas
   *  formatadas, o Tranquilo já como signatário e o espaço para a outra parte assinar (no papel, gov.br ou no portal). */
  function paginaImpressao(c, escapar) {
    const br = (iso) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric", timeZone: "America/Sao_Paulo" }) : "");
    const quando = c.assinado_em ? new Date(c.assinado_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "";
    const texto = String(c.texto_final || c.texto || "").replace(/\r/g, "");
    const titulo = /^(cl[aá]usula|par[aá]grafo|cap[ií]tulo|se[cç][aã]o)\b/i, caixa = /^[A-ZÀ-Ý0-9][A-ZÀ-Ý0-9 ,.ºª°§:;()\/&–—-]{4,}$/;
    const corpo = texto.split(/\n\s*\n/).map((bloco) => bloco.trim()).filter(Boolean).map((bloco) => {
      const linhas = bloco.split("\n").map((l) => l.trim()).filter(Boolean);
      return linhas.map((l) => (titulo.test(l) || (caixa.test(l) && l.length < 90) ? `<h2>${escapar(l)}</h2>` : `<p>${escapar(l)}</p>`)).join("");
    }).join("");
    const assinado = c.status === "assinado", emitido = br(c.criado_em) || br(new Date().toISOString());
    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapar(c.titulo)}</title>
<style>
@page{size:A4;margin:22mm 20mm 24mm}
*{box-sizing:border-box}
body{margin:0;background:#f2f1ee;color:#1b1b1d;font:11.5pt/1.62 Georgia,"Times New Roman",serif}
.folha{background:#fff;max-width:210mm;margin:24px auto;padding:22mm 20mm 20mm;box-shadow:0 2px 18px rgba(0,0,0,.08)}
.topo{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #1b1b1d;padding-bottom:10px;margin-bottom:22px;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
.marca{font:800 26px/1 Georgia,serif;letter-spacing:-.5px}.marca i{color:#6d7ce8;font-style:normal}
.marca small{display:block;font:600 9px/1.4 system-ui,sans-serif;letter-spacing:3px;color:#666;margin-top:4px}
.meta{text-align:right;font-size:9pt;color:#555;line-height:1.5}
h1{font:700 15pt/1.3 system-ui,-apple-system,"Segoe UI",sans-serif;margin:0 0 18px;text-wrap:balance}
h2{font:700 10.5pt/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:.3px;margin:18px 0 6px;break-after:avoid}
p{margin:0 0 8px;text-align:justify;hyphens:auto;orphans:3;widows:3}
.assinaturas{display:grid;grid-template-columns:1fr 1fr;gap:28px;margin-top:40px;break-inside:avoid;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
.campo-ass{border-top:1.5px solid #1b1b1d;padding-top:8px;font-size:9.5pt;line-height:1.45}
.campo-ass b{display:block;font-size:10pt}
.selo{display:inline-block;margin-bottom:6px;padding:5px 9px;border:1.5px solid #2f7d4f;color:#2f7d4f;border-radius:6px;font:700 8.5pt/1.3 system-ui,sans-serif}
.vazio{height:33px}
.registro{margin-top:26px;padding:12px 14px;background:#f6f6f4;border-radius:8px;font:9pt/1.5 system-ui,sans-serif;color:#333;break-inside:avoid}
.registro b{display:inline-block;min-width:140px}
.rodape{margin-top:28px;padding-top:8px;border-top:1px solid #ddd;font:8.5pt/1.4 system-ui,sans-serif;color:#777;display:flex;justify-content:space-between;gap:12px}
.acoes{position:sticky;top:0;z-index:2;display:flex;gap:10px;justify-content:center;flex-wrap:wrap;padding:12px;background:#1b1b1d;font-family:system-ui,sans-serif}
.acoes button{font:600 14px system-ui;padding:10px 18px;border-radius:999px;border:0;cursor:pointer;background:#fff;color:#1b1b1d}
.acoes span{color:#ddd;font-size:13px;align-self:center}
@media (max-width:640px){.folha{padding:18px}.assinaturas{grid-template-columns:1fr}}
@media print{body{background:#fff}.folha{box-shadow:none;margin:0;padding:0;max-width:none}.acoes{display:none}}
</style></head><body>
<div class="acoes"><button onclick="print()">Baixar em PDF</button><span>Na janela que abrir, escolha “Salvar como PDF”.</span></div>
<main class="folha">
<header class="topo"><div class="marca">T<i>.</i> Tranquilo<small>REDE TRANQUILO</small></div>
<div class="meta">Emitido em ${escapar(emitido)}${c.hash ? `<br>Verificação ${escapar(c.hash.slice(0, 12))}` : ""}</div></header>
<h1>${escapar(c.titulo)}</h1>
${corpo}
<section class="assinaturas">
<div><div class="selo">✓ Assinado pelo Tranquilo</div><div class="campo-ass"><b>TRANQUILO</b>Contratante · emitido e assinado em ${escapar(emitido)}</div></div>
<div>${assinado ? `<div class="selo">✓ Assinado eletronicamente</div>` : `<div class="vazio"></div>`}<div class="campo-ass"><b>${escapar(assinado ? c.assinado_nome : "Nome completo")}</b>${assinado ? `Contratada(o) · ${escapar(quando)}` : "Contratada(o) · assinatura e data"}</div></div>
</section>
${assinado ? `<div class="registro"><div><b>Assinado por</b>${escapar(c.assinado_nome)}</div><div><b>Data e hora</b>${escapar(quando)} (Brasília)</div><div><b>IP</b>${escapar(c.ip || "não registrado")}</div><div><b>Código SHA-256</b>${escapar(c.hash)}</div>
<div style="margin-top:6px">Assinatura eletrônica na Rede Tranquilo: a pessoa leu o contrato até o fim, confirmou que concorda e digitou o nome completo. O código é a impressão digital do texto: qualquer mudança no texto muda o código.</div></div>`
  : `<div class="registro">Para assinar: assine no campo acima (à mão ou pelo gov.br), salve em PDF e envie de volta pela Rede Tranquilo, na aba Contratos. Se preferir, assine direto no portal, sem imprimir.</div>`}
<footer class="rodape"><span>Rede Tranquilo · tranquilomusica.com.br</span><span>${escapar(c.titulo).slice(0, 80)}</span></footer>
</main></body></html>`;
  }

  return { campos, doCadastro, preencher, sugestoes, hash, situacao, paginaImpressao, DA_EQUIPE };
})();
if (typeof module !== "undefined") module.exports = TQContrato;
