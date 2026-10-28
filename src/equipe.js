// Equipe da casa por função e Trilha da Nova Casa (Operações, "Trilha da Nova Casa", 27/10/2026).
// Uma fonte só para o site e os testes. As mesmas regras de acúmulo estão em supabase/schema.sql (v11, funcoes_erro):
// se mudar aqui, mude lá.
"use strict";
(function (g) {
  // ---------- funções da noite ----------
  // [chave, nome, o que faz, quando trabalha]
  const FUNCOES = [
    ["lider", "Líder Local", "A pessoa que a cidade reconhece como “do Tranquilo”. É uma das pessoas da equipe, não uma vaga a mais.", "Sempre"],
    ["produtor", "Produtor(a)", "Conduz o dia, é o contato dos artistas, monta o pacote do D-5, confere palco, porta e bar.", "Semana do evento e o dia todo"],
    ["anfitriao", "Anfitrião(ã)", "Recebe o público, faz as três falas, apresenta os artistas e leva as pessoas para a comunidade.", "Na noite, e nos grupos e stories durante a semana"],
    ["social_media", "Social media", "Registra a noite: 3 vídeos editados, fotos e depoimentos. Pasta crua na manhã seguinte e material em 48 h.", "Na noite e nas 48 h seguintes"],
    ["som", "Técnico(a) de som", "Monta o som antes de os artistas chegarem, conduz a passagem e fica o evento inteiro.", "O dia todo"],
    ["bar", "Operador(a) de bar", "Confere o estoque, manda a contagem ao produtor, monta o bar e vende no intervalo, em silêncio.", "Da chegada, 3 h antes das portas, ao fechamento"],
    ["porta", "Operador(a) de porta", "Monta a portaria, opera a Ingresse, confere a lista e sabe explicar o que é o Tranquilo.", "De 1 h antes das portas até o fim da entrada"],
  ];
  const NOME = Object.fromEntries(FUNCOES.map(([k, n]) => [k, n]));
  const CHAVES = FUNCOES.map(([k]) => k);
  const TRIPE = ["produtor", "anfitriao", "social_media"];
  const MINIMO_PESSOAS = 5;

  /** Erro que impede a combinação (mesma regra do banco) ou null. */
  function funcoesErro(fs) {
    fs = [...new Set(fs || [])];
    if (!fs.length) return "Escolha pelo menos uma função.";
    if (fs.some((f) => !CHAVES.includes(f))) return "Função desconhecida.";
    if (fs.includes("anfitriao") && fs.includes("social_media")) return "Anfitrião e social media nunca são a mesma pessoa.";
    if (fs.includes("som") && fs.some((f) => f !== "som" && f !== "lider")) return "O técnico de som não acumula outra função (só pode ser também o Líder Local).";
    return null;
  }
  /** Combinações que o Guia não prevê, mas não bloqueiam (a casa decide). */
  function funcoesAvisos(fs) {
    const noite = (fs || []).filter((f) => f !== "lider"), av = [];
    const permitidos = [["produtor", "bar"], ["produtor", "porta"], ["bar", "porta"]];
    if (noite.length > 2) av.push("Mais de duas funções na noite para a mesma pessoa: confira se ela dá conta.");
    else if (noite.length === 2 && !permitidos.some(([a, b]) => noite.includes(a) && noite.includes(b))) av.push(`${NOME[noite[0]]} e ${NOME[noite[1]]} juntos não estão nos acúmulos previstos no Guia (produtor com bar ou porta; bar com porta).`);
    return av;
  }
  /** Como está a equipe: funções sem titular, mínimo de pessoas e reserva. */
  function cobertura(equipe) {
    const titulares = (equipe || []).filter((p) => !p.reserva), reservas = (equipe || []).filter((p) => p.reserva);
    const faltam = CHAVES.filter((f) => !titulares.some((p) => (p.funcoes || []).includes(f)));
    const pend = faltam.map((f) => `Falta ${NOME[f]}`);
    if (titulares.length < MINIMO_PESSOAS) pend.push(`A equipe da noite tem ${titulares.length} pessoa${titulares.length === 1 ? "" : "s"}; o mínimo é ${MINIMO_PESSOAS}`);
    if (!reservas.length) pend.push("Falta 1 pessoa reserva combinada para a semana do evento");
    const erros = (equipe || []).map((p) => [p.nome, funcoesErro(p.funcoes)]).filter(([, e]) => e).map(([n, e]) => `${n}: ${e}`);
    return { completa: !pend.length && !erros.length, faltam, pend, erros, tripe: TRIPE.every((f) => !faltam.includes(f)), lider: !faltam.includes("lider"), titulares: titulares.length, reservas: reservas.length };
  }

  // ---------- o que cada função vê ----------
  // Passos da data por função (o dono da casa e o Líder Local veem todos).
  const PASSO_FUNCOES = {
    handoff: ["produtor"], ficha: ["produtor"], rider: ["produtor", "som"], tecnico: ["som", "produtor"], roteiro: ["produtor"],
    escrito: ["produtor"], travas: ["produtor", "bar"], equipe_reserva: ["produtor"], porta_reserva: ["porta", "produtor"],
    briefing_anfitriao: ["anfitriao"], pacote_grupo: ["produtor"], caixa_producao: ["produtor"], estoque: ["bar", "produtor"],
    prontidao: ["produtor", "som", "bar", "porta", "anfitriao", "social_media"], publico: ["porta", "produtor"],
    fechamento: ["produtor", "bar"], material_social: ["social_media"],
  };
  const veTudo = (fs) => fs == null || fs.includes("lider");
  const vePasso = (fs, chave) => veTudo(fs) || (PASSO_FUNCOES[chave] || ["produtor"]).some((f) => fs.includes(f));
  // Abas da conta de cada pessoa da equipe (o dono vê todas as da casa).
  function abasDaFuncao(fs) {
    const tem = (...xs) => veTudo(fs) || xs.some((x) => fs.includes(x));
    return { campanha: tem("social_media", "anfitriao", "produtor"), equipe: tem("produtor"), roteiro: true, metricas: veTudo(fs) };
  }
  // Partes do "Como é a noite" de cada data.
  function partesNoite(fs) {
    if (veTudo(fs) || fs.includes("produtor")) return { cronograma: 1, cortesias: 1, camarim: 1, checklist: 1, rider: 1, padrao: 1, depois: 1 };
    const t = (...xs) => xs.some((x) => fs.includes(x)) ? 1 : 0;
    return { cronograma: 1, cortesias: t("porta", "anfitriao"), camarim: 0, checklist: 0, rider: t("som"), padrao: 1, depois: t("bar", "social_media") };
  }
  // Perfil de acesso por função (Trilha, seção 5): lê uma vez, recebe a cada show, devolve.
  const PERFIL = {
    dono: { le: ["Guia do Franqueado, com a confirmação de leitura", "Ficha da unidade", "Manual da noite (Descubra e Apresenta), a visão geral", "Autonomia da casa: o que decide sozinha, o que combina antes e o que não muda", "Playbook de campanha"], show: ["Datas da casa, links de venda e campanha", "Planilha de fechamento e relatório de cada noite", "Contatos da Central por assunto", "Equipe da casa: quem ocupa cada função"], devolve: ["Confirmação de leitura no dia 3 da trilha", "Aprovação da data no dia 5", "Equipe com nome e telefone", "Dados até o D+2"] },
    lider: { le: ["Guia do Franqueado (como a casa funciona na rede)", "Manual da noite inteiro"], show: ["Tudo o que a casa vê de cada data"], devolve: ["A presença do Tranquilo na cidade: é a pessoa que a cidade reconhece"] },
    produtor: { le: ["Manual da noite inteiro", "Passo a passo da Ingresse"], show: ["Cronograma e horários do contrato", "Rider técnico e de camarim", "Grupo de WhatsApp com os artistas"], devolve: ["Pacote fixado no grupo no D-5 (no máximo D-4)", "Estoque e PDV até o D+2", "Retorno dos artistas"] },
    anfitriao: { le: ["“O anfitrião da noite”"], show: ["Briefing do anfitrião no D-7, com as apresentações", "Material dos artistas", "Cartazes e flyers da comunidade"], devolve: ["Vídeo de 20 a 30 s na saída", "Quantos flyers entregou"] },
    social_media: { le: ["“A social media da noite”"], show: ["Briefing da noite (D-7 ou D-3, a confirmar com o marketing)", "Modelos do CapCut, legendas e material dos artistas", "Peças da campanha, se o dono passar a postagem para você"], devolve: ["Pasta crua na manhã seguinte", "3 vídeos e fotos em 48 h"] },
    som: { le: ["Rider técnico (seção do manual)"], show: ["Horários de passagem de som", "Formação de cada artista"], devolve: ["Som montado antes de os artistas chegarem"] },
    bar: { le: ["Bar e padrão da noite (seções do manual)"], show: ["Horário de chegada e cardápio"], devolve: ["Contagem inicial do estoque ao produtor"] },
    porta: { le: ["Porta (seção do manual) e passo a passo da Ingresse", "“Sobre o Tranquilo”, para saber explicar", "Regras de crianças e de reembolso"], show: ["Lista de entrada e cortesias", "Acesso à Ingresse: a Central libera a venda de porta no D-5/D-4"], devolve: ["Entrada conferida e cortesias registradas"] },
  };

  // ---------- Trilha da Nova Casa (7 dias úteis) ----------
  // [chave, dia útil, quem, título, detalhe]. "casa" = o dono marca pela área dele; os outros, a Central.
  const TRILHA = [
    ["nota", 1, "Thales", "Nota de passagem ao Gui", "Contato, dono, casa, combinado financeiro e observações (tudo o que foi prometido fora do padrão)."],
    ["msg1", 2, "Gui", "Mensagem 1: perguntas sobre o espaço", ""],
    ["resp_espaco", 2, "casa", "A casa responde as perguntas sobre o espaço", "Pelo WhatsApp do Gui ou na ficha da casa."],
    ["docs", 2, "Gui", "Mensagem 2 com os documentos", "Guia, Ficha, manuais, planilhas e acesso à área da casa."],
    ["leitura", 3, "casa", "Confirmação de leitura do Guia do Franqueado", "Leia o Guia, a Ficha e os manuais e confirme aqui. As dúvidas vão para o Gui."],
    ["duvidas_ops", 3, "Gui", "Dúvidas respondidas e prazos da casa combinados", "Tripé, Líder Local e homologação ficam com a casa, com prazo. Passa à Isa no fim do dia."],
    ["proposta", 4, "Isa", "Proposta de datas e produto", "Descubra ou Apresenta e o artista indicado para a primeira data."],
    ["data_aprovada", 5, "casa", "Data aprovada por escrito", "Confirme aqui a data e o produto propostos pela Isa."],
    ["ingresse", 5, "Isa", "Evento na Ingresse e link da data", "Com pelo menos 35 dias até o show, para caber a campanha. Passa ao Bruno no fim do dia."],
    ["campanha", 6, "Bruno", "Campanha, modelos e link publicados na área da casa", "Pasta de marketing no Drive, campanha dia a dia e modelos do Canva."],
    ["duvidas_mkt", 7, "Bruno", "Dúvidas de marketing respondidas", "Trilha fechada: a casa conhece as quatro áreas e assume a operação."],
  ];
  const DEPOIS_TRILHA = [
    ["equipe_ok", "casa", "Equipe completa: tripé, Líder Local e as 7 funções com reserva", "Prazo combinado com o Gui no dia 3. A Central não monta nem contrata a equipe."],
    ["homologacao", "casa", "Homologação do espaço e do som", "Fotos do palco e do som conforme o rider do manual."],
    ["conferido", "Gui", "Tripé, Líder Local e homologação conferidos pela Operações", "Uma conferência só, antes do primeiro evento."],
  ];
  const ETAPAS_CASA = [...TRILHA, ...DEPOIS_TRILHA.map(([k, q, t, d]) => [k, null, q, t, d])].filter((e) => e[2] === "casa").map((e) => e[0]);
  const AREA = { Thales: "Direção · expansão", Gui: "Operações", Isa: "Comercial e artístico", Bruno: "Marketing", casa: "A casa" };

  // Feriados nacionais que caem em dia útil (2026 e 2027): a trilha não conta esses dias.
  const FERIADOS = new Set(["2026-01-01", "2026-02-16", "2026-02-17", "2026-04-03", "2026-04-21", "2026-05-01", "2026-06-04", "2026-09-07", "2026-10-12", "2026-11-02", "2026-11-20", "2026-12-25",
    "2027-01-01", "2027-02-08", "2027-02-09", "2027-03-26", "2027-04-21", "2027-05-27", "2027-09-07", "2027-10-12", "2027-11-02", "2027-11-15", "2027-12-24", "2027-12-31"]);
  const somar = (iso, d) => new Date(Date.parse(iso + "T12:00:00Z") + d * 864e5).toISOString().slice(0, 10);
  const util = (iso) => { const w = new Date(iso + "T12:00:00Z").getUTCDay(); return w !== 0 && w !== 6 && !FERIADOS.has(iso); };
  /** Data do dia útil n da trilha (dia 1 = início, ou o próximo dia útil se o início não for). */
  function diaUtil(inicio, n) {
    let d = inicio; while (!util(d)) d = somar(d, 1);
    for (let i = 1; i < n; i++) { d = somar(d, 1); while (!util(d)) d = somar(d, 1); }
    return d;
  }
  /** Andamento da trilha: cada etapa com prazo, feita, atrasada; com quem está o bastão e se fechou. */
  function andamento(inicio, feitos, hoje) {
    feitos = feitos || {};
    const etapas = TRILHA.map(([chave, dia, quem, titulo, texto]) => {
      const prazo = diaUtil(inicio, dia), feito = !!feitos[chave];
      return { chave, dia, quem, titulo, texto, prazo, feito, feito_em: feitos[chave]?.em || null, atrasado: !feito && prazo < hoje, casa: quem === "casa" };
    });
    const depois = DEPOIS_TRILHA.map(([chave, quem, titulo, texto]) => ({ chave, quem, titulo, texto, prazo: null, feito: !!feitos[chave], casa: quem === "casa" }));
    const proxima = etapas.find((e) => !e.feito);
    return { etapas, depois, feitas: etapas.filter((e) => e.feito).length, total: etapas.length, atrasadas: etapas.filter((e) => e.atrasado).length,
      com: proxima ? proxima.quem : null, proxima: proxima || null, fechada: !proxima, fim: diaUtil(inicio, 7) };
  }

  g.TQEquipe = { FUNCOES, NOME, CHAVES, TRIPE, MINIMO_PESSOAS, funcoesErro, funcoesAvisos, cobertura, PASSO_FUNCOES, vePasso, veTudo, abasDaFuncao, partesNoite, PERFIL,
    TRILHA, DEPOIS_TRILHA, ETAPAS_CASA, AREA, diaUtil, andamento };
})(typeof window !== "undefined" ? window : globalThis);
