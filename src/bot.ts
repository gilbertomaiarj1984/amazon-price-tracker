import type { AsinResult } from "./amazon/asin.ts";
import { productUrl } from "./amazon/fetch.ts";
import type { CollectOutcome } from "./collector.ts";
import type { Product, Store } from "./db.ts";
import * as fmt from "./format.ts";
import { parseUserNumber } from "./numbers.ts";
import type { Button } from "./telegram.ts";
import { LINE_NAMES } from "./types.ts";
import type { LineKey } from "./types.ts";
import { buildView } from "./view.ts";

export interface BotDeps {
  store: Store;
  send: (html: string, keyboard?: Button[][]) => Promise<void>;
  collect: (p: Product) => Promise<CollectOutcome>;
  resolve: (text: string) => Promise<AsinResult>;
  now: () => Date;
}

const AWAITING = "awaiting_target";
const MAX_BATCH = 20;
const MUTE_MS = 24 * 3_600_000;

export const muteKey = (id: number): string => `mute:${id}`;

export function isMuted(store: Store, id: number, now: Date): boolean {
  const until = store.getMeta(muteKey(id));
  return until != null && new Date(until).getTime() > now.getTime();
}

export const alertKeyboard = (p: Product): Button[][] => [
  [
    { text: "Abrir na Amazon", url: productUrl(p.asin) },
    { text: "Ver histórico", callback_data: `h:${p.id}` },
    { text: "Silenciar 24 h", callback_data: `m:${p.id}` },
  ],
];

const RESOLVE_ERRORS: Record<string, string> = {
  sem_link: "Não achei um link nessa mensagem.",
  dominio_nao_suportado: "Só aceito links da amazon.com.br (e os curtos amzn.to e a.co).",
  asin_nao_encontrado: "Não achei o código do produto nesse link. Cole o link da página do produto.",
  falha_ao_resolver: "Não consegui abrir o link curto. Tente colar o link completo do produto.",
};

export class Bot {
  constructor(private readonly d: BotDeps) {}

  private get store(): Store {
    return this.d.store;
  }

  private view(p: Product) {
    return buildView(this.store, p, this.d.now());
  }

  private notFound(n: string | number): Promise<void> {
    return this.d.send(`Não achei o item ${fmt.esc(String(n))}. Use <code>/lista</code>.`);
  }

