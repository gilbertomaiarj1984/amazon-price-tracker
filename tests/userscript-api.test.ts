import { beforeEach, describe, expect, test } from "bun:test";
import { loadConfig } from "../src/config.ts";
import { Store } from "../src/db.ts";
import { panelHandler } from "../src/panel.ts";
import { RateLimit } from "../src/userscript-api.ts";

const NOW = new Date("2026-10-23T15:00:00.000Z");
const TOKEN = "u".repeat(32);
const ASIN = "B097BYXGXN";
const NEW = "B000000001";
let store: Store;
let handle: (r: Request) => Promise<Response>;
let collected = 0;

const mk = (over: Record<string, unknown> = {}) =>
  panelHandler({
    store,
    now: () => NOW,
    intervalMin: 30,
    usToken: TOKEN,
    collect: async (p) => {
      collected++;
      store.setTitulo?.(p.id, "Novo");
      return { ok: true } as any;
    },
    resolve: async (t) => ({ ok: true, asin: /B0\w{8}/.exec(t)?.[0] ?? ASIN }) as any,
    ...over,
  });
const call = (method: string, path: string, body?: unknown, h: Record<string, string> = {}) =>
  handle(new Request(`http://x${path}`, { method, headers: { "x-us-token": TOKEN, ...(body !== undefined ? { "content-type": "application/json", "x-us": "1" } : {}), ...h }, body: body !== undefined ? JSON.stringify(body) : undefined }));

beforeEach(() => {
  collected = 0;
  store = new Store(":memory:");
  const p = store.addProduct(ASIN, "Ketchup", "2026-10-01T00:00:00.000Z");
  store.saveSnapshot(p.id, "2026-10-23T14:30:00.000Z", [], { amazon: { linha: "amazon", preco: 10, vendedor: "Amazon" } });
  handle = mk();
});

