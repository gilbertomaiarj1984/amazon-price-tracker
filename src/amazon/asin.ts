const ASIN_RE =
  /(?:\/dp\/|\/gp\/product\/|\/gp\/aw\/d\/|\/exec\/obidos\/ASIN\/|[?&]asin=)([A-Z0-9]{10})(?![A-Z0-9])/i;
const URL_RE = /https?:\/\/[^\s<>"']+/i;
const SHORT_HOSTS = new Set(["amzn.to", "a.co", "amzn.eu"]);
const MAX_HOPS = 5;

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export type AsinResult =
  | { ok: true; asin: string }
  | { ok: false; motivo: "sem_link" | "dominio_nao_suportado" | "asin_nao_encontrado" | "falha_ao_resolver" };

export function extractAsin(url: string): string | null {
  const m = ASIN_RE.exec(url);
  return m && m[1] ? m[1].toUpperCase() : null;
}

export function normalizeUrl(asin: string): string {
  return `https://www.amazon.com.br/dp/${asin}`;
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function isAmazonBrHost(host: string): boolean {
  return host === "amazon.com.br" || host.endsWith(".amazon.com.br");
}

/**
 * Acha o primeiro link do texto e devolve o ASIN. Links curtos (amzn.to, a.co)
 * são resolvidos por redirect, só entre hosts conhecidos, até 5 saltos.
 */
export async function resolveAsin(text: string, fetchFn: FetchFn = fetch): Promise<AsinResult> {
  const m = URL_RE.exec(text);
  if (!m) return { ok: false, motivo: "sem_link" };
  let url = m[0].replace(/[).,;]+$/, "");

  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    const host = hostOf(url);
    if (!host) return { ok: false, motivo: "sem_link" };
    if (isAmazonBrHost(host)) {
      const asin = extractAsin(url);
      return asin ? { ok: true, asin } : { ok: false, motivo: "asin_nao_encontrado" };
    }
    if (!SHORT_HOSTS.has(host)) return { ok: false, motivo: "dominio_nao_suportado" };
    try {
      const res = await fetchFn(url, { redirect: "manual", method: "GET" });
      const loc = res.headers.get("location");
      if (!loc) return { ok: false, motivo: "falha_ao_resolver" };
      url = new URL(loc, url).toString();
    } catch {
      return { ok: false, motivo: "falha_ao_resolver" };
    }
  }
  return { ok: false, motivo: "falha_ao_resolver" };
}
