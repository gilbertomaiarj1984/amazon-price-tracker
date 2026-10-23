import { pickUserAgent, productUrl } from "./amazon/fetch.ts";
import type { Fetched } from "./amazon/fetch.ts";
import { detectBlock, parseProductPage, parseVariantes } from "./amazon/parse.ts";
import type { Variante } from "./amazon/parse.ts";
import type { Certeza, Product, Store } from "./db.ts";

export interface SugestoesDeps {
  store: Store;
  /** Cada leitura passa pela fila única da Amazon (mesma trava da rodada normal). */
  fetchHtml: (url: string, opts: { ua: string }) => Promise<Fetched>;
  now: () => Date;
  sleep: (ms: number) => Promise<void>;
  /** Pausa entre requisições da varredura (bem maior que a da rodada normal). */
  pauseMs: () => number;
  log: (msg: string) => void;
  /** Itens (sem oferta da Amazon) olhados por varredura. */
  maxItens: number;
  /** Candidatos conferidos por item. */
  maxCandidatos: number;
}

export interface VarreduraResult {
  itens: number;
  requisicoes: number;
  novas: number;
  /** Motivo de ter parado antes do fim, se parou. */
  parou: "captcha" | null;
}

export const SCAN_DAY_KEY = "sugestoes:dia";
export const SCAN_LAST_KEY = "sugestoes:ultima";
const SCAN_TZ = "America/Sao_Paulo";

/** Dia (AAAA-MM-DD) e hora em Brasília: a varredura roda uma vez por dia, depois da hora configurada. */
export function brasilia(now: Date): { dia: string; hora: number } {
  const dia = new Intl.DateTimeFormat("en-CA", { timeZone: SCAN_TZ }).format(now);
  const hora = Number(new Intl.DateTimeFormat("en-GB", { timeZone: SCAN_TZ, hour: "2-digit", hourCycle: "h23" }).format(now));
  return { dia, hora };
}

export function varreduraDevida(store: Store, now: Date, hora: number): boolean {
  const b = brasilia(now);
  return b.hora >= hora && store.getMeta(SCAN_DAY_KEY) !== b.dia;
}

const norm = (s: string | null | undefined): string =>
  (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Quanto confiar que é "o mesmo produto": só o rótulo do formato e o tipo de variação dizem isso, o título sozinho não. */
export function certezaDe(v: Variante, formatoOrigem: string | null): Certeza {
  if (v.rotulo && norm(v.rotulo) === norm(formatoOrigem)) return "alta";
  return v.dimensao === "variacao" ? "media" : "baixa";
}

/** Itens em que a última leitura deu certo e a Amazon não vendia, os menos olhados primeiro. */
export function elegiveis(store: Store): Product[] {
  return store
    .list()
    .filter((p) => !p.pausado && store.getUltimaColeta(p.id)?.ok === true && store.getAlertState(p.id, "amazon").disponivel === false)
    .sort((a, b) => (store.getMeta(`sugestoes:visto:${a.id}`) ?? "").localeCompare(store.getMeta(`sugestoes:visto:${b.id}`) ?? "") || a.id - b.id);
}

/**
 * Varredura diária: para cada item sem oferta da Amazon, lê as variações da própria página e confere se alguma é
 * vendida pela Amazon. Só grava SUGESTÕES; nada é cadastrado. Para no primeiro captcha.
 */
export async function runVarredura(d: SugestoesDeps): Promise<VarreduraResult> {
  const { store } = d;
  const now = d.now().toISOString();
  store.setMeta(SCAN_DAY_KEY, brasilia(d.now()).dia);
  store.descartarObsoletas(now);
  const res: VarreduraResult = { itens: 0, requisicoes: 0, novas: 0, parou: null };
  let ua = 0;
  const get = async (asin: string): Promise<{ html: string; ok: boolean; captcha: boolean }> => {
    if (res.requisicoes > 0) await d.sleep(d.pauseMs());
    res.requisicoes++;
    const f = await d.fetchHtml(productUrl(asin), { ua: pickUserAgent(ua++) });
    const kind = detectBlock(f.html, f.status, "product");
    return { html: f.html, ok: kind === "ok", captcha: kind === "captcha" };
  };

  for (const origem of elegiveis(store).slice(0, d.maxItens)) {
    res.itens++;
    store.setMeta(`sugestoes:visto:${origem.id}`, now);
    let pagina;
    try {
      pagina = await get(origem.asin);
    } catch (e) {
      d.log(`varredura: erro de rede em ${origem.asin}: ${(e as Error).message}`);
      continue;
    }
    if (pagina.captcha) {
      res.parou = "captcha";
      break;
    }
    if (!pagina.ok) continue;
    const variantes = parseVariantes(pagina.html);
    const formatoOrigem = variantes.find((v) => v.selecionada && v.dimensao === "formato")?.rotulo || null;
    const candidatos = variantes
      .filter((v) => v.asin !== origem.asin && !store.getByAsin(v.asin) && !store.asinRecusado(v.asin) && !store.jaSugerido(origem.id, v.asin))
      .slice(0, d.maxCandidatos);
    for (const c of candidatos) {
      let p;
      try {
        p = await get(c.asin);
      } catch (e) {
        d.log(`varredura: erro de rede em ${c.asin}: ${(e as Error).message}`);
        continue;
      }
      if (p.captcha) {
        res.parou = "captcha";
        break;
      }
      if (!p.ok) continue;
      const page = parseProductPage(p.html);
      // Vendido pela Amazon na caixa de compra; a página não diz mais nada do envio, e a Amazon entrega o que vende.
      if (!page.vendidoPorAmazon || page.buyBox == null) continue;
      const nova = store.addSugestao({
        origemId: origem.id,
        asin: c.asin,
        titulo: page.titulo,
        formato: c.rotulo || null,
        formatoOrigem,
        certeza: certezaDe(c, formatoOrigem),
        preco: page.buyBox,
        vendedor: page.buyBoxVendedor,
        criadoEm: now,
      });
      if (nova) res.novas++;
    }
    if (res.parou) break;
  }
  store.setMeta(SCAN_LAST_KEY, JSON.stringify({ em: now, ...res }));
  d.log(`varredura: ${res.itens} itens, ${res.requisicoes} requisições, ${res.novas} sugestões${res.parou ? `, parou: ${res.parou}` : ""}`);
  return res;
}
