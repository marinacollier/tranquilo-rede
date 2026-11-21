# Cópia de segurança do banco

A automação **Cópia de segurança do banco** (`.github/workflows/copia-seguranca.yml`) roda todo domingo às 03:23 (Brasília) e pode ser disparada à mão (Actions › Cópia de segurança do banco › Run workflow; ambiente `prd` ou `teste`).

- Exporta todas as tabelas da produção. Das contas, leva só id, e-mail e datas (nunca a senha). Ficam de fora a `config_interna` e os arquivos do Storage (vai só a lista dos nomes).
- O arquivo sai **cifrado** e fica 90 dias nos artefatos da execução. O log mostra só nomes de tabelas e contagens.
- Só abre quem tem a chave privada.

## Ligar (uma vez, no seu computador)

1. Com o repositório baixado: `node scripts/abrir-copia.mjs gerar-chaves`
2. Guarde `copia-privada.pem` num lugar seguro (gerenciador de senhas ou pendrive). Sem ela nenhuma cópia abre. Não mande para ninguém.
3. No GitHub: Settings › Secrets and variables › Actions › **Variables** › New variable: nome `COPIA_CHAVE_PUBLICA`, valor = o conteúdo inteiro de `copia-publica.pem`.

Enquanto a variável não existir, a automação termina sem exportar nada.

## Abrir uma cópia

1. Baixe o artefato `copia-prd-N` da execução e descompacte (sai `copia-prd.cifrado`).
2. `node scripts/abrir-copia.mjs copia-prd.cifrado copia-privada.pem`
3. Sai `copia-prd.json` com todas as tabelas. Esse arquivo tem dados reais: apague depois de usar.

Restaurar dados a partir da cópia é manual e precisa de aprovação (não há script que escreva no banco).
