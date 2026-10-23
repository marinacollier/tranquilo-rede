// Leitura da campanha (src/campanha.js): página HTML do Bruno e arquivo de dados JSON dão o mesmo resultado.
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import '../src/campanha.js';
const { ler } = globalThis.TQCampanha;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALHA') + ' ' + m); if (!c) process.exitCode = 1; };
const camp = JSON.parse(readFileSync(new URL('./fixtures-campanha-rooftap.json', import.meta.url), 'utf8'));
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

// Página no formato da página publicada do Bruno, montada a partir da campanha real do Rooftap.
const html = `<html><body><h1>${esc(camp.titulo)}</h1><div class="dias">` + camp.itens.map((i) => `
  <label class="dia"><input type="checkbox" data-k="${i.chave}"><span class="quando">${i.rotulo}</span><div class="acoes">${i.acoes.map((a) => `<div class="acao"><span class="canal c-${a.canal.length}">${esc(a.canal)}</span> <span class="qual">${esc(a.show)}</span><p class="faz">${esc(a.texto)}</p>${a.links.map((l) => `<a href="${l.url}" target="_blank">${esc(l.rotulo)}</a>`).join(' ')}</div>`).join('\n')}</div></label>`).join('') + `</div></body></html>`;
const h = ler(html, { ano: 2026 });
ok(h.itens.length === 10 && h.itens.reduce((n, i) => n + i.acoes.length, 0) === 24, 'página HTML: 10 dias e 24 ações');
ok(JSON.stringify(h.itens.map(({ chave, dia, rotulo, acoes }) => ({ chave, dia, rotulo, acoes }))) === JSON.stringify(camp.itens), 'página HTML: dias, textos e links idênticos aos da campanha real');
ok(h.titulo === camp.titulo, 'página HTML: título');

// Arquivo de dados com a lista de ações solta (dia, canal, modelo do Canva), como o Bruno descreveu.
const soltas = { titulo: 'Campanha teste', casa: 'Casa Nova', acoes: [
  { dia: '20/10', canal: 'Feed', texto: 'Flyer', canva: 'https://canva.link/a', link: 'https://trnql.app/x' },
  { dia: '2026-10-20', canal: 'Stories', texto: 'Story', modelo: 'https://canva.link/b' },
  { dia: '22/10/2026', canal: 'WhatsApp', texto: 'Grupo', links: ['https://trnql.app/y', 'javascript:alert(1)'] },
  { dia: '', canal: 'Sem dia', texto: 'ignorada' },
] };
const d = ler(JSON.stringify(soltas), { ano: 2026 });
ok(d.itens.length === 2 && d.itens[0].dia === '2026-10-20' && d.itens[0].acoes.length === 2, 'dados JSON: ações agrupadas por dia (formatos de data diferentes)');
ok(d.itens[0].rotulo === 'ter 20/10' && d.itens[0].chave === 'd1020', 'dados JSON: rótulo e chave gerados');
ok(d.itens[0].acoes[0].links.map((l) => l.rotulo).join() === 'Canva,link' && d.itens[0].acoes[1].links[0].rotulo === 'Canva', 'dados JSON: modelo do Canva e link rastreado viram botões');
ok(d.itens[1].acoes[0].links.length === 1, 'dados JSON: link que não é https é descartado');
ok(d.casa === 'Casa Nova' && d.titulo === 'Campanha teste', 'dados JSON: casa e título do arquivo');
ok(JSON.stringify(ler(JSON.stringify(camp)).itens.map(({ chave, dia, rotulo, acoes }) => ({ chave, dia, rotulo, acoes }))) === JSON.stringify(camp.itens), 'dados JSON no formato do Hub: lido sem perda');

const erro = (t) => { try { ler(t); return ''; } catch (e) { return e.message; } };
ok(/Nenhum dia/.test(erro('<html><h1>x</h1></html>')), 'página sem dias é recusada');
ok(/Nenhum dia/.test(erro('{"acoes": []}')), 'arquivo sem ações é recusado');
ok(/não abriu/.test(erro('{"acoes": [')), 'JSON quebrado é recusado com mensagem clara');

// O script de linha de comando usa a mesma leitura.
const dir = mkdtempSync(path.join(tmpdir(), 'camp-')); writeFileSync(path.join(dir, 'p.html'), html);
const saida = JSON.parse(execFileSync('node', [new URL('../scripts/importar-campanha.mjs', import.meta.url).pathname, path.join(dir, 'p.html'), '--casa', 'Rooftap', '--slug', 'rooftap-nov26', '--ano', '2026', '--fonte', camp.fonte_url], { encoding: 'utf8' }));
ok(JSON.stringify(saida) === JSON.stringify(camp), 'script gera exatamente o JSON da carga do Rooftap');
