import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { resolveAsin } from "./amazon/asin.ts";
import { jitterMs } from "./amazon/fetch.ts";
import { Bot } from "./bot.ts";
import { collectOne, realDeps } from "./collector.ts";
import { loadConfig } from "./config.ts";
import { Store } from "./db.ts";
import { createLock } from "./mutex.ts";
import { loop, runCycle } from "./scheduler.ts";
import { Telegram } from "./telegram.ts";
import type { Update } from "./telegram.ts";
import { chatOf } from "./telegram.ts";

const log = (msg: string) => console.log(`${new Date().toISOString()} ${msg}`);

const cfg = (() => {
  try {
    return loadConfig();
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }
})();

mkdirSync(dirname(cfg.dbPath), { recursive: true });
const store = new Store(cfg.dbPath);
const tg = new Telegram(cfg.botToken, fetch, process.env["TELEGRAM_API_BASE"] || undefined);
const lock = createLock();
const ac = new AbortController();
const HEARTBEAT = process.env["HEARTBEAT_FILE"] ?? "/tmp/heartbeat";

const send = (html: string, kb?: Parameters<Telegram["sendMessage"]>[2]) => tg.sendMessage(cfg.chatId, html, kb);
const delay = () => jitterMs(cfg.reqMinMs, cfg.reqMaxMs);
// Uma requisição à Amazon por vez, venha ela do agendador ou de um link colado no chat.
const collect = (p: Parameters<typeof collectOne>[1]) => lock(() => collectOne(store, p, realDeps(delay)));

const bot = new Bot({ store, send, collect, resolve: (t) => resolveAsin(t), now: () => new Date() });

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(t);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const t = setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
  });

async function handleUpdate(u: Update): Promise<void> {
  const chat = chatOf(u);
  if (u.callback_query) await tg.answerCallback(u.callback_query.id).catch(() => undefined);
  if (chat !== cfg.chatId) {
    log("mensagem de outro chat ignorada");
    return;
  }
  try {
    if (u.callback_query?.data) await bot.handleCallback(u.callback_query.data);
    else if (u.message?.text) await bot.handleText(u.message.text);
  } catch (e) {
    log(`erro ao tratar mensagem: ${(e as Error).message}`);
    await send("Algo deu errado ao processar isso. Tente de novo.").catch(() => undefined);
  }
}

async function poll(): Promise<void> {
  let offset = Number(store.getMeta("tg_offset") ?? 0);
  let backoff = 0;
  while (!ac.signal.aborted) {
    try {
      const updates = await tg.getUpdates(offset, 50);
      backoff = 0;
      writeFileSync(HEARTBEAT, String(Date.now()));
      for (const u of updates) {
        offset = u.update_id + 1;
        store.setMeta("tg_offset", String(offset));
        await handleUpdate(u);
      }
    } catch (e) {
      log(`getUpdates falhou: ${(e as Error).message}`);
      backoff = Math.min(60_000, (backoff || 2_000) * 2);
      await sleep(backoff, ac.signal);
    }
  }
}

const intervalMs = cfg.intervalMin * 60_000;
const lastCycle = Number(store.getMeta("last_cycle_at") ?? 0);
const firstDelayMs = Math.max(10_000, intervalMs - (Date.now() - lastCycle));

const cycle = () =>
  runCycle({
    store,
    collect,
    send,
    now: () => new Date(),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    pauseMs: delay,
    log,
  }).finally(() => store.setMeta("last_cycle_at", String(Date.now())));

const stop = () => {
  log("encerrando");
  ac.abort();
  store.close();
  process.exit(0);
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);

log(`iniciado: ${store.list().length} itens, rodada a cada ${cfg.intervalMin} min, primeira em ${Math.round(firstDelayMs / 1000)} s`);
await send(`<b>Rastreador no ar.</b> ${store.list().length} itens, rodada a cada ${cfg.intervalMin} min. Use <code>/ajuda</code>.`).catch((e) => log(`aviso de início não enviado: ${(e as Error).message}`));

void loop(cycle, { intervalMs, firstDelayMs, jitterMs: () => Math.round(Math.random() * 60_000), sleep, signal: ac.signal, log });
await poll();
