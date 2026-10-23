import type { LineKey, LinePoint, Offer, ProductPage } from "./types.ts";

export const SUSPECT_RATIO = 0.5;
const MIN_OFFERS_FOR_OUTLIER = 3;

const total = (o: Offer): number => o.preco + (o.frete ?? 0);

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Separa ofertas muito abaixo da mediana do grupo (golpe, item errado, condição falsa). */
export function dropSuspects(offers: Offer[]): { ok: Offer[]; descartadas: Offer[] } {
  if (offers.length < MIN_OFFERS_FOR_OUTLIER) return { ok: offers, descartadas: [] };
  const med = median(offers.map(total));
  const ok: Offer[] = [];
  const descartadas: Offer[] = [];
  for (const o of offers) (total(o) < med * SUSPECT_RATIO ? descartadas : ok).push(o);
  return { ok, descartadas };
}

function cheapest(offers: Offer[]): Offer | null {
  let best: Offer | null = null;
  for (const o of offers) if (!best || total(o) < total(best)) best = o;
  return best;
}

export interface Derived {
  points: Partial<Record<LineKey, LinePoint>>;
  descartadas: Offer[];
}

/**
 * Uma série por tipo de oferta. A linha Amazon só existe quando a própria Amazon
 * vende: nunca é preenchida com preço de terceiro.
 */
export function deriveLines(
  page: ProductPage,
  offers: Offer[],
  enabled: { terceiros: boolean; usado: boolean },
): Derived {
  const points: Derived["points"] = {};
  const descartadas: Offer[] = [];

  const amazonOffers = offers.filter((o) => o.vendidoPorAmazon && o.condicao === "novo");
  const fromPage = page.vendidoPorAmazon && page.buyBox != null ? page.buyBox : null;
  const fromPanel = cheapest(amazonOffers);
  const amazonPrice = [fromPage, fromPanel ? total(fromPanel) : null]
    .filter((v): v is number => v != null)
    .reduce<number | null>((min, v) => (min == null || v < min ? v : min), null);
  if (amazonPrice != null) points.amazon = { linha: "amazon", preco: amazonPrice, vendedor: "Amazon" };

  if (enabled.terceiros) {
    const novos = offers.filter((o) => !o.vendidoPorAmazon && o.condicao === "novo");
    const { ok, descartadas: d } = dropSuspects(novos);
    descartadas.push(...d);
    const best = cheapest(ok);
    if (best) points.terceiros = { linha: "terceiros", preco: total(best), vendedor: best.vendedor };
  }
  if (enabled.usado) {
    const usados = offers.filter((o) => o.condicao === "usado");
    const { ok, descartadas: d } = dropSuspects(usados);
    descartadas.push(...d);
    const best = cheapest(ok);
    if (best) points.usado = { linha: "usado", preco: total(best), vendedor: best.vendedor };
  }
  return { points, descartadas };
}