describe("API do userscript", () => {
  test("sem USERSCRIPT_TOKEN a rota não existe", async () => {
    handle = mk({ usToken: null });
    expect((await call("GET", `/api/us/${ASIN}`)).status).toBe(404);
  });
  test("exige o token certo; PANEL_TOKEN não vale", async () => {
    expect((await call("GET", `/api/us/${ASIN}`, undefined, { "x-us-token": "errado" })).status).toBe(401);
    expect((await handle(new Request(`http://x/api/us/${ASIN}`))).status).toBe(401);
    expect((await handle(new Request(`http://x/api/us/${ASIN}?t=${TOKEN}`))).status).toBe(401);
    handle = mk({ token: "p".repeat(32) });
    expect((await handle(new Request(`http://x/api/us/${ASIN}`, { headers: { "x-selo-token": "p".repeat(32) } }))).status).toBe(401);
  });
  test("bloqueia depois de 10 tokens errados", async () => {
    for (let i = 0; i < 10; i++) expect((await call("GET", `/api/us/${ASIN}`, undefined, { "x-us-token": "x" })).status).toBe(401);
    const r = await call("GET", `/api/us/${ASIN}`, undefined, { "x-us-token": "x" });
    expect(r.status).toBe(429);
    expect(r.headers.get("retry-after")).toBeTruthy();
    expect((await call("GET", `/api/us/${ASIN}`)).status).toBe(429);
  });
  test("detalhe do item com linhas, estrela, grupo e última coleta", async () => {
    const p = store.getByAsin(ASIN)!;
    store.setEstrela(p.id, true);
    store.setUltimaColeta(p.id, { em: "2026-10-23T14:30:00.000Z", ok: true });
    const g = store.addGrupo("Ketchups", NOW.toISOString())!;
    store.setGrupo(p.id, g.id);
    const j = (await (await call("GET", `/api/us/${ASIN}`)).json()) as any;
    expect(j.atual).toBe(10);
    expect(j.estrela).toBe(true);
    expect(j.grupo).toEqual({ id: g.id, nome: "Ketchups" });
    expect(j.alvo).toBeNull();
    expect(j.menor).toBe(10);
    expect(j.ultimaColeta.ok).toBe(true);
    expect(j.edicao).toBe(true);
    expect(j.serie.length).toBe(1);
  });
  test("item não rastreado", async () => {
    const r = await call("GET", `/api/us/${NEW}`);
    expect(r.status).toBe(404);
    expect(((await r.json()) as any).rastreado).toBe(false);
  });
  test("define e apaga o alvo", async () => {
    const r = await call("PUT", `/api/us/${ASIN}/alvo`, { valor: "9,50" });
    expect(r.status).toBe(200);
    const j = (await r.json()) as any;
    expect(j.alvo).toBe(9.5);
    expect(j.dentroDoAlvo).toBe(false);
    expect(store.getAlvo(store.getByAsin(ASIN)!.id)).toBe(9.5);
    expect(((await (await call("PUT", `/api/us/${ASIN}/alvo`, { valor: 12 })).json()) as any).dentroDoAlvo).toBe(true);
    expect(((await (await call("PUT", `/api/us/${ASIN}/alvo`, { valor: null })).json()) as any).alvo).toBeNull();
  });
  test("valida o valor", async () => {
    for (const valor of [0, -1, "abc", 2_000_000, undefined]) expect((await call("PUT", `/api/us/${ASIN}/alvo`, { valor })).status).toBe(400);
  });
  test("escrita exige cabeçalho, JSON e corpo pequeno", async () => {
    expect((await call("PUT", `/api/us/${ASIN}/alvo`, { valor: 5 }, { "x-us": "0" })).status).toBe(403);
    expect((await call("PUT", `/api/us/${ASIN}/alvo`, { valor: 5 }, { "content-type": "text/plain" })).status).toBe(415);
    expect((await call("PUT", `/api/us/${ASIN}/alvo`, { valor: 5, x: "a".repeat(2000) })).status).toBe(413);
  });
  test("só as rotas previstas; sem CORS", async () => {
    expect((await call("DELETE", `/api/us/${ASIN}`, {})).status).toBe(405);
    expect((await call("POST", `/api/us/${ASIN}/alvo`, {})).status).toBe(405);
    expect((await call("PUT", `/api/us/${ASIN}/pausa`, {})).status).toBe(404);
    const r = await call("GET", `/api/us/${ASIN}`);
    expect([...r.headers.keys()].some((k) => k.startsWith("access-control"))).toBe(false);
    expect((await call("OPTIONS", `/api/us/${ASIN}`)).headers.get("access-control-allow-origin")).toBeNull();
  });
  test("rastrear cadastra o item; repetido dá 409", async () => {
    const r = await call("POST", `/api/us/${NEW}/rastrear`, {});
    expect(r.status).toBe(200);
    expect(collected).toBe(1);
    expect(store.getByAsin(NEW)).not.toBeNull();
    expect((await call("POST", `/api/us/${NEW}/rastrear`, {})).status).toBe(409);
  });
  test("limita cadastros a 10 por 10 minutos", async () => {
    let last = 0;
    for (let i = 0; i < 11; i++) last = (await call("POST", `/api/us/B00000000${i % 10}/rastrear`, {})).status;
    expect(last).toBe(429);
  });
  test("somente leitura: GET funciona, escrita recusada", async () => {
    handle = mk({ somenteLeitura: true });
    expect(((await (await call("GET", `/api/us/${ASIN}`)).json()) as any).edicao).toBe(false);
    expect((await call("PUT", `/api/us/${ASIN}/alvo`, { valor: 5 })).status).toBe(405);
  });
  test("o painel normal continua exigindo origem e não aceita /api/us sem token", async () => {
    expect((await handle(new Request(`http://x/api/itens/${ASIN}/alvo`, { method: "PUT", headers: { "x-us-token": TOKEN, "content-type": "application/json", "x-us": "1" }, body: "{}" }))).status).toBe(403);
  });
});

describe("RateLimit", () => {
  test("janela deslizante", () => {
    const r = new RateLimit(2, 1000);
    r.hit(0);
    r.hit(10);
    expect(r.wait(20)).toBe(980);
    expect(r.wait(1001)).toBe(0);
  });
});

describe("config USERSCRIPT_TOKEN", () => {
  const base = { TELEGRAM_BOT_TOKEN: "t", TELEGRAM_CHAT_ID: "1" };
  test("desligado por padrão, curto e igual ao PANEL_TOKEN recusados", () => {
    expect(loadConfig(base).userscriptToken).toBeNull();
    expect(loadConfig({ ...base, USERSCRIPT_TOKEN: TOKEN }).userscriptToken).toBe(TOKEN);
    expect(() => loadConfig({ ...base, USERSCRIPT_TOKEN: "curto" })).toThrow();
    expect(() => loadConfig({ ...base, USERSCRIPT_TOKEN: TOKEN, PANEL_TOKEN: TOKEN })).toThrow();
  });
});
