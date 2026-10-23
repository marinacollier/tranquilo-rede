# Pendências

Lista do que ficou para depois. Atualizada em 23/10/2026.

## Com a Marina

- [ ] **SITE_SECRET no GitHub.** O valor antigo não foi achado. Opções:
  - recuperar na conta do Claude Team (variáveis do ambiente ou conversas daquela sessão);
  - criar um novo, de 32 caracteres ou mais, guardado num gerenciador de senhas. Com um novo, todos os códigos de acesso mudam e precisam ser reenviados. Quem entra com e-mail e senha não é afetado.

  Onde salvar: Settings → Secrets and variables → Actions → New repository secret. Com ele salvo, cada push na main republica o site sozinho.
- [ ] **NOTION_TOKEN no GitHub.**
  1. Criar uma integração interna só de leitura em notion.so/profile/integrations.
  2. Salvar a chave como `NOTION_TOKEN`.
  3. Conectar a integração às bases Eventos e Base de conhecimento (⋯ → Conexões).
- [x] **Artistas e bandas (Notion):** acesso liberado e conferido em 23/10.
- [ ] **Antes do time testar os tutoriais:** `update perfis set tutorial_visto_em = null where email like 'teste-%@gmail.com';`
- [ ] **Contrato automático:** perguntar ao Thales que sistema assina hoje. No Notion não há Clicksign nem DocuSign; os campos de auditoria e o "Link para enviar para artista preencher dados do contrato" indicam um fluxo próprio, ainda não validado. Também: o jurídico confirma se a assinatura eletrônica simples serve para os contratos de artista. Ela registra o nome digitado, a leitura até o fim, o hash SHA-256, a hora, o IP e o navegador. Também confirma se algum tipo de contrato precisa de gov.br ou de uma plataforma como Clicksign.

## Para o Claude (próximas sessões)

- [ ] Relatório de QA: terminar as seções A, B, D, E e I (https://claude.ai/artifact/GoyzkkPo58fVfgTb8o2AdE).
- [ ] Fechar os 6 pontos de segurança em aberto (P02, P09, P12, P13, V13, X03), listados em `tests/seguranca.test.mjs`.
- [ ] Contrato automático, versão 2. Ideias:
  - contrato de casa e de franquia;
  - PDF de verdade, em vez do "imprimir ou salvar em PDF" do navegador;
  - aviso por e-mail quando o contrato chega e quando é assinado;
  - levar o status para o Notion, se a escrita for liberada só nesses campos.
