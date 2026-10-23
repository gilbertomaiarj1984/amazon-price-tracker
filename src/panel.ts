import { IMAGE_HOST_RE } from "./amazon/parse.ts";
import { parseKeepaList, MAX_IMPORT } from "./keepa.ts";
import { Actions, MAX_BATCH, consultaLiberadaEm, RESOLVE_ERRORS, extractLinks, mutedUntil } from "./actions.ts";
import type { ActionDeps } from "./actions.ts";
import { productUrl } from "./amazon/fetch.ts";
import type { Grupo, Product, Store, UltimaColeta } from "./db.ts";
import { parseUserNumber } from "./numbers.ts";
import { PANEL_HTML } from "./panel-page.ts";
import { DAY_MS, buildView } from "./view.ts";
import { timingSafeEqual } from "node:crypto";
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
  silenciadoAte: string | null;
  url: string;
  imagem: string | null;
  criadoEm: string;
  grupoId: number | null;
  linhas: ReturnType<typeof buildView>["linhas"];
  /** Última leitura da Amazon (null = nunca lido): separa "aguardando", "sem oferta confirmado" e "erro". */
  ultimaColeta: UltimaColeta | null;
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
    return { num: v.num, asin: p.asin, titulo: p.titulo, pausado: p.pausado, falhasSeguidas: p.falhasSeguidas, silenciadoAte: mutedUntil(store, p.id, now), url: productUrl(p.asin), imagem: p.imagem && IMAGE_HOST_RE.test(p.imagem) ? p.imagem : null, criadoEm: p.criadoEm, grupoId: p.grupoId, linhas: v.linhas, ultimaColeta: store.getUltimaColeta(p.id), mini: rows };
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
    silenciadoAte: mutedUntil(store, p.id, now),
    consultaLiberadaEm: consultaLiberadaEm(store, p.id, now),
    url: productUrl(p.asin),
    dias: days,
    desde,
    linhas: view.linhas,
    series,
    semAmazon,
    ofertasEm: lastAt,
    ofertas,
  };
}

export const MAX_GRUPOS = 100;
export const MAX_NOME_GRUPO = 60;

/** Linha que representa o item na comparação: Amazon se já houve coleta dela, senão Terceiros. */
const linhaPrincipal = (v: ReturnType<typeof buildView>): LineKey => (v.linhas.amazon.coletas > 0 && !v.linhas.terceiros.automatico ? "amazon" : "terceiros");

