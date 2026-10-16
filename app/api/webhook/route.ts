import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { enviarEmailsPedido } from "@/lib/email";

export const runtime = "nodejs";

// Dá baixa no estoque dos itens de um pedido recém-pago (operação atômica no banco).
async function baixarEstoque(sb: ReturnType<typeof supabaseAdmin>, pedidoId: string) {
  const { data: itens } = await sb.from("itens_pedido").select("produto_id,nome,tamanho,quantidade").eq("pedido_id", pedidoId);
  const faltou: string[] = [];
  for (const it of itens ?? []) {
    if (it.produto_id == null) continue;
    const { data: ok, error } = await sb.rpc("baixar_estoque", { p_produto: it.produto_id, p_tamanho: it.tamanho, p_qtd: it.quantidade });
    if (error || ok !== true) faltou.push(`${it.nome} (${it.tamanho})`);
  }
  if (faltou.length > 0) {
    await sb.from("pedidos").update({ obs: `ESTOQUE INSUFICIENTE: ${faltou.join(", ")}. Reembolse ou resolva com o cliente.` }).eq("id", pedidoId);
  }
}

// O Mercado Pago avisa aqui quando o pagamento muda. Só confiamos se a assinatura for válida.
export async function POST(req: Request) {
  const secret = process.env.MP_WEBHOOK_SECRET;
  const token = process.env.MP_ACCESS_TOKEN;
  if (!secret || !token) return new Response("config", { status: 503 });

  const url = new URL(req.url);
  const dataId = url.searchParams.get("data.id") ?? "";
  const reqId = req.headers.get("x-request-id") ?? "";
  const sig = req.headers.get("x-signature") ?? "";

  let ts = "";
  let v1 = "";
  for (const part of sig.split(",")) {
    const [k, v] = part.trim().split("=");
    if (k === "ts") ts = v ?? "";
    if (k === "v1") v1 = v ?? "";
  }
  if (!ts || !v1) return new Response("assinatura ausente", { status: 401 });

  const manifest = `id:${dataId.toLowerCase()};request-id:${reqId};ts:${ts};`;
  const esperado = crypto.createHmac("sha256", secret).update(manifest).digest("hex");
  const a = Buffer.from(esperado);
  const b = Buffer.from(v1);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return new Response("assinatura inválida", { status: 401 });
  }
  if (!dataId) return new Response("ok", { status: 200 });

  // Nunca confie no corpo do aviso: consulte o pagamento direto no Mercado Pago.
  const r = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(dataId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return new Response("tente novamente", { status: 500 });
  const p = (await r.json()) as { status?: string; external_reference?: string; transaction_amount?: number };

  try {
    const sb = supabaseAdmin();
    const { data: ped } = await sb.from("pedidos").select("id,total,status").eq("id", p.external_reference ?? "").maybeSingle();
    if (!ped) return new Response("ok", { status: 200 });

    // O valor pago precisa bater com o total do pedido.
    if (Math.round(Number(p.transaction_amount) * 100) !== Math.round(Number(ped.total) * 100)) {
      return new Response("valor divergente", { status: 200 });
    }

    const mapa: Record<string, string> = {
      approved: "pago",
      refunded: "reembolsado",
      charged_back: "reembolsado",
      rejected: "cancelado",
      cancelled: "cancelado",
    };
    const novo = mapa[p.status ?? ""] ?? "pendente";
    const jaPago = ped.status === "pago";
    if (novo === "pago" && !jaPago) {
      // Só quem de fato muda o status para "pago" dá baixa (evita baixa dupla se o aviso chegar repetido).
      const { data: mudou } = await sb.from("pedidos").update({ status: "pago", mp_payment_id: dataId }).neq("status", "pago").eq("id", ped.id).select("id");
      if (mudou && mudou.length > 0) {
        await baixarEstoque(sb, ped.id);
        try {
          await enviarEmailsPedido(sb, ped.id);
        } catch (e) {
          console.error("emails do pedido:", e instanceof Error ? e.message : e);
        }
      }
    } else if (novo !== ped.status && !(jaPago && (novo === "pendente" || novo === "cancelado"))) {
      await sb.from("pedidos").update({ status: novo, mp_payment_id: dataId }).eq("id", ped.id);
    }
    return new Response("ok", { status: 200 });
  } catch {
    return new Response("erro", { status: 500 });
  }
}
