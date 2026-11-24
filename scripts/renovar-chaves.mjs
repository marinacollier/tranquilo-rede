// Segredo novo do site (24/11/2026): o SITE_SECRET antigo se perdeu, então os códigos de acesso mudam. Este script lê a
// lista de códigos que o build acabou de gerar (ACESSOS, nunca impressa) e atualiza nos DOIS bancos (teste e produção):
//   - chaves_internas (equipe e adm): a equipe e a adm continuam abrindo o pacote interno sem fazer nada;
//   - perfis.codigo_acesso / vinculo_pedido de casas e artistas: o novo código do mesmo nome (casa ou artista).
// O log é público: mostra só contagens e nomes de casas/artistas sem código correspondente, nunca códigos.
import { readFile } from 'node:fs/promises';
const token = process.env.SUPABASE_ACCESS_TOKEN, arq = process.env.ACESSOS;
if (!token || !arq) { console.error('::error::faltam SUPABASE_ACCESS_TOKEN ou ACESSOS'); process.exit(1); }
const k = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const acessos = (await readFile(arq, 'utf8')).split('\n').filter(Boolean).map((l) => { const [tipo, codigo, nome] = l.split('\t'); return { tipo, codigo, nome }; });
const cod = (tipo, nome) => acessos.find((a) => a.tipo === tipo && k(a.nome) === k(nome))?.codigo;
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
for (const arqCfg of ['config.js', 'config.prd.js']) {
  const ref = (await readFile(new URL(`../src/${arqCfg}`, import.meta.url), 'utf8')).match(/https:\/\/([a-z0-9]+)\.supabase\.co/)[1];
  const sql = async (query) => { const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) }); if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`); return r.json(); };
  const amb = arqCfg === 'config.js' ? 'HOMOLOG' : 'PRODUÇÃO';
  for (const t of ['equipe', 'adm']) await sql(`insert into chaves_internas (tipo, codigo) values ('${t}', ${q(cod(t, t === 'adm' ? 'Administração' : 'Equipe Tranquilo'))}) on conflict (tipo) do update set codigo = excluded.codigo`);
  const ps = await sql(`select id, tipo, vinculo_nome, vinculo_pedido_nome, codigo_acesso is not null tem_cod, vinculo_pedido is not null tem_ped from perfis where tipo in ('casa', 'artista') and (codigo_acesso is not null or vinculo_pedido is not null)`);
  let ok = 0; const sem = [];
  for (const p of ps) {
    const c = cod(p.tipo, p.vinculo_nome || p.vinculo_pedido_nome);
    if (!c) { sem.push(`${p.tipo}: ${p.vinculo_nome || p.vinculo_pedido_nome || 'sem nome'}`); continue; }
    await sql(`select set_config('tq.sistema', '1', true); update perfis set ${[p.tem_cod && `codigo_acesso = ${q(c)}`, p.tem_ped && `vinculo_pedido = ${q(c)}`].filter(Boolean).join(', ')} where id = '${p.id}'`);
    ok++;
  }
  console.log(`# ${amb}: chaves internas (equipe e adm) atualizadas; ${ok} de ${ps.length} contas de casa/artista com código novo${sem.length ? `; sem correspondência: ${sem.join('; ')}` : ''}`);
}
