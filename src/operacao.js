// Manuais de operação do Descubra e do Apresenta (equipe de Operações do Tranquilo, versão de 21/10/2026).
// Uma fonte só para o que a casa e a artista veem em cada data: cronograma padrão, cortesias, camarim,
// rider técnico, padrão da noite (inclui crianças), equipe por função e o que fazer depois do evento.
// Mudou o manual? Mude aqui e a data de VERSAO.
"use strict";
const TQOperacao = (() => {
  const VERSAO = "21/10/2026";
  const FONTE = "Manual de operação do Tranquilo (Operações)";

  const CRONOGRAMA = {
    Descubra: { nota: "Edição com 3 artistas. Mesmo horário em todas as cidades; a casa só ajusta se combinar antes com a Operações. No dia, não muda.", linhas: [
      ["15h00", "Chegada da equipe e montagem técnica"], ["16h00", "Chegada da equipe de bar"],
      ["16h10 às 16h40", "Passagem de som · artista 3"], ["16h50 às 17h20", "Passagem de som · artista 2"], ["17h30 às 18h00", "Passagem de som · artista 1"],
      ["18h00", "Chegada da equipe operacional · ajustes finais até 19h"], ["19h00", "Abertura da casa"],
      ["19h50", "Abertura pelo anfitrião (aviso de 10 min às 19h40)"],
      ["20h00 às 20h30", "Artista 1"], ["20h45 às 21h15", "Artista 2"], ["21h30 às 22h00", "Artista 3"], ["22h00 às 23h00", "Desmontagem e fechamento"],
    ] },
    "Apresenta:semana": { nota: "Show com 2 artistas, segunda a sexta. O horário de cada show vem do contrato; a casa só ajusta se combinar antes com a Operações. No dia, não muda.", linhas: [
      ["15h30 às 16h30", "Passagem de som · artista principal"], ["16h50 às 17h20", "Passagem de som · abertura (quem abre passa por último)"],
      ["19h00", "Abertura da casa"], ["20h10 às 20h40", "Show · abertura"], ["20h40 às 21h00", "Intervalo e troca de palco"], ["21h00 às 22h00", "Show · artista principal"],
    ] },
    "Apresenta:fim": { nota: "Show com 2 artistas, sábado e domingo. O horário de cada show vem do contrato; a casa só ajusta se combinar antes com a Operações. No dia, não muda.", linhas: [
      ["13h00 às 14h00", "Passagem de som · artista principal"], ["14h10 às 14h40", "Passagem de som · abertura"],
      ["16h00", "Abertura da casa"], ["17h20 às 17h50", "Show · abertura"], ["17h50 às 18h10", "Intervalo e troca de palco"], ["18h10 às 19h10", "Show · artista principal"],
    ] },
  };
  const CAMARIM = {
    Descubra: ["18 águas sem rótulo, em temperatura ambiente", "10 Lambe Lambe e 10 Estrella Galicia", "5 refrigerantes", "6 maçãs"],
    Apresenta: ["18 águas sem rótulo em temperatura ambiente e 6 geladas", "12 Lambe Lambe e 12 Estrella Galicia", "6 refrigerantes em lata", "2 caixas de Bis e 1 cacho de banana", "6 maçãs"],
  };
  const CORTESIAS = "Por artista: 2 a 3 pessoas da equipe e 3 a 4 convidados. A casa pede os nomes ao artista e monta a lista da portaria.";
  const RIDER_TECNICO = [
    ["Formações", "Voz e violão, voz e piano, duo, trio acústico e formações reduzidas. O que passar disso é avaliado antes."],
    ["Mesa", "Digital, mínimo 18 canais, com controle por tablet (XR18, UI24R, M32, QL/CL)"],
    ["P.A.", "Até 250 pessoas: 2 caixas ativas de 12\" ou 15\" (1000W RMS no total). De 250 a 500: 2 de 15\" e sub se precisar"],
    ["Monitor", "Mínimo 3 vias independentes (chão ou in-ear)"],
    ["Microfones", "4 SM58, 2 SM57 e 2 condensadores pequenos (ou equivalentes)"],
    ["DI e pedestais", "4 DIs passivos · 4 pedestais grandes, 2 médios e 2 pequenos"],
    ["Palco", "4 pontos de 110V, 3 cadeiras ou banquetas sem braço, 2 suportes de instrumento e 1 mesinha"],
    ["Técnico de som", "Presente durante todo o evento. O som fica montado antes da chegada dos artistas."],
  ];
  const PADRAO_NOITE = [
    "Palco é o ponto mais iluminado, com 2 a 4 pontos de luz no artista, cadeiras e o letreiro “Ouvidos Atentos, Corações Abertos”.",
    "Plateia em penumbra durante o show; no intervalo a luz sobe só o necessário.",
    "Bar em silêncio durante o show, sem reposição barulhenta. O intervalo é o momento de vender.",
    "Público assiste sentado; a entrada com canga é incentivada.",
    "Equipe fala baixo e trata todo mundo com cuidado.",
    "Crianças: até 3 anos não pagam; de 3 a 14 anos pagam ingresso criança (50%); menores de 10 só entram com responsável.",
  ];
  const PADRAO_APRESENTA = [
    "Lugar para sentar para todo mundo (cangas, almofadas e pufes), circulação livre e bem sinalizada.",
    "Cenografia faz parte do show: planos e alturas diferentes, luz cênica integrada e marca discreta.",
    "O público já sabe quem vai tocar: não tem Olho no Olho.",
  ];
  const CHECKLIST_SEMANA = {
    artistas: ["Cronograma do dia, com horário de chegada e de passagem de som", "Alimentação e consumação", "Camarim (o que vai ter e onde fica)", "Lista de entrada e cortesias"],
    operacoes: ["Rider técnico atendido (ou o que muda, avisado antes)", "Equipe escalada: produtor, técnico de som, bar e portaria, com uma pessoa reserva", "Operadores de porta cadastrados e treinados na Ingresse", "Bebidas e insumos conferidos (quantidade, validade, gelo e copos)", "Material gráfico da semana impresso (A3 colorido, couché, 2 cópias de cada página)"],
  };
  const DEPOIS = [
    "Estoque: preencher a planilha da cidade em até 2 dias. Novos pedidos de bebida só depois desse preenchimento.",
    "Fechamento: lançar o evento na planilha de fechamento toda semana.",
    "Artistas: o produtor pergunta como foi a experiência e repassa o retorno ao Tranquilo.",
  ];

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const lista = (xs) => `<ul class="passos">${xs.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;
  const tabela = (linhas, cab) => `<div class="tbl-wrap" style="overflow-x:auto"><table class="tbl"><thead><tr><th>${esc(cab[0])}</th><th>${esc(cab[1])}</th></tr></thead><tbody>${linhas.map(([a, b]) => `<tr><td style="white-space:nowrap"><b>${esc(a)}</b></td><td>${esc(b)}</td></tr>`).join("")}</tbody></table></div>`;
  const produto = (modelo) => /apresenta/i.test(modelo || "") ? "Apresenta" : /descubra/i.test(modelo || "") ? "Descubra" : null;
  // Sábado e domingo usam o cronograma de fim de semana do Apresenta.
  const fimDeSemana = (iso) => { const d = new Date(iso + "T12:00:00Z").getUTCDay(); return d === 0 || d === 6; };

  /** Cronograma padrão da data (ou null quando o produto não tem manual). */
  function cronograma(modelo, iso) {
    const p = produto(modelo); if (!p) return null;
    return p === "Descubra" ? CRONOGRAMA.Descubra : CRONOGRAMA[fimDeSemana(iso) ? "Apresenta:fim" : "Apresenta:semana"];
  }

  /** Bloco "Como é a noite" de uma data, para a casa ou para a artista. */
  function bloco(e, perfil) {
    const p = produto(e.m), c = cronograma(e.m, e.d); if (!p || !c) return "";
    const casa = perfil === "casa";
    return `<details style="margin-top:6px"><summary>Como é a noite (${p})</summary>
      <p class="muted" style="font-size:13px;margin:8px 0 4px">${esc(c.nota)}</p>${tabela(c.linhas, ["Horário", "O que acontece"])}
      <h4 style="margin:12px 0 4px">Cortesias</h4><p style="margin:0">${esc(CORTESIAS)}</p>
      <h4 style="margin:12px 0 4px">Camarim</h4>${lista(CAMARIM[p])}
      ${casa ? `<h4 style="margin:12px 0 4px">Até 4 a 5 dias antes: fixar no grupo com os artistas</h4>${lista(CHECKLIST_SEMANA.artistas)}
      <h4 style="margin:12px 0 4px">E confirmar com a Operações</h4>${lista(CHECKLIST_SEMANA.operacoes)}
      <h4 style="margin:12px 0 4px">Rider técnico</h4>${tabela(RIDER_TECNICO, ["Item", "Padrão"])}` : `<h4 style="margin:12px 0 4px">Rider técnico da casa</h4>${tabela(RIDER_TECNICO, ["Item", "Padrão"])}`}
      <h4 style="margin:12px 0 4px">Padrão da noite</h4>${lista(p === "Apresenta" ? PADRAO_NOITE.concat(PADRAO_APRESENTA) : PADRAO_NOITE)}
      ${casa ? `<h4 style="margin:12px 0 4px">Depois do evento</h4>${lista(DEPOIS)}` : ""}
      <p class="muted" style="font-size:12px;margin-top:8px">${esc(FONTE)}, versão de ${esc(VERSAO)}.</p></details>`;
  }

  /** Resumo dos dois manuais para o Roteiro da noite (código de casa) e a equipe. */
  function resumo() {
    return `<h2 style="margin-top:24px">Manual da Operação</h2><p class="sub">${esc(FONTE)}, versão de ${esc(VERSAO)}. Cada data também mostra o cronograma dela em "Como é a noite".</p>
      <div class="grid g2">
        <div class="card"><h3 style="margin-top:0">Descubra</h3><p class="muted" style="font-size:13px">${esc(CRONOGRAMA.Descubra.nota)}</p>${tabela(CRONOGRAMA.Descubra.linhas, ["Horário", "O que acontece"])}<h4>Camarim</h4>${lista(CAMARIM.Descubra)}</div>
        <div class="card"><h3 style="margin-top:0">Apresenta</h3><p class="muted" style="font-size:13px">Segunda a sexta</p>${tabela(CRONOGRAMA["Apresenta:semana"].linhas, ["Horário", "O que acontece"])}<p class="muted" style="font-size:13px;margin-top:10px">Sábado e domingo</p>${tabela(CRONOGRAMA["Apresenta:fim"].linhas, ["Horário", "O que acontece"])}<h4>Camarim</h4>${lista(CAMARIM.Apresenta)}</div>
        <div class="card"><h3 style="margin-top:0">Padrão da noite</h3>${lista(PADRAO_NOITE)}<h4>Cortesias</h4><p>${esc(CORTESIAS)}</p></div>
        <div class="card"><h3 style="margin-top:0">Rider técnico</h3>${tabela(RIDER_TECNICO, ["Item", "Padrão"])}</div>
      </div>`;
  }

  return { VERSAO, CRONOGRAMA, CAMARIM, CORTESIAS, RIDER_TECNICO, PADRAO_NOITE, CHECKLIST_SEMANA, DEPOIS, cronograma, bloco, resumo, fimDeSemana };
})();
if (typeof window !== "undefined") window.TQOperacao = TQOperacao; else globalThis.TQOperacao = TQOperacao;
