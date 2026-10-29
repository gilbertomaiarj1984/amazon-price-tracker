import { parse } from "node-html-parser";
import type { HTMLElement } from "node-html-parser";
import type { BlockKind, Offer, ProductPage } from "../types.ts";

/**
 * Seletores escritos a partir do que a Amazon costuma servir. Ainda não foram
 * calibrados contra HTML real: rode `bun scripts/spike.ts` no VPS e ajuste
 * aqui com as fixtures salvas em tests/fixtures/real/.
 */

/** Blocos onde o preço de destaque mora, do mais para o menos confiável (conferido em HTML real). */
const PRICE_SCOPES = [
  "#corePrice_feature_div",
  "#corePriceDisplay_desktop_feature_div",
  "#apex_desktop",
  "#desktop_buybox",
  "#buybox",
];
const LEGACY_PRICE_SELECTORS = ["#price_inside_buybox", "#priceblock_ourprice", "#priceblock_dealprice"];
const OTHER_OFFERS_SELECTORS = [
  "#aod-ingress-link",
  "#dynamic-aod-ingress-box",
  "#olp_feature_div",
  "#buybox-see-all-buying-choices",
];

const CAPTCHA_MARKERS = [
  "/errors/validatecaptcha",
  "digite os caracteres que você vê",
  "digite os caracteres",
  "enter the characters you see below",
  "robot check",
  "api-services-support@amazon.com",
];

