// Abre a cópia de segurança cifrada (scripts/copia-seguranca.mjs) no SEU computador. Nunca rode isto no GitHub.
//   node scripts/abrir-copia.mjs gerar-chaves               cria copia-privada.pem (guarde, não envie a ninguém)
//                                                           e copia-publica.pem (vai na variável COPIA_CHAVE_PUBLICA)
//   node scripts/abrir-copia.mjs copia.cifrado copia-privada.pem [saida.json]
import { readFile, writeFile, access } from 'node:fs/promises';
import { generateKeyPairSync, privateDecrypt, createDecipheriv, constants } from 'node:crypto';
import { gunzipSync } from 'node:zlib';

const [a, b, c] = process.argv.slice(2);
if (a === 'gerar-chaves') {
  if (await access('copia-privada.pem').then(() => true, () => false)) { console.error('copia-privada.pem já existe aqui. Nada foi trocado.'); process.exit(1); }
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 4096, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
  await writeFile('copia-privada.pem', privateKey, { mode: 0o600 });
  await writeFile('copia-publica.pem', publicKey);
  console.log('Pronto: copia-privada.pem (guarde num lugar seguro; sem ela as cópias não abrem) e copia-publica.pem.');
  console.log('Cole o conteúdo de copia-publica.pem na variável COPIA_CHAVE_PUBLICA do repositório (Settings › Secrets and variables › Actions › Variables).');
  process.exit(0);
}
if (!a || !b) { console.error('Uso: node scripts/abrir-copia.mjs copia.cifrado copia-privada.pem [saida.json]   |   node scripts/abrir-copia.mjs gerar-chaves'); process.exit(1); }
const txt = (await readFile(a, 'utf8')).trim();
const partes = txt.replace(/^TQCOPIA1\./, '').split('.');
if (partes.length !== 3) { console.error('Arquivo não é uma cópia do Tranquilo.'); process.exit(1); }
const [kc, iv, corpo] = partes.map((p) => Buffer.from(p, 'base64'));
let k; try { k = privateDecrypt({ key: await readFile(b, 'utf8'), padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, kc); } catch { console.error('Esta chave privada não abre esta cópia (foi feita com outra chave pública).'); process.exit(1); }
const d = createDecipheriv('aes-256-gcm', k, iv); d.setAuthTag(corpo.subarray(-16));
const claro = Buffer.concat([d.update(corpo.subarray(0, -16)), d.final()]);
const json = txt.startsWith('TQCOPIA1.') ? gunzipSync(claro).toString('utf8') : claro.toString('utf8');
const copia = JSON.parse(json);
const saida = c || a.replace(/\.cifrado$/, '') + '.json';
await writeFile(saida, JSON.stringify(copia, null, 1), { mode: 0o600 });
console.log(`Cópia ${copia.ambiente} de ${copia.feita_em}: ${Object.keys(copia.tabelas || {}).length} tabelas, ${copia.auth_usuarios?.length ?? 0} contas → ${saida}`);
for (const [t, xs] of Object.entries(copia.tabelas || {})) console.log(`  ${t}: ${xs.length}`);
