import { beforeEach, describe, expect, test } from "bun:test";
import { resolveAsin } from "../src/amazon/asin.ts";
import { collectOne } from "../src/collector.ts";
import { loadConfig } from "../src/config.ts";
import { Store } from "../src/db.ts";
import { amazonGaps, downsample, panelHandler, panelItems } from "../src/panel.ts";
import { fakeNet } from "./helpers.ts";

const NOW = new Date("2026-10-23T15:00:00.000Z");
let store: Store;
let handle: (r: Request) => Promise<Response>;
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
  test("faixa entre a última coleta com Amazon e a próxima", async () => {
    expect(amazonGaps(["a", "b", "c", "d"], new Set(["a", "d"]))).toEqual([{ de: "a", ate: "d" }]);
  });
  test("faixa aberta no fim termina na última coleta", async () => {
    expect(amazonGaps(["a", "b", "c"], new Set(["a"]))).toEqual([{ de: "a", ate: "c" }]);
  });
  test("sem Amazon desde o início", async () => {
    expect(amazonGaps(["a", "b"], new Set())).toEqual([{ de: "a", ate: "b" }]);
  });
  test("sem buraco, sem faixa", async () => {
    expect(amazonGaps(["a", "b"], new Set(["a", "b"]))).toEqual([]);
  });
});

