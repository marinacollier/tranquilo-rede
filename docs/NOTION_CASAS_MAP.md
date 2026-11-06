# Mapa da base Notion "Casas de Shows"

- Página: https://app.notion.com/p/31e83bbf4e8480cdbcc2d3304313f11d
- Data source: `collection://31e83bbf-4e84-8013-b34e-000b5103d685`
- Levantamento: 2026-11-06, somente leitura (nada foi alterado no Notion). **224 registros** no total.
- Taxa de preenchimento calculada por contagem de não-nulos em uma única consulta SQL agregada. Nenhum valor pessoal foi copiado.
- "n/d" = propriedade não consultável via SQL (fórmula, rollup ou verificação), sem taxa medida.

> **Importante:** esta base **não substitui** os dois documentos originais do Gui, **Ficha da unidade v1** e **Guia do Franqueado v1.5**.
> Eles continuam sendo a referência de **como a Ficha da Casa é apresentada** (estrutura, ordem, linguagem).
> O Notion entra só como **fonte de dados** para preencher os campos que esses documentos definem.

## Propriedades

| Propriedade | Tipo | Opções/relação | Preenchida em ~X% | Sensível? | Sugestão de seção da Ficha da Casa |
|---|---|---|---|---|---|
| Nome fantasia | title | — | 100% | não | Identificação |
| Nomes e grafias alternativas para desambiguação | text | lista "- \"nome\";" | 33% | não | Interno (busca/desambiguação) |
| Descrição da casa de shows (venue) | text | sem contatos/links por regra | 87% | não | Sobre a casa |
| Cidade | relation | → Cidades (`2aa83bbf-…ccb0f`), limite 1 | 99% | não | Identificação/Localização |
| Localização | place | — | 88% | não (endereço público da casa) | Localização (mapa) |
| Endereço e ref. | text | — | 55% | não (endereço comercial) | Localização |
| Complemento do endereço | text | — | 3% | não | Localização |
| Como chegar (p/ público) | text | — | 2% | não | Como chegar |
| Aeroporto mais próximo com voos comerciais | relation | → Aeroportos (`643062fb-…6c`), limite 1 | 85% | não | Logística |
| Capacidade máxima em pé (informada) | number | — | 41% | não | Capacidade e estrutura |
| Capacidade máxima sentado (informada) | number | — | 33% | não | Capacidade e estrutura |
| Capacidade consolidada de pessoas sentadas | formula (somente leitura) | regra: sentado, senão 60% de em pé | n/d | não | Capacidade e estrutura |
| Porte do espaço | formula (somente leitura) | — | n/d | não | Capacidade e estrutura |
| Observações importantes sobre capacidade | text | — | 41% | não | Capacidade e estrutura |
| Metragem (m²) | number | — | 1% | não | Capacidade e estrutura |
| Andares | number | — | <1% | não | Capacidade e estrutura |
| Fotos do local | file | — | 1% | não | Galeria |
| Menores de idade | select | Não permite · Permite com responsável legal · Permite · Não informado | 16% | não | Regras da casa |
| Link do rider técnico | url | — | <1% | não | Rider técnico |
| Link do Drive do rider técnico | relation | → base de links Drive (`31f83bbf-…9960`) | 0% | não | Rider técnico |
| Arquivo do rider técnico | file | — | 0% | não | Rider técnico |
| Aluguel aprox. | number (R$) | — | 7% | **sim (comercial)** | Interno/Condições comerciais (restrito) |
| Incluso no aluguel | text | — | 2% | **sim (comercial)** | Interno/Condições comerciais (restrito) |
| Tiqueteira com exclusividade | relation | → Tiqueteiras (`c4a611a2-…92da3`) | <1% | não | Ingressos |
| Nome da tiqueteira exclusiva | rollup (somente leitura) | via Tiqueteira → título | n/d | não | Ingressos |
| Padrão do link da tiqueteira exclusiva | rollup (somente leitura) | via Tiqueteira → texto | n/d | não | Ingressos |
| Tiqueteira exclusiva (texto) | formula (somente leitura) | — | n/d | não | Ingressos |
| Padrão do link exclusivo (texto) | formula (somente leitura) | — | n/d | não | Ingressos |
| Site | url | — | 35% | não | Canais oficiais |
| Instagram | url | — | 53% | não | Canais oficiais |
| Nome do(s) contato(s) da casa | text | — | 23% | **sim (pessoal)** | Contatos (restrito) |
| Email do contato | email | — | 22% | **sim (pessoal)** | Contatos (restrito) |
| Telefone 1 do contato | phone_number | — | 55% | **sim (pessoal)** | Contatos (restrito) |
| Telefone 2 do contato | phone_number | — | 11% | **sim (pessoal)** | Contatos (restrito) |
| Dono (franqueado) | text | nome + WhatsApp | 1% | **sim (pessoal)** | Franqueado (restrito) |
| Razão social | text | — | 23% | **sim (fiscal)** | Dados fiscais (restrito) |
| CNPJ | text | só dígitos, chave única | 25% | **sim (fiscal)** | Dados fiscais (restrito) |
| Avaliação (padrão Tranquilo) | status | A avaliar · Em avaliação · Apto · Não apto · Apto com risco · Encerrou atividades | 29% | sim (avaliação interna) | Status da casa (interno) |
| Eventos nesta venue | relation | → **Eventos** (`84c63e67-…0393`) | 16% | não | Histórico de eventos |
| Negociações | relation | → Negociações (`fad70b8c-…863f`) | 23% | **sim (comercial)** | Interno (não exibir) |
| Feedbacks originados da casa | relation | → Feedbacks (`edbe9908-…57bd`), limite 1 | 0% | sim | Interno (não exibir) |
| Não confundir com | relation | → própria base (Casas de Shows) | 4% | não | Interno (desambiguação) |
| item principal | relation | → própria base, limite 1 (hierarquia) | 0% | não | Interno |
| Subitem | relation | → própria base (hierarquia) | 0% | não | Interno |
| Observações de duplicidade | text | — | 8% | não | Interno |
| Dados verificados | verification | — | n/d | não | Selo "dados verificados" |
| Responsável por verificar os dados | person | usuários Notion | 79% | sim (usuário interno) | Interno |
| Ultima revisão pela IA | date | — | 95% | não | Rodapé/metadado |
| Versão do agente | number | só IA preenche | 95% | não | Interno |