/** Itens do grupo lado a lado: preço atual, alvo e histórico de cada um. `menorAsin` é o item mais barato agora. */
export function panelGrupo(store: Store, g: Grupo, now: Date, days: number) {
  const desde = iso(now.getTime() - days * DAY_MS);
  const itens = store
    .list()
    .filter((p) => p.grupoId === g.id)
    .map((p) => {
      const v = buildView(store, p, now);
      const linha = linhaPrincipal(v);
      // Com a Amazon sem oferta, o preço é o do melhor terceiro (linha Terceiros) e o alvo continua sendo o da linha Amazon.
      const l = v.linhas.terceiros.automatico ? { ...v.linhas.terceiros, alvo: v.linhas.amazon.alvo } : v.linhas[linha];
      const serie = store.db
        .query("SELECT coletado_em AS t, preco AS v FROM price_lines WHERE product_id = ? AND linha = ? AND coletado_em >= ? ORDER BY coletado_em")
        .all(p.id, linha, desde) as Array<{ t: string; v: number }>;
      return {
        num: v.num,
        asin: p.asin,
        titulo: p.titulo,
        imagem: p.imagem && IMAGE_HOST_RE.test(p.imagem) ? p.imagem : null,
        url: productUrl(p.asin),
        pausado: p.pausado,
        linha,
        atual: l.atual,
        vendedor: l.vendedor,
        alvo: l.alvo,
        min: l.min,
        max: l.max,
        serie,
      };
    });
  let menorAsin: string | null = null;
  let menor = Infinity;
  for (const i of itens) if (i.atual != null && i.atual < menor) ((menor = i.atual), (menorAsin = i.asin));
  return { id: g.id, nome: g.nome, dias: days, desde, itens, menorAsin, menorPreco: menorAsin ? menor : null };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

const SECURITY = {
  "content-security-policy": "default-src 'none'; img-src https://m.media-amazon.com https://images-na.ssl-images-amazon.com; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
};

export type Veredito = "minimo" | "bom" | "acima" | "sem_dados";

export interface Selo {
  rastreado: true;
  linha: LineKey;
  atual: number | null;
  min: number | null;
  max: number | null;
  media: number | null;
  coletas: number;
  veredito: Veredito;
  atualizadoEm: string | null;
  /** Pontos dos últimos 30 dias para o gráfico do userscript (no máximo SERIE_MAX). */
  serie: Array<{ t: string; v: number }>;
}

const SERIE_MAX = 120;

/** Reduz a série a no máximo `max` pontos, mantendo o primeiro e o último. */
export function downsample<T>(rows: T[], max: number): T[] {
  if (rows.length <= max) return rows;
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(rows[Math.round((i * (rows.length - 1)) / (max - 1))]!);
  return out;
}

/** Dados mínimos para o selo do userscript: nada de ofertas, vendedores, alvos ou configuração. */
export function panelSelo(store: Store, p: Product, now: Date): Selo {
  const v = buildView(store, p, now);
  const linha: LineKey = v.linhas.amazon.coletas > 0 && !v.linhas.terceiros.automatico ? "amazon" : "terceiros";
  const l = v.linhas[linha];
  const desde = iso(now.getTime() - 30 * DAY_MS);
  const avg = store.db
    .query("SELECT AVG(preco) AS m, MAX(coletado_em) AS t FROM price_lines WHERE product_id = ? AND linha = ? AND coletado_em >= ?")
    .get(p.id, linha, desde) as { m: number | null; t: string | null };
  const media = avg.m == null ? null : Math.round(avg.m * 100) / 100;
  let veredito: Veredito = "sem_dados";
  if (l.atual != null && l.min != null && media != null && l.coletas >= 3) {
    veredito = l.atual <= l.min * 1.02 ? "minimo" : l.atual <= media ? "bom" : "acima";
  }
  const rows = store.db
    .query("SELECT coletado_em AS t, preco AS v FROM price_lines WHERE product_id = ? AND linha = ? AND coletado_em >= ? ORDER BY coletado_em")
    .all(p.id, linha, desde) as Array<{ t: string; v: number }>;
  return { rastreado: true, linha, atual: l.atual, min: l.min, max: l.max, media, coletas: l.coletas, veredito, atualizadoEm: avg.t, serie: downsample(rows, SERIE_MAX) };
}

/** Sugestões pendentes da varredura diária, com o item de origem. */
export function panelSugestoes(store: Store) {
  return store.listSugestoes().flatMap((s) => {
    const o = store.getById(s.origemId);
    return o
      ? [{ id: s.id, asin: s.asin, titulo: s.titulo, formato: s.formato, formatoOrigem: s.formatoOrigem, certeza: s.certeza, preco: s.preco, vendedor: s.vendedor, criadoEm: s.criadoEm, origem: { asin: o.asin, titulo: o.titulo, num: store.numberOf(o.id) } }]
      : [];
  });
}

function tokenOk(given: string | null, expected: string): boolean {
  const a = Buffer.from(given ?? "");
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface PanelDeps extends Partial<Pick<ActionDeps, "collect" | "resolve">> {
  /** Token do endpoint /api/selo; sem ele a rota responde 404. */
  token?: string | null;
  store: Store;
  now: () => Date;
  intervalMin: number;
  /** Sem `collect` e `resolve` (ou com `somenteLeitura`), o painel só aceita GET. */
  somenteLeitura?: boolean;
}

export const MAX_BODY = 8 * 1024;
const MAX_ALVO = 1_000_000;

class HttpError extends Error {
  constructor(
    readonly status: number,
    msg: string,
  ) {
    super(msg);
  }
}

/** Defesa contra CSRF: só aceita escrita feita pela própria página (mesma origem, JSON, cabeçalho próprio). */
function checkSameOrigin(req: Request, url: URL): void {
  const origin = req.headers.get("origin");
  let ok = false;
  try {
    ok = origin != null && new URL(origin).host === url.host;
  } catch {
    ok = false;
  }
  const site = req.headers.get("sec-fetch-site");
  if (!ok || (site != null && site !== "same-origin")) throw new HttpError(403, "origem não permitida");
  if (req.headers.get("x-painel") !== "1") throw new HttpError(403, "cabeçalho ausente");
  if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) throw new HttpError(415, "use application/json");
}

async function readBody(req: Request): Promise<Record<string, unknown>> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_BODY) throw new HttpError(413, "corpo grande demais");
  const raw = await req.text();
  if (raw.length > MAX_BODY) throw new HttpError(413, "corpo grande demais");
  let body: unknown;
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    throw new HttpError(400, "JSON inválido");
  }
  if (body == null || typeof body !== "object" || Array.isArray(body)) throw new HttpError(400, "corpo deve ser um objeto JSON");
  return body as Record<string, unknown>;
}

