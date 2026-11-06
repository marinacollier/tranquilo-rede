# Critérios de aceite do MVP (meta: 17/11/2026)

Situação em 06/11/2026. ✅ feito e testado · 🟡 parcial · ⏳ pendente.

## Casa
- ✅ Menu com exatamente 4 áreas, na ordem aprovada (teste `portal-casa`).
- 🟡 Nenhum campo do documento original ausente: estrutura 1:1 conferida pelo teste; 7 adaptações aguardam o Gui.
- ✅ Campos vazios aparecem (teste `portal-casa`).
- ✅ Nenhum valor de outra casa aparece (RLS; testes `schema`, `equipe`, `seguranca`).
- ✅ Alterações com fluxo claro (pedido de atualização; testes `schema`, `portal-casa`).
- ✅ Disponibilidade persistida e isolada por casa (testes `equipe`, `portal-casa`).
- ✅ Checklists compartilhados com a equipe interna (`campanha_feitos`, `checklist_da_casa`).
- ✅ Campanhas e links oficiais preservados (importação do Bruno; teste `hub`).
- ⏳ Guia cadastrado em Materiais com o link oficial (ação da Central).

## Equipe interna
- ✅ Eventos em ordem de data, filtros por casa, cidade, status e foco.
- 🟡 Vendas com fonte (Notion) — sem Ingresse.
- 🟡 Contrato com status verificável no site; o fluxo do Notion não é lido.
- ⏳ Bonificações.
- ✅ Pendências da casa rastreáveis (status, pedidos, contratos, link).

## Segurança
- ✅ Dados isolados entre casas; dados pessoais e bancários só para a administração.
- ✅ O site não escreve no Notion.
- ✅ Sem dados de casas no Git (só inventário de campos).

## Para liberar a casa piloto
Aplicar o banco v13 em produção e publicar o site (precisam de autorização), cadastrar o Guia em Materiais e o Gui aprovar as adaptações.
