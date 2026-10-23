// Lê a campanha do Bruno (página HTML no formato atual ou arquivo de dados JSON da casa) e gera o JSON que o Hub importa.
// Só leitura: não altera a fonte. O texto continua sendo mantido por ele; o Hub guarda só o "feito".
// A mesma leitura roda no site (Campanhas › Carregar campanha), em src/campanha.js.
//
//   node scripts/importar-campanha.mjs <pagina.html | dados.json> --casa "Rooftap" --slug rooftap-nov26 [--ano 2026] [--fonte URL]
//
// Saída: JSON em stdout. Falha (código 1) se não achar dias, para nunca importar uma campanha vazia por engano.
import { readFileSync } from 'node:fs';
import '../src/campanha.js';

const args = process.argv.slice(2);
const arq = args.find((a) => !a.startsWith('--') && !args[args.indexOf(a) - 1]?.startsWith('--'));
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
if (!arq) { console.error('Uso: node scripts/importar-campanha.mjs <pagina.html | dados.json> --casa NOME --slug SLUG [--ano AAAA] [--fonte URL]'); process.exit(1); }

let c;
try { c = globalThis.TQCampanha.ler(readFileSync(arq, 'utf8'), { ano: Number(opt('ano', new Date().getFullYear())) }); }
catch (e) { console.error(e.message); process.exit(1); }
for (const a of c.avisos) console.error('Aviso: ' + a);

console.log(JSON.stringify({
  slug: opt('slug', c.slug || 'campanha'), titulo: c.titulo, casa: opt('casa', c.casa), fonte_url: opt('fonte', c.fonte_url || null),
  itens: c.itens.map(({ chave, dia, rotulo, acoes }) => ({ chave, dia, rotulo, acoes })),
}, null, 2));
