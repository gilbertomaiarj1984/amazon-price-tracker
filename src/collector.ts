import { evaluate, evaluateAlvo, FAILURE_THRESHOLD, shouldAlertFailures } from "./alerts.ts";
import type { AlertEvent, Candidato } from "./alerts.ts";
import { fetchHtml, offersUrl, pickUserAgent, productUrl } from "./amazon/fetch.ts";
import type { Fetched } from "./amazon/fetch.ts";
import { detectBlock, parseOffersPanel, parseProductPage } from "./amazon/parse.ts";
import type { Product, Store } from "./db.ts";
import { deriveLines } from "./lines.ts";
import type { Fallback } from "./lines.ts";
import { LINE_KEYS } from "./types.ts";
import type { BlockKind, LineKey, LinePoint, Offer, ProductPage } from "./types.ts";

export interface CollectDeps {
  fetchHtml: (url: string, opts: { ua: string; referer?: string; ajax?: boolean }) => Promise<Fetched>;
  now: () => Date;
  sleep: (ms: number) => Promise<void>;
  /** Pausa entre a página e o painel de ofertas. */
  delayMs: () => number;
}

export const realDeps = (delayMs: () => number): CollectDeps => ({
  fetchHtml: (url, opts) => fetchHtml(url, opts),
  now: () => new Date(),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  delayMs,
});

export interface AlertItem {
  product: Product;
  evento: AlertEvent;
  vendedor: string | null;
  /** O preço do evento é do melhor terceiro, porque a Amazon não vende agora. */
  terceiro?: { envio: "amazon" | "terceiro" | null };
}

export type CollectOutcome =
  | { ok: true; page: ProductPage; points: Partial<Record<LineKey, LinePoint>>; alertas: AlertItem[]; descartadas: number; painel: boolean }
  | { ok: false; kind: BlockKind; falhasProduto: number; avisarProduto: boolean };

/**
 * O painel só é buscado quando precisa: linhas extras ligadas, ou quando a caixa de compra não é da Amazon.
 * A Amazon pode vender fora da caixa de compra (ex.: Amazon Global a R$ 404 enquanto a caixa mostra um terceiro a R$ 469),
 * e a página nem sempre mostra a contagem de outras opções, então a contagem não decide: sem caixa da Amazon, busca.
 */
export function needsPanel(p: Product, page: ProductPage): boolean {
  const global = /global/i.test(page.buyBoxVendedor ?? "");
  return p.terceirosOn || p.usadoOn || !page.vendidoPorAmazon || global;
}

let uaCounter = 0;

/** Uma coleta de um produto: página, painel se preciso, linhas, alertas, gravação. Em falha, não grava preço. */
export async function collectOne(store: Store, product: Product, deps: CollectDeps): Promise<CollectOutcome> {
  try {
    return await collectInner(store, product, deps);
  } catch (e) {
    store.setUltimaColeta(product.id, { em: deps.now().toISOString(), ok: false, motivo: "erro_rede" });
    throw e;
  }
}

