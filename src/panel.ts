import type { Product, Store } from "./db.ts";
import { PANEL_HTML } from "./panel-page.ts";
import { DAY_MS, buildView } from "./view.ts";
import { LINE_KEYS } from "./types.ts";
import type { LineKey } from "./types.ts";

export const PANEL_DAYS = [7, 14, 30] as const;

export interface Gap {
  de: string;
  ate: string;
}

export interface PanelItem {
  num: number;
  asin: string;
  titulo: string | null;
  pausado: boolean;
  falhasSeguidas: number;
  linhas: ReturnType<typeof buildView>["linhas"];
  /** Preço da Amazon (ou da linha mais barata ligada) nos últimos 7 dias, para o mini-gráfico. */
  mini: Array<{ t: string; v: number }>;
}

export interface PanelHealth {
  agora: string;
  ultimaRodada: string | null;
  intervaloMin: number;
  itens: number;
  pausados: number;
  comFalhas: number;
  rodadasFalhasSeguidas: number;
  status: "ok" | "atrasado" | "sem_rodada" | "falhando";
}

const iso = (ms: number) => new Date(ms).toISOString();

export function panelHealth(store: Store, now: Date, intervaloMin: number): PanelHealth {
  const list = store.list();
  const last = Number(store.getMeta("last_cycle_at") ?? 0);
  const falhas = Number(store.getMeta("cycle_fails") ?? 0);
  let status: PanelHealth["status"] = "ok";
  if (!last) status = "sem_rodada";
  else if (now.getTime() - last > intervaloMin * 60_000 * 2.5) status = "atrasado";
  if (falhas > 0) status = "falhando";
  return {
    agora: now.toISOString(),
    ultimaRodada: last ? iso(last) : null,
    intervaloMin,
    itens: list.length,
    pausados: list.filter((p) => p.pausado).length,
    comFalhas: list.filter((p) => p.falhasSeguidas > 0).length,
    rodadasFalhasSeguidas: falhas,
    status,
  };
}

export function panelItems(store: Store, now: Date): PanelItem[] {
  const desde = iso(now.getTime() - 7 * DAY_MS);
  return store.list().map((p) => {
    const v = buildView(store, p, now);
    const rows = store.db
      .query(
        "SELECT coletado_em AS t, preco AS v FROM price_lines WHERE product_id = ? AND linha = ? AND coletado_em >= ? ORDER BY coletado_em",
      )
      .all(p.id, v.linhas.amazon.atual != null || v.linhas.amazon.coletas > 0 ? "amazon" : "terceiros", desde) as PanelItem["mini"];
    return { num: v.num, asin: p.asin, titulo: p.titulo, pausado: p.pausado, falhasSeguidas: p.falhasSeguidas, linhas: v.linhas, mini: rows };
  });
}

/** Momentos em que houve coleta, de qualquer tipo. */
function collectionTimes(store: Store, id: number, desde: string): string[] {
  const rows = store.db
    .query(
      `SELECT coletado_em AS t FROM offers WHERE product_id = ?1 AND coletado_em >= ?2
       UNION SELECT coletado_em FROM price_lines WHERE product_id = ?1 AND coletado_em >= ?2 ORDER BY t`,
    )
    .all(id, desde) as Array<{ t: string }>;
  return rows.map((r) => r.t);
}

/** Faixas em que houve coleta mas a Amazon não vendia. Um buraco só vira faixa entre duas coletas sem a Amazon. */
export function amazonGaps(collections: string[], amazonTimes: Set<string>): Gap[] {
  const gaps: Gap[] = [];
  let start: string | null = null;
  let prev: string | null = null;
  for (const t of collections) {
    if (amazonTimes.has(t)) {
      if (start && prev) gaps.push({ de: start, ate: t });
      start = null;
    } else if (!start) start = prev ?? t;
    prev = t;
  }
  if (start && prev) gaps.push({ de: start, ate: prev });
  return gaps;
}

export function panelDetail(store: Store, p: Product, now: Date, days: number) {
  const desde = iso(now.getTime() - days * DAY_MS);
  const series = {} as Record<LineKey, Array<{ t: string; v: number }>>;
  for (const l of LINE_KEYS) {
    series[l] = store.db
      .query("SELECT coletado_em AS t, preco AS v FROM price_lines WHERE product_id = ? AND linha = ? AND coletado_em >= ? ORDER BY coletado_em")
      .all(p.id, l, desde) as Array<{ t: string; v: number }>;
  }
  const semAmazon = amazonGaps(collectionTimes(store, p.id, desde), new Set(series.amazon.map((x) => x.t)));
  const lastAt = (store.db.query("SELECT MAX(coletado_em) AS t FROM offers WHERE product_id = ?").get(p.id) as { t: string | null }).t;
  const ofertas = lastAt
    ? store.db
        .query("SELECT vendedor, condicao, preco, frete, envio, descartada FROM offers WHERE product_id = ? AND coletado_em = ? ORDER BY descartada, preco + COALESCE(frete, 0)")
        .all(p.id, lastAt)
    : [];
  const view = buildView(store, p, now);
  return {
    num: view.num,
    asin: p.asin,
    titulo: p.titulo,
    pausado: p.pausado,
    dias: days,
    desde,
    linhas: view.linhas,
    series,
    semAmazon,
    ofertasEm: lastAt,
    ofertas,
  };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

const SECURITY = {
  "content-security-policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
};

export interface PanelDeps {
  store: Store;
  now: () => Date;
  intervalMin: number;
}

/** Painel somente leitura: só GET, nenhum dado de configuração (token, chat) passa por aqui. */
export function panelHandler(d: PanelDeps): (req: Request) => Response {
  return (req) => {
    if (req.method !== "GET" && req.method !== "HEAD") return json({ erro: "método não permitido" }, 405);
    const url = new URL(req.url);
    const path = url.pathname;
    let res: Response;
    if (path === "/") res = new Response(PANEL_HTML, { headers: { "content-type": "text/html; charset=utf-8" } });
    else if (path === "/api/itens") res = json({ saude: panelHealth(d.store, d.now(), d.intervalMin), itens: panelItems(d.store, d.now()) });
    else if (path === "/api/saude") res = json(panelHealth(d.store, d.now(), d.intervalMin));
    else {
      const m = /^\/api\/itens\/([A-Z0-9]{10})$/.exec(path);
      const p = m ? d.store.getByAsin(m[1]!) : null;
      if (!p) res = json({ erro: "não encontrado" }, 404);
      else {
        const days = Number(url.searchParams.get("dias") ?? 14);
        res = (PANEL_DAYS as readonly number[]).includes(days) ? json(panelDetail(d.store, p, d.now(), days)) : json({ erro: "dias deve ser 7, 14 ou 30" }, 400);
      }
    }
    for (const [k, v] of Object.entries(SECURITY)) res.headers.set(k, v);
    return res;
  };
}
