import { beforeEach, describe, expect, test } from "bun:test";
import { resolveAsin } from "../src/amazon/asin.ts";
import { Bot, isMuted } from "../src/bot.ts";
import { collectOne } from "../src/collector.ts";
import { Store } from "../src/db.ts";
import type { Button } from "../src/telegram.ts";
import { fakeNet, fx } from "./helpers.ts";

interface Msg {
  html: string;
  kb?: Button[][];
}
let store: Store;
let net: ReturnType<typeof fakeNet>;
let sent: Msg[];
let bot: Bot;
const LINK = "https://www.amazon.com.br/dp/B097BYXGXN?ref=x";

beforeEach(() => {
  store = new Store(":memory:");
  net = fakeNet();
  sent = [];
  bot = new Bot({
    store,
    send: async (html, kb) => void sent.push({ html, kb }),
    collect: (p) => collectOne(store, p, net.deps),
    resolve: (t) => resolveAsin(t, async () => new Response(null, { status: 404 })),
    now: () => new Date(net.clock.t),
  });
});
const last = () => sent[sent.length - 1]!;
const texts = () => sent.map((m) => m.html).join("\n---\n");
const cbs = (m: Msg) => (m.kb ?? []).flat().map((b) => ("callback_data" in b ? b.callback_data : b.url));

describe("cadastro por link", () => {
  test("cola o link: lê a página, mostra o card e pergunta o alvo com sugestões", async () => {
    await bot.handleText(`olha ${LINK}`);
    expect(store.list()).toHaveLength(1);
    expect(sent[0]!.html).toContain("Lendo a página");
    expect(sent[1]!.html).toContain("Heinz Ketchup");
    expect(sent[1]!.html).toContain("#1 · B097BYXGXN");
    expect(sent[1]!.html).toContain("R$ 20,10");
    expect(sent[1]!.html).toContain("Terceiros (novo)  <i>desligada</i>");
    expect(last().html).toContain("preço-alvo");
    expect(cbs(last())).toEqual(["t:1:19", "t:1:18", "t:1:17", "nt:1"]);
  });

  test("responder um número define o alvo", async () => {
    await bot.handleText(LINK);
    await bot.handleText("15,50");
    expect(store.getAlvo(1, "amazon")).toBe(15.5);
    expect(last().html).toContain("R$ 15,50");
  });

  test("botão de sugestão define o alvo", async () => {
    await bot.handleText(LINK);
    await bot.handleCallback("t:1:18");
    expect(store.getAlvo(1, "amazon")).toBe(18);
  });

  test("alvo acima do preço atual avisa que já está dentro", async () => {
    await bot.handleText(LINK);
    await bot.handleText("25");
    expect(last().html).toContain("já está dentro do alvo");
  });

  test("'sem alvo por enquanto' não define nada e libera a conversa", async () => {
    await bot.handleText(LINK);
    await bot.handleCallback("nt:1");
    expect(store.getAlvo(1, "amazon")).toBeNull();
    await bot.handleText("200");
    expect(last().html).toContain("Não entendi");
  });

  test("produto repetido", async () => {
    await bot.handleText(LINK);
    await bot.handleText(LINK);
    expect(last().html).toContain("já está sendo rastreado");
    expect(store.list()).toHaveLength(1);
  });

  test("captcha: nada é cadastrado", async () => {
    net.product = fx("captcha.html");
    await bot.handleText(LINK);
    expect(store.list()).toHaveLength(0);
    expect(last().html).toContain("Nada foi cadastrado");
    expect(last().html).toContain("captcha");
  });

  test.each([
    ["https://example.com/dp/B097BYXGXN", "Só aceito links da amazon.com.br"],
    ["https://www.amazon.com.br/s?k=fone", "Não achei o código do produto"],
  ])("link inválido %s", async (link, msg) => {
    await bot.handleText(link);
    expect(last().html).toContain(msg);
    expect(store.list()).toHaveLength(0);
  });
});

