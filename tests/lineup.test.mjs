// Line-up da data com vários artistas (pedido da Marina, 18/11/2026): regras do site (src/regras.js e src/contrato.js).
import { readFileSync } from 'node:fs'; import vm from 'node:vm';
const ctx = {}; vm.createContext(ctx);
vm.runInContext(readFileSync(new URL('../src/regras.js', import.meta.url), 'utf8'), ctx);
vm.runInContext(readFileSync(new URL('../src/contrato.js', import.meta.url), 'utf8') + ';globalThis.T=TQContrato;', ctx);
const R = ctx.TQRegras, T = ctx.T;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALHA') + ' ' + m); if (!c) process.exitCode = 1; };

// Line-up editável: sem repetir, mínimo 1, ordem da lista
const n = R.normalizarLineup([{ nome: ' Ana ' }, { nome: '' }, { nome: 'Bia', user_id: 'b' }, { nome: 'ana' }, { nome: 'Outra', user_id: 'b' }, { nome: 'Caio' }]);
ok(n.lista.map((a) => `${a.ordem}.${a.nome}`).join() === '1.Ana,2.Bia,3.Caio', 'linhas vazias saem, a ordem é a da lista');
ok(n.repetidos.join() === 'ana,Outra' && /duas vezes/.test(n.erro), 'mesmo nome ou mesma conta duas vezes é apontado');
ok(R.normalizarLineup([{ nome: '' }]).erro === 'pelo menos um artista', 'line-up vazio não vale');
ok(R.normalizarLineup(Array.from({ length: 13 }, (_, i) => ({ nome: 'A' + i }))).erro === 'no máximo 12 artistas', 'no máximo 12 artistas');
ok(R.LINEUP_PADRAO === 3, 'o Descubra começa com 3 linhas');
ok(R.lineupRemovidos([{ nome: 'Ana', user_id: 'a' }, { nome: 'Bia', user_id: 'b' }, { nome: 'Sem conta' }], [{ nome: 'Ana (novo nome)', user_id: 'a' }]).map((a) => a.nome).join() === 'Bia,Sem conta', 'quem saiu do line-up: pela conta ou, sem conta, pelo nome');

// Data com 3 artistas e a casa
const data = { id: 'd1', dia: '2026-12-20', produto: 'Descubra', casa_nome: 'Casa Um', cidade: 'Recife/PE',
  artistas: [{ nome: 'Caio', user_id: 'c', ordem: 3 }, { nome: 'Ana', user_id: 'a', ordem: 1, whatsapp: '81 99999-0000' }, { nome: 'Bia', user_id: 'b', ordem: 2 }, { nome: 'Duda', ordem: 4 }] };
const campos = [{ chave: 'cpf', rotulo: 'CPF' }];
const contr = [
  { id: '1', user_id: 'a', evento_id: 'p:d1', status: 'enviado', campos, dados: {} },
  { id: '2', user_id: 'b', evento_id: 'p:d1', status: 'enviado', campos, dados: { cpf: '1' } },
  { id: '0', user_id: 'c', evento_id: 'p:d1', status: 'cancelado', campos, dados: {} },
  { id: '3', user_id: 'casa', evento_id: 'p:d1', status: 'enviado', campos: [], dados: {}, conferido_em: '2026-11-18' },
  { id: '4', user_id: 'a', evento_id: 'p:outra', status: 'assinado', campos, dados: {} },
];
const L = T.lineup(data, contr, { casaUserId: 'casa', arquivoNovo: (c) => c.id === '2' });
ok(L.artistas.map((l) => l.nome).join() === 'Ana,Bia,Caio,Duda', 'line-up na ordem da noite');
ok(L.artistas.map((l) => l.etapa).join() === 'aguardando_dados,recebido,sem,sem_conta', 'situação de cada artista: aguardando dados, assinado recebido, sem contrato (o cancelado não conta), sem conta');
ok(L.casa.etapa === 'conferido', 'o contrato da casa aparece no mesmo quadro');
ok(L.faltam.join() === 'Ana,Bia,Caio,Duda' && L.aPreparar.map((l) => l.nome).join() === 'Caio', 'quem falta; "Preparar contratos do line-up" gera só para quem não tem (com conta)');
ok(T.etapa({ status: 'enviado', campos, dados: {}, devolvido_em: 'x' }) === 'devolvido' && T.etapa({ status: 'assinado' }) === 'assinado' && T.etapa({ status: 'enviado', campos, dados: { cpf: '1' } }) === 'enviado', 'etapas: devolvido, assinado no portal, enviado');
ok(Object.keys(T.ETAPAS).every((k) => T.ETAPAS[k][1]), 'cada etapa tem rótulo para a tela');

