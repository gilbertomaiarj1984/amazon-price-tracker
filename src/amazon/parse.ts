import { parse } from "node-html-parser";
import type { HTMLElement } from "node-html-parser";
import type { BlockKind, Offer, ProductPage } from "../types.ts";

/**
 * Seletores escritos a partir do que a Amazon costuma servir. Ainda não foram
 * calibrados contra HTML real: rode `bun scripts/spike.ts` no VPS e ajuste
 * aqui com as fixtures salvas em tests/fixtures/real/.
 */

const PRICE_SELECTORS = [
  "#corePrice_feature_div .a-price .a-offscreen",
  "#corePriceDisplay_desktop_feature_div .a-price .a-offscreen",
  "#apex_desktop .priceToPay .a-offscreen",
  ".priceToPay .a-offscreen",
  "#price_inside_buybox",
  "#priceblock_ourprice",
  "#priceblock_dealprice",
  ".a-price .a-offscreen",
];
const OTHER_OFFERS_SELECTORS = [
  "#olp_feature_div",
  "#dynamic-aod-ingress-box",
  "#aod-ingress-link",
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

export function parseBRL(text: string | null | undefined): number | null {
  if (!text) return null;
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

function isAmazonSeller(name: string | null | undefined): boolean {
  if (!name) return false;
  return /^amazon(\.com\.br)?$/i.test(name.trim());
}

export function parseProductPage(html: string): ProductPage {
  const root = parse(html);
  let titulo = txt(root.querySelector("#productTitle")) || null;
  if (!titulo) {
    const t = txt(root.querySelector("title"));
    titulo = t ? t.split(/\s[:|–-]\s/)[0]?.trim() || null : null;
  }

  const availability = txt(root.querySelector("#availability")).toLowerCase();
  const indisponivel = /indispon[ií]vel/.test(availability);
  const buyBox = indisponivel ? null : parseBRL(firstText(root, PRICE_SELECTORS));

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
  return {
    titulo,
    buyBox,
    buyBoxVendedor: vendedor,
    vendidoPorAmazon: buyBox != null && isAmazonSeller(vendedor),
    outrasAPartirDe: parseBRL(other),
    disponivel: buyBox != null,
  };
}

function parseFrete(block: HTMLElement): number | null {
  const t = txt(block);
  if (/frete\s+gr[aá]tis|entrega\s+gr[aá]tis/i.test(t)) return 0;
  const m = /(?:\+\s*)?R\$\s*([\d.]+(?:,\d{1,2})?)\s*(?:de\s+)?(?:frete|entrega)/i.exec(t);
  return m ? parseBRL(m[1]) : null;
}

export function parseOffersPanel(html: string): Offer[] {
  const root = parse(html);
  const blocks = root.querySelectorAll('[id="aod-pinned-offer"], [id="aod-offer"]');
  const out: Offer[] = [];
  const seen = new Set<string>();
  for (const b of blocks) {
    const preco = parseBRL(txt(b.querySelector(".a-price .a-offscreen")));
    if (preco == null) continue;
    const soldBy =
      txt(b.querySelector('[id="aod-offer-soldBy"] a')) ||
      txt(b.querySelector('[id="aod-offer-soldBy"] .a-col-right')) ||
      "Desconhecido";
    const shipsFrom = txt(b.querySelector('[id="aod-offer-shipsFrom"] .a-col-right'));
    const heading = txt(b.querySelector('[id="aod-offer-heading"]'));
    const condicao: Offer["condicao"] = heading && !/^novo/i.test(heading) ? "usado" : "novo";
    const frete = parseFrete(b);
    const key = `${soldBy}|${condicao}|${preco}|${frete}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      vendedor: soldBy,
      condicao,
      preco,
      frete,
      envio: /amazon/i.test(shipsFrom) ? "amazon" : "terceiro",
      vendidoPorAmazon: isAmazonSeller(soldBy),
    });
  }
  return out;
}
