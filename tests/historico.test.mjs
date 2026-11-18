// "Seu histórico" (pedido da Marina, 18/11/2026): src/historico.js monta as linhas de quem está logado.
import { readFileSync } from 'node:fs'; import vm from 'node:vm';
const ctx = {}; vm.createContext(ctx);
vm.runInContext(readFileSync(new URL('../src/historico.js', import.meta.url), 'utf8'), ctx);
const H = ctx.TQHistorico;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALHA') + ' ' + m); if (!c) process.exitCode = 1; };
const desde = '2026-10-19T00:00:00Z', h = (d, hora = "12:00") => `2026-11-${String(d).padStart(2, "0")}T${hora}:00.000Z`;

// Equipe: tudo o que a pessoa fez, pelas colunas de quem e quando
const eq = H.montar({
  insc: [{ id: 'i1', avaliado_por: 'gui', avaliado_em: h(10), status: 'aprovada', dados: { nome_artistico: 'Ana' } }, { id: 'i2', avaliado_por: 'outra', avaliado_em: h(10), status: 'aprovada' }],
  casas: [{ id: 'c1', avaliado_por: 'gui', avaliado_em: h(11), status: 'habilitada', dados: { nome: 'Casa Um' } }],
  contr: [{ id: 'k1', user_id: 'ana', titulo: 'Contrato Ana', criado_por: 'gui', criado_em: h(12), conferido_por: 'gui', conferido_em: h(13), devolvido_por: null }],
  datasP: [{ id: 'd1', dia: '2026-12-20', casa_nome: 'Casa Um', criado_por: 'gui', criado_em: h(14), status: 'cancelada', atualizado_em: h(15), artistas: [{ nome: 'Ana' }] }],
  campanhas: [{ id: 'cp', titulo: 'Campanha X', casa_ref: 'Casa Um', importada_por: 'gui', importada_em: h(16) }],
  campItens: [{ id: 'it', campanha_id: 'cp', dia: '2026-11-20' }],
  campHist: [{ item_id: 'it', acao: 'feito', por: 'gui', em: h(17) }],
  versoes: [{ id: 'v', material_id: 'm', versao: '2', publicada_por: 'gui', publicada_em: h(17, '13:00') }], materiais: [{ id: 'm', titulo: 'Guia' }],
  marcos: [{ casa_ref: 'Casa Um', etapa: 'msg1', feito_por: 'gui', feito_em: h(17, '14:00') }],
  conv: [{ email: 'x@exemplo.org', nome: 'Bia', tipo: 'artista', criado_por: 'gui', criado_em: h(17, '15:00') }],
  diario: [{ acao: 'contratos_lineup', detalhe: { contratos: 3 }, criado_em: h(18) }, { acao: 'tela', criado_em: h(18) },
    { acao: 'clique', detalhe: { campCobrar: 'cp', externo: 'whatsapp' }, criado_em: h(18, '13:00') }, { acao: 'contrato_conferido', criado_em: h(13) }],
}, { eu: 'gui', papel: 'equipe', desde, statusInsc: (s) => s, nomeEtapa: (e) => (e === 'msg1' ? 'Mensagem 1' : '') });
const t = (s) => eq.find((l) => l.titulo.includes(s));
ok(t('Curadoria de Ana')?.abrir === 'insc:i1' && !eq.some((l) => l.abrir === 'insc:i2'), 'curadoria só da própria pessoa, abre a ficha');
ok(t('Ficha da casa Casa Um')?.abrir === 'casa:c1', 'Ficha da casa avaliada');
ok(t('Enviou um contrato') && t('Conferiu um contrato')?.abrir === 'ct:k1', 'contrato enviado e conferido');
ok(t('Criou a data de 20/12')?.abrir === 'dp:d1' && t('Data de 20/12 cancelada'), 'data criada e cancelada');
ok(t('Importou uma campanha') && t('Marcou um dia de campanha')?.detalhe.includes('dia 20/11'), 'campanha importada e dia marcado');
ok(t('Publicou um material')?.detalhe === 'Guia · versão 2', 'material publicado');
ok(t('etapa do treinamento')?.detalhe === 'Casa Um · Mensagem 1', 'etapa do treinamento');
ok(t('Convidou Bia'), 'convite');
ok(t('Preparou os contratos do line-up (3 contratos)') && t('Cobrou a casa pela campanha')?.abrir === 'camp:cp', 'diário traduzido em frases');
ok(!eq.some((l) => /conferido/i.test(l.titulo) && !l.abrir), 'ação do diário já coberta pelo banco não repete');
ok(eq.every((l, i) => !i || eq[i - 1].em >= l.em), 'da mais recente para a mais antiga');