  async handleText(raw: string): Promise<void> {
    const text = raw.trim();
    if (!text) return;
    if (text.startsWith("/")) {
      this.store.setMeta(AWAITING, null);
      return this.command(text);
    }
    if (/https?:\/\//i.test(text) || /\b(amzn\.to|a\.co)\//i.test(text)) {
      this.store.setMeta(AWAITING, null);
      const links = [...new Set(text.match(/https?:\/\/[^\s<>"']+/gi) ?? [])];
      return links.length > 1 ? this.addMany(links) : this.addLink(text);
    }
    const aw = this.store.getMeta(AWAITING);
    if (aw) {
      const p = this.store.getById(Number(aw));
      const v = parseUserNumber(text);
      if (p && v != null) {
        this.store.setMeta(AWAITING, null);
        return this.setAlvo(p, "amazon", v);
      }
    }
    return this.d.send("Não entendi. Cole um link da Amazon ou use <code>/ajuda</code>.");
  }

  private async command(text: string): Promise<void> {
    const [head = "", ...args] = text.split(/\s+/);
    const cmd = head.toLowerCase().replace(/@\w+$/, "");
    const n = args[0];
    const needP = async (): Promise<Product | null> => {
      const p = n && /^\d+$/.test(n) ? this.store.byNumber(Number(n)) : null;
      if (!p) await this.notFound(n ?? "");
      return p;
    };
    switch (cmd) {
      case "/start":
      case "/ajuda":
        return this.d.send(fmt.HELP);
      case "/lista":
        return this.d.send(fmt.list(this.store.list().map((p) => this.view(p))));
      case "/historico": {
        const p = await needP();
        return p ? this.d.send(fmt.history(this.view(p))) : undefined;
      }
      case "/linhas": {
        const p = await needP();
        if (!p) return;
        return this.d.send(fmt.lines(this.view(p)), [
          (["terceiros", "usado"] as const).map((k) => ({
            text: `${(k === "terceiros" ? p.terceirosOn : p.usadoOn) ? "Desligar" : "Ligar"} ${LINE_NAMES[k].split(" ")[0]}`,
            callback_data: `lg:${p.id}:${k}`,
          })),
        ]);
      }
      case "/alvo": {
        const p = await needP();
        if (!p) return;
        const rest = args.slice(1);
        const linha = rest.length > 1 ? fmt.lineKeyFrom(rest[0]) : "amazon";
        const v = parseUserNumber(rest[rest.length - 1] ?? "");
        if (!linha || v == null) return this.d.send("Use: <code>/alvo N valor</code> ou <code>/alvo N terceiros valor</code>");
        if (linha !== "amazon" && !(linha === "terceiros" ? p.terceirosOn : p.usadoOn))
          return this.d.send(`A linha <b>${LINE_NAMES[linha]}</b> está desligada. Ligue com <code>/linhas ${n}</code>.`);
        return this.setAlvo(p, linha, v);
      }
      case "/pausar": {
        const p = await needP();
        if (!p) return;
        this.store.setPausado(p.id, !p.pausado);
        return this.d.send(!p.pausado ? `Item #${n} pausado. Sem coletas nem alertas até você retomar.` : `Item #${n} retomado.`);
      }
      case "/remover": {
        const p = await needP();
        if (!p) return;
        return this.d.send(`Remover <b>#${n}</b> e apagar o histórico?\n<i>${fmt.esc(p.titulo ?? p.asin)}</i>`, [
          [
            { text: "Remover", callback_data: `rm:${p.id}` },
            { text: "Cancelar", callback_data: "cn" },
          ],
        ]);
      }
      default:
        return this.d.send("Comando desconhecido. Use <code>/ajuda</code>.");
    }
  }

  private async addLink(text: string): Promise<void> {
    const r = await this.d.resolve(text);
    if (!r.ok) return this.d.send(RESOLVE_ERRORS[r.motivo] ?? "Não consegui usar esse link.");
    const existing = this.store.getByAsin(r.asin);
    if (existing) return this.d.send(`Esse produto já está sendo rastreado: <b>#${this.store.numberOf(existing.id)}</b> ${fmt.esc(existing.titulo ?? existing.asin)}`);

    const p = this.store.addProduct(r.asin, null, this.d.now().toISOString());
    await this.d.send("Lendo a página…");
    let outcome: CollectOutcome | null = null;
    try {
      outcome = await this.d.collect(p);
    } catch {
      outcome = null;
    }
    if (!outcome || !outcome.ok) {
      this.store.remove(p.id);
      const why = outcome && !outcome.ok ? ` (${outcome.kind})` : "";
      return this.d.send(`Não consegui ler a página agora${why}. Nada foi cadastrado. Tente de novo em alguns minutos.`);
    }
    const fresh = this.store.getById(p.id)!;
    const view = this.view(fresh);
    await this.d.send(fmt.card(view));
    return this.askTarget(fresh, view.linhas.amazon.atual);
  }

  /** Vários links de uma vez (ex.: do userscript na busca). Cadastra sem perguntar alvo e resume no fim. */
  private async addMany(links: string[]): Promise<void> {
    const list = links.slice(0, MAX_BATCH);
    await this.d.send(`Cadastrando ${list.length} links…`);
    const lines: string[] = [];
    let novos = 0;
    for (const link of list) {
      const r = await this.d.resolve(link);
      if (!r.ok) {
        lines.push(`✗ ${fmt.esc(link.slice(0, 60))}: ${RESOLVE_ERRORS[r.motivo] ?? "link inválido"}`);
        continue;
      }
      const existing = this.store.getByAsin(r.asin);
      if (existing) {
        lines.push(`• já rastreado: #${this.store.numberOf(existing.id)} ${fmt.esc(existing.titulo ?? existing.asin)}`);
        continue;
      }
      const p = this.store.addProduct(r.asin, null, this.d.now().toISOString());
      let ok = false;
      try {
        const o = await this.d.collect(p);
        ok = o.ok;
      } catch {
        ok = false;
      }
      if (!ok) {
        this.store.remove(p.id);
        lines.push(`✗ ${r.asin}: não consegui ler a página agora`);
        continue;
      }
      novos++;
      const fresh = this.store.getById(p.id)!;
      lines.push(`✓ #${this.store.numberOf(fresh.id)} ${fmt.esc(fresh.titulo ?? fresh.asin)}`);
    }
    if (links.length > list.length) lines.push(`Só os primeiros ${MAX_BATCH} links foram usados.`);
    await this.d.send(`<b>${novos} novo(s) item(ns).</b>\n${lines.join("\n")}\n\nDefina alvos com <code>/alvo N valor</code>.`);
  }

  private async askTarget(p: Product, preco: number | null): Promise<void> {
    this.store.setMeta(AWAITING, String(p.id));
    const kb: Button[] = [];
    if (preco != null)
      for (const d of [5, 10, 15]) {
        const v = Math.round(preco * (1 - d / 100));
        kb.push({ text: `−${d}% · ${fmt.money(v)}`, callback_data: `t:${p.id}:${v}` });
      }
    kb.push({ text: "Sem alvo por enquanto", callback_data: `nt:${p.id}` });
    const intro =
      preco != null
        ? "Qual o preço-alvo para a linha <b>Amazon</b>? Responda com um valor (ex.: <code>449</code>) ou escolha abaixo."
        : "A Amazon não vende este item agora. Defina um alvo para quando ela voltar (ex.: <code>449</code>), ou escolha abaixo.";
    return this.d.send(intro, [kb]);
  }

  private async setAlvo(p: Product, linha: LineKey, v: number): Promise<void> {
    this.store.setAlvo(p.id, linha, v);
    const view = this.view(p);
    const atual = view.linhas[linha].atual;
    let msg = `Alvo da linha <b>${LINE_NAMES[linha]}</b> do item #${view.num}: <b>${fmt.money(v)}</b>. Aviso quando ficar igual ou abaixo.`;
    if (atual != null && atual <= v) msg += `\nO preço atual (${fmt.money(atual)}) já está dentro do alvo. Você será avisado na próxima coleta.`;
    return this.d.send(msg);
  }

  async handleCallback(data: string): Promise<void> {
    const [kind = "", a, b] = data.split(":");
    if (kind === "cn") return this.d.send("Ok, nada foi removido.");
    const p = a ? this.store.getById(Number(a)) : null;
    if (!p) return this.d.send("Esse item não existe mais.");
    switch (kind) {
      case "t": {
        const v = Number(b);
        if (!Number.isFinite(v) || v <= 0) return;
        this.store.setMeta(AWAITING, null);
        return this.setAlvo(p, "amazon", v);
      }
      case "nt":
        this.store.setMeta(AWAITING, null);
        return this.d.send(`Ok. Sem alvo por enquanto: o histórico começa a ser guardado e você define depois com <code>/alvo ${this.store.numberOf(p.id)} valor</code>.`);
      case "h":
        return this.d.send(fmt.history(this.view(p)));
      case "m":
        this.store.setMeta(muteKey(p.id), new Date(this.d.now().getTime() + MUTE_MS).toISOString());
        return this.d.send(`Ok, sem alertas de #${this.store.numberOf(p.id)} por 24 h.`);
      case "rm": {
        const n = this.store.numberOf(p.id);
        this.store.remove(p.id);
        return this.d.send(`Item #${n} removido. Os demais foram renumerados.`);
      }
      case "lg": {
        const k = b === "terceiros" || b === "usado" ? b : null;
        if (!k) return;
        const on = !(k === "terceiros" ? p.terceirosOn : p.usadoOn);
        this.store.setLinhaOn(p.id, k, on);
        const nome = LINE_NAMES[k];
        if (!on) return this.d.send(`Linha <b>${nome}</b> desligada para #${this.store.numberOf(p.id)}. O histórico fica guardado.`);
        await this.d.send(`Linha <b>${nome}</b> ligada para #${this.store.numberOf(p.id)}. Lendo agora (2 requisições por rodada a partir daqui)…`);
        try {
          const o = await this.d.collect(this.store.getById(p.id)!);
          if (!o.ok) return this.d.send(`Não consegui ler agora (${o.kind}). A linha será coletada na próxima rodada.`);
        } catch {
          return this.d.send("Não consegui ler agora. A linha será coletada na próxima rodada.");
        }
        return this.d.send(fmt.card(this.view(this.store.getById(p.id)!)));
      }
      default:
        return undefined;
    }
  }
}
