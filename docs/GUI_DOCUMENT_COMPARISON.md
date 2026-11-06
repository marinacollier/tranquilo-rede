# Comparação: documentos do Gui × portal

Atualizado em 06/11/2026 (commit em `docs/SESSION_STATE.md`). Status geral: **EM HOMOLOGAÇÃO**. A estrutura e os textos
da Ficha batem 1:1 (conferido pelo teste `tests/e2e/portal-casa.cjs` contra o inventário). Há 7 adaptações que o Gui
precisa aprovar antes de declarar `VALIDADO`.

Status: `CORRESPONDE` · `ADAPTAÇÃO A APROVAR` (diferença consciente, aguardando o Gui) · `PENDENTE` (falta implementar) · `FONTE EXTERNA` (o portal aponta para o original, sem cópia).

## 1. Ficha da unidade (modelo v1, 30/10/2026)

| Documento | Seção original | Campo/conteúdo original | Correspondência no portal | Divergência | Correção | Status |
|---|---|---|---|---|---|---|
| Ficha | Cabeçalho | "Tranquilo [Cidade] · [Casa] · Ficha da unidade" | Ficha da Casa: título com o nome da casa | — | — | CORRESPONDE |
| Ficha | Cabeçalho | "Em implantação" · "Acompanhamento: Gui, Operações" | Selo com o status da ficha (rascunho, em análise, habilitada…) | Status vem do fluxo de habilitação, não do texto fixo | — | ADAPTAÇÃO A APROVAR |
| Ficha | Introdução | "Esta Ficha é só da sua casa…" | Mesmo texto, adaptado ao portal ("O que você preenche fica salvo") | Doc fala em "Copiar respostas e colar no WhatsApp do Gui"; no portal o envio é pelo botão | — | ADAPTAÇÃO A APROVAR |
| Ficha | Introdução | "Abrir o Guia do Franqueado ↗" | Botão "Abrir o Guia do Franqueado ↗" (leva a Operações › Guia e materiais) | — | — | CORRESPONDE |
| Ficha | Introdução | "Já deixamos preenchido o que você nos contou" | Não há pré-preenchimento pela Central | A Central não edita os dados da casa no portal | Importar da base Casas do Notion, com aprovação | PENDENTE |
| Ficha | Parte 1 · Como vai funcionar | Produtos; Ingressos (Ingresse); Datas e artistas (Isa) | Parte 1 › Como vai funcionar, mesmos textos | — | — | CORRESPONDE |
| Ficha | Parte 1 · Divisão das receitas | Bilheteria 70/15/15; A&B 90/10 (ajustável por casa) | Valores da casa, registrados pela Central em "Combinados" | Sem valor registrado aparece "Ainda não registrado pela Operações" (o portal não mostra o padrão como se fosse o combinado) | — | ADAPTAÇÃO A APROVAR |
| Ficha | Parte 1 · Divisão das receitas | Texto dos custos logísticos e repasses | Mesmo texto | — | — | CORRESPONDE |
| Ficha | Parte 1 · Seus contatos | Assunto, Quem, Contato (Gui, Isa, Bruno, Zerrinha) | Mesma tabela; o WhatsApp vem dos combinados da casa | Os números não ficam no código público do site | Central registra os números em Combinados | ADAPTAÇÃO A APROVAR |
| Ficha | Parte 1 · Próximos passos | 5 passos com prazos | Mesmos 5 passos e prazos; feito marcado por dado real (ficha enviada, tripé na equipe) | — | — | CORRESPONDE |
| Ficha | A casa | Descrição + 13 campos (Nome da casa … Como chegar), "A casa emite nota fiscal?" Sim/Não, ajudas de Endereço e Como chegar, @ no Instagram | Parte 2 › A casa: mesmos 13 campos, ordem, opções e ajudas | — | — | CORRESPONDE |
| Ficha | Dono A (responsável legal) | Descrição + 7 campos, dd/mm/aaaa, "Usado só no contrato." | Mesmos 7 campos | Visível só para a casa e a administração | — | CORRESPONDE |
| Ficha | Dados para repasses | Descrição + 7 campos, Tipo de conta Corrente/Poupança/Pagamento | Mesmos 7 campos e opções | Visível só para a casa e a administração | — | CORRESPONDE |
| Ficha | O espaço | Descrição + capacidade sentada no chão, em pé, almofadas…, palco, Camarim (3 opções), Acessibilidade (6 opções + "Outras observações"), Menores de idade (3 opções) | Mesmos campos, ordem e opções | "Outras observações" ganhou o rótulo "Acessibilidade: outras observações" (no doc é só o texto de exemplo do campo) | — | ADAPTAÇÃO A APROVAR |
| Ficha | Som, luz e palco | Descrição + 7 campos, microfones e pedestais Sim/Não, exemplos e ajudas | Mesmos 7 campos | — | — | CORRESPONDE |
| Ficha | Bar e cozinha | 4 campos com ajudas | Mesmos 4 campos | — | — | CORRESPONDE |
| Ficha | Ingressos e agenda | Ticketeira; dias da semana (7 opções); "As datas exatas são combinadas com a Isa." | Mesmos campos; os dias marcados também aparecem como referência em Datas › Disponibilidade | — | — | CORRESPONDE |
| Ficha | Sua equipe | Texto + Líder Local (Nome, WhatsApp, E-mail), Anfitrião e Social Media (Nome, WhatsApp, Instagram), Técnico de som (Nome, WhatsApp, Observação) | Seção "Sua equipe" com os mesmos blocos e campos, lidos da Equipe da casa (fonte única) | Edição em Ficha da Casa › Equipe da casa (não repete o cadastro) | — | CORRESPONDE |
| Ficha | Dúvidas sobre o Guia | Texto + "Suas dúvidas" | Mesma seção | — | — | CORRESPONDE |
| Ficha | Enviar para o Tranquilo | "Copiar respostas" + "Abrir WhatsApp do Gui" | "Enviar a Ficha ao Tranquilo" + "Copiar respostas" | Sem o botão do WhatsApp: o envio vai para a Central pelo portal | — | ADAPTAÇÃO A APROVAR |
| Ficha | Rodapé | "Esta Ficha resume as condições… vale o contrato assinado." | Mesmo texto | — | — | CORRESPONDE |
| Ficha | Índice | Índice das seções | Não há índice | Página rola; as seções seguem a ordem do documento | Avaliar com o Gui | ADAPTAÇÃO A APROVAR |
| Ficha | Para a equipe Tranquilo | "Copiar Ficha para a Tranks" | Não há | — | Implementar na ficha da Central | PENDENTE |

