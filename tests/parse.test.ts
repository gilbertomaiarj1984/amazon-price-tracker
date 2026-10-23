import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { detectBlock, parseBRL, parseOffersPanel, parseProductPage } from "../src/amazon/parse.ts";

const fx = (n: string) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), "utf8");

describe("parseBRL", () => {
  test.each([
    ["R$ 1.219,90", 1219.9],
    ["R$ 389,00", 389],
    ["R$ 219,9", 219.9],
    ["R$ 1.234.567,89", 1234567.89],
    ["R$ 219", 219],
    ["a partir de R$ 455,90", 455.9],
  ])("%s", (s, v) => expect(parseBRL(s)).toBe(v));
  test("sem número", () => {
    expect(parseBRL("indisponível")).toBeNull();
    expect(parseBRL("")).toBeNull();
    expect(parseBRL(null)).toBeNull();
  });
});

describe("parseProductPage", () => {
  test("vendido pela Amazon", () => {
    const p = parseProductPage(fx("product-amazon.html"));
    expect(p.titulo).toBe("Fone de ouvido Bluetooth JBL Tune 520BT");
    expect(p.buyBox).toBe(1219.9);
    expect(p.vendidoPorAmazon).toBe(true);
    expect(p.outrasAPartirDe).toBe(1189);
    expect(p.disponivel).toBe(true);
  });
  test("buy box de terceiro não vira linha Amazon", () => {
    const p = parseProductPage(fx("product-third-party.html"));
    expect(p.buyBox).toBe(389);
    expect(p.buyBoxVendedor).toBe("TechBras Store");
    expect(p.vendidoPorAmazon).toBe(false);
  });
  test("indisponível: sem preço inventado", () => {
    const p = parseProductPage(fx("product-unavailable.html"));
    expect(p.buyBox).toBeNull();
    expect(p.disponivel).toBe(false);
    expect(p.outrasAPartirDe).toBe(455.9);
  });
});

describe("parseProductPage com HTML parecido com o real", () => {
  const pad = "x".repeat(600);
  const wrap = (body: string) => `<html><body><div id="dp"><span id="productTitle">Disco</span>${body}<p>${pad}</p></div></body></html>`;

  test("script dentro do bloco de ofertas não vira preço", () => {
    const p = parseProductPage(
      wrap(`<div id="olp_feature_div"><script>P.when("A","load").execute("aod-assets-loaded", function(A){ var x = 1; })</script></div>
            <div id="corePrice_feature_div"><span class="a-price"><span class="a-offscreen">R$275,28</span></span></div>`),
    );
    expect(p.outrasAPartirDe).toBeNull();
    expect(p.buyBox).toBe(275.28);
  });
  test("preço sem espaço depois do R$", () => {
    expect(parseProductPage(wrap('<div id="corePrice_feature_div"><span class="a-price"><span class="a-offscreen">R$281,60</span></span></div>')).buyBox).toBe(281.6);
  });
  test("Amazon.com.br pelo bloco de envio/venda", () => {
    const p = parseProductPage(
      wrap(`<div id="corePrice_feature_div"><span class="a-price"><span class="a-offscreen">R$275,28</span></span></div>
            <div id="merchantInfoFeature_feature_div"><div class="offer-display-feature-text"><span class="offer-display-feature-text-message">Amazon.com.br</span></div></div>`),
    );
    expect(p.buyBoxVendedor).toBe("Amazon.com.br");
    expect(p.vendidoPorAmazon).toBe(true);
  });
  test("Amazon Global conta como Amazon", () => {
    const p = parseProductPage(
      wrap(`<div id="corePrice_feature_div"><span class="a-price"><span class="a-offscreen">R$272,79</span></span></div><a id="sellerProfileTriggerId">Amazon Global</a>`),
    );
    expect(p.vendidoPorAmazon).toBe(true);
  });
  test("Amazon Warehouse (usado) não conta como Amazon nova", () => {
    const p = parseProductPage(
      wrap(`<div id="corePrice_feature_div"><span class="a-price"><span class="a-offscreen">R$100,00</span></span></div><a id="sellerProfileTriggerId">Amazon Warehouse</a>`),
    );
    expect(p.vendidoPorAmazon).toBe(false);
  });
});

