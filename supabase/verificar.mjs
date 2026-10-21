// Verificação somente leitura do Supabase em produção (roda no GitHub Actions).
// Não cria contas nem envia e-mails: só confere se tabelas, funções, login por e-mail e o site estão no lugar.
import { readFile, writeFile } from 'node:fs/promises';

const cfgTxt = await readFile(new URL('../src/config.js', import.meta.url), 'utf8');
const url = cfgTxt.match(/supabaseUrl:\s*"([^"]+)"/)?.[1];
const chave = cfgTxt.match(/supabaseAnonKey:\s*"([^"]+)"/)?.[1];
const H = { apikey: chave, Authorization: chave.startsWith('eyJ') ? `Bearer ${chave}` : undefined };
Object.keys(H).forEach((k) => H[k] === undefined && delete H[k]);
const res = [];
const reg = (nome, ok, detalhe) => { res.push({ nome, ok, detalhe }); console.log(`${ok ? 'OK   ' : 'FALHA'} ${nome}: ${detalhe}`); };

async function pedir(caminho, init = {}) {
  try {
    const r = await fetch(url + caminho, { ...init, headers: { ...H, 'Content-Type': 'application/json', ...(init.headers || {}) } });
    const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
    return { status: r.status, corpo: j };
  } catch (e) { return { status: 0, corpo: String(e) }; }
}
const codigo = (c) => (typeof c === 'object' && c ? `${c.code || ''} ${c.message || ''}`.trim() : String(c).slice(0, 160));

// 1. API no ar e chave aceita
// (a chave publicável não lê o catálogo /rest/v1/ — isso exige a chave secreta —, então testamos numa tabela)
const raiz = await pedir('/rest/v1/perfis?select=id&limit=1');
reg('API REST e chave publicável', raiz.status === 200, `HTTP ${raiz.status} ${raiz.status === 200 ? 'chave aceita' : codigo(raiz.corpo)}`);

// 2. Tabelas: existir é o que importa (sem login, as regras de acesso podem negar a leitura, o que é esperado)
for (const t of ['perfis', 'inscricoes_artistas', 'cadastros_casas', 'checklist', 'registros_noite', 'chaves_internas', 'admins_iniciais', 'convites', 'avisos_cidade', 'diario_uso', 'registros_supabase']) {
  const r = await pedir(`/rest/v1/${t}?select=*&limit=1`);
  const falta = /PGRST205|42P01|Could not find the table/i.test(codigo(r.corpo));
  const vazou = r.status === 200 && Array.isArray(r.corpo) && r.corpo.length > 0;
  reg(`tabela ${t}`, !falta && !vazou && r.status !== 0, falta ? 'não existe' : vazou ? 'ATENÇÃO: visitante sem login conseguiu ler linhas' : `existe e está protegida (HTTP ${r.status})`);
}

// 3. Funções
for (const f of ['pre_curadoria', 'pendencias_casa', 'eh_equipe', 'eh_adm']) {
  const corpo = f === 'pre_curadoria' || f === 'pendencias_casa' ? JSON.stringify({ d: {} }) : '{}';
  const r = await pedir(`/rest/v1/rpc/${f}`, { method: 'POST', body: corpo });
  const falta = /PGRST202|Could not find the function/i.test(codigo(r.corpo));
  reg(`função ${f}`, !falta && r.status !== 0, falta ? 'não existe' : `existe (HTTP ${r.status})`);
}

// 3b. A pré-curadoria do banco real dá o mesmo resultado que a do site
await import('../src/regras.js');
const exemplo = { release: 'x'.repeat(250), foto: 'f', spotify: 's', youtube: 'y', contato_producao: 'c', ouvintes_mensais: '12000', seguidores_instagram: '6000', rider_tipo: 'circulavel', cidades_interesse: ['São Paulo', 'Belo Horizonte', 'Lisboa'], aceita_bonus: 'true', integrantes: '3' };
const pc = await pedir('/rest/v1/rpc/pre_curadoria', { method: 'POST', body: JSON.stringify({ d: exemplo }) });
const js = globalThis.TQRegras.preCuradoria(exemplo);
reg('pré-curadoria no banco real = site', pc.status === 200 && pc.corpo?.score === js.score && pc.corpo?.faixa === js.faixa, `banco ${pc.corpo?.score} (${pc.corpo?.faixa}) · site ${js.score} (${js.faixa})`);
const hc = await pedir('/rest/v1/rpc/pendencias_casa', { method: 'POST', body: JSON.stringify({ d: { responsavel: 'Ana', cidade: 'Recife' } }) });
const hj = globalThis.TQRegras.pendenciasCasa({ responsavel: 'Ana', cidade: 'Recife' });
reg('habilitação de casa no banco real = site', hc.status === 200 && JSON.stringify(hc.corpo?.habilitacao) === JSON.stringify(hj.habilitacao), `banco ${hc.corpo?.habilitacao?.length} pendências · site ${hj.habilitacao.length}`);
const eq = await pedir('/rest/v1/rpc/eh_adm', { method: 'POST', body: '{}' });
reg('visitante sem login não é adm', eq.corpo === false, `eh_adm() = ${JSON.stringify(eq.corpo)}`);

// 4. Login por e-mail
const aut = await pedir('/auth/v1/settings');
const a = aut.corpo || {};
reg('login por e-mail habilitado', aut.status === 200 && a.external?.email === true && !a.disable_signup, aut.status === 200 ? `email=${a.external?.email} cadastro_aberto=${!a.disable_signup} confirmacao_por_email=${!a.mailer_autoconfirm}` : `HTTP ${aut.status}`);

// Sem confirmação de e-mail, quem se cadastra primeiro com um e-mail convidado herdaria o convite (equipe/adm).
reg('confirmação de e-mail ligada', aut.status === 200 && a.mailer_autoconfirm !== true, aut.status === 200 ? `confirmacao_por_email=${!a.mailer_autoconfirm}` : `HTTP ${aut.status}`);

// 5. Site publicado com esta configuração e biblioteca acessível
const site = await fetch('https://marinacollier.github.io/tranquilo-rede/config.js', { cache: 'no-store' }).then((r) => r.text()).catch((e) => String(e));
reg('site publicado aponta para este Supabase', site.includes(url), site.includes(url) ? 'config.js do site confere' : site.slice(0, 120));
const lib = await fetch('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm').then((r) => r.status).catch(() => 0);
reg('biblioteca supabase-js (CDN)', lib === 200, `HTTP ${lib}`);

await writeFile('verificacao.json', JSON.stringify({ quando: new Date().toISOString(), url, resultados: res }, null, 2));
process.exitCode = res.every((r) => r.ok) ? 0 : 1;
