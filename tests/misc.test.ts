import { describe, expect, test } from "bun:test";
import { loadConfig } from "../src/config.ts";
import { createLock } from "../src/mutex.ts";
import { parseUserNumber } from "../src/numbers.ts";
import { chatOf, Telegram } from "../src/telegram.ts";

describe("parseUserNumber", () => {
  test.each([
    ["449", 449],
    ["449,90", 449.9],
    ["1.299,90", 1299.9],
    ["R$ 199", 199],
    ["449.90", 449.9],
    [" 20 ", 20],
  ])("%s", (s, v) => expect(parseUserNumber(s)).toBe(v));
  test.each(["", "abc", "0", "-5", "12abc", "1,2,3x"])("recusa %p", (s) => expect(parseUserNumber(s)).toBeNull());
});

describe("loadConfig", () => {
  const ok = { TELEGRAM_BOT_TOKEN: "t", TELEGRAM_CHAT_ID: "123" };
  test("padrões", () => expect(loadConfig(ok)).toMatchObject({ chatId: 123, intervalMin: 30, reqMinMs: 2000, reqMaxMs: 5000, dbPath: "./data/tracker.db" }));
  test("exige token e chat", () => {
    expect(() => loadConfig({})).toThrow(/TELEGRAM_BOT_TOKEN/);
    expect(() => loadConfig({ TELEGRAM_BOT_TOKEN: "t" })).toThrow(/TELEGRAM_CHAT_ID/);
    expect(() => loadConfig({ TELEGRAM_BOT_TOKEN: "t", TELEGRAM_CHAT_ID: "abc" })).toThrow(/TELEGRAM_CHAT_ID/);
  });
  test("intervalo mínimo de 5 min protege o IP", () => expect(() => loadConfig({ ...ok, INTERVAL_MIN: "1" })).toThrow(/INTERVAL_MIN/));
  test("máximo não pode ser menor que o mínimo", () => expect(() => loadConfig({ ...ok, REQ_MIN_MS: "4000", REQ_MAX_MS: "3000" })).toThrow(/REQ_MAX_MS/));
});

describe("createLock", () => {
  test("executa uma por vez, na ordem, mesmo se uma falhar", async () => {
    const lock = createLock();
    const log: string[] = [];
    const slow = lock(async () => (await new Promise((r) => setTimeout(r, 20)), log.push("a")));
    const bad = lock(async () => (log.push("b"), Promise.reject(new Error("x"))));
    const last = lock(async () => log.push("c"));
    await slow;
    await expect(bad).rejects.toThrow("x");
    await last;
    expect(log).toEqual(["a", "b", "c"]);
  });
});

describe("Telegram", () => {
  test("monta a chamada e devolve o resultado", async () => {
    let seen: { url: string; body: Record<string, unknown> } | null = null;
    const tg = new Telegram("SEGREDO", async (url, init) => {
      seen = { url, body: JSON.parse(String(init?.body)) };
      return new Response(JSON.stringify({ ok: true, result: [{ update_id: 7 }] }));
    });
    expect(await tg.getUpdates(5, 1)).toEqual([{ update_id: 7 }]);
    expect(seen!.url).toContain("/botSEGREDO/getUpdates");
    expect(seen!.body).toMatchObject({ offset: 5, timeout: 1 });
  });
  test("erro da API não vaza o token", async () => {
    const tg = new Telegram("SEGREDO", async () => new Response(JSON.stringify({ ok: false, description: "Unauthorized" }), { status: 401 }));
    const err = await tg.sendMessage(1, "oi").catch((e: Error) => e);
    expect((err as Error).message).toContain("401");
    expect((err as Error).message).not.toContain("SEGREDO");
  });
  test("erro de rede não vaza o token", async () => {
    const tg = new Telegram("SEGREDO", async () => {
      throw new Error("connect https://api.telegram.org/botSEGREDO/x failed");
    });
    const err = await tg.sendMessage(1, "oi").catch((e: Error) => e);
    expect((err as Error).message).not.toContain("SEGREDO");
  });
  test("chatOf lê mensagem e botão", () => {
    expect(chatOf({ update_id: 1, message: { chat: { id: 9 }, text: "x" } })).toBe(9);
    expect(chatOf({ update_id: 2, callback_query: { id: "c", message: { chat: { id: 8 } } } })).toBe(8);
    expect(chatOf({ update_id: 3 })).toBeUndefined();
  });
});
