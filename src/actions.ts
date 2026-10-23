import type { AsinResult } from "./amazon/asin.ts";
import type { CollectOutcome } from "./collector.ts";
import type { Product, Store } from "./db.ts";
import type { LineKey } from "./types.ts";

/** Operações de domínio compartilhadas pelo bot do Telegram e pelo painel web. Nada aqui formata texto para um canal. */
export interface ActionDeps {
  store: Store;
  collect: (p: Product) => Promise<CollectOutcome>;
  resolve: (text: string) => Promise<AsinResult>;
  now: () => Date;
}

export const MAX_BATCH = 20;
export const MUTE_MS = 24 * 3_600_000;

/** Intervalo mínimo entre duas consultas manuais do mesmo item, para não irritar a Amazon. */
export const CONSULTA_COOLDOWN_MS = 5 * 60_000;

export const consultaKey = (id: number): string => `consulta:${id}`;

/** Quando o botão "Consultar agora" do item volta a valer, se ainda está em espera. */
export function consultaLiberadaEm(store: Store, id: number, now: Date): string | null {
  const last = store.getMeta(consultaKey(id));
  if (last == null) return null;
  const ate = new Date(last).getTime() + CONSULTA_COOLDOWN_MS;
  return Number.isFinite(ate) && ate > now.getTime() ? new Date(ate).toISOString() : null;
}

export type ConsultaResult = { ok: true } | { ok: false; erro: "espera"; liberadaEm: string } | { ok: false; erro: "leitura"; detalhe: string | null };

export const muteKey = (id: number): string => `mute:${id}`;

/** Fim do silêncio de alertas do item, se ainda vale. */
export function mutedUntil(store: Store, id: number, now: Date): string | null {
  const until = store.getMeta(muteKey(id));
  return until != null && new Date(until).getTime() > now.getTime() ? until : null;
}

export const isMuted = (store: Store, id: number, now: Date): boolean => mutedUntil(store, id, now) != null;

export const RESOLVE_ERRORS: Record<string, string> = {
  sem_link: "Não achei um link nessa mensagem.",
  dominio_nao_suportado: "Só aceito links da amazon.com.br (e os curtos amzn.to e a.co).",
  asin_nao_encontrado: "Não achei o código do produto nesse link. Cole o link da página do produto.",
  falha_ao_resolver: "Não consegui abrir o link curto. Tente colar o link completo do produto.",
};

/** Links http(s) únicos de um texto, na ordem em que aparecem. */
export const extractLinks = (text: string): string[] => [...new Set(text.match(/https?:\/\/[^\s<>"']+/gi) ?? [])];

export type AddResult =
  | { ok: true; product: Product }
  | { ok: false; erro: "link"; motivo: string }
  | { ok: false; erro: "existente"; product: Product }
  | { ok: false; erro: "leitura"; asin: string; detalhe: string | null };

export type AlvoResult = { ok: true; atual: number | null; dentro: boolean } | { ok: false; erro: "linha_desligada" };

export class Actions {
  constructor(private readonly d: ActionDeps) {}

  private get store(): Store {
    return this.d.store;
  }

  /** Cadastra pelo link: resolve o ASIN, lê a página uma vez e, se a leitura falhar, não deixa nada para trás. */
  async addLink(link: string, antesDeLer?: () => Promise<void>): Promise<AddResult> {
    const r = await this.d.resolve(link);
    if (!r.ok) return { ok: false, erro: "link", motivo: r.motivo };
    const existing = this.store.getByAsin(r.asin);
    if (existing) return { ok: false, erro: "existente", product: existing };
    const p = this.store.addProduct(r.asin, null, this.d.now().toISOString());
    await antesDeLer?.();
    let outcome: CollectOutcome | null = null;
    try {
      outcome = await this.d.collect(p);
    } catch {
      outcome = null;
    }
    if (!outcome || !outcome.ok) {
      this.store.remove(p.id);
      return { ok: false, erro: "leitura", asin: r.asin, detalhe: outcome && !outcome.ok ? outcome.kind : null };
    }
    return { ok: true, product: this.store.getById(p.id)! };
  }

  /** Alvo de uma linha (null apaga). Recusa linha desligada. */
  setAlvo(p: Product, linha: LineKey, v: number | null): AlvoResult {
    if (v != null && linha !== "amazon" && !(linha === "terceiros" ? p.terceirosOn : p.usadoOn)) return { ok: false, erro: "linha_desligada" };
    this.store.setAlvo(p.id, linha, v);
    const last = this.store.lastPoint(p.id, linha);
    const disp = this.store.getAlertState(p.id, linha).disponivel;
    const atual = last && disp !== false ? last.preco : null;
    return { ok: true, atual, dentro: v != null && atual != null && atual <= v };
  }

  /** Inverte a pausa, ou fixa o valor dado. Devolve o novo estado. */
  setPausa(p: Product, pausado?: boolean): boolean {
    const novo = pausado ?? !p.pausado;
    this.store.setPausado(p.id, novo);
    return novo;
  }

  silenciar(p: Product, on: boolean): string | null {
    const until = on ? new Date(this.d.now().getTime() + MUTE_MS).toISOString() : null;
    this.store.setMeta(muteKey(p.id), until);
    return until;
  }

  remove(p: Product): number {
    const n = this.store.numberOf(p.id);
    this.store.remove(p.id);
    return n;
  }

  setLinha(p: Product, k: "terceiros" | "usado", on: boolean): void {
    this.store.setLinhaOn(p.id, k, on);
  }

  /** Consulta manual: mesmo caminho da rodada agendada (fila única, grava histórico e alertas), com espera entre consultas do item. */
  async consultar(p: Product): Promise<ConsultaResult> {
    const now = this.d.now();
    const liberadaEm = consultaLiberadaEm(this.store, p.id, now);
    if (liberadaEm) return { ok: false, erro: "espera", liberadaEm };
    // Marca antes de ler: cliques repetidos não furam a espera e uma falha também conta.
    this.store.setMeta(consultaKey(p.id), now.toISOString());
    const r = await this.collectNow(p);
    return r.ok ? { ok: true } : { ok: false, erro: "leitura", detalhe: r.detalhe };
  }

  /** Lê o item agora, depois de ligar uma linha. */
  async collectNow(p: Product): Promise<{ ok: true } | { ok: false; detalhe: string | null }> {
    try {
      const o = await this.d.collect(this.store.getById(p.id) ?? p);
      return o.ok ? { ok: true } : { ok: false, detalhe: o.kind };
    } catch {
      return { ok: false, detalhe: null };
    }
  }
}
