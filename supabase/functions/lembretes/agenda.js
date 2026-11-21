// Agenda dos lembretes: junta as datas do Notion (public.json) e as datas criadas no portal (tabela datas_portal, v21)
// e diz quem recebe aviso em cada uma. JavaScript puro para rodar no Deno (Edge Function) e no Node (tests/lembretes.test.mjs).
export const chave = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Data do portal no mesmo formato da agenda pública; o id "p:<uuid>" é o mesmo que o painel usa no checklist (src/conta.js, eventoDoPortal).
export function eventoDoPortal(x) {
  const arts = [...(x.artistas || [])].sort((a, b) => (a.ordem || 99) - (b.ordem || 99));
  return {
    id: "p:" + x.id, d: String(x.dia).slice(0, 10), c: (x.cidade || "").replace(/\/.*$/, "").trim() || x.casa_nome, h: x.casa_nome,
    a: arts.map((a) => a.nome).filter(Boolean), au: arts.map((a) => a.user_id).filter(Boolean), kc: x.casa_id || null,
    criada: String(x.criado_em || "").slice(0, 10) || null, portal: true,
  };
}

// agenda: [{id,d,c,h,a,au?,kc?}]; perfis: contas artista/casa; donos: {casa_id: user_id da dona da Ficha}.
// Artista: pela conta ligada na data (user_id) ou pelo nome no line-up. Casa: a dona da Ficha (datas do portal) e as contas
// com o nome da casa (dona e equipe). Sem repetir a mesma conta na mesma data.
export function alvosDaData(e, perfis, donos = {}) {
  const porId = new Map(perfis.map((p) => [p.id, p]));
  const porNome = {};
  for (const p of perfis) if (p.vinculo_nome) (porNome[`${p.tipo}|${chave(p.vinculo_nome)}`] ||= []).push(p);
  const vistos = new Set(), saida = [];
  const por = (p, tipo) => { if (p && p.tipo === tipo && p.email && !vistos.has(p.id)) { vistos.add(p.id); saida.push([p, tipo]); } };
  for (const id of e.au || []) por(porId.get(id), "artista");
  for (const n of e.a || []) for (const p of porNome[`artista|${chave(n)}`] || []) por(p, "artista");
  if (e.kc && donos[e.kc]) por(porId.get(donos[e.kc]), "casa");
  for (const p of porNome[`casa|${chave(e.h)}`] || []) por(p, "casa");
  return saida;
}

// Junta as duas fontes. Uma data do portal com o mesmo dia e a mesma casa de uma data do Notion é a mesma noite:
// sai um aviso só, pela do portal.
export function montarAgenda(publica, datasPortal) {
// O passo marcado como feito em qualquer uma das duas (id do Notion ou p:<uuid>) vale (campo ids).
  const portal = (datasPortal || []).filter((x) => x.status !== "cancelada").map(eventoDoPortal);
  const doPortal = new Map(portal.map((e) => [`${e.d}|${chave(e.h)}`, e]));
  const notion = [];
  for (const e of publica || []) {
    if (!e.id) continue;
    const p = doPortal.get(`${e.d}|${chave(e.h)}`);
    if (p) p.ids = [...(p.ids || [p.id]), e.id]; else notion.push(e);
  }
  return [...notion, ...portal.map((e) => ({ ...e, ids: e.ids || [e.id] }))];
}
