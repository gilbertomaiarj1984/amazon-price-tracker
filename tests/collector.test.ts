import { beforeEach, describe, expect, test } from "bun:test";
import { collectOne, needsPanel } from "../src/collector.ts";
import { Store } from "../src/db.ts";
import { fakeNet, fx, tick } from "./helpers.ts";

let store: Store;
beforeEach(() => {
  store = new Store(":memory:");
});
const add = () => store.addProduct("B097BYXGXN", null, "2026-10-23T00:00:00.000Z");

describe("collectOne", () => {
  test("Amazon vende e só ela está ligada: 1 requisição, grava a linha e o título", async () => {
    const net = fakeNet();
    const p = add();
    const r = await collectOne(store, p, net.deps);
    expect(r.ok).toBe(true);
    expect(net.calls).toEqual(["produto"]);
    expect(store.lastPoint(p.id, "amazon")?.preco).toBe(20.1);
    expect(store.getById(p.id)?.titulo).toBe("Heinz Ketchup Tradicional 1,033KG");
  });

  test("terceiros ligado: busca o painel e usa a menor oferta nova sem a suspeita", async () => {
    const net = fakeNet();
    const p = add();
    store.setLinhaOn(p.id, "terceiros", true);
    const r = await collectOne(store, store.getById(p.id)!, net.deps);
    expect(net.calls).toEqual(["produto", "painel"]);
    expect(r.ok && r.painel).toBe(true);
    expect(store.lastPoint(p.id, "terceiros")).toMatchObject({ preco: 379, vendedor: "TechBras Store" });
    expect(r.ok && r.descartadas).toBe(1);
    expect((store.db.query("SELECT COUNT(*) AS n FROM offers WHERE descartada = 1").get() as { n: number }).n).toBe(1);
  });

  test("buy box de terceiro com outras opções: busca o painel para ver se a Amazon vende", () => {
    const page = { titulo: "x", buyBox: 100, buyBoxVendedor: "Loja", vendidoPorAmazon: false, outrasAPartirDe: 90, outrasOpcoes: 3, disponivel: true };
    expect(needsPanel(add(), page)).toBe(true);
    expect(needsPanel(add(), { ...page, outrasOpcoes: null })).toBe(false);
    expect(needsPanel(add(), { ...page, vendidoPorAmazon: true })).toBe(false);
    // Amazon Global na caixa de compra: a Amazon.com.br pode estar mais barata no painel, mesmo sem contagem de opções.
    const global = { ...page, buyBoxVendedor: "Amazon Global", vendidoPorAmazon: true, outrasOpcoes: null };
    expect(needsPanel(add(), global)).toBe(true);
  });

  test("captcha: não grava preço e conta a falha", async () => {
    const net = fakeNet({ product: fx("captcha.html") });
    const p = add();
    const r = await collectOne(store, p, net.deps);
    expect(r).toMatchObject({ ok: false, kind: "captcha", falhasProduto: 1, avisarProduto: false });
    expect(store.lastPoint(p.id, "amazon")).toBeNull();
    expect((store.db.query("SELECT COUNT(*) AS n FROM offers").get() as { n: number }).n).toBe(0);
  });

  test("avisa do produto na 6ª falha seguida, e sucesso zera o contador", async () => {
    const bad = fakeNet({ status: 503 });
    const p = add();
    const out = [];
    for (let i = 0; i < 6; i++) out.push(await collectOne(store, p, bad.deps));
    expect(out.map((o) => !o.ok && o.avisarProduto)).toEqual([false, false, false, false, false, true]);
    await collectOne(store, p, fakeNet().deps);
    expect(store.getById(p.id)?.falhasSeguidas).toBe(0);
  });

  test("painel bloqueado: falha a coleta inteira em vez de gravar meia coleta", async () => {
    const net = fakeNet({ panelStatus: 503 });
    const p = add();
    store.setLinhaOn(p.id, "terceiros", true);
    const r = await collectOne(store, store.getById(p.id)!, net.deps);
    expect(r).toMatchObject({ ok: false, kind: "http_503" });
    expect(store.lastPoint(p.id, "amazon")).toBeNull();
  });
});

describe("alertas na coleta", () => {
  test("alvo atingido uma vez só enquanto o preço não cai mais", async () => {
    const net = fakeNet();
    const p = add();
    store.setAlvo(p.id, "amazon", 25);
    const a = await collectOne(store, p, net.deps);
    expect(a.ok && a.alertas.map((x) => x.evento.tipo)).toEqual(["alvo"]);
    tick(net);
    const b = await collectOne(store, p, net.deps);
    expect(b.ok && b.alertas).toEqual([]);
  });

  test("Amazon some e volta: linha sem dado e aviso de volta", async () => {
    const net = fakeNet();
    const p = add();
    await collectOne(store, p, net.deps);
    tick(net);
    net.product = fx("product-unavailable.html");
    const gone = await collectOne(store, p, net.deps);
    expect(gone.ok && gone.points.amazon).toBeUndefined();
    expect(store.getAlertState(p.id, "amazon").disponivel).toBe(false);
    expect(store.lineStats(p.id, "amazon").coletas).toBe(1);
    tick(net);
    net.product = fx("product-real-shape.html");
    const back = await collectOne(store, p, net.deps);
    expect(back.ok && back.alertas.map((x) => x.evento.tipo)).toEqual(["voltou"]);
  });

  test("novo mínimo", async () => {
    const net = fakeNet();
    const p = add();
    await collectOne(store, p, net.deps);
    tick(net);
    net.product = fx("product-real-shape.html").replace("R$ 20,10 com 15 por cento de desconto", "R$ 18,00");
    const r = await collectOne(store, p, net.deps);
    expect(r.ok && r.alertas[0]?.evento).toMatchObject({ tipo: "novo_minimo", preco: 18, minimoAnterior: 20.1 });
  });
});

describe("última leitura do item (distingue aguardando, sem oferta e erro)", () => {
  test("sem nenhuma leitura: nada registrado", () => {
    expect(store.getUltimaColeta(add().id)).toBeNull();
  });

  test("página sem preço de destaque: leitura ok registrada, sem linha Amazon", async () => {
    const p = add();
    const r = await collectOne(store, p, fakeNet({ product: fx("product-unavailable.html") }).deps);
    expect(r.ok).toBe(true);
    expect(store.lastPoint(p.id, "amazon")).toBeNull();
    expect(store.getUltimaColeta(p.id)).toMatchObject({ ok: true, buyBox: null });
  });

  test("captcha e 503: registra o motivo, sem inventar 'sem oferta'", async () => {
    const p = add();
    await collectOne(store, p, fakeNet({ product: fx("captcha.html") }).deps);
    expect(store.getUltimaColeta(p.id)).toMatchObject({ ok: false, motivo: "captcha" });
    await collectOne(store, p, fakeNet({ status: 503 }).deps);
    expect(store.getUltimaColeta(p.id)).toMatchObject({ ok: false, motivo: "http_503" });
    await collectOne(store, p, fakeNet().deps);
    expect(store.getUltimaColeta(p.id)).toMatchObject({ ok: true, buyBox: 20.1 });
  });

  test("erro de rede (timeout): registra erro_rede e repassa a exceção", async () => {
    const p = add();
    const net = fakeNet();
    net.deps.fetchHtml = async () => {
      throw new Error("timeout");
    };
    await expect(collectOne(store, p, net.deps)).rejects.toThrow("timeout");
    expect(store.getUltimaColeta(p.id)).toMatchObject({ ok: false, motivo: "erro_rede" });
  });
});
