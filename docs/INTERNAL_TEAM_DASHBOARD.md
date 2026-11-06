# Visão da equipe interna

## Painel da operação (implementado)

Próximos eventos, do mais perto para o mais longe. Colunas: data, evento (cidade, casa, artistas), status do Notion,
vendas, contrato, ficha da casa, pendências. Filtros: cidade, casa, status e foco (precisa de atenção em 14 dias,
contrato pendente, qualquer pendência). Indicadores no topo: atenção em 14 dias, sem contrato assinado no site, casa sem
ficha habilitada, pedidos de atualização abertos.

Critérios (verificáveis, sem nota subjetiva):
- **Atenção**: evento nos próximos 14 dias com qualquer pendência.
- **Contrato**: "assinado no site" só quando todos os contratos digitais da data estão assinados. PDF anexado aparece como
  "assinatura não confirmada". O fluxo próprio de assinatura do Notion ainda não é lido.
- **Ficha da casa**: status do cadastro (habilitada ou não) e pedidos de atualização abertos.
- **Vendas**: público e vendidos lançados no Notion. Sem integração com a Ingresse, datas futuras aparecem "sem dado".

## Agenda das casas (implementado)

Calendário por casa com a disponibilidade informada, os eventos confirmados e os conflitos (evento em dia marcado como
indisponível), e a lista de casas com dias livres no mês.

## Ainda não implementado (precisa de fonte ou regra)

| Item | Bloqueio |
|---|---|
| Ranking de vendas com meta | Sem meta validada e sem integração com a Ingresse |
| Bonificações (Estrella Galicia e outras) | Sem fonte nem regra de elegibilidade |
| Status jurídico do contrato do Notion | Confirmar a fonte oficial (fluxo próprio de assinatura) |
| Handoff realizado | Definir o critério (campo do Notion ou passo do site) |