async function collectInner(store: Store, product: Product, deps: CollectDeps): Promise<CollectOutcome> {
  const ua = pickUserAgent(uaCounter++);
  const page = await deps.fetchHtml(productUrl(product.asin), { ua });
  const kind = detectBlock(page.html, page.status, "product");
  if (kind !== "ok") return failed(store, product, kind);

  const parsed = parseProductPage(page.html);
  let offers: Offer[] = [];
  let painel = false;
  if (needsPanel(product, parsed)) {
    await deps.sleep(deps.delayMs());
    const panel = await deps.fetchHtml(offersUrl(product.asin), { ua, referer: productUrl(product.asin), ajax: true });
    const pk = detectBlock(panel.html, panel.status, "offers");
    if (pk !== "ok") return failed(store, product, pk);
    offers = parseOffersPanel(panel.html);
    painel = true;
  }

  const fresh = store.getById(product.id) ?? product;
  const { points, descartadas, fallback } = deriveLines(parsed, offers, { terceiros: fresh.terceirosOn, usado: fresh.usadoOn });
  const at = deps.now().toISOString();
  const enabled = LINE_KEYS.filter((k) => k === "amazon" || (k === "terceiros" ? fresh.terceirosOn : fresh.usadoOn));

  const alertas: AlertItem[] = [];
  const candidatos: Candidato[] = [];
  const pontos = {} as Partial<Record<LineKey, { preco: number; vendedor: string | null; fb: Fallback | null }>>;
  const nextStates = enabled.map((linha) => {
    // Sem Amazon, o alvo da linha Amazon vale para o melhor terceiro, e o alerta diz que ele é de terceiro.
    const fb = linha === "amazon" ? fallback : null;
    const ponto = fb ? { linha, preco: fb.preco, vendedor: fb.vendedor } : (points[linha] ?? null);
    const minimoAnterior = store.minBefore(fresh.id, fb ? "terceiros" : linha, at);
    if (ponto) {
      candidatos.push({ linha, preco: ponto.preco, minimoAnterior });
      pontos[linha] = { preco: ponto.preco, vendedor: ponto.vendedor, fb };
    }
    const r = evaluate({
      linha,
      preco: ponto?.preco ?? null,
      minimoAnterior,
      avisarNovoMinimo: !fb,
      prev: store.getAlertState(fresh.id, linha),
    });
    // "Voltou a vender" é só da Amazon de verdade: com fallback a linha continua indisponível.
    const eventos = fb ? r.eventos.filter((e) => e.tipo !== "voltou") : r.eventos;
    if (fb) r.next.disponivel = false;
    for (const evento of eventos) alertas.push({ product: fresh, evento, vendedor: ponto?.vendedor ?? null, ...(fb ? { terceiro: { envio: fb.envio } } : {}) });
    return { linha, next: r.next };
  });

  // A caixa de compra de um terceiro é o preço que o comprador vê: conta para o alvo mesmo com a linha Terceiros desligada.
  if (!fallback && !fresh.terceirosOn && parsed.buyBox != null && !parsed.vendidoPorAmazon) {
    const vendedor = parsed.buyBoxVendedor ?? "Desconhecido";
    candidatos.push({ linha: "terceiros", preco: parsed.buyBox, minimoAnterior: store.minBefore(fresh.id, "terceiros", at) });
    pontos.terceiros = { preco: parsed.buyBox, vendedor, fb: null };
  }

  // Alvo único: vale para a menor oferta entre as fontes. O aviso de alvo substitui o de novo mínimo da mesma linha.
  const amazonState = nextStates.find((s) => s.linha === "amazon")!;
  const alvo = evaluateAlvo({ candidatos, alvo: store.getAlvo(fresh.id), ultimoAlertado: amazonState.next.ultimoAlertado });
  amazonState.next.ultimoAlertado = alvo.ultimoAlertado;
  if (alvo.evento) {
    const ponto = pontos[alvo.evento.linha]!;
    const i = alertas.findIndex((a) => a.evento.tipo === "novo_minimo" && a.evento.linha === alvo.evento!.linha);
    if (i >= 0) alertas.splice(i, 1);
    alertas.push({ product: fresh, evento: alvo.evento, vendedor: ponto.vendedor, ...(ponto.fb ? { terceiro: { envio: ponto.fb.envio } } : {}) });
  }

  store.saveSnapshot(fresh.id, at, [...offers.map((o) => ({ ...o })), ...descartadas.map((o) => ({ ...o, descartada: true }))], points);
  store.setFallback(fresh.id, fallback);
  for (const s of nextStates) store.setAlertState(fresh.id, s.linha, s.next);
  if (parsed.titulo && parsed.titulo !== fresh.titulo) store.setTitulo(fresh.id, parsed.titulo);
  if (parsed.imagem && parsed.imagem !== fresh.imagem) store.setImagem(fresh.id, parsed.imagem);
  store.resetFailures(fresh.id);
  store.setUltimaColeta(fresh.id, { em: at, ok: true, vendedor: parsed.buyBoxVendedor, buyBox: parsed.buyBox });
  return { ok: true, page: parsed, points, alertas, descartadas: descartadas.length, painel };
}

function failed(store: Store, product: Product, kind: BlockKind): CollectOutcome {
  const n = store.recordFailure(product.id);
  store.setUltimaColeta(product.id, { em: new Date().toISOString(), ok: false, motivo: kind });
  // Um produto isolado falhando por muito tempo costuma ser link morto ou layout novo: avisa na 6ª e depois a cada 12.
  return { ok: false, kind, falhasProduto: n, avisarProduto: shouldAlertFailures(n, FAILURE_THRESHOLD * 2) };
}
