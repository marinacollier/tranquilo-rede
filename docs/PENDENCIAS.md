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
- [x] **P09, V13 e X03 fechados** (v8 no `supabase/schema.sql`), aplicados em produção em 23/10 pela sessão do claude.ai
      (migração `seguranca_v8_p09_v13_x03`). P09 conferido no banco real com o ataque simulado numa transação desfeita.
      `tests/seguranca.test.mjs`: 83 OK / 6 FALHA → 86 OK / 3 FALHA, também com `--supabase`.
  - P09: o gatilho de perfis não confia mais em `tq.sistema`; passa direto só o que roda como dona da tabela.
  - V13: convite de equipe/adm (e a lista inicial de adm) só vale com prova da caixa: link mágico (conta nasce
    confirmada e sem senha) ou a confirmação do e-mail depois do cadastro. Quem já tem conta e foi convidada
    para equipe/adm é promovida pela adm em Pessoas.
  - X03: o banco recusa `javascript:`, `data:`, `vbscript:` e `file:` em qualquer texto dos dados de artista e casa.
  - Os testes passaram a criar contas do jeito real (cadastro e depois confirmação), em vez de nascerem confirmadas com senha.
- [x] **P02, P12 e P13 (v9), fechados em 23/10** (feito como o plano abaixo: `meu_acesso()`, `codigos_acesso()` e o pedido de vínculo gravado em `vinculo_pedido`). Antes:, porque o site no ar lê `perfis` com `select *`
      e grava o próprio vínculo. Plano:
  - P12/P13: tirar `codigo_acesso` da leitura direta de `perfis`; o site lê colunas explícitas, o próprio código por
    uma função (`meu_codigo()`) e a adm vê os códigos de todos por outra função.
  - P02: a conta deixa de gravar o próprio vínculo; manda um pedido (`pedir_vinculo(codigo, nome)`) que a adm confirma em Pessoas.
  - Não aplicar a parte do banco antes de publicar o site junto, senão o login por código quebra.
- [ ] Contrato automático, versão 2. Ideias:
  - contrato de casa e de franquia;
  - PDF de verdade, em vez do "imprimir ou salvar em PDF" do navegador;
  - aviso por e-mail quando o contrato chega e quando é assinado;
  - levar o status para o Notion, se a escrita for liberada só nesses campos.
