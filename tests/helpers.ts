import { readFileSync } from "node:fs";
import type { CollectDeps } from "../src/collector.ts";
import { collectOne } from "../src/collector.ts";
import type { Product, Store } from "../src/db.ts";

export const fx = (n: string): string => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), "utf8");

export interface FakeNet {
  product: string;
  panel: string;
  status: number;
  panelStatus: number;
  calls: string[];
}

export function fakeNet(init: Partial<FakeNet> = {}): FakeNet & { deps: CollectDeps; clock: { t: number } } {
  const net = { product: fx("product-real-shape.html"), panel: fx("offers-panel.html"), status: 200, panelStatus: 200, calls: [] as string[], ...init };
  const clock = { t: Date.UTC(2026, 9, 23, 14, 30) };
  const deps: CollectDeps = {
    fetchHtml: async (url) => {
      const isPanel = url.includes("aodAjaxMain");
      net.calls.push(isPanel ? "painel" : "produto");
      return { status: isPanel ? net.panelStatus : net.status, html: isPanel ? net.panel : net.product, ms: 1 };
    },
    now: () => new Date(clock.t),
    sleep: async () => undefined,
    delayMs: () => 0,
  };
  return Object.assign(net, { deps, clock });
}

/** Avança o relógio fake em 30 min, como uma rodada. */
export const tick = (n: { clock: { t: number } }): void => {
  n.clock.t += 30 * 60_000;
};

export const collectWith =
  (store: Store, deps: CollectDeps) =>
  (p: Product) =>
    collectOne(store, p, deps);
