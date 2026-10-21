# Fase 0 — Auditoria e reconciliação (Partner Hub)

Sessão de 21/10/2026, no claude.ai. Base: branch `visual-site-oficial` (visual aprovado pela Marina, ainda não publicado).
Trabalho desta fase na branch `fase0-partner-hub`.

## 0. Limites desta sessão (verificados, não supostos)

| Limite | Efeito | Como resolver |
|---|---|---|
| Sem subagentes neste ambiente | Os 6 papéis foram executados em sequência por um único agente | Continuar no Claude Code, que tem subagentes |
| Sem permissão de escrita no GitHub | Commits ficam locais; entregues em `.bundle` | Push pelo Claude Code ou pela Marina; o prompt proíbe colar token no chat |
| `trnql.app` bloqueado na rede do sandbox | Contornado: o link aponta para artefatos do claude.ai, lidos diretamente | — |
| Bancos Casas, Line-up e Artistas: 404 para a conta da Marina | Sem schema nem dados desses bancos | Thales compartilha os 3 bancos com a conta conectada (marinacollieramelo@gmail.com) |

## 1. RISCO CRÍTICO — repositório público com dados internos

O repositório `marinacollier/tranquilo-rede` é **público**. Os pacotes de acesso (`b/`) são criptografados, mas estes arquivos estão em texto aberto, inclusive no histórico do Git:

- `data/eventos.psv`: retrato do banco Eventos (nomes, status, público por noite, capacidade, IDs de casas).
- `data/base.psv`: títulos de 121 artigos da Base de Conhecimento, inclusive de acesso interno (1Password, login do Instagram, 2FA). Só títulos, sem credenciais.
- `data/metodo.md`: resumo do documento V0.1, marcado no Notion como "não publicado na web".

Isso viola a regra "não colocar informações confidenciais em repositórios públicos" e a exigência de repositório privado antes de publicar.

**Decisão necessária (custo):**

| Opção | Custo | Efeito |
|---|---|---|
| A. Tornar o repositório privado e manter GitHub Pages | GitHub Pro, ~US$ 4/mês | Pages em repositório privado exige plano pago |
| B. Repositório privado + Cloudflare Pages (grátis) | R$ 0 | Muda o endereço do site; build no Cloudflare |
| C. Manter público e tirar `data/` do repositório | R$ 0 | Exige `NOTION_TOKEN` no Actions; o histórico continua exposto até reescrever (precisa autorização para force push) |

Recomendação: **B**, com a reescrita do histórico autorizada à parte. Nada foi alterado sem aprovação.

## 2. O que já existe e funciona

| Capacidade | Onde | Estado |
|---|---|---|
| Site público (agenda, cidades, me avise) | `src/index.html` | Em produção; visual novo aprovado, aguardando publicação |
| Pacotes por código (artista, casa, equipe, adm), AES-256-GCM | `scripts/build.mjs` | Em produção |
| Contas por e-mail, perfis e RLS | `supabase/schema.sql`, `src/conta.js` | Em produção (Supabase) |
| Inscrição de artista + pré-curadoria automática | idem | Em produção |
| Cadastro de casa + habilitação mínima (V0.1) | idem | Em produção |
| Passo a passo da data (T-35 a pós) persistido por usuário | tabela `checklist` | Em produção |
| Registro da noite e ocorrências (ordinária/exceção) | tabela `registros_noite` | Em produção |
| Convites, tutorial por perfil, demanda por cidade | idem | Em produção |
| Atualização noturna do retrato do Notion | `scripts/mesclar.mjs`, workflow | Depende de `NOTION_TOKEN`/`SITE_SECRET` no Actions (pendente) |
| **Documentos, versões e ciência de leitura (A6)** | `supabase/schema.sql` seção v3 | **Novo nesta sessão: backend + 22 testes; falta tela** |

Simulado/limitado: e-mails do Supabase sem SMTP próprio; modo demonstração quando o Supabase não responde.

## 3. Cobertura dos requisitos novos

Legenda: ✅ existe · 🟡 parcial · ⬜ falta · 🔒 depende de terceiro

