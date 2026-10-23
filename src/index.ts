import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { resolveAsin } from "./amazon/asin.ts";
import { fetchHtml, jitterMs, productUrl } from "./amazon/fetch.ts";
import { esc, money } from "./format.ts";
import { Bot } from "./bot.ts";
import { collectOne, realDeps } from "./collector.ts";
import { loadConfig } from "./config.ts";
import { Store } from "./db.ts";
import { MAX_BODY, panelHandler } from "./panel.ts";
import { runVarredura, varreduraDevida } from "./sugestoes.ts";
import { createLock } from "./mutex.ts";
import { loop, msToNextSlot, runCycle } from "./scheduler.ts";
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

const send = (html: string, kb?: Parameters<Telegram["sendMessage"]>[2], photo?: string | null) => tg.sendMessage(cfg.chatId, html, kb, photo);
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
// Rodadas em horários fixos (:00 e :30 no padrão), como um cron interno: reiniciar o servidor não dispara coleta.
const slotDelay = () => msToNextSlot(Date.now(), cfg.intervalMin) + Math.round(Math.random() * 20_000);
const firstDelayMs = slotDelay();

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

if (cfg.panel) {
  Bun.serve({
    hostname: cfg.panel.host,
    port: cfg.panel.port,
    // Cadastrar links lê a Amazon uma por vez; dá tempo de sobra e limita o corpo das requisições.
    idleTimeout: 120,
    maxRequestBodySize: MAX_BODY,
    fetch: panelHandler({
      token: cfg.panelToken,
      usToken: cfg.userscriptToken,
      store,
      now: () => new Date(),
      intervalMin: cfg.intervalMin,
      collect,
      resolve: (t) => resolveAsin(t),
      somenteLeitura: cfg.panelReadonly,
    }),
  });
  log(`painel em http://${cfg.panel.host}:${cfg.panel.port} (${cfg.panelReadonly ? "somente leitura" : "com ações"})`);
}

if (cfg.sugestoes) {
  const sg = cfg.sugestoes;
  const varredura = async () => {
    if (!varreduraDevida(store, new Date(), sg.hora)) return;
    const r = await runVarredura({
      store,
      // Cada leitura entra na fila única; a rodada normal intercala entre uma e outra.
      fetchHtml: (url, opts) => lock(() => fetchHtml(url, opts)),
      now: () => new Date(),
      sleep: (ms) => new Promise((res) => setTimeout(res, ms)),
      pauseMs: () => jitterMs(sg.pausaMinMs, sg.pausaMaxMs),
      log,
      maxItens: sg.maxItens,
      maxCandidatos: sg.maxCandidatos,
    });
    if (r.novas > 0) {
      const pend = store.listSugestoes();
      await send(`<b>${r.novas} nova(s) sugestão(ões)</b> de item vendido e entregue pela Amazon para itens que ela não vende. ${pend.length} pendente(s)${cfg.panel ? "; também aparecem no painel (Sugestões)" : ""}.`).catch((e) => log(`aviso de sugestões não enviado: ${(e as Error).message}`));
      for (const s of pend.slice(-3)) {
        const o = store.getById(s.origemId);
        const cert = s.certeza === "baixa" ? "\nOutro formato: confira se é o mesmo produto." : "";
        await send(
          `<b>${esc(s.titulo ?? s.asin)}</b>\n${money(s.preco)} · ${esc(s.vendedor ?? "Amazon")}${s.formato ? ` · ${esc(s.formato)}` : ""}\nPara o item #${o ? store.numberOf(o.id) : "?"}.${cert}`,
          [[{ text: "Abrir na Amazon", url: productUrl(s.asin) }], [{ text: "Rastrear", callback_data: `sga:${s.id}` }, { text: "Recusar", callback_data: `sgr:${s.id}` }]],
        ).catch((e) => log(`sugestão não enviada: ${(e as Error).message}`));
      }
    }
    if (r.parou) await send("A varredura de sugestões parou: a Amazon pediu captcha. Tento de novo amanhã.").catch(() => undefined);
  };
  void loop(varredura, { intervalMs: 15 * 60_000, firstDelayMs: 60_000, jitterMs: () => Math.round(Math.random() * 60_000), sleep, signal: ac.signal, log });
}

const stop = () => {
  log("encerrando");
  ac.abort();
  store.close();
  process.exit(0);
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);

log(`iniciado: ${store.list().length} itens, rodada a cada ${cfg.intervalMin} min em horário fixo, primeira em ${Math.round(firstDelayMs / 1000)} s`);
await send(`<b>Rastreador no ar.</b> ${store.list().length} itens, rodada a cada ${cfg.intervalMin} min. Use <code>/ajuda</code>.`).catch((e) => log(`aviso de início não enviado: ${(e as Error).message}`));

void loop(cycle, { intervalMs, firstDelayMs, nextDelayMs: slotDelay, jitterMs: () => 0, sleep, signal: ac.signal, log });
await poll();
