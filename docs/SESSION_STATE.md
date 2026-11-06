# Estado da sessão

Atualizado em 06/11/2026.

- **Branch**: `main` (push feito). Checkpoint antes da reestruturação: branch `checkpoint-antes-4-areas` (SHA `4085788`).
- **Banco**: v13 aplicado em produção em 06/11 (autorizado pela Marina): `solicitacoes_ficha`, `disponibilidade_casa`
  (RLS ligada nas duas), `cadastros_casas.combinados`, Instagram e observação na equipe. Conferido por consulta.
- **Site no ar (gh-pages)**: portal da casa em 4 áreas publicado em 06/11 (commit d1ada91 em gh-pages).
- **QA de 06/11** (dois agentes: fidelidade às fichas do Gui e erros/layout): correções publicadas (gh-pages 0e78fd8) e
  lembretes v7 no Supabase (ainda em ensaio). O que não está nos documentos do Gui aparece no portal com o selo "a validar";
  lista em docs/GUI_DOCUMENT_COMPARISON.md.
- **Testes**: `npm test`, segurança (90 verificações) e a bateria do navegador (`scripts/testar-e2e.sh`, inclui o novo
  `portal-casa`), todos passando no fim da rodada.
- **Commits desta rodada**: ddaf64a (mapa Notion), b562b6d (banco v13), c94c6af (Ficha), 375ee0c (4 áreas, Datas,
  painel), 7fd8bfa (testes), 841ea71 (documentos do Gui), mais o commit desta documentação.
- **Feito em 06/11 (pedido da Marina)**: Guia do Franqueado v1.5 em Materiais (banco); "Copiar Ficha para a Tranks" na ficha
  da Central; pré-preenchimento da Ficha com campos públicos da base Casas do Notion (data/casas-ficha.json, 32 casas, vai só
  no pacote cifrado de cada casa; a casa confere e grava ao salvar).
- **Próximos passos**: Gui revisar as adaptações e os itens "a validar"; senha de app do Google para os lembretes.
