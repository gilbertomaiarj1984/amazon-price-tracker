import { beforeEach, describe, expect, test } from "bun:test";
import { loadConfig } from "../src/config.ts";
import { Store } from "../src/db.ts";
import { amazonGaps, downsample, panelHandler } from "../src/panel.ts";

const NOW = new Date("2026-10-23T15:00:00.000Z");
let store: Store;
let handle: (r: Request) => Response;
const get = (path: string, method = "GET") => handle(new Request(`http://x${path}`, { method }));

beforeEach(() => {
  store = new Store(":memory:");
  handle = panelHandler({ store, now: () => NOW, intervalMin: 30 });
  const p = store.addProduct("B097BYXGXN", "Ketchup", "2026-10-01T00:00:00.000Z");
  store.setLinhaOn(p.id, "terceiros", true);
  const am = { linha: "amazon", preco: 10, vendedor: "Amazon" } as const;
  const te = (preco: number) => ({ linha: "terceiros", preco, vendedor: "Loja" }) as const;
  const o = (preco: number) => ({ vendedor: "Loja", condicao: "novo", preco, frete: null, envio: "terceiro", vendidoPorAmazon: false }) as const;
  store.saveSnapshot(p.id, "2026-10-23T12:00:00.000Z", [o(9)], { amazon: am, terceiros: te(9) });
  store.saveSnapshot(p.id, "2026-10-23T13:00:00.000Z", [o(8)], { terceiros: te(8) });
  store.saveSnapshot(p.id, "2026-10-23T14:00:00.000Z", [{ ...o(1), descartada: true }, o(8)], { terceiros: te(8) });
  store.saveSnapshot(p.id, "2026-10-23T14:30:00.000Z", [o(8)], { amazon: am, terceiros: te(8) });
  store.setMeta("last_cycle_at", String(NOW.getTime() - 10 * 60_000));
});

describe("amazonGaps", () => {
  test("faixa entre a última coleta com Amazon e a próxima", () => {
    expect(amazonGaps(["a", "b", "c", "d"], new Set(["a", "d"]))).toEqual([{ de: "a", ate: "d" }]);
  });
  test("faixa aberta no fim termina na última coleta", () => {
    expect(amazonGaps(["a", "b", "c"], new Set(["a"]))).toEqual([{ de: "a", ate: "c" }]);
  });
  test("sem Amazon desde o início", () => {
    expect(amazonGaps(["a", "b"], new Set())).toEqual([{ de: "a", ate: "b" }]);
  });
  test("sem buraco, sem faixa", () => {
    expect(amazonGaps(["a", "b"], new Set(["a", "b"]))).toEqual([]);
  });
});

