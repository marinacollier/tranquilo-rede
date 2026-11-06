# Documentos originais do Gui — fonte da verdade

Atualizado em 06/11/2026. Os dois documentos que o Gui (Operações) mandou como referência da experiência da casa.
São a fonte canônica da apresentação da Ficha e do Guia no portal. A base Casas de Shows do Notion
(`docs/NOTION_CASAS_MAP.md`) é fonte de dados, não de apresentação.

| | Ficha da unidade | Guia do Franqueado |
|---|---|---|
| Nome exato | "Modelo da Ficha da Unidade" · "Tranquilo [Cidade] · [Casa] · Ficha da unidade" | "Guia do Franqueado Tranquilo" |
| Tipo | Página HTML interativa (artifact do Claude) | Página HTML interativa (artifact do Claude) |
| Origem | Link enviado pelo Gui no WhatsApp em 28/10/2026, 14:10 (artifact `2n8XPeLFZWC1TnpJxJZMq3`, com chave de compartilhamento) | Link enviado pelo Gui em 28/10/2026, 14:11 (artifact `4fAhp8uATbUnKGMhj2paSv`, com chave de compartilhamento) |
| Versão e data | Modelo · versão 1 · 30/10/2026 · "Acompanhamento: Gui, Operações" | v1.5 · 30/10/2026 |
| Fonte canônica | Sim, para a Ficha da Casa (Parte 1 e Parte 2) | Sim, para Operações › Guia e materiais e para as regras do portal |
| Conteúdo extraído integralmente | Sim. Texto lido em 06/11/2026 (228 linhas; impressão SHA-256 do HTML: `4c350bfdf61a901d…`) | Sim. Texto lido em 06/11/2026 (≈ 22 mil caracteres; SHA-256 do HTML: `094dfa8ef718af4d…`) |
| Onde o portal usa | Ficha da Casa › Ficha da unidade (Parte 1 e Parte 2) e Ficha da Casa › Equipe da casa (Sua equipe) | Operações (link para o Guia), regras de equipe (4 cadeiras, uma função por pessoa), regras fixas da noite, pré-requisitos do primeiro evento, prazos da semana do evento |
| Evidência de homologação | `docs/GUI_DOCUMENT_COMPARISON.md` e o teste `tests/e2e/portal-casa.cjs`, que confere a tela com `docs/gui/ficha-unidade-v1.inventario.json` | `docs/GUI_DOCUMENT_COMPARISON.md` |

## Cuidados

- Os links têm chave de compartilhamento (`?sk=`). Não vão para o código público do site nem para o Git. No portal, o Guia
  entra como material cadastrado pela Central (tabela `materiais`, lida só por contas de casa), com o link oficial.
- O HTML original não fica no repositório: ele tem os WhatsApps da equipe central e a divisão de receitas padrão.
  O repositório guarda só o inventário de campos (`docs/gui/ficha-unidade-v1.inventario.json`), sem dados.
- Versão nova do Gui: ler de novo, atualizar o inventário e a comparação, e só depois mudar a tela.
