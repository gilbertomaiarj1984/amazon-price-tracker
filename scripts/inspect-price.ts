/**
 * Diagnóstico offline, bem focado: preço e frete de cada oferta do painel, e o bloco de preço
 * da página do produto. Imprime só tags, ids, classes e textos curtos. Sem rede.
 *
 *   bun scripts/inspect-price.ts [--dir tests/fixtures/real]
 */
import { readdirSync, readFileSync } from "node:fs";
import { parse } from "node-html-parser";
import type { HTMLElement } from "node-html-parser";

let dir = "tests/fixtures/real";
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) if (argv[i] === "--dir") dir = argv[++i]!;

const clean = (s: string, n: number) => s.replace(/\s+/g, " ").trim().slice(0, n);
const SKIP = new Set(["script", "style", "noscript", "input", "svg", "img", "link", "meta", "path"]);

function tree(el: HTMLElement, depth: number, max: number, out: string[], limit = 40): void {
  if (out.length >= limit) return;
  const tag = el.rawTagName?.toLowerCase() ?? "";
  const id = el.getAttribute("id");
  const cls = (el.getAttribute("class") ?? "").split(/\s+/).filter(Boolean).slice(0, 4).join(".");
  const own = clean(el.childNodes.filter((n) => n.nodeType === 3).map((n) => n.text).join(" "), 50);
  if (tag) out.push(`${"  ".repeat(depth)}${tag}${id ? "#" + id.slice(0, 40) : ""}${cls ? "." + cls : ""}${own ? '  "' + own + '"' : ""}`);
  if (depth >= max) return;
  for (const c of el.childNodes) {
    if (c.nodeType !== 1) continue;
    const ce = c as HTMLElement;
    if (!SKIP.has(ce.rawTagName?.toLowerCase() ?? "")) tree(ce, depth + 1, max, out, limit);
  }
}

const strip = (html: string) => {
  const root = parse(html);
  for (const el of root.querySelectorAll("script, style, noscript")) el.remove();
  return root;
};

const files = readdirSync(dir).sort();

for (const f of files.filter((x) => /-sonda-A-ok\.html$/.test(x))) {
  const root = strip(readFileSync(`${dir}/${f}`, "utf8"));
  console.log(`\n===== PAINEL ${f.split("-")[0]}`);
  const blocks = root.querySelectorAll('[id="aod-pinned-offer"], [id="aod-offer"]').slice(0, 3);
  blocks.forEach((b, i) => {
    console.log(`--- bloco ${i + 1}: ${b.getAttribute("id")}`);
    const price = b.querySelector('[id^="aod-price-"]');
    if (price) {
      const out: string[] = [];
      tree(price, 0, 10, out, 25);
      console.log("preço (#aod-price-N):\n" + out.map((l) => "  " + l).join("\n"));
    } else console.log("preço: sem #aod-price-N");
    console.log("  todos os .a-offscreen do bloco:");
    for (const o of b.querySelectorAll(".a-offscreen").slice(0, 6)) {
      const p = o.parentNode as HTMLElement | null;
      console.log(`    "${clean(o.text, 24)}"  pai=${p?.rawTagName ?? "?"}.${(p?.getAttribute?.("class") ?? "").split(/\s+/).slice(0, 3).join(".")}`);
    }
    const ship = b.querySelector('[id="aod_ship_charge_row"]');
    console.log(`  frete (#aod_ship_charge_row): ${ship ? '"' + clean(ship.text, 160) + '"' : "ausente"}`);
    const more = b.querySelector('[id="aod-delivery-more-action"]');
    console.log(`  entrega (#aod-delivery-more-action): ${more ? '"' + clean(more.text, 160) + '"' : "ausente"}`);
    const promo = b.querySelector('[id^="aod-offer-promotion-"]');
    console.log(`  promoção: ${promo ? '"' + clean(promo.text, 100) + '"' : "ausente"}`);
  });
}

for (const f of files.filter((x) => /-sonda-produto\.html$/.test(x))) {
  const root = strip(readFileSync(`${dir}/${f}`, "utf8"));
  console.log(`\n===== PRODUTO ${f.split("-")[0]}: bloco de preço`);
  for (const sel of ["#corePrice_feature_div", "#corePriceDisplay_desktop_feature_div"]) {
    const el = root.querySelector(sel);
    if (!el) {
      console.log(`${sel}: ausente`);
      continue;
    }
    const out: string[] = [];
    tree(el, 0, 9, out, 30);
    console.log(`${sel}:\n` + out.map((l) => "  " + l).join("\n"));
  }
  const bb = root.querySelector("#buybox") ?? root.querySelector("#desktop_buybox");
  console.log("texto da caixa de compra:", bb ? '"' + clean(bb.text, 320) + '"' : "ausente");
  const sub = clean(root.text, 600000).match(/.{0,40}(?:Compra única|Assine e economize|Assinar e economizar|Economize).{0,60}/gi);
  console.log("trechos 'Compra única/assine':", sub ? "\n    " + sub.slice(0, 4).join("\n    ") : "nenhum");
}
