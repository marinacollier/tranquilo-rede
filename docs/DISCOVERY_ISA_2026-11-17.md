# Discovery Isa — Portal do Franqueado e Central de Artistas (17/11/2026)

Base: discovery da Marina com a Isa (agenda, negociação de datas e contratos), vídeo de um artista tentando assinar na
Central de Artistas do site oficial, modelo Descubra (Notion, v2), contrato Apresenta de circulação (docx, 6 datas) e
auditoria do código deste repositório (portal) e do banco Supabase (v1 a v27).

Sem dados pessoais: nomes de pessoas da equipe aparecem só pela função. Percentuais e valores dos contratos não são
copiados aqui (ficam nos modelos, que são privados).

## Achado principal: há dois sistemas de contrato

| Sistema | Onde | Fonte do modelo | Quem usa hoje |
| --- | --- | --- | --- |
| Central de Artistas (site oficial) | tranquilomusica.com.br/central-de-artistas — código fora deste repositório | Página do modelo no Notion (base "Modelos de contrato") | Isa, com artistas reais |
| Contratos do portal (Documentos e contratos) | `src/contrato.js`, `src/conta.js` (telaContrato), tabelas `modelos_contrato` e `contratos` (schema v9+) | Texto colado no portal | Testes; nenhum contrato real |

Os problemas relatados pela Isa (minuta não aparece, "Salvando" sem fim, assinatura que não conclui) acontecem na
**Central do site oficial**, não no portal. **Decisão pendente (Thales + Jimmy):** qual dos dois vira o sistema
oficial de contratos. Manter os dois duplica modelos, dados do artista e status.

### Causa da minuta que não aparece (verificada)

O vídeo mostra, no lugar do contrato, só o texto "Modelo padrão vigente do Tranquilo Apresenta. Substitui a versão 1… /
Arquivo editável — Modelo de Contrato Apresenta atualizado". No Notion, a página "MODELO DE CONTRATO APRESENTA — PADRÃO
ATUAL" tem exatamente isso no corpo: um aviso, o .docx anexado e uma legenda. **O texto do contrato está dentro do
arquivo, não na página.** A Central mostra o corpo da página, então o artista nunca vê a minuta. O modelo Descubra tem o
texto inteiro na página e por isso aparece.

- Correção sem código (Isa/Jimmy, no Notion): colar o texto completo do contrato no corpo da página do modelo, com os
  campos entre chaves, como no Descubra. Vale para todos os modelos que hoje são só um .docx anexado (os contratos
  Apresenta de circulação por artista também).
- Correção no código da Central (Jimmy): se a página do modelo não tiver texto, bloquear o envio ao artista e avisar a
  Central ("modelo sem texto"), em vez de mostrar a descrição como se fosse a minuta.

### Assinatura que não conclui (hipótese, precisa do código da Central)

No vídeo o botão "Assinar" continua cinza com o campo de nome mostrando um nome em cinza claro. É provável que seja o
**texto de exemplo (placeholder)**, e não um valor digitado: a pessoa acha que preencheu e o botão nunca libera. O
"Salvando" sem fim e o travamento precisam do código e dos registros da Central para confirmar. Recomendações para o
Jimmy: placeholder diferente de um nome real, mensagem dizendo o que falta para liberar o botão, tempo limite com
"tentar de novo" no salvamento e um registro de cada tentativa.

O portal já resolve esses pontos no fluxo dele: texto integral na tela (`telaContrato`), leitura até o fim registrada
no banco, assinatura no servidor (`assinar_contrato`) que reconstrói o texto e confere o hash, IP e navegador
registrados, e trava de botão enquanto a ação roda.

## Entregável 1 — Diagnóstico AS IS

Classificação: **pronto**, **parcial**, **bug**, **inexistente**, **decisão** (depende de decisão de negócio).

