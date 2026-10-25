import { productUrl } from "./amazon/fetch.ts";
import type { Store } from "./db.ts";
import { esc, money, pct } from "./format.ts";
import { panelHealth, panelItems, panelSugestoes } from "./panel.ts";
import type { PanelItem } from "./panel.ts";
import { brasilia } from "./sugestoes.ts";

/** Mesmo limite do painel (LIMITE_LARANJA): até aqui é "perto do alvo", acima disso é "longe". */
export const LIMITE_LARANJA = 20;
/** Itens por seção; o que passar vira "e mais N". */
export const MAX_POR_SECAO = 10;
/** Telegram aceita 4096 caracteres; sobra margem para o HTML. */
const MAX_MSG = 3800;
const TITULO_MAX = 60;

const RESUMO_KEY = "resumo:ultimo";

/** Distância ao alvo em % ((menor − alvo) / alvo). null sem alvo ou sem preço. Igual ao painel. */
export const dist = (i: PanelItem): number | null => (i.menor != null && i.alvo != null ? ((i.menor - i.alvo) / i.alvo) * 100 : null);

/** Variação do preço nos últimos 7 dias (mini-gráfico). Igual ao painel. */
export const queda = (i: PanelItem): number | null => {
  const m = i.mini;
  const first = m[0];
  const lastPt = m[m.length - 1];
  return m.length > 1 && first?.v && lastPt ? ((lastPt.v - first.v) / first.v) * 100 : null;
};

const corta = (t: string): string => (t.length > TITULO_MAX ? `${t.slice(0, TITULO_MAX - 1)}…` : t);

/** Item em duas linhas: bullet (★ se prioridade) com o título como link e, recuada, a linha de preço. */
const bloco = (asin: string, titulo: string | null, estrela: boolean, detalhe: string): string =>
  `${estrela ? "★" : "•"} <a href="${productUrl(asin)}">${esc(corta((titulo ?? asin).trim()))}</a>\n   └ ${detalhe}`;

const link = (i: PanelItem, detalhe: string): string => bloco(i.asin, i.titulo, i.estrela, detalhe);

/** Estrela primeiro; dentro de cada faixa vale a ordem do critério (sort é estável). */
const estrelaPrimeiro = (a: PanelItem, b: PanelItem): number => Number(b.estrela) - Number(a.estrela);

function secao(titulo: string, linhas: string[], vazio: string): string[] {
  const out = [`<b>${titulo}</b>`];
  if (!linhas.length) out.push(`<i>${vazio}</i>`);
  else linhas.forEach((l, k) => out.push(...(k ? ["", l] : [l])));
  return out;
}

function limita<T>(xs: T[], f: (x: T) => string): string[] {
  const out = xs.slice(0, MAX_POR_SECAO).map(f);
  if (xs.length > MAX_POR_SECAO) out.push(`<i>e mais ${xs.length - MAX_POR_SECAO} no painel</i>`);
  return out;
}

/** Junta blocos em mensagens de até MAX_MSG caracteres, sem cortar no meio de uma linha. */
export function dividir(blocos: string[][]): string[] {
  const msgs: string[] = [];
  let atual = "";
  const push = (l: string) => {
    if (atual && atual.length + l.length + 1 > MAX_MSG) {
      msgs.push(atual);
      atual = "";
    }
    atual += (atual ? "\n" : "") + l;
  };
  for (const b of blocos) {
    // Se a seção não cabe no que sobra da mensagem, ela começa na próxima.
    const tam = b.join("\n").length;
    if (atual && atual.length + tam + 2 > MAX_MSG && tam <= MAX_MSG) {
      msgs.push(atual);
      atual = "";
    }
    if (atual) atual += "\n";
    for (const l of b) push(l);
  }
  if (atual) msgs.push(atual);
  return msgs;
}

