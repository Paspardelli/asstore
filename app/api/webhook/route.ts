import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

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
    if (novo !== ped.status && !(jaPago && (novo === "pendente" || novo === "cancelado"))) {
      await sb.from("pedidos").update({ status: novo, mp_payment_id: dataId }).eq("id", ped.id);
    }
    return new Response("ok", { status: 200 });
  } catch {
    return new Response("erro", { status: 500 });
  }
}
