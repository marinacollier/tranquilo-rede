// Contas por e-mail: cadastro de artistas e casas, curadoria, habilitação e próximos passos.
// Com supabaseUrl e supabaseAnonKey em config.js, usa o Supabase (contas e dados reais).
// Sem eles, roda em modo demonstração: tudo fica só neste navegador.
"use strict";
const TQConta = (() => {
  const cfg = window.TQ_CONFIG || {};
  const REAL = !!(cfg.supabaseUrl && cfg.supabaseAnonKey);
  const R = window.TQRegras;
  const hojeIso = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
  let api = null;

  // ---------- modo demonstração ----------
  function Demo() {
    const CH = "tq-demo-v1";
    const ler = () => { try { return JSON.parse(localStorage.getItem(CH)) || null; } catch { return null; } };
    let db = ler() || { usuarios: {}, insc: {}, casas: {}, chk: [], reg: [], sessao: null };
    const gravar = () => { try { localStorage.setItem(CH, JSON.stringify(db)); } catch {} };
    const id = () => crypto.randomUUID();
    const eu = () => db.sessao && db.usuarios[db.sessao]?.perfil;
    const exigeEquipe = () => { if (!["equipe", "adm"].includes(eu()?.tipo)) throw new Error("Sem permissão."); };
    const agora = () => new Date().toISOString();
    return {
      async sessao() { return eu() || null; },
      async entrar(email, senha) {
        const u = Object.values(db.usuarios).find((x) => x.perfil.email === email.toLowerCase().trim());
        if (!u || u.senha !== senha) throw new Error("E-mail ou senha incorretos.");
        db.sessao = u.perfil.id; gravar(); return u.perfil;
      },
      async cadastrar({ email, senha, nome, tipo }) {
        email = email.toLowerCase().trim();
        if (Object.values(db.usuarios).some((x) => x.perfil.email === email)) throw new Error("Já existe uma conta com este e-mail.");
        const perfil = { id: id(), email, nome, tipo: ["artista", "casa", "equipe", "adm"].includes(tipo) ? tipo : "artista", codigo_acesso: null, vinculo_nome: null, criado_em: agora() };
        db.usuarios[perfil.id] = { senha, perfil }; db.sessao = perfil.id; gravar();
        return { perfil };
      },
      async recuperar() { return true; },
      async sair() { db.sessao = null; gravar(); },
      async minhaInscricao() { return db.insc[db.sessao] || null; },
      async salvarInscricao(dados, enviar) {
        const atual = db.insc[db.sessao];
        if (atual && !["rascunho", "ajustes"].includes(atual.status)) throw new Error("Inscrição em análise: aguarde o retorno da curadoria.");
        const pc = R.preCuradoria(dados);
        db.insc[db.sessao] = { ...(atual || { id: id(), user_id: db.sessao, criado_em: agora() }), dados, status: enviar ? "em_curadoria" : (atual?.status || "rascunho"),
          score: pc.score, faixa: pc.faixa, score_detalhe: pc.detalhe, alertas: pc.alertas, enviado_em: enviar ? agora() : atual?.enviado_em || null, atualizado_em: agora() };
        gravar(); return db.insc[db.sessao];
      },
      async minhaCasa() { return db.casas[db.sessao] || null; },
      async salvarCasa(dados, { enviar, ja_parceira, notion_casa_id }) {
        const atual = db.casas[db.sessao], pend = R.pendenciasCasa(dados);
        let status = atual?.status || "rascunho";
        if (!["habilitada", "suspensa"].includes(status) && enviar) status = pend.habilitacao.length ? "incompleto" : "em_analise";
        db.casas[db.sessao] = { ...(atual || { id: id(), user_id: db.sessao, criado_em: agora() }), dados, ja_parceira: !!ja_parceira, notion_casa_id: notion_casa_id || null,
          status, pendencias: pend, enviado_em: status === "em_analise" ? agora() : atual?.enviado_em || null, atualizado_em: agora() };
        gravar(); return db.casas[db.sessao];
      },
      async meuChecklist() { return db.chk.filter((c) => c.user_id === db.sessao); },
      async marcar(evento_id, item, feito) {
        db.chk = db.chk.filter((c) => !(c.user_id === db.sessao && c.evento_id === evento_id && c.item === item));
        if (feito) db.chk.push({ user_id: db.sessao, evento_id, item, feito: true, atualizado_em: agora() });
        gravar();
      },
      async registrar(evento_id, r) { db.reg.push({ id: id(), user_id: db.sessao, evento_id, ...r, criado_em: agora() }); gravar(); },
      async meusRegistros() { return db.reg.filter((r) => r.user_id === db.sessao); },
      async vincularCodigo(codigo, nome) {
        const p = eu(); if (p.codigo_acesso) throw new Error("Esta conta já está vinculada. Fale com a equipe para trocar.");
        p.codigo_acesso = codigo; p.vinculo_nome = nome; gravar(); return p;
      },
      async chaveInterna() { return null; },
      async inscricoes() { exigeEquipe(); return Object.values(db.insc).map((i) => ({ ...i, perfil: db.usuarios[i.user_id]?.perfil })); },
      async avaliarInscricao(iid, campos) {
        exigeEquipe(); const i = Object.values(db.insc).find((x) => x.id === iid);
        Object.assign(i, campos, campos.status && campos.status !== i.status ? { avaliado_por: db.sessao, avaliado_em: agora() } : {}); gravar();
      },
      async casas() { exigeEquipe(); return Object.values(db.casas).map((c) => ({ ...c, perfil: db.usuarios[c.user_id]?.perfil })); },
      async avaliarCasa(cid, campos) {
        exigeEquipe(); const c = Object.values(db.casas).find((x) => x.id === cid);
        Object.assign(c, campos, { avaliado_por: db.sessao, avaliado_em: agora() }); gravar();
      },
      async perfis() { exigeEquipe(); return Object.values(db.usuarios).map((u) => u.perfil); },
      async atualizarPerfil(pid, campos) {
        if (eu()?.tipo !== "adm") throw new Error("Só a administração muda perfis.");
        Object.assign(db.usuarios[pid].perfil, campos); gravar();
      },
      async checklistTodos() { exigeEquipe(); return db.chk; },
      async registrosTodos() { exigeEquipe(); return db.reg; },
    };
  }

  // ---------- Supabase ----------
  async function Supa() {
    const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm");
    const sb = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    const ok = ({ data, error }) => { if (error) throw new Error(traduz(error.message)); return data; };
    const uid = async () => (await sb.auth.getUser()).data.user?.id;
    const perfil = async () => { const u = await uid(); if (!u) return null; return ok(await sb.from("perfis").select("*").eq("id", u).maybeSingle()); };
    const comPerfis = async (linhas) => {
      if (!linhas.length) return linhas;
      const ps = ok(await sb.from("perfis").select("*").in("id", linhas.map((l) => l.user_id)));
      return linhas.map((l) => ({ ...l, perfil: ps.find((p) => p.id === l.user_id) }));
    };
    return {
      async sessao() { return perfil(); },
      async entrar(email, senha) { ok(await sb.auth.signInWithPassword({ email, password: senha })); return perfil(); },
      async cadastrar({ email, senha, nome, tipo }) {
        const r = ok(await sb.auth.signUp({ email, password: senha, options: { data: { nome, tipo }, emailRedirectTo: location.origin + location.pathname } }));
        return r.session ? { perfil: await perfil() } : { confirmar: true };
      },
      async recuperar(email) { ok(await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname })); return true; },
      async sair() { await sb.auth.signOut(); },
      async minhaInscricao() { return ok(await sb.from("inscricoes_artistas").select("*").eq("user_id", await uid()).maybeSingle()); },
      async salvarInscricao(dados, enviar) {
        const u = await uid(), atual = await this.minhaInscricao();
        const linha = { dados, status: enviar ? "em_curadoria" : atual?.status || "rascunho" };
        return atual ? ok(await sb.from("inscricoes_artistas").update(linha).eq("user_id", u).select().single())
          : ok(await sb.from("inscricoes_artistas").insert({ ...linha, user_id: u }).select().single());
      },
      async minhaCasa() { return ok(await sb.from("cadastros_casas").select("*").eq("user_id", await uid()).maybeSingle()); },
      async salvarCasa(dados, { enviar, ja_parceira, notion_casa_id }) {
        const u = await uid(), atual = await this.minhaCasa();
        const linha = { dados, ja_parceira: !!ja_parceira, notion_casa_id: notion_casa_id || null, status: enviar ? "em_analise" : atual?.status || "rascunho" };
        return atual ? ok(await sb.from("cadastros_casas").update(linha).eq("user_id", u).select().single())
          : ok(await sb.from("cadastros_casas").insert({ ...linha, user_id: u }).select().single());
      },
      async meuChecklist() { return ok(await sb.from("checklist").select("*").eq("user_id", await uid())); },
      async marcar(evento_id, item, feito) {
        const u = await uid();
        if (feito) ok(await sb.from("checklist").upsert({ user_id: u, evento_id, item, feito: true, atualizado_em: new Date().toISOString() }));
        else ok(await sb.from("checklist").delete().match({ user_id: u, evento_id, item }));
      },
      async registrar(evento_id, r) { ok(await sb.from("registros_noite").insert({ user_id: await uid(), evento_id, ...r })); },
      async meusRegistros() { return ok(await sb.from("registros_noite").select("*").eq("user_id", await uid())); },
      async vincularCodigo(codigo, nome) {
        const p = await perfil(); if (p.codigo_acesso) throw new Error("Esta conta já está vinculada. Fale com a equipe para trocar.");
        return ok(await sb.from("perfis").update({ codigo_acesso: codigo, vinculo_nome: nome }).eq("id", p.id).select().single());
      },
      async chaveInterna(tipo) { return ok(await sb.from("chaves_internas").select("codigo").eq("tipo", tipo).maybeSingle())?.codigo || null; },
      async inscricoes() { return comPerfis(ok(await sb.from("inscricoes_artistas").select("*").order("enviado_em", { ascending: false, nullsFirst: false }))); },
      async avaliarInscricao(iid, campos) { ok(await sb.from("inscricoes_artistas").update(campos).eq("id", iid)); },
      async casas() { return comPerfis(ok(await sb.from("cadastros_casas").select("*").order("atualizado_em", { ascending: false }))); },
      async avaliarCasa(cid, campos) { ok(await sb.from("cadastros_casas").update(campos).eq("id", cid)); },
      async perfis() { return ok(await sb.from("perfis").select("*").order("criado_em", { ascending: false })); },
      async atualizarPerfil(pid, campos) { ok(await sb.from("perfis").update(campos).eq("id", pid)); },
      async checklistTodos() { return ok(await sb.from("checklist").select("*")); },
      async registrosTodos() { return ok(await sb.from("registros_noite").select("*").order("criado_em", { ascending: false })); },
    };
  }
  function traduz(m) {
    if (/Invalid login credentials/i.test(m)) return "E-mail ou senha incorretos.";
    if (/Email not confirmed/i.test(m)) return "Confirme o e-mail pelo link que enviamos antes de entrar.";
    if (/already registered/i.test(m)) return "Já existe uma conta com este e-mail.";
    if (/Password should be at least/i.test(m)) return "A senha precisa de pelo menos 6 caracteres.";
    return m;
  }

  // ---------- estado e carregamento ----------
  async function carregar(perfil) {
    S.conta = { perfil, insc: null, casa: null, chk: [], reg: [] };
    if (perfil.tipo === "artista") S.conta.insc = await api.minhaInscricao();
    if (perfil.tipo === "casa") { S.conta.casa = await api.minhaCasa(); S.conta.reg = await api.meusRegistros(); }
    if (perfil.tipo === "artista" || perfil.tipo === "casa") S.conta.chk = await api.meuChecklist();
    const cod = perfil.codigo_acesso || (["equipe", "adm"].includes(perfil.tipo) ? await api.chaveInterna(perfil.tipo) : null);
    S.pac = null; S.eq = null;
    if (cod) {
      try { const pac = await abrirPacote(cod); if (S.conta?.perfil.id === perfil.id) S.pac = pac; }
      catch { /* código antigo ou inválido: segue sem métricas */ }
    }
    S.aba = abas()[0][0];
  }
  async function iniciar() {
    api = REAL ? await Supa() : Demo();
    const p = await api.sessao();
    if (p) await carregar(p);
    return !!p;
  }
  async function recarregar() { const p = await api.sessao(); if (p) { const aba = S.aba; await carregar(p); if (abas().some(([k]) => k === aba)) S.aba = aba; } render(); }

  const ROTULO = { artista: "Artista", casa: "Casa", equipe: "Equipe", adm: "Administração" };
  function abas() {
    const t = S.conta.perfil.tipo, doPac = S.pac ? PERFIS[S.pac.perfil].abas : [];
    if (t === "artista") return [["passos", "Próximos passos"], ["inscricao", "Minha inscrição"], ...doPac, ["conta", "Conta"]];
    if (t === "casa") return [["passos", "Próximos passos"], ["cadastro_casa", "Cadastro da casa"], ...doPac, ["conta", "Conta"]];
    const base = [["curadoria", "Curadoria"], ["casas_cad", "Cadastros de casas"], ["prontidao", "Prontidão"]];
    if (t === "adm") base.push(["pessoas", "Pessoas"]);
    return [...base, ...doPac, ["conta", "Conta"]];
  }
  const rotuloQuem = () => `${ROTULO[S.conta.perfil.tipo]} · ${S.conta.perfil.vinculo_nome || S.conta.perfil.nome || S.conta.perfil.email}`;

  // ---------- formulários ----------
  const F_ARTISTA = [
    ["Quem é você", [
      ["nome_artistico", "Nome artístico", "text", null, 1],
      ["cidade_base", "Cidade onde mora", "text", null, 1],
      ["estado", "Estado (UF)", "text", null, 1],
      ["generos", "Gêneros e referências", "text", null, 1, "Ex.: MPB, indie, samba. Pode citar até 3 artistas de referência."],
      ["formato_interesse", "Formato que mais te interessa", "select", [["descubra", "Descubra: noite com 3 artistas em ascensão"], ["apresenta", "Apresenta: show próprio numa data"], ["turne", "Turnê: várias cidades da rede"], ["nao_sei", "Ainda não sei"]], 1],
      ["release", "Release curto", "textarea", null, 1, "Pelo menos 200 caracteres. Se você for aprovada, ele vai para a sua página no site do Tranquilo."],
      ["foto", "Link de foto em alta resolução", "url", null, 0, "Drive, Dropbox ou site. Vira a capa da sua página."],
    ]],
    ["Música e público", [
      ["spotify", "Link do Spotify", "url", null, 1],
      ["youtube", "Link do YouTube", "url"],
      ["outro_link", "Outro link (Bandcamp, SoundCloud, clipe, show ao vivo)", "url"],
      ["instagram", "Instagram", "text", null, 1, "@usuario"],
      ["ouvintes_mensais", "Ouvintes mensais no Spotify", "number"],
      ["seguidores_instagram", "Seguidores no Instagram", "number"],
    ]],
    ["Formato e técnica", [
      ["formacao", "Formação", "select", [["solo", "Solo"], ["duo", "Duo"], ["trio", "Trio"], ["banda", "Banda"]], 1],
      ["integrantes", "Pessoas no palco", "number", null, 1],
      ["rider_tipo", "Seu rider", "select", [["circulavel", "Circulável: cabe na estrutura-base da maioria das casas"], ["condicionado", "Condicionado: só algumas casas atendem"], ["especial", "Produção especial: precisa de estrutura específica"]], 1, "O rider define a rota, não muda a sua proposta artística."],
      ["rider_link", "Link do rider técnico", "url"],
      ["tecnico_proprio", "Viaja com técnico de som próprio?", "select", [["nao", "Não"], ["sim", "Sim"]]],
      ["necessidades", "Necessidades técnicas importantes", "textarea"],
    ]],
    ["Circulação", [
      ["cidades_interesse", "Cidades da rede onde quer tocar", "cidades", null, 1],
      ["outras_cidades", "Outras cidades", "text"],
      ["disponibilidade", "Disponibilidade", "text", null, 0, "Ex.: quinta a domingo, a partir de março."],
      ["equipe_viagem", "Quantas pessoas viajam no total", "number"],
    ]],
    ["Condições e contato", [
      ["aceita_bonus", "Topa cachê base com bônus por meta de público?", "select", [["true", "Sim"], ["false", "Prefiro cachê fixo"]], 1, "Modelo usado pelo Tranquilo: um cachê base e um bônus quando o público passa da meta da noite."],
      ["cache_minimo", "Cachê mínimo por show (R$)", "number"],
      ["contato_producao", "Contato de produção ou empresariado", "text", null, 0, "Nome e WhatsApp ou e-mail."],
      ["whatsapp", "Seu WhatsApp", "text", null, 1],
      ["aceite", "Autorizo o Tranquilo a usar estes dados para curadoria e operação da rede.", "check", null, 1],
    ]],
  ];
  const F_CASA = [
    ["A casa", [
      ["nome", "Nome da casa", "text", null, 1], ["cidade", "Cidade", "text", null, 1], ["estado", "Estado (UF)", "text", null, 1],
      ["endereco", "Endereço", "text", null, 1], ["instagram", "Instagram", "text"],
      ["capacidade", "Capacidade de público em formato de show (pessoas)", "number", null, 1], ["capacidade_sentado", "Pessoas sentadas", "number"],
      ["dias", "Dias e horários possíveis para shows", "text"],
    ]],
    ["Responsável", [["responsavel", "Responsável local", "text", null, 1], ["whatsapp", "WhatsApp", "text", null, 1], ["email_contato", "E-mail de contato", "text"]]],
    ["Estrutura técnica", [
      ["som", "Como a casa resolve o som", "select", [["pa_proprio", "PA e mesa próprios"], ["parceiro", "Parceiro técnico contratado"], ["nao_tem", "Ainda não tenho"]], 1],
      ["palco", "Palco (medidas)", "text"], ["microfones", "Microfones e DIs", "text"], ["luz", "Luz: tem luz frontal para o rosto?", "text"],
      ["backline", "Backline (instrumentos e amplificadores)", "text"], ["camarim", "Camarim", "text"],
    ]],
    ["Operação", [["restricoes", "Restrições de horário e volume", "text"], ["acessibilidade", "Acessibilidade", "text"], ["como_chegar", "Como chegar (transporte e estacionamento)", "textarea"]]],
    ["Responsabilidades", [["aceite_responsabilidades", "A casa assume a produção local: equipe, técnica, estrutura, horários, segurança, licenças e ECAD, recepção do público, problemas comuns da noite, registro de ocorrências e prestação de contas (método V0.1, seção 11).", "check", null, 1]]],
  ];

  function campo([k, rot, tipo, opts, obrig, ajuda], d, travado) {
    const v = d[k] ?? "", dis = travado ? " disabled" : "", req = obrig ? ' <span class="muted">*</span>' : "";
    const aj = ajuda ? `<div class="muted" style="font-size:12px;margin-top:3px">${esc(ajuda)}</div>` : "";
    if (tipo === "check") return `<label class="fcheck"><input type="checkbox" data-k="${k}"${String(v) === "true" ? " checked" : ""}${dis}> <span>${esc(rot)}${req}</span></label>`;
    if (tipo === "cidades") {
      const sel = new Set(d[k] || []);
      return `<div class="fcampo"><b>${esc(rot)}${req}</b><div class="fcidades">${R.CIDADES_REDE.map((c) => `<label><input type="checkbox" data-cidade="${esc(c)}"${sel.has(c) ? " checked" : ""}${dis}> ${esc(c)}</label>`).join("")}</div>${aj}</div>`;
    }
    let inp;
    if (tipo === "select") inp = `<select data-k="${k}"${dis}><option value="">Escolha</option>${opts.map(([ov, ot]) => `<option value="${ov}"${String(v) === ov ? " selected" : ""}>${esc(ot)}</option>`).join("")}</select>`;
    else if (tipo === "textarea") inp = `<textarea data-k="${k}" rows="4"${dis}>${esc(v)}</textarea>`;
    else inp = `<input data-k="${k}" type="${tipo === "number" ? "number" : tipo === "url" ? "url" : "text"}" value="${esc(v)}"${tipo === "number" ? ' min="0" inputmode="numeric"' : ""}${dis}>`;
    return `<label class="fcampo"><b>${esc(rot)}${req}</b>${inp}${aj}</label>`;
  }
  const formHtml = (def, d, travado) => def.map(([titulo, cs]) => `<section class="card fsec"><h3>${esc(titulo)}</h3><div class="fgrid">${cs.map((c) => campo(c, d, travado)).join("")}</div></section>`).join("");
  function lerForm(raiz) {
    const d = {};
    raiz.querySelectorAll("[data-k]").forEach((el) => { d[el.dataset.k] = el.type === "checkbox" ? String(el.checked) : el.value.trim(); });
    const cs = [...raiz.querySelectorAll("[data-cidade]")].filter((el) => el.checked).map((el) => el.dataset.cidade);
    if (raiz.querySelector("[data-cidade]")) d.cidades_interesse = cs;
    return d;
  }
  const faltando = (def, d) => def.flatMap(([, cs]) => cs).filter(([k, , tipo, , obrig]) => obrig && (tipo === "check" ? d[k] !== "true" : tipo === "cidades" ? !(d[k] || []).length : !d[k])).map(([, rot]) => rot);

  // ---------- telas: artista ----------
  const STATUS_INSC = { rascunho: ["", "Rascunho"], em_curadoria: ["b-warn", "Com a curadoria"], ajustes: ["b-serious", "Ajustes pedidos"], aprovada: ["b-good", "Aprovada"], reprovada_pre: ["b-crit", "Não seguiu na pré-curadoria"], reprovada: ["b-crit", "Não seguiu na curadoria"] };
  const STATUS_CASA = { rascunho: ["", "Rascunho"], incompleto: ["b-serious", "Faltam dados mínimos"], em_analise: ["b-warn", "Em análise pela equipe"], ajustes: ["b-serious", "Ajustes pedidos"], habilitada: ["b-good", "Habilitada"], suspensa: ["b-crit", "Suspensa"] };
  const badge = (m, s) => `<span class="badge ${m[s]?.[0] || ""}">${esc(m[s]?.[1] || s)}</span>`;
  const linhaTempo = (etapas, atual) => `<ol class="tempo">${etapas.map((e, i) => `<li class="${i < atual ? "ok" : i === atual ? "agora" : ""}"><i>${i < atual ? "✓" : i + 1}</i><span>${esc(e)}</span></li>`).join("")}</ol>`;
  const medidor = (pc) => `<div class="card"><div class="row"><b>Força da inscrição</b><span><b style="font-size:22px">${pc.score}</b><span class="muted">/100</span> <span class="badge ${pc.faixa === "Prioridade" ? "b-good" : pc.faixa === "Avaliar" ? "b-warn" : "b-serious"}">${pc.faixa}</span></span></div>
    <div class="progress" style="margin:10px 0"><i style="width:${pc.score}%"></i></div>
    <div class="grid g4" style="gap:6px;font-size:13px">${[["completude", "Perfil completo", 20], ["tracao", "Público", 35], ["tecnica", "Rider", 20], ["circulacao", "Cidades da rede", 15], ["condicoes", "Condições", 10]].map(([k, t, max]) => `<div><span class="muted">${t}</span><br><b>${pc.detalhe[k]}</b>/${max}</div>`).join("")}</div>
    ${pc.alertas.length ? `<div style="margin-top:8px">${pc.alertas.map((a) => `<span class="pill">${esc(a)}</span>`).join("")}</div>` : ""}</div>`;

  function eventosDaConta() {
    if (!S.pac) return [];
    const limite = new Date(Date.now() - 5 * 864e5).toISOString().slice(0, 10);
    return S.pac.eventos.filter((e) => !e.z && e.d >= limite).sort((a, b) => a.d.localeCompare(b.d));
  }
  function blocoPassos(e, modelo) {
    const feitos = Object.fromEntries(S.conta.chk.filter((c) => c.evento_id === e.id && c.feito).map((c) => [c.item, true]));
    const ps = R.passosDaData(modelo, e.d, feitos, hojeIso());
    const n = ps.filter((p) => p.feito).length, atras = ps.filter((p) => p.atrasado).length;
    const proximo = ps.find((p) => !p.feito);
    const registro = modelo === "casa" && e.d <= hojeIso() ? `<button class="btn sm" data-registrar="${e.id}">Registrar a noite</button>` : "";
    return `<div class="card"><div class="row"><div><b>${dt(e.d)} · ${esc(e.c)}</b> <span class="muted">${esc(e.h || "")}</span><div class="muted" style="font-size:13px">${esc(e.a.join(", ") || e.m)}</div></div>
      <div style="text-align:right"><span class="badge ${atras ? "b-crit" : n === ps.length ? "b-good" : "b-warn"}">${n}/${ps.length} feitos${atras ? ` · ${atras} atrasado${atras > 1 ? "s" : ""}` : ""}</span><div style="margin-top:6px;display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap">${registro}${e.l ? `<a class="btn sm" href="${esc(e.l)}" target="_blank" rel="noopener">Ingressos</a>` : ""}</div></div></div>
      ${proximo ? `<div class="alert ${proximo.atrasado ? "crit" : "warn"}" style="margin:10px 0"><b>Agora: ${esc(proximo.titulo)}</b>${esc(proximo.texto)} <span class="muted">· prazo ${dt(proximo.prazo)}</span></div>` : `<div class="alert good" style="margin:10px 0"><b>Tudo feito para esta data.</b></div>`}
      <details><summary>Ver todos os passos</summary><ul class="passos">${ps.map((p) => `<li class="${p.feito ? "feito" : p.atrasado ? "atrasado" : ""}"><label><input type="checkbox" data-passo="${e.id}|${p.chave}"${p.feito ? " checked" : ""}> <span><b>${esc(p.titulo)}</b> <span class="muted">· ${p.dias < 0 ? `${-p.dias} dias antes` : p.dias === 0 ? "no dia" : `${p.dias} dia${p.dias > 1 ? "s" : ""} depois`} (${dtc(p.prazo)})</span><br><span class="muted" style="font-size:13px">${esc(p.texto)}</span></span></label></li>`).join("")}</ul></details></div>`;
  }

  const TELAS = {
    passos() {
      const p = S.conta.perfil;
      return p.tipo === "casa" ? passosCasa() : passosArtista();
    },
    inscricao() {
      const i = S.conta.insc, d = i?.dados || {}, trav = i && !["rascunho", "ajustes"].includes(i.status);
      return `<div class="tag">Inscrição de artista</div><h1>${trav ? "Sua inscrição" : "Inscreva-se na rede"}</h1>
      <p class="sub">${trav ? "Sua inscrição está com a equipe. Você pode consultar as respostas, mas só edita de novo se a curadoria pedir ajustes." : "Leva uns 10 minutos. O rascunho fica salvo e você pode voltar depois. Ao enviar, a pré-curadoria é automática e o resultado aparece na hora."}</p>
      ${i?.parecer && i.status === "ajustes" ? `<div class="alert warn"><b>A curadoria pediu ajustes</b>${esc(i.parecer)}</div>` : ""}
      <div id="medidor">${medidor(R.preCuradoria(d))}</div>
      <div id="form" style="display:flex;flex-direction:column;gap:12px;margin-top:12px">${formHtml(F_ARTISTA, d, trav)}</div>
      ${trav ? "" : `<div class="err" id="ferr"></div><div class="barra-acoes"><button class="btn" id="salvar">Salvar rascunho</button><button class="btn pri" id="enviar">Enviar para a curadoria</button></div>`}`;
    },
    cadastro_casa() {
      const c = S.conta.casa, d = c?.dados || {}, parceira = c ? c.ja_parceira : S.casaParceira;
      const casasConhecidas = (S.pub.casas || []);
      return `<div class="tag">Cadastro da casa</div><h1>${c ? "Ficha da casa" : "Cadastre sua casa"}</h1>
      <p class="sub">Habilitação mínima do método V0.1: primeiro o que bloqueia a habilitação, depois o que bloqueia um match específico, por fim o que só enriquece. Você pode atualizar a ficha a qualquer momento.</p>
      ${c?.parecer ? `<div class="alert ${c.status === "ajustes" ? "warn" : ""}"><b>Mensagem da equipe</b>${esc(c.parecer)}</div>` : ""}
      <div class="card"><b>A casa já recebe o Tranquilo?</b><div class="filters" style="margin-bottom:0"><label class="fcheck"><input type="radio" name="parceira" value="nao"${!parceira ? " checked" : ""}> Casa nova na rede</label><label class="fcheck"><input type="radio" name="parceira" value="sim"${parceira ? " checked" : ""}> Já recebo datas do Tranquilo</label>
      ${parceira ? `<select id="casaNotion"><option value="">Escolha a casa</option>${casasConhecidas.map((x) => `<option value="${x.id}"${c?.notion_casa_id === x.id ? " selected" : ""}>${esc(x.nome)} · ${esc(x.cidade)}</option>`).join("")}<option value="outra">Minha casa não aparece na lista</option></select>` : ""}</div></div>
      <div id="form" style="display:flex;flex-direction:column;gap:12px;margin-top:12px">${formHtml(F_CASA, d, c?.status === "suspensa")}</div>
      <div class="err" id="ferr"></div><div class="barra-acoes"><button class="btn" id="salvar">Salvar rascunho</button><button class="btn pri" id="enviar">${c && ["habilitada"].includes(c.status) ? "Atualizar ficha" : "Enviar para habilitação"}</button></div>`;
    },
    conta() {
      const p = S.conta.perfil;
      const podeVincular = !p.codigo_acesso && !S.pac;
      return `<div class="tag">Conta</div><h1>${esc(p.nome || p.email)}</h1>
      <div class="card"><dl class="kv"><dt>E-mail</dt><dd>${esc(p.email)}</dd><dt>Perfil</dt><dd>${ROTULO[p.tipo]}</dd><dt>Vínculo na rede</dt><dd>${p.vinculo_nome ? `${esc(p.vinculo_nome)} <span class="badge b-good">métricas liberadas</span>` : `<span class="muted">ainda sem vínculo</span>`}</dd>
      ${!REAL ? `<dt>Modo</dt><dd><span class="badge b-warn">demonstração</span> os dados ficam só neste navegador</dd>` : ""}</dl></div>
      ${podeVincular ? `<h2>Tenho um código de acesso</h2><p class="sub">Se a equipe já te mandou um código (aquele XXXX-XXXX-XXXX), cole aqui para ligar esta conta ao seu histórico e às métricas da rede. Basta fazer isso uma vez.${["equipe", "adm"].includes(p.tipo) ? " Para a equipe e a administração, use o código interno de vocês." : ""}</p><div class="card login"><input id="vcod" placeholder="XXXX-XXXX-XXXX" autocomplete="off"><div class="err" id="verr"></div><button class="btn pri" id="vok">Vincular</button></div>` : ""}
      <div style="margin-top:20px"><button class="btn" id="sairConta">Sair da conta</button></div>`;
    },
    // ---------- equipe ----------
    curadoria() {
      const L = S.eq?.insc; if (!L) { carregarEquipe(); return carregando("fila de curadoria"); }
      const f = S.eqf ||= { status: "em_curadoria", faixa: "", q: "" };
      let ls = L.filter((i) => !f.status || i.status === f.status).filter((i) => !f.faixa || i.faixa === f.faixa);
      if (f.q) { const q = f.q.toLowerCase(); ls = ls.filter((i) => JSON.stringify(i.dados).toLowerCase().includes(q)); }
      const n = (s) => L.filter((i) => i.status === s).length;
      return `<div class="tag">Curadoria</div><h1>Fila de artistas</h1><p class="sub">Toda inscrição enviada passa pela pré-curadoria automática (pontuação de 0 a 100 e alertas). A equipe decide: aprovar, pedir ajustes ou não seguir.</p>
      <div class="grid g4">${kpi(n("em_curadoria"), "aguardando curadoria")}${kpi(n("ajustes"), "com ajustes pedidos")}${kpi(n("aprovada"), "aprovadas")}${kpi(n("rascunho"), "rascunhos não enviados")}</div>
      <div class="filters"><select id="eqStatus"><option value="">Todos os status</option>${Object.entries(STATUS_INSC).map(([k, [, t]]) => `<option value="${k}"${f.status === k ? " selected" : ""}>${t}</option>`).join("")}</select>
      <select id="eqFaixa"><option value="">Todas as faixas</option>${["Prioridade", "Avaliar", "Abaixo do corte"].map((x) => `<option${f.faixa === x ? " selected" : ""}>${x}</option>`).join("")}</select><input id="eqQ" placeholder="Buscar nome, cidade, gênero" value="${esc(f.q)}"></div>
      ${tabela("curad", [
        { t: "Artista", v: (i) => i.dados.nome_artistico, h: (i) => `<b>${esc(i.dados.nome_artistico || "(sem nome)")}</b><div class="muted" style="font-size:12px">${esc(i.dados.cidade_base || "")} ${esc(i.dados.estado || "")} · ${esc(i.dados.generos || "")}</div>` },
        { t: "Pontuação", n: 1, v: (i) => i.score, h: (i) => `<b>${i.score ?? "–"}</b>` },
        { t: "Faixa", v: (i) => i.faixa, h: (i) => i.faixa ? `<span class="badge ${i.faixa === "Prioridade" ? "b-good" : i.faixa === "Avaliar" ? "b-warn" : "b-serious"}">${i.faixa}</span>` : "–" },
        { t: "Formato", v: (i) => i.dados.formato_interesse },
        { t: "Alertas", v: (i) => (i.alertas || []).length, h: (i) => (i.alertas || []).map((a) => `<span class="pill">${esc(a)}</span>`).join("") || "–" },
        { t: "Status", v: (i) => i.status, h: (i) => badge(STATUS_INSC, i.status) },
        { t: "Enviada", v: (i) => i.enviado_em || "", h: (i) => i.enviado_em ? dt(i.enviado_em.slice(0, 10)) : "–" },
      ], ls.map((i) => ({ ...i, _click: "insc:" + i.id })), { i: 1, dir: -1 })}`;
    },
    casas_cad() {
      const L = S.eq?.casas; if (!L) { carregarEquipe(); return carregando("cadastros de casas"); }
      const n = (s) => L.filter((c) => c.status === s).length;
      return `<div class="tag">Casas</div><h1>Cadastros e habilitação</h1><p class="sub">Habilitar o suficiente para testar; qualificar pela execução. Classificação depois das datas: 🟢 confiável, 🟡 desenvolvimento, 🔴 correção necessária, ⛔ suspensa.</p>
      <div class="grid g4">${kpi(n("em_analise"), "aguardando análise")}${kpi(n("incompleto"), "faltando dados mínimos")}${kpi(n("habilitada"), "habilitadas")}${kpi(L.filter((c) => c.ja_parceira).length, "já parceiras")}</div>
      ${tabela("casc", [
        { t: "Casa", v: (c) => c.dados.nome, h: (c) => `<b>${esc(c.dados.nome || "(sem nome)")}</b><div class="muted" style="font-size:12px">${esc(c.dados.cidade || "")} · ${c.ja_parceira ? "já parceira" : "nova"}</div>` },
        { t: "Capacidade", n: 1, v: (c) => +c.dados.capacidade || null, h: (c) => fmt(+c.dados.capacidade || null) },
        { t: "Bloqueia habilitação", n: 1, v: (c) => c.pendencias?.habilitacao?.length ?? 0 },
        { t: "Bloqueia match", n: 1, v: (c) => c.pendencias?.match?.length ?? 0 },
        { t: "Status", v: (c) => c.status, h: (c) => badge(STATUS_CASA, c.status) },
        { t: "Classificação", v: (c) => c.classificacao, h: (c) => CLASSE[c.classificacao] || "–" },
      ], L.map((c) => ({ ...c, _click: "casacad:" + c.id })), { i: 4, dir: 1 })}`;
    },
    prontidao() {
      const E = S.eq; if (!E?.chk) { carregarEquipe(); return carregando("prontidão"); }
      const nomes = Object.fromEntries((E.perfis || []).map((p) => [p.id, p.vinculo_nome || p.nome || p.email]));
      const tipos = Object.fromEntries((E.perfis || []).map((p) => [p.id, p.tipo]));
      const evs = Object.fromEntries((S.pac?.eventos || []).map((e) => [e.id, e]));
      const grupos = {};
      for (const c of E.chk) (grupos[c.evento_id + "|" + c.user_id] ||= []).push(c);
      const linhas = Object.entries(grupos).map(([k, cs]) => {
        const [ev, u] = k.split("|"), e = evs[ev], modelo = tipos[u] === "casa" ? "casa" : "artista";
        const ps = e ? R.passosDaData(modelo, e.d, Object.fromEntries(cs.map((c) => [c.item, true])), hojeIso()) : [];
        return { ev, e, quem: nomes[u] || "–", modelo, feitos: cs.length, total: ps.length || (modelo === "casa" ? R.PASSOS_CASA.length : R.PASSOS_ARTISTA.length), atras: ps.filter((p) => p.atrasado).length };
      });
      return `<div class="tag">Prontidão</div><h1>Quem já fez o quê</h1><p class="sub">Checklists marcados por artistas e casas em cada data. A matriz consulta e só intervém quando há motivo (método V0.1: observabilidade, não microgestão).</p>
      ${tabela("pront", [
        { t: "Data", v: (l) => l.e?.d || "", h: (l) => l.e ? `<b>${dt(l.e.d)}</b> ${esc(l.e.c)}` : `<span class="muted">${esc(l.ev.slice(0, 8))}</span>` },
        { t: "Quem", v: (l) => l.quem, h: (l) => `${esc(l.quem)} <span class="muted">· ${l.modelo}</span>` },
        { t: "Feitos", n: 1, v: (l) => l.feitos / l.total, h: (l) => `${l.feitos}/${l.total}` },
        { t: "Atrasados", n: 1, v: (l) => l.atras, h: (l) => l.atras ? `<span class="badge b-crit">${l.atras}</span>` : "0" },
      ], linhas, { i: 0, dir: 1 })}
      <h2>Registros da noite</h2>
      ${tabela("regs", [
        { t: "Data", v: (r) => evs[r.evento_id]?.d || r.criado_em, h: (r) => evs[r.evento_id] ? `${dt(evs[r.evento_id].d)} · ${esc(evs[r.evento_id].c)}` : dt(r.criado_em.slice(0, 10)) },
        { t: "Casa", v: (r) => nomes[r.user_id] },
        { t: "Público", n: 1, v: (r) => r.publico, h: (r) => fmt(r.publico) },
        { t: "Ocorrência", v: (r) => r.ocorrencia, h: (r) => r.ocorrencia ? `${r.gravidade === "excecao" ? '<span class="badge b-crit">exceção crítica</span> ' : '<span class="badge">ordinária</span> '}${esc(r.ocorrencia)}${r.como_resolveu ? `<div class="muted" style="font-size:12px">Resolução: ${esc(r.como_resolveu)}</div>` : ""}` : "–" },
      ], E.reg || [], { i: 0, dir: -1 })}`;
    },
    pessoas() {
      const E = S.eq; if (!E?.perfis) { carregarEquipe(); return carregando("pessoas"); }
      return `<div class="tag">Pessoas</div><h1>Contas na plataforma</h1><p class="sub">Artistas e casas criam a própria conta. Equipe e administração só são definidas aqui. O vínculo liga a conta ao histórico da artista ou da casa no Notion e libera as métricas dela.</p>
      ${tabela("pess", [
        { t: "Pessoa", v: (p) => p.nome || p.email, h: (p) => `<b>${esc(p.nome || "–")}</b><div class="muted" style="font-size:12px">${esc(p.email)}</div>` },
        { t: "Perfil", v: (p) => p.tipo, h: (p) => `<select data-tipo="${p.id}">${Object.entries(ROTULO).map(([k, t]) => `<option value="${k}"${p.tipo === k ? " selected" : ""}>${t}</option>`).join("")}</select>` },
        { t: "Vínculo", v: (p) => p.vinculo_nome || "", h: (p) => ["artista", "casa"].includes(p.tipo) ? seletorVinculo(p) : "–" },
        { t: "Criada", v: (p) => p.criado_em, h: (p) => dt(p.criado_em.slice(0, 10)) },
      ], E.perfis, { i: 3, dir: -1 })}`;
    },
  };

  function passosArtista() {
    const p = S.conta.perfil, i = S.conta.insc, evs = eventosDaConta();
    const etapas = ["Inscrição", "Pré-curadoria", "Curadoria", "Aprovada", "Proposta de data", "Contrato e handoff", "Pré-show", "Show", "Pós-show"];
    let etapa = 0, agora = "";
    if (!i || i.status === "rascunho") {
      const falta = faltando(F_ARTISTA, i?.dados || {});
      agora = `<div class="alert warn"><b>Complete e envie sua inscrição</b>${falta.length ? `Faltam ${falta.length} campos obrigatórios.` : "Está tudo preenchido: falta só enviar."} <a href="#" data-ir="inscricao">Abrir inscrição</a></div>`;
    } else if (i.status === "ajustes") {
      agora = `<div class="alert warn"><b>A curadoria pediu ajustes</b>${esc(i.parecer || "")} <a href="#" data-ir="inscricao">Editar e reenviar</a></div>`;
    } else if (i.status === "em_curadoria") {
      etapa = 2; agora = `<div class="alert"><b>Sua inscrição está com a curadoria</b>A equipe avalia por ordem de chegada e a resposta aparece aqui. Enquanto isso, nada a fazer.</div>${medidor({ score: i.score, faixa: i.faixa, detalhe: i.score_detalhe, alertas: i.alertas || [] })}`;
    } else if (i.status === "reprovada" || i.status === "reprovada_pre") {
      etapa = 2; agora = `<div class="alert crit"><b>Desta vez a inscrição não seguiu</b>${esc(i.parecer || "A curadoria não abriu datas para este momento.")}</div>`;
    } else if (i.status === "aprovada") {
      const futuras = evs.filter((e) => e.d >= hojeIso());
      etapa = futuras.length ? 6 : evs.length ? 8 : 4;
      if (!p.codigo_acesso) agora = `<div class="alert good"><b>Você foi aprovada na rede${i.parecer ? "" : "!"}</b>${esc(i.parecer || "")} Próximo passo: a equipe propõe datas e cidades. Quando a primeira data for confirmada, os passos de cada show aparecem aqui.</div>
        <div class="card"><b>Enquanto isso</b><ul class="passos"><li>Confira se o release, a foto e os links estão atualizados: eles vão para a sua página no site do Tranquilo.</li><li>Mantenha a disponibilidade e as cidades de interesse em dia.</li><li>Se a equipe te mandou um código de acesso, vincule na aba Conta.</li></ul></div>`;
      else if (!evs.length) agora = `<div class="alert good"><b>Aprovada e vinculada como ${esc(p.vinculo_nome)}</b>Nenhuma data em andamento agora. Quando uma data for confirmada, os passos aparecem aqui.</div>`;
    }
    if (p.codigo_acesso && evs.length && (!i || i.status === "aprovada" || !i)) etapa = Math.max(etapa, 6);
    return `<div class="tag">Artista</div><h1>Olá, ${esc(p.nome || i?.dados?.nome_artistico || "")}</h1>
    <p class="sub">Aqui fica o que você precisa fazer em cada etapa, do cadastro ao pós-show.</p>
    ${linhaTempo(etapas, etapa)}${agora}
    ${evs.length ? `<h2>Suas datas</h2><p class="sub">Passo a passo de cada show, com prazo contado a partir da data. Marque o que já fez: a equipe acompanha por aqui.</p><div class="list">${evs.map((e) => blocoPassos(e, "artista")).join("")}</div>` : ""}`;
  }
  function passosCasa() {
    const p = S.conta.perfil, c = S.conta.casa, evs = eventosDaConta();
    const etapas = ["Cadastro", "Dados mínimos", "Análise da equipe", "Habilitada", "Primeira data", "Classificação"];
    let etapa = 0, agora = "";
    const pend = c?.pendencias || R.pendenciasCasa(c?.dados || {});
    const listaPend = `<div class="grid g3" style="margin-top:10px">${[["habilitacao", "Bloqueia a habilitação", "b-crit"], ["match", "Bloqueia alguns matches", "b-warn"], ["enriquecimento", "Enriquece a ficha", ""]].map(([k, t, cl]) => `<div class="card"><b>${t}</b> <span class="badge ${cl}">${pend[k].length}</span><ul class="passos">${pend[k].map((x) => `<li>${esc(x)}</li>`).join("") || "<li class='muted'>Nada pendente</li>"}</ul></div>`).join("")}</div>`;
    if (!c || c.status === "rascunho") agora = `<div class="alert warn"><b>Complete o cadastro da casa</b>Com os dados mínimos, a casa entra na fila de habilitação. <a href="#" data-ir="cadastro_casa">Abrir cadastro</a></div>${listaPend}`;
    else if (c.status === "incompleto") { etapa = 1; agora = `<div class="alert crit"><b>Faltam dados mínimos para habilitar</b><a href="#" data-ir="cadastro_casa">Completar cadastro</a></div>${listaPend}`; }
    else if (c.status === "em_analise") { etapa = 2; agora = `<div class="alert"><b>Cadastro com a equipe</b>A equipe confere os dados e responde aqui.</div>${listaPend}`; }
    else if (c.status === "ajustes") { etapa = 1; agora = `<div class="alert warn"><b>A equipe pediu ajustes</b>${esc(c.parecer || "")} <a href="#" data-ir="cadastro_casa">Editar cadastro</a></div>${listaPend}`; }
    else if (c.status === "suspensa") { etapa = 5; agora = `<div class="alert crit"><b>Casa suspensa</b>${esc(c.parecer || "Fale com a equipe do Tranquilo.")}</div>`; }
    else if (c.status === "habilitada") {
      etapa = c.classificacao ? 5 : evs.length ? 4 : 3;
      agora = `<div class="alert good"><b>Casa habilitada${c.classificacao ? ` · ${CLASSE[c.classificacao]}` : ""}</b>${esc(c.parecer || "")} ${evs.length ? "" : "Próximo passo: a primeira data é um teste real. Quando ela for confirmada, o passo a passo aparece aqui."}</div>${pend.match.length ? listaPend : ""}`;
    }
    if (!c && p.codigo_acesso && evs.length) etapa = 4;
    return `<div class="tag">Casa</div><h1>${esc(p.vinculo_nome || c?.dados?.nome || p.nome || "Sua casa")}</h1>
    <p class="sub">Depois do handoff, a casa produz a data e registra prontidão, público e ocorrências. O Tranquilo acompanha por aqui, sem precisar perguntar.</p>
    ${linhaTempo(etapas, etapa)}${agora}
    ${evs.length ? `<h2>Suas datas</h2><div class="list">${evs.map((e) => blocoPassos(e, "casa")).join("")}</div>` : ""}
    ${S.conta.reg.length ? `<h2>Noites registradas</h2><div class="list">${S.conta.reg.map((r) => `<div class="card row"><span>${esc(S.pac?.eventos.find((e) => e.id === r.evento_id)?.n || r.evento_id)}</span><span>${r.publico != null ? fmt(r.publico) + " pessoas" : ""} ${r.gravidade === "excecao" ? '<span class="badge b-crit">exceção</span>' : ""}</span></div>`).join("")}</div>` : ""}`;
  }

  const CLASSE = { confiavel: "🟢 Confiável", desenvolvimento: "🟡 Desenvolvimento", correcao: "🔴 Correção necessária", suspenso: "⛔ Suspensa" };
  const carregando = (o) => `<p class="muted">Carregando ${o}…</p>`;
  async function carregarEquipe() {
    if (S.eqCarregando) return; S.eqCarregando = true;
    try {
      const quem = S.conta?.perfil.id;
      const [insc, casas, perfis, chk, reg] = await Promise.all([api.inscricoes(), api.casas(), api.perfis(), api.checklistTodos(), api.registrosTodos()]);
      if (S.conta?.perfil.id !== quem) return;   // a conta mudou enquanto carregava
      S.eq = { insc, casas, perfis, chk, reg };
    } catch (e) {
      if (!S.conta) return;
      S.eq = { insc: [], casas: [], perfis: [], chk: [], reg: [] }; alert("Não foi possível carregar: " + e.message);
    } finally { S.eqCarregando = false; }
    render();
  }
  function seletorVinculo(p) {
    const acessos = (S.pac?.acessos || []).filter((a) => a.tipo === p.tipo);
    if (!acessos.length) return p.vinculo_nome ? esc(p.vinculo_nome) : `<span class="muted">entre com o código de adm para vincular</span>`;
    return `<select data-vinculo="${p.id}"><option value="">Sem vínculo</option>${acessos.map((a) => `<option value="${esc(a.codigo)}|${esc(a.nome)}"${p.codigo_acesso === a.codigo ? " selected" : ""}>${esc(a.nome)}${a.cidades ? " · " + esc(a.cidades) : ""}</option>`).join("")}</select>`;
  }

  // ---------- fichas para a equipe ----------
  function fichaInscricao(id) {
    const i = S.eq.insc.find((x) => x.id === id); if (!i) return;
    const d = i.dados, adm = S.conta.perfil.tipo === "adm";
    const resp = F_ARTISTA.map(([t, cs]) => `<h3>${esc(t)}</h3><dl class="kv">${cs.map(([k, rot, tipo, opts]) => { let v = d[k]; if (tipo === "select") v = (opts.find(([o]) => o === v) || [, v])[1]; if (tipo === "cidades") v = (v || []).join(", "); if (tipo === "check") v = v === "true" ? "Sim" : "Não"; const link = tipo === "url" && v ? `<a href="${esc(v)}" target="_blank" rel="noopener">${esc(v)}</a>` : esc(v || "–"); return `<dt>${esc(rot)}</dt><dd>${link}</dd>`; }).join("")}</dl>`).join("");
    $("#dlgIn").innerHTML = `<div class="tag">Inscrição · ${badge(STATUS_INSC, i.status)}</div><h2 style="margin-top:4px">${esc(d.nome_artistico || "(sem nome)")}</h2><p class="muted">${esc(i.perfil?.email || "")}${i.enviado_em ? ` · enviada em ${dt(i.enviado_em.slice(0, 10))}` : ""}</p>
    ${medidor({ score: i.score ?? 0, faixa: i.faixa || "–", detalhe: i.score_detalhe || { completude: 0, tracao: 0, tecnica: 0, circulacao: 0, condicoes: 0 }, alertas: i.alertas || [] })}
    ${resp}
    <h3>Decisão</h3><label class="fcampo"><b>Mensagem para a artista</b><textarea id="parecer" rows="3">${esc(i.parecer || "")}</textarea></label>
    <label class="fcampo"><b>Nota interna (só a equipe vê)</b><textarea id="nota" rows="2">${esc(i.nota_interna || "")}</textarea></label>
    ${adm && i.perfil ? `<label class="fcampo"><b>Vincular à artista da rede (libera métricas)</b>${seletorVinculo(i.perfil)}</label>` : ""}
    <div class="barra-acoes"><button class="btn pri" data-decisao="aprovada">Aprovar</button><button class="btn" data-decisao="ajustes">Pedir ajustes</button><button class="btn" data-decisao="reprovada">Não seguir</button><button class="btn" data-copiar-ficha>Copiar ficha</button><button class="btn" onclick="dlg.close()">Fechar</button></div><div class="err" id="derr"></div>`;
    $("#dlg").dataset.alvo = "insc:" + id; $("#dlg").showModal();
  }
  function fichaCasa(id) {
    const c = S.eq.casas.find((x) => x.id === id); if (!c) return;
    const d = c.dados, adm = S.conta.perfil.tipo === "adm", pend = c.pendencias || R.pendenciasCasa(d);
    const resp = F_CASA.map(([t, cs]) => `<h3>${esc(t)}</h3><dl class="kv">${cs.map(([k, rot, tipo, opts]) => { let v = d[k]; if (tipo === "select") v = (opts.find(([o]) => o === v) || [, v])[1]; if (tipo === "check") v = v === "true" ? "Sim" : "Não"; return `<dt>${esc(rot.length > 60 ? rot.slice(0, 60) + "…" : rot)}</dt><dd>${esc(v || "–")}</dd>`; }).join("")}</dl>`).join("");
    $("#dlgIn").innerHTML = `<div class="tag">Casa · ${badge(STATUS_CASA, c.status)}</div><h2 style="margin-top:4px">${esc(d.nome || "(sem nome)")}</h2><p class="muted">${esc(c.perfil?.email || "")} · ${c.ja_parceira ? "já parceira" + (c.notion_casa_id && c.notion_casa_id !== "outra" ? ` · <a href="https://www.notion.so/${esc(c.notion_casa_id)}" target="_blank" rel="noopener">ficha no Notion</a>` : "") : "casa nova"}</p>
    <div class="grid g3">${[["habilitacao", "Bloqueia habilitação"], ["match", "Bloqueia match"], ["enriquecimento", "Enriquecimento"]].map(([k, t]) => `<div class="card"><b>${t}</b> (${pend[k].length})<div style="font-size:13px">${pend[k].map(esc).join(" · ") || "ok"}</div></div>`).join("")}</div>
    ${resp}
    <h3>Decisão</h3><label class="fcampo"><b>Classificação</b><select id="classe"><option value="">Sem classificação (antes da 1ª data)</option>${Object.entries(CLASSE).map(([k, t]) => `<option value="${k}"${c.classificacao === k ? " selected" : ""}>${t}</option>`).join("")}</select></label>
    <label class="fcampo"><b>Mensagem para a casa</b><textarea id="parecer" rows="3">${esc(c.parecer || "")}</textarea></label>
    <label class="fcampo"><b>Nota interna</b><textarea id="nota" rows="2">${esc(c.nota_interna || "")}</textarea></label>
    ${adm && c.perfil ? `<label class="fcampo"><b>Vincular à casa da rede (libera métricas)</b>${seletorVinculo(c.perfil)}</label>` : ""}
    <div class="barra-acoes"><button class="btn pri" data-decisao="habilitada">Habilitar</button><button class="btn" data-decisao="ajustes">Pedir ajustes</button><button class="btn" data-decisao="suspensa">Suspender</button><button class="btn" data-decisao="">Só salvar</button><button class="btn" onclick="dlg.close()">Fechar</button></div><div class="err" id="derr"></div>`;
    $("#dlg").dataset.alvo = "casa:" + id; $("#dlg").showModal();
  }
  function fichaRegistro(eventoId) {
    const e = S.pac?.eventos.find((x) => x.id === eventoId);
    $("#dlgIn").innerHTML = `<div class="tag">Registrar a noite</div><h2 style="margin-top:4px">${e ? `${dt(e.d)} · ${esc(e.c)}` : ""}</h2><p class="sub">Problema ordinário: resolva e registre. Exceção crítica: registre e avise a equipe na hora.</p>
    <label class="fcampo"><b>Público presente (pessoas)</b><input id="rpub" type="number" min="0" inputmode="numeric"></label>
    <label class="fcampo"><b>Ocorrência (opcional)</b><textarea id="rocc" rows="3" placeholder="O que aconteceu"></textarea></label>
    <label class="fcampo"><b>Gravidade</b><select id="rgrav"><option value="ordinaria">Ordinária: resolvida pela casa</option><option value="excecao">Exceção crítica: precisa do Tranquilo</option></select></label>
    <label class="fcampo"><b>Como resolveu</b><textarea id="rres" rows="2"></textarea></label>
    <div class="barra-acoes"><button class="btn pri" id="rsalvar">Registrar</button><button class="btn" onclick="dlg.close()">Cancelar</button></div><div class="err" id="derr"></div>`;
    $("#dlg").dataset.alvo = "reg:" + eventoId; $("#dlg").showModal();
  }

  // ---------- entrada (público) ----------
  function formEntrada() {
    const modo = S.entrada || "entrar";
    const demo = REAL ? "" : `<div class="alert warn" style="margin-bottom:12px"><b>Modo demonstração</b>As contas e respostas ficam só neste navegador, para testar os fluxos. Atalhos: <a href="#" data-demo="equipe">entrar como equipe</a> · <a href="#" data-demo="adm">entrar como administração</a></div>`;
    const tipoSel = S.tipoNovo || "artista";
    const email = modo === "criar" ? `<h3 style="margin-top:0">Criar conta</h3>
      <div class="filters" style="margin-top:0"><label class="fcheck"><input type="radio" name="tipoNovo" value="artista"${tipoSel === "artista" ? " checked" : ""}> Sou artista</label><label class="fcheck"><input type="radio" name="tipoNovo" value="casa"${tipoSel === "casa" ? " checked" : ""}> Sou uma casa</label></div>
      <label class="fcampo"><b>${tipoSel === "casa" ? "Seu nome (responsável)" : "Nome artístico"}</b><input id="enome" autocomplete="name"></label>
      <label class="fcampo"><b>E-mail</b><input id="email" type="email" autocomplete="email"></label>
      <label class="fcampo"><b>Senha</b><input id="esenha" type="password" autocomplete="new-password" minlength="6"></label>
      <div class="err" id="eerr"></div><button class="btn pri" id="eok">Criar conta</button>
      <p class="muted" style="font-size:13px">Já tem conta? <a href="#" data-entrada="entrar">Entrar</a></p>`
      : `<h3 style="margin-top:0">Entrar com e-mail</h3>
      <label class="fcampo"><b>E-mail</b><input id="email" type="email" autocomplete="email"></label>
      <label class="fcampo"><b>Senha</b><input id="esenha" type="password" autocomplete="current-password"></label>
      <div class="err" id="eerr"></div><button class="btn pri" id="eok">Entrar</button>
      <p class="muted" style="font-size:13px"><a href="#" data-entrada="criar">Criar conta de artista ou casa</a> · <a href="#" id="esqueci">Esqueci a senha</a></p>`;
    return `${demo}<div class="grid g2"><div class="card login" style="max-width:none">${email}</div><div class="card login" style="max-width:none"><h3 style="margin-top:0">Tenho um código de acesso</h3>${formLogin()}</div></div>`;
  }
  async function aposEntrar(perfil) { await carregar(perfil); render(); scrollTo(0, 0); }

  // ---------- eventos ----------
  document.addEventListener("click", async (ev) => {
    const t = ev.target;
    const ir = t.closest("[data-ir]"); if (ir) { ev.preventDefault(); S.aba = ir.dataset.ir; render(); scrollTo(0, 0); return; }
    const ent = t.closest("[data-entrada]"); if (ent) { ev.preventDefault(); S.entrada = ent.dataset.entrada; render(); $("#email")?.scrollIntoView({ block: "center" }); return; }
    const dm = t.closest("[data-demo]"); if (dm) {
      ev.preventDefault(); const tipo = dm.dataset.demo, email = `${tipo}@demo.tranquilo`;
      try { await api.entrar(email, "demo123"); } catch { await api.cadastrar({ email, senha: "demo123", nome: tipo === "adm" ? "Administração (demo)" : "Equipe (demo)", tipo }); }
      return aposEntrar(await api.sessao());
    }
    if (t.id === "eok") {
      const email = $("#email").value.trim(), senha = $("#esenha").value, err = $("#eerr");
      err.textContent = "Aguarde…";
      try {
        if ((S.entrada || "entrar") === "criar") {
          const nome = $("#enome").value.trim();
          if (!nome || !email || senha.length < 6) { err.textContent = "Preencha nome, e-mail e uma senha com pelo menos 6 caracteres."; return; }
          const r = await api.cadastrar({ email, senha, nome, tipo: S.tipoNovo || "artista" });
          if (r.confirmar) { err.textContent = ""; $("#eok").outerHTML = `<div class="alert good"><b>Confira seu e-mail</b>Enviamos um link de confirmação para ${esc(email)}. Depois de confirmar, entre com e-mail e senha.</div>`; return; }
          return aposEntrar(r.perfil);
        }
        return aposEntrar(await api.entrar(email, senha));
      } catch (e) { err.textContent = e.message; }
      return;
    }
    if (t.id === "esqueci") {
      ev.preventDefault(); const email = $("#email").value.trim();
      if (!email) { $("#eerr").textContent = "Escreva seu e-mail acima e clique de novo."; return; }
      await api.recuperar(email); $("#eerr").textContent = REAL ? "Se houver conta, enviamos um link para trocar a senha." : "No modo demonstração não há envio de e-mail.";
      return;
    }
    if (t.id === "salvar" || t.id === "enviar") {
      const enviar = t.id === "enviar", raiz = $("#form"), d = lerForm(raiz), err = $("#ferr");
      const casa = S.conta.perfil.tipo === "casa";
      const falta = faltando(casa ? F_CASA : F_ARTISTA, d);
      if (enviar && falta.length && !casa) { err.textContent = `Faltam: ${falta.join(", ")}.`; return; }
      err.textContent = "Salvando…";
      try {
        if (casa) {
          const parceira = document.querySelector('input[name="parceira"]:checked')?.value === "sim";
          S.conta.casa = await api.salvarCasa(d, { enviar, ja_parceira: parceira, notion_casa_id: parceira ? $("#casaNotion")?.value : null });
        } else S.conta.insc = await api.salvarInscricao(d, enviar);
        err.textContent = "";
        if (enviar) { S.aba = "passos"; render(); scrollTo(0, 0); } else { render(); $("#ferr").textContent = "Rascunho salvo."; }
      } catch (e) { err.textContent = e.message; }
      return;
    }
    if (t.id === "vok") {
      const cod = $("#vcod").value, err = $("#verr"); err.textContent = "Conferindo…";
      try {
        const pac = await abrirPacote(cod);
        if (pac.perfil !== S.conta.perfil.tipo) { err.textContent = `Este código é de ${PERFIS[pac.perfil].rotulo.toLowerCase()}, e a conta é de ${ROTULO[S.conta.perfil.tipo].toLowerCase()}.`; return; }
        await api.vincularCodigo(normCod(cod).replace(/(.{4})(.{4})(.{4})/, "$1-$2-$3"), pac.nome);
        return recarregar();
      } catch (e) { err.textContent = e.message; }
      return;
    }
    if (t.id === "sairConta") { await sairDeTudo(); return; }
    const reg = t.closest("[data-registrar]"); if (reg) return fichaRegistro(reg.dataset.registrar);
    if (t.id === "rsalvar") {
      const eventoId = $("#dlg").dataset.alvo.slice(4), pub = $("#rpub").value;
      try {
        await api.registrar(eventoId, { publico: pub === "" ? null : +pub, ocorrencia: $("#rocc").value.trim() || null, gravidade: $("#rgrav").value, como_resolveu: $("#rres").value.trim() || null });
        S.conta.reg = await api.meusRegistros();
        const chk = S.conta.chk; if (!chk.some((c) => c.evento_id === eventoId && c.item === "publico")) { await api.marcar(eventoId, "publico", true); S.conta.chk = await api.meuChecklist(); }
        $("#dlg").close(); render();
      } catch (e) { $("#derr").textContent = e.message; }
      return;
    }
    const dec = t.closest("[data-decisao]"); if (dec) {
      const [tipo, id] = $("#dlg").dataset.alvo.split(":"), status = dec.dataset.decisao;
      const campos = { parecer: $("#parecer").value.trim() || null, nota_interna: $("#nota").value.trim() || null };
      if (status) campos.status = status;
      if (tipo === "casa") campos.classificacao = $("#classe").value || null;
      if (status === "ajustes" && !campos.parecer) { $("#derr").textContent = "Escreva na mensagem o que precisa ser ajustado."; return; }
      try {
        if (tipo === "insc") await api.avaliarInscricao(id, campos); else await api.avaliarCasa(id, campos);
        const v = $("#dlg").querySelector("[data-vinculo]");
        if (v) { const [codigo, nome] = v.value ? v.value.split("|") : [null, null]; const p = (S.eq.perfis || []).find((x) => x.id === v.dataset.vinculo); if (p && p.codigo_acesso !== codigo) await api.atualizarPerfil(p.id, { codigo_acesso: codigo, vinculo_nome: nome }); }
        $("#dlg").close(); S.eq = null; render();
      } catch (e) { $("#derr").textContent = e.message; }
      return;
    }
    if (t.closest("[data-copiar-ficha]")) {
      const i = S.eq.insc.find((x) => "insc:" + x.id === $("#dlg").dataset.alvo), d = i.dados;
      const txt = [`Nome artístico: ${d.nome_artistico}`, `Cidade: ${d.cidade_base}/${d.estado}`, `Gêneros: ${d.generos}`, `Instagram: ${d.instagram}`, `Spotify: ${d.spotify}`, `Contato: ${d.whatsapp} ${d.contato_producao || ""}`, `Rider: ${d.rider_tipo} ${d.rider_link || ""}`, `Cidades: ${(d.cidades_interesse || []).join(", ")}`, `Pré-curadoria: ${i.score}/100 (${i.faixa})`, `Mini release: ${d.release}`].join("\n");
      navigator.clipboard?.writeText(txt); t.textContent = "Copiada"; return;
    }
    const cl = t.closest("[data-click]");
    if (cl && /^(insc|casacad):/.test(cl.dataset.click)) { ev.stopImmediatePropagation(); const [k, id] = cl.dataset.click.split(":"); return k === "insc" ? fichaInscricao(id) : fichaCasa(id); }
  }, true);

  document.addEventListener("change", async (ev) => {
    const t = ev.target;
    if (t.name === "tipoNovo") { S.tipoNovo = t.value; const n = $("#enome")?.value, e = $("#email")?.value; render(); if ($("#enome")) { $("#enome").value = n || ""; $("#email").value = e || ""; } return; }
    if (t.name === "parceira") { S.casaParceira = t.value === "sim"; const d = lerForm($("#form")); render(); $("#form").innerHTML = formHtml(F_CASA, d, false); return; }
    if (t.id === "casaNotion" && t.value && t.value !== "outra") {
      const c = (S.pub.casas || []).find((x) => x.id === t.value);
      if (c) { const n = document.querySelector('[data-k="nome"]'), ci = document.querySelector('[data-k="cidade"]'); if (n && !n.value) n.value = /^Casa em/.test(c.nome) ? "" : c.nome; if (ci && !ci.value) ci.value = c.cidade; }
      return;
    }
    const ps = t.dataset?.passo; if (ps) {
      const [eventoId, item] = ps.split("|");
      try { await api.marcar(eventoId, item, t.checked); S.conta.chk = await api.meuChecklist(); const aberto = t.closest("details")?.open; render(); if (aberto) document.querySelectorAll("details").forEach((d) => { if (d.querySelector(`[data-passo^="${eventoId}|"]`)) d.open = true; }); }
      catch (e) { alert(e.message); t.checked = !t.checked; }
      return;
    }
    if (t.dataset?.tipo) { try { await api.atualizarPerfil(t.dataset.tipo, { tipo: t.value }); S.eq = null; render(); } catch (e) { alert(e.message); } return; }
    if (t.dataset?.vinculo && !t.closest("dialog")) {
      const [codigo, nome] = t.value ? t.value.split("|") : [null, null];
      try { await api.atualizarPerfil(t.dataset.vinculo, { codigo_acesso: codigo, vinculo_nome: nome }); S.eq = null; render(); } catch (e) { alert(e.message); }
      return;
    }
    if (t.id === "eqStatus" || t.id === "eqFaixa") { S.eqf[t.id === "eqStatus" ? "status" : "faixa"] = t.value; render(); }
  });
  document.addEventListener("input", (ev) => {
    const t = ev.target;
    if (t.closest("#form") && S.aba === "inscricao") { const m = $("#medidor"); if (m) m.innerHTML = medidor(R.preCuradoria(lerForm($("#form")))); }
    if (t.id === "eqQ") { S.eqf.q = t.value; clearTimeout(S.tq); S.tq = setTimeout(() => { render(); const i = $("#eqQ"); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 250); }
  });

  async function sairDeTudo() { S.conta = null; await api?.sair(); store.del("tq-codigo"); S.conta = null; S.pac = null; S.eq = null; render(); scrollTo(0, 0); }

  return { REAL, iniciar, abas, rotuloQuem, telas: TELAS, formEntrada, sairDeTudo };
})();
