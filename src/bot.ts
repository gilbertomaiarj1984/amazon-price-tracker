import { Actions, MAX_BATCH, consultaLiberadaEm, RESOLVE_ERRORS, extractLinks, isMuted, muteKey } from "./actions.ts";
import type { AsinResult } from "./amazon/asin.ts";
import { productUrl } from "./amazon/fetch.ts";
import { IMAGE_HOST_RE } from "./amazon/parse.ts";
import type { CollectOutcome } from "./collector.ts";
import type { Product, Store } from "./db.ts";
import * as fmt from "./format.ts";
import { parseUserNumber } from "./numbers.ts";
import { resumoMensagens } from "./resumo.ts";
import type { Button } from "./telegram.ts";
import { LINE_NAMES } from "./types.ts";
import { buildView } from "./view.ts";

export interface BotDeps {
  store: Store;
  send: (html: string, keyboard?: Button[][], photo?: string | null) => Promise<void>;
  collect: (p: Product) => Promise<CollectOutcome>;
  resolve: (text: string) => Promise<AsinResult>;
  now: () => Date;
}

const AWAITING = "awaiting_target";

export { isMuted, muteKey };

/** Foto do produto só se vier de um host de imagens da Amazon. */
export const photoOf = (p: Product): string | null => (p.imagem && IMAGE_HOST_RE.test(p.imagem) ? p.imagem : null);

export const alertKeyboard = (p: Product): Button[][] => [
  [
    { text: "Abrir na Amazon", url: productUrl(p.asin) },
    { text: "Ver histórico", callback_data: `h:${p.id}` },
    { text: "Silenciar 24 h", callback_data: `m:${p.id}` },
  ],
];

export class Bot {
  private readonly act: Actions;

