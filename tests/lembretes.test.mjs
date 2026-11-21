// Lembretes por e-mail incluem as datas criadas no portal (datas_portal, v21), além das do Notion. Dados fictícios.
import { alvosDaData, eventoDoPortal, montarAgenda } from '../supabase/functions/lembretes/agenda.js';
import { readFileSync } from 'node:fs';
let falhas = 0; const ok = (c, m) => { console.log((c ? 'OK    ' : 'FALHA ') + m); if (!c) falhas++; };

const perfis = [
  { id: 'a1', tipo: 'artista', email: 'a1@x.test', nome: 'Ana', vinculo_nome: null },          // ligada só pela data do portal
  { id: 'a2', tipo: 'artista', email: 'a2@x.test', nome: 'Bia', vinculo_nome: 'Bia Som' },     // ligada pelo nome
  { id: 'a3', tipo: 'artista', email: 'a3@x.test', nome: 'Cid', vinculo_nome: 'Cid' },         // em outra data
  { id: 'c1', tipo: 'casa', email: 'c1@x.test', nome: 'Dona', vinculo_nome: null },            // dona da Ficha, sem vínculo por nome
  { id: 'c2', tipo: 'casa', email: 'c2@x.test', nome: 'Som', vinculo_nome: 'Bar Azul', funcoes: ['som'] },
  { id: 'c3', tipo: 'casa', email: 'c3@x.test', nome: 'Outra', vinculo_nome: 'Bar Verde' },
  { id: 'x', tipo: 'artista', email: '', nome: 'Sem e-mail', vinculo_nome: 'Bia Som' },
];
const dp = { id: 'u-1', dia: '2026-12-20', casa_id: 'f1', casa_nome: 'Bar Azul', cidade: 'Recife/PE', status: 'confirmada', criado_em: '2026-11-21T10:00:00Z',
  artistas: [{ nome: 'Bia Som', ordem: 2 }, { nome: 'Ana', user_id: 'a1', ordem: 1 }] };

const e = eventoDoPortal(dp);
ok(e.id === 'p:u-1' && e.d === '2026-12-20' && e.c === 'Recife' && e.h === 'Bar Azul', 'data do portal vira evento com id p:<uuid>, cidade sem UF e a casa');
ok(e.a.join() === 'Ana,Bia Som' && e.au.join() === 'a1', 'line-up na ordem de apresentação, com a conta ligada');

const alvos = alvosDaData(e, perfis, { f1: 'c1' }).map(([p, t]) => `${t}:${p.id}`).sort();
ok(alvos.join() === 'artista:a1,artista:a2,casa:c1,casa:c2', `avisa a artista ligada, a artista pelo nome, a dona da Ficha e a equipe da casa (${alvos.join()})`);
ok(!alvos.includes('artista:x'), 'conta sem e-mail não entra');
ok(!alvos.some((a) => /a3|c3/.test(a)), 'contas de outras datas e casas não entram');

const dup = alvosDaData({ ...e, a: ['Ana', 'Ana'], au: ['a1', 'a1'] }, [{ ...perfis[0], vinculo_nome: 'Ana' }], {});
ok(dup.length === 1, 'a mesma conta não recebe dois avisos da mesma data');

const notion = [
  { id: 'n1', d: '2026-12-20', c: 'Recife', h: 'Bar Azul', a: ['Bia Som'] },     // mesma noite da data do portal
  { id: 'n2', d: '2026-12-21', c: 'Olinda', h: 'Bar Verde', a: ['Cid'] },
  { d: '2026-12-22', c: 'Sem id', h: 'X', a: [] },
];
const ag = montarAgenda(notion, [dp, { ...dp, id: 'u-2', dia: '2026-12-23', status: 'cancelada' }]);
ok(ag.length === 2 && ag.some((x) => x.id === 'n2') && ag.some((x) => x.id === 'p:u-1'), 'agenda junta Notion e portal, sem a data cancelada nem a sem id');
ok(!ag.some((x) => x.id === 'n1'), 'mesma noite no Notion e no portal sai um aviso só');
ok(ag.find((x) => x.id === 'p:u-1').ids.join() === 'p:u-1,n1', 'o passo marcado em qualquer um dos dois ids conta como feito');

const ts = readFileSync(new URL('../supabase/functions/lembretes/index.ts', import.meta.url), 'utf8');
ok(/from\("datas_portal"\)/.test(ts) && /eq\("status", "confirmada"\)/.test(ts), 'a função lê as datas do portal confirmadas');
ok(/montarAgenda\(pub\.agenda/.test(ts) && /alvosDaData\(e,/.test(ts), 'a função usa a mesma montagem de agenda testada aqui');
ok(/ids\.some\(/.test(ts), 'a função confere o feito pelos dois ids');
const conta = readFileSync(new URL('../src/conta.js', import.meta.url), 'utf8');
ok(conta.includes('id: "p:" + x.id'), 'o painel usa o mesmo id p:<uuid> para a data do portal');

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nlembretes: tudo OK');
if (falhas) process.exit(1);
