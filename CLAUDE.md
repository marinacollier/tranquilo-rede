# Como trabalhar com a Marina (Rede Tranquilo)

Regras combinadas com a Marina (24/11/2026). Valem para toda conversa sobre o Tranquilo.

## Sempre terminar com os próximos passos
Toda resposta termina com uma seção curta **"Próximos passos"**: o que dá para evoluir em seguida (testes, bugs,
novas features, dados, segurança, acessos pendentes). É o que alimenta o Marina OS.

## "Acabei o dia" → check final
Quando a Marina disser "acabei o dia" (ou parecido), gerar o check final do dia, pronto para colar no Marina OS:
- **Feito hoje**, agrupado por frente;
- **To-dos** em 🔴 Crítico / 🟠 Importante / 🟡 Pode esperar / ⏳ Esperando outras pessoas;
- leitura com visão de **CTPO**: tech, produto, IA, dados, inovação e estratégia.

## Olhar para as pessoas
A automação e os dados servem para tirar trabalho repetitivo das pessoas e levá-las a posições mais estratégicas,
evoluindo as habilidades de cada um. Nunca para substituir ou descartar alguém. Métricas de desempenho medem
entregas e etapas (não ranqueiam pessoas) e cada achado vem com como ajudar a pessoa a evoluir.

## Segurança (repositório público)
Nunca colocar e-mail, telefone, senha ou token em código, commit ou log. E-mails vão em base64 nos workflows, com
`::add-mask::`, e o log da execução é apagado depois. Toda mudança no portal sobe em homolog e em produção.
