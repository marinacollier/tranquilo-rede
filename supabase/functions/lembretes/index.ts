// Lembretes de prazo por e-mail para artistas e casas (Supabase Edge Function, roda uma vez por dia pelo pg_cron).
//
// Para cada data futura da agenda (public.json do site), acha as contas vinculadas (artista pelo nome no line-up,
// casa pelo nome da casa), calcula os passos do passo a passo e avisa:
//   · 3 dias antes do prazo ("faltam 3 dias") e · no dia do prazo ("é hoje"),
// só para passos ainda não marcados como feitos. Cada aviso é gravado em `lembretes` e nunca sai duas vezes.
//
// Tabela config_interna (só o sistema lê; nenhuma conta acessa):
//   lembretes_chave   o pg_cron manda no cabeçalho x-chave (ninguém de fora dispara).
//   lembretes_ativos  "sim" para enviar de verdade. Sem isso roda em ENSAIO: grava o que mandaria e não envia.
// Segredos do e-mail (Edge Functions → Secrets), um dos dois:
//     RESEND_API_KEY + EMAIL_REMETENTE ("Rede Tranquilo <avisos@seudominio>")
//     SMTP_HOST, SMTP_PORT (465), SMTP_USER, SMTP_PASS, EMAIL_REMETENTE (ex.: o mesmo gmail do SMTP do Auth)
//   SITE_URL          opcional (padrão: https://marinacollier.github.io/tranquilo-rede/)
import { createClient } from "npm:@supabase/supabase-js@2.117.2";

// Mesmos passos de src/regras.js (PASSOS_ARTISTA / PASSOS_CASA). Se mudar lá, mude aqui.
const PASSOS: Record<string, [string, number, string][]> = {
  artista: [
    ["contrato", -35, "Ler e assinar o contrato"], ["formacao", -28, "Fechar formação e equipe"], ["rider", -28, "Enviar rider técnico e mapa de palco"],
    ["som", -21, "Validar o som com a casa"], ["logistica", -21, "Confirmar logística"], ["divulgacao", -15, "Começar a divulgação"],
    ["horarios", -7, "Confirmar horários e acompanhantes"], ["roteiro", -2, "Revisar o roteiro da noite"], ["passagem", 0, "Chegar e fazer a passagem de som"],
    ["pagamento", 1, "Enviar nota fiscal ou recibo"], ["feedback", 3, "Contar como foi"],
  ],
  casa: [
    ["handoff", -30, "Receber a data repassada pelo Tranquilo"], ["ficha", -28, "Revisar a ficha da casa para este formato"], ["rider", -28, "Conferir o rider do artista"],
    ["tecnico", -21, "Confirmar técnico de som e setup"], ["roteiro", -21, "Fechar o roteiro do dia"], ["escrito", -14, "Confirmar tudo por escrito"],
    ["travas", -7, "Travas finais"], ["prontidao", 0, "Prontidão da noite"], ["publico", 0, "Registrar o público e as ocorrências"],
    ["fechamento", 1, "Fechamento e prestação de contas"],
  ],
};
const chave = (s: string) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const diaSP = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
const somar = (iso: string, dias: number) => new Date(new Date(iso + "T12:00:00Z").getTime() + dias * 864e5).toISOString().slice(0, 10);
const br = (iso: string) => iso.split("-").reverse().join("/");
const esc = (s: string) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

async function enviarEmail(para: string, assunto: string, html: string) {
  const de = Deno.env.get("EMAIL_REMETENTE") || Deno.env.get("SMTP_USER") || "";
  const resend = Deno.env.get("RESEND_API_KEY");
  if (resend) {
    const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${resend}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: de, to: [para], subject: assunto, html }) });
    if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return;
  }
  if (!Deno.env.get("SMTP_HOST")) throw new Error("e-mail não configurado (SMTP_HOST ou RESEND_API_KEY)");
  const nodemailer = (await import("npm:nodemailer@6.9.16")).default;
  const porta = Number(Deno.env.get("SMTP_PORT") || 465);
  const t = nodemailer.createTransport({ host: Deno.env.get("SMTP_HOST"), port: porta, secure: porta === 465, auth: { user: Deno.env.get("SMTP_USER"), pass: Deno.env.get("SMTP_PASS") } });
  await t.sendMail({ from: de, to: para, subject: assunto, html });
}

