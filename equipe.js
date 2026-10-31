// Equipe da casa por função e treinamento da nova casa (a "Trilha da Nova Casa" de 7 dias úteis).
// Fontes: Guia do Franqueado v1.5 e Ficha da unidade v1 (Operações, 30/10/2026) e combinados do Gui (29/10/2026).
// Uma fonte só para o site e os testes. As mesmas regras estão em supabase/schema.sql (v12, funcoes_erro e
// trilha_marcar_casa): se mudar aqui, mude lá.
"use strict";
(function (g) {
  // ---------- funções ----------
  // As 4 cadeiras do Guia: Dono A (a conta da casa), Líder Local, Anfitrião e Social Media; mais o técnico de som,
  // os operadores de porta e o bar. Cada função é de uma pessoa diferente; só o Dono A pode ser também o Líder Local.
  // [chave, nome, o que faz, quando trabalha, obrigatória antes do primeiro evento]
  const FUNCOES = [
    ["lider", "Líder Local (produtor)", "Conduz o dia do evento e é o contato dos artistas: monta o pacote do D-5, confere palco, porta e bar. A cidade reconhece como “do Tranquilo”. Pode ser o próprio dono.", "Semana do evento e o dia todo", true],
    ["anfitriao", "Anfitrião(ã)", "Conduz o público: recebe, faz as três falas, apresenta os artistas e leva as pessoas para a comunidade.", "Na noite, e nos grupos e stories durante a semana", true],
    ["social_media", "Social media", "Registra a noite conforme o briefing: 3 vídeos editados, fotos e depoimentos. Pasta crua na manhã seguinte e material em 48 h.", "Na noite e nas 48 h seguintes", true],
    ["som", "Técnico(a) de som", "Monta o som antes de os artistas chegarem, conduz a passagem e fica o evento inteiro.", "O dia todo", true],
    ["porta", "Operador(a) de porta", "Monta a portaria, opera a Ingresse (cadastrado e treinado), confere a lista e sabe explicar o que é o Tranquilo.", "De 1 h antes das portas até o fim da entrada", true],
    ["bar", "Bar", "Equipe de bar da casa: estoque, bar montado e venda no intervalo, em silêncio. É responsabilidade do dono; o Tranquilo não fala com a equipe de bar.", "Da chegada, 3 h antes das portas, ao fechamento", false],
  ];
  const NOME = Object.fromEntries(FUNCOES.map(([k, n]) => [k, n]));
  const CHAVES = FUNCOES.map(([k]) => k);
  const OBRIGATORIAS = FUNCOES.filter((f) => f[4]).map(([k]) => k);
  const TRIPE = ["lider", "anfitriao", "social_media"];   // o "tripé social" do Guia

  /** Erro que impede a combinação (mesma regra do banco) ou null. */
  function funcoesErro(fs) {
    fs = [...new Set(fs || [])];
    if (!fs.length) return "Escolha a função da pessoa.";
    if (fs.some((f) => !CHAVES.includes(f))) return "Função desconhecida.";
    if (fs.length > 1) return "Cada função é de uma pessoa diferente (Guia do Franqueado). Só o dono pode ser também o Líder Local.";
    return null;
  }
  /** Avisos que não bloqueiam (mantido para o site; com uma função por pessoa, hoje não há). */
  function funcoesAvisos() { return []; }
  /** Como está a equipe: funções obrigatórias sem titular e reserva. */
  function cobertura(equipe) {
    const titulares = (equipe || []).filter((p) => !p.reserva), reservas = (equipe || []).filter((p) => p.reserva);
    const faltam = OBRIGATORIAS.filter((f) => !titulares.some((p) => (p.funcoes || []).includes(f)));
    const pend = faltam.map((f) => `Falta ${NOME[f]}`);
    if (!reservas.length) pend.push("Falta 1 pessoa reserva para a equipe da noite, definida na semana do evento");
    const erros = (equipe || []).map((p) => [p.nome, funcoesErro(p.funcoes)]).filter(([, e]) => e).map(([n, e]) => `${n}: ${e}`);
    return { completa: !pend.length && !erros.length, faltam, pend, erros, tripe: TRIPE.every((f) => !faltam.includes(f)), titulares: titulares.length, reservas: reservas.length };
  }

  // ---------- o que cada função vê ----------
  // Passos da data por função. O dono da casa e o Líder Local (o produtor) veem todos.
  const PASSO_FUNCOES = {
    handoff: ["lider"], ficha: ["lider"], rider: ["lider", "som"], tecnico: ["som", "lider"], roteiro: ["lider"],
    escrito: ["lider"], travas: ["lider", "bar"], equipe_reserva: ["lider"], porta_reserva: ["porta", "lider"],
    briefing_anfitriao: ["anfitriao"], pacote_grupo: ["lider"], estoque: ["bar", "lider"],
    prontidao: ["lider", "som", "bar", "porta", "anfitriao", "social_media"], publico: ["porta", "lider"],
    fechamento: ["lider", "bar"], material_social: ["social_media"],
  };
  const veTudo = (fs) => fs == null || fs.includes("lider");
  const vePasso = (fs, chave) => veTudo(fs) || (PASSO_FUNCOES[chave] || ["lider"]).some((f) => fs.includes(f));
  // Abas da conta de cada pessoa da equipe (o dono vê todas as da casa).
  function abasDaFuncao(fs) {
    const tem = (...xs) => veTudo(fs) || xs.some((x) => fs.includes(x));
    return { campanha: tem("social_media", "anfitriao"), equipe: veTudo(fs), roteiro: true, metricas: veTudo(fs) };
  }
  // Partes do "Como é a noite" de cada data.
  function partesNoite(fs) {
    if (veTudo(fs)) return { cronograma: 1, cortesias: 1, camarim: 1, checklist: 1, rider: 1, padrao: 1, depois: 1 };
    const t = (...xs) => xs.some((x) => fs.includes(x)) ? 1 : 0;
    return { cronograma: 1, cortesias: t("porta", "anfitriao"), camarim: 0, checklist: 0, rider: t("som"), padrao: 1, depois: t("bar", "social_media") };
  }
  // Perfil de acesso por função: lê uma vez, recebe a cada show, devolve.
  const PERFIL = {
    dono: { le: ["Guia do Franqueado (ao devolver a Ficha preenchida, a casa confirma a leitura)", "Ficha da unidade", "Manual da noite (Descubra e Apresenta), a visão geral", "O que a casa decide, o que combina antes por escrito e o que não muda", "Playbook de campanha"], show: ["Datas da casa, links de venda e campanha", "Planilha de fechamento e relatório de cada noite", "Contatos da Central por assunto", "Equipe da casa: quem ocupa cada função"], devolve: ["Ficha da unidade em até 3 dias", "Nomes do tripé em até 1 semana depois do treinamento", "Aprovação da data por escrito", "Dados até o D+2"] },
    lider: { le: ["Manual da noite inteiro", "Passo a passo da Ingresse", "Briefing do Líder Local"], show: ["Cronograma e horários do contrato", "Rider técnico e de camarim", "Grupo de WhatsApp com os artistas", "Tudo o que a casa vê de cada data"], devolve: ["Pacote fixado no grupo no D-5 (no máximo D-4)", "Estoque e PDV até o D+2", "Retorno dos artistas"] },
    anfitriao: { le: ["“O anfitrião da noite”"], show: ["Briefing do anfitrião no D-7, com as apresentações", "Material dos artistas", "Cartazes e flyers da comunidade"], devolve: ["Vídeo de 20 a 30 s na saída", "Quantos flyers entregou"] },
    social_media: { le: ["“A social media da noite”"], show: ["Briefing da noite (D-7 ou D-3, a confirmar com o marketing)", "Modelos do CapCut, legendas e material dos artistas", "Peças da campanha, se o dono passar a postagem para você"], devolve: ["Pasta crua na manhã seguinte", "3 vídeos e fotos em 48 h"] },
    som: { le: ["Rider técnico (seção do manual)"], show: ["Horários de passagem de som", "Formação de cada artista"], devolve: ["Som montado antes de os artistas chegarem"] },
    bar: { le: ["Bar e padrão da noite (seções do manual)"], show: ["Horário de chegada e cardápio"], devolve: ["Contagem inicial do estoque ao Líder Local"] },
    porta: { le: ["Porta (seção do manual) e passo a passo da Ingresse", "“Sobre o Tranquilo”, para saber explicar", "Regras de crianças e de reembolso"], show: ["Lista de entrada e cortesias", "Acesso à Ingresse: a Central libera a venda de porta no D-5/D-4"], devolve: ["Entrada conferida e cortesias registradas"] },
  };

  // ---------- treinamento da nova casa (7 dias úteis) ----------
  // [chave, dia útil, quem, título, detalhe]. "casa" = o dono marca pela área dele; os outros, a Central.
  const TRILHA = [
    ["nota", 1, "Thales", "Nota de passagem ao Gui", "Contato, dono, casa, combinado financeiro e observações (tudo o que foi prometido fora do padrão)."],
    ["msg1", 2, "Gui", "Mensagem 1: perguntas sobre o espaço", ""],
    ["resp_espaco", 2, "casa", "A casa responde as perguntas sobre o espaço", "Pelo WhatsApp do Gui."],
    ["docs", 2, "Gui", "Mensagem 2 com os documentos", "Guia do Franqueado, Ficha da unidade, manuais, planilhas e acesso à área da casa."],
    ["leitura", 3, "casa", "Guia lido e Ficha da unidade devolvida", "Até 3 dias depois de receber. Ao devolver a Ficha preenchida, a casa confirma que leu o Guia. As dúvidas vão para o Gui."],
    ["duvidas_ops", 3, "Gui", "Conversa de alinhamento com a Operações", "A partir das dúvidas da Ficha. Passa à Isa no fim do dia."],
    ["proposta", 4, "Isa", "Proposta de datas e produto", "Descubra ou Apresenta e o artista indicado para a primeira data."],
    ["data_aprovada", 5, "casa", "Data aprovada por escrito", "Confirme aqui a data e o produto propostos pela Isa."],
    ["ingresse", 5, "Isa", "Evento na Ingresse e link da data", "Com pelo menos 35 dias até o show, para caber a campanha. Passa ao Bruno no fim do dia."],
    ["campanha", 6, "Bruno", "Campanha, modelos e link publicados na área da casa", "Pasta de marketing no Drive, campanha dia a dia e modelos do Canva."],
    ["duvidas_mkt", 7, "Bruno", "Dúvidas de marketing respondidas", "Treinamento concluído: a casa conheceu as quatro áreas e assume a operação."],
  ];
  // Depois do treinamento: [chave, dias corridos depois do fim (ou null), quem, título, detalhe]
  const DEPOIS_TRILHA = [
    ["tripe", 7, "casa", "Nomes do tripé: Líder Local, anfitrião e social media", "É a primeira coisa depois do treinamento, em até 1 semana: cada um recebe o seu briefing e as funções antes do evento. Cadastre na Equipe da casa."],
    ["equipe_ok", null, "casa", "Equipe completa: técnico de som, operadores de porta e 1 reserva", "Antes do primeiro evento, com nome e telefone de cada pessoa."],
    ["porta_ingresse", null, "casa", "Operadores de porta cadastrados e treinados na Ingresse", "Mande o nome e o e-mail de cada um à Central, que libera as permissões."],
    ["planilhas", null, "casa", "Cópias da cidade das planilhas de estoque e de fechamento", ""],
    ["homologacao", null, "casa", "Espaço e som para a homologação da Operações", "Fotos do palco e do som conforme o rider do manual."],
    ["conferido", null, "Gui", "Pré-requisitos conferidos pela Operações", "Contrato assinado, espaço e som homologados, as 4 cadeiras com nome e telefone, porta, planilhas, grupo da unidade e Ficha devolvida."],
  ];
  const ETAPAS_CASA = [...TRILHA.map((e) => [e[0], e[2]]), ...DEPOIS_TRILHA.map((e) => [e[0], e[2]])].filter(([, q]) => q === "casa").map(([k]) => k);
  const AREA = { Thales: "Direção · expansão", Gui: "Operações", Isa: "Comercial e artístico", Bruno: "Marketing", casa: "A casa" };

  // Feriados nacionais que caem em dia útil (2026 e 2027): o treinamento não conta esses dias.
  const FERIADOS = new Set(["2026-01-01", "2026-02-16", "2026-02-17", "2026-04-03", "2026-04-21", "2026-05-01", "2026-06-04", "2026-09-07", "2026-10-12", "2026-11-02", "2026-11-20", "2026-12-25",
    "2027-01-01", "2027-02-08", "2027-02-09", "2027-03-26", "2027-04-21", "2027-05-27", "2027-09-07", "2027-10-12", "2027-11-02", "2027-11-15", "2027-12-24", "2027-12-31"]);
  const somar = (iso, d) => new Date(Date.parse(iso + "T12:00:00Z") + d * 864e5).toISOString().slice(0, 10);
  const util = (iso) => { const w = new Date(iso + "T12:00:00Z").getUTCDay(); return w !== 0 && w !== 6 && !FERIADOS.has(iso); };
  /** Data do dia útil n do treinamento (dia 1 = início, ou o próximo dia útil se o início não for). */
  function diaUtil(inicio, n) {
    let d = inicio; while (!util(d)) d = somar(d, 1);
    for (let i = 1; i < n; i++) { d = somar(d, 1); while (!util(d)) d = somar(d, 1); }
    return d;
  }
  /** Andamento: cada etapa com prazo, feita, atrasada; com quem está o bastão e se o treinamento fechou. */
  function andamento(inicio, feitos, hoje) {
    feitos = feitos || {};
    const fim = diaUtil(inicio, 7);
    const etapas = TRILHA.map(([chave, dia, quem, titulo, texto]) => {
      const prazo = diaUtil(inicio, dia), feito = !!feitos[chave];
      return { chave, dia, quem, titulo, texto, prazo, feito, feito_em: feitos[chave]?.em || null, atrasado: !feito && prazo < hoje, casa: quem === "casa" };
    });
    const depois = DEPOIS_TRILHA.map(([chave, dias, quem, titulo, texto]) => {
      const prazo = dias == null ? null : somar(fim, dias), feito = !!feitos[chave];
      return { chave, quem, titulo, texto, prazo, feito, atrasado: !!prazo && !feito && prazo < hoje, casa: quem === "casa" };
    });
    const proxima = etapas.find((e) => !e.feito);
    return { etapas, depois, feitas: etapas.filter((e) => e.feito).length, total: etapas.length, atrasadas: etapas.filter((e) => e.atrasado).length,
      com: proxima ? proxima.quem : null, proxima: proxima || null, fechada: !proxima, fim };
  }

  g.TQEquipe = { FUNCOES, NOME, CHAVES, OBRIGATORIAS, TRIPE, funcoesErro, funcoesAvisos, cobertura, PASSO_FUNCOES, vePasso, veTudo, abasDaFuncao, partesNoite, PERFIL,
    TRILHA, DEPOIS_TRILHA, ETAPAS_CASA, AREA, diaUtil, andamento };
})(typeof window !== "undefined" ? window : globalThis);
