// Tutorial guiado do primeiro acesso, um roteiro por perfil.
// Abre sozinho na primeira vez que a conta entra (perfis.tutorial_visto_em vazio) e também por link:
//   #tutorial-artista · #tutorial-casa · #tutorial-equipe · #tutorial-adm · #tutorial-publico
"use strict";
const TQTour = (() => {
  // Cada passo: título, texto, lista curta do que fazer e, opcionalmente, um atalho para uma aba.
  const ROTEIROS = {
    artista: {
      rotulo: "Artista",
      passos: [
        { titulo: "Bem-vinda à Rede Tranquilo", texto: "Esta é a sua área na rede: da inscrição até o pós-show, cada etapa aparece aqui, na ordem em que acontece.", itens: ["Você só vê o que é seu.", "A equipe acompanha por aqui, sem precisar te perguntar tudo no WhatsApp."] },
        { titulo: "Primeiro, a inscrição", texto: "Preencha nome artístico, release, links e o seu rider. O que você digita é salvo sozinho, e você pode voltar quando quiser.", itens: ["Leva uns 10 minutos.", "Quanto mais completo, mais forte fica a pré-curadoria."], ir: ["inscricao", "Abrir minha inscrição"] },
        { titulo: "Pré-curadoria na hora", texto: "Ao enviar, o site calcula na hora a força da inscrição, de 0 a 100, e mostra o que pesou: perfil, público, rider, cidades e condições.", itens: ["Os alertas mostram o que dá para melhorar.", "Depois disso, a curadoria da equipe responde aqui mesmo."] },
        { titulo: "Suas datas, passo a passo", texto: "Quando uma data é confirmada, aparece a lista do que fazer, com prazo contado a partir do show: material de divulgação, rider, horários, passagem de som e pós-show.", itens: ["Marque o que já fez: a equipe vê na hora.", "Item atrasado fica vermelho."], ir: ["passos", "Ver próximos passos"] },
        { titulo: "Você em cada praça", texto: "Com a conta vinculada ao seu histórico, você vê o público de cada noite e a faixa típica das praças onde ainda não tocou.", itens: ["Clique em \"Quero tocar aqui\" para pedir uma data numa cidade nova."] },
      ],
    },
    casa: {
      rotulo: "Casa",
      passos: [
        { titulo: "Bem-vinda à Rede Tranquilo", texto: "Aqui a casa produz as datas com autonomia: recebe a data repassada pelo Tranquilo, registra a prontidão e a noite, e o Tranquilo acompanha sem precisar ligar.", itens: ["A casa só vê as próprias datas.", "Tudo o que você marca chega na hora para a equipe."] },
        { titulo: "Cadastro da casa", texto: "Preencha a ficha. O site separa o que bloqueia a habilitação, o que bloqueia algumas datas e o que só enriquece a ficha.", itens: ["Responsável, WhatsApp, endereço, capacidade e som são o mínimo.", "Dá para atualizar a ficha a qualquer momento."], ir: ["cadastro_casa", "Abrir cadastro da casa"] },
        { titulo: "Habilitação", texto: "Com os dados mínimos, a equipe analisa e responde aqui. Uma casa habilitada recebe a primeira data como teste real.", itens: ["Se a equipe pedir ajuste, a mensagem aparece no topo."] },
        { titulo: "Cada data, passo a passo", texto: "Quando o Tranquilo repassa uma data, aparece o roteiro de cada noite com prazos: equipe, técnica, horários, divulgação e o dia do show.", itens: ["Marque cada item quando estiver feito.", "O roteiro completo da noite fica na aba Roteiro da noite."], ir: ["passos", "Ver próximos passos"] },
        { titulo: "Registrar a noite", texto: "No dia seguinte, registre o público e o que aconteceu. Problema ordinário: resolva e registre. Exceção crítica: registre e avise a equipe.", itens: ["O público registrado vira a base de métricas da sua casa e da cidade."] },
      ],
    },
    equipe: {
      rotulo: "Equipe",
      passos: [
        { titulo: "Bem-vindo à operação da rede", texto: "Esta área junta o que a matriz precisa acompanhar sem microgerenciar: datas, alertas, curadoria, casas e prontidão.", itens: ["Os dados de eventos vêm do Notion e são atualizados toda noite."] },
        { titulo: "Operação e alertas", requer: "operacao", texto: "A aba Operação mostra a rodada dos 50 e o que precisa de atenção: datas passadas ainda com vendas abertas, datas próximas sem handoff e datas sem link de ingressos.", itens: ["Clique numa data para abrir a ficha e o checklist no Notion."] },
        { titulo: "Curadoria", texto: "Toda inscrição de artista chega com a pré-curadoria pronta. Você aprova, pede ajustes ou não segue, e a mensagem vai direto para a artista.", itens: ["Use \"Copiar ficha\" para colar no Notion."], ir: ["curadoria", "Abrir curadoria"] },
        { titulo: "Casas e prontidão", texto: "Em Cadastros de casas você habilita e classifica. Em Prontidão vê quem já fez o quê em cada data e os registros da noite.", itens: ["Classificação: 🟢 confiável, 🟡 desenvolvimento, 🔴 correção, ⛔ suspensa."], ir: ["prontidao", "Abrir prontidão"] },
        { titulo: "Convites e demanda", texto: "Em Convites você chama artistas e casas que já estão na rede: elas recebem o link para criar a senha e o tutorial. Em Demanda você vê quantas pessoas pediram show em cada cidade.", itens: ["Cidade com muito pedido e nenhuma data é candidata a abrir."], ir: ["convites", "Abrir convites"] },
      ],
    },
    adm: {
      rotulo: "Administração",
      passos: [
        { titulo: "Bem-vinda à administração", texto: "Você vê tudo o que a equipe vê, mais as métricas de decisão e quem acessa o quê.", itens: ["Os dados de eventos vêm do Notion e são atualizados toda noite."] },
        { titulo: "O que está dando certo", requer: "estrategia", texto: "O painel compara cidades, artistas, modelos e casas pelo público por noite, pela tendência e pelos cancelamentos, e sinaliza o que escalar, manter ou corrigir.", itens: ["É a base para decidir em que cidade abrir mais datas."], ir: ["estrategia", "Abrir o painel"] },
        { titulo: "Pessoas", texto: "Aqui você muda o perfil de cada conta (artista, casa, equipe, administração) e liga a conta ao histórico da artista ou da casa no Notion.", itens: ["Só a administração promove alguém a equipe.", "Também dá para reenviar o link de senha e o tutorial."], ir: ["pessoas", "Abrir pessoas"] },
        { titulo: "Convites", texto: "Para artistas e casas que já trabalham com o Tranquilo: escolha o nome na lista, coloque o e-mail e envie. A pessoa recebe o link, cria a senha e já entra vinculada.", itens: ["O vínculo só vale depois que a pessoa confirma o e-mail.", "O tutorial pode ir por WhatsApp ou e-mail."], ir: ["convites", "Abrir convites"] },
        { titulo: "Demanda por cidade", texto: "Quem visita o site deixa o contato pedindo show na própria cidade. A aba Demanda soma os pedidos e destaca cidades com pedido e sem data marcada.", itens: ["Um número forte para escolher a próxima praça."], ir: ["demanda", "Abrir demanda"] },
        { titulo: "Atualização automática", texto: "O site lê o Notion toda noite. Se os dados ficarem com mais de 36 horas, aparece uma faixa vermelha no topo e o repositório abre um aviso.", itens: ["Você pode rever este tutorial a qualquer momento na aba Conta."] },
      ],
    },
    // Quem entra pelo código de acesso (sem conta por e-mail): painel só de leitura.
    codigo_artista: {
      rotulo: "Artista",
      passos: [
        { titulo: "Este é o seu painel", texto: "Você entrou com o código que a equipe do Tranquilo mandou. Aqui ficam as suas datas na Rede Tranquilo.", itens: ["Não precisa de senha: guarde o código.", "Só você vê o que está aqui."] },
        { titulo: "Suas datas", texto: "Em Minha agenda aparecem as próximas datas, com cidade, casa e link de ingressos, e o público de cada noite que já aconteceu.", itens: [], ir: ["agenda", "Ver minha agenda"] },
        { titulo: "O que fazer agora", texto: "Para cada data, o painel mostra o próximo passo e até quando fazer: contrato, rider, som, divulgação, passagem e pós-show.", itens: ["Clique em \"Ver todos os passos\" para a lista completa."] },
        { titulo: "As cidades da rede", texto: "Em Praças da rede você vê quanta gente costuma ir aos shows em cada cidade, inclusive onde você ainda não tocou.", itens: [], ir: ["pracas", "Ver as cidades"] },
        { titulo: "Quer marcar o que já fez?", texto: "Peça à equipe o convite por e-mail e crie a sua conta: aí você marca cada passo e a equipe acompanha na hora.", itens: ["Este tutorial fica no botão \"Como funciona\", no menu."] },
      ],
    },
    codigo_casa: {
      rotulo: "Casa",
      passos: [
        { titulo: "Este é o painel da sua casa", texto: "Você entrou com o código que a equipe do Tranquilo mandou. Aqui ficam as datas da sua casa na Rede Tranquilo.", itens: ["Não precisa de senha: guarde o código.", "Só a sua casa vê o que está aqui."] },
        { titulo: "Suas datas", texto: "Em Minhas datas aparecem as próximas noites e o público de cada noite que já aconteceu, comparado com a cidade e com a rede.", itens: [], ir: ["minhas", "Ver minhas datas"] },
        { titulo: "O que fazer agora", texto: "Para cada data, o painel mostra o próximo passo e até quando fazer: técnica, roteiro, confirmações por escrito, travas finais e o fechamento.", itens: ["Clique em \"Ver todos os passos\" para a lista completa."] },
        { titulo: "Roteiro da noite", texto: "O passo a passo do dia do show: chegada, passagem de som, portas, início, intervalos e encerramento.", itens: [], ir: ["roteiro", "Ver o roteiro"] },
        { titulo: "Quer registrar a noite?", texto: "Peça à equipe o convite por e-mail e crie a conta da casa: aí você marca cada passo e registra o público e o que aconteceu.", itens: ["Este tutorial fica no botão \"Como funciona\", no menu."] },
      ],
    },
    codigo_interno: {
      rotulo: "Equipe",
      passos: [
        { titulo: "Painel interno da rede", texto: "Este código abre os números de toda a rede, lidos do Notion toda noite. Não compartilhe fora da equipe.", itens: [] },
        { titulo: "Operação", texto: "O que precisa de atenção agora: datas passadas com vendas abertas, datas próximas sem link de ingressos e noites sem público lançado.", itens: ["Clique numa data para ver a ficha."], ir: ["operacao", "Abrir operação"] },
        { titulo: "O que está dando certo", soSe: "estrategia", texto: "Cidades, formatos, casas e artistas comparados com noites do mesmo formato. O sinal só aparece com 3 noites ou mais de público lançado.", itens: [], ir: ["estrategia", "Abrir o painel"] },
        { titulo: "Datas, artistas e casas", texto: "Listas completas com filtros. Clique em qualquer linha para ver a ficha.", itens: [], ir: ["datas", "Abrir datas"] },
        { titulo: "Curadoria e convites", texto: "Inscrições, cadastros de casas, convites e pedidos do \"me avise\" ficam na conta por e-mail da equipe. Entre com ela para usar essas partes.", itens: ["Este tutorial fica no botão \"Como funciona\", no menu."] },
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
      <div class="tour-topo"><span class="tag">Tutorial · ${esc(r.rotulo)}</span><button class="tour-x" data-tour="pular" aria-label="Pular tutorial">Pular</button></div>
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
  function abrir(perfil, { aoFechar, aoIr, temAba } = {}) {
    if (!ROTEIROS[perfil]) return;
    if (el) fechar(false);
    const foco = document.activeElement;
    // O resto da página fica inerte (fora do Tab e do leitor de tela) enquanto o tutorial está aberto.
    const inertes = [...document.body.children].filter((x) => !x.inert && x.tagName !== "SCRIPT");
    inertes.forEach((x) => { x.inert = true; });
    // Passo com `soSe` só aparece quando a aba existe (ex.: o painel estratégico só no código de adm).
    const passos = ROTEIROS[perfil].passos.filter((p) => !p.soSe || !temAba || temAba(p.soSe));
    estado = { perfil, i: 0, passos, aoFechar, aoIr, temAba, foco, inertes };
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
  }

  const linkDe = (perfil) => `${location.origin}${location.pathname}#tutorial-${perfil}`;
  return { abrir, linkDe, ROTEIROS, aberto: () => !!el };
})();
