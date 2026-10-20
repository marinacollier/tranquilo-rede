# Visual do site oficial: o que foi feito e o que falta

Branch: `visual-site-oficial`. **Não foi publicada**: o Thales está testando o que está no ar.
Publicar só depois de a Marina aprovar.

## Referência
- O site oficial foi capturado pelo workflow manual `.github/workflows/capturar-referencia.yml`.
  O resultado está na branch `referencia`: HTML, texto, capturas de tela e `estilos.json`.
  O sandbox não acessa tranquilomusica.com.br; só o GitHub Actions consegue.
- Identidade do site oficial:
  - fundo `#000201`, texto `#e2edff`;
  - Playfair Display 900 nos títulos e Lexend Deca na interface;
  - botões em pílula;
  - logo em texto "T." (o ponto ganha a cor da cidade).
- Cor de cada cidade: SP #7c8ff3, BH #fcdbe5, Floripa #f8f4cf, Rio #8fcaff, Salvador #f9b436, Brasília #ffde59, Campinas #ccbfda,
  Curitiba #c4d9ba, Recife #f56c52. As cidades "NOVO" usam #f4f4f5.
- O site oficial não pede localização. Ele tem o seletor "Escolher cidade" e o banner
  "🍪 Cookies e Consentimento de Comunicação" (Aceitar Tudo / Apenas Necessários, por causa do Google Analytics).
- Políticas: /politica-de-privacidade, /politica-mensagens-whatsapp, /termos-de-uso (da Tranquilo. Eventos Ltda).

## Concluído em 20/10 (sessão 2)
- Itens 1, 2, 3 e 4 da lista "Falta" feitos: seletor de cidade, banner, rodapé, home no formato do site oficial, títulos vindos do Notion, "me avise" com localização e links das políticas, aceite dos Termos na criação de conta, cabeçalho compacto no celular, cor neutra na área logada.
- `npm test` passa. Capturas de computador e celular conferidas, sem estouro de largura.
- **Falta só a aprovação da Marina e a publicação (item 6).**

## Feito nesta branch (src/index.html; parte só em código, sem teste)
- Tokens e fontes trocados para os do site oficial; `--city` muda conforme a cidade escolhida.
- Bloco de CSS "ajustes para o visual do site oficial". Classes:
  - topo: `.tl`, `.btn-entrar`, `.cid-sel`/`.cid-menu`;
  - home: `.hero-ofc`, `.cidades`/`.cidade`, `.evo` (cartão de evento igual ao do site oficial);
  - rodapé e legal: `.sobre`, `.rod`, `.consent`, `.aceite-legal`, `.loc-btn`.
- Topo novo: logo "T.", botão "Entrar" em pílula tracejada, `<div id="cidSel">`. O rodapé virou `<footer id="foot">` e há um `<div id="consent">`.
- JS novo:
  - `CIDADES_OFC` e `cidadeOfc()`, `corCidade()`;
  - `aplicarCidade()`, `escolherCidade()`, `seletorCidade()`;
  - `maisPerto()` e `localizar()` (geolocalização só depois do clique; nada sai do aparelho);
  - `consentimento()` (banner honesto: o site não tem analytics, por isso não há "Aceitar tudo");
  - `rodape()` (rodapé institucional com links para o site oficial, CNPJ, endereço e contatos).

## Falta
1. Ligar o JS novo:
   - Em `iniciar()`:
     - `S.cidade = store.get("tq-cidade") || ""`;
     - `aplicarCidade()`;
     - `rodape()`;
     - chamar `consentimento()` depois que o tutorial público fechar (no `aoFechar` de `tutorialPublico`, em conta.js) e quando ele não abrir.
   - Em `render()`:
     - `$("#cidSel").innerHTML = seletorCidade()`;
     - esconder `#cidSel` quando a pessoa estiver logada.
   - No listener de clique:
     - `#cidBtn` alterna `S.cidMenu`;
     - `[data-cidade-ofc]` chama `escolherCidade()`;
     - `[data-localizar]` chama `localizar()`;
     - `[data-consent]` grava `tq-consentimento` e limpa `#consent`;
     - clique fora fecha o menu.
2. Reescrever `telaPublica()` no formato do site oficial:
   - "TRANQUILO." e "Ouvidos atentos. Corações abertos.";
   - grade "Cidades" com cartões coloridos "TRANQUILO/ NOME" e faixa "NOVO" (clicar escolhe a cidade);
   - "Próximos eventos" com cartões `.evo`:
     - bloco SEG/OUT/26/2026;
     - data por extenso;
     - título "Tranquilo Descubra — São Paulo" ou "Tranquilo Apresenta — Cidade — Artista";
     - selo do modelo;
     - "em N dias";
     - "Ver ingressos" na cor da cidade.
   - O "me avise" já vem com a cidade escolhida; seguem "Sobre o Tranquilo" (texto do site oficial) e Entrar.
3. conta.js:
   - `formAviso`: botão "📍 Usar minha localização" (`#avLocNota`), cidade escolhida já marcada e links das políticas no texto da autorização.
   - `formEntrada`: na criação de conta, a linha "Ao criar a conta, você concorda com os Termos de Uso e a Política de Privacidade do Tranquilo" (`.aceite-legal`).
4. Área logada: conferir o visual com as fontes novas (sidebar, tabelas, tutorial) e trocar `img/marca.png` pelo "T." em texto onde sobrar.
5. Testes:
   - rodar `fluxos.js` (30 verificações; ver o histórico da sessão) com `localStorage tq-consentimento` definido;
   - um teste do banner;
   - um teste do seletor de cidade;
   - capturas de tela no computador e no celular.
6. Mostrar as capturas para a Marina, **pedir aprovação** e só então:
   - fazer merge na `main`;
   - publicar só os arquivos de interface na `gh-pages` (sem SITE_SECRET no Actions, o workflow não publica).
     Copiar `index.html`, `conta.js`, `tour.js`, `regras.js`, `config.js` e `img/` de um build local para a branch gh-pages.

## Pendências fora do visual
- Secrets no GitHub: `SITE_SECRET` (o mesmo valor de antes) e `NOTION_TOKEN` (integração só com "Read content"), para a atualização diária.
- SMTP no Supabase, para os e-mails de convite.
- Apagar as contas teste-* depois que o Thales testar (o comando está em `.privado/contas-teste.sql`, que não está no repositório).
