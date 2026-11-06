# Estado da sessão

Atualizado em 06/11/2026.

- **Branch**: `main` (push feito). Checkpoint antes da reestruturação: branch `checkpoint-antes-4-areas` (SHA `4085788`).
- **Banco**: v12 aplicado em produção. **v13 ainda não aplicado** (pedido de atualização da ficha, combinados,
  disponibilidade, campos novos da equipe): precisa de autorização para produção.
- **Site no ar (gh-pages)**: versão de 31/10. **A versão das 4 áreas ainda não foi publicada**: o site novo depende do v13
  (pedido de atualização e disponibilidade); publicar junto com o v13.
- **Testes**: `npm test`, segurança (90 verificações) e a bateria do navegador (`scripts/testar-e2e.sh`, inclui o novo
  `portal-casa`), todos passando no fim da rodada.
- **Commits desta rodada**: ddaf64a (mapa Notion), b562b6d (banco v13), c94c6af (Ficha), 375ee0c (4 áreas, Datas,
  painel), 7fd8bfa (testes), 841ea71 (documentos do Gui), mais o commit desta documentação.
- **Próximos passos**: aprovar e aplicar v13 + publicar; Gui revisar as adaptações; cadastrar o Guia em Materiais;
  "Copiar Ficha para a Tranks" na ficha da Central; pré-preenchimento a partir da base Casas do Notion (com aprovação).