describe("painel", () => {
  test("lista itens com saúde em dia", async () => {
    const r = await get("/api/itens");
    expect(r.status).toBe(200);
    const j = (await r.json()) as any;
    expect(j.saude.status).toBe("ok");
    expect(j.itens[0].asin).toBe("B097BYXGXN");
    expect(j.itens[0].linhas.amazon.atual).toBe(10);
    expect(j.itens[0].mini.length).toBeGreaterThan(1);
  });

  test("saúde: atrasado, sem rodada e falhando", async () => {
    store.setMeta("last_cycle_at", String(NOW.getTime() - 3 * 3600_000));
    expect(((await (await get("/api/saude")).json()) as any).status).toBe("atrasado");
    store.setMeta("last_cycle_at", null);
    expect(((await (await get("/api/saude")).json()) as any).status).toBe("sem_rodada");
    store.setMeta("cycle_fails", "2");
    expect(((await (await get("/api/saude")).json()) as any).status).toBe("falhando");
  });

  test("detalhe: séries, faixa sem Amazon e ofertas da última coleta", async () => {
    const j = (await (await get("/api/itens/B097BYXGXN?dias=7")).json()) as any;
    expect(j.series.amazon.length).toBe(2);
    expect(j.series.terceiros.length).toBe(4);
    expect(j.semAmazon).toEqual([{ de: "2026-10-23T12:00:00.000Z", ate: "2026-10-23T14:30:00.000Z" }]);
    expect(j.ofertas.length).toBe(1);
  });

  test("janela de dias respeitada", async () => {
    store.saveSnapshot(1, "2026-10-10T00:00:00.000Z", [], { amazon: { linha: "amazon", preco: 20, vendedor: "Amazon" } });
    expect(((await (await get("/api/itens/B097BYXGXN?dias=7")).json()) as any).series.amazon.length).toBe(2);
    expect(((await (await get("/api/itens/B097BYXGXN?dias=30")).json()) as any).series.amazon.length).toBe(3);
  });

  test("entradas inválidas", async () => {
    expect((await get("/api/itens/B097BYXGXN?dias=5")).status).toBe(400);
    expect((await get("/api/itens/NAOEXISTE1")).status).toBe(404);
    expect((await get("/api/itens/x'%20OR%201=1")).status).toBe(404);
    expect((await get("/nada")).status).toBe(404);
  });

  test("somente leitura", async () => {
    for (const m of ["POST", "PUT", "DELETE"]) expect((await get("/api/itens", m)).status).toBe(405);
  });

  test("página com cabeçalhos de segurança e sem recursos externos", async () => {
    const r = await get("/");
    expect(r.headers.get("content-security-policy")).toContain("default-src 'none'");
    const html = await r.text();
    expect(html).not.toMatch(/https?:\/\//);
  });

  test("não vaza token nem chat", async () => {
    const txt = await (await get("/api/itens")).text();
    expect(txt).not.toContain("TELEGRAM");
  });
});

describe("config do painel", () => {
  const base = { TELEGRAM_BOT_TOKEN: "t", TELEGRAM_CHAT_ID: "1" };
  test("desligado por padrão", async () => expect(loadConfig(base).panel).toBeNull());
  test("loopback por padrão quando ligado", async () => expect(loadConfig({ ...base, PANEL_PORT: "8787" }).panel).toEqual({ host: "127.0.0.1", port: 8787 }));
  test("host explícito", async () => expect(loadConfig({ ...base, PANEL_PORT: "8787", PANEL_HOST: "0.0.0.0" }).panel?.host).toBe("0.0.0.0"));
  test("porta inválida", async () => expect(() => loadConfig({ ...base, PANEL_PORT: "abc" })).toThrow());
});

describe("selo do userscript", () => {
  const TOKEN = "t".repeat(32);
  const sel = (path: string, token?: string) =>
    handle(new Request(`http://x${path}`, { headers: token ? { "x-selo-token": token } : {} }));
  beforeEach(() => {
    handle = panelHandler({ store, now: () => NOW, intervalMin: 30, token: TOKEN });
  });

  test("sem token configurado a rota não existe", async () => {
    handle = panelHandler({ store, now: () => NOW, intervalMin: 30 });
    expect((await sel("/api/selo/B097BYXGXN", TOKEN)).status).toBe(404);
  });
  test("exige o token certo", async () => {
    expect((await sel("/api/selo/B097BYXGXN")).status).toBe(401);
    expect((await sel("/api/selo/B097BYXGXN", "errado")).status).toBe(401);
    expect((await sel("/api/selo/B097BYXGXN?t=" + TOKEN)).status).toBe(401);
  });
  test("item rastreado devolve só o resumo", async () => {
    const j = (await (await sel("/api/selo/B097BYXGXN", TOKEN)).json()) as any;
    expect(Object.keys(j).sort()).toEqual(["atual", "atualizadoEm", "coletas", "linha", "max", "media", "min", "rastreado", "serie", "veredito"]);
    expect(j.rastreado).toBe(true);
    expect(j.atual).toBe(10);
    expect(j.veredito).toBe("sem_dados");
  });
  test("série do gráfico em ordem de tempo", async () => {
    const j = (await (await sel("/api/selo/B097BYXGXN", TOKEN)).json()) as any;
    expect(j.serie.length).toBe(2);
    expect(j.serie[0].t < j.serie[1].t).toBe(true);
    expect(Object.keys(j.serie[0]).sort()).toEqual(["t", "v"]);
  });
  test("downsample mantém extremos e limita o tamanho", async () => {
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
    expect(((await (await sel("/api/selo/B097BYXGXN", TOKEN)).json()) as any).veredito).toBe("acima");
    store.saveSnapshot(1, "2026-10-23T14:55:00.000Z", [], am(8));
    expect(((await (await sel("/api/selo/B097BYXGXN", TOKEN)).json()) as any).veredito).toBe("minimo");
  });
  test("item não rastreado e ASIN inválido", async () => {
    const r = await sel("/api/selo/B000000000", TOKEN);
    expect(r.status).toBe(404);
    expect(((await r.json()) as any).rastreado).toBe(false);
    expect((await sel("/api/selo/x", TOKEN)).status).toBe(404);
  });
});

describe("ações do painel (escrita)", () => {
  const TOKEN = "t".repeat(32);
  const ORIGIN = "http://painel.test";
  let net: ReturnType<typeof fakeNet>;
  const W = (path: string, method: string, body?: unknown, h: Record<string, string> = {}) =>
    handle(
      new Request(`${ORIGIN}${path}`, {
        method,
        headers: { origin: ORIGIN, "content-type": "application/json", "x-painel": "1", ...h },
        body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
      }),
    );
  const ASIN = "B097BYXGXN";

  beforeEach(() => {
    net = fakeNet();
    handle = panelHandler({
      store,
      now: () => new Date(net.clock.t),
      intervalMin: 30,
      token: TOKEN,
      collect: (p) => collectOne(store, p, net.deps),
      resolve: (t) => resolveAsin(t, async () => new Response(null, { status: 404 })),
    });
  });

  test("lista informa que a edição está ligada; somenteLeitura desliga", async () => {
    expect(((await (await handle(new Request(`${ORIGIN}/api/itens`))).json()) as any).edicao).toBe(true);
    handle = panelHandler({ store, now: () => NOW, intervalMin: 30, collect: async () => ({ ok: true }) as any, resolve: async () => ({ ok: true, asin: ASIN }), somenteLeitura: true });
    expect(((await (await handle(new Request(`${ORIGIN}/api/itens`))).json()) as any).edicao).toBe(false);
    expect((await W(`/api/itens/${ASIN}/pausa`, "PUT", { pausado: true })).status).toBe(405);
  });

  test("cadastra por link, lê a página e devolve o item", async () => {
    store.remove(1);
    const r = await W("/api/itens", "POST", { texto: "olha https://www.amazon.com.br/dp/B097BYXGXN?ref=x" });
    expect(r.status).toBe(200);
    const j = (await r.json()) as any;
    expect(j.resultados[0].status).toBe("novo");
    expect(j.resultados[0].item.asin).toBe(ASIN);
    expect(store.list()).toHaveLength(1);
    expect(net.calls.length).toBeGreaterThan(0);
  });

  test("link repetido, domínio inválido e leitura que falha", async () => {
    let j = (await (await W("/api/itens", "POST", { texto: `https://www.amazon.com.br/dp/${ASIN}` })).json()) as any;
    expect(j.resultados[0].status).toBe("existente");
    j = (await (await W("/api/itens", "POST", { texto: "https://example.com/x" })).json()) as any;
    expect(j.resultados[0].status).toBe("erro");
    net.status = 503;
    j = (await (await W("/api/itens", "POST", { texto: "https://www.amazon.com.br/dp/B000000001" })).json()) as any;
    expect(j.resultados[0].status).toBe("erro");
    expect(store.getByAsin("B000000001")).toBeNull();
  });

  test("vários links de uma vez, no máximo 20", async () => {
    const links = Array.from({ length: 25 }, (_, i) => `https://www.amazon.com.br/dp/B0000000${String(i).padStart(2, "0")}`).join("\n");
    const j = (await (await W("/api/itens", "POST", { texto: links })).json()) as any;
    expect(j.resultados).toHaveLength(20);
    expect(j.ignorados).toBe(5);
  });

  test("texto sem link, grande demais ou de tipo errado", async () => {
    expect((await W("/api/itens", "POST", { texto: "sem link" })).status).toBe(400);
    expect((await W("/api/itens", "POST", { texto: 5 })).status).toBe(400);
    expect((await W("/api/itens", "POST", { texto: "x".repeat(4001) })).status).toBe(400);
    expect((await W("/api/itens", "POST", { texto: "x".repeat(9000) })).status).toBe(413);
    expect((await W("/api/itens", "POST", "{nao json")).status).toBe(400);
    expect((await W("/api/itens", "POST", "[1]")).status).toBe(400);
  });

  test("alvo: define, aceita formato brasileiro, recusa lixo e limpa", async () => {
    let r = await W(`/api/itens/${ASIN}/alvo`, "PUT", { linha: "amazon", valor: "1.299,90" });
    expect(r.status).toBe(200);
    expect(store.getAlvo(1, "amazon")).toBe(1299.9);
    expect(((await r.json()) as any).dentroDoAlvo).toBe(true);
    for (const valor of [-1, 0, "abc", 1e9, true, {}]) expect((await W(`/api/itens/${ASIN}/alvo`, "PUT", { linha: "amazon", valor })).status).toBe(400);
    expect((await W(`/api/itens/${ASIN}/alvo`, "PUT", { linha: "outra", valor: 5 })).status).toBe(400);
    expect(store.getAlvo(1, "amazon")).toBe(1299.9);
    r = await W(`/api/itens/${ASIN}/alvo`, "PUT", { linha: "amazon", valor: null });
    expect(r.status).toBe(200);
    expect(store.getAlvo(1, "amazon")).toBeNull();
  });

  test("alvo em linha desligada dá 409", async () => {
    store.setLinhaOn(1, "terceiros", false);
    expect((await W(`/api/itens/${ASIN}/alvo`, "PUT", { linha: "terceiros", valor: 5 })).status).toBe(409);
  });

  test("pausa e retoma; valor precisa ser booleano", async () => {
    expect((await W(`/api/itens/${ASIN}/pausa`, "PUT", { pausado: true })).status).toBe(200);
    expect(store.getById(1)!.pausado).toBe(true);
    expect((await W(`/api/itens/${ASIN}/pausa`, "PUT", { pausado: false })).status).toBe(200);
    expect(store.getById(1)!.pausado).toBe(false);
    expect((await W(`/api/itens/${ASIN}/pausa`, "PUT", { pausado: "sim" })).status).toBe(400);
  });

  test("silencia por 24 h e reativa", async () => {
    let j = (await (await W(`/api/itens/${ASIN}/silencio`, "PUT", { silenciado: true })).json()) as any;
    expect(j.silenciadoAte).toBe(new Date(net.clock.t + 24 * 3_600_000).toISOString());
    j = (await (await W(`/api/itens/${ASIN}/silencio`, "PUT", { silenciado: false })).json()) as any;
    expect(j.silenciadoAte).toBeNull();
  });

  test("liga linha (lendo na hora) e desliga; amazon não é aceita", async () => {
    store.setLinhaOn(1, "terceiros", false);
    net.calls.length = 0;
    const j = (await (await W(`/api/itens/${ASIN}/linhas`, "PUT", { linha: "terceiros", ligada: true })).json()) as any;
    expect(store.getById(1)!.terceirosOn).toBe(true);
    expect(j.leitura).toBe("ok");
    expect(net.calls.length).toBeGreaterThan(0);
    await W(`/api/itens/${ASIN}/linhas`, "PUT", { linha: "terceiros", ligada: false });
    expect(store.getById(1)!.terceirosOn).toBe(false);
    expect((await W(`/api/itens/${ASIN}/linhas`, "PUT", { linha: "amazon", ligada: false })).status).toBe(400);
  });

  test("remove o item e apaga o histórico", async () => {
    expect((await W(`/api/itens/${ASIN}`, "DELETE")).status).toBe(200);
    expect(store.list()).toHaveLength(0);
    expect((await W(`/api/itens/${ASIN}`, "DELETE")).status).toBe(404);
  });

  test("consultar agora: lê e grava, segura repetições por 5 min e libera depois", async () => {
    const antes = net.calls.length;
    const r = await W(`/api/itens/${ASIN}/consultar`, "POST");
    expect(r.status).toBe(200);
    const j = (await r.json()) as any;
    expect(j.consulta).toBe("ok");
    expect(net.calls.length).toBeGreaterThan(antes);
    expect(j.consultaLiberadaEm).toBeTruthy();
    const n = net.calls.length;
    const de_novo = await W(`/api/itens/${ASIN}/consultar`, "POST");
    expect(de_novo.status).toBe(429);
    expect(net.calls.length).toBe(n);
    net.clock.t += 5 * 60_000 + 1;
    expect((await W(`/api/itens/${ASIN}/consultar`, "POST")).status).toBe(200);
  });

  test("consultar agora: falha de leitura é informada e também entra na espera", async () => {
    net.status = 503;
    const j = (await (await W(`/api/itens/${ASIN}/consultar`, "POST")).json()) as any;
    expect(j.consulta).toBe("falhou");
    expect(j.detalhe).toBeTruthy();
    expect((await W(`/api/itens/${ASIN}/consultar`, "POST")).status).toBe(429);
    expect((await W("/api/itens/B000000000/consultar", "POST")).status).toBe(404);
  });

  test("consultar agora: exige a proteção de origem e não existe em somenteLeitura", async () => {
    expect((await W(`/api/itens/${ASIN}/consultar`, "POST", undefined, { origin: "http://evil.test" })).status).toBe(403);
    handle = panelHandler({ store, now: () => NOW, intervalMin: 30, collect: async () => ({ ok: true }) as any, resolve: async () => ({ ok: true, asin: ASIN }), somenteLeitura: true });
    expect((await W(`/api/itens/${ASIN}/consultar`, "POST")).status).toBe(405);
  });

  test("grupos: cria, coloca itens, compara e apaga sem perder os itens", async () => {
    const outro = store.addProduct("B000000001", "Ketchup 2", "2026-10-02T00:00:00.000Z");
    store.saveSnapshot(outro.id, "2026-10-23T14:30:00.000Z", [], { amazon: { linha: "amazon", preco: 7, vendedor: "Amazon" } });
    const c = (await (await W("/api/grupos", "POST", { nome: "  Ketchup   Heinz " })).json()) as any;
    expect(c.nome).toBe("Ketchup Heinz");
    expect((await W("/api/grupos", "POST", { nome: "ketchup heinz" })).status).toBe(409);
    expect((await W("/api/grupos", "POST", { nome: "  " })).status).toBe(400);
    expect((await W("/api/grupos", "POST", { nome: "x".repeat(61) })).status).toBe(400);
    for (const a of [ASIN, "B000000001"]) expect((await W(`/api/itens/${a}/grupo`, "PUT", { grupoId: c.id })).status).toBe(200);
    expect((await W(`/api/itens/${ASIN}/grupo`, "PUT", { grupoId: 999 })).status).toBe(400);
    expect((await W(`/api/itens/${ASIN}/grupo`, "PUT", { grupoId: "1" })).status).toBe(400);
    const lista = (await (await get("/api/itens")).json()) as any;
    expect(lista.grupos).toEqual([{ id: c.id, nome: "Ketchup Heinz" }]);
    expect(lista.itens.map((i: any) => i.grupoId)).toEqual([c.id, c.id]);
    const g = (await (await get(`/api/grupos/${c.id}?dias=14`)).json()) as any;
    expect(g.itens.map((i: any) => i.asin)).toEqual([ASIN, "B000000001"]);
    expect(g.menorAsin).toBe("B000000001");
    expect(g.menorPreco).toBe(7);
    expect(g.itens[1].serie.length).toBe(1);
    expect((await get(`/api/grupos/${c.id}?dias=5`)).status).toBe(400);
    expect((await get("/api/grupos/999")).status).toBe(404);
    expect((await W(`/api/grupos/${c.id}`, "PUT", { nome: "Heinz" })).status).toBe(200);
    expect((await W(`/api/itens/${ASIN}/grupo`, "PUT", { grupoId: null })).status).toBe(200);
    expect(store.getByAsin(ASIN)!.grupoId).toBeNull();
    expect((await W(`/api/grupos/${c.id}`, "DELETE")).status).toBe(200);
    expect(store.getByAsin("B000000001")).not.toBeNull();
    expect(store.getByAsin("B000000001")!.grupoId).toBeNull();
    expect(store.listGrupos()).toEqual([]);
  });

  test("grupos: proteção de origem e somente leitura; apagar o item não mexe no grupo", async () => {
    expect((await W("/api/grupos", "POST", { nome: "A" }, { origin: "http://evil.test" })).status).toBe(403);
    const c = (await (await W("/api/grupos", "POST", { nome: "A" })).json()) as any;
    await W(`/api/itens/${ASIN}/grupo`, "PUT", { grupoId: c.id });
    await W(`/api/itens/${ASIN}`, "DELETE");
    expect(store.listGrupos().length).toBe(1);
    handle = panelHandler({ store, now: () => NOW, intervalMin: 30, collect: async () => ({ ok: true }) as any, resolve: async () => ({ ok: true, asin: ASIN }), somenteLeitura: true });
    expect((await W("/api/grupos", "POST", { nome: "B" })).status).toBe(405);
    expect((await get(`/api/grupos/${c.id}`)).status).toBe(200);
  });

  test("CSRF: exige mesma origem, JSON e cabeçalho do painel", async () => {
    const body = { pausado: true };
    const path = `/api/itens/${ASIN}/pausa`;
    expect((await W(path, "PUT", body, { origin: "http://evil.test" })).status).toBe(403);
    expect((await W(path, "PUT", body, { origin: "null" })).status).toBe(403);
    expect((await W(path, "PUT", body, { "sec-fetch-site": "cross-site" })).status).toBe(403);
    expect((await W(path, "PUT", body, { "x-painel": "0" })).status).toBe(403);
    expect((await W(path, "PUT", body, { "content-type": "text/plain" })).status).toBe(415);
    const semOrigin = await handle(new Request(`${ORIGIN}${path}`, { method: "PUT", headers: { "content-type": "application/json", "x-painel": "1" }, body: "{}" }));
    expect(semOrigin.status).toBe(403);
    expect(store.getById(1)!.pausado).toBe(false);
  });

  test("selo não dá acesso às rotas de escrita e continua só leitura", async () => {
    const h = { "x-selo-token": TOKEN };
    const semOrigin = (path: string, method: string) => handle(new Request(`${ORIGIN}${path}`, { method, headers: { ...h, "content-type": "application/json", "x-painel": "1" }, body: "{}" }));
    expect((await semOrigin(`/api/itens/${ASIN}`, "DELETE")).status).toBe(403);
    expect((await semOrigin("/api/itens", "POST")).status).toBe(403);
    for (const m of ["POST", "PUT", "DELETE", "PATCH"]) expect((await W(`/api/selo/${ASIN}`, m, {}, h)).status).toBe(405);
    expect(store.list()).toHaveLength(1);
  });

  test("rotas e métodos desconhecidos", async () => {
    expect((await W("/api/saude", "POST", {})).status).toBe(405);
    expect((await W(`/api/itens/${ASIN}/alvo`, "POST", {})).status).toBe(405);
    expect((await W(`/api/itens/${ASIN}/nada`, "PUT", {})).status).toBe(405);
    expect((await W("/api/itens/B000000000/pausa", "PUT", { pausado: true })).status).toBe(404);
  });

  test("respostas de escrita têm cabeçalhos de segurança", async () => {
    const r = await W(`/api/itens/${ASIN}/pausa`, "PUT", { pausado: true });
    expect(r.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(r.headers.get("cache-control")).toBe("no-store");
  });
});

describe("config: PANEL_READONLY", () => {
  const base = { TELEGRAM_BOT_TOKEN: "t", TELEGRAM_CHAT_ID: "1" };
  test("escrita ligada por padrão", () => expect(loadConfig(base).panelReadonly).toBe(false));
  test("PANEL_READONLY=1 desliga", () => expect(loadConfig({ ...base, PANEL_READONLY: "1" }).panelReadonly).toBe(true));
});

describe("importar do Keepa", () => {
  const post = (body: unknown) =>
    handle(new Request("http://x/api/importar", { method: "POST", headers: { origin: "http://x", "x-painel": "1", "content-type": "application/json" }, body: JSON.stringify(body) }));
  beforeEach(() => {
    handle = panelHandler({ store, now: () => NOW, intervalMin: 30, collect: async () => ({ ok: false, kind: "http_error", falhasProduto: 1, avisarProduto: false }), resolve: async () => ({ ok: false, motivo: "sem_link" }) });
  });
  test("CSV do Keepa: BOM, aspas, ASIN numérico, duplicado e existente", async () => {
    const texto = '﻿"ASIN"\n"B0BVZS2T4Z"\n"6559283135"\n"B0BVZS2T4Z"\n"B097BYXGXN"\n"curto"\n';
    const r = await post({ texto });
    expect(await r.json()).toEqual({ importados: 2, duplicados: 2, invalidos: 1, outrosPaises: 0, acimaDoLimite: 0 });
    expect(store.getByAsin("6559283135")?.titulo).toBeNull();
  });
  test("links: .com.br entra, outros países são ignorados", async () => {
    const r = await post({ texto: "https://www.amazon.com.br/dp/B07GW4CM5F https://www.amazon.com/dp/B0193H5B90" });
    expect(await r.json()).toMatchObject({ importados: 1, outrosPaises: 1 });
  });
  test("limite de 200 itens", async () => {
    const texto = Array.from({ length: 205 }, (_, i) => `X${String(i).padStart(9, "0")}`).join("\n");
    expect(await (await post({ texto })).json()).toMatchObject({ importados: 200, acimaDoLimite: 5 });
  });
  test("vazio e somente leitura", async () => {
    expect((await post({ texto: '"ASIN"' })).status).toBe(400);
    handle = panelHandler({ store, now: () => NOW, intervalMin: 30 });
    expect((await post({ texto: "B07GW4CM5F" })).status).toBe(405);
  });
});

describe("cards com foto", () => {
  test("lista traz a foto salva e a CSP libera só os hosts de imagem da Amazon", async () => {
    const p = store.getByAsin("B097BYXGXN")!;
    store.setImagem(p.id, "https://m.media-amazon.com/images/I/aaa.jpg");
    const r = await get("/api/itens");
    expect(((await r.json()) as any).itens[0].imagem).toBe("https://m.media-amazon.com/images/I/aaa.jpg");
    expect((await get("/")).headers.get("content-security-policy")).toContain("img-src https://m.media-amazon.com https://images-na.ssl-images-amazon.com;");
  });
  test("imagem fora dos hosts permitidos não sai na API", async () => {
    store.setImagem(store.getByAsin("B097BYXGXN")!.id, "https://evil.example/x.jpg");
    expect(((await (await get("/api/itens")).json()) as any).itens[0].imagem).toBeNull();
  });
});

test("card cai para o ícone quando a foto não carrega", async () => {
  const html = await (await get("/")).text();
  expect(html).toContain("onerror=");
  const js = html.split("<script>")[1]!.split("</script>")[0]!;
  expect(() => new Function(js)).not.toThrow();
});

describe("última coleta no painel", () => {
  test("item novo vem com ultimaColeta null; depois de uma falha, com o motivo", () => {
    const store = new Store(":memory:");
    const p = store.addProduct("B00C061HZY", null, "2026-10-23T00:00:00.000Z");
    const now = new Date("2026-10-23T12:00:00.000Z");
    expect(panelItems(store, now)[0]!.ultimaColeta).toBeNull();
    store.setUltimaColeta(p.id, { em: now.toISOString(), ok: false, motivo: "captcha" });
    expect(panelItems(store, now)[0]!.ultimaColeta).toMatchObject({ ok: false, motivo: "captcha" });
  });
});

test("lista com rolagem própria e detalhe fixo no desktop, empilhado no celular", async () => {
  const html = await (await get("/")).text();
  expect(html).toMatch(/@media\(min-width:901px\)\{[^@]*main\{height:100vh/);
  expect(html).toMatch(/\.det\{[^}]*overflow-y:auto/);
  expect(html).toMatch(/#lst\{flex:1;min-height:0;overflow-y:auto/);
  expect(html.indexOf('id="topo"')).toBeLessThan(html.indexOf('id="esq"'));
  for (const n of ["add", "grp", "fil"]) expect(html).toContain(`data-pn="${n}"`);
  const mobile = html.split("@media(max-width:900px)")[1]!;
  expect(mobile).not.toContain("sticky");
});

test("topo do painel mostra o número do último PR e não tem título", async () => {
  const { ULTIMO_PR } = await import("../src/versao.ts");
  expect(Number.isInteger(ULTIMO_PR) && ULTIMO_PR > 0).toBe(true);
  const html = await (await get("/")).text();
  expect(html).toContain(`PR #${ULTIMO_PR}`);
  expect(html).not.toContain("<h1>");
});

test("arrastar rola a lista da esquerda (e a página) perto das bordas", async () => {
  const html = await (await get("/")).text();
  const js = html.split("<script>")[1]!.split("</script>")[0]!;
  expect(() => new Function(js)).not.toThrow();
  expect(js).toContain("function autoRolar");
  expect(js).toContain("document.addEventListener('dragover'");
  expect(js).toMatch(/for\(const el of \[\$\('#lst'\)\]\)[^]*el\.scrollTop\+=v/);
  expect(js).toContain("scrollBy(0,v)");
  expect(js).toContain("autoRolar(true)");
  expect(js).toContain("autoRolar(false)");
});

test("grupos da lista começam fechados e a busca olha dentro e fora deles", async () => {
  const html = await (await get("/")).text();
  const js = html.split("<script>")[1]!.split("</script>")[0]!;
  expect(() => new Function(js)).not.toThrow();
  expect(js).toContain("abertos:new Set()");
  expect(js).toContain("aberto=S.abertos.has(gid)");
  expect(js).toMatch(/buscando&&aqui\.length>0/);
  expect(js).toContain("sem(i.grupoId!=null?gnome(i.grupoId):'')");
});
