// Cópia de segurança cifrada: gera as chaves, exporta com um banco simulado (sem rede) e abre de volta. Dados fictícios.
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
let falhas = 0; const ok = (c, m) => { console.log((c ? 'OK    ' : 'FALHA ') + m); if (!c) falhas++; };
const raiz = new URL('..', import.meta.url).pathname, dir = mkdtempSync(join(tmpdir(), 'tq-copia-'));
const abrir = (...a) => execFileSync(process.execPath, [join(raiz, 'scripts/abrir-copia.mjs'), ...a], { cwd: dir, encoding: 'utf8', stdio: 'pipe' });

abrir('gerar-chaves');
ok(existsSync(join(dir, 'copia-privada.pem')) && existsSync(join(dir, 'copia-publica.pem')), 'gera o par de chaves');
let recusou = false; try { abrir('gerar-chaves'); } catch { recusou = true; }
ok(recusou, 'não sobrescreve uma chave privada que já existe');

// Banco simulado: responde às consultas do exportador.
const simulador = join(dir, 'simula.mjs');
writeFileSync(simulador, `
globalThis.fetch = async (url, o) => { const q = JSON.parse(o.body).query; 
  let r = [];
  if (/information_schema.tables/.test(q)) r = [{ t: 'perfis' }, { t: 'config_interna' }, { t: 'datas_portal' }];
  else if (/from public."perfis"/.test(q)) r = [{ j: [{ id: 'u1', nome: 'Casa Fictícia', tipo: 'casa' }] }];
  else if (/from public."datas_portal"/.test(q)) r = [{ j: [{ id: 'd1', dia: '2026-12-20' }, { id: 'd2', dia: '2026-12-21' }] }];
  else if (/auth.users/.test(q)) r = [{ j: [{ id: 'u1', email: 'casa@ficticia.test' }] }];
  else if (/storage.objects/.test(q)) r = [{ j: [] }];
  else if (/obj_description/.test(q)) r = [{ d: null }];
  else if (/config_interna/.test(q)) throw new Error('não devia ler config_interna');
  return { ok: true, text: async () => JSON.stringify(r) }; };
`);
const saida = execFileSync(process.execPath, ['--import', pathToFileURL(simulador).href, join(raiz, 'scripts/copia-seguranca.mjs')], {
  cwd: dir, encoding: 'utf8',
  env: { ...process.env, SUPABASE_ACCESS_TOKEN: 'token-ficticio', COPIA_CHAVE_PUBLICA: readFileSync(join(dir, 'copia-publica.pem'), 'utf8'), AMBIENTE: 'prd', SAIDA: 'c.cifrado' },
});
const arq = readFileSync(join(dir, 'c.cifrado'), 'utf8');
ok(arq.startsWith('TQCOPIA1.'), 'grava o arquivo cifrado');
ok(!/Casa Fictícia|casa@ficticia|2026-12-20/.test(arq + saida), 'nem o arquivo nem o log trazem dados em claro');
ok(/perfis: 1/.test(saida) && /datas_portal: 2/.test(saida) && !/config_interna/.test(saida), 'o log mostra só tabelas e contagens, sem config_interna');

const aberto = abrir('c.cifrado', 'copia-privada.pem', 'c.json');
const c = JSON.parse(readFileSync(join(dir, 'c.json'), 'utf8'));
ok(c.ambiente === 'prd' && c.tabelas.perfis[0].nome === 'Casa Fictícia' && c.tabelas.datas_portal.length === 2, 'abre com a chave privada e traz as tabelas');
ok(c.auth_usuarios[0].email === 'casa@ficticia.test' && !('encrypted_password' in c.auth_usuarios[0]), 'contas sem o hash da senha');
ok(!('config_interna' in c.tabelas), 'config_interna fica de fora');
ok(/2 tabelas/.test(aberto), 'resumo ao abrir');

// Chave errada não abre.
let negou = false;
try { const outra = mkdtempSync(join(tmpdir(), 'tq-k-')); execFileSync(process.execPath, [join(raiz, 'scripts/abrir-copia.mjs'), 'gerar-chaves'], { cwd: outra }); abrir('c.cifrado', join(outra, 'copia-privada.pem'), 'x.json'); } catch { negou = true; }
ok(negou, 'outra chave privada não abre a cópia');

// Sem a chave pública configurada: não exporta e não falha a automação.
const sem = execFileSync(process.execPath, [join(raiz, 'scripts/copia-seguranca.mjs')], { cwd: dir, encoding: 'utf8', env: { ...process.env, COPIA_CHAVE_PUBLICA: '', SUPABASE_ACCESS_TOKEN: 'x' } });
ok(/Sem COPIA_CHAVE_PUBLICA/.test(sem), 'sem a chave pública, avisa e não exporta');

console.log(falhas ? `\n${falhas} FALHA(S)` : '\ncópia de segurança: tudo OK');
if (falhas) process.exit(1);