describe("ingresso de outras ofertas (texto real)", () => {
  const pad = "x".repeat(600);
  const page = (ingress: string) =>
    `<html><body><div id="dp"><span id="productTitle">Café</span><div id="corePrice_feature_div"><span class="a-price"><span class="a-offscreen">R$16,50</span></span></div>${ingress}<p>${pad}</p></div></body></html>`;
  test("N opções a partir de R$ X (preço duplicado no texto)", () => {
    const p = parseProductPage(
      page('<div id="dynamic-aod-ingress-box"><a id="aod-ingress-link">6 opções a partir de R$16,50R$16,50 Frete GRÁTIS no seu primeiro pedido.</a></div>'),
    );
    expect(p.outrasOpcoes).toBe(6);
    expect(p.outrasAPartirDe).toBe(16.5);
  });
  test("32 opções", () => {
    const p = parseProductPage(page('<div id="aod-ingress-link">32 opções a partir de R$204,10R$204,10 Entrega GRÁTIS.</div>'));
    expect(p.outrasOpcoes).toBe(32);
    expect(p.outrasAPartirDe).toBe(204.1);
  });
  test("oferta única: sem ingresso, sem painel a buscar", () => {
    const p = parseProductPage(page(""));
    expect(p.outrasOpcoes).toBeNull();
    expect(p.outrasAPartirDe).toBeNull();
  });
});

describe("parseOffersPanel", () => {
  const offers = parseOffersPanel(fx("offers-panel.html"));
  test("lê todas as ofertas", () => expect(offers).toHaveLength(6));
  test("oferta da Amazon", () => {
    const a = offers.find((o) => o.vendidoPorAmazon && o.condicao === "novo");
    expect(a).toMatchObject({ preco: 389, frete: 0, envio: "amazon" });
  });
  test("frete pago e entidade HTML", () => {
    const o = offers.find((x) => x.vendedor === "Casa & Som Outlet");
    expect(o).toMatchObject({ preco: 365, frete: 24.9, envio: "terceiro" });
  });
  test("'Compra única' é tipo de compra, não condição usada", () => {
    expect(offers.filter((o) => o.condicao === "novo")).toHaveLength(5);
  });
  test("vendedor vem do span (Amazon) ou do link (terceiro), nunca da política de devolução", () => {
    expect(offers.map((o) => o.vendedor)).toEqual([
      "Amazon.com.br", "TechBras Store", "Mega Eletro SP", "Casa & Som Outlet", "OfertaTop99", "Amazon Warehouse",
    ]);
  });
  test("a cópia fixa da oferta principal não conta", () => {
    expect(offers.some((o) => o.preco === 999)).toBe(false);
  });
  test("usado", () => {
    expect(offers.find((o) => o.condicao === "usado")).toMatchObject({ preco: 301, vendedor: "Amazon Warehouse" });
  });
});

describe("detectBlock", () => {
  test("ok", () => expect(detectBlock(fx("product-amazon.html"), 200)).toBe("ok"));
  test("captcha", () => expect(detectBlock(fx("captcha.html"), 200)).toBe("captcha"));
  test("503", () => expect(detectBlock("x", 503)).toBe("http_503"));
  test("404", () => expect(detectBlock("x", 404)).toBe("http_error"));
  test("200 com corpo vazio", () => expect(detectBlock("", 200)).toBe("vazio"));
  test("HTML sem produto", () =>
    expect(detectBlock(`<html><body>${"x".repeat(800)}</body></html>`, 200)).toBe("html_inesperado"));
  test("painel de ofertas", () => expect(detectBlock(fx("offers-panel.html"), 200, "offers")).toBe("ok"));
});