| Necessidade | Funcionalidade existente | Local | Estado | Problema | Recomendação |
| --- | --- | --- | --- | --- | --- |
| Casa informa disponibilidade | Calendário Datas › Disponibilidade + dias fixos da semana (v27) | `agenda_casa` em `src/conta.js`; tabelas `disponibilidade_casa`, `disponibilidade_semanal` | pronto | Só o dono marca; equipe da casa só vê | Manter |
| Artista informa disponibilidade | Calendário na Ficha e aba Disponibilidade + dias fixos (v24/v27) | `calendarioArtista`; `disponibilidade_artista` | pronto | Artistas do Notion sem conta não marcam | Convidar artistas da rede para o portal |
| Central consulta sem WhatsApp | Agenda das casas + Encontrar data (cruzamento por dia e cidade) | `agenda_casas`, `buscaDatas`, `livresNoDia` | pronto | — | Manter |
| Datas em negociação / reserva | Não existe estado intermediário (só disponível/indisponível e data confirmada/cancelada) | `datas_portal.status` | decisão | A casa não vê o que está sendo negociado | Máquina de estados (TO BE), após Thales e Isa definirem regras |
| Conflito de compromissos | Nova data só oferece casa/artista livres e sem show; salvar recusa fora da disponibilidade | `datas_portal` (save) | parcial | Exceção libera; não há trava no banco contra duas datas da mesma casa no mesmo dia | Índice único (casa, dia) para datas não canceladas, depois de validar com a Isa |
| Casa recebe confirmação | A data criada aparece na área da casa (Cronogramas) | `datas_portal` + RLS | parcial | Não há aviso (e-mail/WhatsApp) | Aviso só com autorização (TO BE) |
| Histórico de alterações | Auditoria de todas as tabelas, só adm lê | `auditoria`, `registrar_auditoria` | pronto | Equipe júnior não vê | Aba Feito mostra o que a própria pessoa fez |
| Datas do Notion x portal | Notion entra por retrato no build (só leitura); portal tem `datas_portal` | `data/eventos.psv`, `datas_portal` | parcial | Dois calendários (Notion e portal) | Fase 2 da Estratégia de dados: portal vira fonte e copia para o Notion (decisão) |
| Minuta visível ao artista | Central do site mostra o corpo da página do Notion | Central (fora do repo) | bug | Modelos Apresenta só com .docx anexado | Colar o texto no Notion (operacional) + bloqueio no código da Central |
| Assinatura conclui | Central do site | fora do repo | bug | Botão não libera / "Salvando" | Investigar com o Jimmy (código e logs) |
| Dados do artista uma vez só | Portal: o próximo contrato já vem com os dados do anterior para conferir (feito hoje) | `dadosAnteriores` em `src/conta.js` | parcial | Na Central do site, não | Levar a mesma regra para o sistema escolhido |
| Turnê com várias datas | Contrato Apresenta de circulação já cobre 6 datas num documento (cláusula 1.1) | modelo no Notion/docx | parcial | No portal, um contrato tem uma data só (`evento_id`) | Contrato com anexo de datas (TO BE), validação jurídica |
| Questionar cláusula / pedir revisão | — | — | inexistente | Artista volta para o WhatsApp | Botão "Tenho uma dúvida nesta cláusula" (TO BE) |
| Versão do modelo e evidências | Portal guarda texto final, hash SHA-256, nome, data/hora, IP e navegador; não guarda a versão do modelo | `contratos`, `assinar_contrato` | parcial | Editar um modelo muda o mesmo registro | Versionar modelos (`modelo_versao`) |
| Duplicata por clique duplo/reenvio | Trava de botão + aviso de contrato igual (mesma pessoa, modelo e data) (feito hoje) | `ctEnviar` | pronto | — | Manter |
| Central pós-assinatura: próximo show, local, horários, ordem | Passo a passo por data com endereço (mapa), ordem, abertura e mensagem de cronograma | `blocoPassos`, `infoNoite` | parcial | Contatos fixos no código e "a validar" | Contatos de apoio vindos do banco (TO BE) |
| Logística de turnê (voos, hotel, quartos) | — | — | inexistente | Fica no WhatsApp | Tabela de logística por data, visível só à artista e à Central (TO BE) |
| Contatos de apoio (Operação, Marketing, Logística, Casa, Comercial) | — | — | inexistente | | Tabela privada mantida pela administração (TO BE) |
| Autonomia na Ingresse | Materiais com versão, ciência e documento aberto na página; Treinamentos da casa | `materiais`, `material_versoes`, `trilhas` | parcial | Sem campo de vídeo, capítulos e passos | Tipo "tutorial" em Materiais (TO BE) |
| Acesso por função na equipe | Áreas Operações/Agenda/Marketing; menu júnior com A fazer, Feito, Visão geral (feito hoje) | `abas()`, `hoje()`, `feito()`, `geral()` | pronto | Validar com Gui, Isa e Bruno | Ajustar pelo uso |
| Notificações | Lembretes por e-mail (D-3, no dia, campanhas) em ensaio; convites por e-mail | `supabase/functions/lembretes` | parcial | Não lê `datas_portal`; nada é enviado sem `lembretes_ativos` | Ligar só com autorização |

## Entregável 2 — TO BE (proposta, não aprovada)

### Disponibilidade e negociação

1. A casa marca os dias fixos da semana e as exceções no calendário (pronto).
2. O artista faz o mesmo (pronto).
3. A Isa abre **Criar datas › Encontrar data**, filtra cidade e período e vê, por dia, casas e artistas livres, com a
   cidade de cada um (pronto).