/** O mesmo conteúdo da página Resumo do painel (mesma fonte: panelItems e panelSugestoes), em mensagens do Telegram. */
export function resumoMensagens(store: Store, now: Date): string[] {
  const todos = panelItems(store, now);
  const ativos = todos.filter((i) => !i.pausado);
  const dentro: PanelItem[] = [];
  let ate20 = 0;
  let acima = 0;
  let semAlvo = 0;
  let semPreco = 0;
  for (const i of ativos) {
    const d = dist(i);
    if (i.falhasSeguidas > 0 || i.menor == null) semPreco++;
    else if (d == null) semAlvo++;
    else if (d <= 0) dentro.push(i);
    else if (d <= LIMITE_LARANJA) ate20++;
    else acima++;
  }
  const quedas = ativos.filter((i) => (queda(i) ?? 0) < 0).sort((a, b) => queda(a)! - queda(b)!).sort(estrelaPrimeiro);
  const perto = ativos
    .filter((i) => i.falhasSeguidas <= 0 && i.menor != null && (dist(i) ?? 0) > 0)
    .sort((a, b) => dist(a)! - dist(b)!)
    .sort(estrelaPrimeiro);
  dentro.sort((a, b) => dist(a)! - dist(b)!).sort(estrelaPrimeiro);
  const sugs = panelSugestoes(store);

  const saude = panelHealth(store, now, 0);
  const coleta = saude.ultimaRodada ? new Date(saude.ultimaRodada).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : null;
  const cab = [
    "<b>📊 Resumo dos preços</b>",
    `${ativos.length} itens rastreados${todos.length > ativos.length ? ` (${todos.length - ativos.length} pausados)` : ""}`,
    `✅ ${dentro.length} dentro do alvo · 🟠 ${ate20} até ${LIMITE_LARANJA}% acima · 🔴 ${acima} mais de ${LIMITE_LARANJA}% acima · ${semAlvo} sem alvo · ⚠️ ${semPreco} sem preço ou com erro`,
    `${coleta ? `Última coleta ${coleta}` : "Nenhuma coleta ainda"} · ${sugs.length} sugest${sugs.length === 1 ? "ão pendente" : "ões pendentes"}`,
  ];
  const blocos: string[][] = [
    cab,
    secao("✅ Dentro do alvo", limita(dentro, (i) => link(i, `<b>${money(i.menor)}</b> · alvo ${money(i.alvo)}`)), "Nenhum item dentro do alvo agora."),
    secao("📉 Maiores quedas (7 dias)", limita(quedas, (i) => link(i, `<b>${money(i.menor)}</b> · ${pct(queda(i)!)} em 7 dias`)), "Nenhuma queda recente."),
    secao("🎯 Mais perto do alvo", limita(perto, (i) => link(i, `<b>${money(i.menor)}</b> · alvo ${money(i.alvo)} · ${pct(dist(i)!)} acima`)), "Nenhum item com alvo acima do preço."),
    secao(
      "✦ Sugestões: vendido e entregue pela Amazon",
      limita(
        sugs,
        (s) =>
          bloco(s.asin, s.titulo, false, `<b>${money(s.preco)}</b> · para o item #${s.origem.num}${s.formato ? ` · ${esc(s.formato)}` : ""}${s.certeza === "baixa" ? " · confira se é o mesmo produto" : ""}`),
      ),
      "Nenhuma sugestão pendente.",
    ),
  ];
  return dividir(blocos);
}

/**
 * Horários do resumo diário (hora cheia em Brasília). Devolve a chave "AAAA-MM-DD HH" quando agora é o primeiro slot (:00)
 * de uma hora configurada e ainda não foi enviado; senão null. Reiniciar o app no meio da hora não dispara nada.
 */
export function resumoDevido(store: Store, now: Date, horas: number[]): string | null {
  const b = brasilia(now);
  const minuto = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", minute: "2-digit" }).format(now));
  if (!horas.includes(b.hora) || minuto >= 30) return null;
  const chave = `${b.dia} ${String(b.hora).padStart(2, "0")}`;
  return store.getMeta(RESUMO_KEY) === chave ? null : chave;
}

export const marcarResumo = (store: Store, chave: string): void => store.setMeta(RESUMO_KEY, chave);
