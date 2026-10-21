// Garante que a pré-curadoria e a habilitação calculadas no navegador (src/regras.js)
// dão exatamente o mesmo resultado que as funções do banco (supabase/schema.sql).
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import '../src/regras.js';

const { preCuradoria, pendenciasCasa, CIDADES_REDE } = globalThis.TQRegras;
const db = new PGlite();
await db.exec(`create role anon nologin; create role authenticated nologin; create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb, encrypted_password text default 'hash', email_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;`);
await db.exec(readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8'));

let semente = 7;
const rnd = (n) => (semente = (semente * 1103515245 + 12345) % 2147483648) % n;
const escolhe = (a) => a[rnd(a.length)];
const talvez = (v) => (rnd(3) ? v : '');
let falhas = 0;
for (let i = 0; i < 400; i++) {
  const d = {
    release: 'x'.repeat(escolhe([0, 150, 199, 200, 600])), foto: talvez('http://foto'), spotify: talvez('s'), youtube: talvez('y'),
    outro_link: talvez('o'), contato_producao: talvez('c'), ouvintes_mensais: String(escolhe([0, 499, 500, 1999, 2000, 9999, 10000, 50000, 120000])),
    seguidores_instagram: talvez(String(escolhe([0, 999, 1000, 4999, 5000, 20000]))), rider_tipo: escolhe(['circulavel', 'condicionado', 'especial', '']),
    cidades_interesse: [...new Set(Array.from({ length: rnd(5) }, () => escolhe([...CIDADES_REDE, 'Lisboa', 'Manaus'])))],
    aceita_bonus: escolhe(['true', 'false', '']), cache_minimo: talvez(String(escolhe([300, 800, 801, 1500, 1501, 4000]))), integrantes: talvez(String(rnd(9))),
  };
  const js = preCuradoria(d), sql = (await db.query('select pre_curadoria($1) r', [d])).rows[0].r;
  if (JSON.stringify(js) !== JSON.stringify({ score: sql.score, faixa: sql.faixa, alertas: sql.alertas, detalhe: { completude: sql.detalhe.completude, tracao: sql.detalhe.tracao, tecnica: sql.detalhe.tecnica, circulacao: sql.detalhe.circulacao, condicoes: sql.detalhe.condicoes } })) {
    falhas++; if (falhas < 4) console.log('Diferença na pré-curadoria', d, js, sql);
  }
  const c = Object.fromEntries(['responsavel', 'whatsapp', 'endereco', 'cidade', 'som', 'palco', 'microfones', 'luz', 'restricoes', 'camarim', 'backline', 'acessibilidade', 'instagram', 'como_chegar'].map((k) => [k, talvez('x')]));
  c.som = escolhe(['pa_proprio', 'nao_tem', '']); c.capacidade = talvez(String(rnd(300))); c.aceite_responsabilidades = escolhe(['true', 'false', '']);
  const cj = pendenciasCasa(c), cs = (await db.query('select pendencias_casa($1) r', [c])).rows[0].r;
  if (['habilitacao', 'match', 'enriquecimento'].some((k) => JSON.stringify(cj[k]) !== JSON.stringify(cs[k]))) { falhas++; if (falhas < 4) console.log('Diferença na habilitação', c, cj, cs); }
}
console.log(falhas ? `FALHA: ${falhas} diferenças entre navegador e banco` : 'OK   800 casos idênticos entre navegador e banco (pré-curadoria e habilitação)');
process.exitCode = falhas ? 1 : 0;
