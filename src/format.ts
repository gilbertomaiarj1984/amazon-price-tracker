import type { AlertItem } from "./collector.ts";
import { LINE_KEYS, LINE_NAMES } from "./types.ts";
import type { LineKey } from "./types.ts";
import type { ProductView } from "./view.ts";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export const money = (v: number | null | undefined): string => (v == null ? "—" : brl.format(v).replace(/ /g, " "));

export const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const pct = (v: number): string => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1).replace(".", ",")}%`;

const title = (v: { titulo: string | null; asin: string }): string => esc(v.titulo ?? `Produto ${v.asin}`);

export function card(v: ProductView): string {
  const a = v.linhas.amazon;
  const lines = [
    `<b>${title(v)}</b>`,
    `<code>#${v.num} · ${v.asin}</code>`,
    "",
    a.atual != null ? `<b>Amazon  ${money(a.atual)}</b>` : "<b>Amazon  sem oferta agora</b>",
  ];
  for (const k of ["terceiros", "usado"] as const) {
    const l = v.linhas[k];
    if (!l.ligada) lines.push(`${LINE_NAMES[k]}  <i>desligada</i>`);
    else if (l.atual == null) lines.push(`${LINE_NAMES[k]}  sem oferta`);
    else lines.push(`${LINE_NAMES[k]}  ${money(l.atual)}${l.vendedor ? ` · ${esc(l.vendedor)}` : ""}`);
  }
  lines.push("", `Alvo Amazon: ${a.alvo != null ? `<b>${money(a.alvo)}</b>` : "não definido"}`);
  if (v.pausado) lines.push("<i>Pausado</i>");
  return lines.join("\n");
}

export const LISTA_AVISO =
  "A lista completa fica no painel. Aqui no Telegram, veja um item com <code>/item N</code> (card com foto, preço e alvo) ou cole um link para cadastrar.";

export function history(v: ProductView): string {
  const out = [`<b>${title(v)}</b>`, `Últimos 30 dias · #${v.num}`, ""];
  for (const k of LINE_KEYS) {
    const l = v.linhas[k];
    if (!l.ligada) continue;
    if (l.coletas === 0) {
      out.push(`<b>${LINE_NAMES[k]}</b>  sem dados`);
      continue;
    }
    out.push(
      `<b>${LINE_NAMES[k]}</b>  ${l.atual != null ? money(l.atual) : "sem oferta agora"}`,
      `mín ${money(l.min)} · máx ${money(l.max)} · ${l.coletas} coleta${l.coletas === 1 ? "" : "s"}${l.variacao != null ? " · " + pct(l.variacao) : ""}`,
      "",
    );
  }
  return out.join("\n").trimEnd();
}

export function lines(v: ProductView): string {
  const out = [`<b>Linhas de preço · #${v.num}</b>`, "A Amazon é a linha principal e está sempre ligada. Terceiros e Usado dobram as requisições do item.", ""];
  for (const k of ["terceiros", "usado"] as const) out.push(`${LINE_NAMES[k]}  ${v.linhas[k].ligada ? "ligada" : "<i>desligada</i>"}`);
  return out.join("\n");
}

export function alert(item: AlertItem, view: ProductView): string {
  const e = item.evento;
  const name = esc(view.titulo ?? view.asin);
  if (e.tipo === "voltou") {
    const alvo = view.linhas.amazon.alvo;
    return `<b>AMAZON VOLTOU A VENDER</b>\n<b>${name}</b>\n${money(e.preco)}\nAlvo ${alvo != null ? money(alvo) : "não definido"}`;
  }
  const linha = LINE_NAMES[e.linha].toUpperCase();
  const quem = e.linha === "amazon" ? "Vendido pela Amazon" : item.vendedor ? `Menor oferta: ${esc(item.vendedor)}` : "";
  if (e.tipo === "novo_minimo") {
    return `<b>NOVO MÍNIMO · ${linha}</b>\n<b>${name}</b>\n${money(e.preco)}\nMínimo anterior ${money(e.minimoAnterior)}\n${quem}`.trimEnd();
  }
  return [
    `<b>ALVO ATINGIDO · ${linha}</b>`,
    `<b>${name}</b>`,
    `<b>${money(e.preco)}</b>`,
    `Alvo ${money(e.alvo)}${e.minimo != null ? ` · mínimo anterior ${money(e.minimo)}${e.novoMinimo ? " (novo mínimo)" : ""}` : ""}`,
    quem,
  ]
    .filter(Boolean)
    .join("\n");
}

export function cycleFailure(consecutivos: number, kinds: string[], desdeHHMM: string): string {
  return `<b>FALHA NA COLETA</b>\nA Amazon não respondeu como esperado em <b>${consecutivos} rodadas seguidas</b> (desde ${desdeHHMM}). Nenhum preço foi gravado.\nMotivo mais comum: ${esc(kinds.join(", "))}.\n<i>Se continuar, reduza o número de itens ou mude a origem do IP.</i>`;
}

export function cycleRecovered(): string {
  return "<b>Coleta normalizada.</b> A Amazon voltou a responder e os preços estão sendo gravados de novo.";
}

export function productFailure(v: ProductView, kind: string, n: number): string {
  return `<b>Item com falha</b>\n#${v.num} ${esc((v.titulo ?? v.asin).slice(0, 60))}\n${n} coletas seguidas sem sucesso (${esc(kind)}). Se o link morreu, remova com <code>/remover ${v.num}</code>.`;
}

export const HELP = `<b>Comandos</b>
<code>/item N</code>  card do item com foto e preço
<code>/historico N</code>  mínimo, máximo e variação
<code>/linhas N</code>  liga ou desliga Terceiros e Usado
<code>/alvo N valor</code>  alvo da linha Amazon
<code>/alvo N terceiros valor</code>  alvo de outra linha
<code>/pausar N</code>  pausa ou retoma
<code>/remover N</code>  apaga o item e o histórico

Para rastrear, cole o link do produto (ou vários, um por linha, até 20).`;

export const lineKeyFrom = (s: string | undefined): LineKey | null => {
  const t = (s ?? "").toLowerCase();
  if (/^terc/.test(t)) return "terceiros";
  if (/^usad/.test(t)) return "usado";
  if (/^amaz/.test(t)) return "amazon";
  return null;
};
