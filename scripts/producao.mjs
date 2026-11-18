// Ambiente de produção (pedido da Marina, 18/11/2026): um projeto Supabase separado, só com contas reais.
// Só roda à mão (workflow producao). Cria o projeto "tranquilo-rede-prd" na mesma organização e região do de teste,
// se ainda não existir, espera ficar pronto e copia do de teste a configuração de e-mail (SMTP) e de login.
// Imprime a URL e a chave publicável (são públicas por natureza) para o src/config.prd.js. Senhas nunca vão para o log.
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';

const tok = process.env.SUPABASE_ACCESS_TOKEN;
if (!tok) { console.error('::error::Falta SUPABASE_ACCESS_TOKEN.'); process.exit(1); }
const H = { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' };
const api = async (caminho, opt = {}) => { const r = await fetch(`https://api.supabase.com/v1${caminho}`, { headers: H, ...opt }); const t = await r.text(); if (!r.ok) throw new Error(`${caminho}: HTTP ${r.status} ${t.replace(/[^\s@"']+@[^\s@"']+/g, '[e-mail]').slice(0, 300)}`); return t ? JSON.parse(t) : null; };
const cfg = await readFile(new URL('../src/config.js', import.meta.url), 'utf8');
const refTeste = cfg.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
const NOME = 'tranquilo-rede-prd';
const teste = await api(`/projects/${refTeste}`);
let prd = (await api('/projects')).find((p) => p.name === NOME);
if (!prd) {
  const senha = randomBytes(24).toString('base64url');
  console.log(`::add-mask::${senha}`);
  prd = await api('/projects', { method: 'POST', body: JSON.stringify({ name: NOME, organization_id: teste.organization_id, region: teste.region, db_pass: senha, plan: 'free' }) });
  console.log(`OK    projeto ${NOME} criado na região ${teste.region}`);
} else console.log(`OK    projeto ${NOME} já existia`);
const ref = prd.id || prd.ref;
for (let i = 0; i < 60; i++) { const p = await api(`/projects/${ref}`); if (p.status === 'ACTIVE_HEALTHY') break; if (i === 59) throw new Error('projeto não ficou pronto em 10 min'); await new Promise((ok) => setTimeout(ok, 10000)); }
console.log('OK    projeto pronto');
// Configuração de login e e-mail: a mesma do de teste (SMTP incluído quando a API devolve), com o endereço de produção.
const a = await api(`/projects/${refTeste}/config/auth`);
const copia = Object.fromEntries(Object.entries(a).filter(([k, v]) => v != null && !/^(id|created_at|updated_at)$/.test(k) && !/password|secret|_pass$|hook_.*_secrets/.test(k) && !(typeof v === 'string' && /^\*+$/.test(v))));
copia.site_url = 'https://marinacollier.github.io/tranquilo-rede/prd/';
await api(`/projects/${ref}/config/auth`, { method: 'PATCH', body: JSON.stringify(copia) }).then(() => console.log(`OK    login e e-mail copiados do de teste (${Object.keys(copia).length} itens)`)).catch((e) => console.log(`AVISO configuração de login não copiada inteira: ${e.message.slice(0, 200)}`));
console.log(a.smtp_host ? `INFO  SMTP do de teste: ${a.smtp_host} (a senha do SMTP não sai pela API: confira em Authentication > SMTP do projeto ${NOME})` : 'INFO  o de teste usa o e-mail padrão do Supabase');
const chaves = await api(`/projects/${ref}/api-keys`);
const pub = chaves.find((k) => k.type === 'publishable')?.api_key || chaves.find((k) => k.name === 'anon')?.api_key;
console.log(`CONFIG supabaseUrl: "https://${ref}.supabase.co", supabaseAnonKey: "${pub}"`);
