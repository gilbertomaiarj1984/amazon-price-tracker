import type { Product, Store } from "./db.ts";
import { LINE_KEYS } from "./types.ts";
import type { LineKey } from "./types.ts";

export const DAY_MS = 86_400_000;

export interface LineView {
  linha: LineKey;
  ligada: boolean;
  /** null = sem oferta neste momento (ou ainda sem coleta) */
  atual: number | null;
  vendedor: string | null;
  min: number | null;
  max: number | null;
  variacao: number | null;
  coletas: number;
  alvo: number | null;
  /** Só na linha Terceiros: a Amazon não vende, e este é o melhor terceiro novo (aparece mesmo com a linha desligada). */
  automatico?: { envio: "amazon" | "terceiro" | null };
}

export interface ProductView {
  num: number;
  titulo: string | null;
  asin: string;
  pausado: boolean;
  linhas: Record<LineKey, LineView>;
}

export function buildView(store: Store, p: Product, now: Date): ProductView {
  const desde = new Date(now.getTime() - 30 * DAY_MS).toISOString();
  const linhas = {} as Record<LineKey, LineView>;
  for (const linha of LINE_KEYS) {
    const ligada = linha === "amazon" || (linha === "terceiros" ? p.terceirosOn : p.usadoOn);
    const st = store.lineStats(p.id, linha, desde);
    const last = store.lastPoint(p.id, linha);
    const disp = store.getAlertState(p.id, linha).disponivel;
    const atual = ligada && last && disp !== false ? last.preco : null;
    const view: LineView = {
      linha,
      ligada,
      atual,
      vendedor: atual != null ? (last?.vendedor ?? null) : null,
      min: st.min,
      max: st.max,
      variacao: st.coletas > 1 && st.primeiro && atual != null ? ((atual - st.primeiro) / st.primeiro) * 100 : null,
      coletas: st.coletas,
      alvo: store.getAlvo(p.id, linha),
    };
    linhas[linha] = view;
    const fb = linha === "terceiros" ? store.getFallback(p.id) : null;
    if (fb) {
      // A Amazon não vende: o melhor terceiro fica na linha Terceiros, sem tocar na linha Amazon.
      const extra: Partial<LineView> = { automatico: { envio: fb.envio } };
      if (!ligada) Object.assign(extra, { atual: fb.preco, vendedor: fb.vendedor });
      Object.assign(view, extra);
    }
  }
  return { num: store.numberOf(p.id), titulo: p.titulo, asin: p.asin, pausado: p.pausado, linhas };
}
