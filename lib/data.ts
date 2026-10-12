import { createClient } from "@supabase/supabase-js";

export type Cor = { nome: string; hex: string };

export type Produto = {
  id: number | string;
  nome: string;
  categoria: string;
  preco: number;
  tamanhos: string[]; // só os tamanhos DISPONÍVEIS
  cores: Cor[];
  cor: string; // cor de fundo do cartão quando não há foto
  novo: boolean;
  imagens: string[]; // 1ª é a capa
};

function svg(cor: string, label: string) {
  const s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 800"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${cor}"/><stop offset="1" stop-color="#000"/></linearGradient></defs><rect width="600" height="800" fill="url(#g)"/><text x="300" y="400" fill="#fff" font-family="Arial Black,Impact,sans-serif" font-size="64" text-anchor="middle">ASSTORE</text><text x="300" y="460" fill="#fff" fill-opacity=".7" font-family="Arial,sans-serif" font-size="28" text-anchor="middle">${label}</text></svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(s);
}
const demoImgs = (c: string) => [svg(c, "Frente"), svg(c, "Costas"), svg(c, "Detalhe")];

const C3: Cor[] = [
  { nome: "Vermelho", hex: "#e10600" },
  { nome: "Preto", hex: "#0a0a0a" },
  { nome: "Branco", hex: "#f6f6f4" },
];
const C2: Cor[] = [
  { nome: "Preto", hex: "#0a0a0a" },
  { nome: "Off White", hex: "#e9e7e0" },
];

// Mostrados enquanto o Supabase não estiver configurado (o site nunca quebra).
const DEMO: Produto[] = [
  { id: 1, nome: "Camiseta Oversized Crown", categoria: "Camisetas", preco: 89.9, tamanhos: ["P", "M", "G", "GG"], cores: C3, cor: "#e10600", novo: true, imagens: demoImgs("#e10600") },
  { id: 2, nome: "Camiseta Boxy AS Preta", categoria: "Camisetas", preco: 79.9, tamanhos: ["M", "G", "GG"], cores: [], cor: "#1a1a1a", novo: false, imagens: demoImgs("#2a2a2a") },
  { id: 3, nome: "Moletom Hoodie Royal", categoria: "Moletons", preco: 199.9, tamanhos: ["M", "G", "GG"], cores: C2, cor: "#5c0200", novo: true, imagens: demoImgs("#7a0300") },
  { id: 4, nome: "Moletom Zip Off White", categoria: "Moletons", preco: 219.9, tamanhos: ["G", "GG"], cores: [], cor: "#8a8a86", novo: false, imagens: demoImgs("#8a8a86") },
  { id: 5, nome: "Calça Cargo Black", categoria: "Calças", preco: 179.9, tamanhos: ["38", "40", "42", "44"], cores: [], cor: "#101010", novo: false, imagens: demoImgs("#202020") },
  { id: 6, nome: "Calça Jogger Red Line", categoria: "Calças", preco: 149.9, tamanhos: ["38", "40", "42"], cores: [], cor: "#b00500", novo: false, imagens: demoImgs("#b00500") },
  { id: 7, nome: "Boné AS Strapback", categoria: "Acessórios", preco: 69.9, tamanhos: ["Único"], cores: C2, cor: "#2b2b2b", novo: false, imagens: demoImgs("#2b2b2b") },
  { id: 8, nome: "Corrente Crown Steel", categoria: "Acessórios", preco: 59.9, tamanhos: ["Único"], cores: [], cor: "#d9d9d6", novo: false, imagens: demoImgs("#6b6b66") },
];

type Row = Omit<Produto, "imagens" | "cores" | "preco"> & {
  preco: number | string;
  imagens?: string[] | null;
  imagem_url?: string | null;
  cores?: Cor[] | null;
};

export async function getProdutos(): Promise<Produto[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return DEMO;
  try {
    const sb = createClient(url, key);
    const { data, error } = await sb.from("produtos").select("*").eq("ativo", true).order("id");
    if (error || !data || data.length === 0) return DEMO;
    return (data as Row[]).map((p) => ({
      id: p.id,
      nome: p.nome,
      categoria: p.categoria,
      preco: Number(p.preco),
      tamanhos: p.tamanhos?.length ? p.tamanhos : ["Único"],
      cores: Array.isArray(p.cores) ? p.cores : [],
      cor: p.cor,
      novo: p.novo,
      imagens: p.imagens?.length ? p.imagens : p.imagem_url ? [p.imagem_url] : [],
    }));
  } catch {
    return DEMO;
  }
}
