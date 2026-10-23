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
