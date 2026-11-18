// Pré-fichas pelo Notion (18/11/2026): casas e artistas reais com o que já sabemos e o que falta, mesmo sem conta.
import { readFileSync } from 'node:fs';
import '../src/prefichas.js';
import '../src/propostas.js';
const PF = globalThis.TQPreFicha, PP = globalThis.TQPropostas;
let falhas = 0; const ok = (c, m) => { console.log((c ? 'OK    ' : 'FALHA ') + m); if (!c) falhas++; };
const B = JSON.parse(readFileSync(new URL('../src/bases.json', import.meta.url), 'utf8'));
const hoje = '2026-11-18';
const eventos = [
  { id: 'e1', d: '2026-10-02', s: 'Realizado', c: 'Campinas', k: 'c-1', h: 'Casa Um', a: ['Ana', 'Bia'], r: true, p: 80 },
  { id: 'e2', d: '2026-10-09', s: 'Realizado', c: 'Campinas', k: 'c-1', h: 'Casa Um', a: ['Ana'], r: true },
  { id: 'e3', d: '2026-11-27', s: 'Vendas abertas', c: 'Campinas', k: 'c-1', h: 'Casa Um', a: ['Bia', 'Caio'], l: 'https://ingresse.com/x', m: 'Descubra' },
  { id: 'e4', d: '2026-11-28', s: 'Cancelado', z: true, c: 'Campinas', k: 'c-1', h: 'Casa Um', a: ['Dani'] },
  { id: 'e5', d: '2026-12-01', s: 'Data confirmada', c: 'Recife', k: 'c-2', h: 'Casa em Recife · c2', a: [] },
];
const notion = [{ id: 'c-1', n: 'Casa Um', cid: 'Campinas', uf: 'SP', cp: 150, cs: 90, men: 'Permite com responsável legal', ig: 'https://www.instagram.com/casaum/', site: 'https://casaum.com.br', rider: null }];
const casas = PF.casas({ notion, bases: [], eventos, enderecos: { 'c-1': 'Rua A, 1' }, fichas: { 'c2': { nome: 'Bar Dois', endereco: 'Rua B, 2' } }, hoje });
const um = casas.find((c) => c.id === 'c1'), dois = casas.find((c) => c.id === 'c2');
ok(um.valores.nome === 'Casa Um' && um.valores.cidade_uf === 'Campinas/SP' && um.valores.capacidade === 150 && um.valores.capacidade_sentado === 90, 'casa: nome, cidade/UF e capacidades do Notion');
ok(um.valores.instagram === '@casaum' && um.valores.site === 'https://casaum.com.br' && um.valores.menores === 'responsavel' && um.valores.endereco === 'Rua A, 1', 'casa: Instagram (@), site, menores (opção da Ficha) e endereço');
ok(um.realizadas.length === 2 && um.proximas.length === 1 && um.proximas[0].id === 'e3' && um.ultima === '2026-10-09' && um.noites === 2, 'casa: noites do histórico, próximas datas (sem as canceladas) e a última noite');
ok(um.diasFortes.includes(5), 'casa: dias em que costuma receber (sexta)');
ok(dois && dois.nome === 'Bar Dois' && dois.valores.nome === 'Bar Dois' && dois.valores.endereco === 'Rua B, 2', 'casa com nome genérico no evento ganha o nome da ficha do Notion');
const marc = PF.marcar(um, [['nome', 'Nome'], ['cnpj', 'CNPJ']]);
ok(marc[0].fonte === 'notion' && marc[1].fonte === 'falta', 'cada campo marcado "do Notion" ou "falta"');
const camposProp = PF.campos(um, PP.todos('casa').map(([c]) => c));
ok(camposProp.nome && camposProp.site && camposProp.menores && camposProp.endereco && !('dias' in camposProp), 'proposta leva o que já sabemos e que a Ficha aceita');
ok(Object.keys(camposProp).every((c) => /^[a-z_0-9]+$/.test(c)), 'campos da proposta com nomes aceitos pelo banco');
const arts = PF.artistas({ notion: [], bases: B.artistas.slice(0, 50), fila: B.fila.slice(0, 20), eventos, hoje });
const bia = arts.find((a) => a.nome === 'Bia');
ok(bia && bia.realizadas.length === 1 && bia.proximas.length === 1 && bia.valores.nome_artistico === 'Bia' && bia.valores.cidades_interesse.includes('Campinas'), 'artista do line-up: noites, próximas datas e cidade onde já tocou');
ok(bia.valores.formato_interesse === 'descubra', 'artista: formato pelo que já tocou');
ok(!arts.some((a) => a.nome === 'Dani'), 'artista só de data cancelada não entra');
const real = PF.casas({ notion: [], bases: B.casas, eventos: [], hoje });
ok(real.length === B.casas.length && real.some((c) => c.valores.site) && real.every((c) => c.valores.nome || PF.generica(c.nome)), `todas as ${B.casas.length} casas reais das bases viram pré-ficha`);
const sug = PF.sugestoes(B, new Set(), hoje, '2026-12-18');
ok(Array.isArray(sug) && sug.every((x) => x.casa && x.dia >= hoje && x.artistas.length), `sugestões por histórico (${sug.length})`);
if (falhas) process.exit(1);