// Cada contrato com os dados da ficha daquele artista; nome completo, CPF/CNPJ e Pix ficam para o artista.
const mod = T.campos('Artista {{artista}}, [PREENCHER NOME COMPLETO], CPF/CNPJ [PREENCHER CPF/CNPJ], WhatsApp [PREENCHER WHATSAPP], cidade de origem [PREENCHER CIDADE DE ORIGEM], Pix [PREENCHER CHAVE PIX].');
const fichaAna = T.doCadastro(mod.campos, 'artista', { nome_artistico: 'Ana', whatsapp: '81 99999-0000', cidade_base: 'Recife', estado: 'PE' }, {});
const fichaBia = T.doCadastro(mod.campos, 'artista', {}, { nome: 'Bia', whatsapp: '11 98888-0000' });
ok(fichaAna.whatsapp === '81 99999-0000' && fichaAna.cidade_de_origem === 'Recife/PE', 'contrato da Ana: WhatsApp e cidade da ficha dela');
ok(fichaBia.whatsapp === '11 98888-0000', 'sem o dado na inscrição, vale o da conta (WhatsApp)');
ok(!fichaAna.nome_completo && !fichaAna.cpf_cnpj && !fichaAna.chave_pix, 'nome completo, CPF/CNPJ e Pix continuam sendo pedidos ao artista');

// Passos por artista: cada um com o próprio checklist
const chk = [{ user_id: 'a', evento_id: 'p:d1', item: 'formacao', feito: true }, { user_id: 'b', evento_id: 'p:d1', item: 'rider', feito: true }, { user_id: 'b', evento_id: 'p:outra', item: 'som', feito: true }];
const P = R.passosDoLineup(data, chk, '2026-11-18', (u) => u === 'b');
const pa = P.find((p) => p.user_id === 'a'), pb = P.find((p) => p.user_id === 'b'), pc = P.find((p) => p.user_id === 'c');
ok(P.map((p) => p.nome).join() === 'Ana,Bia,Caio,Duda', 'passos de cada artista do line-up');
ok(pa.feitos === 1 && pa.passos.find((p) => p.chave === 'formacao').feito && !pa.passos.find((p) => p.chave === 'rider').feito, 'Ana vê os passos dela (formação feita)');
ok(pb.feitos === 2 && pb.passos.find((p) => p.chave === 'contrato').feito && !pb.passos.find((p) => p.chave === 'som').feito, 'Bia: contrato recebido conta como feito; passo de outra data não entra');
ok(pc.feitos === 0 && pc.total === pa.total && pc.total === R.passosDaData('artista', '2026-12-20', {}, '2026-11-18', 'Descubra').length, 'Caio: todos os passos da data, nenhum feito');
ok(P.find((p) => p.nome === 'Duda').total === 0, 'artista sem conta não tem passos no portal');

// Formatos (pedido da Marina, 18/11/2026): todos os tipos do Notion, cada um com a sua regra.
ok(R.NOMES_FORMATO.join() === 'Descubra,Apresenta,Turnê,Noite Tranquilo', 'os 4 formatos do Notion (Descubra, Apresenta, Turnê, Noite Tranquilo)');
ok(R.vagasFormato('Descubra').minimo === 3 && R.vagasFormato('Apresenta').minimo === 1 && R.vagasFormato('Apresenta').sugerido === 2 && R.FORMATOS['Turnê'].mesmoArtista, 'Descubra 3 artistas; Apresenta 1 principal e abertura opcional; Turnê é o mesmo artista em várias cidades');
ok(R.produtoBase('Turnê') === 'Apresenta' && R.produtoBase('Noite Tranquilo') === 'Descubra' && R.produtoBase('Tranquilo Apresenta — Recife') === 'Apresenta' && R.produtoBase('Clássico') === null, 'cada formato usa o produto de base (cronograma, campanha e contrato)');
ok(R.passosDaData('artista', '2026-12-20', {}, '2026-11-18', 'Turnê').some((p) => p.chave === 'camp_reel') && !R.passosDaData('artista', '2026-12-20', {}, '2026-11-18', 'Noite Tranquilo').some((p) => p.chave === 'camp_reel'), 'Turnê segue a campanha do Apresenta; Noite Tranquilo, a do Descubra');
ok(R.topaFormato('descubra', 'Descubra') === 2 && R.topaFormato('nao_sei', 'Descubra') === 1 && R.topaFormato('', 'Descubra') === 1 && R.topaFormato('apresenta', 'Descubra') === 0 && R.topaFormato('turne', 'Apresenta') === 1 && R.topaFormato('turne', 'Turnê') === 2, 'quem topa cada formato (formato_interesse; "ainda não sei" e sem resposta também)');
ok(!!R.FORMATOS['Noite Tranquilo'].validar && !R.FORMATOS.Descubra.validar, 'o que o Método não descreve fica "a validar"');
