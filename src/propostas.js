// Propostas de atualização (pedido da Marina, 18/11/2026): a equipe manda para a artista ou a casa as informações
// importantes que faltam, já preenchidas pelo histórico do Tranquilo (bases do Notion, src/bases.json); a pessoa
// aceita, ajusta ou recusa. Regras puras, usadas no site e nos testes (o banco confere de novo: schema v34).
(function (g) {
  "use strict";
  const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  const DIAS_LONGO = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
  const k = (x) => String(x ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const vazio = (v) => v == null || v === "" || (Array.isArray(v) && !v.length);
  // Informações importantes de cada um: [chave na Ficha, rótulo didático, tipo, opções]. Sem dados pessoais nem bancários.
  const CAMPOS = {
    artista: [
      ["cidade_base", "Cidade onde mora", "texto"],
      ["estado", "Estado (UF)", "texto"],
      ["cidades_interesse", "Cidades onde quer tocar", "lista"],
      ["formato_interesse", "Formato que mais interessa", "opcao", [["descubra", "Descubra (noite com 3 artistas)"], ["apresenta", "Apresenta (show próprio)"], ["turne", "Turnê (várias cidades)"], ["nao_sei", "Ainda não sei"]]],
      ["formacao", "Formação", "opcao", [["solo", "Solo"], ["duo", "Duo"], ["trio", "Trio"], ["banda", "Banda"]]],
      ["instagram", "Instagram", "texto"],
      ["spotify", "Link do Spotify", "texto"],
      ["whatsapp", "WhatsApp", "texto"],
      ["contato_producao", "Contato de produção", "texto"],
    ],
    casa: [
      ["cidade_uf", "Cidade/UF", "texto"],
      ["endereco", "Endereço completo", "texto"],
      ["capacidade_sentado", "Capacidade com público sentado", "numero"],
      ["funcionamento", "Dias e horários de funcionamento", "texto"],
      ["razao_social", "Razão social (para o contrato)", "texto"],
      ["cnpj", "CNPJ (para o contrato)", "texto"],
      ["instagram", "Instagram da casa", "texto"],
    ],
  };
  const campo = (tipo, chave) => CAMPOS[tipo].find(([c]) => c === chave);
  const rotulo = (tipo, chave) => campo(tipo, chave)?.[1] || chave;
  // Artista → área Agenda (Isa); casa → Operações (Gui); administração e equipe sem área → todos (igual a pode_propor).
  function podePropor(perfil, tipo) {
    if (!perfil) return false; if (perfil.tipo === "adm") return true; if (perfil.tipo !== "equipe") return false;
    return !perfil.areas?.length || perfil.areas.includes(tipo === "casa" ? "operacoes" : "agenda");
  }
  const fmtDias = (dias) => { const d = [...new Set(dias || [])].map(Number).sort((a, b) => a - b).map((i) => DIAS[i]); return d.length > 1 ? d.slice(0, -1).join(", ") + " e " + d[d.length - 1] : d[0] || ""; };
  function fmtValor(tipo, chave, v) {
    if (vazio(v)) return "";
    const c = campo(tipo, chave);
    if (Array.isArray(v)) return v.join(", ");
    if (c?.[2] === "opcao") return (c[3].find(([o]) => o === v) || [, v])[1];
    return String(v);
  }
  const instagramDe = (u) => { const m = String(u || "").match(/instagram\.com\/([^/?#]+)/i); return m ? "@" + m[1] : String(u || "").startsWith("@") ? u : ""; };
  // Dias da semana em que mais se recebeu o Tranquilo: os com pelo menos 2 noites e pelo menos metade do maior.
  function diasFortes(cont) {
    const max = Math.max(0, ...cont); if (!max) return [];
    const L = cont.map((n, i) => [i, n]).filter(([, n]) => n >= Math.max(max >= 2 ? 2 : 1, max / 2)).map(([i]) => i);
    return L;
  }
  const somaDias = (casas) => casas.reduce((s, c) => s.map((n, i) => n + (c.dias?.[i] || 0)), [0, 0, 0, 0, 0, 0, 0]);
  const vezesDia = (cont, dias) => dias.map((i) => `${DIAS[i]} (${cont[i]}x)`).join(", ");
  // O que o histórico sugere para uma casa ou artista das bases: { campos, disponibilidade, motivo }.
  function doHistorico(tipo, item, B) {
    if (!item) return { campos: {}, disponibilidade: [], motivo: "" };
    if (tipo === "casa") {
      const dias = diasFortes(item.dias || []);
      const campos = { cidade_uf: item.cidade ? item.cidade + (item.uf ? "/" + item.uf : "") : "", capacidade_sentado: item.cap || "", instagram: instagramDe(item.instagram) };
      return { campos: limpar(campos), disponibilidade: dias.length ? [{ cidade: null, dias }] : [],
        motivo: item.noites ? `Pelo histórico do Tranquilo: ${item.noites} ${item.noites === 1 ? "noite" : "noites"} na casa${dias.length ? `, mais às ${vezesDia(item.dias, dias)}` : ""}.` : "Pelo cadastro da casa nas bases do Tranquilo." };
    }
    const cidades = [...new Set([item.praca, ...(item.cidades || [])].filter(Boolean))];
    const formato = (item.formatos || []).map(k).find((f) => /apresenta|descubra|turne/.test(f));
    const campos = { cidade_base: item.mora || "", cidades_interesse: cidades, formato_interesse: formato ? formato.match(/apresenta|descubra|turne/)[0] : "", instagram: instagramDe(item.instagram), spotify: item.spotify || "" };
    const disp = (item.cidades || []).map((c) => { const cont = somaDias((B?.casas || []).filter((x) => k(x.cidade) === k(c))); return { cidade: c, dias: diasFortes(cont), cont }; }).filter((x) => x.dias.length);
    const partes = [item.vezes ? `tocou ${item.vezes}x no Tranquilo${item.cidades?.length ? " (" + item.cidades.join(", ") + ")" : ""}` : "", item.mora ? "mora em " + item.mora : "", item.praca && item.praca !== item.mora ? "prefere " + item.praca : "",
      ...disp.map((x) => `as casas de ${x.cidade} recebem mais às ${vezesDia(x.cont, x.dias)}`)].filter(Boolean);
    return { campos: limpar(campos), disponibilidade: disp.map(({ cidade, dias }) => ({ cidade, dias })), motivo: partes.length ? "Pelo histórico do Tranquilo: " + partes.join("; ") + "." : "" };
  }
  function limpar(o) { return Object.fromEntries(Object.entries(o).filter(([, v]) => !vazio(v))); }
  // Só o que falta: campos vazios na Ficha e dias de cidades que a pessoa ainda não marcou.
  function soOQueFalta(tipo, sugestao, dados, semanal) {
    const d = dados || {}, campos = Object.fromEntries(Object.entries(sugestao.campos || {}).filter(([c]) => vazio(d[c])));
    const temCid = (cid) => (semanal || []).some((s) => (s.dias || []).length && (tipo === "casa" || k(s.cidade) === k(cid) || (!s.cidade && !cid)));
    return { ...sugestao, campos, disponibilidade: (sugestao.disponibilidade || []).filter((x) => !temCid(x.cidade)) };
  }
  // Informações importantes pendentes (rótulos), para "Faltando informação" e o cartão da equipe.
  function faltando(tipo, dados, semanal, extra = {}) {
    const d = dados || {}, L = CAMPOS[tipo].filter(([c]) => vazio(d[c]) && !(tipo === "casa" && c === "cidade_uf" && d.cidade)).map(([c, r]) => ({ chave: c, rotulo: r }));
    if (!(semanal || []).some((s) => (s.dias || []).length)) L.push({ chave: "disponibilidade", rotulo: "Disponibilidade (dias da semana)" });
    if (tipo === "casa" && extra.semEquipe) L.push({ chave: "equipe", rotulo: "Equipe da casa" });
    return L;
  }
  // Antes → depois de cada campo e de cada cidade da disponibilidade, para o cartão da pessoa.
  function linhas(tipo, prop, dados, semanal) {
    const d = dados || {};
    const L = Object.entries(prop.campos || {}).map(([c, v]) => ({ chave: c, rotulo: rotulo(tipo, c), antes: fmtValor(tipo, c, d[c]), depois: fmtValor(tipo, c, v) }));
    for (const x of prop.disponibilidade || []) {
      const atual = (semanal || []).filter((s) => tipo === "casa" || k(s.cidade) === k(x.cidade)).flatMap((s) => s.dias || []);
      L.push({ chave: "disp:" + (x.cidade || ""), rotulo: tipo === "casa" || !x.cidade ? "Dias da semana em que pode receber" : `Dias em que pode tocar em ${x.cidade}`, antes: fmtDias(atual), depois: fmtDias([...atual, ...x.dias]) });
    }
    return L;
  }
  // Mensagem pronta (WhatsApp) com o que foi proposto e como responder.
  function mensagem({ nome, tipo, prop, link, convite }) {
    const ls = linhas(tipo, prop, {}, []).map((l) => `• ${l.rotulo}: ${l.depois}`).join("\n");
    return `Oi${nome ? ", " + nome : ""}! Aqui é do Tranquilo 🌿 Pelo nosso histórico com ${tipo === "casa" ? "a sua casa" : "você"}, preparamos uma sugestão para atualizar a sua ficha no portal da Rede Tranquilo:\n\n${ls}\n${prop.motivo ? "\n" + prop.motivo + "\n" : ""}\n${convite ? `Você ainda não tem conta no portal: entre por este link (use este mesmo e-mail) e a sugestão aparece logo no começo, em "Próximos passos": ${link}` : `Entre no portal e veja em "Próximos passos": ${link}`}\n\nÉ só tocar em "Aceitar tudo", "Ajustar" ou "Recusar". Aceitando, a sua ficha já fica atualizada.`;
  }
  g.TQPropostas = { CAMPOS, DIAS, DIAS_LONGO, campo, rotulo, podePropor, fmtDias, fmtValor, diasFortes, doHistorico, soOQueFalta, faltando, linhas, mensagem, vazio, chave: k };
})(typeof window !== "undefined" ? window : globalThis);
