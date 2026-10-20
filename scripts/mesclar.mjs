// Mescla um retrato parcial (data/delta.psv) no retrato completo (data/eventos.psv).
// Uso: node scripts/mesclar.mjs AAAA-MM-DD
// Todas as datas a partir do corte passam a ser exatamente as do delta (inclui exclusões);
// linhas do delta com data anterior ao corte substituem a linha de mesmo id.
import { readFile, writeFile } from 'node:fs/promises';
import { eventosDoRetrato, CAMPOS_EVENTO } from './dados.mjs';

const corte = process.argv[2];
if (!/^\d{4}-\d{2}-\d{2}$/.test(corte || '')) { console.error('Informe a data de corte: AAAA-MM-DD'); process.exit(1); }
const atual = await eventosDoRetrato('data/eventos.psv');
const delta = await eventosDoRetrato('data/delta.psv');
if (delta.length < 10) { console.error(`Delta com só ${delta.length} linhas. Nada foi alterado.`); process.exit(2); }
const novos = new Map(delta.map((e) => [e.id, e]));
const mantidos = atual.filter((e) => e.data < corte && !novos.has(e.id));
const final = [...mantidos, ...delta].sort((a, b) => a.data.localeCompare(b.data) || a.id.localeCompare(b.id));
if (final.length < atual.length * 0.8) { console.error(`Resultado encolheria de ${atual.length} para ${final.length} eventos. Nada foi alterado.`); process.exit(3); }
const cab = (await readFile('data/eventos.psv', 'utf8')).split('\n').filter((l) => l.startsWith('#'));
const campo = (e, c) => ({ geral: e.geral, antecipada: e.antecipada, porta: e.porta, vip: e.vip, cap: e.cap }[c] ?? e[c] ?? '');
const linhas = final.map((e) => CAMPOS_EVENTO.map((c) => String(campo(e, c)).replace(/\|/g, '/').replace(/\n/g, ' ')).join('|'));
await writeFile('data/eventos.psv', [...cab, ...linhas].join('\n') + '\n');
console.log(`Retrato: ${atual.length} → ${final.length} eventos (${delta.length} lidos agora, corte ${corte}).`);
