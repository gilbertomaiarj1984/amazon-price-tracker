/**
 * Diagnóstico offline do painel "Todas as ofertas" e dos indícios na página do produto.
 * Lê os arquivos *-sonda-A-ok.html e *-sonda-produto.html salvos por probe-offers.ts.
 * Imprime só um esqueleto (tag, id, classes e textos curtos). Atributos como tokens e
 * links são descartados de propósito. Não faz requisição nenhuma.
 *
 *   bun scripts/inspect-offers.ts [--dir tests/fixtures/real] [--lines 90]
 */
import { readdirSync, readFileSync } from "node:fs";
import { parse } from "node-html-parser";
import type { HTMLElement } from "node-html-parser";

let dir = "tests/fixtures/real";
let maxLines = 90;
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--dir") dir = argv[++i]!;
  else if (argv[i] === "--lines") maxLines = Number(argv[++i]);
}

const SKIP = new Set(["script", "style", "noscript", "input", "svg", "img", "link", "meta", "i", "br", "path"]);
const clean = (s: string, n: number) => s.replace(/\s+/g, " ").trim().slice(0, n);

function ownText(el: HTMLElement): string {
  return clean(
    el.childNodes
      .filter((n) => n.nodeType === 3)
      .map((n) => n.text)
      .join(" "),
    60,
  );
}

function skeleton(el: HTMLElement, depth: number, maxDepth: number, out: string[]): void {
  if (out.length >= maxLines) return;
  const id = el.getAttribute("id");
  const cls = (el.getAttribute("class") ?? "").split(/\s+/).filter(Boolean).slice(0, 3).join(".");
  const t = ownText(el);
  const tag = el.rawTagName?.toLowerCase() ?? "";
  if (tag) out.push(`${"  ".repeat(depth)}${tag}${id ? "#" + id.slice(0, 40) : ""}${cls ? "." + cls : ""}${t ? '  "' + t + '"' : ""}`);
  if (depth >= maxDepth) return;
  for (const c of el.childNodes) {
    if (c.nodeType !== 1) continue;
    const ce = c as HTMLElement;
    if (SKIP.has(ce.rawTagName?.toLowerCase() ?? "")) continue;
    skeleton(ce, depth + 1, maxDepth, out);
  }
}

const files = readdirSync(dir).sort();

for (const f of files.filter((x) => /-sonda-A-ok\.html$/.test(x))) {
  const root = parse(readFileSync(`${dir}/${f}`, "utf8"));
  for (const el of root.querySelectorAll("script, style, noscript")) el.remove();
  console.log(`\n===== PAINEL ${f.split("-")[0]}`);
  const ids = new Map<string, number>();
  for (const el of root.querySelectorAll("[id]")) {
    const id = el.getAttribute("id")!;
    if (/^aod/i.test(id)) ids.set(id, (ids.get(id) ?? 0) + 1);
  }
  console.log("ids 'aod*':", [...ids].map(([k, v]) => `${k}(${v})`).join(" ") || "nenhum");
  console.log("preços .a-offscreen:", root.querySelectorAll(".a-offscreen").slice(0, 6).map((e) => clean(e.text, 20)).join(" | "));
  const blocks = root.querySelectorAll('[id="aod-pinned-offer"], [id="aod-offer"]');
  console.log(`blocos de oferta (#aod-pinned-offer / #aod-offer): ${blocks.length}`);
  blocks.slice(0, 2).forEach((b, i) => {
    const out: string[] = [];
    skeleton(b, 0, 7, out);
    console.log(`--- bloco ${i + 1}${out.length >= maxLines ? " (cortado)" : ""}`);
    console.log(out.join("\n"));
  });
}

for (const f of files.filter((x) => /-sonda-produto\.html$/.test(x))) {
  const root = parse(readFileSync(`${dir}/${f}`, "utf8"));
  for (const el of root.querySelectorAll("script, style, noscript")) el.remove();
  console.log(`\n===== PRODUTO ${f.split("-")[0]}: indícios de outras ofertas`);
  for (const sel of ["#olp_feature_div", "#dynamic-aod-ingress-box", "#aod-ingress-link", "#buybox-see-all-buying-choices", '[id*="aod-ingress"]', '[id*="olp"]']) {
    const els = root.querySelectorAll(sel);
    if (els.length) console.log(`  ${sel} -> ${els.length}x  id=${els[0]!.getAttribute("id")}  texto="${clean(els[0]!.text, 140)}"`);
  }
  const text = clean(root.text, 400000);
  const hits = [...text.matchAll(/.{0,50}(?:a partir de|outras op[cç][õo]es de compra|ver todas as op).{0,70}/gi)].slice(0, 6);
  console.log(hits.length ? "  trechos:\n    " + hits.map((m) => m[0]).join("\n    ") : "  trechos 'a partir de': nenhum");
  const vend = root.querySelectorAll("#sellerProfileTriggerId, #merchantInfoFeature_feature_div");
  console.log("  vendedor:", vend.slice(0, 3).map((e) => clean(e.text, 80)).join(" | ") || "—");
}
