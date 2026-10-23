/**
 * Diagnóstico offline: roda o parser nos HTMLs salvos pelo spike e mostra o que
 * ele leu, mais os trechos brutos que ajudam a calibrar os seletores.
 * Não faz requisição nenhuma.
 *
 *   bun scripts/inspect.ts                     # 3 arquivos de produto de tests/fixtures/real
 *   bun scripts/inspect.ts --max 5 --dir tests/fixtures/real
 */
import { readdirSync, readFileSync } from "node:fs";
import { parse } from "node-html-parser";
import { parseProductPage } from "../src/amazon/parse.ts";

let dir = "tests/fixtures/real";
let max = 3;
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--dir") dir = argv[++i]!;
  else if (argv[i] === "--max") max = Number(argv[++i]);
}

const cut = (s: string, n = 140) => s.replace(/\s+/g, " ").trim().slice(0, n);

const byAsin = new Map<string, string>();
for (const f of readdirSync(dir).sort())
  if (/-produto-\d+-ok\.html$/.test(f)) {
    const asin = f.split("-")[0]!;
    if (!byAsin.has(asin)) byAsin.set(asin, f);
  }

for (const [asin, file] of [...byAsin].slice(0, max)) {
  const html = readFileSync(`${dir}/${file}`, "utf8");
  const root = parse(html);
  const p = parseProductPage(html);
  console.log(`\n===== ${asin}  (${file}, ${Math.round(html.length / 1024)} KB)`);
  console.log("parser:", JSON.stringify(p));

  const sel = (s: string) => {
    const els = root.querySelectorAll(s);
    return els.length ? `${els.length}x: ${cut(els[0]!.text, 90)}` : "—";
  };
  console.log("candidatos de preço:");
  for (const s of [
    "#corePrice_feature_div .a-price .a-offscreen",
    "#corePriceDisplay_desktop_feature_div .a-price .a-offscreen",
    ".priceToPay .a-offscreen",
    "#price_inside_buybox",
    ".a-price .a-offscreen",
  ])
    console.log(`  ${s} -> ${sel(s)}`);

  console.log("vendedor / caixa de compra:");
  for (const s of [
    "#sellerProfileTriggerId",
    "#merchant-info",
    "#tabular-buybox",
    "#merchantInfoFeature_feature_div",
    "#availability",
    "#olp_feature_div",
    "#dynamic-aod-ingress-box",
    "#aod-ingress-link",
    "#buybox-see-all-buying-choices",
  ])
    console.log(`  ${s} -> ${sel(s)}`);

  const aod = new Set<string>();
  for (const m of html.matchAll(/[^"'\s<>]*aod[^"'\s<>]*/gi)) {
    if (aod.size >= 25) break;
    aod.add(cut(m[0]!, 160));
  }
  console.log("trechos com 'aod':", aod.size ? "\n  " + [...aod].join("\n  ") : "nenhum");

  const ajax = new Set<string>();
  for (const m of html.matchAll(/(?:\/gp\/[a-z/-]*ajax[^"'\s<>]*|[^"'\s<>]*aodAjax[^"'\s<>]*)/gi)) {
    if (ajax.size >= 10) break;
    ajax.add(cut(m[0]!, 200));
  }
  console.log("endereços ajax:", ajax.size ? "\n  " + [...ajax].join("\n  ") : "nenhum");
}
if (!byAsin.size) console.log(`Nenhum arquivo -produto-*-ok.html em ${dir}.`);