  constructor(private readonly d: BotDeps) {
    this.act = new Actions(d);
  }

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
      const links = extractLinks(text);
      return links.length > 1 ? this.addMany(links) : this.addLink(text);
    }
    const aw = this.store.getMeta(AWAITING);
    if (aw) {
      const p = this.store.getById(Number(aw));
      const v = parseUserNumber(text);
      if (p && v != null) {
        this.store.setMeta(AWAITING, null);
        return this.setAlvo(p, v);
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
        return this.d.send(fmt.LISTA_AVISO);
      case "/resumo":
        for (const m of resumoMensagens(this.store, this.d.now())) await this.d.send(m);
        return;
      case "/item": {
        const p = await needP();
        return p ? this.d.send(fmt.card(this.view(p)), [...alertKeyboard(p), [{ text: "Consultar agora", callback_data: `q:${p.id}` }]], photoOf(p)) : undefined;
      }
      case "/historico": {
        const p = await needP();
        return p ? this.d.send(fmt.history(this.view(p))) : undefined;
      }
      case "/linhas": {
        const p = await needP();
        if (!p) return;
        return this.d.send(fmt.lines(this.view(p)), [
          (["terceiros"] as const).map((k) => ({
            text: `${p.terceirosOn ? "Desligar" : "Ligar"} ${LINE_NAMES[k].split(" ")[0]}`,
            callback_data: `lg:${p.id}:${k}`,
          })),
        ]);
      }
      case "/alvo": {
        const p = await needP();
        if (!p) return;
        const v = parseUserNumber(args[args.length - 1] ?? "");
        if (args.length < 2 || v == null) return this.d.send("Use: <code>/alvo N valor</code>");
        return this.setAlvo(p, v);
      }
      case "/pausar": {
        const p = await needP();
        if (!p) return;
        const pausado = this.act.setPausa(p);
        return this.d.send(pausado ? `Item #${n} pausado. Sem coletas nem alertas até você retomar.` : `Item #${n} retomado.`);
      }
      case "/estrela": {
        const p = await needP();
        if (!p) return;
        const estrela = this.act.setEstrela(p);
        return this.d.send(estrela ? `★ Item #${n} marcado com estrela: é coletado primeiro em cada rodada.` : `Item #${n} sem estrela.`);
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
    const r = await this.act.addLink(text, () => this.d.send("Lendo a página…"));
    if (!r.ok) {
      if (r.erro === "link") return this.d.send(RESOLVE_ERRORS[r.motivo] ?? "Não consegui usar esse link.");
      if (r.erro === "existente") return this.d.send(`Esse produto já está sendo rastreado: <b>#${this.store.numberOf(r.product.id)}</b> ${fmt.esc(r.product.titulo ?? r.product.asin)}`);
      return this.d.send(`Não consegui ler a página agora${r.detalhe ? ` (${r.detalhe})` : ""}. Nada foi cadastrado. Tente de novo em alguns minutos.`);
    }
    const view = this.view(r.product);
    await this.d.send(fmt.card(view), undefined, photoOf(r.product));
    return this.askTarget(r.product, view.menor);
  }

  /** Vários links de uma vez (ex.: do userscript na busca). Cadastra sem perguntar alvo e resume no fim. */
  private async addMany(links: string[]): Promise<void> {
    const list = links.slice(0, MAX_BATCH);
    await this.d.send(`Cadastrando ${list.length} links…`);
    const lines: string[] = [];
    let novos = 0;
    for (const link of list) {
      const r = await this.act.addLink(link);
      if (r.ok) {
        novos++;
        lines.push(`✓ #${this.store.numberOf(r.product.id)} ${fmt.esc(r.product.titulo ?? r.product.asin)}`);
      } else if (r.erro === "link") lines.push(`✗ ${fmt.esc(link.slice(0, 60))}: ${RESOLVE_ERRORS[r.motivo] ?? "link inválido"}`);
      else if (r.erro === "existente") lines.push(`• já rastreado: #${this.store.numberOf(r.product.id)} ${fmt.esc(r.product.titulo ?? r.product.asin)}`);
      else lines.push(`✗ ${r.asin}: não consegui ler a página agora`);
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
        ? "Qual o preço-alvo? Vale para qualquer fonte (Amazon ou Terceiros, só produtos novos). Responda com um valor (ex.: <code>449</code>) ou escolha abaixo."
        : "Não há oferta deste item agora. Defina um alvo para quando aparecer (ex.: <code>449</code>), ou escolha abaixo.";
    return this.d.send(intro, [kb]);
  }

  private async setAlvo(p: Product, v: number): Promise<void> {
    const res = this.act.setAlvo(p, v);
    const view = this.view(p);
    let msg = `Alvo do item #${view.num}: <b>${fmt.money(v)}</b>. Vale para qualquer fonte (Amazon ou Terceiros, só produtos novos): aviso quando a menor oferta ficar igual ou abaixo.`;
    if (res.atual != null && res.atual <= v) msg += `\nO menor preço atual (${fmt.money(res.atual)}) já está dentro do alvo. Você será avisado na próxima coleta.`;
    return this.d.send(msg);
  }

  /** Botões do aviso diário: Rastrear (cadastra e agrupa com o original) ou Recusar. */
  private async sugestao(aceitar: boolean, id: number): Promise<void> {
    if (!aceitar) return this.d.send(this.act.recusarSugestao(id) ? "Ok, não sugiro esse de novo." : "Essa sugestão já foi tratada.");
    const r = await this.act.aceitarSugestao(id);
    if (!r.ok) return this.d.send(r.erro === "existente" ? "Esse item já está rastreado." : "Essa sugestão não está mais disponível.");
    const n = this.store.numberOf(r.product.id);
    return this.d.send(
      `Item #${n} cadastrado e agrupado com o original${r.alvoHerdado != null ? ` (alvo ${fmt.money(r.alvoHerdado)} herdado)` : ""}.${r.leitura ? "" : " Não consegui ler agora; entra na próxima rodada."}`,
    );
  }

  async handleCallback(data: string): Promise<void> {
    const [kind = "", a, b] = data.split(":");
    if (kind === "cn") return this.d.send("Ok, nada foi removido.");
    if (kind === "sga" || kind === "sgr") return this.sugestao(kind === "sga", Number(a));
    const p = a ? this.store.getById(Number(a)) : null;
    if (!p) return this.d.send("Esse item não existe mais.");
    switch (kind) {
      case "t": {
        const v = Number(b);
        if (!Number.isFinite(v) || v <= 0) return;
        this.store.setMeta(AWAITING, null);
        return this.setAlvo(p, v);
      }
      case "nt":
        this.store.setMeta(AWAITING, null);
        return this.d.send(`Ok. Sem alvo por enquanto: o histórico começa a ser guardado e você define depois com <code>/alvo ${this.store.numberOf(p.id)} valor</code>.`);
      case "h":
        return this.d.send(fmt.history(this.view(p)));
      case "m":
        this.act.silenciar(p, true);
        return this.d.send(`Ok, sem alertas de #${this.store.numberOf(p.id)} por 24 h.`);
      case "q": {
        const n = this.store.numberOf(p.id);
        const espera = consultaLiberadaEm(this.store, p.id, this.d.now());
        if (espera) {
          const min = Math.max(1, Math.ceil((new Date(espera).getTime() - this.d.now().getTime()) / 60_000));
          return this.d.send(`O item #${n} foi consultado há pouco. Tente de novo em ${min} min.`);
        }
        await this.d.send(`Consultando #${n} na Amazon…`);
        const o = await this.act.consultar(p);
        if (!o.ok) return this.d.send(`Não consegui ler agora${o.erro === "leitura" && o.detalhe ? ` (${o.detalhe})` : ""}. A próxima rodada tenta de novo.`);
        const fresh = this.store.getById(p.id)!;
        return this.d.send(fmt.card(this.view(fresh)), undefined, photoOf(fresh));
      }
      case "rm": {
        const n = this.act.remove(p);
        return this.d.send(`Item #${n} removido. Os demais foram renumerados.`);
      }
      case "lg": {
        const k = b === "terceiros" ? b : null;
        if (!k) return;
        const on = !p.terceirosOn;
        this.act.setLinha(p, k, on);
        const nome = LINE_NAMES[k];
        if (!on) return this.d.send(`Linha <b>${nome}</b> desligada para #${this.store.numberOf(p.id)}. O histórico fica guardado.`);
        await this.d.send(`Linha <b>${nome}</b> ligada para #${this.store.numberOf(p.id)}. Lendo agora (2 requisições por rodada a partir daqui)…`);
        const o = await this.act.collectNow(p);
        if (!o.ok) return this.d.send(o.detalhe ? `Não consegui ler agora (${o.detalhe}). A linha será coletada na próxima rodada.` : "Não consegui ler agora. A linha será coletada na próxima rodada.");
        {
          const fresh = this.store.getById(p.id)!;
          return this.d.send(fmt.card(this.view(fresh)), undefined, photoOf(fresh));
        }
      }
      default:
        return undefined;
    }
  }
}
