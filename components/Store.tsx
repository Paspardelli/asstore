"use client";

import { useEffect, useRef, useState } from "react";
import type { Produto } from "@/lib/data";

const WHATS = "5519998073953";
const IG = "asstoree_officiall";
const FAIXA = "ASSTORE ★ STREETWEAR ★ PAGAMENTO SEGURO ★ ";

type Item = { id: Produto["id"]; nome: string; preco: number; t: string; c: string; q: number };

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function Logo({ className }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/logo.png" alt="" className={`logo ${className ?? ""}`} />;
}

export default function Store({ produtos }: { produtos: Produto[] }) {
  const [cat, setCat] = useState("Todos");
  const [sacola, setSacola] = useState<Item[]>([]);
  const [pronto, setPronto] = useState(false);
  const [aberto, setAberto] = useState<"" | "sacola" | "produto">("");
  const [sel, setSel] = useState<Produto | null>(null);
  const [tam, setTam] = useState<string | null>(null);
  const [cor, setCor] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);
  const [lb, setLb] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [aviso, setAviso] = useState("");
  const [etapa, setEtapa] = useState<"sacola" | "dados">("sacola");
  const [form, setForm] = useState({ nome: "", email: "", telefone: "", endereco: "" });
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const s = localStorage.getItem("as_sacola");
      if (s) setSacola(JSON.parse(s) as Item[]);
    } catch {}
    setPronto(true);
  }, []);

  useEffect(() => {
    if (!pronto) return;
    try {
      localStorage.setItem("as_sacola", JSON.stringify(sacola));
    } catch {}
  }, [sacola, pronto]);

  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setLb(false);
      setZoom(false);
      setAberto("");
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, []);

  function centralizar() {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
    el.scrollTop = (el.scrollHeight - el.clientHeight) / 2;
  }
  useEffect(() => {
    if (zoom) centralizar();
  }, [zoom]);

  const imgs = sel?.imagens ?? [];
  const cats = ["Todos", ...Array.from(new Set(produtos.map((p) => p.categoria)))];
  const lista = produtos.filter((p) => cat === "Todos" || p.categoria === cat);
  const qtd = sacola.reduce((a, i) => a + i.q, 0);
  const total = sacola.reduce((a, i) => a + i.q * i.preco, 0);

  function abrirProduto(p: Produto) {
    setSel(p);
    setTam(p.tamanhos.length === 1 ? p.tamanhos[0] : null);
    setCor(p.cores.length === 1 ? p.cores[0].nome : null);
    setIdx(0);
    setAviso("");
    setAberto("produto");
  }

  function adicionar() {
    if (!sel) return;
    if (sel.cores.length > 0 && !cor) return setAviso("Escolha uma cor para continuar.");
    if (!tam) return setAviso("Escolha um tamanho para continuar.");
    const noCarrinho = sacola.filter((i) => i.id === sel.id && i.t === tam).reduce((a, i) => a + i.q, 0);
    if (noCarrinho + 1 > (sel.estoque[tam] ?? 0)) return setAviso("Essa peça já está na sua sacola e não temos mais unidades.");
    const c = cor ?? "";
    setSacola((s) => {
      const f = s.find((i) => i.id === sel.id && i.t === tam && (i.c ?? "") === c);
      if (f) return s.map((i) => (i === f ? { ...i, q: i.q + 1 } : i));
      return [...s, { id: sel.id, nome: sel.nome, preco: sel.preco, t: tam, c, q: 1 }];
    });
    setEtapa("sacola");
    setAberto("sacola");
  }

  function mudar(k: number, d: number) {
    setSacola((s) => {
      const it = s[k];
      if (!it) return s;
      if (d > 0) {
        // não deixa passar do estoque (somando as cores do mesmo tamanho)
        const p = produtos.find((x) => x.id === it.id);
        const jaTem = s.filter((x) => x.id === it.id && x.t === it.t).reduce((a, x) => a + x.q, 0);
        if (!p || jaTem + d > (p.estoque[it.t] ?? 0)) return s;
      }
      return s.map((i, n) => (n === k ? { ...i, q: i.q + d } : i)).filter((i) => i.q > 0);
    });
  }

  function mover(d: number) {
    setIdx((i) => (i + d + imgs.length) % imgs.length);
    setZoom(false);
  }

  function fecharLb() {
    setLb(false);
    setZoom(false);
  }

  async function pagar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setEnviando(true);
    try {
      const r = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itens: sacola.map((i) => ({ id: i.id, t: i.t, c: i.c ?? "", q: i.q })), cliente: form }),
      });
      const d = (await r.json()) as { url?: string; erro?: string };
      if (!r.ok || !d.url) throw new Error(d.erro || "Não foi possível iniciar o pagamento.");
      window.location.href = d.url;
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro inesperado.");
      setEnviando(false);
    }
  }

  const campo = (k: keyof typeof form) => ({
    value: form[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value }),
    required: true,
  });

  return (
    <>
      <header>
        <a className="brand" href="#top" aria-label="ASStore">
          <span className="mark"><Logo /></span>
          <span className="disp" style={{ fontSize: 20 }}>ASSTORE</span>
        </a>
        <nav>
          <a href="#catalogo">Catálogo</a>
          <a href="#como">Como comprar</a>
          <button className="cartbtn" onClick={() => { setEtapa("sacola"); setAberto("sacola"); }}>
            Sacola<b>{qtd}</b>
          </button>
        </nav>
      </header>

      <main id="top">
        <div className="hero">
          <h1>
            AS<br />
            <span>STORE</span>
          </h1>
          <p>Streetwear com a marca de quem chega primeiro. Escolha as peças, monte a sacola e pague com segurança.</p>
          <a className="btn" href="#catalogo">Ver peças</a>
          <a className="btn ghost" href={`https://instagram.com/${IG}`} target="_blank" rel="noopener noreferrer">Instagram</a>
        </div>
        <div className="band" aria-hidden="true">
          <div>{FAIXA.repeat(8)}</div>
        </div>

        <section id="catalogo">
          <h2>Catálogo</h2>
          <div className="chips">
            {cats.map((c) => (
              <button key={c} className="chip" aria-pressed={c === cat} onClick={() => setCat(c)}>{c}</button>
            ))}
          </div>
          <div className="grid">
            {lista.map((p) => (
              <button key={p.id} className={`card${p.tamanhos.length === 0 ? " esg" : ""}`} onClick={() => abrirProduto(p)}>
                <div className="ph" style={{ background: `linear-gradient(160deg,${p.cor},#000 120%)` }}>
                  {p.tamanhos.length === 0 ? <span className="tag off">Esgotado</span> : p.novo && <span className="tag">Novo</span>}
                  {p.imagens[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.imagens[0]} alt={p.nome} loading="lazy" decoding="async" />
                  ) : (
                    <Logo />
                  )}
                </div>
                <h3>{p.nome}</h3>
                <span className="pr">{brl(p.preco)}</span>
                <span className="tams" aria-label="Tamanhos disponíveis">
                  {p.tamanhos.map((t) => <i key={t}>{t}</i>)}
                </span>
                {p.cores.length > 0 && (
                  <span className="dots" aria-label="Cores disponíveis">
                    {p.cores.map((c) => <i key={c.nome} title={c.nome} style={{ background: c.hex }} />)}
                  </span>
                )}
              </button>
            ))}
          </div>
        </section>

        <section>
          <div className="lookbook">
            <h2 style={{ marginBottom: 12 }}>Use a coroa.</h2>
            <p>Cada peça da ASStore carrega a marca de quem não pede licença para chegar. Estoque limitado por modelo.</p>
          </div>
        </section>

        <section id="como">
          <h2>Como comprar</h2>
          <ol className="steps">
            <li><b>Escolha</b><span>Selecione tamanho e adicione na sacola.</span></li>
            <li><b>Pague com segurança</b><span>Pix, cartão ou boleto no ambiente protegido do Mercado Pago.</span></li>
            <li><b>Receba em casa</b><span>Pagamento aprovado, a gente separa e envia o seu pedido.</span></li>
          </ol>
        </section>
      </main>

      <footer>
        <span>© ASStore. Todos os direitos reservados.</span>
        <a href={`https://instagram.com/${IG}`} target="_blank" rel="noopener noreferrer">@{IG}</a>
      </footer>

      {aberto && <div className="ov" onClick={() => setAberto("")} />}

      {aberto === "produto" && sel && (
        <div className="panel" id="modal" role="dialog" aria-label={sel.nome}>
          <button className="x" onClick={() => setAberto("")} aria-label="Fechar">×</button>

          {imgs.length > 0 ? (
            <>
              <button className="gal" onClick={() => setLb(true)} aria-label="Ampliar imagem">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imgs[idx]} alt={sel.nome} />
                <span className="zoom">Toque para ampliar</span>
              </button>
              {imgs.length > 1 && (
                <div className="thumbs">
                  {imgs.map((s, i) => (
                    <button key={s + i} className="thumb" aria-pressed={i === idx} onClick={() => setIdx(i)} aria-label={`Foto ${i + 1}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={s} alt="" loading="lazy" />
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="gal" style={{ background: `linear-gradient(160deg,${sel.cor},#000 120%)`, display: "grid", placeItems: "center" }}>
              <Logo className="gl" />
            </div>
          )}

          <h2 style={{ fontSize: 26, margin: "4px 0 0" }}>{sel.nome}</h2>
          <p className="pr" style={{ fontSize: 20, margin: "8px 0 0" }}>{brl(sel.preco)}</p>

          {sel.cores.length > 0 && (
            <>
              <p className="lbl">Cor: <b>{cor ?? "escolha"}</b></p>
              <div className="swatches">
                {sel.cores.map((c) => (
                  <button key={c.nome} className="sw" style={{ background: c.hex }} aria-pressed={c.nome === cor} aria-label={c.nome} onClick={() => setCor(c.nome)} />
                ))}
              </div>
            </>
          )}

          {sel.tamanhos.length === 0 ? (
            <button className="btn" disabled>Esgotado</button>
          ) : (
            <>
              <p className="lbl">Tamanho</p>
              <div className="sizes">
                {sel.todos.map((t) => {
                  const off = !(sel.estoque[t] > 0);
                  return (
                    <button key={t} className={`sz${off ? " off" : ""}`} disabled={off} aria-pressed={t === tam} onClick={() => setTam(t)}>{t}</button>
                  );
                })}
              </div>
              <button className="btn" onClick={adicionar}>Adicionar à sacola</button>
            </>
          )}
          <p className="err" role="alert">{aviso}</p>
        </div>
      )}

      {lb && sel && imgs.length > 0 && (
        <div className="lb" role="dialog" aria-label="Imagem ampliada">
          <div className="lbscroll" ref={scrollRef}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imgs[idx]} alt={sel.nome} className={zoom ? "z" : ""} onClick={() => setZoom((z) => !z)} onLoad={() => zoom && centralizar()} />
          </div>
          <button className="lbx" onClick={fecharLb} aria-label="Fechar">×</button>
          {imgs.length > 1 && (
            <>
              <button className="lbn prev" onClick={() => mover(-1)} aria-label="Anterior">‹</button>
              <button className="lbn next" onClick={() => mover(1)} aria-label="Próxima">›</button>
            </>
          )}
          <span className="lbc">{idx + 1} / {imgs.length} · toque para {zoom ? "reduzir" : "ampliar"}</span>
        </div>
      )}

      {aberto === "sacola" && (
        <aside className="panel" id="drawer" aria-label="Sacola">
          <button className="x" onClick={() => setAberto("")} aria-label="Fechar">×</button>
          <h2 style={{ fontSize: 32, marginBottom: 0 }}>{etapa === "sacola" ? "Sua sacola" : "Seus dados"}</h2>

          {etapa === "sacola" ? (
            <>
              <div className="items">
                {sacola.length === 0 && <p className="empty">Sua sacola está vazia. Escolha uma peça no catálogo.</p>}
                {sacola.map((i, k) => (
                  <div className="it" key={`${i.id}-${i.t}-${i.c ?? ""}`}>
                    <div>
                      {i.nome}
                      <small>Tamanho {i.t}{i.c ? ` · ${i.c}` : ""} · {brl(i.preco)}</small>
                    </div>
                    <div className="qty">
                      <button onClick={() => mudar(k, -1)} aria-label="Diminuir">−</button>
                      <span>{i.q}</span>
                      <button onClick={() => mudar(k, 1)} aria-label="Aumentar">+</button>
                    </div>
                  </div>
                ))}
              </div>
              {sacola.length > 0 && (
                <div>
                  <div className="tot"><span>Total</span><b>{brl(total)}</b></div>
                  <button className="btn full" onClick={() => setEtapa("dados")}>Continuar para o pagamento</button>
                </div>
              )}
            </>
          ) : (
            <form className="items" onSubmit={pagar}>
              <input placeholder="Nome completo" autoComplete="name" aria-label="Nome completo" maxLength={80} {...campo("nome")} />
              <input type="email" placeholder="E-mail" autoComplete="email" aria-label="E-mail" maxLength={120} {...campo("email")} />
              <input type="tel" placeholder="Telefone com DDD" autoComplete="tel" aria-label="Telefone" maxLength={20} {...campo("telefone")} />
              <input placeholder="Endereço completo (rua, número, bairro, cidade, CEP)" autoComplete="street-address" aria-label="Endereço" maxLength={200} {...campo("endereco")} />
              <div className="tot"><span>Total</span><b>{brl(total)}</b></div>
              {erro && <p className="err" role="alert">{erro}</p>}
              <button className="btn full" disabled={enviando}>{enviando ? "Aguarde..." : "Pagar com Mercado Pago"}</button>
              <button type="button" className="link" onClick={() => setEtapa("sacola")}>Voltar para a sacola</button>
              <p className="seg">Pagamento processado pelo Mercado Pago (Pix, cartão ou boleto). Nós não recebemos nem guardamos dados do seu cartão.</p>
            </form>
          )}

          <a className="link" href={`https://wa.me/${WHATS}`} target="_blank" rel="noopener noreferrer">Dúvidas? Fale no WhatsApp</a>
        </aside>
      )}
    </>
  );
}
