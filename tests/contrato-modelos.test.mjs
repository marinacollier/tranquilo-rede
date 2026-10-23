// Campos dos modelos de contrato: os formatos usados no Notion viram campos do site (src/contrato.js).
import { readFileSync } from 'node:fs'; import vm from 'node:vm';
const ctx = {}; vm.createContext(ctx); vm.runInContext(readFileSync(new URL('../src/contrato.js', import.meta.url), 'utf8') + ';globalThis.T=TQContrato;', ctx);
const T = ctx.T;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALHA') + ' ' + m); if (!c) process.exitCode = 1; };
const r = T.campos('Artista {NOME DO ARTISTA}, CPF/CNPJ {CPF/CNPJ}, show em {data} em {cidade/UF}. NF de [NOME ARTÍSTICO] em [DATA]. Data: {data de hoje}. Cachê {{cache}}. Pix [PREENCHER CHAVE PIX]. Cláusula [1.2] fica.');
const k = r.campos.map((c) => c.chave);
ok(['artista', 'data', 'cidade', 'data_assinatura', 'cache'].every((x) => k.includes(x)), '{NOME DO ARTISTA}, {data}, {cidade/UF}, {data de hoje} e {{cache}} viram campos que a equipe já sabe');
ok(k.filter((x) => x === 'artista').length === 1 && !/\[NOME ARTÍSTICO\]|\[DATA\]/.test(r.texto), '[NOME ARTÍSTICO] e [DATA] reaproveitam os mesmos campos');
ok(r.campos.find((c) => c.chave === 'cpf_cnpj')?.rotulo === 'CPF/CNPJ' && r.campos.find((c) => c.chave === 'chave_pix')?.rotulo === 'Chave PIX', 'siglas ficam em maiúsculas (CPF/CNPJ, PIX)');
ok(/Cláusula \[1\.2\] fica/.test(r.texto), 'colchetes com número de cláusula não viram campo');
const s = T.sugestoes({ d: '2026-11-05', c: 'Belo Horizonte', h: 'Casa X' }, { vinculo_nome: 'Joyce Alane' });
ok(s.artista === 'Joyce Alane' && s.data === '05/11/2026' && /de \d{4}$/.test(s.data_assinatura), 'sugestões: nome, data do show e data da assinatura por extenso');
const t = T.preencher(r.texto, r.campos, { artista: 'Joyce Alane', cpf_cnpj: '1', data: '05/11', cidade: 'BH', data_assinatura: 'x', cache: '300', chave_pix: 'p' });
ok(!/\{\{/.test(t) && (t.match(/Joyce Alane/g) || []).length === 2, 'preencher troca todos os campos, inclusive os repetidos');