describe("painel", () => {
  test("lista itens com saúde em dia", async () => {
    const r = get("/api/itens");
    expect(r.status).toBe(200);
    const j = (await r.json()) as any;
    expect(j.saude.status).toBe("ok");
    expect(j.itens[0].asin).toBe("B097BYXGXN");
    expect(j.itens[0].linhas.amazon.atual).toBe(10);
    expect(j.itens[0].mini.length).toBeGreaterThan(1);
  });

  test("saúde: atrasado, sem rodada e falhando", async () => {
    store.setMeta("last_cycle_at", String(NOW.getTime() - 3 * 3600_000));
    expect(((await get("/api/saude").json()) as any).status).toBe("atrasado");
    store.setMeta("last_cycle_at", null);
    expect(((await get("/api/saude").json()) as any).status).toBe("sem_rodada");
    store.setMeta("cycle_fails", "2");
    expect(((await get("/api/saude").json()) as any).status).toBe("falhando");
  });

  test("detalhe: séries, faixa sem Amazon e ofertas da última coleta", async () => {
    const j = (await get("/api/itens/B097BYXGXN?dias=7").json()) as any;
    expect(j.series.amazon.length).toBe(2);
    expect(j.series.terceiros.length).toBe(4);
    expect(j.semAmazon).toEqual([{ de: "2026-10-23T12:00:00.000Z", ate: "2026-10-23T14:30:00.000Z" }]);
    expect(j.ofertas.length).toBe(1);
  });

  test("janela de dias respeitada", async () => {
    store.saveSnapshot(1, "2026-10-10T00:00:00.000Z", [], { amazon: { linha: "amazon", preco: 20, vendedor: "Amazon" } });
    expect(((await get("/api/itens/B097BYXGXN?dias=7").json()) as any).series.amazon.length).toBe(2);
    expect(((await get("/api/itens/B097BYXGXN?dias=30").json()) as any).series.amazon.length).toBe(3);
  });

  test("entradas inválidas", () => {
    expect(get("/api/itens/B097BYXGXN?dias=5").status).toBe(400);
    expect(get("/api/itens/NAOEXISTE1").status).toBe(404);
    expect(get("/api/itens/x'%20OR%201=1").status).toBe(404);
    expect(get("/nada").status).toBe(404);
  });

  test("somente leitura", () => {
    for (const m of ["POST", "PUT", "DELETE"]) expect(get("/api/itens", m).status).toBe(405);
  });

  test("página com cabeçalhos de segurança e sem recursos externos", async () => {
    const r = get("/");
    expect(r.headers.get("content-security-policy")).toContain("default-src 'none'");
    const html = await r.text();
    expect(html).not.toMatch(/https?:\/\//);
  });

  test("não vaza token nem chat", async () => {
    const txt = await get("/api/itens").text();
    expect(txt).not.toContain("TELEGRAM");
  });
});

describe("config do painel", () => {
  const base = { TELEGRAM_BOT_TOKEN: "t", TELEGRAM_CHAT_ID: "1" };
  test("desligado por padrão", () => expect(loadConfig(base).panel).toBeNull());
  test("loopback por padrão quando ligado", () => expect(loadConfig({ ...base, PANEL_PORT: "8787" }).panel).toEqual({ host: "127.0.0.1", port: 8787 }));
  test("host explícito", () => expect(loadConfig({ ...base, PANEL_PORT: "8787", PANEL_HOST: "0.0.0.0" }).panel?.host).toBe("0.0.0.0"));
  test("porta inválida", () => expect(() => loadConfig({ ...base, PANEL_PORT: "abc" })).toThrow());
});

describe("selo do userscript", () => {
  const TOKEN = "t".repeat(32);
  const sel = (path: string, token?: string) =>
    handle(new Request(`http://x${path}`, { headers: token ? { "x-selo-token": token } : {} }));
  beforeEach(() => {
    handle = panelHandler({ store, now: () => NOW, intervalMin: 30, token: TOKEN });
  });

  test("sem token configurado a rota não existe", () => {
    handle = panelHandler({ store, now: () => NOW, intervalMin: 30 });
    expect(sel("/api/selo/B097BYXGXN", TOKEN).status).toBe(404);
  });
  test("exige o token certo", () => {
    expect(sel("/api/selo/B097BYXGXN").status).toBe(401);
    expect(sel("/api/selo/B097BYXGXN", "errado").status).toBe(401);
    expect(sel("/api/selo/B097BYXGXN?t=" + TOKEN).status).toBe(401);
  });
  test("item rastreado devolve só o resumo", async () => {
    const j = (await sel("/api/selo/B097BYXGXN", TOKEN).json()) as any;
    expect(Object.keys(j).sort()).toEqual(["atual", "atualizadoEm", "coletas", "linha", "max", "media", "min", "rastreado", "serie", "veredito"]);
    expect(j.rastreado).toBe(true);
    expect(j.atual).toBe(10);
    expect(j.veredito).toBe("sem_dados");
  });
  test("série do gráfico em ordem de tempo", async () => {
    const j = (await sel("/api/selo/B097BYXGXN", TOKEN).json()) as any;
    expect(j.serie.length).toBe(2);
    expect(j.serie[0].t < j.serie[1].t).toBe(true);
    expect(Object.keys(j.serie[0]).sort()).toEqual(["t", "v"]);
  });
  test("downsample mantém extremos e limita o tamanho", () => {
    const r = downsample(Array.from({ length: 1000 }, (_, i) => i), 120);
    expect(r.length).toBe(120);
    expect(r[0]).toBe(0);
    expect(r[119]).toBe(999);
    expect(downsample([1, 2, 3], 120)).toEqual([1, 2, 3]);
  });
  test("veredito pelo preço atual", async () => {
    const am = (preco: number) => ({ amazon: { linha: "amazon", preco, vendedor: "Amazon" } }) as const;
    store.saveSnapshot(1, "2026-10-23T14:40:00.000Z", [], am(8));
    store.saveSnapshot(1, "2026-10-23T14:50:00.000Z", [], am(20));
    expect(((await sel("/api/selo/B097BYXGXN", TOKEN).json()) as any).veredito).toBe("acima");
    store.saveSnapshot(1, "2026-10-23T14:55:00.000Z", [], am(8));
    expect(((await sel("/api/selo/B097BYXGXN", TOKEN).json()) as any).veredito).toBe("minimo");
  });
  test("item não rastreado e ASIN inválido", async () => {
    const r = sel("/api/selo/B000000000", TOKEN);
    expect(r.status).toBe(404);
    expect(((await r.json()) as any).rastreado).toBe(false);
    expect(sel("/api/selo/x", TOKEN).status).toBe(404);
  });
});
