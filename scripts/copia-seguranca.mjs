// Cópia de segurança do banco (pedido da Marina, 21/11/2026). Roda no GitHub Actions (workflow copia-seguranca).
// Exporta todas as tabelas do schema public e, de auth.users, só id, e-mail e datas (nunca o hash da senha).
// Fica de fora: config_interna (chaves internas do sistema) e os arquivos do Storage (aqui sai só a lista deles).
// O resultado sai CIFRADO com a chave pública COPIA_CHAVE_PUBLICA (PEM, ou PEM em base64): AES-256-GCM com a chave
// embrulhada em RSA-OAEP-SHA256, o mesmo formato do limpar-testes. Só quem tem a chave privada abre
// (node scripts/abrir-copia.mjs). O log é público: ele mostra só nomes de tabelas e contagens.
//   AMBIENTE=prd (padrão) ou teste · SAIDA=arquivo .cifrado (padrão copia.cifrado)
import { readFile, writeFile } from 'node:fs/promises';
import { publicEncrypt, randomBytes, createCipheriv, createHash, constants } from 'node:crypto';
import { gzipSync } from 'node:zlib';

const tok = process.env.SUPABASE_ACCESS_TOKEN;
const AMB = process.env.AMBIENTE === 'teste' ? 'teste' : 'prd';
const SAIDA = process.env.SAIDA || 'copia.cifrado';
const bruta = String(process.env.COPIA_CHAVE_PUBLICA || '').trim();
const pem = /BEGIN PUBLIC KEY/.test(bruta) ? bruta : Buffer.from(bruta, 'base64').toString('utf8');
if (!/BEGIN PUBLIC KEY/.test(pem)) { console.log('::warning::Sem COPIA_CHAVE_PUBLICA (variável do repositório): nada foi exportado. Veja docs/COPIA_SEGURANCA.md.'); process.exit(0); }
if (!tok) { console.log('::warning::Sem SUPABASE_ACCESS_TOKEN: nada foi exportado.'); process.exit(0); }

const cfg = await readFile(new URL(`../src/${AMB === 'prd' ? 'config.prd.js' : 'config.js'}`, import.meta.url), 'utf8');
const ref = cfg.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
const limpo = (s) => String(s ?? '').replace(/[^\s@"']+@[^\s@"']+/g, '[e-mail]').slice(0, 300);
async function sql(q) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, { method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q }) });
  const t = await r.text();
  if (!r.ok) throw new Error(`SQL HTTP ${r.status}: ${limpo(t)}`);
  return JSON.parse(t);
}
const FORA = new Set(['config_interna']);
const tabelas = (await sql(`select table_name t from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by 1`)).map((x) => x.t).filter((t) => !FORA.has(t));
const copia = { ambiente: AMB, feita_em: new Date().toISOString(), versao_schema: null, tabelas: {}, auth_usuarios: [], storage: [] };
let falhou = 0;
for (const t of tabelas) {
  try {
    copia.tabelas[t] = (await sql(`select coalesce(json_agg(x), '[]'::json) j from public."${t.replace(/"/g, '')}" x`))[0].j;
    console.log(`OK    ${t}: ${copia.tabelas[t].length}`);
  } catch (e) { falhou++; console.log(`FALHA ${t}: ${e.message}`); }
}
try {
  copia.auth_usuarios = (await sql(`select coalesce(json_agg(x), '[]'::json) j from (select id, email, created_at, last_sign_in_at, email_confirmed_at from auth.users order by created_at) x`))[0].j;
  console.log(`OK    auth.users (sem senha): ${copia.auth_usuarios.length}`);
} catch (e) { falhou++; console.log(`FALHA auth.users: ${e.message}`); }
try {
  copia.storage = (await sql(`select coalesce(json_agg(x), '[]'::json) j from (select bucket_id, name, created_at, metadata->>'size' tamanho from storage.objects order by bucket_id, name) x`))[0].j;
  console.log(`OK    lista do Storage (só nomes, sem os arquivos): ${copia.storage.length}`);
} catch (e) { console.log(`--    lista do Storage: ${e.message}`); }
try { copia.versao_schema = (await sql(`select obj_description('public.perfis'::regclass) d`))[0]?.d || null; } catch {}

const claro = gzipSync(Buffer.from(JSON.stringify(copia)));
const k = randomBytes(32), iv = randomBytes(12), c = createCipheriv('aes-256-gcm', k, iv);
const corpo = Buffer.concat([c.update(claro), c.final(), c.getAuthTag()]);
const chave = publicEncrypt({ key: pem, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, k);
await writeFile(SAIDA, 'TQCOPIA1.' + [chave, iv, corpo].map((b) => b.toString('base64')).join('.') + '\n');
const digital = createHash('sha256').update(pem).digest('hex').slice(0, 16);
console.log(`OK    cópia ${AMB} cifrada: ${Object.keys(copia.tabelas).length} tabelas, ${(corpo.length / 1024).toFixed(0)} KB, chave pública ${digital}`);
if (falhou) { console.log(`::error::${falhou} parte(s) falharam; a cópia saiu incompleta.`); process.exitCode = 1; }
