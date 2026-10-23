import { Database } from "bun:sqlite";
import { EMPTY_ALERT_STATE } from "./alerts.ts";
import type { AlertState } from "./alerts.ts";
import type { LineKey, LinePoint, Offer } from "./types.ts";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asin TEXT NOT NULL UNIQUE,
  titulo TEXT,
  criado_em TEXT NOT NULL,
  pausado INTEGER NOT NULL DEFAULT 0,
  terceiros_on INTEGER NOT NULL DEFAULT 0,
  usado_on INTEGER NOT NULL DEFAULT 0,
  falhas_seguidas INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS alvos (
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  linha TEXT NOT NULL,
  preco_alvo REAL NOT NULL,
  PRIMARY KEY (product_id, linha)
);
CREATE TABLE IF NOT EXISTS offers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  coletado_em TEXT NOT NULL,
  vendedor TEXT NOT NULL,
  condicao TEXT NOT NULL,
  preco REAL NOT NULL,
  frete REAL,
  envio TEXT NOT NULL,
  descartada INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_offers_product_time ON offers(product_id, coletado_em);
CREATE TABLE IF NOT EXISTS price_lines (
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  linha TEXT NOT NULL,
  coletado_em TEXT NOT NULL,
  preco REAL NOT NULL,
  vendedor TEXT,
  PRIMARY KEY (product_id, linha, coletado_em)
);
CREATE TABLE IF NOT EXISTS alert_state (
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  linha TEXT NOT NULL,
  ultimo_alertado REAL,
  disponivel INTEGER,
  PRIMARY KEY (product_id, linha)
);
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT
);
`;

export interface Product {
  id: number;
  asin: string;
  titulo: string | null;
  criadoEm: string;
  pausado: boolean;
  terceirosOn: boolean;
  usadoOn: boolean;
  falhasSeguidas: number;
}

export interface LineStats {
  atual: number | null;
  atualEm: string | null;
  min: number | null;
  max: number | null;
  primeiro: number | null;
  coletas: number;
}

interface ProductRow {
  id: number;
  asin: string;
  titulo: string | null;
  criado_em: string;
  pausado: number;
  terceiros_on: number;
  usado_on: number;
  falhas_seguidas: number;
}

const toProduct = (r: ProductRow): Product => ({
  id: r.id,
  asin: r.asin,
  titulo: r.titulo,
  criadoEm: r.criado_em,
  pausado: r.pausado === 1,
  terceirosOn: r.terceiros_on === 1,
  usadoOn: r.usado_on === 1,
  falhasSeguidas: r.falhas_seguidas,
});

export class Store {
  readonly db: Database;

  constructor(path = ":memory:") {
    this.db = new Database(path, { create: true });
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    this.db.exec(SCHEMA);
  }

  close(): void {
    this.db.close();
  }

  addProduct(asin: string, titulo: string | null, now: string): Product {
    this.db.query("INSERT OR IGNORE INTO products (asin, titulo, criado_em) VALUES (?, ?, ?)").run(asin, titulo, now);
    return this.getByAsin(asin)!;
  }

  getByAsin(asin: string): Product | null {
    const r = this.db.query("SELECT * FROM products WHERE asin = ?").get(asin) as ProductRow | null;
    return r ? toProduct(r) : null;
  }

  getById(id: number): Product | null {
    const r = this.db.query("SELECT * FROM products WHERE id = ?").get(id) as ProductRow | null;
    return r ? toProduct(r) : null;
  }

  list(): Product[] {
    return (this.db.query("SELECT * FROM products ORDER BY id").all() as ProductRow[]).map(toProduct);
  }

  /** Número mostrado ao usuário: posição na lista, 1-based. Renumera após remoção. */
  byNumber(n: number): Product | null {
    return this.list()[n - 1] ?? null;
  }

  numberOf(id: number): number {
    return this.list().findIndex((p) => p.id === id) + 1;
  }

  setTitulo(id: number, titulo: string): void {
    this.db.query("UPDATE products SET titulo = ? WHERE id = ?").run(titulo, id);
  }

  setPausado(id: number, pausado: boolean): void {
    this.db.query("UPDATE products SET pausado = ? WHERE id = ?").run(pausado ? 1 : 0, id);
  }

  setLinhaOn(id: number, linha: "terceiros" | "usado", on: boolean): void {
    const col = linha === "terceiros" ? "terceiros_on" : "usado_on";
    this.db.query(`UPDATE products SET ${col} = ? WHERE id = ?`).run(on ? 1 : 0, id);
  }

  remove(id: number): void {
    this.db.query("DELETE FROM products WHERE id = ?").run(id);
  }

  setAlvo(id: number, linha: LineKey, preco: number | null): void {
    if (preco == null) this.db.query("DELETE FROM alvos WHERE product_id = ? AND linha = ?").run(id, linha);
    else
      this.db
        .query(
          "INSERT INTO alvos (product_id, linha, preco_alvo) VALUES (?, ?, ?) ON CONFLICT(product_id, linha) DO UPDATE SET preco_alvo = excluded.preco_alvo",
        )
        .run(id, linha, preco);
    this.db.query("UPDATE alert_state SET ultimo_alertado = NULL WHERE product_id = ? AND linha = ?").run(id, linha);
  }

  getAlvo(id: number, linha: LineKey): number | null {
    const r = this.db.query("SELECT preco_alvo FROM alvos WHERE product_id = ? AND linha = ?").get(id, linha) as {
      preco_alvo: number;
    } | null;
    return r ? r.preco_alvo : null;
  }

  /** Grava o instantâneo do ciclo: ofertas brutas e as linhas derivadas. */
  saveSnapshot(
    id: number,
    at: string,
    offers: Array<Offer & { descartada?: boolean }>,
    points: Partial<Record<LineKey, LinePoint>>,
  ): void {
    const tx = this.db.transaction(() => {
      const insOffer = this.db.query(
        "INSERT INTO offers (product_id, coletado_em, vendedor, condicao, preco, frete, envio, descartada) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      );
      for (const o of offers) insOffer.run(id, at, o.vendedor, o.condicao, o.preco, o.frete, o.envio, o.descartada ? 1 : 0);
      const insLine = this.db.query(
        "INSERT OR REPLACE INTO price_lines (product_id, linha, coletado_em, preco, vendedor) VALUES (?, ?, ?, ?, ?)",
      );
      for (const p of Object.values(points)) if (p) insLine.run(id, p.linha, at, p.preco, p.vendedor);
    });
    tx();
  }

  lineStats(id: number, linha: LineKey, desde?: string): LineStats {
    const where = desde ? "AND coletado_em >= ?" : "";
    const args = desde ? [id, linha, desde] : [id, linha];
    const agg = this.db
      .query(
        `SELECT MIN(preco) AS min, MAX(preco) AS max, COUNT(*) AS n FROM price_lines WHERE product_id = ? AND linha = ? ${where}`,
      )
      .get(...args) as { min: number | null; max: number | null; n: number };
    const first = this.db
      .query(`SELECT preco FROM price_lines WHERE product_id = ? AND linha = ? ${where} ORDER BY coletado_em ASC LIMIT 1`)
      .get(...args) as { preco: number } | null;
    const last = this.db
      .query("SELECT preco, coletado_em FROM price_lines WHERE product_id = ? AND linha = ? ORDER BY coletado_em DESC LIMIT 1")
      .get(id, linha) as { preco: number; coletado_em: string } | null;
    return {
      atual: last?.preco ?? null,
      atualEm: last?.coletado_em ?? null,
      min: agg.min,
      max: agg.max,
      primeiro: first?.preco ?? null,
      coletas: agg.n,
    };
  }

  /** Menor preço da linha antes de `antesDe` (para detectar novo mínimo). */
  minBefore(id: number, linha: LineKey, antesDe: string): number | null {
    const r = this.db
      .query("SELECT MIN(preco) AS m FROM price_lines WHERE product_id = ? AND linha = ? AND coletado_em < ?")
      .get(id, linha, antesDe) as { m: number | null };
    return r.m;
  }

  getAlertState(id: number, linha: LineKey): AlertState {
    const r = this.db
      .query("SELECT ultimo_alertado, disponivel FROM alert_state WHERE product_id = ? AND linha = ?")
      .get(id, linha) as { ultimo_alertado: number | null; disponivel: number | null } | null;
    if (!r) return { ...EMPTY_ALERT_STATE };
    return { ultimoAlertado: r.ultimo_alertado, disponivel: r.disponivel == null ? null : r.disponivel === 1 };
  }

  setAlertState(id: number, linha: LineKey, s: AlertState): void {
    this.db
      .query(
        "INSERT INTO alert_state (product_id, linha, ultimo_alertado, disponivel) VALUES (?, ?, ?, ?) ON CONFLICT(product_id, linha) DO UPDATE SET ultimo_alertado = excluded.ultimo_alertado, disponivel = excluded.disponivel",
      )
      .run(id, linha, s.ultimoAlertado, s.disponivel == null ? null : s.disponivel ? 1 : 0);
  }

  /** Devolve o novo contador de falhas seguidas. */
  recordFailure(id: number): number {
    this.db.query("UPDATE products SET falhas_seguidas = falhas_seguidas + 1 WHERE id = ?").run(id);
    return this.getById(id)?.falhasSeguidas ?? 0;
  }

  resetFailures(id: number): void {
    this.db.query("UPDATE products SET falhas_seguidas = 0 WHERE id = ?").run(id);
  }

  getMeta(key: string): string | null {
    const r = this.db.query("SELECT value FROM meta WHERE key = ?").get(key) as { value: string | null } | null;
    return r?.value ?? null;
  }

  setMeta(key: string, value: string | null): void {
    if (value == null) this.db.query("DELETE FROM meta WHERE key = ?").run(key);
    else this.db.query("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
  }
}