Deno.serve(async (req) => {
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: cfg } = await sb.from("config_interna").select("nome,valor").in("nome", ["lembretes_chave", "lembretes_ativos"]);
  const conf = Object.fromEntries((cfg || []).map((c) => [c.nome, c.valor]));
  if (!conf.lembretes_chave || req.headers.get("x-chave") !== conf.lembretes_chave) return new Response("não autorizado", { status: 401 });
  const ativo = conf.lembretes_ativos === "sim";
  const site = Deno.env.get("SITE_URL") || "https://marinacollier.github.io/tranquilo-rede/";

  const pub = await (await fetch(site + "public.json", { cache: "no-store" })).json();
  const hoje = diaSP(), em3 = somar(hoje, 3);
  const { data: perfis } = await sb.from("perfis").select("id,email,tipo,nome,vinculo_nome").in("tipo", ["artista", "casa"]).not("vinculo_nome", "is", null);
  const { data: chk } = await sb.from("checklist").select("user_id,evento_id,item,feito").eq("feito", true);
  const feito = new Set((chk || []).map((c) => `${c.user_id}|${c.evento_id}|${c.item}`));
  const porNome: Record<string, typeof perfis> = {};
  for (const p of perfis || []) (porNome[`${p.tipo}|${chave(p.vinculo_nome)}`] ||= []).push(p);

  const resumo = { modo: ativo ? "envio" : "ensaio", hoje, avaliados: 0, enviados: 0, ensaio: 0, ja_avisados: 0, erros: [] as string[] };
  for (const e of pub.agenda || []) {
    if (!e.id) continue;
    const alvos = [
      ...(e.a || []).flatMap((n: string) => porNome[`artista|${chave(n)}`] || []).map((p: any) => [p, "artista"] as const),
      ...(porNome[`casa|${chave(e.h)}`] || []).map((p: any) => [p, "casa"] as const),
    ];
    for (const [p, tipo] of alvos) {
      for (const [item, dias, titulo] of PASSOS[tipo]) {
        const prazo = somar(e.d, dias);
        const momento = prazo === em3 ? "D-3" : prazo === hoje ? "hoje" : null;
        if (!momento || feito.has(`${p.id}|${e.id}|${item}`)) continue;
        resumo.avaliados++;
        const reg = { user_id: p.id, evento_id: e.id, item, momento: ativo ? momento : `${momento}:ensaio`, situacao: ativo ? "enviado" : "ensaio", detalhe: `${titulo} · ${br(e.d)} ${e.c}` };
        const { data: novo } = await sb.from("lembretes").upsert(reg, { onConflict: "user_id,evento_id,item,momento", ignoreDuplicates: true }).select();
        if (!novo?.length) { resumo.ja_avisados++; continue; }
        if (!ativo) { resumo.ensaio++; continue; }
        const quando = momento === "hoje" ? "É hoje" : "Faltam 3 dias";
        const html = `<p>Oi${p.nome ? ", " + esc(p.nome.split(" ")[0]) : ""}!</p><p><b>${quando}: ${esc(titulo)}</b><br>Show em ${esc(e.c)}, ${br(e.d)}${e.h && !/^Casa (em|da rede)/.test(e.h) ? " · " + esc(e.h) : ""}. Prazo deste passo: ${br(prazo)}.</p>
          <p>Já fez? Marque como feito no seu painel para a equipe acompanhar:<br><a href="${site}#/passos">Abrir meu passo a passo</a></p><p style="color:#777;font-size:13px">Rede Tranquilo · você recebe este aviso porque tem uma data confirmada na rede.</p>`;
        try { await enviarEmail(p.email, `${quando}: ${titulo} · ${e.c} ${br(e.d)}`, html); resumo.enviados++; }
        catch (err) {
          resumo.erros.push(String((err as Error).message).slice(0, 160));
          await sb.from("lembretes").update({ situacao: "erro", detalhe: `${reg.detalhe} · ${String((err as Error).message).slice(0, 120)}` }).match({ user_id: p.id, evento_id: e.id, item, momento: reg.momento });
        }
      }
    }
  }
  return new Response(JSON.stringify(resumo), { headers: { "Content-Type": "application/json" } });
});
