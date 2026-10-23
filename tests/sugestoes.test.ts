import { beforeEach, describe, expect, test } from "bun:test";
import { Actions } from "../src/actions.ts";
import { parseVariantes } from "../src/amazon/parse.ts";
import { collectOne } from "../src/collector.ts";
import { Store } from "../src/db.ts";
import { brasilia, certezaDe, elegiveis, runVarredura, varreduraDevida } from "../src/sugestoes.ts";
import type { SugestoesDeps } from "../src/sugestoes.ts";
import { fakeNet, fx } from "./helpers.ts";

const T0 = "2026-10-23T00:00:00.000Z";
let store: Store;
beforeEach(() => {
  store = new Store(":memory:");
});

/** Origem sem oferta da Amazon: última leitura ok e linha Amazon indisponível. */
function origem(asin = "B00C061HZY") {
  const p = store.addProduct(asin, "Random Access Memories", T0);
  store.setUltimaColeta(p.id, { em: T0, ok: true });
  store.setAlertState(p.id, "amazon", { ultimoAlertado: null, disponivel: false });
  return p;
}

const pagesBy = (m: Record<string, string>, calls: string[] = []): SugestoesDeps["fetchHtml"] => async (url) => {
  const asin = /\/dp\/([A-Z0-9]{10})/.exec(url)![1]!;
  calls.push(asin);
  return { status: 200, html: m[asin] ?? fx("product-unavailable.html"), ms: 1 };
};

const deps = (fetchHtml: SugestoesDeps["fetchHtml"], over: Partial<SugestoesDeps> = {}): SugestoesDeps => ({
  store,
  fetchHtml,
  now: () => new Date(T0),
  sleep: async () => undefined,
  pauseMs: () => 0,
  log: () => undefined,
  maxItens: 10,
  maxCandidatos: 4,
  ...over,
});

describe("parseVariantes", () => {
  test("lê formatos e variações com rótulo, preço e a selecionada", () => {
    const v = parseVariantes(fx("product-variantes.html"));
    expect(v.map((x) => x.asin)).toEqual(["B00C061HZY", "B00C061AAA", "B00C061BBB", "B00C061CCC"]);
    expect(v[0]).toMatchObject({ rotulo: "Vinil", dimensao: "formato", selecionada: true, preco: 162.96 });
    expect(v[1]).toMatchObject({ rotulo: "CD", selecionada: false, preco: 59.9 });
    expect(v[3]).toMatchObject({ rotulo: "Edição Deluxe", dimensao: "variacao" });
  });

  test("página sem seletor não tem variações", () => {
    expect(parseVariantes(fx("product-amazon.html"))).toEqual([]);
  });
});

describe("certezaDe", () => {
  const base = { asin: "B000000000", preco: null, selecionada: false } as const;
  test("mesmo formato é alta, outra variação é média, outro formato é baixa", () => {
    expect(certezaDe({ ...base, rotulo: "Vinil", dimensao: "formato" }, "vinil")).toBe("alta");
    expect(certezaDe({ ...base, rotulo: "Edição Deluxe", dimensao: "variacao" }, "Vinil")).toBe("media");
    expect(certezaDe({ ...base, rotulo: "CD", dimensao: "formato" }, "Vinil")).toBe("baixa");
  });
});