| Item | Estado | Observação |
|---|---|---|
| A1 Dashboard do parceiro | 🟡 | "Próximos passos" e "Minhas datas"; faltam campanhas, pendências críticas e última atualização por fonte |
| A2 Informações e responsabilidades | ⬜ | Precisa de cadastro de papéis e contatos com permissão |
| A3 Eventos | 🟡 | Dados do Notion; faltam campanha, cronograma e responsabilidades por evento |
| A4 Biblioteca | 🟡 | Base de Conhecimento do Notion + playbooks e documentos do Bruno por link (auditados) |
| A5 Templates e materiais | 🟡 | Links oficiais existem na área do Bruno (Docs, Canva, Drive): falta cadastrá-los no Hub |
| A6 Aceites | 🟡 | **Backend pronto e testado**; falta tela do parceiro e da matriz |
| A7 Checklists persistentes | 🟡 | Persistidos por usuário; faltam responsável por papel, prazo, evidência e visão da matriz por criticidade |
| B1 Onboarding do artista | 🟡 🔒 | Inscrição existe; liberação por status contratual depende do banco Contratos/Artistas |
| B2 Central dos shows | 🟡 | Datas e público; faltam horários, passagem de som e logística (fonte a definir) |
| B3 Campanha do artista | ⬜ 🔒 | Depende do modelo de campanhas do Bruno |
| B4 Vendas | ⬜ 🔒 | Ingresse sem API (registro interno); Shotgun a verificar. Importação controlada |
| B5 Pós-show (uploads) | ⬜ | Precisa de storage com limite e política de retenção (decisão de custo) |
| B6 FAQ | 🟡 | Base de Conhecimento existe; falta seleção aprovada para artistas |
| C1 Visão geral interna | 🟡 | Prontidão e curadoria; faltam aceites, materiais e handoff |
| C2 Campanhas | ⬜ 🔒 | Não reconstruir o editor do Bruno |
| C3 Gestão de conhecimento | 🟡 | Tabela `documentos` já guarda fonte, responsável e versão |
| C4 Gestão de checklists | 🟡 | Aba Prontidão; faltam filtros por área, responsável e criticidade |
| C5 Handoff e exceções | ⬜ | Não há registro de handoff no banco; ocorrências existem |

## 4. Ativos do Bruno — auditados em 21/10/2026

Fonte: artefatos públicos do claude.ai de outra organização (dono: Bruno), lidos sem alterar.
`trnql.app/area-rooftap` aponta para `claude.ai/artifact/F5bDLMW7ZLGfmZGDnHSdM4` ("Área do Franqueado Rooftap", 13 arquivos, 1,7 MB).
A campanha está em `claude.ai/artifact/YbECsULbN75y3Y5XNFHAZr` ("A campanha do Rooftap").

**Como é feito:** páginas HTML estáticas geradas por um build (os dados entram prontos, "atualizado em 20/10/2026 às 11h55"),
uma área por casa (hoje só Rooftap · São Paulo), republicadas como artefato. Não há login: quem tem o link vê.
Os scripts só copiam texto e atualizam a contagem de dias. Única gravação de estado: o calendário da campanha, em `localStorage`.

| Ativo | Responsável | Tecnologia | Fonte | Decisão | Justificativa | Dependência |
|---|---|---|---|---|---|---|
| Início da área (links da casa, pasta no Drive, link geral `trnql.app/rooftap-sp`) | Bruno | HTML estático gerado | artefato F5bD… | **Reaproveitar por link** | Já funciona e é mantido por ele | Uma área por casa: como ele gera para novas casas |
| Documentos: Plano de Ação (tripé social), Semana do social media, Semana da liderança local | Bruno | HTML estático | idem | **Reaproveitar por link**, cadastrar em `documentos` (`fonte_tipo = site_bruno`) | Conteúdo maduro; editar em um lugar só | Política de versão (quando muda o número) |
| Régua de prazos do Plano de Ação (D-30 em diante, prazo do tripé) | Bruno | JS gerado com a data do evento | doc-plano | **Adaptar**: os itens viram tarefas com prazo no banco | Hoje só mostra; a matriz não vê se foi feito | Lista oficial dos itens |
| Eventos da casa (line-up, links de venda `trnql.app/…`, pasta do show) | Bruno | Dados embutidos no build | eventos.html | **Reaproveitar os links**; dados de evento vêm do Notion no Hub | Evitar duas fontes de agenda | Saber de onde o build dele lê o "cadastro da central" |
| Relatórios pós-evento | Bruno | Página vazia ("o primeiro aparece depois do primeiro evento") | relatorios.html | **A definir** | Ainda sem conteúdo | Modelo do relatório |
| Playbooks Descubra e Apresenta; página Artistas (briefing, sequência no WhatsApp) | Bruno | HTML estático | playbooks | **Reaproveitar por link**; selecionar trechos para a área do artista (B6) | Método oficial | Autorização para expor a artistas |
| Modelos: briefings (Google Docs), templates (Canva), mensagens prontas | Bruno | Links | modelos.html | **Reaproveitar por link**, preservar URLs | Os Docs abrem com "Fazer uma cópia" | Confirmar permissão dos Docs (links terminam em `/edit`) |
| Calendário da campanha com 10 dias de ativação e checkboxes | Bruno | JS + **`localStorage`** (`tranquilo_campanha_rooftap_nov26_dias`) | artefato YbEC… | **Adaptar**: mover o "feito" para o banco do Hub | Cada aparelho vê um progresso diferente e a matriz não vê nada | Ver abaixo |

