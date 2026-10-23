import { normalizeUrl } from "./asin.ts";
import type { FetchFn } from "./asin.ts";

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
];

export interface Fetched {
  status: number;
  html: string;
  ms: number;
}

export function pickUserAgent(i: number): string {
  return USER_AGENTS[i % USER_AGENTS.length]!;
}

export function productUrl(asin: string): string {
  return normalizeUrl(asin);
}

/** Endpoint ajax do painel "Todas as ofertas" (confirmado no VPS em 23/10/2026). */
export function offersUrl(asin: string): string {
  return (
    `https://www.amazon.com.br/gp/product/ajax/aodAjaxMain/ref=dp_aod_ALL_mbc?asin=${asin}` +
    `&m=&qid=&smid=&sourcecustomerorglistid=&sourcecustomerorglistitemid=&sr=&pc=dp&experienceId=aodAjaxMain`
  );
}

export async function fetchHtml(
  url: string,
  opts: { ua: string; referer?: string; ajax?: boolean; timeoutMs?: number; fetchFn?: FetchFn },
): Promise<Fetched> {
  const fetchFn = opts.fetchFn ?? fetch;
  const headers: Record<string, string> = {
    "user-agent": opts.ua,
    "accept-language": "pt-BR,pt;q=0.9,en;q=0.6",
    accept: opts.ajax
      ? "text/html,*/*;q=0.8"
      : "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "upgrade-insecure-requests": "1",
  };
  if (opts.referer) headers["referer"] = opts.referer;
  if (opts.ajax) headers["x-requested-with"] = "XMLHttpRequest";
  const t0 = Date.now();
  const res = await fetchFn(url, {
    headers,
    redirect: "follow",
    signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000),
  });
  const html = await res.text();
  return { status: res.status, html, ms: Date.now() - t0 };
}

/** Pausa entre requisições: base + jitter, em ms. */
export function jitterMs(minMs = 2000, maxMs = 5000, rand: () => number = Math.random): number {
  return Math.round(minMs + rand() * (maxMs - minMs));
}
