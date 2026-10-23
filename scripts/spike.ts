/**
 * Teste de bloqueio. Rode DE DENTRO do VPS: o IP de onde a requisição sai é o que importa.
 *
 *   bun scripts/spike.ts https://www.amazon.com.br/dp/B0C8XK2M4N https://amzn.to/3Vq8LmT
 *   bun scripts/spike.ts --file links.txt --n 50 --offers
 *   bun scripts/spike.ts --dry          # usa as fixtures, sem rede
 *
 * Sem Bun instalado:
 *   docker run --rm -v "$PWD":/app -w /app oven/bun:1 bun install --frozen-lockfile
 *   docker run --rm -v "$PWD":/app -w /app oven/bun:1 bun scripts/spike.ts --file links.txt
 *
 * Salva o HTML bruto de cada resposta em tests/fixtures/real/ (fora do git) para calibrar o parser.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolveAsin } from "../src/amazon/asin.ts";
import { fetchHtml, jitterMs, offersUrl, pickUserAgent, productUrl } from "../src/amazon/fetch.ts";
import type { Fetched } from "../src/amazon/fetch.ts";
import { detectBlock, parseOffersPanel, parseProductPage } from "../src/amazon/parse.ts";
import type { BlockKind } from "../src/types.ts";

interface Args {
  links: string[];
  n: number;
  offers: boolean;
  dry: boolean;
  out: string;
  minMs: number;
  maxMs: number;
}

function parseArgs(argv: string[]): Args {
  const a: Args = { links: [], n: 50, offers: false, dry: false, out: "tests/fixtures/real", minMs: 2000, maxMs: 5000 };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i]!;
    if (v === "--n") a.n = Number(argv[++i]);
    else if (v === "--offers") a.offers = true;
    else if (v === "--dry") a.dry = true;
    else if (v === "--out") a.out = argv[++i]!;
    else if (v === "--min-ms") a.minMs = Number(argv[++i]);
    else if (v === "--max-ms") a.maxMs = Number(argv[++i]);
    else if (v === "--file")
      a.links.push(...readFileSync(argv[++i]!, "utf8").split(/\s+/).filter((l) => l.startsWith("http")));
    else if (v.startsWith("http")) a.links.push(v);
    else if (v === "--help" || v === "-h") {
      console.log(readFileSync(new URL(import.meta.url), "utf8").split("*/")[0]);
      process.exit(0);
    }
  }
  return a;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const fixture = (n: string) => readFileSync(new URL(`../tests/fixtures/${n}`, import.meta.url), "utf8");

interface Row {
  asin: string;
  tipo: "produto" | "ofertas";
  status: number;
  bloqueio: BlockKind;
  ms: number;
  detalhe: string;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.dry) {
    args.links = ["https://www.amazon.com.br/dp/B0C8XK2M4N", "https://www.amazon.com.br/dp/B09Z3V8H1D"];
    args.n = 6;
    args.offers = true;
  }
  if (!args.links.length) {
    console.error("Passe ao menos um link (ou --file links.txt, ou --dry). Veja --help.");
    process.exit(2);
  }

  const asins: string[] = [];
  for (const l of args.links) {
    const r = await resolveAsin(l);
    if (r.ok) asins.push(r.asin);
    else console.warn(`Ignorado (${r.motivo}): ${l}`);
  }
  if (!asins.length) process.exit(2);

  mkdirSync(args.out, { recursive: true });
  const rows: Row[] = [];
  const dryPages = [fixture("product-amazon.html"), fixture("product-third-party.html")];

  const get = async (url: string, opts: Parameters<typeof fetchHtml>[1], dryHtml: string): Promise<Fetched> =>
    args.dry ? { status: 200, html: dryHtml, ms: 0 } : fetchHtml(url, opts);

  for (let i = 0; i < args.n; i++) {
    const asin = asins[i % asins.length]!;
    const ua = pickUserAgent(i);
    try {
      const page = await get(productUrl(asin), { ua }, dryPages[i % dryPages.length]!);
      const kind = detectBlock(page.html, page.status, "product");
      const parsed = kind === "ok" ? parseProductPage(page.html) : null;
      rows.push({
        asin, tipo: "produto", status: page.status, bloqueio: kind, ms: page.ms,
        detalhe: parsed ? `${parsed.titulo?.slice(0, 40) ?? "?"} | caixa ${parsed.buyBox ?? "—"} | vendedor ${parsed.buyBoxVendedor ?? "?"}` : "",
      });
      if (!args.dry) writeFileSync(`${args.out}/${asin}-produto-${i}-${kind}.html`, page.html);

      if (args.offers) {
        if (!args.dry) await sleep(jitterMs(args.minMs, args.maxMs));
        const panel = await get(offersUrl(asin), { ua, referer: productUrl(asin), ajax: true }, fixture("offers-panel.html"));
        const pk = detectBlock(panel.html, panel.status, "offers");
        const offers = pk === "ok" ? parseOffersPanel(panel.html) : [];
        rows.push({ asin, tipo: "ofertas", status: panel.status, bloqueio: pk, ms: panel.ms, detalhe: `${offers.length} ofertas` });
        if (!args.dry) writeFileSync(`${args.out}/${asin}-ofertas-${i}-${pk}.html`, panel.html);
      }
    } catch (e) {
      rows.push({ asin, tipo: "produto", status: 0, bloqueio: "http_error", ms: 0, detalhe: `erro de rede: ${(e as Error).message}` });
    }
    const last = rows[rows.length - 1]!;
    console.log(`${String(i + 1).padStart(3)}/${args.n} ${last.tipo.padEnd(7)} ${asin} HTTP ${last.status} ${last.bloqueio} ${last.ms}ms ${last.detalhe}`);
    if (i < args.n - 1 && !args.dry) await sleep(jitterMs(args.minMs, args.maxMs));
  }

  console.log("\n=== Resumo ===");
  for (const tipo of ["produto", "ofertas"] as const) {
    const rs = rows.filter((r) => r.tipo === tipo);
    if (!rs.length) continue;
    const count: Record<string, number> = {};
    for (const r of rs) count[r.bloqueio] = (count[r.bloqueio] ?? 0) + 1;
    const ok = count["ok"] ?? 0;
    console.log(`${tipo}: ${ok}/${rs.length} ok (${Math.round((ok / rs.length) * 100)}%)  ${JSON.stringify(count)}`);
  }
  const prod = rows.filter((r) => r.tipo === "produto");
  const rate = prod.filter((r) => r.bloqueio === "ok").length / Math.max(1, prod.length);
  console.log(rate >= 0.9 ? "\nVeredito: taxa de sucesso >= 90%. Dá para seguir." : "\nVeredito: abaixo de 90%. Rever frequência ou origem do IP antes de seguir.");
  if (!args.dry) console.log(`HTML bruto salvo em ${args.out}/ (use para calibrar src/amazon/parse.ts).`);
}

await main();