**Por que o checklist da campanha não pode só "gravar no nosso banco":** páginas publicadas como artefato não podem chamar servidores externos.
O caminho viável é o build do Bruno exportar o calendário (dias, canais, textos) e o Hub mostrar os mesmos itens com o "feito" salvo no Supabase.
O conteúdo continua sendo editado só pelo Bruno.

**Riscos encontrados:**
- A área é um link público sem login, com pastas do Drive e documentos internos da casa. Quem receber o link encaminhado vê tudo.
- Os modelos apontam para Google Docs com `/edit`. Se o compartilhamento estiver "qualquer pessoa pode editar", um franqueado pode alterar o original em vez de copiar. Precisa ser conferido no Drive (não dá para ver daqui).
- Não há registro de que o franqueado leu o Plano de Ação: é aqui que `documentos` + `ciencias` (A6) entram.

**Adiantado sem o Bruno (21/10):**
- `scripts/importar-campanha.mjs` lê a página de campanha **no formato atual** dele: 10 dias, 24 ações, textos e links rastreados intactos (conferido contra a contagem de canais da própria página). A pergunta 2 deixou de bloquear.
- Banco v4: `campanhas`, `campanha_itens`, `campanha_feitos` e `campanha_historico`. O feito vale para a casa inteira, a matriz vê o andamento, reimportar não apaga o que foi marcado, outra casa não vê nada (21 testes com a campanha real).
- `documentos.casa_ref`: documento de uma casa só, como o Plano de Ação do Rooftap.
- `supabase/carga/rooftap.sql`: campanha e 5 documentos do Bruno prontos para carregar (não foi rodado no Supabase).
- Respostas parciais por evidência:
  - (1) O line-up do Descubra de 02/11 que aparece na área dele não está nos bancos que conseguimos ler; deve vir do banco Line-up (bloqueado para nós). Os links rastreados saem da ferramenta de UTM do Jimmy (reunião de 03/07).
  - (5) O build dele já é parametrizado por casa (`{"id": "sp-rooftap", "casa": "Rooftap", "modelo": "full", ...}` e "Escolha a sua casa" no Plano), então tudo indica que sim.

**Perguntas para o Bruno:**
1. Como o build é rodado e de onde ele lê eventos e line-up (Notion? planilha?).
2. Ele toparia que o build também gere um arquivo de dados (JSON) do calendário de campanha, para o Hub persistir o "feito"?
3. Quando um documento muda, ele quer que o franqueado dê ciência de novo? Em quais documentos?
4. Os Google Docs de modelo estão como "qualquer pessoa pode ver" ou "pode editar"?
5. As próximas casas terão uma área cada, no mesmo formato?

## 5. Notion — fontes

