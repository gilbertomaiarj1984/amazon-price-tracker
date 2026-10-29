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

/** Menor preço total; no empate, quem é enviado pela Amazon, depois o nome do vendedor (resultado estável). */
function cheapest(offers: Offer[]): Offer | null {
  let best: Offer | null = null;
  for (const o of offers) {
    if (!best) best = o;
    else if (total(o) !== total(best)) best = total(o) < total(best) ? o : best;
    else if (o.envio !== best.envio) best = o.envio === "amazon" ? o : best;
    else if (o.vendedor < best.vendedor) best = o;
  }
  return best;
}

/** Melhor terceiro (novo), mostrado no lugar da Amazon quando ela não vende. */
export interface Fallback {
  preco: number;
  vendedor: string;
  /** null = a página não informou quem envia (só a caixa de compra foi lida). */
  envio: Offer["envio"] | null;
}

export interface Derived {
  points: Partial<Record<LineKey, LinePoint>>;
  descartadas: Offer[];
  /** Só existe quando a Amazon não tem oferta nova. */
  fallback: Fallback | null;
}

/**
 * Só ofertas em condição Nova entram (usado, recondicionado e "de colecionador" ficam de fora). Uma série por fonte. A linha Amazon só existe quando a própria Amazon
 * vende: nunca é preenchida com preço de terceiro. Sem Amazon, `fallback` traz o melhor
 * terceiro novo (só para exibir e alertar) e ele também é gravado na série Terceiros.
 */
export function deriveLines(
  page: ProductPage,
  offers: Offer[],
  enabled: { terceiros: boolean },
): Derived {
  const points: Derived["points"] = {};
  const descartadas: Offer[] = [];
  let fallback: Fallback | null = null;

  const amazonOffers = offers.filter((o) => o.vendidoPorAmazon && o.condicao === "novo");
  const fromPage = page.vendidoPorAmazon && page.buyBox != null ? page.buyBox : null;
  const fromPanel = cheapest(amazonOffers);
  const amazonPrice = [fromPage, fromPanel ? total(fromPanel) : null]
    .filter((v): v is number => v != null)
    .reduce<number | null>((min, v) => (min == null || v < min ? v : min), null);
  if (amazonPrice != null) points.amazon = { linha: "amazon", preco: amazonPrice, vendedor: "Amazon" };

  if (enabled.terceiros || amazonPrice == null) {
    const novos = offers.filter((o) => !o.vendidoPorAmazon && o.condicao === "novo");
    const { ok, descartadas: d } = dropSuspects(novos);
    descartadas.push(...d);
    const best = cheapest(ok);
    if (best) {
      const ponto: LinePoint = { linha: "terceiros", preco: total(best), vendedor: best.vendedor };
      // Sem Amazon, o melhor terceiro vira o preço exibido; a série Terceiros guarda o histórico dele.
      if (amazonPrice == null) fallback = { preco: ponto.preco, vendedor: best.vendedor, envio: best.envio };
      points.terceiros = ponto;
    } else if (amazonPrice == null && page.buyBox != null && !page.vendidoPorAmazon && ok.length === 0 && novos.length === 0) {
      // Painel sem terceiros, mas a caixa de compra da página é de um terceiro.
      const vendedor = page.buyBoxVendedor ?? "Desconhecido";
      fallback = { preco: page.buyBox, vendedor, envio: null };
      points.terceiros = { linha: "terceiros", preco: page.buyBox, vendedor };
    }
  }
  return { points, descartadas, fallback };
}
