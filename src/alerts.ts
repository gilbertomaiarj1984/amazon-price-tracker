import type { LineKey } from "./types.ts";

export interface AlertState {
  /** Menor preço já avisado enquanto a linha esteve na faixa do alvo. null = fora da faixa. */
  ultimoAlertado: number | null;
  /** Último ciclo teve oferta nesta linha? null = nunca coletou. */
  disponivel: boolean | null;
}

export const EMPTY_ALERT_STATE: AlertState = { ultimoAlertado: null, disponivel: null };

export type AlertEvent =
  | { tipo: "alvo"; linha: LineKey; preco: number; alvo: number; minimo: number | null; novoMinimo: boolean }
  | { tipo: "novo_minimo"; linha: LineKey; preco: number; minimoAnterior: number }
  | { tipo: "voltou"; linha: "amazon"; preco: number };

export interface EvaluateInput {
  linha: LineKey;
  /** null = sem oferta neste ciclo */
  preco: number | null;
  alvo: number | null;
  /** Menor preço do histórico ANTES deste ciclo. null = sem histórico. */
  minimoAnterior: number | null;
  avisarNovoMinimo: boolean;
  prev: AlertState;
}

export function evaluate(i: EvaluateInput): { eventos: AlertEvent[]; next: AlertState } {
  const eventos: AlertEvent[] = [];
  const next: AlertState = { ...i.prev };

  if (i.preco == null) {
    next.disponivel = false;
    return { eventos, next };
  }
  const preco = i.preco;
  if (i.prev.disponivel === false && i.linha === "amazon") eventos.push({ tipo: "voltou", linha: "amazon", preco });
  next.disponivel = true;

  const novoMinimo = i.minimoAnterior != null && preco < i.minimoAnterior;
  let alertouAlvo = false;
  if (i.alvo != null) {
    if (preco <= i.alvo) {
      if (i.prev.ultimoAlertado == null || preco < i.prev.ultimoAlertado) {
        eventos.push({ tipo: "alvo", linha: i.linha, preco, alvo: i.alvo, minimo: i.minimoAnterior, novoMinimo });
        next.ultimoAlertado = preco;
        alertouAlvo = true;
      }
    } else {
      next.ultimoAlertado = null;
    }
  }
  if (i.avisarNovoMinimo && novoMinimo && !alertouAlvo && i.minimoAnterior != null) {
    eventos.push({ tipo: "novo_minimo", linha: i.linha, preco, minimoAnterior: i.minimoAnterior });
  }
  return { eventos, next };
}

export const FAILURE_THRESHOLD = 3;
const REPEAT_EVERY = 12;

/** Avisa na 3ª falha seguida e repete a cada 12 (6 h) enquanto durar. */
export function shouldAlertFailures(consecutive: number, threshold = FAILURE_THRESHOLD): boolean {
  return consecutive === threshold || (consecutive > threshold && (consecutive - threshold) % REPEAT_EVERY === 0);
}

/** A coleta voltou depois de um aviso de falha? */
export function recovered(prevConsecutive: number, threshold = FAILURE_THRESHOLD): boolean {
  return prevConsecutive >= threshold;
}
