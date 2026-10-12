import Link from "next/link";
import LimparSacola from "@/components/LimparSacola";

const MSG: Record<string, { t: string; d: string }> = {
  ok: { t: "Pagamento recebido", d: "Assim que o Mercado Pago confirmar a aprovação, seu pedido é registrado como pago. Você também recebe o aviso por e-mail." },
  pendente: { t: "Pagamento em análise", d: "Estamos aguardando a confirmação (comum em Pix e boleto). Seu pedido só é confirmado após a aprovação." },
  falhou: { t: "Pagamento não concluído", d: "Nenhuma cobrança foi confirmada. Sua sacola continua salva: volte à loja e tente de novo." },
};

export default function Obrigado({ searchParams }: { searchParams: { s?: string } }) {
  const chave = searchParams.s ?? "";
  const m = MSG[chave] ?? MSG.pendente;
  return (
    <main className="page">
      {chave !== "falhou" && <LimparSacola />}
      <h1 className="disp" style={{ fontSize: "clamp(40px,10vw,72px)", marginBottom: 16 }}>{m.t}</h1>
      <p style={{ color: "var(--mute)", fontSize: 18 }}>{m.d}</p>
      <p style={{ marginTop: 28 }}>
        <Link className="btn" href="/">Voltar para a loja</Link>
      </p>
    </main>
  );
}