export function parseBRL(text: string | null | undefined, opts: { exigirMoeda?: boolean } = {}): number | null {
  if (!text) return null;
  if (opts.exigirMoeda && !text.includes("R$")) return null;
  const clean = text.replace(/\u00a0/g, " ");
  // Com "R$" no texto, o valor é o que vem depois dele ("Novo (3) a partir de R$ 1.189,00").
  const from = clean.indexOf("R$");
  const m = /(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?/.exec(from >= 0 ? clean.slice(from + 2) : clean);
  if (!m || !m[1]) return null;
  const inteiro = m[1].replace(/\./g, "");
  const cents = (m[2] ?? "0").padEnd(2, "0");
  const v = Number(`${inteiro}.${cents}`);
  return Number.isFinite(v) && v > 0 ? v : null;
}

function txt(el: HTMLElement | null | undefined): string {
  return el ? el.text.replace(/\s+/g, " ").trim() : "";
}

function firstText(root: HTMLElement, selectors: string[]): string | null {
  for (const s of selectors) {
    const t = txt(root.querySelector(s));
    if (t) return t;
  }
  return null;
}

/**
 * Preço de um nó `.a-price`. O `.a-offscreen` costuma vir VAZIO: nesse caso o valor
 * é montado das partes visíveis (a-price-whole + a-price-fraction).
 */
function priceFromNode(node: HTMLElement): number | null {
  const off = parseBRL(txt(node.querySelector(".a-offscreen")), { exigirMoeda: true });
  if (off != null) return off;
  const whole = txt(node.querySelector(".a-price-whole")).replace(/\D/g, "");
  const frac = txt(node.querySelector(".a-price-fraction")).replace(/\D/g, "");
  if (!whole) return null;
  const v = Number(`${whole}.${(frac || "0").padEnd(2, "0")}`);
  return Number.isFinite(v) && v > 0 ? v : null;
}

/**
 * Preço a pagar dentro de um bloco. Ignora o preço por unidade ("R$0,02 / Gramas")
 * e o preço riscado "De: R$ X", que também são `.a-price`/`.a-offscreen` (classe a-text-price).
 */
function priceIn(scope: HTMLElement): number | null {
  const label = scope.querySelector(".apex-pricetopay-accessibility-label, #apex-pricetopay-accessibility-label");
  const fromLabel = parseBRL(txt(label), { exigirMoeda: true });
  if (fromLabel != null) return fromLabel;
  for (const node of scope.querySelectorAll(".a-price")) {
    if ((node.getAttribute("class") ?? "").split(/\s+/).includes("a-text-price")) continue;
    const v = priceFromNode(node);
    if (v != null) return v;
  }
  return null;
}

export function detectBlock(
  html: string,
  status: number,
  expect: "product" | "offers" = "product",
): BlockKind {
  if (status === 503) return "http_503";
  if (status >= 400) return "http_error";
  if (html.trim().length < 500) return "vazio";
  const low = html.toLowerCase();
  if (CAPTCHA_MARKERS.some((m) => low.includes(m))) return "captcha";
  if (expect === "product") {
    if (!low.includes('id="producttitle"') && !low.includes("id='producttitle'") && !low.includes('id="dp"'))
      return "html_inesperado";
  } else if (!low.includes("aod-offer") && !low.includes("aod-pinned-offer")) {
    return "html_inesperado";
  }
  return "ok";
}

/**
 * "Amazon Global" (importação operada pela Amazon) conta como Amazon.
 * "Amazon Warehouse" é usado e fica de fora.
 */
function isAmazonSeller(name: string | null | undefined): boolean {
  if (!name) return false;
  return /^amazon(\.com\.br| global)?$/i.test(name.trim());
}

export const IMAGE_HOST_RE = /^https:\/\/(m\.media-amazon\.com|images-na\.ssl-images-amazon\.com)\/images\/[\w%./,+-]+$/;

function productImage(root: ReturnType<typeof parse>): string | null {
  const img = root.querySelector("#landingImage") ?? root.querySelector("#imgBlkFront");
  if (!img) return null;
  const dyn = img.getAttribute("data-a-dynamic-image");
  let first: string | undefined;
  try {
    first = dyn ? Object.keys(JSON.parse(dyn) as Record<string, unknown>)[0] : undefined;
  } catch {
    first = undefined;
  }
  return [img.getAttribute("data-old-hires"), img.getAttribute("src"), first].find((u): u is string => !!u && IMAGE_HOST_RE.test(u)) ?? null;
}

export function parseProductPage(html: string): ProductPage {
  const root = parse(html);
  // A página real traz ~1 MB de scripts, e alguns ficam dentro de contêineres que o parser lê como texto.
  for (const el of root.querySelectorAll("script, style, noscript")) el.remove();
  let titulo = txt(root.querySelector("#productTitle")) || null;
  if (!titulo) {
    const t = txt(root.querySelector("title"));
    titulo = t ? t.split(/\s[:|–-]\s/)[0]?.trim() || null : null;
  }

  const imagem = productImage(root);
  const availability = txt(root.querySelector("#availability")).toLowerCase();
  const indisponivel = /indispon[ií]vel/.test(availability);
  let buyBox: number | null = null;
  if (!indisponivel) {
    for (const sel of PRICE_SCOPES) {
      const scope = root.querySelector(sel);
      buyBox = scope ? priceIn(scope) : null;
      if (buyBox != null) break;
    }
    if (buyBox == null) buyBox = parseBRL(firstText(root, LEGACY_PRICE_SELECTORS), { exigirMoeda: true });
  }

  let vendedor =
    txt(root.querySelector("#sellerProfileTriggerId")) ||
    txt(root.querySelector("#merchantInfoFeature_feature_div .offer-display-feature-text-message")) ||
    null;
  if (!vendedor) {
    const row = root
      .querySelectorAll("#tabular-buybox .tabular-buybox-text")
      .find((el) => el.getAttribute("tabular-attribute-name")?.toLowerCase().includes("vendido"));
    vendedor = row ? txt(row) : null;
  }
  if (!vendedor) {
    const info = txt(root.querySelector("#merchant-info"));
    const m = /vendido por\s+(.+?)(?:\s+e\s+entregue|\.|$)/i.exec(info);
    vendedor = m && m[1] ? m[1].trim() : null;
  }

  const other = firstText(root, OTHER_OFFERS_SELECTORS);
  const opcoes = other ? /(\d+)\s+op[çc][õo]es?/i.exec(other) : null;
  return {
    titulo,
    imagem,
    buyBox,
    buyBoxVendedor: vendedor,
    vendidoPorAmazon: buyBox != null && isAmazonSeller(vendedor),
    outrasAPartirDe: parseBRL(other, { exigirMoeda: true }),
    outrasOpcoes: opcoes && opcoes[1] ? Number(opcoes[1]) : null,
    disponivel: buyBox != null,
  };
}

/**
 * Só devolve frete quando o HTML traz um valor explícito ("+ R$ 24,90 de frete").
 * "Frete/Entrega GRÁTIS" aparece como promoção condicional ("no seu primeiro pedido") e
 * o frete real depende do CEP e é carregado depois, então fica null (desconhecido).
 */
function parseFrete(block: HTMLElement): number | null {
  // Exige "+ R$ X frete" ou "R$ X de frete": "R$ 298,47 Entrega GRÁTIS" é o preço da oferta seguido do aviso de entrega.
  const m = /(?:\+\s*R\$\s*([\d.]+(?:,\d{1,2})?)\s*(?:de\s+)?|R\$\s*([\d.]+(?:,\d{1,2})?)\s+de\s+)(?:frete|entrega)/i.exec(txt(block));
  return m ? parseBRL(m[1] ?? m[2]) : null;
}

/** Só "Novo" conta. O título da oferta é "Novo", "Usado - Bom", "De colecionador - Bom"...; "Compra única" é tipo de compra (novo). */
const NEW_HEADING_RE = /^(novo\b|compra [uú]nica)/i;
const USED_RE = /usad|recondicion|seminov|colecionador|como novo|muito bom|bom estado|aceit[aá]vel|\b(?:bom|muito bom|aceit[aá]vel)\b/i;
const RETURN_POLICY_RE = /pol[ií]tica de devolu/i;

/** Primeiro texto útil de um bloco "Enviado pela / Vendido por": o nome vem em <span> (Amazon) ou <a> (terceiro). */
function valueOf(block: HTMLElement, id: string): string {
  const col = block.querySelector(`[id="${id}"] .a-col-right`);
  if (!col) return "";
  for (const el of col.querySelectorAll("a, span")) {
    const t = txt(el);
    if (t && !RETURN_POLICY_RE.test(t)) return t;
  }
  return "";
}

export function parseOffersPanel(html: string): Offer[] {
  const root = parse(html);
  for (const el of root.querySelectorAll("script, style, noscript")) el.remove();
  // #aod-pinned-offer é a oferta da caixa de compra; #aod-sticky-pinned-offer é só a cópia fixa dela.
  const blocks = root.querySelectorAll('[id="aod-pinned-offer"], [id="aod-offer"]');
  const out: Offer[] = [];
  const seen = new Set<string>();
  for (const b of blocks) {
    const priceScope = b.querySelector('[id^="aod-price-"]') ?? b.querySelector('[id="aod-offer-price"]') ?? b;
    const preco = priceIn(priceScope);
    if (preco == null) continue;
    const soldBy = valueOf(b, "aod-offer-soldBy") || "Desconhecido";
    const shipsFrom = valueOf(b, "aod-offer-shipsFrom");
    const heading = txt(b.querySelector('[id="aod-offer-heading"]'));
    const condicao: Offer["condicao"] = heading && (USED_RE.test(heading) || !NEW_HEADING_RE.test(heading)) ? "usado" : "novo";
    const frete = parseFrete(b);
    const key = `${soldBy}|${condicao}|${preco}|${frete}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      vendedor: soldBy,
      condicao,
      preco,
      frete,
      envio: /^amazon/i.test(shipsFrom) ? "amazon" : "terceiro",
      vendidoPorAmazon: isAmazonSeller(soldBy),
    });
  }
  return out;
}

export interface Variante {
  asin: string;
  /** "Vinil", "CD", "Capa dura", "Preto"... Vazio se a página não nomeou. */
  rotulo: string;
  /** tmm = seletor de formatos (livro, música, filme); twister = outras variações (cor, tamanho, edição). */
  dimensao: "formato" | "variacao";
  selecionada: boolean;
  preco: number | null;
}

const ASIN_ATTR_RE = /^[A-Z0-9]{10}$/;

/**
 * Variações listadas na própria página do produto: seletor de formatos (#tmmSwatches) e seletor de
 * variações (#twister). A lista vem do HTML estático; variações carregadas depois por script não aparecem.
 */
export function parseVariantes(html: string): Variante[] {
  const root = parse(html);
  for (const el of root.querySelectorAll("script, style, noscript")) el.remove();
  const out: Variante[] = [];
  const seen = new Set<string>();
  const scopes: Array<[string, Variante["dimensao"]]> = [
    ["#tmmSwatches", "formato"],
    ["#twister", "variacao"],
    ["#twister_feature_div", "variacao"],
    ["#twister-plus-inline-twister-card", "variacao"],
  ];
  for (const [sel, dimensao] of scopes) {
    const scope = root.querySelector(sel);
    if (!scope) continue;
    for (const el of scope.querySelectorAll("[data-asin], [data-defaultasin]")) {
      const asin = (el.getAttribute("data-asin") || el.getAttribute("data-defaultasin") || "").toUpperCase();
      if (!ASIN_ATTR_RE.test(asin) || seen.has(asin)) continue;
      seen.add(asin);
      const cls = el.getAttribute("class") ?? "";
      const preco = parseBRL(txt(el.querySelector(".slot-price, .a-color-secondary, .a-color-price")), { exigirMoeda: true });
      const rotulo = txt(el.querySelector(".a-button-text > span, .swatch-title-text, .a-button-text")).replace(/R\$\s*[\d.,]+.*$/, "").trim();
      out.push({ asin, rotulo, dimensao, selecionada: /\bselected\b|a-button-selected/.test(cls) || !!el.querySelector(".a-button-selected"), preco });
    }
  }
  return out;
}
