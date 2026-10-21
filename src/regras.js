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
    if (integrantes > 5) alertas.push("Formação com mais de 5 pessoas: rota condicionada");
    if (d.rider_tipo === "especial") alertas.push("Rider de produção especial");
    if (cache > 1500) alertas.push("Cachê mínimo acima de R$ 1.500");
    if (cidadesOk === 0) alertas.push("Nenhuma cidade de interesse na rede atual");
    return { score, faixa: score >= 65 ? "Prioridade" : score >= 40 ? "Avaliar" : "Abaixo do corte", alertas,
      detalhe: { completude, tracao, tecnica, circulacao, condicoes } };
  }

  function pendenciasCasa(d = {}) {
    const hab = [], match = [], enriquecimento = [];
    if (!tem(d.responsavel)) hab.push("Responsável local");
    if (!tem(d.whatsapp)) hab.push("WhatsApp do responsável");
    if (!tem(d.endereco) || !tem(d.cidade)) hab.push("Endereço e cidade");
    if (int(d.capacidade) <= 0) hab.push("Capacidade de público");
    if (!tem(d.som) || d.som === "nao_tem") hab.push("Como resolve o som (PA próprio ou parceiro técnico)");
    if (String(d.aceite_responsabilidades) !== "true") hab.push("Aceite da matriz de responsabilidades da casa");
    if (!tem(d.palco)) match.push("Medidas do palco");
    if (!tem(d.microfones)) match.push("Microfones e DIs disponíveis");
    if (!tem(d.luz)) match.push("Luz (frontal para rosto)");
    if (!tem(d.restricoes)) match.push("Restrições de horário e volume");
    if (!tem(d.camarim)) match.push("Camarim");
    if (!tem(d.backline)) enriquecimento.push("Backline");
    if (!tem(d.acessibilidade)) enriquecimento.push("Acessibilidade");
    if (!tem(d.instagram)) enriquecimento.push("Instagram");
    if (!tem(d.como_chegar)) enriquecimento.push("Como chegar (transporte e estacionamento)");
    return { habilitacao: hab, match, enriquecimento };
  }

  // Passo a passo por data. Dias relativos à data do show (negativo = antes).
  // Fonte: checklist de operações dos eventos (T-28, T-21, T-14, T-7, dia, pós) e método V0.1 (handoff) no Notion.
  const PASSOS_ARTISTA = [
    ["contrato", -35, "Ler e assinar o contrato", "Condição econômica, responsabilidades e cancelamento. Sem contrato assinado a data não segue para o handoff."],
    ["formacao", -28, "Fechar formação e equipe", "Quem sobe ao palco e quem acompanha (técnico de som, produção). No backstage, no máximo 2 acompanhantes por banda."],
    ["rider", -28, "Enviar rider técnico e mapa de palco", "A casa precisa do rider 4 semanas antes para confirmar PA, monitores, microfones e DIs."],
    ["som", -21, "Validar o som com a casa", "Combine com o técnico da casa o setup (PA, mesa, monitores, microfones, DI, cabos) e o horário da passagem de som."],
    ["logistica", -21, "Confirmar logística", "Transporte, hospedagem e horário de chegada, direto com a casa e com o parceiro logístico, quando houver."],
    ["divulgacao", -15, "Começar a divulgação", "Campanha mínima de 15 dias com o briefing e o link de ingressos que o Tranquilo envia. Mande fotos e release atualizados."],
    ["horarios", -7, "Confirmar horários e acompanhantes", "Chegada, passagem de som, portas, início e horário final. Lista com nomes de quem entra no backstage."],
    ["roteiro", -2, "Revisar o roteiro da noite", "Duração do show, intervalos e fala. A apresentação é o centro da noite."],
    ["passagem", 0, "Chegar e fazer a passagem de som", "No horário combinado. Problema comum: resolva direto com a casa. Exceção crítica: avise o Tranquilo."],
    ["pagamento", 1, "Enviar nota fiscal ou recibo", "Com os dados de pagamento, para o fechamento da data e o pagamento do cachê."],
    ["feedback", 3, "Contar como foi", "Casa, som, público e o que melhorar. Isso entra na qualificação da rede."],
  ];
  const PASSOS_CASA = [
    ["handoff", -30, "Receber o handoff da data", "Artista, condição, contatos, rider, logística, materiais de marca e canal de escalonamento."],
    ["ficha", -28, "Revisar a ficha da casa para este formato", "Capacidade real, restrições de horário e som, acessos, carga e descarga."],
    ["rider", -28, "Conferir o rider do artista", "Rider técnico recebido e compatível com a casa."],
    ["tecnico", -21, "Confirmar técnico de som e setup", "PA, mesa, monitores, microfones, DI, cabos e luz frontal para o rosto."],
    ["roteiro", -21, "Fechar o roteiro do dia", "Equipe, passagem, portas, início, intervalos, encerramento e desmontagem."],
    ["escrito", -14, "Confirmar tudo por escrito", "Equipamentos e fornecedores, maquininha com plano B (Pix ou link), rádios, plano B/C para som, energia, internet e chuva."],
    ["travas", -7, "Travas finais", "Horários de chegada, compras de camarim, bar e limpeza, briefing do time local e plano de caixa."],
    ["prontidao", 0, "Prontidão da noite", "Marca instalada, casa pronta, artista presente, portas abertas, show iniciado e encerrado."],
    ["publico", 0, "Registrar o público e as ocorrências", "Use \"Registrar a noite\" logo depois do show."],
    ["fechamento", 1, "Fechamento e prestação de contas", "Pagamentos, conferência de Pix, cartão e dinheiro, devoluções e erros básicos registrados."],
  ];

  function passosDaData(modelo, dataIso, feitos, hoje) {
    const lista = modelo === "casa" ? PASSOS_CASA : PASSOS_ARTISTA;
    const base = new Date(dataIso + "T12:00:00");
    return lista.map(([chave, dias, titulo, texto]) => {
      const prazo = new Date(base.getTime() + dias * 864e5).toISOString().slice(0, 10);
      const feito = !!(feitos && feitos[chave]);
      // Depois do show, o que era "antes ou no dia" não tem mais como ser feito: vira "não registrado",
      // não "atrasado". Só conta como atraso o que ainda dá para fazer.
      const passou = !feito && dias <= 0 && dataIso < hoje;
      return { chave, dias, titulo, texto, prazo, feito, passou, atrasado: !feito && !passou && prazo < hoje, agora: !feito && prazo >= hoje };
    });
  }

  g.TQRegras = { CIDADES_REDE, preCuradoria, pendenciasCasa, PASSOS_ARTISTA, PASSOS_CASA, passosDaData };
})(typeof window !== "undefined" ? window : globalThis);
