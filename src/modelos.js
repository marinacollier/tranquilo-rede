// Modelo de trabalho de cada papel (pedido da Marina, 18/11/2026): o mesmo formato da campanha do Bruno para todos.
// Para cada papel (Gui · Operações, Isa · Agenda e curadoria, Bruno · Marketing, casa com as funções da equipe, artista):
//   1. PADRÃO: a sequência de ações por data (D-35 … D+3), com quem faz, prazo e o que conta como feito;
//   2. AÇÃO FUNCIONANDO: o próximo passo quando está tudo em dia;
//   3. AÇÃO SOS: regras de alerta com a ação de socorro pronta (cobrar no WhatsApp, escalar para a adm, trocar artista);
//   4. ACOMPANHAMENTO: % feito, atrasados e SOS abertos;
//   5. MÉTODO: cada ação aponta para o trecho do Método, do Guia, do Manual ou do material que explica como fazer.
// A casa e o artista reaproveitam os passos de src/regras.js (PASSOS_CASA, PASSOS_ARTISTA e CAMPANHA_ARTISTA): aqui só
// entram quem faz, o que conta como feito e o método. Os passos da equipe são novos e usam a mesma conta de prazo
// (TQRegras.montarPassos). O "Feito" é a mesma tabela checklist do banco (item "op:…", "ag:…", "mk:…"): sem migração.
"use strict";
(function (g) {
  const R = () => g.TQRegras, EQ = () => g.TQEquipe;

  const PAPEIS = {
    operacoes: { nome: "Operações", pessoa: "Gui", faz: "habilitação e treinamento da casa, contrato da casa e prontidão da noite" },
    agenda: { nome: "Agenda e curadoria", pessoa: "Isa", faz: "line-up, contratos dos artistas e cronograma da noite" },
    marketing: { nome: "Marketing", pessoa: "Bruno", faz: "campanha da data, briefings e material da noite" },
    casa: { nome: "Casa", pessoa: "a casa", faz: "o passo a passo da data, dividido pelas funções da equipe (líder, anfitrião, social media, som e porta)" },
    artista: { nome: "Artista", pessoa: "o artista", faz: "contrato, rider, logística, campanha e o show" },
  };
  const PAPEIS_EQUIPE = ["operacoes", "agenda", "marketing"];

  // Método: { ler: slug do material } | { manual: "formato" } (Manual do Descubra ou do Apresenta, pelo formato da data)
  // | { metodo: "título da seção do Método" } | { ir: "aba do portal", rotulo }.
  const GUIA = { ler: "guia-do-franqueado" }, MANUAL = { manual: "formato" };
  // [chave, dias, título, o que fazer, o que conta como feito, método, conferência automática]
  // auto = o portal marca sozinho quando o dado chega (ex.: contrato assinado); o "Feito" manual vale sempre.
  const PASSOS_EQUIPE = {
    operacoes: [
      ["op:ficha", -30, "Ficha da casa habilitada", "Confira a Ficha da casa e habilite (ou peça ajustes). Sem Ficha, convide a casa pelo Notion.", "A Ficha está \"Habilitada\" no portal.", GUIA, "ficha"],
      ["op:treino", -28, "Treinamento da casa em dia", "Casa nova passa pela Trilha da Nova Casa (7 dias úteis) antes da primeira data.", "Trilha concluída ou casa que já recebeu o Tranquilo.", { metodo: "Habilitação mínima, aprendizado máximo" }, "treino"],
      ["op:equipe", -14, "Equipe da casa completa", "Líder Local, Anfitrião, Social media, Som, Porta e 1 reserva cadastrados em Equipe.", "\"Quem é quem\" da casa sem nenhuma função faltando.", GUIA, "equipe"],
      ["op:contrato", -10, "Contrato da casa assinado", "Prepare o contrato da casa e acompanhe até o arquivo assinado chegar e ser conferido.", "Contrato da casa assinado ou conferido no portal.", { ir: "documentos", rotulo: "Contratos" }, "ct_casa"],
      ["op:porta", -7, "Porta liberada na Ingresse", "Receba nome e e-mail dos operadores de porta (e da reserva) e libere as permissões na Ingresse.", "Operadores com permissão na Ingresse.", MANUAL, null],
      ["op:prontidao", -2, "Prontidão da noite conferida", "Abra o passo a passo da casa: travas finais, pacote fixado no grupo e equipe com reserva.", "Passo a passo da casa sem atraso até aqui.", { metodo: "Checklist pré-evento (a casa registra)" }, "casa_em_dia"],
      ["op:registro", 1, "Registro da noite recebido", "A casa registra público e intercorrências logo depois do show.", "A casa usou \"Registrar a noite\".", { metodo: "Registro durante o evento" }, "registro"],
      ["op:fechamento", 2, "Fechamento conferido (D+2)", "Relatório do caixa, custos com comprovantes e planilha de estoque.", "Fechamento e estoque recebidos da casa.", GUIA, "fechamento"],
    ],
    agenda: [
      ["ag:lineup", -21, "Line-up completo", "Feche os artistas do formato (Descubra: 3; Apresenta: atração e abertura opcional).", "Line-up com o número de artistas que o formato pede.", { metodo: "O handoff é o centro operacional" }, "lineup"],
      ["ag:contratos", -14, "Contratos dos artistas enviados", "\"Preparar contratos do line-up\" gera um para cada artista que falta.", "Cada artista do line-up tem contrato no portal.", { ir: "documentos", rotulo: "Contratos" }, "ct_art_env"],
      ["ag:rider", -14, "Riders e formação repassados à casa", "Formação, rider técnico e mapa de palco de cada artista para a casa e o técnico de som.", "A casa recebeu o rider de todos.", MANUAL, null],
      ["ag:assinados", -10, "Contratos dos artistas assinados", "Acompanhe a assinatura e confira cada arquivo que chegar.", "Todos os contratos do line-up assinados ou conferidos.", { ir: "documentos", rotulo: "Contratos" }, "ct_art_ok"],
      ["ag:cronograma", -7, "Cronograma enviado à casa e aos artistas", "Use a mensagem pronta em \"Artista e casa\": passagem de som, portas, ordem da noite.", "Mensagem do cronograma enviada.", { ir: "lado_a_lado", rotulo: "Artista e casa" }, null],
      ["ag:pagamento", 2, "Notas e cachês encaminhados", "Receba a nota ou o recibo de cada artista e encaminhe o pagamento.", "Notas recebidas e pagamento pedido.", MANUAL, null],
    ],
    marketing: [
      ["mk:campanha", -30, "Campanha carregada para a data", "Carregue a campanha da casa em Campanhas (dias, ações, artes e links).", "A casa tem campanha no portal.", { ler: "modelos-marketing" }, "campanha"],
      ["mk:briefing", -20, "Briefing dos artistas enviado", "Descubra: no D-20, quando o line-up fecha. Apresenta: o kit sai no D-35.", "Cada artista deu o OK no briefing.", { ler: "como-briefar-artistas" }, "art_ok"],
      ["mk:ritmo", -14, "Campanha no ritmo", "Acompanhe os dias da campanha: a casa marca \"Feito\" em cada um.", "Nenhum dia da campanha atrasado.", { ler: "semana-social-media" }, "campanha_em_dia"],
      ["mk:briefing_noite", -7, "Briefing do anfitrião e da social media", "Mande o briefing com as apresentações dos artistas e o roteiro dos vídeos.", "Briefings enviados à casa.", { ler: "briefing-anfitriao" }, null],
      ["mk:flyer", -1, "Flyer do line-up em collab", "D-1 à noite: o flyer com o line-up sai em collab com o Tranquilo e os artistas.", "Flyer publicado.", { ler: "modelos-marketing" }, null],
      ["mk:material", 2, "Material da noite recebido (48 h)", "Pasta crua na manhã seguinte; 3 vídeos e fotos em até 48 h.", "Material da social media recebido.", { ler: "briefing-fotografo" }, "material"],
    ],
  };

  // Casa e artista: o que conta como feito e o método de cada passo de src/regras.js.
  const FEITO_CASA = {
    handoff: "Datas e atrações aprovadas por escrito com a Central.", ficha: "Ficha revisada para o formato da data.", rider: "Rider do artista conferido e compatível.",
    tecnico: "Técnico e setup confirmados por escrito.", roteiro: "Roteiro do dia fechado com a equipe.", escrito: "Equipamentos, maquininha e planos B confirmados por escrito.",
    travas: "Horários, compras, bar e caixa travados.", divulgacao_local: "Divulgação local no ar.", equipe_reserva: "Equipe escalada com 1 reserva.",
    porta_reserva: "Nome e e-mail da porta enviados à Central.", briefing_anfitriao: "Briefing lido e as três falas prontas.", pacote_grupo: "Pacote fixado no grupo com os artistas.",
    prontidao: "Noite realizada no padrão.", publico: "\"Registrar a noite\" preenchido.", fechamento: "Caixa, custos e intercorrências enviados.",
    estoque: "Planilha de estoque preenchida.", material_social: "Pasta crua e 3 vídeos entregues.",
  };
  const METODO_CASA = {
    handoff: GUIA, ficha: GUIA, rider: MANUAL, tecnico: MANUAL, roteiro: MANUAL, escrito: GUIA, travas: GUIA, divulgacao_local: { ler: "semana-lideranca-local" },
    equipe_reserva: GUIA, porta_reserva: MANUAL, briefing_anfitriao: { ler: "briefing-anfitriao" }, pacote_grupo: { ler: "semana-lideranca-local" },
    prontidao: MANUAL, publico: MANUAL, fechamento: GUIA, estoque: GUIA, material_social: { ler: "briefing-fotografo" },
  };
  const FEITO_ARTISTA = {
    contrato: "Contrato assinado no portal (ou arquivo assinado enviado).", formacao: "Formação e acompanhantes definidos.", rider: "Rider e mapa de palco enviados.",
    som: "Setup e horário da passagem combinados com a casa.", logistica: "Transporte, hospedagem e chegada confirmados.", horarios: "Horários e nomes da lista enviados à casa.",
    roteiro: "Roteiro do show revisado.", passagem: "Passagem de som feita.", pagamento: "Nota fiscal ou recibo enviado.", feedback: "Retorno enviado à Central.",
    camp_ok: "OK dado no briefing.", camp_convites: "15 convites enviados no privado.", camp_anuncio: "Post publicado e print enviado.", camp_meio: "Stories da semana publicados.",
    camp_contagem: "Contagem nos stories publicada.", camp_flyer: "Flyer em collab publicado.", camp_reel: "Reel convite em collab publicado.", camp_reel_tocando: "Reel tocando em collab publicado.",
  };
  const METODO_ARTISTA = { contrato: { ir: "contratos_meus", rotulo: "Contrato" }, formacao: { ler: "comece-por-aqui" }, pagamento: { ir: "contratos_meus", rotulo: "Contrato" }, feedback: null };
  const metodoArtista = (k) => k in METODO_ARTISTA ? METODO_ARTISTA[k] : /^camp_/.test(k) ? { ler: "como-briefar-artistas" } : MANUAL;

  /** Quem faz um passo da casa: as funções da equipe (o dono e o Líder Local veem todos). */
  function quemNaCasa(chave) {
    const fs = (EQ()?.PASSO_FUNCOES || {})[chave] || ["lider"];
    return fs.map((f) => EQ()?.CURTO?.[f] || f).join(" · ");
  }

  /** Passos de um papel numa data, já com quem faz, o que conta como feito e o método.
   *  feitos: { chave: true | { por, em } }; auto: { regra: true } (conferências do portal). */
  function passos(papel, dataIso, feitos, hoje, produto, auto = {}) {
    if (papel === "casa" || papel === "artista") {
      return R().passosDaData(papel, dataIso, feitos, hoje, produto).map((p) => ({ ...p, papel,
        quem: papel === "casa" ? quemNaCasa(p.chave) : "Artista",
        feitoQuando: (papel === "casa" ? FEITO_CASA : FEITO_ARTISTA)[p.chave] || "",
        metodo: papel === "casa" ? METODO_CASA[p.chave] || null : metodoArtista(p.chave) }));
    }
    const lista = PASSOS_EQUIPE[papel] || [], f = { ...(feitos || {}) };
    for (const l of lista) if (!f[l[0]] && l[6] && auto[l[6]]) f[l[0]] = { auto: true };
    const meta = Object.fromEntries(lista.map((l) => [l[0], l]));
    return R().montarPassos(lista, dataIso, f, hoje).map((p) => ({ ...p, papel, quem: PAPEIS[papel].pessoa,
      feitoQuando: meta[p.chave][4], metodo: meta[p.chave][5], auto: meta[p.chave][6] }));
  }
  /** Ação funcionando: o próximo passo que ainda dá para fazer (o atrasado mais antigo primeiro). */
  const proximo = (ps) => ps.find((p) => !p.feito && !p.passou) || null;

  // ---------- SOS ----------
  // Regras de alerta: quando, de quem é e a ação de socorro. Os textos aparecem em "Como funciona o SOS".
  const REGRAS_SOS = [
    { chave: "lineup", papel: "agenda", quando: "Line-up incompleto a 21 dias ou menos", acao: "Abrir a data e buscar artista livre; a 10 dias ou menos, escalar para a adm." },
    { chave: "ct_artista", papel: "agenda", quando: "Contrato de artista sem assinar a 10 dias ou menos", acao: "Cobrar no WhatsApp com a mensagem pronta; a 5 dias ou menos, trocar o artista ou escalar." },
    { chave: "ct_casa", papel: "operacoes", quando: "Contrato da casa sem assinar a 10 dias ou menos", acao: "Cobrar a casa no WhatsApp; a 5 dias ou menos, escalar para a adm." },
    { chave: "equipe", papel: "operacoes", quando: "Equipe da casa incompleta a 14 dias ou menos", acao: "Cobrar a casa no WhatsApp com as funções que faltam." },
    { chave: "ficha", papel: "operacoes", quando: "Ficha enviada e sem habilitar há 7 dias ou mais", acao: "Abrir a Ficha e habilitar ou pedir ajustes." },
    { chave: "sem_campanha", papel: "marketing", quando: "Data a 21 dias ou menos sem campanha carregada", acao: "Carregar a campanha da casa em Campanhas." },
    { chave: "campanha", papel: "marketing", quando: "Campanha com dia atrasado (sem \"Feito\" da casa)", acao: "Cobrar a casa no WhatsApp com os dias atrasados." },
    { chave: "casa_atrasada", papel: "operacoes", quando: "Casa com 2 ou mais passos atrasados na data", acao: "Cobrar a casa no WhatsApp com os passos atrasados." },
    { chave: "artista_atrasado", papel: "agenda", quando: "Artista com 2 ou mais passos atrasados, a 14 dias ou menos da data", acao: "Cobrar o artista no WhatsApp com os passos atrasados." },
  ];
  const ESCALAR_EM = 5;
  const dd = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  const listaTxt = (xs) => xs.length > 1 ? xs.slice(0, -1).join(", ") + " e " + xs[xs.length - 1] : xs.join("");

  /** SOS de uma data. ctx: { id, dia, hoje, casa, cidade, produto, link, lineup: { n, minimo }, artistas: [{ nome, whatsapp,
   *  contrato: "sem" | "enviado" | "assinado", atrasados: [títulos] }], contratoCasa: "sem" | "enviado" | "assinado" | null,
   *  equipe: { completa, falta } | null, campanha: { existe, atrasados } | null, casaAtrasados: [títulos], whatsCasa } */
  function sosDaData(ctx) {
    const d = Math.round((Date.parse(ctx.dia + "T12:00:00Z") - Date.parse(ctx.hoje + "T12:00:00Z")) / 864e5);
    if (d < 0) return [];
    const quando = `${dd(ctx.dia)}${ctx.casa ? " na " + ctx.casa : ""}`, out = [];
    const escalar = (texto) => ({ tipo: "escalar", rotulo: "Escalar para a adm", texto });
    const add = (chave, papel, titulo, porque, acoes) => out.push({ chave: `${ctx.id}|${chave}`, regra: chave, papel, titulo, porque, d, dia: ctx.dia, evento: ctx.id, acoes });
    const L = ctx.lineup;
    if (L && d <= 21 && L.n < L.minimo) add("lineup", "agenda", `Line-up incompleto: ${L.n} de ${L.minimo}`, `Faltam ${d} dias para ${quando} e o formato pede ${L.minimo} ${L.minimo === 1 ? "artista" : "artistas"}.`,
      [{ tipo: "abrir", rotulo: "Abrir a data e completar", alvo: "ev" }, { tipo: "ir", rotulo: "Buscar artista livre", alvo: "lado_a_lado" }, ...(d <= 10 ? [escalar(`Line-up de ${quando} com ${L.n} de ${L.minimo} artistas a ${d} dias.`)] : [])]);
    for (const a of ctx.artistas || []) {
      if (d <= 10 && a.contrato !== "assinado") add("ct:" + a.nome, "agenda", `Contrato de ${a.nome} ${a.contrato === "sem" ? "não enviado" : "sem assinar"}`, `Faltam ${d} dias para ${quando}.`,
        [a.contrato === "sem" ? { tipo: "abrir", rotulo: "Preparar o contrato", alvo: "ev" } : { tipo: "whatsapp", rotulo: `Cobrar ${a.nome} no WhatsApp`, para: a.whatsapp || "",
          texto: `Oi, ${a.nome}! Aqui é da equipe do Tranquilo. O contrato do show de ${quando} está na sua área da Rede Tranquilo, na aba Contrato, esperando a sua assinatura. Faltam ${d} dias: consegue assinar hoje?` },
        ...(d <= ESCALAR_EM ? [{ tipo: "abrir", rotulo: "Trocar o artista", alvo: "ev" }, escalar(`Contrato de ${a.nome} (${quando}) sem assinar a ${d} dias.`)] : [])]);
      // Só a 14 dias ou menos (simulação de 24/11/2026: sem esse corte, artista que ainda não usa o portal enchia a Isa de SOS).
      if (d <= 14 && (a.atrasados || []).length >= 2) add("art:" + a.nome, "agenda", `${a.nome} com ${a.atrasados.length} passos atrasados`, listaTxt(a.atrasados.slice(0, 3)) + ".",
        [{ tipo: "whatsapp", rotulo: `Cobrar ${a.nome} no WhatsApp`, para: a.whatsapp || "", texto: `Oi, ${a.nome}! Aqui é da equipe do Tranquilo. Para o show de ${quando}, ainda faltam: ${listaTxt(a.atrasados.slice(0, 4))}. Está tudo nos seus Próximos passos na Rede Tranquilo; se travou em algo, me conta que eu ajudo.` }]);
    }
    if (ctx.contratoCasa && ctx.contratoCasa !== "assinado" && d <= 10) add("ct_casa", "operacoes", `Contrato da casa ${ctx.contratoCasa === "sem" ? "não enviado" : "sem assinar"}`, `Faltam ${d} dias para ${quando}.`,
      [ctx.contratoCasa === "sem" ? { tipo: "ir", rotulo: "Preparar o contrato da casa", alvo: "documentos" } : { tipo: "whatsapp", rotulo: "Cobrar a casa no WhatsApp", para: ctx.whatsCasa || "",
        texto: `Oi! Aqui é do Tranquilo (Operações). O contrato da data de ${quando} está na área da casa na Rede Tranquilo, em Contrato, esperando a assinatura. Faltam ${d} dias: conseguem assinar hoje?` },
      ...(d <= ESCALAR_EM ? [escalar(`Contrato da casa (${quando}) sem assinar a ${d} dias.`)] : [])]);
    if (ctx.equipe && !ctx.equipe.completa && d <= 14) add("equipe", "operacoes", "Equipe da casa incompleta", `Falta: ${ctx.equipe.falta || "conferir em Equipe"}. Faltam ${d} dias para ${quando}.`,
      [{ tipo: "whatsapp", rotulo: "Cobrar a casa no WhatsApp", para: ctx.whatsCasa || "", texto: `Oi! Aqui é do Tranquilo (Operações). Para a data de ${quando}, a equipe da casa ainda está sem: ${ctx.equipe.falta || "algumas funções"}. Dá para cadastrar em Equipe, na Rede Tranquilo, até amanhã? Sem a equipe completa a noite não fecha.` },
      ...(d <= ESCALAR_EM ? [escalar(`Equipe da casa incompleta (${quando}) a ${d} dias.`)] : [])]);
    if (ctx.campanha && !ctx.campanha.existe && d <= 21) add("sem_campanha", "marketing", "Data sem campanha carregada", `Faltam ${d} dias para ${quando} e a casa ainda não tem campanha no portal.`,
      [{ tipo: "ir", rotulo: "Carregar a campanha", alvo: "campanhas" }, ...(d <= 10 ? [escalar(`Data ${quando} sem campanha a ${d} dias.`)] : [])]);
    if (ctx.campanha?.atrasados > 0) add("campanha", "marketing", `Campanha com ${ctx.campanha.atrasados} ${ctx.campanha.atrasados === 1 ? "dia atrasado" : "dias atrasados"}`, `Dias sem "Feito" da casa (${quando}).`,
      [{ tipo: "whatsapp", rotulo: "Cobrar a casa no WhatsApp", para: ctx.whatsCasa || "", texto: `Oi! Aqui é do marketing do Tranquilo. Na campanha de ${quando}, ${ctx.campanha.atrasados === 1 ? "um dia ainda está" : ctx.campanha.atrasados + " dias ainda estão"} sem "Feito". O passo a passo e as artes estão em Próximos passos › Divulgação, na Rede Tranquilo. Se não der para fazer, me avisa que eu ajusto.` },
      { tipo: "ir", rotulo: "Abrir a campanha", alvo: "campanhas" }]);
    if ((ctx.casaAtrasados || []).length >= 2) add("casa_atrasada", "operacoes", `Casa com ${ctx.casaAtrasados.length} passos atrasados`, listaTxt(ctx.casaAtrasados.slice(0, 3)) + ".",
      [{ tipo: "whatsapp", rotulo: "Cobrar a casa no WhatsApp", para: ctx.whatsCasa || "", texto: `Oi! Aqui é do Tranquilo (Operações). Para a data de ${quando}, ainda faltam: ${listaTxt(ctx.casaAtrasados.slice(0, 4))}. Está tudo em Próximos passos, na Rede Tranquilo. Se travou em algo, me conta que eu ajudo.` }]);
    return out;
  }
  /** SOS sem data: Ficha enviada e parada há 7 dias ou mais. casas: [{ id, nome, status, enviado_em }]. */
  function sosFichas(casas, hoje) {
    const limite = new Date(Date.parse(hoje + "T12:00:00Z") - 7 * 864e5).toISOString().slice(0, 10);
    return (casas || []).filter((c) => c.status === "em_analise" && c.enviado_em && String(c.enviado_em).slice(0, 10) <= limite).map((c) => {
      const dias = Math.round((Date.parse(hoje + "T12:00:00Z") - Date.parse(String(c.enviado_em).slice(0, 10) + "T12:00:00Z")) / 864e5);
      return { chave: `ficha|${c.id}`, regra: "ficha", papel: "operacoes", titulo: `Ficha de ${c.nome} sem habilitar há ${dias} dias`, porque: "A casa enviou e espera a resposta.", d: null, dia: null, evento: null,
        acoes: [{ tipo: "abrir", rotulo: "Abrir a Ficha e decidir", alvo: "casa:" + c.id }, ...(dias >= 14 ? [{ tipo: "escalar", rotulo: "Escalar para a adm", texto: `Ficha de ${c.nome} parada há ${dias} dias.` }] : [])] };
    });
  }

  /** Acompanhamento: % feito, atrasados e SOS abertos. */
  function resumo(ps, sos = []) {
    const total = ps.length, feitos = ps.filter((p) => p.feito).length;
    return { total, feitos, pct: total ? Math.round((feitos / total) * 100) : 0, atrasados: ps.filter((p) => p.atrasado).length, sos: sos.length, proximo: proximo(ps) };
  }
  /** Marcas do checklist ({ user_id, evento_id, item, feito, atualizado_em }) de um evento → { item: { por, em } }. */
  function feitosDe(linhas, eventoId, filtro = () => true) {
    const out = {};
    for (const c of linhas || []) if (c.evento_id === eventoId && c.feito !== false && filtro(c)) {
      const atual = out[c.item]; if (!atual || String(c.atualizado_em || "") > String(atual.em || "")) out[c.item] = { por: c.user_id, em: c.atualizado_em || null };
    }
    return out;
  }
  /** Prazo legível: "D-14", "no dia", "D+2". */
  const rotuloD = (dias) => dias === 0 ? "no dia" : dias < 0 ? `D${dias}` : `D+${dias}`;

  g.TQModelos = { PAPEIS, PAPEIS_EQUIPE, PASSOS_EQUIPE, FEITO_CASA, FEITO_ARTISTA, METODO_CASA, REGRAS_SOS, ESCALAR_EM, quemNaCasa, passos, proximo, sosDaData, sosFichas, resumo, feitosDe, rotuloD, metodoArtista };
})(typeof window !== "undefined" ? window : globalThis);
