import { timingSafeEqual } from "node:crypto";
import type { Actions } from "./actions.ts";
import { productUrl } from "./amazon/fetch.ts";
import type { Product, Store } from "./db.ts";
import { parseUserNumber } from "./numbers.ts";
import { buildView } from "./view.ts";
import type { PanelDeps } from "./panel.ts";
import { panelSelo } from "./panel.ts";

/**
 * API do userscript (/api/us/*). Fica fora da senha do painel (o Caddy deixa só este caminho passar),
 * então tem proteção própria: token dedicado (USERSCRIPT_TOKEN, diferente do PANEL_TOKEN do selo),
 * só 3 operações (ver item, definir alvo, rastrear), cabeçalho + JSON obrigatórios nas escritas,
 * nenhum cabeçalho CORS (páginas web comuns não conseguem chamar; o Tampermonkey usa GM_xmlhttpRequest)
 * e limites de tentativas erradas e de escritas.
 */

const MAX_ALVO = 1_000_000;
const MAX_BODY = 1024;

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra } });

/** Janela deslizante simples em memória: no máximo `max` eventos em `windowMs`. */
export class RateLimit {
  private hits: number[] = [];
  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}
  /** Quanto falta (ms) para liberar; 0 = livre. Não registra. */
  wait(now: number): number {
    this.hits = this.hits.filter((t) => now - t < this.windowMs);
    return this.hits.length >= this.max ? this.windowMs - (now - this.hits[0]!) : 0;
  }
  hit(now: number): void {
    this.hits.push(now);
  }
}

function tokenOk(given: string | null, expected: string): boolean {
  const a = Buffer.from(given ?? "");
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function alvoOf(v: unknown): number | null | undefined {
  if (v === null) return null;
  const n = typeof v === "number" ? (Number.isFinite(v) && v > 0 ? v : null) : typeof v === "string" && v.length <= 20 ? parseUserNumber(v) : null;
  if (n == null || n > MAX_ALVO) return undefined;
  return Math.round(n * 100) / 100;
}

/** Resumo do selo + o que o painel mostra no item: preços por linha, alvo, estrela, grupo, última coleta. */
export function userscriptItem(store: Store, p: Product, now: Date, escrita: boolean) {
  const v = buildView(store, p, now);
  const g = p.grupoId != null ? store.getGrupo(p.grupoId) : null;
  return {
    ...panelSelo(store, p, now),
    num: v.num,
    asin: p.asin,
    titulo: p.titulo,
    url: productUrl(p.asin),
    pausado: p.pausado,
    estrela: p.estrela,
    grupo: g ? { id: g.id, nome: g.nome } : null,
    linhas: v.linhas,
    alvo: v.alvo,
    menor: v.menor,
    menorLinha: v.menorLinha,
    ultimaColeta: store.getUltimaColeta(p.id),
    edicao: escrita,
  };
}

export function userscriptHandler(d: PanelDeps, act: Actions | null): (req: Request) => Promise<Response> {
  const tokenErrado = new RateLimit(10, 60_000);
  const escritas = new RateLimit(30, 60_000);
  const cadastros = new RateLimit(10, 10 * 60_000);

  return async (req) => {
    const token = d.usToken;
    if (!token) return json({ erro: "não encontrado" }, 404);
    const now = Date.now();
    const espera = tokenErrado.wait(now);
    if (espera > 0) return json({ erro: "muitas tentativas" }, 429, { "retry-after": String(Math.ceil(espera / 1000)) });
    if (!tokenOk(req.headers.get("x-us-token"), token)) {
      tokenErrado.hit(now);
      return json({ erro: "não autorizado" }, 401);
    }
    const m = /^\/api\/us\/([A-Z0-9]{10})(?:\/(alvo|rastrear))?$/.exec(new URL(req.url).pathname);
    if (!m) return json({ erro: "não encontrado" }, 404);
    const [, asin, sub] = m as unknown as [string, string, "alvo" | "rastrear" | undefined];
    const p = d.store.getByAsin(asin);

    if (req.method === "GET" && !sub) return p ? json(userscriptItem(d.store, p, d.now(), act != null)) : json({ rastreado: false, edicao: act != null }, 404);

    if (!act) return json({ erro: "painel em somente leitura" }, 405);
    if (!sub || !((sub === "alvo" && req.method === "PUT") || (sub === "rastrear" && req.method === "POST"))) return json({ erro: "método não permitido" }, 405);
    if (req.headers.get("x-us") !== "1") return json({ erro: "cabeçalho ausente" }, 403);
    if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return json({ erro: "use application/json" }, 415);
    const lim = sub === "rastrear" ? cadastros : escritas;
    const w = lim.wait(now);
    if (w > 0) return json({ erro: "muitas operações, tente em instantes" }, 429, { "retry-after": String(Math.ceil(w / 1000)) });
    lim.hit(now);

    let body: Record<string, unknown> = {};
    const raw = await req.text();
    if (raw.length > MAX_BODY) return json({ erro: "corpo grande demais" }, 413);
    try {
      const b = raw ? JSON.parse(raw) : {};
      if (b == null || typeof b !== "object" || Array.isArray(b)) throw new Error();
      body = b as Record<string, unknown>;
    } catch {
      return json({ erro: "JSON inválido" }, 400);
    }

    if (sub === "rastrear") {
      if (p) return json({ erro: "Esse item já está rastreado." }, 409);
      const r = await act.addLink(`https://www.amazon.com.br/dp/${asin}`);
      if (!r.ok) return json({ erro: r.erro === "leitura" ? "Não consegui ler a página agora. Nada foi cadastrado." : "Link inválido." }, r.erro === "leitura" ? 502 : 400);
      return json(userscriptItem(d.store, r.product, d.now(), true));
    }

    if (!p) return json({ erro: "não encontrado" }, 404);
    const valor = alvoOf(body["valor"]);
    if (valor === undefined) return json({ erro: `valor deve ser um preço entre 0,01 e ${MAX_ALVO}` }, 400);
    const r = act.setAlvo(p, valor);
    return json({ ...userscriptItem(d.store, d.store.getById(p.id)!, d.now(), true), dentroDoAlvo: r.dentro });
  };
}