const bool = (v: unknown, nome: string): boolean => {
  if (typeof v !== "boolean") throw new HttpError(400, `${nome} deve ser true ou false`);
  return v;
};

const lineOf = (v: unknown, aceita: readonly LineKey[]): LineKey => {
  if (typeof v !== "string" || !(aceita as readonly string[]).includes(v)) throw new HttpError(400, `linha deve ser: ${aceita.join(", ")}`);
  return v as LineKey;
};

function alvoOf(v: unknown): number | null {
  if (v === null) return null;
  const n = typeof v === "number" ? (Number.isFinite(v) && v > 0 ? v : null) : typeof v === "string" && v.length <= 20 ? parseUserNumber(v) : null;
  if (n == null || n > MAX_ALVO) throw new HttpError(400, `valor deve ser um preço entre 0,01 e ${MAX_ALVO}`);
  return Math.round(n * 100) / 100;
}

function nomeGrupoOf(v: unknown): string {
  const n = typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
  if (!n || n.length > MAX_NOME_GRUPO) throw new HttpError(400, `nome do grupo deve ter de 1 a ${MAX_NOME_GRUPO} caracteres`);
  return n;
}

/** Rotas de escrita sobre grupos. Apagar um grupo não apaga os itens. */
async function grupoWrite(d: PanelDeps, method: string, id: number | null, req: Request): Promise<Response> {
  const now = d.now();
  if (id == null) {
    if (method !== "POST") return json({ erro: "método não permitido" }, 405);
    const nome = nomeGrupoOf((await readBody(req))["nome"]);
    if (d.store.listGrupos().length >= MAX_GRUPOS) throw new HttpError(409, `limite de ${MAX_GRUPOS} grupos`);
    const g = d.store.addGrupo(nome, now.toISOString());
    if (!g) throw new HttpError(409, "já existe um grupo com esse nome");
    return json({ id: g.id, nome: g.nome });
  }
  const g = d.store.getGrupo(id);
  if (!g) return json({ erro: "não encontrado" }, 404);
  if (method === "DELETE") {
    d.store.removeGrupo(id);
    return json({ removido: true });
  }
  if (method !== "PUT") return json({ erro: "método não permitido" }, 405);
  const nome = nomeGrupoOf((await readBody(req))["nome"]);
  if (!d.store.renameGrupo(id, nome)) throw new HttpError(409, "já existe um grupo com esse nome");
  return json({ id, nome });
}

export interface AddItemResult {
  link: string;
  status: "novo" | "existente" | "erro";
  erro?: string;
  item?: { asin: string; titulo: string | null; num: number; amazonAtual: number | null };
}

async function addItems(store: Store, act: Actions, now: Date, body: Record<string, unknown>): Promise<{ resultados: AddItemResult[]; ignorados: number }> {
  if (typeof body["texto"] !== "string" || body["texto"].length > 4000) throw new HttpError(400, "texto deve ser uma string de até 4000 caracteres com links");
  const all = extractLinks(body["texto"]);
  if (!all.length) throw new HttpError(400, RESOLVE_ERRORS["sem_link"]!);
  const resultados: AddItemResult[] = [];
  for (const link of all.slice(0, MAX_BATCH)) {
    const r = await act.addLink(link);
    const shown = link.slice(0, 80);
    if (r.ok || (!r.ok && r.erro === "existente")) {
      const p = r.ok ? r.product : (r as { product: Product }).product;
      const v = buildView(store, p, now);
      resultados.push({ link: shown, status: r.ok ? "novo" : "existente", item: { asin: p.asin, titulo: p.titulo, num: v.num, amazonAtual: v.linhas.amazon.atual } });
    } else if (r.erro === "link") resultados.push({ link: shown, status: "erro", erro: RESOLVE_ERRORS[r.motivo] ?? "link inválido" });
    else resultados.push({ link: shown, status: "erro", erro: `Não consegui ler a página agora${r.detalhe ? ` (${r.detalhe})` : ""}. Nada foi cadastrado.` });
  }
  return { resultados, ignorados: Math.max(0, all.length - MAX_BATCH) };
}

