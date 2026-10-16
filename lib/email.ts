import type { supabaseAdmin } from "@/lib/supabase-admin";

type Sb = ReturnType<typeof supabaseAdmin>;

// Tudo que vem do cliente é escapado antes de entrar no HTML do e-mail.
const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Envia pelo Resend. Se não houver chave configurada, não faz nada. Nunca derruba o webhook.
async function enviar(to: string[], subject: string, html: string, replyTo?: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key || to.length === 0) return;
  const from = process.env.EMAIL_FROM?.trim() || "ASStore <onboarding@resend.dev>";
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, html, ...(replyTo ? { reply_to: replyTo } : {}) }),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) console.error("email recusado:", r.status, (await r.text()).slice(0, 300));
  } catch (e) {
    console.error("email falhou:", e instanceof Error ? e.message : e);
  }
}

const moldura = (conteudo: string) =>
  `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#111"><div style="background:#0a0a0a;color:#fff;padding:18px 22px;border-radius:14px 14px 0 0;font-weight:700;letter-spacing:2px">ASSTORE</div><div style="border:1px solid #e6e6e6;border-top:0;border-radius:0 0 14px 14px;padding:22px;font-size:15px;line-height:1.5">${conteudo}</div></div>`;

// Chamado quando o pagamento é confirmado (uma única vez por pedido).
export async function enviarEmailsPedido(sb: Sb, pedidoId: string) {
  if (!process.env.RESEND_API_KEY) return;

  const { data: ped } = await sb.from("pedidos").select("id,nome,email,telefone,endereco,frete,total,obs").eq("id", pedidoId).maybeSingle();
  if (!ped) return;
  const { data: itens } = await sb.from("itens_pedido").select("nome,tamanho,cor,quantidade,preco_unit").eq("pedido_id", pedidoId);

  const codigo = String(ped.id).slice(0, 8).toUpperCase();
  const prazo = process.env.PRAZO_ENTREGA?.trim() ?? "";
  const loja = process.env.EMAIL_LOJA?.trim() ?? "";
  const whats = (process.env.WHATSAPP_LOJA?.trim() || "5519998073953").replace(/\D/g, "");
  const frete = Number(ped.frete ?? 0);

  const linhas = (itens ?? [])
    .map(
      (i) =>
        `<tr><td style="padding:7px 0;border-bottom:1px solid #eee">${esc(i.nome)}<br><small style="color:#666">Tamanho ${esc(i.tamanho)}${i.cor ? " · " + esc(i.cor) : ""} · ${esc(i.quantidade)}x</small></td><td style="padding:7px 0;border-bottom:1px solid #eee;text-align:right;white-space:nowrap">${brl(Number(i.preco_unit) * Number(i.quantidade))}</td></tr>`
    )
    .join("");
  const tabela = `<table style="width:100%;border-collapse:collapse;margin:14px 0">${linhas}${
    frete > 0 ? `<tr><td style="padding:7px 0">Frete</td><td style="padding:7px 0;text-align:right">${brl(frete)}</td></tr>` : ""
  }<tr><td style="padding:9px 0"><b>Total</b></td><td style="padding:9px 0;text-align:right"><b>${brl(Number(ped.total))}</b></td></tr></table>`;

  const tarefas: Promise<void>[] = [];

  // 1) Para o comprador (não enviamos se houve problema de estoque: a loja resolve antes)
  if (!ped.obs && ped.email) {
    const textoPrazo = prazo
      ? `<p><b>Prazo estimado de entrega:</b> ${esc(prazo)}.</p>`
      : `<p>Assim que o pedido for enviado, avisaremos você.</p>`;
    tarefas.push(
      enviar(
        [String(ped.email)],
        `Pedido confirmado #${codigo} — ASStore`,
        moldura(
          `<h2 style="margin:0 0 8px">Pagamento confirmado!</h2><p>Olá, ${esc(ped.nome)}! Recebemos o pagamento do seu pedido <b>#${codigo}</b>.</p>${tabela}<p><b>Entrega em:</b><br>${esc(ped.endereco)}</p>${textoPrazo}<p style="color:#666;font-size:13px">Dúvidas? Fale com a gente no <a href="https://wa.me/${whats}">WhatsApp</a>.</p>`
        ),
        loja || undefined
      )
    );
  }

  // 2) Para a loja
  if (loja) {
    const tel = String(ped.telefone ?? "").replace(/\D/g, "");
    const aviso = ped.obs
      ? `<p style="background:#fff0f0;border:1px solid #f3b4b4;padding:10px 12px;border-radius:10px"><b>Atenção:</b> ${esc(ped.obs)}<br>O e-mail de confirmação NÃO foi enviado ao comprador.</p>`
      : "";
    tarefas.push(
      enviar(
        [loja],
        `Novo pedido pago #${codigo} — ${brl(Number(ped.total))}`,
        moldura(
          `<h2 style="margin:0 0 8px">Novo pedido pago</h2>${aviso}<p><b>Cliente:</b> ${esc(ped.nome)}<br><b>E-mail:</b> ${esc(ped.email)}<br><b>Telefone:</b> <a href="https://wa.me/${tel.startsWith("55") ? tel : "55" + tel}">${esc(ped.telefone)}</a></p><p><b>Endereço de entrega:</b><br>${esc(ped.endereco)}</p>${tabela}<p style="color:#666;font-size:13px">Separe a peça e envie. Pedido #${codigo}.</p>`
        )
      )
    );
  }

  await Promise.all(tarefas);
}
