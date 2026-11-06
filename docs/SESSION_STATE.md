# Estado da sessão

Atualizado em 06/11/2026.

- **Branch**: `main` (push feito). Checkpoint antes da reestruturação: branch `checkpoint-antes-4-areas` (SHA `4085788`).
- **Banco**: v13 aplicado em produção em 06/11 (autorizado pela Marina): `solicitacoes_ficha`, `disponibilidade_casa`
  (RLS ligada nas duas), `cadastros_casas.combinados`, Instagram e observação na equipe. Conferido por consulta.
- **Site no ar (gh-pages)**: portal da casa em 4 áreas publicado em 06/11 (commit d1ada91 em gh-pages).
- **Testes**: `npm test`, segurança (90 verificações) e a bateria do navegador (`scripts/testar-e2e.sh`, inclui o novo
  `portal-casa`), todos passando no fim da rodada.
- **Commits desta rodada**: ddaf64a (mapa Notion), b562b6d (banco v13), c94c6af (Ficha), 375ee0c (4 áreas, Datas,
  painel), 7fd8bfa (testes), 841ea71 (documentos do Gui), mais o commit desta documentação.
- **Próximos passos**: Gui revisar as adaptações; cadastrar o Guia em Materiais;
  "Copiar Ficha para a Tranks" na ficha da Central; pré-preenchimento a partir da base Casas do Notion (com aprovação).
