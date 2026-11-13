// Aplica os e-mails da Rede Tranquilo (supabase/emails) no Supabase: assunto e texto em português.
// Roda no GitHub Actions com o segredo SUPABASE_ACCESS_TOKEN (precisa de permissão de escrita no projeto).
import { readFile } from 'node:fs/promises';

const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) { console.error('::error::SUPABASE_ACCESS_TOKEN não configurado.'); process.exit(1); }
const cfg = await readFile(new URL('../src/config.js', import.meta.url), 'utf8');
const ref = cfg.match(/supabaseUrl:\s*"https:\/\/([^.]+)\./)?.[1];
const dir = new URL('../supabase/emails/', import.meta.url);
const assuntos = JSON.parse(await readFile(new URL('assuntos.json', dir), 'utf8'));
// Nome do arquivo → nome do modelo no Supabase.
const MODELOS = { confirmacao: 'confirmation', link: 'magic_link', convite: 'invite', senha: 'recovery', troca_email: 'email_change' };
const corpo = {};
for (const [arq, nome] of Object.entries(MODELOS)) {
  corpo[`mailer_subjects_${nome}`] = assuntos[arq];
  corpo[`mailer_templates_${nome}_content`] = await readFile(new URL(`${arq}.html`, dir), 'utf8');
}
const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
  method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
});
if (!r.ok) { console.error(`::error::O Supabase recusou (HTTP ${r.status}): ${(await r.text()).slice(0, 300)}`); process.exit(1); }
console.log(`OK: ${Object.keys(MODELOS).length} e-mails em português aplicados (${Object.values(assuntos).join(' · ')}).`);