Respostas de fichas antigas que não existem no modelo v1 (ex.: restrições de horário, backline) continuam guardadas e
aparecem em "Outras informações já enviadas". Campos renomeados no v1 (responsável → nome do Dono A, cidade → Cidade/UF)
mostram o valor antigo no campo novo. Nenhum dado preenchido some.

## 2. Guia do Franqueado (v1.5, 30/10/2026)

O Guia não é copiado para o portal: ele é o documento oficial e fica em Operações › Guia e materiais, com o link vigente.
As regras que o portal aplica foram conferidas com ele.

| Documento | Seção original | Campo/conteúdo original | Correspondência no portal | Divergência | Correção | Status |
|---|---|---|---|---|---|---|
| Guia | Documento inteiro | — | Operações › Guia e materiais (material com "Li e estou ciente") | O material ainda não foi cadastrado com o link oficial | A Central cadastra em Materiais (Material novo) | PENDENTE |
| Guia | O Tranquilo em 1 minuto | Noite, produtos | Operações › Como é a noite (manuais de 21/10) | — | — | FONTE EXTERNA |
| Guia | Quem faz o quê | Central × casa; as 4 cadeiras | Equipe da casa: Dono A, Líder Local (produtor), Anfitrião, Social Media + som e porta | — | — | CORRESPONDE |
| Guia | Quem faz o quê | Só o Dono A acumula Líder Local; Anfitrião e Social Media não acumulam | Uma função por pessoa (banco e site) | — | — | CORRESPONDE |
| Guia | Seus 10 compromissos | Compromisso 9: dados até D+2 | Passo "Fechamento (D+2)" | Na seção de fechamento o Guia diz "até D+22 dias" | Confirmar com o Gui | ADAPTAÇÃO A APROVAR |
| Guia | O que você decide | Decide / combina por escrito / regras fixas | Dúvidas frequentes e "O que não muda em nenhuma casa" | — | — | CORRESPONDE |
| Guia | Como funciona o fechamento | Quem cuida de cada dinheiro | Não há tela de fechamento no MVP | — | Fase seguinte | PENDENTE |
| Guia | Seus primeiros 90 dias | Antes do primeiro evento: contrato, homologação, 4 cadeiras, porta, planilhas, grupo, Ficha | Treinamento › Depois do treinamento (mesmos itens) | — | — | CORRESPONDE |
| Guia | A semana de cada evento | D-7, D-5/D-4, D-2 caixa de produção, D0, D+2 | Passos de cada data | Caixa de produção (D-2) saiu, a pedido do Gui em 29/10 | Atualizar o Guia ou confirmar | ADAPTAÇÃO A APROVAR |
| Guia | Com quem falar | Assunto × pessoa | Ficha › Seus contatos (mesmos assuntos) | — | — | CORRESPONDE |
| Guia | Perguntas frequentes | Respostas | Operações › Dúvidas (FAQ do site) | Respostas do site escritas a partir dos manuais e do Guia | Revisar com o Gui | ADAPTAÇÃO A APROVAR |
| Guia | Materiais e links | Links oficiais | Operações › Guia e materiais | — | — | FONTE EXTERNA |
