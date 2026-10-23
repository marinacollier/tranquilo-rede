// Tutorial guiado do primeiro acesso, um roteiro por perfil.
// Abre sozinho na primeira vez que a conta entra (perfis.tutorial_visto_em vazio) e também por link:
//   #tutorial-artista · #tutorial-casa · #tutorial-equipe · #tutorial-adm · #tutorial-publico
"use strict";
const TQTour = (() => {
  // Cada passo: título, texto, lista curta do que fazer e, opcionalmente, um atalho para uma aba.
  // Regra: o tutorial de cada perfil passa por TODAS as abas que aquele acesso tem (campo `cobre`).
  // Passo com `cobre` só aparece se ao menos uma das abas existir para a pessoa; `novo` marca o que entrou depois
  // (quem já tinha visto o tutorial recebe só as novidades). O teste do navegador confere a cobertura de cada perfil.
  const NOVIDADES = "2026-10-23";
  const N = { novo: NOVIDADES };
  const EQUIPE = [
    { titulo: "Comece por aqui", cobre: ["inicio"], texto: "A primeira aba junta o que precisa de você hoje: inscrições esperando curadoria, casas para habilitar, datas sem prontidão e relatos novos.", itens: ["Comece o dia por ela."], ir: ["inicio", "Abrir Comece por aqui"] },
    { titulo: "Operação e alertas", requer: "operacao", cobre: ["operacao", "datas"], texto: "A aba Operação mostra a rodada dos 50 e o que precisa de atenção: datas passadas ainda com vendas abertas, datas próximas sem handoff e datas sem link de ingressos. Em Datas fica a lista completa com filtros.", itens: ["Clique numa data para abrir a ficha e o checklist no Notion."] },
    { titulo: "Curadoria", cobre: ["curadoria"], texto: "Toda inscrição de artista chega com a pré-curadoria pronta. Você aprova, pede ajustes ou não segue, e a mensagem vai direto para a artista.", itens: ["Use \"Copiar ficha\" para colar no Notion."], ir: ["curadoria", "Abrir curadoria"] },
    { titulo: "Casas e prontidão", cobre: ["casas_cad", "prontidao"], texto: "Em Cadastros de casas você habilita e classifica. Em Prontidão vê quem já fez o quê em cada data e os registros da noite.", itens: ["Classificação: 🟢 confiável, 🟡 desenvolvimento, 🔴 correção, ⛔ suspensa."], ir: ["prontidao", "Abrir prontidão"] },
    { titulo: "Convites e demanda", cobre: ["convites", "demanda"], texto: "Em Convites você chama artistas e casas que já estão na rede: elas recebem o link para criar a senha e o tutorial. Em Demanda você vê quantas pessoas pediram show em cada cidade.", itens: ["Para a casa ver campanha e materiais dela, o convite precisa ter o nome da casa.", "Cidade com muito pedido e nenhuma data é candidata a abrir."], ir: ["convites", "Abrir convites"] },
    { titulo: "Documentos de cada data", cobre: ["documentos"], ...N, texto: "Anexe o contrato e os materiais de cada data à conta da artista ou da casa: aparecem no passo a passo dela. Aqui também ficam os arquivos que artistas e casas enviaram (rider, mapa de palco, fotos).", itens: [], ir: ["documentos", "Abrir documentos"] },
    { titulo: "Campanhas das casas", cobre: ["campanhas"], ...N, texto: "Veja o andamento da campanha de divulgação de cada casa: dias feitos, atrasados e o próximo. Carregue ou atualize uma campanha com a página ou o arquivo de dados do Bruno, sem SQL.", itens: ["Atualizar não apaga o que a casa já marcou.", "\"Casas no hub\" mostra formato, pessoas, campanha e leituras pendentes de cada casa."], ir: ["campanhas", "Abrir campanhas"] },
    { titulo: "Materiais e leitura confirmada", cobre: ["materiais"], ...N, texto: "Guias, playbooks e modelos para artistas e casas. Publique uma versão nova e escolha se ela muda o que a casa faz: se sim, a casa precisa confirmar \"Li e estou ciente\" de novo.", itens: ["Você vê quem já confirmou e quem falta.", "Material novo: título, link e quem vê (casas, artistas ou uma casa só)."], ir: ["materiais", "Abrir materiais"] },
    { titulo: "Relatos", cobre: ["relatos"], ...N, texto: "Quando alguém usa \"Algo deu errado?\", o relato chega aqui com a tela e os últimos erros daquela pessoa, para a equipe entender sem pedir print.", itens: [], ir: ["relatos", "Abrir relatos"] },
    { titulo: "Base de conhecimento e método", cobre: ["base", "metodo"], texto: "Os artigos da Base de conhecimento do Notion e o método dos 50 eventos, para consultar sem sair do painel.", itens: [] },
  ];
  const CONTA = (extra) => ({ titulo: "Sua conta", cobre: ["conta"], texto: "Na aba Conta ficam seus dados, o vínculo com a rede e o campo para colar um código de acesso." + (extra || ""), itens: ["Este tutorial pode ser revisto a qualquer momento por lá."], ir: ["conta", "Abrir conta"] });
  const ROTEIROS = {
    artista: {
      rotulo: "Artista",
      passos: [
        { titulo: "Bem-vinda à Rede Tranquilo", texto: "Esta é a sua área na rede: da inscrição até o pós-show, cada etapa aparece aqui, na ordem em que acontece.", itens: ["Você só vê o que é seu.", "A equipe acompanha por aqui, sem precisar te perguntar tudo no WhatsApp."] },
        { titulo: "Primeiro, a inscrição", cobre: ["inscricao"], texto: "Preencha nome artístico, release, links e o seu rider. O que você digita é salvo sozinho, e você pode voltar quando quiser.", itens: ["Leva uns 10 minutos.", "Quanto mais completo, mais forte fica a pré-curadoria."], ir: ["inscricao", "Abrir minha inscrição"] },
        { titulo: "Pré-curadoria na hora", texto: "Ao enviar, o site calcula na hora a força da inscrição, de 0 a 100, e mostra o que pesou: perfil, público, rider, cidades e condições.", itens: ["Os alertas mostram o que dá para melhorar.", "Depois disso, a curadoria da equipe responde aqui mesmo."] },
        { titulo: "Suas datas, passo a passo", cobre: ["passos"], texto: "Quando uma data é confirmada, aparece a lista do que fazer, com prazo contado a partir do show: contrato, rider, horários, passagem de som e pós-show.", itens: ["Marque o que já fez: a equipe vê na hora.", "Em \"Contrato e materiais\" de cada data ficam o contrato e o envio do rider."], ir: ["passos", "Ver próximos passos"] },
        { titulo: "Você em cada praça", cobre: ["agenda", "pracas"], texto: "Com a conta vinculada ao seu histórico, você vê a sua agenda, o público de cada noite e a faixa típica das praças onde ainda não tocou.", itens: ["Clique em \"Quero tocar aqui\" para pedir uma data numa cidade nova."] },
        { titulo: "Materiais", cobre: ["materiais"], ...N, texto: "Guias e modelos do Tranquilo para artistas. Os modelos abrem só para leitura: toque em \"Fazer minha cópia\" para ter a sua versão editável.", itens: ["Se algum material pedir, confirme com \"Li e estou ciente\"."], ir: ["materiais", "Abrir materiais"] },
        { titulo: "Dúvidas frequentes", cobre: ["duvidas"], ...N, texto: "Respostas curtas para o que mais perguntam: inscrição, curadoria, contrato, rider, pagamento e o dia do show.", itens: ["Não achou? Use \"Algo deu errado?\" no rodapé e a equipe recebe."], ir: ["duvidas", "Abrir dúvidas"] },
        CONTA(),
      ],
    },
    casa: {
      rotulo: "Casa",
      passos: [
        { titulo: "Bem-vinda à Rede Tranquilo", texto: "Aqui a casa produz as datas com autonomia: recebe a data repassada pelo Tranquilo, registra a prontidão e a noite, e o Tranquilo acompanha sem precisar ligar.", itens: ["A casa só vê as próprias datas.", "Tudo o que você marca chega na hora para a equipe."] },
        { titulo: "Cadastro da casa", cobre: ["cadastro_casa"], texto: "Preencha a ficha. O site separa o que bloqueia a habilitação, o que bloqueia algumas datas e o que só enriquece a ficha.", itens: ["Responsável, WhatsApp, endereço, capacidade e som são o mínimo.", "Dá para atualizar a ficha a qualquer momento."], ir: ["cadastro_casa", "Abrir cadastro da casa"] },
        { titulo: "Habilitação", texto: "Com os dados mínimos, a equipe analisa e responde aqui. Uma casa habilitada recebe a primeira data como teste real.", itens: ["Se a equipe pedir ajuste, a mensagem aparece no topo."] },
        { titulo: "Cada data, passo a passo", cobre: ["passos"], texto: "Quando o Tranquilo repassa uma data, aparece o roteiro de cada noite com prazos: equipe, técnica, horários, divulgação e o dia do show.", itens: ["Marque cada item quando estiver feito.", "Em \"Contrato e materiais\" de cada data ficam o contrato e os arquivos."], ir: ["passos", "Ver próximos passos"] },
        { titulo: "Campanha de divulgação", cobre: ["campanha"], ...N, texto: "O que postar e mandar em cada dia, com os modelos do Canva e os links prontos. Marque \"Feito\" ao terminar: vale para toda a equipe da casa, e o Tranquilo acompanha.", itens: ["\"Levar para o Google Agenda\" coloca os dias da campanha na sua agenda.", "Dia que passou sem \"Feito\" aparece como atrasado."], ir: ["campanha", "Abrir campanha"] },
        { titulo: "Minhas datas e roteiro da noite", cobre: ["minhas", "roteiro"], texto: "Com a conta ligada à casa, você vê as próximas noites, o público de cada noite que já aconteceu e o roteiro do dia do show: chegada, passagem de som, portas e encerramento.", itens: [] },
        { titulo: "Registrar a noite", texto: "No dia seguinte, registre o público e o que aconteceu. Problema ordinário: resolva e registre. Exceção crítica: registre e avise a equipe.", itens: ["O público registrado vira a base de métricas da sua casa e da cidade."] },
        { titulo: "Materiais", cobre: ["materiais"], ...N, texto: "Playbooks, guias e modelos da rede (e os feitos para a sua casa). Os modelos abrem só para leitura: toque em \"Fazer minha cópia\" para editar a sua versão.", itens: ["Quando um material muda o que a casa faz, aparece \"Li e estou ciente\": leia e confirme."], ir: ["materiais", "Abrir materiais"] },
        { titulo: "Dúvidas frequentes", cobre: ["duvidas"], ...N, texto: "Respostas curtas sobre habilitação, datas, campanha, materiais, pagamento e o dia do show.", itens: ["Não achou? Use \"Algo deu errado?\" no rodapé e a equipe recebe."], ir: ["duvidas", "Abrir dúvidas"] },
        CONTA(),
      ],
    },
    equipe: {
      rotulo: "Equipe",
      passos: [
        { titulo: "Bem-vindo à operação da rede", texto: "Esta área junta o que a matriz precisa acompanhar sem microgerenciar: datas, alertas, curadoria, casas, campanhas e materiais.", itens: ["Os dados de eventos vêm do Notion e são atualizados toda noite."] },
        ...EQUIPE,
        CONTA(" Cole aqui o código interno da equipe para liberar Operação, Datas, Base de conhecimento e Método."),
      ],
    },
    adm: {
      rotulo: "Administração",
      passos: [
        { titulo: "Bem-vinda à administração", texto: "Você tem tudo o que a equipe tem, mais as métricas de decisão, quem acessa o quê e os códigos de acesso.", itens: ["Os dados de eventos vêm do Notion e são atualizados toda noite."] },
        { titulo: "O que está dando certo", requer: "estrategia", cobre: ["estrategia"], texto: "O painel compara cidades, artistas, modelos e casas pelo público por noite, pela tendência e pelos cancelamentos, e sinaliza o que escalar, manter ou corrigir.", itens: ["É a base para decidir em que cidade abrir mais datas."], ir: ["estrategia", "Abrir o painel"] },
        ...EQUIPE,
        { titulo: "Artistas e casas da rede", cobre: ["artistas", "casas"], texto: "Listas completas de artistas e casas com o histórico de cada um: noites, público e cancelamentos. Clique em qualquer linha para a ficha.", itens: [] },
        { titulo: "Pessoas", cobre: ["pessoas"], texto: "Aqui você muda o perfil de cada conta (artista, casa, equipe, administração) e liga a conta ao histórico da artista ou da casa no Notion.", itens: ["Só a administração promove alguém a equipe.", "Também dá para reenviar o link de senha e o tutorial."], ir: ["pessoas", "Abrir pessoas"] },
        { titulo: "Códigos de acesso", cobre: ["acessos"], texto: "Cada artista e cada casa tem um código que abre só o painel dela, sem senha. Aqui você copia o código ou o link direto para mandar.", itens: ["O código interno da equipe e o da administração também estão aqui: não compartilhe fora."] },
        CONTA(" O site lê o Notion toda noite; se os dados ficarem com mais de 36 horas, aparece uma faixa vermelha no topo."),
      ],
    },
    // Quem entra pelo código de acesso (sem conta por e-mail): painel só de leitura.
    codigo_artista: {
      rotulo: "Artista",
      passos: [
        { titulo: "Este é o seu painel", texto: "Você entrou com o código que a equipe do Tranquilo mandou. Aqui ficam as suas datas na Rede Tranquilo.", itens: ["Não precisa de senha: guarde o código.", "Só você vê o que está aqui."] },
        { titulo: "Suas datas", cobre: ["agenda"], texto: "Em Minha agenda aparecem as próximas datas, com cidade, casa e link de ingressos, e o público de cada noite que já aconteceu.", itens: [], ir: ["agenda", "Ver minha agenda"] },
        { titulo: "O que fazer agora", texto: "Para cada data, o painel mostra o próximo passo e até quando fazer: contrato, rider, som, divulgação, passagem e pós-show.", itens: ["Clique em \"Ver todos os passos\" para a lista completa."] },
        { titulo: "As cidades da rede", cobre: ["pracas"], texto: "Em Praças da rede você vê quanta gente costuma ir aos shows em cada cidade, inclusive onde você ainda não tocou.", itens: [], ir: ["pracas", "Ver as cidades"] },
        { titulo: "Dúvidas frequentes", cobre: ["duvidas"], ...N, texto: "Respostas curtas sobre contrato, rider, pagamento e o dia do show.", itens: [], ir: ["duvidas", "Abrir dúvidas"] },
        { titulo: "Quer marcar o que já fez?", texto: "Peça à equipe o convite por e-mail e crie a sua conta: aí você marca cada passo, recebe os materiais e a equipe acompanha na hora.", itens: ["Este tutorial fica no botão \"Como funciona\", no menu."] },
      ],
    },
    codigo_casa: {
      rotulo: "Casa",
      passos: [
        { titulo: "Este é o painel da sua casa", texto: "Você entrou com o código que a equipe do Tranquilo mandou. Aqui ficam as datas da sua casa na Rede Tranquilo.", itens: ["Não precisa de senha: guarde o código.", "Só a sua casa vê o que está aqui."] },
        { titulo: "Suas datas", cobre: ["minhas"], texto: "Em Minhas datas aparecem as próximas noites e o público de cada noite que já aconteceu, comparado com a cidade e com a rede.", itens: [], ir: ["minhas", "Ver minhas datas"] },
        { titulo: "O que fazer agora", texto: "Para cada data, o painel mostra o próximo passo e até quando fazer: técnica, roteiro, confirmações por escrito, travas finais e o fechamento.", itens: ["Clique em \"Ver todos os passos\" para a lista completa."] },
        { titulo: "Roteiro da noite", cobre: ["roteiro"], texto: "O passo a passo do dia do show: chegada, passagem de som, portas, início, intervalos e encerramento.", itens: [], ir: ["roteiro", "Ver o roteiro"] },
        { titulo: "Dúvidas frequentes", cobre: ["duvidas"], ...N, texto: "Respostas curtas sobre datas, campanha, materiais e o dia do show.", itens: [], ir: ["duvidas", "Abrir dúvidas"] },
        { titulo: "Quer registrar a noite e a campanha?", texto: "Peça à equipe o convite por e-mail e crie a conta da casa: aí você marca cada passo, registra o público, acompanha a campanha de divulgação e recebe os materiais.", itens: ["Este tutorial fica no botão \"Como funciona\", no menu."] },
      ],
    },
    codigo_interno: {
      rotulo: "Equipe",
      passos: [
        { titulo: "Painel interno da rede", texto: "Este código abre os números de toda a rede, lidos do Notion toda noite. Não compartilhe fora da equipe.", itens: [] },
        { titulo: "Operação", cobre: ["operacao"], texto: "O que precisa de atenção agora: datas passadas com vendas abertas, datas próximas sem link de ingressos e noites sem público lançado.", itens: ["Clique numa data para ver a ficha."], ir: ["operacao", "Abrir operação"] },
        { titulo: "O que está dando certo", soSe: "estrategia", cobre: ["estrategia"], texto: "Cidades, formatos, casas e artistas comparados com noites do mesmo formato. O sinal só aparece com 3 noites ou mais de público lançado.", itens: [], ir: ["estrategia", "Abrir o painel"] },
        { titulo: "Datas, artistas e casas", cobre: ["datas", "artistas", "casas"], texto: "Listas completas com filtros. Clique em qualquer linha para ver a ficha.", itens: [], ir: ["datas", "Abrir datas"] },
        { titulo: "Base de conhecimento e método", cobre: ["base", "metodo"], texto: "Os artigos da Base de conhecimento do Notion e o método dos 50 eventos.", itens: [] },
        { titulo: "Códigos de acesso", cobre: ["acessos"], texto: "Os códigos de cada artista e casa, com o link direto para mandar.", itens: ["Não compartilhe os códigos internos fora da equipe."] },
        { titulo: "Curadoria, campanhas e materiais", texto: "Inscrições, cadastros de casas, convites, campanhas, materiais e relatos ficam na conta por e-mail da equipe. Entre com ela para usar essas partes.", itens: ["Este tutorial fica no botão \"Como funciona\", no menu."] },
      ],
    },
    publico: {
      rotulo: "Visitante",
      passos: [
        { titulo: "Esta é a Rede Tranquilo", texto: "Música ao vivo circulando por várias cidades, com artistas em ascensão e casas parceiras.", itens: ["A agenda é atualizada toda noite."] },
        { titulo: "Agenda e ingressos", texto: "Role a página para ver as próximas datas por mês. O botão Ingressos leva direto para a ticketeira, sem precisar de conta.", itens: [] },
        { titulo: "Avise-me na minha cidade", texto: "Não tem show perto de você? Deixe seu e-mail ou WhatsApp e a cidade: quando abrir data, você fica sabendo antes.", itens: ["Sem senha e sem cadastro."], alvo: "#avise" },
        { titulo: "É artista ou tem uma casa?", texto: "Crie a sua conta para se inscrever na curadoria ou cadastrar a sua casa. Cada perfil vê só o que é dele.", itens: [], alvo: "#acesso" },
      ],
    },
  };

  let el = null, estado = null;

  function html() {
    const r = ROTEIROS[estado.perfil], passos = estado.passos, p0 = passos[estado.i], ultimo = estado.i === passos.length - 1;
    // Sem a aba (ex.: painel interno sem o código), o passo explica como liberar em vez de prometer um atalho que não existe.
    const tem = (aba) => !estado.temAba || estado.temAba(aba);
    const p = p0.requer && !tem(p0.requer)
      ? { ...p0, texto: p0.texto + " Este painel aparece depois que você cola o código interno da equipe na aba Conta.", ir: tem("conta") ? ["conta", "Abrir Conta"] : null }
      : { ...p0, ir: p0.ir && tem(p0.ir[0]) ? p0.ir : null };
    return `<div class="tour-caixa" role="dialog" aria-modal="true" aria-labelledby="tourTit">
      <div class="tour-topo"><span class="tag">${estado.novidades ? "Novidades" : "Tutorial"} · ${esc(r.rotulo)}</span><button class="tour-x" data-tour="pular" aria-label="Pular tutorial">Pular</button></div>
      <div class="tour-num" aria-hidden="true">${estado.i + 1}<small>/${passos.length}</small></div>
      <h2 id="tourTit">${esc(p.titulo)}</h2>
      <p>${esc(p.texto)}</p>
      ${p.itens?.length ? `<ul>${p.itens.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
      ${p.ir && estado.aoIr ? `<button class="btn sm" data-tour="ir" data-aba-tour="${p.ir[0]}">${esc(p.ir[1])} →</button>` : ""}
      <div class="tour-pontos" aria-label="Passos">${passos.map((_, i) => `<button${i === estado.i ? ' aria-current="step"' : ""} aria-label="Passo ${i + 1} de ${passos.length}" data-tour="ir-passo" data-i="${i}" class="${i === estado.i ? "on" : i < estado.i ? "feito" : ""}"></button>`).join("")}</div>
      <div class="tour-acoes">
        <button class="btn" data-tour="voltar"${estado.i === 0 ? " disabled" : ""}>Voltar</button>
        <button class="btn pri" data-tour="avancar" autofocus>${ultimo ? "Começar" : "Avançar"}</button>
      </div></div>`;
  }

  function desenhar() {
    el.innerHTML = html();
    const p = estado.passos[estado.i];
    document.querySelectorAll(".tour-foco").forEach((x) => x.classList.remove("tour-foco"));
    const a = p.alvo && document.querySelector(p.alvo);
    // Com alvo, a caixa vai para baixo e o alvo rola para o topo: os dois ficam visíveis, sem um cobrir o outro.
    el.classList.toggle("com-alvo", !!a);
    if (a) { a.classList.add("tour-foco"); a.scrollIntoView({ block: "start", behavior: "smooth" }); }
    el.querySelector('[data-tour="avancar"]')?.focus();
  }

  function fechar(concluiu) {
    if (!el) return;
    document.removeEventListener("keydown", teclas);
    document.querySelectorAll(".tour-foco").forEach((x) => x.classList.remove("tour-foco"));
    estado.inertes.forEach((x) => { x.inert = false; });
    el.remove(); el = null;
    const fim = estado.aoFechar, antes = estado.foco; estado = null;
    fim?.(concluiu);
    if (antes && antes.isConnected && document.activeElement === document.body) antes.focus?.();
  }

  function teclas(ev) {
    if (!el) return;
    if (ev.key === "Escape") { ev.preventDefault(); fechar(false); }
    else if (ev.key === "ArrowRight") { ev.preventDefault(); passo(1); }
    else if (ev.key === "ArrowLeft") { ev.preventDefault(); passo(-1); }
    else if (ev.key === "Tab") {
      // O foco fica dentro da caixa enquanto o tutorial está aberto.
      const fs = [...el.querySelectorAll("button:not([disabled]),a[href]")];
      if (!fs.length) return;
      const i = fs.indexOf(document.activeElement), n = fs.length;
      ev.preventDefault();
      fs[i < 0 ? 0 : (i + (ev.shiftKey ? n - 1 : 1)) % n].focus();
    }
  }

  function passo(d) {
    const n = estado.passos.length, i = estado.i + d;
    if (i >= n) return fechar(true);
    if (i < 0) return;
    estado.i = i; desenhar();
  }

  /** Abre o tutorial do perfil. aoIr(aba) navega para a aba; temAba(aba) diz se ela existe; aoFechar(concluiu) registra que foi visto. */
  // Passos que a pessoa vê: `soSe` e `cobre` somem quando a aba não existe para ela (com `requer`, o passo fica e explica
  // como liberar). Com `desde` (data em que viu o tutorial), só o que é mais novo que isso.
  function passosDe(perfil, temAba, desde) {
    const tem = (a) => !temAba || temAba(a);
    return ROTEIROS[perfil].passos.filter((p) => (!p.soSe || tem(p.soSe)) && (!p.cobre || p.requer || p.cobre.some(tem)) && (!desde || (p.novo && p.novo > desde.slice(0, 10))));
  }
  /** Abas da pessoa que nenhum passo do tutorial explica (o teste exige lista vazia). */
  function semTutorial(perfil, abas) {
    const cobertas = new Set(ROTEIROS[perfil].passos.flatMap((p) => [...(p.cobre || []), ...(p.ir ? [p.ir[0]] : []), ...(p.soSe ? [p.soSe] : [])]));
    return abas.filter((a) => !cobertas.has(a));
  }
  /** Abre o tutorial do perfil. aoIr(aba) navega para a aba; temAba(aba) diz se ela existe; aoFechar(concluiu) registra que foi visto.
   *  desde: data em que a pessoa viu o tutorial; abre só as novidades (e não abre se não houver). Devolve se abriu. */
  function abrir(perfil, { aoFechar, aoIr, temAba, desde } = {}) {
    if (!ROTEIROS[perfil]) return false;
    if (el) fechar(false);
    const foco = document.activeElement;
    // O resto da página fica inerte (fora do Tab e do leitor de tela) enquanto o tutorial está aberto.
    const inertes = [...document.body.children].filter((x) => !x.inert && x.tagName !== "SCRIPT");
    inertes.forEach((x) => { x.inert = true; });
    const passos = passosDe(perfil, temAba, desde);
    if (!passos.length) { inertes.forEach((x) => { x.inert = false; }); return false; }
    estado = { perfil, i: 0, passos, aoFechar, aoIr, temAba, foco, inertes, novidades: !!desde };
    el = document.createElement("div");
    el.className = "tour";
    el.addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-tour]");
      if (!b) { if (ev.target === el) fechar(false); return; }
      const acao = b.dataset.tour;
      if (acao === "avancar") passo(1);
      else if (acao === "voltar") passo(-1);
      else if (acao === "pular") fechar(false);
      else if (acao === "ir-passo") { estado.i = +b.dataset.i; desenhar(); }
      else if (acao === "ir") { const aba = b.dataset.abaTour, ir = estado.aoIr; fechar(false); ir?.(aba); }
    });
    document.body.appendChild(el);
    document.addEventListener("keydown", teclas);
    desenhar();
    return true;
  }

  const linkDe = (perfil) => `${location.origin}${location.pathname}#tutorial-${perfil}`;
  return { abrir, linkDe, ROTEIROS, NOVIDADES, semTutorial, passosDe, aberto: () => !!el };
})();
