# Próxima sessão: pendências urgentes (17/11/2026, fim do dia)

Portal: marinacollier/tranquilo-rede (main → publica copiando src/ para gh-pages com `__V__` trocado). Banco: Supabase, mexido só por workflows do GitHub (aplicar-schema, caso-completo, limpar-testes). Repositório público: nada de e-mail, telefone, senha ou token no código ou no log.

## 1. Juntar o trabalho dos agentes (prioridade)
- **Branch `agente/conferir-contrato`** (pronto, testado): equipe "Conferir e confirmar" / "Pedir de novo" no contrato assinado recebido. Traz **schema v28** (colunas conferido_*/devolvido_* e função `conferir_contrato`). Fazer merge no main, rodar `npm test` e `scripts/testar-e2e.sh`, **aplicar o schema** pelo workflow aplicar-schema (ensaio antes) e publicar.
- **Branch `agente/status-validacoes`** (pode ainda estar rodando ou já subiu): "Salvando… / ✓ Salvo / ✕ Erro" e obrigatórios/mínimo de caracteres em todas as telas. Conferir, fazer merge (conflitos prováveis em src/conta.js com a trilha), testar e publicar.

## 2. Trilha (publicada hoje) — acertos
- Teste novo `tests/e2e/trilha.cjs`: conferir o caso da artista nova (lista de travados).
- Teste `tests/e2e/equipe.cjs` (trilha da casa nova) quebrado: procura a aba "trilha", que agora fica dentro de Próximos passos (`datas_casa`). Ajustar o teste.
- Os testes antigos desligam a trilha com `localStorage tq-sem-trilha=1`.

## 3. Pedidos da Marina ainda abertos
- Isa testando Curadoria: há 3 inscrições fake (Nina Sol, Rafa Tom, Banda Eco). Conferir se ela entrou (workflow limpar-testes modo `listar` com chave pública nova; a saída é cifrada).
- Campanha do Bruno: o .html que ela subiu era documento (vai em Materiais › Publicar documentos). Confirmar com ela se há página de campanha de casa para importar.
- Importar do Notion as bases "Casas de Shows" e "Artistas": esperando ela dizer se dados sensíveis das casas entram (só adm) e se entram todos os artistas.
- Anfitrião/marketing por função hoje fica com a casa (em Equipe). Marina perguntou se deveria ser só do time: confirmar com ela/Bruno.
- Arquivos enviados pelas contas de teste limpas continuam no storage (apagar pela Storage API, se ela quiser).

## 4. Contas
- Caso completo: casa.teste@tranquilo.com.br e artista.teste@tranquilo.com.br (senha combinada com a Marina).
- Contas de Gui, Isa, Bruno, Marina, demos e testes: zeradas hoje (login mantido).

## 5. Testes instáveis conhecidos
- datas-portal (login no Cronograma) e equipe (trilha) às vezes falham na rodada completa e passam sozinhos.

## 6. Pedidos de 17/11 à noite (não feitos)
- **Marketing por função na casa (Produtor local, Anfitrião, Social media):** a Marina acha que é do artista, não da casa. Hoje está em Casa › Equipe. A fonte é o material do Bruno (Área do Franqueado, 11/11) e a decisão de 13/11 de pôr esse conteúdo no portal da casa. Confirmar com ela/Bruno antes de mover.
- **Gui convida casas e Isa convida artistas** (não só adm): conferir em Convites se a equipe com área consegue convidar casa (Gui) e artista (Isa); liberar se não.
- **Histórico das casas para o Gui (e dos artistas para a Isa):** hoje só aparece no pacote da administração (abas "casas" e "artistas" do PERFIS.adm em src/index.html; pacotes em scripts/build.mjs). Incluir esses dados no pacote da equipe e mostrar no menu do Gui (Casas) e da Isa (Curadoria/Artistas). A conta da equipe também precisa estar ligada ao código interno (Conta › colar código, ou Pessoas).
