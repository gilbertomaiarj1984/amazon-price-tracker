export type LineKey = "amazon" | "terceiros" | "usado";
export const LINE_KEYS: readonly LineKey[] = ["amazon", "terceiros", "usado"];
export const LINE_NAMES: Record<LineKey, string> = {
  amazon: "Amazon",
  terceiros: "Terceiros (novo)",
  usado: "Usado",
};

export interface Offer {
  vendedor: string;
  condicao: "novo" | "usado";
  preco: number;
  /** null = a página não informou o frete. A conta trata como 0. */
  frete: number | null;
  envio: "amazon" | "terceiro";
  vendidoPorAmazon: boolean;
}

export interface ProductPage {
  titulo: string | null;
  /** Preço do botão "Adicionar ao carrinho", de quem quer que venda. */
  buyBox: number | null;
  buyBoxVendedor: string | null;
  vendidoPorAmazon: boolean;
  /** "a partir de R$ X" das outras opções de compra. */
  outrasAPartirDe: number | null;
  disponivel: boolean;
}

export type BlockKind =
  | "ok"
  | "captcha"
  | "http_503"
  | "http_error"
  | "vazio"
  | "html_inesperado";

export interface LinePoint {
  linha: LineKey;
  /** preço + frete */
  preco: number;
  vendedor: string | null;
}
