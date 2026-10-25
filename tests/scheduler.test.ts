import { beforeEach, describe, expect, test } from "bun:test";
import { alertKeyboard } from "../src/bot.ts";
import { collectOne } from "../src/collector.ts";
import { Store } from "../src/db.ts";
import { loop, runCycle } from "../src/scheduler.ts";
import type { CycleDeps } from "../src/scheduler.ts";
import { fakeNet, fx, tick } from "./helpers.ts";

let store: Store;
let net: ReturnType<typeof fakeNet>;
let sent: string[];
let sleeps: number[];
let logs: string[];
let failSends: number;

const deps = (): CycleDeps => ({
  store,
  collect: (p) => collectOne(store, p, net.deps),
  send: async (html) => {
    if (failSends > 0) {
      failSends--;
      throw new Error("telegram fora");
    }
    sent.push(html);
  },
  now: () => new Date(net.clock.t),
  sleep: async (ms) => void sleeps.push(ms),
  pauseMs: () => 3000,
  log: (m) => logs.push(m),
});

beforeEach(() => {
  store = new Store(":memory:");
  net = fakeNet();
  sent = [];
  sleeps = [];
  logs = [];
  failSends = 0;
  store.addProduct("B097BYXGXN", "Ketchup", "2026-10-23T00:00:00.000Z");
});

describe("runCycle", () => {
  test("itens com estrela são coletados primeiro", async () => {
    store.addProduct("B00C061HZY", "Disco", "2026-10-23T00:00:00.000Z");
    store.setEstrela(2, true);
    const ordem: string[] = [];
    await runCycle({ ...deps(), collect: async (p) => (ordem.push(p.asin), collectOne(store, p, net.deps)) });
    expect(ordem).toEqual(["B00C061HZY", "B097BYXGXN"]);
  });

  test("coleta, grava e avisa o alvo uma vez", async () => {
    store.setAlvo(1, 25);
    expect(await runCycle(deps())).toMatchObject({ tentados: 1, ok: 1, falhas: 0, alertas: 1 });
    expect(sent[0]).toContain("ALVO ATINGIDO · AMAZON");
    tick(net);
    expect((await runCycle(deps())).alertas).toBe(0);
    expect(sent).toHaveLength(1);
  });

  test("produtos pausados não são coletados; pausa entre produtos", async () => {
    store.addProduct("B000000002", "B", "2026-10-23T00:00:00.000Z");
    store.addProduct("B000000003", "C", "2026-10-23T00:00:00.000Z");
    store.setPausado(2, true);
    const r = await runCycle(deps());
    expect(r.tentados).toBe(2);
    expect(sleeps).toEqual([3000]);
  });

  test("silenciado: coleta mas não avisa", async () => {
    store.setAlvo(1, 25);
    store.setMeta("mute:1", new Date(net.clock.t + 3_600_000).toISOString());
    const r = await runCycle(deps());
    expect(r.ok).toBe(1);
    expect(sent).toHaveLength(0);
  });

  test("alerta é reenviado se o Telegram falha, e conta só quando chega", async () => {
    store.setAlvo(1, 25);
    failSends = 2;
    const r = await runCycle(deps());
    expect(r.alertas).toBe(1);
    expect(sent).toHaveLength(1);
    expect(sleeps).toEqual([1500, 5000]);
    expect(logs.filter((l) => l.includes("telegram fora"))).toHaveLength(2);
  });

  test("Telegram fora de vez: não derruba a rodada", async () => {
    store.setAlvo(1, 25);
    failSends = 99;
    const r = await runCycle(deps());
    expect(r).toMatchObject({ ok: 1, alertas: 0 });
  });

  test("erro de rede conta como falha da coleta", async () => {
    const d = deps();
    d.collect = async () => {
      throw new Error("ECONNRESET");
    };
    const r = await runCycle(d);
    expect(r).toMatchObject({ tentados: 1, ok: 0, falhas: 1 });
    expect(store.getById(1)?.falhasSeguidas).toBe(1);
  });
});

