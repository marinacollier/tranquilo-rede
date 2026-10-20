// Gera o site da Rede Tranquilo em dist/.
//
//   NOTION_TOKEN  (opcional) lê direto da API do Notion; sem ele, usa o retrato em data/.
//   SITE_SECRET   (obrigatório) segredo que deriva os códigos de acesso. Se mudar, todos os códigos mudam.
//   ACESSOS_SAIDA (opcional) caminho de um arquivo onde gravar a lista de códigos (nunca dentro de dist/).
//
// Cada perfil (adm, equipe, artista, casa) recebe um pacote criptografado com AES-256-GCM,
// cuja chave sai do próprio código de acesso (PBKDF2). Sem o código, o pacote é ilegível.
import { mkdir, readFile, rm, writeFile, cp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  eventosDoRetrato, baseDoRetrato, eventosDaApi, baseDaApi, titulosDaApi, textoDaPaginaApi, normalizar, chave,
} from './dados.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(RAIZ, 'dist');
const METODO_ID = 'ddd0e9fd76994af0b100dcc6e026f7bc';
const MINIMO_EVENTOS = 150;
const { subtle } = globalThis.crypto;
const enc = new TextEncoder();

const SEGREDO = process.env.SITE_SECRET;
if (!SEGREDO || SEGREDO.length < 24) {
  console.error('SITE_SECRET ausente ou curto demais (mínimo 24 caracteres). Nada foi gerado.');
  process.exit(1);
}
const hoje = process.env.HOJE || new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10); // horário de Brasília

// ---------- 1. dados ----------
let brutos, base, metodo, titulos = {}, fonte;
const token = process.env.NOTION_TOKEN;
if (token) {
  fonte = 'API do Notion';
  brutos = await eventosDaApi(token);
  base = await baseDaApi(token);
  const relacionados = [...new Set(brutos.flatMap((e) => [e.casa, e.praca, e.tipo]).filter(Boolean))];
  titulos = await titulosDaApi(token, relacionados);
  try { metodo = await textoDaPaginaApi(token, METODO_ID); } catch { metodo = null; }
} else {
  fonte = 'Retrato do Notion (data/)';
  brutos = await eventosDoRetrato();
  base = await baseDoRetrato();
}
metodo ||= await readFile(path.join(RAIZ, 'data/metodo.md'), 'utf8');

const eventos = normalizar(brutos, titulos, hoje);
if (eventos.length < MINIMO_EVENTOS) {
  console.error(`Só ${eventos.length} eventos lidos (mínimo ${MINIMO_EVENTOS}). Publicação abortada para não pôr dados quebrados no ar.`);
  process.exit(2);
}

