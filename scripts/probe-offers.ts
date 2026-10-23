/**
 * Descobre qual endereço devolve o painel "Todas as ofertas".
 * Use produtos que tenham VÁRIOS vendedores (os de oferta única não têm o painel).
 * Poucas requisições (cerca de 8 por produto), espaçadas.
 *
 *   bun scripts/probe-offers.ts --file links.txt
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolveAsin } from "../src/amazon/asin.ts";
import { fetchHtml, jitterMs, pickUserAgent, productUrl } from "../src/amazon/fetch.ts";
import { detectBlock, parseOffersPanel, parseProductPage } from "../src/amazon/parse.ts";

const B = "https://www.amazon.com.br";
const candidates: Array<{ nome: string; url: (a: string) => string; ajax: boolean }> = [
  { nome: "A /gp/product/ajax/aodAjaxMain", url: (a) => `${B}/gp/product/ajax/aodAjaxMain/ref=dp_aod_ALL_mbc?asin=${a}&m=&qid=&smid=&sourcecustomerorglistid=&sourcecustomerorglistitemid=&sr=&pc=dp&experienceId=aodAjaxMain`, ajax: true },
  { nome: "B /gp/product/ajax/ref=dp_aod", url: (a) => `${B}/gp/product/ajax/ref=dp_aod_ALL_mbc?asin=${a}&m=&qid=&smid=&sourcecustomerorglistid=&sourcecustomerorglistitemid=&sr=&pc=dp&experienceId=aodAjaxMain`, ajax: true },
  { nome: "C /gp/aod/ajax/ref=dp_aod", url: (a) => `${B}/gp/aod/ajax/ref=dp_aod_ALL_mbc?asin=${a}&m=&qid=&smid=&sourcecustomerorglistid=&sourcecustomerorglistitemid=&sr=&pc=dp`, ajax: true },
  { nome: "D /gp/aod/ajax?asin", url: (a) => `${B}/gp/aod/ajax?asin=${a}&pc=dp`, ajax: true },
  { nome: "E /gp/aod/ajax filtro novo", url: (a) => `${B}/gp/aod/ajax/ref=aod_f_new?asin=${a}&pc=dp&filters=%7B%22all%22%3Atrue%2C%22new%22%3Atrue%7D`, ajax: true },
  { nome: "F /gp/offer-listing", url: (a) => `${B}/gp/offer-listing/${a}`, ajax: false },
  { nome: "G /dp?aod=1", url: (a) => `${B}/dp/${a}?aod=1`, ajax: false },
];

const file = process.argv[process.argv.indexOf("--file") + 1];
if (!file) {
  console.error("Uso: bun scripts/probe-offers.ts --file links.txt");
  process.exit(2);
}
const links = readFileSync(file, "utf8").split(/\s+/).filter((l) => l.startsWith("http"));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const out = "tests/fixtures/real";
mkdirSync(out, { recursive: true });

let n = 0;
for (const l of links) {
  const r = await resolveAsin(l);
  if (!r.ok) {
    console.log(`Ignorado (${r.motivo}): ${l}`);
    continue;
  }
  const asin = r.asin;
  console.log(`\n===== ${asin}`);
  const ua = pickUserAgent(n++);
  try {
    const pg = await fetchHtml(productUrl(asin), { ua });
    const p = pg.status === 200 ? parseProductPage(pg.html) : null;
    const low = pg.html.toLowerCase();
    console.log(`produto: HTTP ${pg.status} ${detectBlock(pg.html, pg.status)} | caixa ${p?.buyBox ?? "—"} | vendedor ${p?.buyBoxVendedor ?? "?"} | outras a partir de ${p?.outrasAPartirDe ?? "—"}`);
    console.log(`  indícios de outras ofertas na página: aod-ingress=${low.includes("aod-ingress")} | olp=${low.includes("olp-upd")} | "outras opções"=${low.includes("outras opções") || low.includes("outras op&#231;")}`);
    const m = /(?:Novo|Usado)[^<]{0,40}a partir de[^<]{0,30}/i.exec(pg.html);
    console.log(`  texto "a partir de": ${m ? m[0].replace(/\s+/g, " ") : "nenhum"}`);
    writeFileSync(`${out}/${asin}-sonda-produto.html`, pg.html);
  } catch (e) {
    console.log(`produto: erro de rede ${(e as Error).message}`);
  }
  for (const c of candidates) {
    await sleep(jitterMs(2500, 5000));
    try {
      const f = await fetchHtml(c.url(asin), { ua, referer: productUrl(asin), ajax: c.ajax });
      const kind = detectBlock(f.html, f.status, "offers");
      const offers = kind === "ok" ? parseOffersPanel(f.html).length : 0;
      console.log(`  ${c.nome.padEnd(34)} HTTP ${f.status} ${kind.padEnd(16)} ${String(Math.round(f.html.length / 1024)).padStart(5)} KB  ofertas lidas: ${offers}`);
      writeFileSync(`${out}/${asin}-sonda-${c.nome[0]}-${kind}.html`, f.html);
    } catch (e) {
      console.log(`  ${c.nome.padEnd(34)} erro de rede ${(e as Error).message}`);
    }
  }
}
console.log(`\nHTML bruto salvo em ${out}/ (arquivos *-sonda-*).`);
