import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

type ItemIn = { id: number; t: string; c?: string; q: number };
type Prod = { id: number; nome: string; preco: number | string; tamanhos: string[]; cores: { nome: string }[] | null };

const erro = (msg: string, status: number) => NextResponse.json({ erro: msg }, { status });

// Limite simples por IP (reduz abuso; em serverless é "melhor esforço").
const hits = new Map<string, number[]>();
function limitado(ip: string) {
  const agora = Date.now();
  const lista = (hits.get(ip) ?? []).filter((t) => agora - t < 60_000);
  lista.push(agora);
  hits.set(ip, lista);
  return lista.length > 6;
}

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "x";
  if (limitado(ip)) return erro("Muitas tentativas. Aguarde um minuto.", 429);

  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
  const token = process.env.MP_ACCESS_TOKEN;
  if (!site || !token) return erro("Pagamento ainda não configurado.", 503);

  let body: { itens?: ItemIn[]; cliente?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return erro("Requisição inválida.", 400);
  }

  // 1) Valida a sacola (o navegador NUNCA define preço)
  const itens = Array.isArray(body.itens) ? body.itens : [];
  if (itens.length < 1 || itens.length > 20) return erro("Sacola inválida.", 400);
  for (const i of itens) {
    if (!Number.isInteger(i?.id) || !Number.isInteger(i?.q) || i.q < 1 || i.q > 10 || typeof i.t !== "string" || (i.c !== undefined && typeof i.c !== "string")) {
      return erro("Sacola inválida.", 400);
    }
  }

  // 2) Valida os dados do cliente
  const c = body.cliente ?? {};
  const nome = String(c.nome ?? "").trim();
  const email = String(c.email ?? "").trim().toLowerCase();
  const telefone = String(c.telefone ?? "").replace(/\D/g, "");
  const endereco = String(c.endereco ?? "").trim();
  if (nome.length < 2 || nome.length > 80) return erro("Informe seu nome.", 400);
  if (email.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return erro("E-mail inválido.", 400);
  if (telefone.length < 10 || telefone.length > 13) return erro("Telefone inválido (com DDD).", 400);
  if (endereco.length < 8 || endereco.length > 200) return erro("Informe o endereço completo.", 400);

  try {
    const sb = supabaseAdmin();

    // 3) Preços e tamanhos vêm do BANCO, nunca do navegador
    const ids = Array.from(new Set(itens.map((i) => i.id)));
    const { data, error } = await sb.from("produtos").select("id,nome,preco,tamanhos,cores").eq("ativo", true).in("id", ids);
    if (error || !data) { console.error("checkout produtos:", error?.message, error?.code); return erro("Erro ao consultar produtos.", 500); }
    const mapa = new Map((data as Prod[]).map((p) => [p.id, p]));

    const linhas: { id: number; nome: string; t: string; c: string; q: number; cent: number }[] = [];
    for (const i of itens) {
      const p = mapa.get(i.id);
      if (!p || !p.tamanhos.includes(i.t)) return erro("Um item da sacola não está mais disponível.", 409);
      const cores = Array.isArray(p.cores) ? p.cores : [];
      let c = "";
      if (cores.length > 0) {
        if (!cores.some((x) => x.nome === i.c)) return erro("Escolha a cor de cada item da sacola.", 400);
        c = String(i.c);
      }
      linhas.push({ id: p.id, nome: p.nome, t: i.t, c, q: i.q, cent: Math.round(Number(p.preco) * 100) });
    }

    const freteNum = Number(process.env.FRETE_FIXO ?? "0");
    const frete = Number.isFinite(freteNum) && freteNum > 0 ? Math.round(freteNum * 100) : 0;
    const total = linhas.reduce((a, l) => a + l.cent * l.q, 0) + frete;

    // 4) Grava o pedido como "pendente"
    const { data: ped, error: e1 } = await sb
      .from("pedidos")
      .insert({ nome, email, telefone, endereco, frete: frete / 100, total: total / 100, status: "pendente" })
      .select("id")
      .single();
    if (e1 || !ped) return erro("Não foi possível registrar o pedido.", 500);

    const { error: e2 } = await sb.from("itens_pedido").insert(
      linhas.map((l) => ({ pedido_id: ped.id, produto_id: l.id, nome: l.nome, tamanho: l.t, cor: l.c || null, quantidade: l.q, preco_unit: l.cent / 100 }))
    );
    if (e2) {
      await sb.from("pedidos").update({ status: "falhou" }).eq("id", ped.id);
      return erro("Não foi possível registrar o pedido.", 500);
    }

    // 5) Cria o checkout no Mercado Pago (cartão/Pix/boleto ficam lá, não aqui)
    const mpItens = linhas.map((l) => ({
      id: String(l.id),
      title: `${l.nome} (${l.t}${l.c ? ", " + l.c : ""})`,
      quantity: l.q,
      unit_price: l.cent / 100,
      currency_id: "BRL",
    }));
    if (frete > 0) mpItens.push({ id: "frete", title: "Frete", quantity: 1, unit_price: frete / 100, currency_id: "BRL" });

    const r = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-Idempotency-Key": ped.id },
      body: JSON.stringify({
        items: mpItens,
        payer: { name: nome, email },
        external_reference: ped.id,
        notification_url: `${site}/api/webhook`,
        back_urls: {
          success: `${site}/obrigado?s=ok`,
          pending: `${site}/obrigado?s=pendente`,
          failure: `${site}/obrigado?s=falhou`,
        },
        auto_return: "approved",
        statement_descriptor: "ASSTORE",
      }),
    });
    const d = (await r.json()) as { init_point?: string };
    if (!r.ok || !d.init_point) {
      await sb.from("pedidos").update({ status: "falhou" }).eq("id", ped.id);
      return erro("Não foi possível iniciar o pagamento. Tente novamente.", 502);
    }
    return NextResponse.json({ url: d.init_point });
  } catch {
    return erro("Serviço indisponível no momento.", 503);
  }
}