4. **Proposta de estados de uma data** (precisa de Thales e Isa): `disponível` → `em negociação` (a Isa marca; a casa vê
   "em conversa") → `reservada` (prazo de validade a definir) → `confirmada` (vira data, contrato e cronograma) ou
   `liberada`.
5. Só `confirmada` ocupa o dia; `reservada` bloqueia a mesma casa/artista no mesmo dia para outras propostas.
6. O aviso à casa e ao artista sai só quando a Central autorizar o envio (botão, nunca automático no começo).

**Muda para a Isa:** sai do "você pode dia X?" no WhatsApp. **Para a casa:** marca uma vez por semana fixa e vê o que
está sendo conversado. **Para o artista:** idem.

### Contratação do artista (uma data)

1. A Isa cria a data (já ligando casa e artista) e toca "Preparar contrato": o sistema escolhe o modelo pelo formato
   (Descubra ou Apresenta) — regra a validar.
2. O artista entra, vê os dados que já deu (preenchidos) e confere.
3. Lê a minuta inteira na tela; pode marcar "tenho uma dúvida" num trecho (vai para a Central).
4. A Central responde ou ajusta e reenvia (nova versão; a anterior fica registrada).
5. O artista assina; ficam texto, versão do modelo, hash, data/hora, IP e navegador.

### Contrato de turnê

Um contrato por circulação com anexo de datas (cidade, casa, data e condições por praça), como o contrato Apresenta de
circulação já faz na cláusula 1.1. Dados de logística (passageiros, quartos) pedidos só neste caso. **Validação jurídica
obrigatória** antes de implementar.

### Central pós-assinatura (área do artista)

Evoluir "Próximos passos" (não criar outra área de datas): no topo, "Seu próximo show" com data, cidade, casa,
endereço (mapa), horário de passagem de som e abertura, ordem da noite, responsável local e "Quem procurar" (contatos de
apoio do banco). Para turnês, "Minha turnê" com voo, hotel e traslado por data, visível só ao artista e à Central.

### Autonomia Ingresse

Materiais do tipo **tutorial**: título, vídeo (link), capítulos com tempo, passo a passo escrito, responsável, versão e
data de revisão. Primeira entrega educacional, sem integração com a API da Ingresse. Isa e Gui definem o que é da casa e
o que continua com a Central.

## Entregável 3 — Backlog priorizado

Piloto = antes de liberar para a rede. Depois = próxima versão.

| # | Épico / história | Usuário | Critério de aceite | Dependência | Prioridade | Complexidade | Risco | Decide |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A1 | Texto integral dos modelos Apresenta no Notion | Isa | Artista vê a minuta completa na Central | — | Piloto (urgente) | Baixa (operacional) | Baixo | Isa |
| A2 | Central bloqueia modelo sem texto e mostra o que falta para assinar | Artista | Nunca mostra descrição como minuta; botão explica o que falta | Código da Central | Piloto | Média | Médio | Jimmy |
| A3 | Escolher o sistema oficial de contratos (Central do site ou portal) | Central | Um só lugar para modelo, dados e status | — | Piloto | — | Alto | Thales + Jimmy |
| B1 | Estados da data (negociação, reserva, confirmação, liberação) | Isa, casa | Casa vê "em conversa"; conflito impossível | Regras de reserva | Depois | Média | Médio | Thales + Isa |
| B2 | Trava no banco: uma data por casa por dia | Isa | Banco recusa a segunda data | B1 ou regra simples | Piloto | Baixa | Baixo | Isa |
| B3 | Aviso à casa e ao artista quando a data é confirmada | Casa, artista | Sai só com autorização | Envio de e-mail ligado | Depois | Média | Médio | Thales |
| C1 | Contrato com anexo de datas (turnê) | Isa, artista | Um contrato, várias praças | Jurídico | Depois | Alta | Alto | Thales + jurídico |
| C2 | "Tenho uma dúvida nesta cláusula" | Artista | Pergunta chega à Central; resposta fica no histórico | A3 | Depois | Média | Baixo | Isa |
| C3 | Versão do modelo registrada na assinatura | Central | Assinatura aponta a versão exata | A3 | Piloto | Baixa | Baixo | Thales |
| D1 | Contatos de apoio no banco (Operação, Marketing, Logística, Casa, Comercial) | Artista, casa | "Quem procurar" sem número no código | Lista da equipe | Piloto | Baixa | Baixo | Marina |
| D2 | "Seu próximo show" no topo da área do artista | Artista | Responde data, local, horários, responsável | D1 | Piloto | Média | Baixo | Gui |
| D3 | Logística de turnê por data (voo, hotel, traslado) | Artista | Só o artista e a Central veem | C1, LGPD | Depois | Média | Alto (dados pessoais) | Thales |
| E1 | Tutoriais Ingresse em Materiais (vídeo, capítulos, passos) | Casa | 8 tutoriais publicados e versionados | Vídeos da Isa | Piloto | Baixa | Baixo | Isa + Gui |
| F1 | Menu júnior: A fazer, Feito, Visão geral | Gui, Isa, Bruno | Cada um vê só o que precisa | — | Piloto (feito, a validar) | — | Baixo | Marina |
| F2 | Datas do portal copiadas para o Notion (só ida) | Equipe | Uma fonte por campo | Estratégia de dados fase 2 | Depois | Média | Médio | Thales |

