import { recovered, shouldAlertFailures } from "./alerts.ts";
import { alertKeyboard, isMuted, photoOf } from "./bot.ts";
import type { CollectOutcome } from "./collector.ts";
import type { Product, Store } from "./db.ts";
import * as fmt from "./format.ts";
import type { Button } from "./telegram.ts";
import { buildView } from "./view.ts";

export interface CycleDeps {
  store: Store;
  collect: (p: Product) => Promise<CollectOutcome>;
  send: (html: string, keyboard?: Button[][], photo?: string | null) => Promise<void>;
  now: () => Date;
  sleep: (ms: number) => Promise<void>;
  /** Pausa entre produtos. */
  pauseMs: () => number;
  log: (msg: string) => void;
}

export interface CycleResult {
  tentados: number;
  ok: number;
  falhas: number;
  alertas: number;
}

const FAILS = "cycle_fails";
const FAILS_SINCE = "cycle_fails_since";
const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

/** Alerta importa: tenta de novo antes de desistir, porque o estado de "já avisado" já foi gravado. */
async function sendWithRetry(d: CycleDeps, html: string, kb?: Button[][], photo?: string | null): Promise<boolean> {
  for (const wait of [0, 1500, 5000]) {
    if (wait) await d.sleep(wait);
    try {
      await d.send(html, kb, photo);
      return true;
    } catch (e) {
      d.log(`falha ao enviar mensagem: ${(e as Error).message}`);
    }
  }
  return false;
}

export async function runCycle(d: CycleDeps): Promise<CycleResult> {
  const products = d.store.list().filter((p) => !p.pausado);
  const res: CycleResult = { tentados: 0, ok: 0, falhas: 0, alertas: 0 };
  const kinds = new Set<string>();

  for (const [i, p] of products.entries()) {
    if (i > 0) await d.sleep(d.pauseMs());
    res.tentados++;
    let outcome: CollectOutcome;
    try {
      outcome = await d.collect(p);
    } catch (e) {
      d.log(`erro de rede em ${p.asin}: ${(e as Error).message}`);
      outcome = { ok: false, kind: "http_error", falhasProduto: d.store.recordFailure(p.id), avisarProduto: false };
    }
    if (!outcome.ok) {
      res.falhas++;
      kinds.add(outcome.kind);
      d.log(`falha em ${p.asin}: ${outcome.kind} (${outcome.falhasProduto} seguidas)`);
      if (outcome.avisarProduto) {
        const fresh = d.store.getById(p.id);
        if (fresh) await sendWithRetry(d, fmt.productFailure(buildView(d.store, fresh, d.now()), outcome.kind, outcome.falhasProduto));
      }
      continue;
    }
    res.ok++;
    for (const item of outcome.alertas) {
      if (isMuted(d.store, item.product.id, d.now())) continue;
      const fresh = d.store.getById(item.product.id) ?? item.product;
      if (await sendWithRetry(d, fmt.alert(item, buildView(d.store, fresh, d.now())), alertKeyboard(fresh), photoOf(fresh))) res.alertas++;
    }
  }

  if (res.tentados > 0) {
    const prev = Number(d.store.getMeta(FAILS) ?? "0");
    if (res.ok === 0) {
      const n = prev + 1;
      d.store.setMeta(FAILS, String(n));
      if (n === 1) d.store.setMeta(FAILS_SINCE, hhmm(d.now()));
      if (shouldAlertFailures(n)) await sendWithRetry(d, fmt.cycleFailure(n, [...kinds], d.store.getMeta(FAILS_SINCE) ?? "?"));
    } else {
      if (recovered(prev)) await sendWithRetry(d, fmt.cycleRecovered());
      d.store.setMeta(FAILS, null);
      d.store.setMeta(FAILS_SINCE, null);
    }
  }
  d.log(`rodada: ${res.ok}/${res.tentados} ok, ${res.falhas} falhas, ${res.alertas} alertas`);
  return res;
}

export interface LoopOptions {
  intervalMs: number;
  firstDelayMs: number;
  jitterMs: () => number;
  sleep: (ms: number, signal: AbortSignal) => Promise<void>;
  signal: AbortSignal;
  now?: () => number;
  log: (msg: string) => void;
}

/** Roda `run` a cada intervalo (descontando o tempo da própria rodada), com jitter. Não deixa uma exceção matar o laço. */
export async function loop(run: () => Promise<unknown>, o: LoopOptions): Promise<void> {
  const now = o.now ?? Date.now;
  await o.sleep(o.firstDelayMs, o.signal);
  while (!o.signal.aborted) {
    const t0 = now();
    try {
      await run();
    } catch (e) {
      o.log(`rodada falhou: ${(e as Error).message}`);
    }
    if (o.signal.aborted) break;
    await o.sleep(Math.max(0, o.intervalMs - (now() - t0)) + o.jitterMs(), o.signal);
  }
}