Somente leitura (não editáveis): as 4 fórmulas (`Capacidade consolidada…`, `Porte do espaço`, `Tiqueteira exclusiva (texto)`, `Padrão do link exclusivo (texto)`) e os 2 rollups (`Nome da tiqueteira exclusiva`, `Padrão do link da tiqueteira exclusiva`). Nenhum desses é consultável por SQL; usar fetch da página.

## Relações

| Propriedade | Base de destino | Cardinalidade |
|---|---|---|
| Eventos nesta venue | **Eventos** `collection://84c63e67-7b36-407c-9310-681ebc120393` | N (vínculo principal Casa ↔ Evento) |
| Cidade | Cidades/Localidades `collection://2aa83bbf-4e84-8000-a136-000b7beccb0f` | 1 |
| Aeroporto mais próximo com voos comerciais | Aeroportos `collection://643062fb-7c00-4790-8c9b-ace11b857b6c` | 1 |
| Tiqueteira com exclusividade | Tiqueteiras `collection://c4a611a2-9356-467a-99b7-4043cf792da3` | N (alimenta 2 rollups) |
| Link do Drive do rider técnico | Links Drive `collection://31f83bbf-4e84-803d-92aa-000b178c9960` | N |
| Negociações | Negociações `collection://fad70b8c-c97c-46d3-84bb-38c5a737863f` | N |
| Feedbacks originados da casa | Feedbacks `collection://edbe9908-c69a-4488-b792-f0e05f7057bd` | 1 |
| Não confundir com / item principal / Subitem | a própria Casas de Shows | auto-relações |

Para exibir dados dos eventos na Ficha é preciso consultar também a base Eventos (o campo aqui guarda só URLs de páginas).

## O que o portal NÃO deve ler sem controle de acesso extra

- **Contatos pessoais:** Nome do(s) contato(s), Email do contato, Telefone 1 e 2, Dono (franqueado).
- **Fiscal:** CNPJ, Razão social.
- **Financeiro/comercial:** Aluguel aprox., Incluso no aluguel, relação Negociações.
- **Avaliação interna:** Avaliação (padrão Tranquilo), Feedbacks originados da casa, Responsável por verificar os dados.
- **Metadados internos** (não são sensíveis, mas não servem ao franqueado): Observações de duplicidade, Nomes alternativos, Não confundir com, item principal/Subitem, Versão do agente.

Sugestão: sincronizar para o Supabase só os campos públicos numa tabela/view própria, e deixar os campos acima numa tabela separada com RLS restrita (ex.: dono da unidade + admin).

## Observações de qualidade dos dados

- Campos bem preenchidos (>80%): Nome, Cidade, Localização, Descrição, Aeroporto, Responsável, revisão IA.
- Campos quase vazios (<5%): Como chegar, Metragem, Andares, Fotos, rider técnico (todas as 3 formas), Incluso no aluguel, Complemento, Dono (franqueado). A Ficha deve tratar esses campos como opcionais e mostrar "não informado".
- Capacidade aparece em ~41% (em pé) e ~33% (sentado).
- Template padrão da página + template "Casa de Shows Inapta" existem na base.
