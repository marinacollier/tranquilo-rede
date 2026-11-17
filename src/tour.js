// Tutorial guiado do primeiro acesso, um roteiro por perfil.
// Abre sozinho na primeira vez que a conta entra (perfis.tutorial_visto_em vazio) e também por link:
//   #tutorial-artista · #tutorial-casa · #tutorial-equipe · #tutorial-adm · #tutorial-publico
// Botões: Avançar/Voltar, "Pular tutorial" (não abre mais sozinho), × ou Esc = Fechar (pausa: no próximo acesso
// continua do passo onde parou, uma vez só) e "Concluir" no último passo. "Ver de novo" abre o roteiro inteiro
// e não muda nada do que já foi visto.
"use strict";
const TQTour = (() => {
  // Cada passo: título, texto, lista curta do que fazer e, opcionalmente, um atalho para uma aba.
  // Regra: o tutorial de cada perfil passa por TODAS as abas que aquele acesso tem (campo `cobre`).
  // Passo com `cobre` só aparece se ao menos uma das abas existir para a pessoa; `novo` marca o que entrou depois
  // (quem já tinha visto o tutorial recebe só as novidades). O teste do navegador confere a cobertura de cada perfil.
  // Datas com hora (UTC): quem viu o tutorial antes delas recebe só as novidades. Compara o instante, não só o dia.
  const NOVIDADES = "2026-11-17T18:00:00Z";
  const N7 = { novo: "2026-11-17T18:00:00Z" }, N = { novo: "2026-10-23" }, N2 = { novo: "2026-10-23T14:00:00Z" }, N3 = { novo: "2026-10-27T23:00:00Z" }, N4 = { novo: "2026-10-28T12:00:00Z" }, N5 = { novo: "2026-11-06T11:00:00Z" }, N6 = { novo: NOVIDADES };
  const ms = (x) => { const t = Date.parse(x); return Number.isNaN(t) ? 0 : t; };
  /** A pessoa viu o tutorial antes da última leva de novidades? */
  const temNovidades = (visto) => ms(visto) < ms(NOVIDADES);
  const EQUIPE = [
    { titulo: "Comece por aqui", cobre: ["inicio"], texto: "A primeira aba junta o que precisa de você hoje: inscrições esperando curadoria, casas para habilitar, datas sem prontidão e relatos novos.", itens: ["Comece o dia por ela."], ir: ["inicio", "Abrir Comece por aqui"] },
    { titulo: "Operação e alertas", requer: "operacao", cobre: ["operacao", "datas"], texto: "A aba Operação mostra a rodada dos 50 e o que precisa de atenção: datas passadas ainda com vendas abertas, datas próximas sem handoff e datas sem link de ingressos. Em Datas fica a lista completa com filtros.", itens: ["Clique numa data para abrir a ficha e o checklist no Notion."] },
    { titulo: "Curadoria", cobre: ["curadoria"], texto: "Toda inscrição de artista chega com a pré-curadoria pronta. Você aprova, pede ajustes ou não segue, e a mensagem vai direto para a artista.", itens: ["Use \"Copiar ficha\" para colar no Notion."], ir: ["curadoria", "Abrir curadoria"] },
    { titulo: "Histórico de alterações", cobre: ["historico"], ...N6, texto: "Toda alteração feita no portal, por qualquer pessoa: quem, quando, o antes e o depois. Só a administração vê.", itens: [], ir: ["historico", "Abrir"] },
    { titulo: "Artista e casa", cobre: ["lado_a_lado"], ...N6, texto: "Cada data com o artista e a casa lado a lado: ordem da noite, horários, endereço, situação da ficha da casa, disponibilidade e bonificação. Os horários e a ordem ainda estão a validar.", itens: [], ir: ["lado_a_lado", "Abrir"] },
    { titulo: "Painel da operação", cobre: ["painel"], ...N5, texto: "Todos os próximos eventos por data, com vendas (quando lançadas no Notion), situação do contrato, situação da ficha da casa e o que falta em cada um. Filtre por cidade, casa, status ou foco: o que precisa de atenção nos próximos 14 dias, contratos pendentes ou qualquer pendência.", itens: ["Bonificações ainda não aparecem: falta confirmar a fonte e a regra."], ir: ["painel", "Abrir o painel"] },
    { titulo: "Criar datas", cobre: ["datas_portal"], ...N6, texto: "A Isa cria a data aqui: dia, abertura, casa, formato e o line-up na ordem da noite. A data aparece na hora para a casa e para as artistas, entra em Preparar contrato e gera a mensagem de cronograma.", itens: ["Escolha o artista da lista para ligar à conta dele", "Preparar contrato já vem com a data e o artista"] },
    { titulo: "Agenda das casas", cobre: ["agenda_casas"], ...N5, texto: "O calendário que cada casa preenche na área Datas, com os eventos já confirmados e os conflitos (evento em dia marcado como indisponível). Só a casa altera a disponibilidade dela.", itens: ["Disponível não é reserva: confirme com a casa antes de fechar."], ir: ["agenda_casas", "Abrir a agenda"] },
    { titulo: "Treinamento das casas novas", cobre: ["trilhas"], ...N4, texto: "O treinamento de cada casa nova em 7 dias úteis: Thales passa o lead (dia 1), Gui (dias 2 e 3), Isa (dias 4 e 5) e Bruno (dias 6 e 7). Cada um marca a própria etapa e vê com quem está o bastão e o que atrasou. A casa confirma a parte dela pela área dela.", itens: ["A nota de passagem do Thales (com o combinado financeiro) fica só com a Central.", "Cada trilha mostra a equipe que a casa montou e o que falta: tripé, Líder Local e reserva."], ir: ["trilhas", "Abrir treinamentos"] },
    { titulo: "Casas e prontidão", cobre: ["casas_cad", "prontidao"], texto: "Em Cadastros de casas você habilita e classifica. Em Prontidão vê quem já fez o quê em cada data e os registros da noite.", itens: ["Classificação: 🟢 confiável, 🟡 desenvolvimento, 🔴 correção, ⛔ suspensa."], ir: ["prontidao", "Abrir prontidão"] },
    { titulo: "Convites e demanda", cobre: ["convites", "demanda"], texto: "Em Convites você chama artistas e casas que já estão na rede: elas recebem o link para criar a senha e o tutorial. Em Demanda você vê quantas pessoas pediram show em cada cidade.", itens: ["Para a casa ver campanha e materiais dela, o convite precisa ter o nome da casa.", "Cidade com muito pedido e nenhuma data é candidata a abrir."], ir: ["convites", "Abrir convites"] },
    { titulo: "Contratos e documentos", cobre: ["documentos"], ...N7, texto: "Prepare o contrato a partir do modelo: os dados já vêm da Ficha da casa ou da inscrição do artista. A pessoa baixa o PDF já assinado pelo Tranquilo, assina e envia de volta, e o passo do contrato fica feito sozinho. Você vê \"Assinado · arquivo recebido\" e abre o arquivo.", itens: ["Cole o modelo do Notion: [PREENCHER …] vira campo.", "Contrato assinado não muda mais: para corrigir, cancele e gere outro antes da assinatura."], ir: ["documentos", "Abrir documentos"] },
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
        { titulo: "Bem-vinda à Rede Tranquilo", texto: "Esta é a sua área na rede. O menu tem só duas partes: Suas datas (o que acontece em cada show) e Seu cadastro (quem você é na rede).", itens: ["Você só vê o que é seu.", "A equipe acompanha por aqui, sem precisar te perguntar tudo no WhatsApp."] },
        { titulo: "Primeiro, a inscrição", cobre: ["art_cad", "inscricao"], ...N7, texto: "Em Seu cadastro › Minha inscrição você conta quem é: nome artístico, release (pelo menos 200 caracteres), links, rider e cidades. O que você digita é salvo sozinho.", itens: ["Leva uns 10 minutos.", "Campo obrigatório vazio não deixa enviar: o site mostra qual falta."], ir: ["inscricao", "Abrir minha inscrição"] },
        { titulo: "Pré-curadoria e curadoria", texto: "Ao enviar, o site calcula na hora a força da inscrição, de 0 a 100, e mostra o que pesou. Depois, a Isa responde aqui mesmo: aprovada, ajustes ou não seguir.", itens: ["Se pedirem ajustes, a mensagem aparece no topo da inscrição."] },
        { titulo: "Onde e quando você pode tocar", cobre: ["disp_artista"], ...N7, texto: "Em Suas datas › Disponibilidade ficam juntas as cidades onde você quer tocar e os dias em que pode. A Isa cruza isso com a agenda das casas para montar as datas.", itens: ["Toque num dia para marcar disponível; de novo para indisponível."], ir: ["disp_artista", "Abrir a disponibilidade"] },
        { titulo: "Suas datas, passo a passo", cobre: ["art_datas", "passos"], ...N7, texto: "Quando uma data é confirmada, aparece em Próximos passos com local, ordem da noite, horários e o que fazer até o show, com prazo.", itens: ["Marque o que já fez: a equipe vê na hora.", "O passo do contrato fica feito sozinho quando você envia o contrato assinado."], ir: ["passos", "Ver próximos passos"] },
        { titulo: "Contrato: baixe, assine e envie", cobre: ["contratos_meus"], ...N7, texto: "O contrato chega já assinado pelo Tranquilo. Em Suas datas › Contratos você completa os seus dados, baixa o PDF, assina (à mão ou pelo gov.br) e envia o arquivo de volta.", itens: ["Você não assina dentro do portal.", "Ao enviar o arquivo, aparece ✓ e a equipe recebe na hora."], ir: ["contratos_meus", "Abrir contratos"] },
        { titulo: "Você em cada praça", cobre: ["agenda", "pracas"], texto: "Com a conta ligada ao seu histórico, você vê a sua agenda, o público de cada noite e a faixa típica das praças onde ainda não tocou.", itens: ["Toque em \"Quero tocar aqui\" para pedir uma data numa cidade nova."] },
        { titulo: "Materiais, Base e Método", cobre: ["materiais", "base", "metodo"], ...N7, texto: "Em Seu cadastro ficam os guias do Tranquilo para artistas, a Base de conhecimento (perguntas e respostas) e o Método da rede.", itens: ["Se algum material pedir, confirme com \"Li e estou ciente\"."], ir: ["materiais", "Abrir materiais"] },
        { titulo: "Dúvidas frequentes", cobre: ["duvidas"], texto: "Respostas curtas sobre inscrição, curadoria, contrato, rider, pagamento e o dia do show.", itens: ["Não achou? Use \"Algo deu errado?\" no rodapé e a equipe recebe."], ir: ["duvidas", "Abrir dúvidas"] },
        CONTA(),
      ],
    },
    casa: {
      rotulo: "Casa",
      passos: [
        { titulo: "Bem-vinda à Rede Tranquilo", texto: "Aqui a casa produz as datas com autonomia e o Tranquilo acompanha sem precisar ligar. O menu tem só duas partes: Sua casa (cadastro, equipe, guia, contrato e financeiro) e Suas datas (disponibilidade, cada show e a divulgação).", itens: ["A casa só vê as próprias datas.", "Tudo o que você marca chega na hora para a equipe."] },
        { titulo: "1. Cadastro da casa", cobre: ["ficha", "cadastro_casa"], ...N7, texto: "Comece por Sua casa › Cadastro: como a sua unidade vai funcionar e os dados da casa, do Dono A, dos repasses, do espaço, do som, do bar e da agenda.", itens: ["Campo obrigatório vazio não deixa enviar: o site mostra qual falta.", "Depois de enviada, a Ficha muda por \"Solicitar atualização\"; o Gui confere e aprova."], ir: ["cadastro_casa", "Abrir o cadastro"] },
        { titulo: "Habilitação", texto: "Com a Ficha completa, o Gui (Operações) analisa e responde aqui. Casa habilitada recebe a primeira data como teste real.", itens: ["Se pedirem ajuste, a mensagem aparece no topo do cadastro."] },
        { titulo: "2. Equipe da casa", cobre: ["equipe_casa"], ...N7, texto: "Em Sua casa › Equipe: Líder Local, anfitrião, social media, técnico de som e porta, cada função com uma pessoa diferente, e 1 reserva. Quem tiver e-mail ganha acesso só ao que é da função.", itens: ["Só você pode ser também o Líder Local. O bar é responsabilidade sua."], ir: ["equipe_casa", "Abrir a equipe"] },
        { titulo: "3. Guia e treinamento", cobre: ["guia", "trilha"], ...N7, texto: "Em Sua casa › Guia do franqueado ficam o Guia e os manuais do Apresenta e do Descubra, abrindo na própria página. O Treinamento mostra os 7 dias úteis com Thales, Gui, Isa e Bruno e o que falta da casa.", itens: [], ir: ["guia", "Abrir o Guia"] },
        { titulo: "4. Contrato: baixe, assine e envie", cobre: ["contratos_meus"], ...N7, texto: "O contrato da parceria chega já assinado pelo Tranquilo. Em Sua casa › Contrato você confere os dados (vêm da Ficha), baixa o PDF, assina (à mão ou pelo gov.br) e envia o arquivo de volta.", itens: ["Você não assina dentro do portal.", "Ao enviar o arquivo, aparece ✓ e o Gui recebe na hora."], ir: ["contratos_meus", "Abrir o contrato"] },
        { titulo: "5. Financeiro", cobre: ["financeiro_casa", "bonificacao"], ...N7, texto: "Em Sua casa › Financeiro: a divisão da bilheteria e do bar, a conta que recebe a parte da casa e as bonificações. Quem registra os combinados é o Gui.", itens: ["Os dados da conta você informa no Cadastro."], ir: ["financeiro_casa", "Abrir o financeiro"] },
        { titulo: "6. Disponibilidade", cobre: ["datas_casa", "agenda_casa"], ...N7, texto: "Em Suas datas › Disponibilidade, marque os dias da semana e os dias do calendário em que a casa pode receber o Tranquilo. A Isa consulta para montar a agenda.", itens: ["Disponível não é reserva: a data só vale quando a Isa confirma.", "Cada toque salva sozinho e mostra ✓ Salvo."], ir: ["agenda_casa", "Abrir a disponibilidade"] },
        { titulo: "7. Cada data, passo a passo", cobre: ["passos"], ...N7, texto: "Quando a Isa confirma uma data, ela aparece em Suas datas › Passo a passo, com prazos do repasse ao fechamento no D+2: equipe e porta com reserva (D-7), pacote no grupo dos artistas (D-5), prontidão, público e fechamento.", itens: ["Marque cada item quando estiver feito: a Central vê na hora."], ir: ["passos", "Ver o passo a passo"] },
        { titulo: "8. Cronogramas e divulgação", cobre: ["cronograma", "mkt_produtor", "mkt_anfitriao", "mkt_social", "campanha"], ...N7, texto: "Ainda em Suas datas: Cronogramas traz a mensagem pronta da noite para mandar aos artistas; Produtor local, Anfitrião e Social media mostram o que cada função faz; Campanhas tem o que postar em cada dia.", itens: ["Marque \"Feito\" na campanha: vale para toda a equipe da casa."], ir: ["cronograma", "Abrir os cronogramas"] },
        { titulo: "Público e roteiro da noite", cobre: ["minhas", "roteiro"], texto: "O público de cada noite que já aconteceu e o roteiro do dia do show: chegada, passagem de som, portas e encerramento.", itens: [] },
        { titulo: "Materiais, Base e Método", cobre: ["materiais", "base", "metodo"], ...N7, texto: "Em Sua casa ficam os materiais da rede, a Base de conhecimento (perguntas e respostas sobre Ingresse, Canva, WhatsApp e mais) e o Método.", itens: ["Quando um material muda o que a casa faz, aparece \"Li e estou ciente\"."], ir: ["materiais", "Abrir materiais"] },
        { titulo: "Dúvidas frequentes", cobre: ["duvidas"], texto: "Respostas curtas sobre habilitação, datas, campanha, materiais, pagamento e o dia do show.", itens: ["Não achou? Use \"Algo deu errado?\" no rodapé e a equipe recebe."], ir: ["duvidas", "Abrir dúvidas"] },
        CONTA(),
      ],
    },
    // Pessoa da equipe da casa (Líder Local, anfitrião, social media, som, porta, bar): só o que é da função.
    casa_equipe: {
      rotulo: "Equipe da casa",
      passos: [
        { titulo: "Bem-vinda à equipe da casa", texto: "Você entrou na equipe de uma casa da Rede Tranquilo. Aqui aparece só o que é da sua função, em duas partes: Sua casa e Suas datas.", itens: ["Quem muda a sua função é o responsável da casa."] },
        { titulo: "Minha função", cobre: ["ficha", "minha_funcao", "guia"], ...N7, texto: "Em Sua casa › Minha função: o que ler uma vez, o que chega a cada show e o que você devolve. O Guia do franqueado também fica em Sua casa.", itens: [], ir: ["minha_funcao", "Abrir minha função"] },
        { titulo: "Passos de cada data", cobre: ["datas_casa", "passos"], ...N7, texto: "Em Suas datas, os passos da sua função para cada show, com prazo. O que você marca vale para a casa inteira.", itens: [], ir: ["passos", "Ver os passos"] },
        { titulo: "Divulgação e cronograma", cobre: ["mkt_produtor", "mkt_anfitriao", "mkt_social", "campanha", "cronograma"], ...N7, texto: "Ainda em Suas datas: o que a sua função faz no marketing, a campanha de cada dia e, para o Líder Local, o cronograma de cada data.", itens: [], ir: ["campanha", "Abrir a campanha"] },
        { titulo: "Equipe da casa", cobre: ["equipe_casa"], texto: "Quem ocupa cada função, com contato, para escalar a noite e chamar a reserva.", itens: [], ir: ["equipe_casa", "Abrir a equipe"] },
        { titulo: "Roteiro da noite", cobre: ["minhas", "roteiro"], texto: "O roteiro do dia do show: chegada, passagem de som, portas, intervalos e encerramento.", itens: [] },
        { titulo: "Materiais, Base e Método", cobre: ["materiais", "base", "metodo"], ...N7, texto: "Guias da rede, a Base de conhecimento e o Método. Quando um material pedir, confirme com \"Li e estou ciente\".", itens: [], ir: ["materiais", "Abrir materiais"] },
        { titulo: "Dúvidas frequentes", cobre: ["duvidas"], texto: "Respostas curtas sobre a noite, a campanha e os materiais.", itens: ["Não achou? Use \"Algo deu errado?\" no rodapé."], ir: ["duvidas", "Abrir dúvidas"] },
        CONTA(),
      ],
    },
    // Equipe do Tranquilo com área (17/11/2026): Isa (Agenda), Gui (Operações), Bruno (Marketing). Cada passo só aparece
    // para quem tem a parte do menu (cobre/soSe); quem tem mais de uma área vê as duas.
    eq_areas: {
      rotulo: "Equipe do Tranquilo",
      passos: [
        { titulo: "Oi! Este é o seu espaço", texto: "O portal junta o que chega da rede na sua área, pra você não precisar procurar. O menu é curto: Início e as partes do seu trabalho. Vai no seu ritmo.", itens: ["Todo mundo convida, vê curadoria, cadastros e agenda das casas, e pode publicar treinamentos."] },
        { titulo: "Início", cobre: ["g_hoje", "hoje", "feito", "geral"], ...N7, texto: "Para você reúne o que chegou na sua área (vale olhar primeiro em cima, o resto embaixo). Seu histórico guarda o que você fez em 30 dias. A rede mostra as próximas datas, só para consultar.", itens: [], ir: ["hoje", "Abrir o Início"] },
        // Isa · Agenda
        { titulo: "Agenda: datas e artistas", soSe: "datas_portal", texto: "Você cuida das datas, dos artistas e do contrato do artista. Em Datas › Criar datas você junta casa e artistas num dia: a busca mostra quem está livre na mesma data e cidade.", itens: ["A data aparece na hora para a casa e para os artistas com conta."], ir: ["datas_portal", "Abrir Criar datas"] },
        { titulo: "Agenda das casas", cobre: ["g_datas", "agenda_casas", "datas"], ...N7, texto: "Em Datas › Agenda das casas, o calendário que cada casa preenche, com conflitos marcados. Datas do Notion mostra o retrato do Notion.", itens: [] },
        { titulo: "Curadoria e convites", cobre: ["g_artistas", "curadoria", "convites"], ...N7, texto: "Em Artistas › Curadoria cada inscrição chega com a pré-curadoria pronta: aprovar, pedir ajustes ou não seguir. Em Convidar você chama quem ainda não tem conta.", itens: [], ir: ["curadoria", "Abrir a curadoria"] },
        // Gui · Operações
        { titulo: "Operações: casas", soSe: "casas_cad", texto: "Você cuida das casas: Ficha, habilitação, combinados, treinamento e contrato da casa. Em Casas › Fichas das casas você habilita (só com a Ficha completa), edita a Ficha e registra os combinados.", itens: ["Casa já habilitada não mostra de novo o botão de habilitar."], ir: ["casas_cad", "Abrir as fichas"] },
        { titulo: "Treinamentos e convites", cobre: ["g_casas", "trilhas"], ...N7, texto: "Em Casas › Treinamentos você acompanha os 7 dias úteis de cada casa nova e marca a sua etapa. Convidar chama casas novas com o vínculo certo.", itens: [], ir: ["trilhas", "Abrir treinamentos"] },
        // Contratos (Isa: artista · Gui: casa)
        { titulo: "Contratos", cobre: ["g_contratos", "documentos"], ...N7, texto: "Em Contratos você prepara o contrato a partir do modelo: os dados já vêm da Ficha (casa) ou da inscrição (artista). A pessoa baixa o PDF já assinado pelo Tranquilo, assina e envia de volta; você vê \"Assinado · arquivo recebido\".", itens: ["A Isa libera o contrato do artista; o Gui, o da casa."], ir: ["documentos", "Abrir contratos"] },
        // Bruno · Marketing
        { titulo: "Marketing: campanhas", soSe: "campanhas", cobre: ["g_campanhas", "campanhas"], ...N7, texto: "Você cuida da divulgação. Em Campanhas vê o andamento de cada casa (dias feitos e atrasados) e carrega ou atualiza a campanha de uma casa com o arquivo.", itens: [], ir: ["campanhas", "Abrir campanhas"] },
        { titulo: "Materiais, Base e Método", cobre: ["g_materiais", "materiais", "base", "metodo"], ...N7, texto: "Em Materiais ficam os guias e documentos que abrem dentro da página (Operações e Marketing publicam versões novas), a Base de conhecimento e o Método.", itens: [], ir: ["materiais", "Abrir materiais"] },
        CONTA(" Aqui também dá para mudar a sua senha."),
      ],
    },
    equipe: {
      rotulo: "Equipe",
      passos: [
        { titulo: "Bem-vindo à operação da rede", texto: "Esta área junta o que a Central precisa acompanhar sem microgerenciar: datas, alertas, curadoria, casas, campanhas e materiais.", itens: ["Os dados de eventos vêm do Notion e são atualizados toda noite."] },
        ...EQUIPE,
        CONTA(" Cole aqui o código interno da equipe para liberar Operação, Datas, Base de conhecimento e Método."),
      ],
    },
    adm: {
      rotulo: "Administração",
      passos: [
        { titulo: "Bem-vinda à administração", texto: "Você tem tudo o que a equipe tem, mais as métricas de decisão, quem acessa o quê e os códigos de acesso. O menu é separado por assunto: Início, Datas, Artistas, Casas, Contratos, Marketing, Pessoas e acessos e Referência.", itens: ["Os dados de eventos vêm do Notion e são atualizados toda noite."] },
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
  const PAUSAS = 1;   // quantas vezes o tutorial volta sozinho depois de fechado no ×, antes de contar como visto
  const ler = (k) => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } };
  const gravar = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem armazenamento */ } };

  function html() {
    const r = ROTEIROS[estado.perfil], passos = estado.passos, p0 = passos[estado.i], ultimo = estado.i === passos.length - 1;
    // Sem a aba (ex.: painel interno sem o código), o passo explica como liberar em vez de prometer um atalho que não existe.
    const tem = (aba) => !estado.temAba || estado.temAba(aba);
    const p = p0.requer && !tem(p0.requer)
      ? { ...p0, texto: p0.texto + " Este painel aparece depois que você cola o código interno da equipe na aba Conta.", ir: tem("conta") ? ["conta", "Abrir Conta"] : null }
      : { ...p0, ir: p0.ir && tem(p0.ir[0]) ? p0.ir : null };
    const modo = estado.novidades ? "Novidades" : estado.retomou ? "Continuando o tutorial" : "Tutorial";
    return `<div class="tour-caixa" role="dialog" aria-modal="true" aria-labelledby="tourTit">
      <div class="tour-topo"><span class="tag">${modo} · ${esc(r.rotulo)}</span><button class="tour-x" data-tour="fechar" aria-label="${estado.primeira ? "Fechar (continua depois)" : "Fechar"}" title="${estado.primeira ? "Fechar: no próximo acesso o tutorial continua daqui" : "Fechar"}">×</button></div>
      <div class="tour-num" aria-hidden="true">${estado.i + 1}<small>/${passos.length}</small></div>
      <h2 id="tourTit">${esc(p.titulo)}</h2>
      <p>${esc(p.texto)}</p>
      ${p.itens?.length ? `<ul>${p.itens.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
      ${p.ir && estado.aoIr ? `<button class="btn sm" data-tour="ir" data-aba-tour="${p.ir[0]}">${esc(p.ir[1])} →</button>` : ""}
      ${ultimo && estado.dicaRever ? `<p class="tour-dica">Para ver de novo: ${esc(estado.dicaRever)}.</p>` : ""}
      ${estado.novidades && estado.completo ? `<button class="tour-link" data-tour="completo">Ver o tutorial completo</button>` : ""}
      <div class="tour-pontos" aria-label="Passos">${passos.map((_, i) => `<button${i === estado.i ? ' aria-current="step"' : ""} aria-label="Passo ${i + 1} de ${passos.length}" data-tour="ir-passo" data-i="${i}" class="${i === estado.i ? "on" : i < estado.i ? "feito" : ""}"></button>`).join("")}</div>
      <div class="tour-acoes">
        <button class="btn" data-tour="voltar"${estado.i === 0 ? " disabled" : ""}>Voltar</button>
        ${ultimo ? "" : `<button class="tour-link" data-tour="pular">Pular tutorial</button>`}
        <button class="btn pri" data-tour="avancar" autofocus>${ultimo ? "Concluir" : "Avançar"}</button>
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

  // motivo: "concluiu" (último passo), "pulou" (Pular tutorial), "fechou" (× ou Esc) ou "atalho" (botão que leva a uma aba).
  // No primeiro acesso, "fechou" e "atalho" deixam o tutorial pendente: ele volta do mesmo passo no próximo acesso (PAUSAS vezes).
  function fechar(motivo) {
    if (!el) return;
    document.removeEventListener("keydown", teclas);
    document.querySelectorAll(".tour-foco").forEach((x) => x.classList.remove("tour-foco"));
    estado.inertes.forEach((x) => { x.inert = false; });
    el.remove(); el = null;
    const e = estado; estado = null;
    // "Ver de novo" só conta como visto se for até o fim (e aí apaga uma pausa pendente).
    let visto = e.primeira || motivo === "concluiu";
    if (!e.primeira && visto && e.chave) gravar(`tq-tour-${e.chave}`, null);
    if (e.primeira && e.chave) {
      const prog = ler(`tq-tour-${e.chave}`) || {};
      const pausa = motivo === "fechou" || motivo === "atalho", pausas = (prog.pausas || 0) + (pausa ? 1 : 0);
      visto = !pausa || pausas > PAUSAS;
      gravar(`tq-tour-${e.chave}`, visto ? null : { i: e.i, pausas });
    }
    try { window.TQDiario?.registrar("tutorial", { roteiro: e.perfil, motivo, passo: e.i + 1, de: e.passos.length, modo: e.novidades ? "novidades" : e.primeira ? "primeiro" : "rever" }); } catch { /* diário é opcional */ }
    e.aoFechar?.(visto, motivo);
    if (e.primeira && motivo !== "concluiu" && motivo !== "completo" && e.dicaRever) avisar(visto ? `Tutorial ${motivo === "pulou" ? "pulado" : "fechado"}. Para ver de novo: ${e.dicaRever}.` : `Tutorial pausado: no próximo acesso ele continua do passo ${e.i + 1}. Ou abra agora em ${e.dicaRever}.`);
    if (e.foco && e.foco.isConnected && document.activeElement === document.body) e.foco.focus?.();
  }
  // Aviso curto no canto da tela, que some sozinho.
  function avisar(txt) {
    document.querySelector(".tour-aviso")?.remove();
    const a = document.createElement("div"); a.className = "tour-aviso"; a.setAttribute("role", "status"); a.textContent = txt;
    document.body.appendChild(a); setTimeout(() => a.remove(), 7000);
  }

  function teclas(ev) {
    if (!el) return;
    if (ev.key === "Escape") { ev.preventDefault(); fechar("fechou"); }
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
    if (i >= n) return fechar("concluiu");
    if (i < 0) return;
    estado.i = i; desenhar();
  }

  /** Abre o tutorial do perfil. aoIr(aba) navega para a aba; temAba(aba) diz se ela existe; aoFechar(concluiu) registra que foi visto. */
  // Passos que a pessoa vê: `soSe` e `cobre` somem quando a aba não existe para ela (com `requer`, o passo fica e explica
  // como liberar). Com `desde` (data em que viu o tutorial), só o que é mais novo que isso.
  function passosDe(perfil, temAba, desde) {
    const tem = (a) => !temAba || temAba(a);
    return ROTEIROS[perfil].passos.filter((p) => (!p.soSe || tem(p.soSe)) && (!p.cobre || p.requer || p.cobre.some(tem)) && (!desde || (p.novo && ms(p.novo) > ms(desde))));
  }
  /** Abas da pessoa que nenhum passo do tutorial explica (o teste exige lista vazia). */
  function semTutorial(perfil, abas) {
    const cobertas = new Set(ROTEIROS[perfil].passos.flatMap((p) => [...(p.cobre || []), ...(p.ir ? [p.ir[0]] : []), ...(p.soSe ? [p.soSe] : [])]));
    return abas.filter((a) => !cobertas.has(a));
  }
  /** Abre o tutorial do perfil. aoIr(aba) navega para a aba; temAba(aba) diz se ela existe.
   *  primeira: abriu sozinho (primeiro acesso ou novidades); chave: onde guardar a pausa neste aparelho.
   *  aoFechar(visto, motivo): visto = pode marcar como visto (não volta sozinho). dicaRever: onde rever ("Como funciona, no menu").
   *  desde: data em que a pessoa viu o tutorial; abre só as novidades (e não abre se não houver). Devolve se abriu. */
  function abrir(perfil, { aoFechar, aoIr, temAba, desde, primeira = false, chave, dicaRever } = {}) {
    if (!ROTEIROS[perfil]) return false;
    if (el) fechar("fechou");
    const foco = document.activeElement;
    // O resto da página fica inerte (fora do Tab e do leitor de tela) enquanto o tutorial está aberto.
    const inertes = [...document.body.children].filter((x) => !x.inert && x.tagName !== "SCRIPT");
    inertes.forEach((x) => { x.inert = true; });
    const passos = passosDe(perfil, temAba, desde);
    if (!passos.length) { inertes.forEach((x) => { x.inert = false; }); return false; }
    // Fechado no × da última vez: continua do mesmo passo.
    const prog = primeira && chave ? ler(`tq-tour-${chave}`) : null;
    const i0 = prog && Number.isInteger(prog.i) ? Math.min(prog.i, passos.length - 1) : 0;
    estado = { perfil, i: i0, passos, aoFechar, aoIr, temAba, foco, inertes, novidades: !!desde, retomou: i0 > 0, primeira, chave, dicaRever,
      completo: () => { fechar("completo"); abrir(perfil, { aoIr, temAba, dicaRever, chave, aoFechar }); } };
    el = document.createElement("div");
    el.className = "tour";
    el.addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-tour]");
      if (!b) return;   // clicar fora da caixa não fecha: evita perder o tutorial sem querer
      const acao = b.dataset.tour;
      if (acao === "avancar") passo(1);
      else if (acao === "voltar") passo(-1);
      else if (acao === "pular") fechar("pulou");
      else if (acao === "fechar") fechar("fechou");
      else if (acao === "completo") estado.completo();
      else if (acao === "ir-passo") { estado.i = +b.dataset.i; desenhar(); }
      else if (acao === "ir") { const aba = b.dataset.abaTour, ir = estado.aoIr; fechar("atalho"); ir?.(aba); }
    });
    document.body.appendChild(el);
    document.addEventListener("keydown", teclas);
    desenhar();
    return true;
  }

  const linkDe = (perfil) => `${location.origin}${location.pathname}#tutorial-${perfil}`;
  return { abrir, linkDe, ROTEIROS, NOVIDADES, temNovidades, semTutorial, passosDe, aberto: () => !!el };
})();
