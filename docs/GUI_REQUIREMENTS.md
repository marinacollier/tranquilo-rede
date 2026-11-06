# Requisitos do alinhamento com o Gui (novembro de 2026)

Prioridade: **P0** portal da casa · **P1** visão da equipe interna (a Isa em primeiro lugar) · **P2** portal do artista (preservado, sem novidades até P0 e P1).

| # | Requisito | Critério de aceite | Onde está |
|---|---|---|---|
| R1 | Menu da casa com exatamente 4 áreas: Ficha da Casa, Operações, Datas, Marketing | O menu mostra só essas 4, nessa ordem; a conta fica no rodapé | `src/conta.js` (`AREAS_CASA`), `src/index.html` (`GRUPOS`, `navHtml`) · teste `portal-casa` |
| R2 | Ficha fiel aos documentos do Gui | Seções, ordem, campos, textos e opções iguais ao modelo v1 | `F_CASA` em `src/conta.js` · `docs/gui/ficha-unidade-v1.inventario.json` · teste `portal-casa` |
| R3 | Campo vazio continua visível; nada preenchido some | Todos os campos aparecem; respostas antigas ficam em "Outras informações já enviadas" | `formCasa`, `valorCasa` |
| R4 | Atualização com fluxo explícito | Ficha enviada fica só para leitura; "Solicitar atualização" grava antes/proposto, autor e status; a Central aprova ou recusa | `solicitacoes_ficha` e funções no schema v13 · testes `schema`, `equipe`, `portal-casa` |
| R5 | Dados sensíveis com acesso restrito | Dono A e repasses: só a casa e a administração | `fichaCasa` (Central) · RLS de `cadastros_casas` |
| R6 | Operações reúne Guia, manuais, treinamento, como é a noite e dúvidas | Tudo dentro da área Operações, sem cópia do Guia | `subsDaArea("operacoes")` |
| R7 | Datas: a casa informa a disponibilidade; a Isa consulta | Calendário com disponível, indisponível, evento confirmado; uma fonte só (`disponibilidade_casa`) | Datas › Disponibilidade · Agenda das casas |
| R8 | Marketing: campanhas e checklist compartilhado | "Feito" fica no banco, vale para a casa toda e a Central vê quem e quando | `campanha_feitos` (já existia) · Marketing › Campanhas |
| R9 | Sem informação duplicada | Uma tela dona por informação | `docs/INFORMATION_OWNERSHIP.md` |
| R10 | Painel da equipe por evento | Eventos por data, filtros, vendas com fonte, contrato verificável, pendências | Painel da operação |

## A confirmar com o Gui

1. Todas as mudanças da Ficha passam pela Central, ou alguns campos podem mudar na hora? (Hoje: todas passam.)
2. As 7 adaptações de `docs/GUI_DOCUMENT_COMPARISON.md`.
3. Disponibilidade: quem pode bloquear, reservar e confirmar uma data, por quanto tempo vale a reserva e como avisar. (Hoje: a casa informa disponível ou indisponível; a confirmação continua com a Isa, fora do portal.)
4. A proposta escrita dele para os nomes dos botões.
5. Fechamento no D+2 (confirmado no Guia, com a planilha de estoque). Caixa de produção no D-2 sai do Guia?
6. Bonificações (como Estrella Galicia): fonte, regra de elegibilidade e responsável.