export interface ImportResult {
  importados: number;
  duplicados: number;
  invalidos: number;
  outrosPaises: number;
  acimaDoLimite: number;
}

/** Importa ASINs (export do Keepa) sem ler a Amazon: o item entra sem alvo e a coleta fica para as próximas rodadas. */
function importItems(store: Store, now: Date, body: Record<string, unknown>): ImportResult {
  if (typeof body["texto"] !== "string" || body["texto"].length > 6000) throw new HttpError(400, "arquivo grande demais (até 6000 caracteres, cerca de 500 ASINs)");
  const p = parseKeepaList(body["texto"]);
  if (!p.asins.length) throw new HttpError(400, "Não achei nenhum ASIN nesse arquivo.");
  let importados = 0;
  let duplicados = p.duplicadosNoArquivo;
  const usados = p.asins.slice(0, Math.max(0, MAX_IMPORT));
  for (const asin of usados) {
    if (store.getByAsin(asin)) duplicados++;
    else {
      store.addProduct(asin, null, now.toISOString());
      importados++;
    }
  }
  return { importados, duplicados, invalidos: p.invalidos, outrosPaises: p.outrosPaises, acimaDoLimite: p.asins.length - usados.length };
}

/** Rotas de escrita sobre um item (por ASIN). Devolvem o detalhe atualizado. */
async function itemWrite(d: PanelDeps, act: Actions, method: string, p: Product, sub: string | undefined, req: Request): Promise<Response> {
  const now = d.now();
  const detail = () => json(panelDetail(d.store, d.store.getById(p.id)!, now, 14));
  if (method === "DELETE" && !sub) {
    act.remove(p);
    return json({ removido: true });
  }
  if (method === "POST" && sub === "consultar") {
    const r = await act.consultar(p);
    if (!r.ok && r.erro === "espera") return json({ erro: "Esse item foi consultado há pouco. Tente de novo em alguns minutos.", liberadaEm: r.liberadaEm }, 429);
    const fresh = d.store.getById(p.id)!;
    return json({ ...panelDetail(d.store, fresh, d.now(), 14), consulta: r.ok ? "ok" : "falhou", detalhe: r.ok ? null : r.detalhe });
  }
  if (method !== "PUT") return json({ erro: "método não permitido" }, 405);
  const body = await readBody(req);
  switch (sub) {
    case "alvo": {
      const linha = lineOf(body["linha"], LINE_KEYS);
      const r = act.setAlvo(p, linha, alvoOf(body["valor"]));
      if (!r.ok) return json({ erro: "Essa linha está desligada. Ligue a linha antes de definir o alvo." }, 409);
      return json({ ...panelDetail(d.store, d.store.getById(p.id)!, now, 14), dentroDoAlvo: r.dentro });
    }
    case "pausa":
      act.setPausa(p, bool(body["pausado"], "pausado"));
      return detail();
    case "silencio":
      act.silenciar(p, bool(body["silenciado"], "silenciado"));
      return detail();
    case "grupo": {
      const gid = body["grupoId"];
      if (gid !== null && (typeof gid !== "number" || !Number.isInteger(gid) || !d.store.getGrupo(gid))) throw new HttpError(400, "grupo não encontrado");
      d.store.setGrupo(p.id, gid);
      return detail();
    }
    case "linhas": {
      const linha = lineOf(body["linha"], ["terceiros", "usado"]) as "terceiros" | "usado";
      const on = bool(body["ligada"], "ligada");
      act.setLinha(p, linha, on);
      const lida = on ? await act.collectNow(p) : null;
      return json({ ...panelDetail(d.store, d.store.getById(p.id)!, now, 14), leitura: lida ? (lida.ok ? "ok" : "falhou") : null });
    }
    default:
      return json({ erro: "não encontrado" }, 404);
  }
}