describe("comandos", () => {
  beforeEach(async () => {
    await bot.handleText(LINK);
    await bot.handleCallback("nt:1");
    sent.length = 0;
  });

  test("/lista", async () => {
    await bot.handleText("/lista");
    expect(last().html).toContain("Itens rastreados (1)");
    expect(last().html).toContain("Amazon R$ 20,10");
    expect(last().html).toContain("sem alvo");
  });
  test("/lista vazia", async () => {
    store.remove(1);
    await bot.handleText("/lista");
    expect(last().html).toContain("Nenhum item rastreado");
  });
  test("/historico", async () => {
    await bot.handleText("/historico 1");
    expect(last().html).toContain("Amazon</b>  R$ 20,10");
    expect(last().html).toContain("1 coleta");
  });
  test("/alvo com e sem linha, e linha desligada", async () => {
    await bot.handleText("/alvo 1 18,5");
    expect(store.getAlvo(1, "amazon")).toBe(18.5);
    await bot.handleText("/alvo 1 terceiros 30");
    expect(last().html).toContain("está desligada");
    store.setLinhaOn(1, "terceiros", true);
    await bot.handleText("/alvo 1 terceiros 30");
    expect(store.getAlvo(1, "terceiros")).toBe(30);
    await bot.handleText("/alvo 1 abc");
    expect(last().html).toContain("Use:");
  });
  test("item inexistente", async () => {
    await bot.handleText("/historico 9");
    expect(last().html).toContain("Não achei o item 9");
    await bot.handleText("/pausar");
    expect(last().html).toContain("Não achei o item");
  });
  test("/pausar alterna", async () => {
    await bot.handleText("/pausar 1");
    expect(store.getById(1)?.pausado).toBe(true);
    await bot.handleText("/pausar 1");
    expect(store.getById(1)?.pausado).toBe(false);
  });
  test("/remover pede confirmação e só então apaga", async () => {
    await bot.handleText("/remover 1");
    expect(store.list()).toHaveLength(1);
    expect(cbs(last())).toEqual(["rm:1", "cn"]);
    await bot.handleCallback("cn");
    expect(store.list()).toHaveLength(1);
    await bot.handleCallback("rm:1");
    expect(store.list()).toHaveLength(0);
  });
  test("/linhas liga Terceiros e já lê o painel", async () => {
    await bot.handleText("/linhas 1");
    expect(cbs(last())).toEqual(["lg:1:terceiros", "lg:1:usado"]);
    net.calls.length = 0;
    await bot.handleCallback("lg:1:terceiros");
    expect(store.getById(1)?.terceirosOn).toBe(true);
    expect(net.calls).toEqual(["produto", "painel"]);
    expect(last().html).toContain("TechBras Store");
    await bot.handleCallback("lg:1:terceiros");
    expect(store.getById(1)?.terceirosOn).toBe(false);
    expect(last().html).toContain("desligada");
  });
  test("/ajuda, comando desconhecido e texto solto", async () => {
    await bot.handleText("/ajuda");
    expect(last().html).toContain("/alvo N valor");
    await bot.handleText("/foo");
    expect(last().html).toContain("Comando desconhecido");
    await bot.handleText("oi");
    expect(last().html).toContain("Não entendi");
    await bot.handleText("/lista@MeuBot");
    expect(last().html).toContain("Itens rastreados");
  });
  test("botão de item que sumiu", async () => {
    await bot.handleCallback("h:99");
    expect(last().html).toContain("não existe mais");
  });
  test("silenciar por 24 h", async () => {
    await bot.handleCallback("m:1");
    expect(isMuted(store, 1, new Date(net.clock.t))).toBe(true);
    expect(isMuted(store, 1, new Date(net.clock.t + 25 * 3_600_000))).toBe(false);
  });
});

test("nenhuma mensagem do bot vaza HTML cru do usuário", async () => {
  net.product = fx("product-real-shape.html").replace("Heinz Ketchup Tradicional 1,033KG", "&lt;b&gt;oi&lt;/b&gt; &amp; Cia");
  await bot.handleText(LINK);
  expect(texts()).not.toContain("<b>oi</b>");
  expect(texts()).toContain("<b>&lt;b&gt;oi&lt;/b&gt; &amp; Cia</b>");
});
