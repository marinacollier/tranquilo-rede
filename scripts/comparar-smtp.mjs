// Compara o SMTP de teste e de produção (24/11/2026) sem imprimir e-mails nem senha: só se cada campo é igual.
const token = process.env.SUPABASE_ACCESS_TOKEN;
const cfg = async (ref) => (await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, { headers: { Authorization: `Bearer ${token}` } })).json();
const [h, p] = await Promise.all([cfg('edespqdbxhthzcmygake'), cfg('cgujgstuviuolzcpkakl')]);
for (const c of ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_admin_email', 'smtp_sender_name', 'smtp_max_frequency']) {
  const pub = ['smtp_host', 'smtp_port', 'smtp_sender_name', 'smtp_max_frequency'].includes(c);
  console.log(`${c}: ${h[c] === p[c] ? 'igual' : 'DIFERENTE'}${pub ? ` (teste: ${h[c]} · produção: ${p[c]})` : ` (produção ${p[c] ? 'preenchido' : 'VAZIO'}; tem espaço: ${/\s/.test(p[c] || '')})`}`);
}
console.log(`smtp_pass: teste ${h.smtp_pass ? 'preenchida' : 'vazia'} · produção ${p.smtp_pass ? 'preenchida' : 'vazia'}${h.smtp_pass && p.smtp_pass ? (h.smtp_pass === p.smtp_pass ? ' · iguais' : ' · DIFERENTES') : ''}${p.smtp_pass && /\s/.test(p.smtp_pass) ? ' · produção TEM ESPAÇO' : ''}${p.smtp_pass ? ` · produção com ${p.smtp_pass.replace(/\s/g, '').length} caracteres sem espaços` : ''}`);
