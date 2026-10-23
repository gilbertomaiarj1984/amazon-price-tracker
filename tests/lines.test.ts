import { describe, expect, test } from "bun:test";
import { deriveLines, dropSuspects } from "../src/lines.ts";
import type { Offer, ProductPage } from "../src/types.ts";

const page = (o: Partial<ProductPage> = {}): ProductPage => ({
  titulo: "x", buyBox: null, buyBoxVendedor: null, vendidoPorAmazon: false, outrasAPartirDe: null, outrasOpcoes: null, disponivel: false, ...o,
});
const offer = (o: Partial<Offer>): Offer => ({
  vendedor: "Loja", condicao: "novo", preco: 100, frete: 0, envio: "terceiro", vendidoPorAmazon: false, ...o,
});

describe("deriveLines", () => {
  test("Amazon vende: linha vem do buy box", () => {
    const d = deriveLines(page({ buyBox: 219.9, vendidoPorAmazon: true }), [], { terceiros: false, usado: false });
    expect(d.points.amazon).toEqual({ linha: "amazon", preco: 219.9, vendedor: "Amazon" });
  });
  test("buy box de terceiro NÃO preenche a linha Amazon", () => {
    const d = deriveLines(page({ buyBox: 389, buyBoxVendedor: "TechBras" }), [], { terceiros: false, usado: false });
    expect(d.points.amazon).toBeUndefined();
  });
  test("Amazon fora do buy box mas presente no painel", () => {
    const d = deriveLines(page({ buyBox: 389 }), [offer({ vendedor: "Amazon", vendidoPorAmazon: true, preco: 395 })], {
      terceiros: false, usado: false,
    });
    expect(d.points.amazon?.preco).toBe(395);
  });
  test("terceiros usa preço + frete e escolhe o menor total", () => {
    const d = deriveLines(
      page(),
      [offer({ vendedor: "A", preco: 365, frete: 24.9 }), offer({ vendedor: "B", preco: 379, frete: 0 })],
      { terceiros: true, usado: false },
    );
    expect(d.points.terceiros).toEqual({ linha: "terceiros", preco: 379, vendedor: "B" });
  });
  test("linhas desligadas não são derivadas", () => {
    const amazon = offer({ vendedor: "Amazon", vendidoPorAmazon: true, preco: 90 });
    const d = deriveLines(page(), [amazon, offer({}), offer({ condicao: "usado", preco: 50 })], { terceiros: false, usado: false });
    expect(d.points.terceiros).toBeUndefined();
    expect(d.points.usado).toBeUndefined();
    expect(d.fallback).toBeNull();
  });
  test("sem Amazon: melhor terceiro novo vira fallback e é gravado em Terceiros, mesmo desligada", () => {
    const d = deriveLines(
      page(),
      [
        offer({ vendedor: "A", preco: 365, frete: 24.9 }),
        offer({ vendedor: "B", preco: 379, envio: "amazon" }),
        offer({ vendedor: "C", preco: 400 }),
        offer({ vendedor: "U", condicao: "usado", preco: 10 }),
      ],
      { terceiros: false, usado: false },
    );
    expect(d.points.amazon).toBeUndefined();
    expect(d.fallback).toEqual({ preco: 379, vendedor: "B", envio: "amazon" });
    expect(d.points.terceiros).toEqual({ linha: "terceiros", preco: 379, vendedor: "B" });
    expect(d.points.usado).toBeUndefined();
  });
  test("empate de preço: enviado pela Amazon ganha", () => {
    const d = deriveLines(page(), [offer({ vendedor: "A", preco: 300 }), offer({ vendedor: "B", preco: 300, envio: "amazon" })], { terceiros: false, usado: false });
    expect(d.fallback?.vendedor).toBe("B");
  });
  test("painel sem terceiros mas caixa de compra de terceiro: usa a caixa", () => {
    const d = deriveLines(page({ buyBox: 469.33, buyBoxVendedor: "VORTEX IMPORT" }), [], { terceiros: false, usado: false });
    expect(d.fallback).toEqual({ preco: 469.33, vendedor: "VORTEX IMPORT", envio: null });
  });
  test("sem nenhuma oferta: sem fallback", () => {
    expect(deriveLines(page(), [], { terceiros: false, usado: false }).fallback).toBeNull();
  });
  test("Amazon vende: não há fallback", () => {
    const d = deriveLines(page({ buyBox: 389, buyBoxVendedor: "Loja" }), [offer({ vendedor: "Amazon Global", vendidoPorAmazon: true, preco: 404.14 })], { terceiros: false, usado: false });
    expect(d.fallback).toBeNull();
    expect(d.points.amazon?.preco).toBe(404.14);
  });
  test("usado", () => {
    const d = deriveLines(page(), [offer({ condicao: "usado", preco: 301, vendedor: "Amazon Warehouse" })], {
      terceiros: false, usado: true,
    });
    expect(d.points.usado?.preco).toBe(301);
  });
  test("oferta suspeita é descartada e não vira o menor preço", () => {
    const d = deriveLines(
      page(),
      [offer({ vendedor: "A", preco: 379 }), offer({ vendedor: "B", preco: 387.9 }), offer({ vendedor: "C", preco: 389 }), offer({ vendedor: "Golpe", preco: 120 })],
      { terceiros: true, usado: false },
    );
    expect(d.points.terceiros?.vendedor).toBe("A");
    expect(d.descartadas.map((o) => o.vendedor)).toEqual(["Golpe"]);
  });
});

describe("dropSuspects", () => {
  test("com menos de 3 ofertas não filtra", () => {
    const r = dropSuspects([offer({ preco: 100 }), offer({ preco: 10 })]);
    expect(r.descartadas).toHaveLength(0);
  });
});
