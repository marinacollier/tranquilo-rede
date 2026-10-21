// Lê a página de campanha do Bruno (HTML do artefato, formato atual) e gera o JSON que o Hub importa.
// Só leitura: não altera a página dele. O texto continua sendo mantido por ele; o Hub guarda só o "feito".
//
//   node scripts/importar-campanha.mjs <pagina.html> --casa "Rooftap" --slug rooftap-nov26 [--ano 2026] [--fonte URL]
//
// Saída: JSON em stdout. Falha (código 1) se não achar dias, para nunca importar uma campanha vazia por engano.
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const arq = args.find((a) => !a.startsWith('--') && !args[args.indexOf(a) - 1]?.startsWith('--'));
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
if (!arq) { console.error('Uso: node scripts/importar-campanha.mjs <pagina.html> --casa NOME --slug SLUG [--ano AAAA] [--fonte URL]'); process.exit(1); }

const html = readFileSync(arq, 'utf8');
const ano = Number(opt('ano', new Date().getFullYear()));
const limpa = (s) => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
const titulo = limpa((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || '') || 'Campanha';

const itens = [];
// Cada dia: <label class="dia ..."><input type="checkbox" data-k="d1020"> ... </label>
for (const m of html.matchAll(/<label class="dia[^"]*">\s*<input type="checkbox" data-k="([^"]+)">([\s\S]*?)<\/label>/g)) {
  const [, chave, corpo] = m;
  const quando = limpa((corpo.match(/class="quando">([\s\S]*?)<\/span>/) || [])[1] || '');
  const dm = quando.match(/(\d{2})\/(\d{2})/);
  if (!dm) continue;
  const acoes = [];
  for (const a of corpo.matchAll(/<div class="acao">([\s\S]*?)<\/div>\s*(?=<div class="acao">|<\/div>\s*$|$)/g)) {
    const bloco = a[1];
    const canal = limpa((bloco.match(/class="canal[^"]*">([\s\S]*?)<\/span>/) || [])[1] || '');
    if (!canal) continue;
    acoes.push({
      canal,
      show: limpa((bloco.match(/class="qual">([\s\S]*?)<\/span>/) || [])[1] || ''),
      texto: limpa((bloco.match(/class="faz">([\s\S]*?)<\/p>/) || [])[1] || ''),
      links: [...bloco.matchAll(/<a href="(https:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map((l) => ({ url: l[1], rotulo: limpa(l[2]) })),
    });
  }
  itens.push({ chave, dia: `${ano}-${dm[2]}-${dm[1]}`, rotulo: quando, acoes });
}
if (!itens.length) { console.error('Nenhum dia encontrado. O formato da página mudou? Nada foi gerado.'); process.exit(1); }
const vazios = itens.filter((i) => !i.acoes.length).map((i) => i.chave);
if (vazios.length) console.error(`Aviso: dias sem ações lidas: ${vazios.join(', ')}`);

console.log(JSON.stringify({
  slug: opt('slug', 'campanha'), titulo, casa: opt('casa', ''), fonte_url: opt('fonte', null), itens,
}, null, 2));
