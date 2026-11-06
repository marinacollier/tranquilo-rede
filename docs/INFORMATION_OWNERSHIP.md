# Quem é dono de cada informação

Princípio: **uma fonte canônica, várias visualizações controladas**. Uma informação pode aparecer como resumo ou atalho
em outra tela, mas só é editada num lugar.

| Informação | Fonte oficial | Área dona | Aparece como referência em | Onde se modifica | Quem modifica | Sincronização |
|---|---|---|---|---|---|---|
| Dados da casa (Parte 2 da Ficha) | `cadastros_casas.dados` | Ficha da Casa | Central › Cadastros de casas; Painel (status) | Ficha da Casa | A casa (rascunho); depois do envio, a Central aprovando um pedido | Leitura direta |
| Combinados da parceria (receitas, contatos) | `cadastros_casas.combinados` | Ficha da Casa › Parte 1 | — | Central › ficha da casa › Combinados | Equipe do Tranquilo | Leitura direta |
| Pedidos de atualização | `solicitacoes_ficha` | Ficha da Casa | Central (ficha da casa, Cadastros, Painel) | Casa pede; Central responde | Casa / equipe | Leitura direta |
| Equipe da casa (Sua equipe) | `equipe_casa` | Ficha da Casa › Equipe da casa | Ficha › Sua equipe (somente leitura); Treinamentos (Central) | Ficha da Casa › Equipe da casa | Dono da casa | Leitura direta |
| Guia do Franqueado, manuais, modelos | `materiais` + `material_versoes` (link para o documento oficial) | Operações › Guia e materiais | Ficha (botão "Abrir o Guia") | Central › Materiais | Equipe do Tranquilo | O documento continua no link oficial |
| Como é a noite (cronograma, camarim, rider, padrão) | `src/operacao.js` (manuais de 21/10) | Operações › Como é a noite | Datas (bloco de cada data) | Código (versão do manual) | Desenvolvimento, quando a Operações mudar o manual | Build |
| Treinamento da casa | `trilhas` + `trilha_marcos` | Operações › Treinamento | Central › Treinamentos | Cada um marca a sua etapa | Central / dono | Leitura direta |
| Disponibilidade de datas | `disponibilidade_casa` | Datas › Disponibilidade | Central › Agenda das casas | Datas › Disponibilidade | Dono da casa | Leitura direta |
| Eventos (data, casa, line-up, status, vendas) | Notion (bases Eventos e Line-up) | Datas › Datas confirmadas | Painel da operação; Agenda das casas | Notion | Central | Retrato no build (`data/eventos.psv`, `data/lineup.psv`) |
| Passos de cada data | `checklist` | Datas › Datas confirmadas | Central › Prontidão | Datas | Casa (dono e equipe, pela função) | Leitura direta |
| Campanhas e "Feito" | `campanhas`, `campanha_itens`, `campanha_feitos` | Marketing › Campanhas | Central › Campanhas | Conteúdo: arquivo do Bruno; "Feito": a casa | Bruno (conteúdo), casa (execução) | Importação do arquivo do Bruno |
| Contratos | `contratos` e `documentos` (site); fluxo próprio do Notion | Datas (para assinar) | Painel (status) | Central › Documentos | Central / pessoa que assina | O status jurídico oficial ainda não foi confirmado |

## Duplicações corrigidas nesta rodada

- Status de habilitação e "o que falta" saíram de Próximos passos e ficam só na Ficha da Casa (Datas mostra só o aviso com o atalho).
- "Sua equipe" na Ficha lê a Equipe da casa em vez de pedir os dados de novo.
- Dias da semana da Ficha aparecem em Disponibilidade só como referência.
