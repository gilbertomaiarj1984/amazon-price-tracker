import { evaluate, FAILURE_THRESHOLD, shouldAlertFailures } from "./alerts.ts";
import type { AlertEvent } from "./alerts.ts";
import { fetchHtml, offersUrl, pickUserAgent, productUrl } from "./amazon/fetch.ts";
import type { Fetched } from "./amazon/fetch.ts";
import { detectBlock, parseOffersPanel, parseProductPage } from "./amazon/parse.ts";
import type { Product, Store } from "./db.ts";
import { deriveLines } from "./lines.ts";
import { LINE_KEYS } from "./types.ts";
import type { BlockKind, LineKey, LinePoint, Offer, ProductPage } from "./types.ts";

export interface CollectDeps {
  fetchHtml: (url: string, opts: { ua: string; referer?: string; ajax?: boolean }) => Promise<Fetched>;
  now: () => Date;
  sleep: (ms: number) => Promise<void>;
  /** Pausa entre a página e o painel de ofertas. */
  delayMs: () => number;
}

export const realDeps = (delayMs: () => number): CollectDeps => ({
  fetchHtml: (url, opts) => fetchHtml(url, opts),
  now: () => new Date(),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  delayMs,
});

export interface AlertItem {
  product: Product;
  evento: AlertEvent;
  vendedor: string | null;
}

export type CollectOutcome =
  | { ok: true; page: ProductPage; points: Partial<Record<LineKey, LinePoint>>; alertas: AlertItem[]; descartadas: number; painel: boolean }
  | { ok: false; kind: BlockKind; falhasProduto: number; avisarProduto: boolean };

/**
 * O painel só é buscado quando precisa: linhas extras ligadas, ou quando a Amazon pode estar vendendo fora da caixa de compra.
 * Com "Amazon Global" na caixa de compra, a Amazon.com.br pode ter uma oferta mais barata fora dela, e a página
 * nem sempre mostra a contagem de outras opções: o painel é buscado sempre.
 */
export function needsPanel(p: Product, page: ProductPage): boolean {
  const global = /global/i.test(page.buyBoxVendedor ?? "");
  if (!page.outrasOpcoes && !global) return false;
  return p.terceirosOn || p.usadoOn || !page.vendidoPorAmazon || global;
}

let uaCounter = 0;

/** Uma coleta de um produto: página, painel se preciso, linhas, alertas, gravação. Em falha, não grava preço. */
export async function collectOne(store: Store, product: Product, deps: CollectDeps): Promise<CollectOutcome> {
  const ua = pickUserAgent(uaCounter++);
  const page = await deps.fetchHtml(productUrl(product.asin), { ua });
  const kind = detectBlock(page.html, page.status, "product");
  if (kind !== "ok") return failed(store, product, kind);

  const parsed = parseProductPage(page.html);
  let offers: Offer[] = [];
  let painel = false;
  if (needsPanel(product, parsed)) {
    await deps.sleep(deps.delayMs());
    const panel = await deps.fetchHtml(offersUrl(product.asin), { ua, referer: productUrl(product.asin), ajax: true });
    const pk = detectBlock(panel.html, panel.status, "offers");
    if (pk !== "ok") return failed(store, product, pk);
    offers = parseOffersPanel(panel.html);
    painel = true;
  }

  const fresh = store.getById(product.id) ?? product;
  const { points, descartadas } = deriveLines(parsed, offers, { terceiros: fresh.terceirosOn, usado: fresh.usadoOn });
  const at = deps.now().toISOString();
  const enabled = LINE_KEYS.filter((k) => k === "amazon" || (k === "terceiros" ? fresh.terceirosOn : fresh.usadoOn));

  const alertas: AlertItem[] = [];
  const nextStates = enabled.map((linha) => {
    const ponto = points[linha] ?? null;
    const r = evaluate({
      linha,
      preco: ponto?.preco ?? null,
      alvo: store.getAlvo(fresh.id, linha),
      minimoAnterior: store.minBefore(fresh.id, linha, at),
      avisarNovoMinimo: true,
      prev: store.getAlertState(fresh.id, linha),
    });
    for (const evento of r.eventos) alertas.push({ product: fresh, evento, vendedor: ponto?.vendedor ?? null });
    return { linha, next: r.next };
  });

  store.saveSnapshot(fresh.id, at, [...offers.map((o) => ({ ...o })), ...descartadas.map((o) => ({ ...o, descartada: true }))], points);
  for (const s of nextStates) store.setAlertState(fresh.id, s.linha, s.next);
  if (parsed.titulo && parsed.titulo !== fresh.titulo) store.setTitulo(fresh.id, parsed.titulo);
  if (parsed.imagem && parsed.imagem !== fresh.imagem) store.setImagem(fresh.id, parsed.imagem);
  store.resetFailures(fresh.id);
  return { ok: true, page: parsed, points, alertas, descartadas: descartadas.length, painel };
}

function failed(store: Store, product: Product, kind: BlockKind): CollectOutcome {
  const n = store.recordFailure(product.id);
  // Um produto isolado falhando por muito tempo costuma ser link morto ou layout novo: avisa na 6ª e depois a cada 12.
  return { ok: false, kind, falhasProduto: n, avisarProduto: shouldAlertFailures(n, FAILURE_THRESHOLD * 2) };
}