describe("runVarredura", () => {
  const AMAZON = fx("product-amazon.html");

  test("sugere só variações que a Amazon vende, sem cadastrar nada", async () => {
    const o = origem();
    const calls: string[] = [];
    const r = await runVarredura(deps(pagesBy({ B00C061HZY: fx("product-variantes.html"), B00C061AAA: AMAZON, B00C061BBB: fx("product-third-party.html") }, calls)));
    expect(calls).toEqual(["B00C061HZY", "B00C061AAA", "B00C061BBB", "B00C061CCC"]);
    expect(r).toMatchObject({ itens: 1, requisicoes: 4, novas: 1, parou: null });
    const [s] = store.listSugestoes();
    expect(s).toMatchObject({ origemId: o.id, asin: "B00C061AAA", formato: "CD", formatoOrigem: "Vinil", certeza: "baixa", vendedor: "Amazon" });
    expect(store.list()).toHaveLength(1);
  });

  test("respeita o orçamento: máximo de itens e de candidatos", async () => {
    origem("B00C061HZY");
    origem("B00C061ZZZ");
    const calls: string[] = [];
    await runVarredura(deps(pagesBy({ B00C061HZY: fx("product-variantes.html") }, calls), { maxItens: 1, maxCandidatos: 1 }));
    expect(calls).toEqual(["B00C061HZY", "B00C061AAA"]);
    // No dia seguinte o item que ficou de fora vai primeiro.
    expect(elegiveis(store)[0]!.asin).toBe("B00C061ZZZ");
  });

  test("para no primeiro captcha", async () => {
    origem();
    origem("B00C061ZZZ");
    const calls: string[] = [];
    const f = pagesBy({ B00C061HZY: fx("product-variantes.html"), B00C061AAA: fx("captcha.html") }, calls);
    const r = await runVarredura(deps(f));
    expect(r.parou).toBe("captcha");
    expect(calls).toEqual(["B00C061HZY", "B00C061AAA"]);
  });

  test("ignora quem já é rastreado e quem foi recusado; não repete sugestão", async () => {
    origem();
    store.addProduct("B00C061AAA", null, T0);
    const f = pagesBy({ B00C061HZY: fx("product-variantes.html"), B00C061CCC: AMAZON, B00C061BBB: AMAZON });
    await runVarredura(deps(f));
    const ids = store.listSugestoes().map((s) => s.asin);
    expect(ids).toEqual(["B00C061BBB", "B00C061CCC"]);
    const act = new Actions({ store, now: () => new Date(T0), collect: async () => ({ ok: false, kind: "http_error", falhasProduto: 1, avisarProduto: false }), resolve: async () => ({ ok: false, motivo: "sem_link" }) });
    expect(act.recusarSugestao(store.listSugestoes()[0]!.id)).toBe(true);
    expect(store.asinRecusado("B00C061BBB")).toBe(true);
    const r2 = await runVarredura(deps(f));
    expect(r2.novas).toBe(0);
  });

  test("não varre item em que a Amazon vende, item pausado ou sem leitura", () => {
    const a = origem("B00C061HZY");
    store.setAlertState(a.id, "amazon", { ultimoAlertado: null, disponivel: true });
    const b = origem("B00C061AAA");
    store.setPausado(b.id, true);
    store.addProduct("B00C061BBB", null, T0);
    expect(elegiveis(store)).toEqual([]);
  });

  test("sugestão vira obsoleta quando a Amazon volta a vender o original", async () => {
    const o = origem();
    await runVarredura(deps(pagesBy({ B00C061HZY: fx("product-variantes.html"), B00C061AAA: AMAZON })));
    expect(store.listSugestoes()).toHaveLength(1);
    store.setAlertState(o.id, "amazon", { ultimoAlertado: null, disponivel: true });
    await runVarredura(deps(pagesBy({})));
    expect(store.listSugestoes()).toHaveLength(0);
    expect(store.listSugestoes("obsoleta")).toHaveLength(1);
  });
});

describe("aceitar sugestão", () => {
  test("cadastra, agrupa com o original, herda o alvo e lê o item", async () => {
    const o = origem();
    store.setAlvo(o.id, 150);
    await runVarredura(deps(pagesBy({ B00C061HZY: fx("product-variantes.html"), B00C061AAA: fx("product-amazon.html") })));
    const net = fakeNet();
    const act = new Actions({ store, now: () => new Date(T0), collect: (p) => collectOne(store, p, net.deps), resolve: async () => ({ ok: false, motivo: "sem_link" }) });
    const s = store.listSugestoes()[0]!;
    const r = await act.aceitarSugestao(s.id);
    expect(r).toMatchObject({ ok: true, alvoHerdado: 150, leitura: true });
    const novo = store.getByAsin("B00C061AAA")!;
    expect(novo.grupoId).not.toBeNull();
    expect(novo.grupoId).toBe(store.getById(o.id)!.grupoId);
    expect(store.getAlvo(novo.id)).toBe(150);
    expect(store.getSugestao(s.id)!.status).toBe("aceita");
    expect((await act.aceitarSugestao(s.id)).ok).toBe(false);
  });
});

describe("agenda diária", () => {
  test("roda uma vez por dia, depois da hora configurada (Brasília)", () => {
    const manha = new Date("2026-10-23T05:00:00Z"); // 02h em Brasília
    const tarde = new Date("2026-10-23T15:00:00Z"); // 12h
    expect(brasilia(tarde)).toEqual({ dia: "2026-10-23", hora: 12 });
    expect(varreduraDevida(store, manha, 4)).toBe(false);
    expect(varreduraDevida(store, tarde, 4)).toBe(true);
    store.setMeta("sugestoes:dia", "2026-10-23");
    expect(varreduraDevida(store, tarde, 4)).toBe(false);
    expect(varreduraDevida(store, new Date("2026-10-24T15:00:00Z"), 4)).toBe(true);
  });
});