// Casa e artista: ficha, passos, contratos, disponibilidade, equipe
const casa = H.montar({
  casas: [{ id: 'c1', user_id: 'eu', criado_em: h(1), enviado_em: h(2), atualizado_em: h(2) }],
  chk: [{ user_id: 'eu', evento_id: 'p:d1', item: 'repasse', feito: true, atualizado_em: h(3) }, { user_id: 'outro', item: 'x', feito: true, atualizado_em: h(3) }],
  contr: [{ id: 'k', user_id: 'eu', titulo: 'Parceria', lido_fim_em: h(4), assinado_em: h(5) }],
  disp: [{ dia: '2026-12-01', situacao: 'disponivel', atualizado_por: 'eu', atualizado_em: h(6, '10:00') }, { dia: '2026-12-02', situacao: 'indisponivel', atualizado_por: 'eu', atualizado_em: h(6, '10:01') }],
  eqc: [{ nome: 'Caio', criado_por: 'eu', criado_em: h(7) }],
  sol: [{ user_id: 'eu', criado_em: h(8), status: 'pendente' }],
  campFeitos: [{ item_id: 'z', feito_por: 'eu', feito_em: h(9) }],
  arqs: [{ user_id: 'eu', evento_id: 'contrato_k', em: h(5, '13:00') }],
}, { eu: 'eu', papel: 'casa', desde, nomePasso: (k) => (k === 'repasse' ? 'Repasse' : '') });
const c = (s) => casa.find((l) => l.titulo.includes(s));
ok(c('Começou o cadastro') && c('Enviou o cadastro') && !c('Salvou o cadastro'), 'cadastro começado e enviado (salvar junto do envio não repete)');
ok(c('Marcou como feito: Repasse')?.ir === 'passos' && casa.filter((l) => l.tipo === 'passos' && l.titulo.startsWith('Marcou')).length === 1, 'passo marcado, só os da própria pessoa');
ok(c('Leu o contrato') && c('Assinou o contrato')?.ir === 'contratos_meus' && c('Enviou o contrato assinado'), 'contrato lido, assinado e arquivo enviado');
ok(c('Marcou 2 dias na disponibilidade')?.detalhe.startsWith('1 livre · 1 sem poder'), 'disponibilidade junta por dia');
ok(c('Adicionou uma pessoa à equipe')?.detalhe === 'Caio' && c('Pediu atualização') && c('Marcou um dia de campanha'), 'equipe, pedido de atualização e campanha');
ok(H.montar({ insc: [{ user_id: 'a', criado_em: '2026-01-01T00:00:00Z' }] }, { eu: 'a', papel: 'artista', desde }).length === 0, 'fora da janela não entra');
const art = H.montar({ insc: [{ user_id: 'a', criado_em: h(1), enviado_em: h(2), atualizado_em: h(3) }], dispA: [{ dia: '2026-12-01', situacao: 'disponivel', atualizado_em: h(4) }] }, { eu: 'a', papel: 'artista', desde });
ok(art.length === 4 && art.find((l) => l.tipo === 'disponibilidade')?.ir === 'disp_artista', 'artista: ficha começada, enviada, salva e disponibilidade');

// Agrupado por dia
const g = H.porDia([{ em: '2026-11-18T15:00:00' }, { em: '2026-11-18T10:00:00' }, { em: '2026-11-17T10:00:00' }]);
ok(g.length === 2 && g[0][0] === '2026-11-18' && g[0][1].length === 2, 'agrupa por dia, mais recente primeiro');