describe("ALERTAS_APENAS_ALVO", () => {
  const comEvento = (evento: object) => async (p: Parameters<CycleDeps["collect"]>[0]) => {
    const r = await collectOne(store, p, net.deps);
    return r.ok ? { ...r, alertas: [{ product: p, evento: evento as never, vendedor: null }] } : r;
  };
  const minimo = (preco: number) => ({ tipo: "novo_minimo", linha: "amazon", preco, minimoAnterior: 90 });

  test("falhas de coleta, produto isolado e normalização só vão para o log", async () => {
    net.product = fx("captcha.html");
    for (let i = 0; i < 7; i++) {
      await runCycle({ ...deps(), apenasAlvo: true });
      tick(net);
    }
    net.product = fx("product-real-shape.html");
    await runCycle({ ...deps(), apenasAlvo: true });
    expect(sent).toHaveLength(0);
  });

  test("novo mínimo sem alvo ou fora do alvo não avisa; dentro do alvo avisa", async () => {
    const d = { ...deps(), apenasAlvo: true };
    await runCycle({ ...d, collect: comEvento(minimo(50)) });
    expect(sent).toHaveLength(0);
    store.setAlvo(1, 40);
    tick(net);
    await runCycle({ ...d, collect: comEvento(minimo(50)) });
    expect(sent).toHaveLength(0);
    tick(net);
    await runCycle({ ...d, collect: comEvento(minimo(35)) });
    expect(sent).toHaveLength(1);
  });

  test("desligado, novo mínimo sem alvo ainda avisa", async () => {
    await runCycle({ ...deps(), collect: comEvento(minimo(50)) });
    expect(sent).toHaveLength(1);
  });
});

describe("falha geral e recuperação", () => {
  test("avisa na 3ª rodada seguida sem nenhum sucesso, e quando normaliza", async () => {
    net.product = fx("captcha.html");
    for (let i = 0; i < 2; i++) {
      await runCycle(deps());
      tick(net);
    }
    expect(sent).toHaveLength(0);
    await runCycle(deps());
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain("FALHA NA COLETA");
    expect(sent[0]).toContain("3 rodadas seguidas");
    expect(sent[0]).toContain("captcha");
    tick(net);
    await runCycle(deps());
    expect(sent).toHaveLength(1);
    net.product = fx("product-real-shape.html");
    tick(net);
    await runCycle(deps());
    expect(sent[1]).toContain("Coleta normalizada");
    expect(store.getMeta("cycle_fails")).toBeNull();
  });

  test("uma falha isolada com outros produtos ok não dispara o aviso geral", async () => {
    store.addProduct("B000000002", "B", "2026-10-23T00:00:00.000Z");
    let n = 0;
    const d = deps();
    d.collect = (p) => (n++ === 0 ? Promise.resolve({ ok: false as const, kind: "captcha" as const, falhasProduto: 1, avisarProduto: false }) : collectOne(store, p, net.deps));
    for (let i = 0; i < 4; i++) {
      n = 0;
      await runCycle(d);
    }
    expect(sent.filter((s) => s.includes("FALHA NA COLETA"))).toHaveLength(0);
  });

  test("sem produtos não conta como falha", async () => {
    store.remove(1);
    await runCycle(deps());
    expect(store.getMeta("cycle_fails")).toBeNull();
  });
});

describe("loop", () => {
  test("repete descontando o tempo da rodada, sobrevive a exceção e para no abort", async () => {
    const ac = new AbortController();
    const waits: number[] = [];
    let runs = 0;
    let t = 0;
    await loop(
      async () => {
        runs++;
        t += 1000;
        if (runs === 1) throw new Error("boom");
        if (runs === 3) ac.abort();
      },
      {
        intervalMs: 10_000,
        firstDelayMs: 500,
        jitterMs: () => 7,
        sleep: async (ms) => void waits.push(ms),
        signal: ac.signal,
        now: () => t,
        log: (m) => logs.push(m),
      },
    );
    expect(runs).toBe(3);
    expect(waits).toEqual([500, 9007, 9007]);
    expect(logs.some((l) => l.includes("boom"))).toBe(true);
  });
});

test("teclado do alerta tem link, histórico e silenciar", () => {
  const kb = alertKeyboard(store.getById(1)!).flat();
  expect(kb.map((b) => b.text)).toEqual(["Abrir na Amazon", "Ver histórico", "Silenciar 24 h"]);
  expect(kb[0]).toEqual({ text: "Abrir na Amazon", url: "https://www.amazon.com.br/dp/B097BYXGXN" });
});

describe("msToNextSlot", () => {
  test("horário fixo: próxima marca da grade, sempre maior que zero", async () => {
    const { msToNextSlot } = await import("../src/scheduler.ts");
    expect(msToNextSlot(Date.UTC(2026, 9, 23, 18, 43, 0), 30)).toBe(17 * 60_000);
    expect(msToNextSlot(Date.UTC(2026, 9, 23, 19, 0, 0), 30)).toBe(30 * 60_000);
  });
});
