# Rede Tranquilo

Painel da rede Tranquilo, gerado a partir do Notion e publicado no GitHub Pages:
**https://marinacollier.github.io/tranquilo-rede/**

## Perfis de acesso

| Perfil | O que vê |
|---|---|
| Público (sem código) | Agenda, artistas em circulação e cidades. Nenhum número de público. |
| Artista | As próprias datas, o público de cada noite e a faixa típica de cada praça, incluindo as praças onde ainda não tocou. |
| Casa | As próprias datas, o público por noite comparado com a cidade e a rede, e o roteiro da noite do método V0.1. |
| Equipe | Operação da rodada dos 50, alertas, todas as datas, base de conhecimento e método. |
| Administração | Tudo da equipe, mais o painel "O que está dando certo" (cidade, modelo, casa e artista) e a lista de códigos para distribuir. |

Cada perfil recebe um pacote criptografado (AES-256-GCM) cuja chave sai do próprio código de acesso.
Sem o código, o arquivo é ilegível, mesmo o repositório sendo público.
Os códigos são derivados de `SITE_SECRET`: continuam iguais a cada atualização e só mudam se o segredo mudar.

## Atualização

- `data/eventos.psv` e `data/base.psv` são o retrato do Notion (bancos Eventos e Base de conhecimento).
- Toda noite, uma rotina do Claude lê o Notion pelo conector, atualiza o retrato (`scripts/mesclar.mjs`) e republica (`scripts/publicar.sh`).
- Alternativa sem Claude: crie uma integração no Notion, salve a chave como segredo `NOTION_TOKEN` e o segredo `SITE_SECRET` no repositório. O workflow `.github/workflows/atualizar.yml` passa a ler a API oficial às 03:00 e 06:00.
- Proteções: o build aborta com menos de 150 eventos, a mesclagem aborta se o retrato encolher mais de 20%, e o site mostra uma faixa vermelha quando os dados têm mais de 36 horas.

## Rodar localmente

```bash
SITE_SECRET=... ACESSOS_SAIDA=/tmp/acessos.tsv node scripts/build.mjs
python3 -m http.server -d dist 8000
```