// ---------- 2. códigos de acesso ----------
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
async function codigo(tipo, id) {
  const k = await subtle.importKey('raw', enc.encode(SEGREDO), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const b = new Uint8Array(await subtle.sign('HMAC', k, enc.encode(`${tipo}:${id}`)));
  let s = '';
  for (let i = 0; i < 12; i++) s += ALFABETO[b[i] % ALFABETO.length];
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
}
const normalizarCodigo = (c) => c.toUpperCase().replace(/[^A-Z0-9]/g, '');
const hex = (buf) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');
const b64 = (buf) => Buffer.from(buf).toString('base64');

async function cifrar(cod, objeto) {
  const norm = normalizarCodigo(cod);
  const arquivo = hex(await subtle.digest('SHA-256', enc.encode(`tranquilo-rede:${norm}`))).slice(0, 32);
  const sal = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const base = await subtle.importKey('raw', enc.encode(norm), 'PBKDF2', false, ['deriveKey']);
  const chaveAes = await subtle.deriveKey({ name: 'PBKDF2', salt: sal, iterations: 210000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  const dados = await subtle.encrypt({ name: 'AES-GCM', iv }, chaveAes, enc.encode(JSON.stringify(objeto)));
  return { arquivo, conteudo: JSON.stringify({ v: 1, s: b64(sal), i: b64(iv), c: b64(dados) }) };
}

// ---------- 3. recortes ----------
const compacto = (e) => ({
  id: e.id, d: e.data, n: e.nome, s: e.status, c: e.cidade, m: e.modelo, k: e.casaId, h: e.casa, a: e.artistas,
  p: e.publico, v: e.vendidos, x: e.cap, l: e.link, r: e.realizado, f: e.futuro, z: e.cancelado, cl: e.clima,
});

// Referência de público por praça: últimos 12 meses (ou histórico, quando há pouca base).
const umAnoAtras = new Date(new Date(hoje).getTime() - 365 * 864e5).toISOString().slice(0, 10);
const quantil = (arr, q) => {
  const a = [...arr].sort((x, y) => x - y);
  const p = (a.length - 1) * q, b = Math.floor(p);
  return Math.round(a[b] + (a[Math.min(b + 1, a.length - 1)] - a[b]) * (p - b));
};
const cidades = [...new Set(eventos.map((e) => e.cidade))].filter((c) => c !== 'Sem praça').sort();
const referencia = cidades.map((cidade) => {
  const comPublico = eventos.filter((e) => e.cidade === cidade && e.realizado && e.publico != null);
  const recentes = comPublico.filter((e) => e.data >= umAnoAtras);
  const usar = recentes.length >= 3 ? recentes : comPublico;
  return {
    cidade, janela: recentes.length >= 3 ? '12 meses' : 'histórico', noites: usar.length,
    p25: usar.length ? quantil(usar.map((e) => e.publico), 0.25) : null,
    mediana: usar.length ? quantil(usar.map((e) => e.publico), 0.5) : null,
    p75: usar.length ? quantil(usar.map((e) => e.publico), 0.75) : null,
    futuras: eventos.filter((e) => e.cidade === cidade && e.futuro).length,
  };
});

// Artistas: agrupa grafias diferentes (YOÚN / YOÙN) pela chave sem acento.
const artistas = new Map();
for (const e of eventos) {
  for (const nome of e.artistas) {
    const k = chave(nome);
    const a = artistas.get(k) || { chave: k, nome, eventos: [] };
    a.nome = nome; // fica a grafia mais recente
    a.eventos.push(e);
    artistas.set(k, a);
  }
}
const artistasAtivos = [...artistas.values()].filter((a) => a.eventos.some((e) => e.data >= '2026-01-01'));

const casas = new Map();
for (const e of eventos.filter((x) => x.casaId)) {
  const c = casas.get(e.casaId) || { id: e.casaId, nome: e.casa, cidade: e.cidade, eventos: [] };
  c.eventos.push(e);
  casas.set(e.casaId, c);
}

const geradoEm = new Date().toISOString();
const comum = { geradoEm, hoje, fonte, referencia };

// ---------- 4. pacotes ----------
await rm(DIST, { recursive: true, force: true });
await mkdir(path.join(DIST, 'b'), { recursive: true });

const acessos = [];
const pacotes = [];
async function pacote(tipo, id, nome, conteudo, extra = {}) {
  const cod = await codigo(tipo, id);
  acessos.push({ tipo, nome, codigo: cod, ...extra });
  pacotes.push([cod, { ...comum, perfil: tipo, nome, ...conteudo }]);
}

const todos = eventos.map(compacto);
const baseOk = base.map((b) => ({ id: b.id, q: b.pergunta, s: b.status }));

for (const a of artistasAtivos.sort((x, y) => x.nome.localeCompare(y.nome))) {
  await pacote('artista', a.chave, a.nome, { eventos: a.eventos.map(compacto) }, { cidades: [...new Set(a.eventos.map((e) => e.cidade))].join(', ') });
}
for (const c of [...casas.values()].sort((x, y) => x.nome.localeCompare(y.nome))) {
  const rede = eventos.filter((e) => e.realizado && e.publico != null && e.data >= umAnoAtras).map((e) => e.publico);
  await pacote('casa', c.id, c.nome, {
    cidade: c.cidade, eventos: c.eventos.map(compacto),
    rede: rede.length ? { noites: rede.length, mediana: quantil(rede, 0.5) } : null,
  }, { cidades: c.cidade });
}
await pacote('equipe', 'equipe', 'Equipe Tranquilo', { eventos: todos, base: baseOk, metodo });
// O pacote de adm leva a lista de todos os códigos, para distribuir.
const codAdm = await codigo('adm', 'adm');
pacotes.push([codAdm, {
  ...comum, perfil: 'adm', nome: 'Administração', eventos: todos, base: baseOk, metodo,
  acessos: [...acessos, { tipo: 'adm', nome: 'Administração', codigo: codAdm }],
}]);
acessos.push({ tipo: 'adm', nome: 'Administração', codigo: codAdm });

for (const [cod, obj] of pacotes) {
  const { arquivo, conteudo } = await cifrar(cod, obj);
  await writeFile(path.join(DIST, 'b', `${arquivo}.bin`), conteudo);
}

// ---------- 5. camada pública (sem números de público) ----------
const futuros = eventos.filter((e) => e.futuro);
const circulacao = artistasAtivos
  .map((a) => ({ nome: a.nome, futuras: a.eventos.filter((e) => e.futuro && e.modelo !== 'Descubra') }))
  .filter((a) => a.futuras.length)
  .map((a) => ({ nome: a.nome, cidades: [...new Set(a.futuras.map((e) => e.cidade))], proxima: a.futuras[0].data, datas: a.futuras.length }))
  .sort((x, y) => y.datas - x.datas);
const publico = {
  geradoEm, hoje, fonte,
  agenda: futuros.map((e) => ({ d: e.data, c: e.cidade, m: e.modelo, h: e.casa, a: e.artistas, l: e.link })),
  circulacao,
  cidades: cidades.map((c) => ({ cidade: c, noites: eventos.filter((e) => e.cidade === c && e.realizado).length, futuras: futuros.filter((e) => e.cidade === c).length })),
  casas: [...casas.values()].map((c) => ({ id: c.id, nome: c.nome, cidade: c.cidade })).sort((a, b) => a.cidade.localeCompare(b.cidade) || a.nome.localeCompare(b.nome)),
  totais: { noites: eventos.filter((e) => e.realizado).length, cidades: cidades.length, futuras: futuros.length },
};
await writeFile(path.join(DIST, 'public.json'), JSON.stringify(publico));
for (const arq of ['index.html', 'config.js', 'regras.js', 'tour.js', 'conta.js']) await cp(path.join(RAIZ, 'src', arq), path.join(DIST, arq));
await writeFile(path.join(DIST, '.nojekyll'), '');
await writeFile(path.join(DIST, 'robots.txt'), 'User-agent: *\nDisallow: /\n');

if (process.env.ACESSOS_SAIDA) {
  const linhas = acessos.map((a) => `${a.tipo}\t${a.codigo}\t${a.nome}${a.cidades ? `\t${a.cidades}` : ''}`);
  await writeFile(process.env.ACESSOS_SAIDA, linhas.join('\n') + '\n');
}

console.log(`Fonte: ${fonte}`);
console.log(`${eventos.length} eventos · ${eventos.filter((e) => e.realizado).length} realizados · ${futuros.length} futuros · ${cidades.length} cidades`);
console.log(`${pacotes.length} pacotes de acesso (${artistasAtivos.length} artistas, ${casas.size} casas, equipe, adm)`);