| Fonte | ID | Acesso | Uso |
|---|---|---|---|
| Eventos | `collection://84c63e67-7b36-407c-9310-681ebc120393` | ✅ leitura | Agenda, público, status, links |
| Base de Conhecimento | `collection://32d83bbf-4e84-8062-bf81-000b12eb93fb` | ✅ leitura (121 artigos, 98 prontos) | Biblioteca e FAQ |
| V0.1 dos 50 eventos | página `ddd0e9fd76994af0b100dcc6e026f7bc` | ✅ leitura | Método, handoff, prontidão |
| Casas | `collection://31e83bbf-4e84-8013-b34e-000b5103d685` | ❌ 404 | Nome, capacidade, rider |
| Line-up | `collection://f2096342-c8e0-4972-b4f2-34b8a54b2839` | ❌ 404 | Artista ↔ evento, "Revelar?" |
| Artistas | não localizado | ❌ | Bio, slug, status de curadoria |
| Tarefas, Cronogramas, Campanhas, Contratos, Posts | não localizados | ❓ | Pedir os links |

Toda a integração é só de leitura. Para o produto, usar uma integração própria ("Read content" apenas), não a conexão pessoal de IA.

## 6. Separação de dados

- **Conteúdo oficial** (Notion, site do Bruno, Canva): lido ou linkado, nunca copiado para edição.
- **Dados operacionais sincronizados** (eventos, público, line-up): retrato noturno, com fonte e data.
- **Dados do aplicativo** (Supabase): usuários, papéis, ciências, checklists, handoffs, ocorrências, uploads, logs.

## 7. Modelo de dados — mapeamento

| Entidade pedida | Hoje | Próximo passo |
|---|---|---|
| Users / Roles | `perfis` (tipo) | Papéis por praça e por evento (`vinculos`) |
| Organizations / Venues / Cities | `cadastros_casas` + Notion | Tabela `casas` com ID externo do Notion |
| Artists / ArtistTeams | `inscricoes_artistas` | Equipe autorizada por artista |
| Events / EventParticipants | Notion + pacotes | Tabela de vínculo evento ↔ pessoa (autorização no banco) |
| Documents / Versions / Acknowledgements | **`documentos`, `documento_versoes`, `ciencias`** | Feito |
| Tasks / Completions | `checklist` | Prazo, papel responsável, evidência, criticidade |
| Handoffs | — | Tabela própria (evento, recebido por, itens, data) |
| Occurrences | `registros_noite` | Manter |
| Uploads | — | Supabase Storage (1 GB grátis) com limites |
| Campaigns / Actions | — | Após auditar o material do Bruno |
| TicketingSources / SalesSnapshots | — | Importação controlada |
| AuditLogs | parcial (carimbos) | Tabela de auditoria para ações da matriz |

## 8. Próximo incremento (sem depender do Bruno)

1. Tela de documentos e ciência (parceiro: pendências e histórico; matriz: quem deu ciência de qual versão).
2. Tabela `handoffs` com RLS e testes (C5), ligada ao passo a passo.
3. Vínculo evento ↔ pessoa no banco, para autorização por evento e não só por pacote.

Critério de aceite de cada um: testes de permissão no PGlite passando, sem regressão no `npm test`, e captura de tela no computador e no celular.

## 9. Aplicado em produção em 21/10/2026 (sessão do claude.ai)

Migração `hub_materiais_ciencias_campanhas` aplicada no Supabase `edespqdbxhthzcmygake`, só com objetos novos:
`materiais`, `material_versoes`, `ciencias`, `campanhas`, `campanha_itens`, `campanha_feitos`, `campanha_historico`
e as funções `meu_tipo`, `versao_vigente`, `minhas_ciencias_pendentes`, `posso_casa`, `importar_campanha`, `andamento_campanhas`.
Nada existente foi alterado. RLS ativo nas 7 tabelas (conferido).

- O nome é `materiais` porque `documentos` já existe em produção (anexos por data).
- `posso_casa` confia **só em convite aceito com e-mail confirmado**, não em `perfis.vinculo_nome`, por causa do achado P02.
- Carga rodada: campanha `rooftap-nov26` (10 dias) e 5 materiais do Bruno (só `plano-acao-rooftap` pede ciência).
- Para alguém do Rooftap ver: convite de casa com `vinculo_nome = 'Rooftap'`, aceito.
- Ainda **sem telas**: casa marcando a campanha, matriz vendo o andamento, materiais e ciência.
- Testes desta parte: `tests/materiais.test.mjs` (25) e `tests/campanhas.test.mjs` (22, inclui o ataque P02).
  `tests/seguranca.test.mjs` continua com os mesmos 6 achados de antes (83 OK / 6 FALHA), nenhum novo.
