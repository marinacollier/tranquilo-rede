// Regras compartilhadas entre o site e os testes.
// preCuradoria e pendenciasCasa espelham as funções SQL de supabase/schema.sql
// (o banco é a fonte da verdade; aqui servem para o modo demonstração e a prévia ao vivo).
(function (g) {
  "use strict";
  const CIDADES_REDE = ["São Paulo", "Belo Horizonte", "Rio de Janeiro", "Brasília", "Curitiba", "Florianópolis", "Porto Alegre",
    "Campinas", "Santos", "Santo André", "Sorocaba", "Itajaí", "Salvador", "Recife"];
  const int = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : 0; };
  const tem = (v) => v != null && String(v) !== "";

  function preCuradoria(d = {}) {
    const ouvintes = int(d.ouvintes_mensais), seguidores = int(d.seguidores_instagram);
    const links = ["spotify", "youtube", "outro_link"].filter((k) => tem(d[k])).length;
    const integrantes = tem(d.integrantes) ? int(d.integrantes) : 1, cache = int(d.cache_minimo);
    const completude = (String(d.release || "").length >= 200 ? 5 : 0) + (tem(d.foto) ? 5 : 0) + (links >= 2 ? 5 : 0) + (tem(d.contato_producao) ? 5 : 0);
    const tracao = (ouvintes >= 50000 ? 20 : ouvintes >= 10000 ? 15 : ouvintes >= 2000 ? 10 : ouvintes >= 500 ? 5 : 0)
      + (seguidores >= 20000 ? 15 : seguidores >= 5000 ? 10 : seguidores >= 1000 ? 5 : 0);
    const tecnica = { circulavel: 20, condicionado: 10, especial: 3 }[d.rider_tipo] || 0;
    const cidadesOk = (d.cidades_interesse || []).filter((c) => CIDADES_REDE.includes(c)).length;
    const circulacao = Math.min(15, cidadesOk * 5);
    const condicoes = String(d.aceita_bonus) === "true" ? 10 : cache > 0 && cache <= 800 ? 5 : 0;
    const score = completude + tracao + tecnica + circulacao + condicoes;
    const alertas = [];
    if (links === 0) alertas.push("Sem link de áudio ou vídeo");
    if (integrantes > 3) alertas.push("Formação acima de trio: o padrão é voz e um instrumento, duo ou trio");
    if (d.rider_tipo === "especial") alertas.push("Rider de produção especial");
    if (cache > 1500) alertas.push("Cachê mínimo acima de R$ 1.500");
    if (cidadesOk === 0) alertas.push("Nenhuma cidade de interesse na rede atual");
    return { score, faixa: score >= 65 ? "Prioridade" : score >= 40 ? "Avaliar" : "Abaixo do corte", alertas,
      detalhe: { completude, tracao, tecnica, circulacao, condicoes } };
  }

  // Campos da Ficha da unidade (modelo v1 do Gui, 30/10/2026). Fichas antigas usam outros nomes de campo: valem também,
  // para nada do que a casa já preencheu se perder (responsavel → dono_nome, cidade → cidade_uf, dias → funcionamento).
  // Público sentado é regra fixa do Tranquilo. Casa já habilitada não perde a habilitação por isso: vê o aviso de nova
  // exigência até preencher (ver casa_rehabilitar no banco).
  const NOVA_EXIGENCIA = "Capacidade com público sentado no chão";
  const lista = (v) => Array.isArray(v) ? v.length > 0 : tem(v);
  function pendenciasCasa(d = {}) {
    const hab = [], match = [], enriquecimento = [];
    const v = (novo, antigo) => tem(d[novo]) ? d[novo] : d[antigo];
    if (!tem(d.nome)) hab.push("Nome da casa");
    if (!tem(v("cidade_uf", "cidade"))) hab.push("Cidade/UF");
    if (!tem(d.endereco)) hab.push("Endereço completo");
    if (!tem(v("dono_nome", "responsavel"))) hab.push("Dono A: nome completo");
    if (!tem(d.whatsapp)) hab.push("Dono A: WhatsApp");
    if (int(d.capacidade_sentado) <= 0) hab.push(NOVA_EXIGENCIA);
    if (!tem(d.palco)) match.push("Palco (medidas e altura)");
    if (!tem(d.camarim)) match.push("Camarim");
    if (!tem(d.som) && !tem(d.rider)) match.push("Sistema de som ou rider técnico da casa");
    if (!tem(d.luz)) match.push("Luz");
    if (!tem(d.menores)) match.push("Menores de idade");
    if (!tem(d.instagram)) enriquecimento.push("Instagram da casa");
    if (!tem(d.como_chegar)) enriquecimento.push("Como chegar");
    if (!lista(d.acessibilidade) && !tem(d.acessibilidade_obs)) enriquecimento.push("Acessibilidade");
    if (!lista(d.dias_semana)) enriquecimento.push("Dias da semana que podem receber o Tranquilo");
    return { habilitacao: hab, match, enriquecimento };
  }

  // Passo a passo por data. Dias relativos à data do show (negativo = antes).
  // Fonte: checklist de operações dos eventos (T-28, T-21, T-14, T-7, dia, pós) e método V0.1 (handoff) no Notion.
  const PASSOS_ARTISTA = [
    ["contrato", -35, "Ler e assinar o contrato", "Condição econômica, responsabilidades e cancelamento. Sem contrato assinado a data não é repassada para a casa."],
    ["formacao", -28, "Fechar formação e equipe", "Formato do Tranquilo: voz e um instrumento, duo ou trio. Quem acompanha: 2 a 3 pessoas da equipe e 3 a 4 convidados por artista."],
    ["rider", -28, "Enviar rider técnico e mapa de palco", "A casa precisa do rider 4 semanas antes para confirmar PA, monitores, microfones e DIs."],
    ["som", -21, "Validar o som com a casa", "Combine com o técnico da casa o setup (PA, mesa, monitores, microfones, DI, cabos) e o horário da passagem de som."],
    ["logistica", -21, "Confirmar logística", "Transporte, hospedagem e horário de chegada, direto com a casa e com o parceiro logístico, quando houver."],
    ["divulgacao", -15, "Começar a divulgação", "Campanha mínima de 15 dias com o briefing e o link de ingressos que o Tranquilo envia. Mande fotos e release atualizados."],
    ["horarios", -7, "Confirmar horários e acompanhantes", "Chegada, passagem de som, portas, início e horário final. Mande à casa os nomes da equipe (2 a 3) e dos convidados (3 a 4) para a lista da portaria."],
    ["roteiro", -2, "Revisar o roteiro da noite", "Duração do show, intervalos e fala. A apresentação é o centro da noite."],
    ["passagem", 0, "Chegar e fazer a passagem de som", "No horário combinado. Problema comum: resolva direto com a casa. Exceção crítica: avise o Tranquilo."],
    ["pagamento", 1, "Enviar nota fiscal ou recibo", "Com os dados de pagamento, para o fechamento da data e o pagamento do cachê."],
    ["feedback", 3, "Contar como foi", "Casa, som, público e o que melhorar. Isso entra na qualificação da rede."],
  ];
  const PASSOS_CASA = [
    ["handoff", -30, "Datas e atrações do mês aprovadas por escrito", "No mês anterior. Campanha planejada com o Marketing."],
    ["ficha", -28, "Revisar a ficha da casa para este formato", "Capacidade real, restrições de horário e som, acessos, carga e descarga."],
    ["rider", -28, "Conferir o rider do artista", "Rider técnico recebido e compatível com a casa."],
    ["tecnico", -21, "Confirmar técnico de som e setup", "PA, mesa, monitores, microfones, DI, cabos e luz frontal para o rosto."],
    ["roteiro", -21, "Fechar o roteiro do dia", "Equipe, passagem, portas, início, intervalos, encerramento e desmontagem."],
    ["escrito", -14, "Confirmar tudo por escrito", "Equipamentos e fornecedores, maquininha com plano B (Pix ou link), rádios, plano B/C para som, energia, internet e chuva."],
    ["travas", -7, "Travas finais", "Horários de chegada, compras de camarim, bar e limpeza, briefing do time local e plano de caixa."],
    ["divulgacao_local", -7, "Divulgação local rodando", "Uma semana antes, a divulgação local já está no ar."],
    ["equipe_reserva", -7, "Equipe escalada, com reserva", "Uma pessoa reserva para a equipe da noite, definida na semana do evento. Se alguém faltar, chame a reserva combinada antes."],
    ["porta_reserva", -7, "Operadores de porta com reserva", "Quem fica na porta e a reserva, com cadastro na Ingresse com o mesmo e-mail. Mande nome e e-mail à Central, que libera as permissões."],
    ["briefing_anfitriao", -7, "Briefing do anfitrião", "O briefing chega no D-7 com as apresentações dos artistas: leia e prepare as três falas da noite."],
    ["pacote_grupo", -5, "Pacote fixado no grupo com os artistas", "De D-5 a D-4: pacote enviado e fixado no grupo com os artistas. Rider, equipe, porta e bebidas confirmados com a Operações."],
    ["prontidao", 0, "A noite", "Montagem, passagem de som, portas no horário, padrão da noite. O cronograma dos shows não muda no dia."],
    ["publico", 0, "Registrar o público e as intercorrências", "Anote qualquer intercorrência. Use \"Registrar a noite\" logo depois do show."],
    ["fechamento", 2, "Fechamento (D+2)", "Relatório oficial do caixa do bar (dinheiro, cartão e Pix), custos da data com comprovantes, intercorrências e retorno dos artistas. Registros oficiais, não fotos de caixa."],
    ["estoque", 2, "Planilha de estoque", "Preenchida em até 2 dias depois do evento. Novos pedidos de bebida só saem depois dela."],
    ["material_social", 2, "Material da social media (48 h)", "Pasta crua na manhã seguinte; 3 vídeos editados e fotos em até 48 h depois do show."],
  ];

  // Passos que vieram do checklist de operações do Notion e não estão no Guia do Franqueado v1.5: aparecem com "a validar"
  // até o Gui confirmar (os outros seguem o Guia, "A semana de cada evento" e "Depois de cada evento").
  const A_VALIDAR = new Set(["ficha", "rider", "tecnico", "roteiro", "escrito", "travas", "porta_reserva", "briefing_anfitriao", "material_social"]);
  function passosDaData(modelo, dataIso, feitos, hoje) {
    const lista = modelo === "casa" ? PASSOS_CASA : PASSOS_ARTISTA;
    const base = new Date(dataIso + "T12:00:00");
    return lista.map(([chave, dias, titulo, texto]) => {
      const prazo = new Date(base.getTime() + dias * 864e5).toISOString().slice(0, 10);
      const feito = !!(feitos && feitos[chave]);
      // Depois do show, o que era "antes ou no dia" não tem mais como ser feito: vira "não registrado",
      // não "atrasado". Só conta como atraso o que ainda dá para fazer.
      const passou = !feito && dias <= 0 && dataIso < hoje;
      return { chave, dias, titulo, texto, prazo, feito, passou, validar: modelo === "casa" && A_VALIDAR.has(chave), atrasado: !feito && !passou && prazo < hoje, agora: !feito && prazo >= hoje };
    });
  }

  g.TQRegras = { CIDADES_REDE, NOVA_EXIGENCIA, preCuradoria, pendenciasCasa, PASSOS_ARTISTA, PASSOS_CASA, A_VALIDAR, passosDaData };
})(typeof window !== "undefined" ? window : globalThis);
