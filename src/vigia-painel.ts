type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export interface VigiaState {
  /** Checagens seguidas que falharam. */
  falhas: number;
  /** Já avisou que o painel caiu (evita repetir a cada checagem). */
  avisado: boolean;
}

export const VIGIA_INICIAL: VigiaState = { falhas: 0, avisado: false };

/** Quantas checagens seguidas precisam falhar para avisar (uma falha isolada pode ser reinício do Caddy). */
export const FALHAS_PARA_AVISAR = 2;

/** O painel está no ar se o Caddy responde 401 (pede login) ou 200. Erro de TLS/rede, 5xx ou 404 contam como fora. */
export async function painelNoAr(url: string, fetchFn: FetchFn = fetch): Promise<{ ok: boolean; detalhe: string }> {
  try {
    const res = await fetchFn(`${url.replace(/\/+$/, "")}/api/itens`, { redirect: "manual", signal: AbortSignal.timeout(15_000) });
    return { ok: res.status === 401 || res.status === 200, detalhe: `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, detalhe: `falha de rede/TLS (${(e as Error).name})` };
  }
}

export type VigiaAcao = "avisar_queda" | "avisar_volta" | null;

/** Máquina de estados do aviso: uma mensagem quando cai (após 2 falhas seguidas) e outra quando volta. */
export function avaliarVigia(prev: VigiaState, ok: boolean): { next: VigiaState; acao: VigiaAcao } {
  if (ok) return { next: VIGIA_INICIAL, acao: prev.avisado ? "avisar_volta" : null };
  const falhas = prev.falhas + 1;
  if (falhas >= FALHAS_PARA_AVISAR && !prev.avisado) return { next: { falhas, avisado: true }, acao: "avisar_queda" };
  return { next: { falhas, avisado: prev.avisado }, acao: null };
}
