/**
 * Diagnóstico de um item (somente leitura, sem tokens): estado no banco, e o que a Amazon devolve
 * agora para a página e para o painel de ofertas, com o que o parser leu e os preços R$ crus.
 *
 *   docker compose exec tracker bun scripts/diagnostico-item.ts B00C061HZY
 *   docker compose exec tracker bun scripts/diagnostico-item.ts B00C061HZY --salvar /tmp/pagina.html
 */
import { Database } from "bun:sqlite";
import { writeFileSync } from "node:fs";
import { fetchHtml, offersUrl, pickUserAgent, productUrl } from "../src/amazon/fetch.ts";
import { detectBlock, parseOffersPanel, parseProductPage } from "../src/amazon/parse.ts";

const asin = (process.argv[2] ?? "").toUpperCase();
if (!/^[A-Z0-9]{10}$/.test(asin)) throw new Error("uso: bun scripts/diagnostico-item.ts ASIN [--salvar arquivo.html]");
const si = process.argv.indexOf("--salvar");
const salvar = si > 0 ? process.argv[si + 1] : null;

const dbPath = process.env["DB_PATH"] || "./data/tracker.db";
const db = new Database(dbPath, { readonly: true });
const p = db.query("SELECT id, asin, titulo, falhas_seguidas FROM products WHERE asin = ?").get(asin) as { id: number; falhas_seguidas: number } | null;
console.log("== banco ==");
if (!p) console.log("ASIN não está cadastrado neste banco:", dbPath);
else {
  console.log("produto:", p);
  console.log("última coleta:", db.query("SELECT value FROM meta WHERE key = ?").get(`ultima_coleta:${p.id}`));
  console.log("pontos de preço:", db.query("SELECT linha, COUNT(*) AS n, MAX(coletado_em) AS ultimo FROM price_lines WHERE product_id = ? GROUP BY linha").all(p.id));
  console.log("ofertas gravadas:", (db.query("SELECT COUNT(*) AS n FROM offers WHERE product_id = ?").get(p.id) as { n: number }).n);
}

const ua = pickUserAgent(0);
const brl = (html: string) => [...new Set(html.match(/R\$\s?[\d.]+,\d{2}/g) ?? [])].slice(0, 30);

console.log("\n== página do produto ==");
const pg = await fetchHtml(productUrl(asin), { ua });
console.log({ status: pg.status, bytes: pg.html.length, ms: pg.ms, bloqueio: detectBlock(pg.html, pg.status, "product") });
if (salvar) writeFileSync(salvar, pg.html);
console.log("parse:", parseProductPage(pg.html));
console.log("preços R$ na página:", brl(pg.html));

console.log("\n== painel de ofertas ==");
const pn = await fetchHtml(offersUrl(asin), { ua, referer: productUrl(asin), ajax: true });
console.log({ status: pn.status, bytes: pn.html.length, bloqueio: detectBlock(pn.html, pn.status, "offers") });
console.log("ofertas lidas:", parseOffersPanel(pn.html));
console.log("preços R$ no painel:", brl(pn.html));
