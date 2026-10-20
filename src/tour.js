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
        { titulo: "Primeiro, a inscrição", texto: "Preencha nome artístico, release, links e o seu rider. O rascunho fica salvo e você pode voltar quando quiser.", itens: ["Leva uns 10 minutos.", "Quanto mais completo, mais forte fica a pré-curadoria."], ir: ["inscricao", "Abrir minha inscrição"] },
        { titulo: "Pré-curadoria na hora", texto: "Ao enviar, o site calcula na hora a força da inscrição, de 0 a 100, e mostra o que pesou: perfil, público, rider, cidades e condições.", itens: ["Os alertas mostram o que dá para melhorar.", "Depois disso, a curadoria da equipe responde aqui mesmo."] },
        { titulo: "Suas datas, passo a passo", texto: "Quando uma data é confirmada, aparece a lista do que fazer, com prazo contado a partir do show: material de divulgação, rider, horários, passagem de som e pós-show.", itens: ["Marque o que já fez: a equipe vê na hora.", "Item atrasado fica vermelho."], ir: ["passos", "Ver próximos passos"] },
        { titulo: "Você em cada praça", texto: "Com a conta vinculada ao seu histórico, você vê o público de cada noite e a faixa típica das praças onde ainda não tocou.", itens: ["Clique em \"Quero tocar aqui\" para pedir uma data numa cidade nova."] },
      ],
    },
    casa: {
      rotulo: "Casa",
      passos: [
        { titulo: "Bem-vinda à Rede Tranquilo", texto: "Aqui a casa produz as datas com autonomia: recebe o handoff, registra a prontidão e a noite, e o Tranquilo acompanha sem precisar ligar.", itens: ["A casa só vê as próprias datas.", "Tudo o que você marca chega na hora para a equipe."] },
        { titulo: "Cadastro da casa", texto: "Preencha a ficha. O site separa o que bloqueia a habilitação, o que bloqueia algumas datas e o que só enriquece a ficha.", itens: ["Responsável, WhatsApp, endereço, capacidade e som são o mínimo.", "Dá para atualizar a ficha a qualquer momento."], ir: ["cadastro_casa", "Abrir cadastro da casa"] },
        { titulo: "Habilitação", texto: "Com os dados mínimos, a equipe analisa e responde aqui. Uma casa habilitada recebe a primeira data como teste real.", itens: ["Se a equipe pedir ajuste, a mensagem aparece no topo."] },
        { titulo: "Cada data, passo a passo", texto: "Depois do handoff, aparece o roteiro de cada noite com prazos: equipe, técnica, horários, divulgação e o dia do show.", itens: ["Marque cada item quando estiver feito.", "O roteiro completo da noite fica na aba Roteiro da noite."], ir: ["passos", "Ver próximos passos"] },
        { titulo: "Registrar a noite", texto: "No dia seguinte, registre o público e o que aconteceu. Problema ordinário: resolva e registre. Exceção crítica: registre e avise a equipe.", itens: ["O público registrado vira a base de métricas da sua casa e da cidade."] },
      ],
    },
    equipe: {
      rotulo: "Equipe",
      passos: [
        { titulo: "Bem-vindo à operação da rede", texto: "Esta área junta o que a matriz precisa acompanhar sem microgerenciar: datas, alertas, curadoria, casas e prontidão.", itens: ["Os dados de eventos vêm do Notion e são atualizados toda noite."] },
        { titulo: "Operação e alertas", texto: "A aba Operação mostra a rodada dos 50 e o que precisa de atenção: datas passadas ainda com vendas abertas, datas próximas sem handoff e datas sem link de ingressos.", itens: ["Clique numa data para abrir a ficha e o checklist no Notion."] },
        { titulo: "Curadoria", texto: "Toda inscrição de artista chega com a pré-curadoria pronta. Você aprova, pede ajustes ou não segue, e a mensagem vai direto para a artista.", itens: ["Use \"Copiar ficha\" para colar no Notion."], ir: ["curadoria", "Abrir curadoria"] },
        { titulo: "Casas e prontidão", texto: "Em Cadastros de casas você habilita e classifica. Em Prontidão vê quem já fez o quê em cada data e os registros da noite.", itens: ["Classificação: 🟢 confiável, 🟡 desenvolvimento, 🔴 correção, ⛔ suspensa."], ir: ["prontidao", "Abrir prontidão"] },
        { titulo: "Convites e demanda", texto: "Em Convites você chama artistas e casas que já estão na rede: elas recebem o link para criar a senha e o tutorial. Em Demanda você vê quantas pessoas pediram show em cada cidade.", itens: ["Cidade com muito pedido e nenhuma data é candidata a abrir."], ir: ["convites", "Abrir convites"] },
      ],
    },
    adm: {
      rotulo: "Administração",
      passos: [
        { titulo: "Bem-vinda à administração", texto: "Você vê tudo o que a equipe vê, mais as métricas de decisão e quem acessa o quê.", itens: ["Os dados de eventos vêm do Notion e são atualizados toda noite."] },
        { titulo: "O que está dando certo", texto: "O painel compara cidades, artistas, modelos e casas pelo público por noite, pela tendência e pelos cancelamentos, e sinaliza o que escalar, manter ou corrigir.", itens: ["É a base para decidir em que cidade abrir mais datas."], ir: ["estrategia", "Abrir o painel"] },
        { titulo: "Pessoas", texto: "Aqui você muda o perfil de cada conta (artista, casa, equipe, administração) e liga a conta ao histórico da artista ou da casa no Notion.", itens: ["Só a administração promove alguém a equipe.", "Também dá para reenviar o link de senha e o tutorial."], ir: ["pessoas", "Abrir pessoas"] },
        { titulo: "Convites", texto: "Para artistas e casas que já trabalham com o Tranquilo: escolha o nome na lista, coloque o e-mail e envie. A pessoa recebe o link, cria a senha e já entra vinculada.", itens: ["O vínculo só vale depois que a pessoa confirma o e-mail.", "O tutorial pode ir por WhatsApp ou e-mail."], ir: ["convites", "Abrir convites"] },
        { titulo: "Demanda por cidade", texto: "Quem visita o site deixa o contato pedindo show na própria cidade. A aba Demanda soma os pedidos e destaca cidades com pedido e sem data marcada.", itens: ["Um número forte para escolher a próxima praça."], ir: ["demanda", "Abrir demanda"] },
        { titulo: "Atualização automática", texto: "O site lê o Notion toda noite. Se os dados ficarem com mais de 36 horas, aparece uma faixa vermelha no topo e o repositório abre um aviso.", itens: ["Você pode rever este tutorial a qualquer momento na aba Conta."] },
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
    const r = ROTEIROS[estado.perfil], p = r.passos[estado.i], ultimo = estado.i === r.passos.length - 1;
    return `<div class="tour-caixa" role="dialog" aria-modal="true" aria-labelledby="tourTit">
      <div class="tour-topo"><span class="tag">Tutorial · ${esc(r.rotulo)}</span><button class="tour-x" data-tour="pular" aria-label="Pular tutorial">Pular</button></div>
      <div class="tour-num" aria-hidden="true">${estado.i + 1}<small>/${r.passos.length}</small></div>
      <h2 id="tourTit">${esc(p.titulo)}</h2>
      <p>${esc(p.texto)}</p>
      ${p.itens?.length ? `<ul>${p.itens.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
      ${p.ir && estado.aoIr ? `<button class="btn sm" data-tour="ir" data-aba-tour="${p.ir[0]}">${esc(p.ir[1])} →</button>` : ""}
      <div class="tour-pontos" role="tablist" aria-label="Passos">${r.passos.map((_, i) => `<button role="tab" aria-selected="${i === estado.i}" aria-label="Passo ${i + 1}" data-tour="ir-passo" data-i="${i}" class="${i === estado.i ? "on" : i < estado.i ? "feito" : ""}"></button>`).join("")}</div>
      <div class="tour-acoes">
        <button class="btn" data-tour="voltar"${estado.i === 0 ? " disabled" : ""}>Voltar</button>
        <button class="btn pri" data-tour="avancar" autofocus>${ultimo ? "Começar" : "Avançar"}</button>
      </div></div>`;
  }

  function desenhar() {
    el.innerHTML = html();
    const p = ROTEIROS[estado.perfil].passos[estado.i];
    document.querySelectorAll(".tour-foco").forEach((x) => x.classList.remove("tour-foco"));
    if (p.alvo) { const a = document.querySelector(p.alvo); if (a) { a.classList.add("tour-foco"); a.scrollIntoView({ block: "center", behavior: "smooth" }); } }
    el.querySelector('[data-tour="avancar"]')?.focus();
  }

  function fechar(concluiu) {
    if (!el) return;
    document.removeEventListener("keydown", teclas);
    document.querySelectorAll(".tour-foco").forEach((x) => x.classList.remove("tour-foco"));
    el.remove(); el = null;
    const fim = estado.aoFechar; estado = null;
    fim?.(concluiu);
  }

  function teclas(ev) {
    if (!el) return;
    if (ev.key === "Escape") { ev.preventDefault(); fechar(false); }
    else if (ev.key === "ArrowRight") { ev.preventDefault(); passo(1); }
    else if (ev.key === "ArrowLeft") { ev.preventDefault(); passo(-1); }
  }

  function passo(d) {
    const n = ROTEIROS[estado.perfil].passos.length, i = estado.i + d;
    if (i >= n) return fechar(true);
    if (i < 0) return;
    estado.i = i; desenhar();
  }

  /** Abre o tutorial do perfil. aoIr(aba) navega para a aba; aoFechar(concluiu) registra que foi visto. */
  function abrir(perfil, { aoFechar, aoIr } = {}) {
    if (!ROTEIROS[perfil]) return;
    if (el) fechar(false);
    estado = { perfil, i: 0, aoFechar, aoIr };
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