/** Painel: leitura por GET e, se `collect` e `resolve` existirem, as mesmas ações do bot por POST/PUT/DELETE. */
export function panelHandler(d: PanelDeps): (req: Request) => Promise<Response> {
  const act = d.collect && d.resolve && !d.somenteLeitura ? new Actions({ store: d.store, now: d.now, collect: d.collect, resolve: d.resolve }) : null;
  const read = (req: Request): Response => {
    const url = new URL(req.url);
    const path = url.pathname;
    if (path === "/") return new Response(PANEL_HTML, { headers: { "content-type": "text/html; charset=utf-8" } });
    if (path === "/api/itens") return json({ saude: panelHealth(d.store, d.now(), d.intervalMin), itens: panelItems(d.store, d.now()), grupos: d.store.listGrupos().map((g) => ({ id: g.id, nome: g.nome })), sugestoes: panelSugestoes(d.store), edicao: act != null });
    if (path.startsWith("/api/selo/")) {
      const m = /^\/api\/selo\/([A-Z0-9]{10})$/.exec(path);
      if (!d.token) return json({ erro: "não encontrado" }, 404);
      if (!tokenOk(req.headers.get("x-selo-token"), d.token)) return json({ erro: "não autorizado" }, 401);
      const p = m ? d.store.getByAsin(m[1]!) : null;
      return p ? json(panelSelo(d.store, p, d.now())) : json({ rastreado: false }, 404);
    }
    if (path === "/api/saude") return json(panelHealth(d.store, d.now(), d.intervalMin));
    const gm = /^\/api\/grupos\/(\d{1,9})$/.exec(path);
    if (gm) {
      const g = d.store.getGrupo(Number(gm[1]));
      const gd = Number(url.searchParams.get("dias") ?? 14);
      if (!g) return json({ erro: "não encontrado" }, 404);
      return (PANEL_DAYS as readonly number[]).includes(gd) ? json(panelGrupo(d.store, g, d.now(), gd)) : json({ erro: "dias deve ser 7, 14 ou 30" }, 400);
    }
    const m = /^\/api\/itens\/([A-Z0-9]{10})$/.exec(path);
    const p = m ? d.store.getByAsin(m[1]!) : null;
    if (!p) return json({ erro: "não encontrado" }, 404);
    const days = Number(url.searchParams.get("dias") ?? 14);
    return (PANEL_DAYS as readonly number[]).includes(days) ? json(panelDetail(d.store, p, d.now(), days)) : json({ erro: "dias deve ser 7, 14 ou 30" }, 400);
  };

  const write = async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    const path = url.pathname;
    // Só estas rotas escrevem. /api/selo/* e o token do selo nunca chegam aqui.
    const item = /^\/api\/itens\/([A-Z0-9]{10})(?:\/(alvo|pausa|silencio|linhas|consultar|grupo))?$/.exec(path);
    const grp = /^\/api\/grupos(?:\/(\d{1,9}))?$/.exec(path);
    const sug = /^\/api\/sugestoes\/(\d{1,9})\/(aceitar|recusar)$/.exec(path);
    if (!act || (path !== "/api/itens" && path !== "/api/importar" && !item && !grp && !sug)) return json({ erro: "método não permitido" }, 405);
    try {
      checkSameOrigin(req, url);
      if (sug) {
        if (req.method !== "POST") return json({ erro: "método não permitido" }, 405);
        const id = Number(sug[1]);
        if (sug[2] === "recusar") return act.recusarSugestao(id) ? json({ recusada: true }) : json({ erro: "Essa sugestão já foi tratada." }, 409);
        const r = await act.aceitarSugestao(id);
        if (!r.ok) return json({ erro: r.erro === "existente" ? "Esse item já está rastreado." : "Essa sugestão não está mais disponível." }, 409);
        return json({ aceita: true, asin: r.product.asin, alvoHerdado: r.alvoHerdado, leitura: r.leitura });
      }
      if (grp) return await grupoWrite(d, req.method, grp[1] ? Number(grp[1]) : null, req);
      if (path === "/api/importar") {
        if (req.method !== "POST") return json({ erro: "método não permitido" }, 405);
        return json(importItems(d.store, d.now(), await readBody(req)));
      }
      if (path === "/api/itens") {
        if (req.method !== "POST") return json({ erro: "método não permitido" }, 405);
        return json(await addItems(d.store, act, d.now(), await readBody(req)));
      }
      const p = d.store.getByAsin(item![1]!);
      if (!p) return json({ erro: "não encontrado" }, 404);
      return await itemWrite(d, act, req.method, p, item![2], req);
    } catch (e) {
      if (e instanceof HttpError) return json({ erro: e.message }, e.status);
      throw e;
    }
  };

  return async (req) => {
    const res = req.method === "GET" || req.method === "HEAD" ? read(req) : await write(req).catch(() => json({ erro: "erro interno" }, 500));
    for (const [k, v] of Object.entries(SECURITY)) res.headers.set(k, v);
    return res;
  };
}
