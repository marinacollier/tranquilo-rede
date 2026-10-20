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

## Contas por e-mail (Supabase)

Artistas e casas criam a própria conta. A artista preenche a inscrição; a pré-curadoria é automática
(pontuação de 0 a 100, faixa e alertas, calculadas no banco). A equipe avalia na aba Curadoria.
Casas novas ou já parceiras se cadastram; a habilitação mínima (método V0.1) aponta o que bloqueia a
habilitação, o que bloqueia um match e o que só enriquece. Depois de vinculadas, artista e casa veem o
passo a passo de cada data (T-35 a pós-show) e a equipe acompanha na aba Prontidão.

Sem configuração, o site roda em **modo demonstração**: as contas ficam só no navegador de quem testa.

Para ligar de verdade (uma vez):
1. Crie um projeto grátis em supabase.com.
2. No SQL Editor, rode `supabase/schema.sql` inteiro e depois o SQL privado com os e-mails de administração e os códigos internos (não fica no repositório).
3. Em Authentication → URL Configuration, coloque `https://marinacollier.github.io/tranquilo-rede/` em Site URL e em Redirect URLs.
4. Em Project Settings → API, copie a Project URL e a anon public key para `src/config.js` e faça push.

Testes: `npm install && npm test` (permissões e regras rodam num Postgres local, sem precisar do Supabase).
