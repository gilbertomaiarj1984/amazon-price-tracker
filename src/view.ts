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
    linhas[linha] = {
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
  }
  return { num: store.numberOf(p.id), titulo: p.titulo, asin: p.asin, pausado: p.pausado, linhas };
}