## Entregável 4 — Arquitetura (proposta)

Preserva tudo o que existe; só acrescenta.

- **Datas:** `datas_portal` ganha `estado` (`em_negociacao`, `reservada`, `confirmada`, `liberada`, `cancelada`),
  `reservada_ate`, `reservada_por`; índice único parcial `(casa_id, dia) where estado in ('reservada','confirmada')`.
  Auditoria já cobre a tabela.
- **Disponibilidade:** `disponibilidade_casa`, `disponibilidade_artista` (dias avulsos) e `disponibilidade_semanal`
  (dias fixos, v27). Regra única: o dia avulso vale sobre a semana.
- **Contratos:** `modelos_contrato` + `modelo_versoes` (texto imutável por versão); `contratos.modelo_versao_id`;
  `contrato_datas` (contrato_id, data_id) para turnê; `contrato_duvidas` (contrato_id, trecho, pergunta, resposta, quem,
  quando). Evidências já existem (texto final, hash, IP, navegador).
- **Dados do artista:** hoje repetidos por contrato (`contratos.dados`). Proposta: `artista_dados_contratuais` (um
  registro por artista, RLS só dono + Central), copiado para o contrato no momento da assinatura (o contrato guarda a
  cópia assinada).
- **Logística:** `logistica_data` (data_id, artista_id, voo, horários, localizador, hotel, endereço, quarto, traslado),
  RLS: artista da data + Central; passageiros com CPF/RG só quando exigido e com finalidade registrada (LGPD).
- **Contatos de apoio:** `contatos_apoio` (papel, nome, whatsapp, email, para: artista/casa/equipe, ordem), só a
  administração edita; nunca no código.
- **Tutoriais:** `material_versoes` ganha `video_url`, `capitulos jsonb` ([{tempo, título}]), `passos jsonb`,
  `revisado_em`; `materiais.responsavel` já existe.
- **Notion x Supabase:** Notion continua só leitura e é a fonte da agenda oficial enquanto a fase 2 não for aprovada. O
  portal nunca escreve no Notion. Para não ter dois calendários: (1) a Isa cria as datas novas no portal; (2) uma cópia
  só de ida para o Notion (fase 2, a validar); (3) campo por campo, uma fonte só (ver `docs/ESTRATEGIA_DADOS.md`).

## Entregável 5 — Implementado hoje (não publicado)

| O quê | Arquivos | Testes |
| --- | --- | --- |
| Dias fixos da semana para casa e artista (marcar "segunda" deixa toda segunda verde e já conta para a Isa); banco v27 | `supabase/schema.sql` (v27), `src/conta.js` | `tests/datas-portal.test.mjs` (7 novos), `tests/e2e/cruzar-datas.cjs` |
| Encontrar data mostra sempre a cidade da casa e a do artista (mora em / quer tocar em) e o dia da semana | `src/conta.js` | `cruzar-datas.cjs` |
| Nova data só oferece quem marcou o dia como livre (semana fixa ou avulso); Exceção para o que foi combinado por fora | `src/conta.js` | `datas-portal.cjs`, `cruzar-datas.cjs` |
| Calendário de disponibilidade na Ficha do artista (sem campo de texto solto) | `src/conta.js` | `cruzar-datas.cjs` |
| Menu júnior por área: A fazer (urgente primeiro), Feito (últimos 30 dias), Visão geral (só leitura) | `src/conta.js`, `src/index.html` | `areas-equipe.cjs` |
| Contrato: dados do artista vêm do contrato anterior para conferir; aviso de contrato repetido; trava contra reenvio | `src/conta.js` | `contratos.cjs` (3 novos) |
| Operações (Gui) edita a Ficha e vê contratos; mensagem de cronograma explica o que falta (já publicado antes) | `src/conta.js`, v26 | `areas-equipe.cjs`, `datas-portal.test.mjs` |

## Entregável 6 — Resumo executivo

Ver a mensagem da sessão de 17/11/2026 (FEITO, ERRO, ATENÇÃO, PRÓXIMOS PASSOS).
