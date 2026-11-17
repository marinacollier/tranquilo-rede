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
- **Divulgação (Produtor local, Anfitrião, Social media):** FEITO — a Marina confirmou que é do artista; saiu de Casa › Equipe e virou o item "Divulgação" do artista. Conferir no banco se os materiais do Bruno estão publicados também para o público artista (tabela materiais, campo publico), senão o artista não consegue abrir os documentos.
- **Gui convida casas e Isa convida artistas** (não só adm): conferir em Convites se a equipe com área consegue convidar casa (Gui) e artista (Isa); liberar se não.
- **Histórico das casas para o Gui (e dos artistas para a Isa):** hoje só aparece no pacote da administração (abas "casas" e "artistas" do PERFIS.adm em src/index.html; pacotes em scripts/build.mjs). Incluir esses dados no pacote da equipe e mostrar no menu do Gui (Casas) e da Isa (Curadoria/Artistas). A conta da equipe também precisa estar ligada ao código interno (Conta › colar código, ou Pessoas).

## 7. Estado em 17/11, 19h30
- FEITO: merge de agente/conferir-contrato (schema v28 aplicado pelo workflow aplicar-schema) e de agente/status-validacoes; publicado. Bateria: 561 OK, 1 falha em tests/e2e/leitor.cjs (clique com timeout) — investigar.
- Tripé (Líder Local, Anfitrião, Social Media): o Guia do Franqueado diz que são contratados pela casa ("Toda unidade tem quatro cadeiras: Dono A, Líder Local, Anfitrião, Social Media"; "Eles são contratados pela sua casa, mas seguem as orientações do Tranquilo"). A Divulgação (material do Bruno) foi movida para o artista a pedido da Marina; a equipe da casa continua na casa. Decidir com ela se volta.
- NOVO PEDIDO: tudo vira anexo. Cada passo (campanha, contrato etc.) tem "Anexar comprovante"; ao anexar, o passo fica feito e a equipe vê o anexo. Contrato já funciona assim (pasta contrato_<id>). Fazer o mesmo para os passos: pasta passo_<chave>_<evento> (trocar ":" do id da data por "_"), listar anexos no passo, equipe vê em Prontidão/Contratos e documentos.
- Ainda: histórico das casas no acesso do Gui e dos artistas no da Isa; conferir se Gui/Isa convidam; ver se a Isa acessou (listar cifrado).
