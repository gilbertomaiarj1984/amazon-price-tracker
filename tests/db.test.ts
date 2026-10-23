import { beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../src/db.ts";

let s: Store;
beforeEach(() => {
  s = new Store(":memory:");
});
const T = (h: number) => `2026-10-23T${String(h).padStart(2, "0")}:00:00.000Z`;

describe("Store", () => {
  test("cadastra uma vez só por ASIN", () => {
    const a = s.addProduct("B0C8XK2M4N", "Fone", T(1));
    const b = s.addProduct("B0C8XK2M4N", "Fone", T(2));
    expect(b.id).toBe(a.id);
    expect(s.list()).toHaveLength(1);
  });
  test("numeração por posição e renumeração após remover", () => {
    const a = s.addProduct("B000000001", "A", T(1));
    s.addProduct("B000000002", "B", T(1));
    const c = s.addProduct("B000000003", "C", T(1));
    expect(s.numberOf(c.id)).toBe(3);
    s.remove(a.id);
    expect(s.numberOf(c.id)).toBe(2);
    expect(s.byNumber(1)?.asin).toBe("B000000002");
  });
  test("alvo único por item, e trocar o alvo reabre o alerta", () => {
    const p = s.addProduct("B000000001", "A", T(1));
    s.setAlvo(p.id, 199);
    s.setAlertState(p.id, "amazon", { ultimoAlertado: 190, disponivel: true });
    s.setAlvo(p.id, 150);
    expect(s.getAlvo(p.id)).toBe(150);
    expect(s.getAlertState(p.id, "amazon").ultimoAlertado).toBeNull();
    s.setAlvo(p.id, null);
    expect(s.getAlvo(p.id)).toBeNull();
  });
  test("migração: alvos por linha viram um só (Amazon, senão o menor), e roda de novo sem efeito", () => {
    const dir = mkdtempSync(join(tmpdir(), "alvo-"));
    const path = join(dir, "t.db");
    const a = new Store(path);
    const p1 = a.addProduct("B000000001", "A", T(1));
    const p2 = a.addProduct("B000000002", "B", T(1));
    const p3 = a.addProduct("B000000003", "C", T(1));
    const ins = (id: number, linha: string, v: number) => a.db.query("INSERT OR REPLACE INTO alvos (product_id, linha, preco_alvo) VALUES (?, ?, ?)").run(id, linha, v);
    a.db.exec("DELETE FROM alvos");
    ins(p1.id, "amazon", 200); ins(p1.id, "terceiros", 150); // Amazon vence
    ins(p2.id, "terceiros", 180); ins(p2.id, "usado", 120); // menor dos outros
    a.setAlertState(p2.id, "terceiros", { ultimoAlertado: 130, disponivel: true });
    a.close();
    for (let i = 0; i < 2; i++) {
      const b = new Store(path);
      expect(b.getAlvo(p1.id)).toBe(200);
      expect(b.getAlvo(p2.id)).toBe(120);
      expect(b.getAlvo(p3.id)).toBeNull();
      expect(b.getAlertState(p2.id, "terceiros").ultimoAlertado).toBeNull();
      expect((b.db.query("SELECT COUNT(*) AS n FROM alvos").get() as { n: number }).n).toBe(2);
      b.close();
    }
    rmSync(dir, { recursive: true });
  });
  test("snapshot guarda ofertas brutas e linhas; estatísticas", () => {
    const p = s.addProduct("B000000001", "A", T(1));
    const o = { vendedor: "X", condicao: "novo" as const, preco: 100, frete: 0, envio: "terceiro" as const, vendidoPorAmazon: false };
    s.saveSnapshot(p.id, T(1), [o], { amazon: { linha: "amazon", preco: 230, vendedor: "Amazon" } });
    s.saveSnapshot(p.id, T(2), [{ ...o, descartada: true }], { amazon: { linha: "amazon", preco: 210, vendedor: "Amazon" } });
    s.saveSnapshot(p.id, T(3), [], { amazon: { linha: "amazon", preco: 220, vendedor: "Amazon" } });
    const st = s.lineStats(p.id, "amazon");
    expect(st).toMatchObject({ atual: 220, min: 210, max: 230, primeiro: 230, coletas: 3 });
    expect(s.minBefore(p.id, "amazon", T(3))).toBe(210);
    expect(s.minBefore(p.id, "amazon", T(1))).toBeNull();
    expect((s.db.query("SELECT COUNT(*) AS n FROM offers").get() as { n: number }).n).toBe(2);
  });
  test("linha sem coleta tem estatística vazia (sem preço inventado)", () => {
    const p = s.addProduct("B000000001", "A", T(1));
    expect(s.lineStats(p.id, "usado")).toMatchObject({ atual: null, min: null, coletas: 0 });
  });
  test("falhas seguidas contam e zeram", () => {
    const p = s.addProduct("B000000001", "A", T(1));
    expect(s.recordFailure(p.id)).toBe(1);
    expect(s.recordFailure(p.id)).toBe(2);
    s.resetFailures(p.id);
    expect(s.getById(p.id)?.falhasSeguidas).toBe(0);
  });
  test("remover apaga o histórico junto", () => {
    const p = s.addProduct("B000000001", "A", T(1));
    s.setAlvo(p.id, 100);
    s.saveSnapshot(p.id, T(1), [], { amazon: { linha: "amazon", preco: 1, vendedor: null } });
    s.remove(p.id);
    expect((s.db.query("SELECT COUNT(*) AS n FROM price_lines").get() as { n: number }).n).toBe(0);
    expect((s.db.query("SELECT COUNT(*) AS n FROM alvos").get() as { n: number }).n).toBe(0);
  });
  test("meta", () => {
    s.setMeta("k", "v");
    expect(s.getMeta("k")).toBe("v");
    s.setMeta("k", null);
    expect(s.getMeta("k")).toBeNull();
  });
});

describe("grupos e migração", () => {
  test("banco antigo (sem grupo_id) é migrado sem perder itens", () => {
    const { Database } = require("bun:sqlite");
    const path = `${require("node:os").tmpdir()}/mig-${Date.now()}.db`;
    const old = new Database(path, { create: true });
    old.exec("CREATE TABLE products (id INTEGER PRIMARY KEY AUTOINCREMENT, asin TEXT NOT NULL UNIQUE, titulo TEXT, criado_em TEXT NOT NULL, pausado INTEGER NOT NULL DEFAULT 0, terceiros_on INTEGER NOT NULL DEFAULT 0, usado_on INTEGER NOT NULL DEFAULT 0, falhas_seguidas INTEGER NOT NULL DEFAULT 0, imagem TEXT); INSERT INTO products (asin, titulo, criado_em) VALUES ('B097BYXGXN', 'X', 't')");
    old.close();
    const s = new Store(path);
    expect(s.list().map((p) => [p.asin, p.grupoId])).toEqual([["B097BYXGXN", null]]);
    s.close();
    new Store(path).close();
    require("node:fs").rmSync(path);
  });

  test("nome de grupo é único sem diferenciar maiúsculas; apagar solta os itens", () => {
    const s = new Store();
    const g = s.addGrupo("Fone", "t")!;
    expect(s.addGrupo("FONE", "t")).toBeNull();
    const o = s.addGrupo("Outro", "t")!;
    expect(s.renameGrupo(o.id, "fone")).toBe(false);
    const p = s.addProduct("B097BYXGXN", null, "t");
    s.setGrupo(p.id, g.id);
    s.removeGrupo(g.id);
    expect(s.getById(p.id)!.grupoId).toBeNull();
  });
});
