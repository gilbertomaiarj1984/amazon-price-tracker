import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { extractAsin } from "../src/amazon/asin.ts";

const path = new URL("../scripts/userscript/amazon-price-tracker.user.js", import.meta.url).pathname;
const core = require(path) as {
  asinFromPath: (p: string) => string | null;
  linkFor: (a: string) => string;
  isProductPath: (p: string) => boolean;
  isSearchPath: (p: string) => boolean;
  uniqueAsins: (l: string[]) => string[];
  MAX: number;
};

describe("userscript", () => {
  test("extrai o ASIN dos formatos de URL e concorda com o bot", () => {
    for (const p of ["/dp/B097BYXGXN", "/Ketchup-Heinz/dp/B097BYXGXN/ref=sr_1_1", "/gp/product/B097BYXGXN"]) {
      expect(core.asinFromPath(p)).toBe("B097BYXGXN");
      expect(core.asinFromPath(p)).toBe(extractAsin(p));
    }
    expect(core.asinFromPath("/s")).toBeNull();
  });
  test("link limpo aceito pelo bot", () => {
    expect(extractAsin(core.linkFor("B097BYXGXN"))).toBe("B097BYXGXN");
    expect(core.linkFor("B097BYXGXN")).toBe("https://www.amazon.com.br/dp/B097BYXGXN");
  });
  test("tipo de página", () => {
    expect(core.isProductPath("/x/dp/B097BYXGXN")).toBe(true);
    expect(core.isSearchPath("/s")).toBe(true);
    expect(core.isSearchPath("/dp/B097BYXGXN")).toBe(false);
  });
  test("deduplica, valida e limita a 20", () => {
    expect(core.uniqueAsins(["B097BYXGXN", "b097byxgxn", "curto", ""])).toEqual(["B097BYXGXN"]);
    const many = Array.from({ length: 30 }, (_, i) => `B0000000${String(i).padStart(2, "0")}`);
    expect(core.uniqueAsins(many)).toHaveLength(core.MAX);
  });
  test("rede só para o painel e nenhum segredo no arquivo", () => {
    const src = readFileSync(path, "utf8");
    expect(src).not.toMatch(/fetch\(|api\.telegram|bot\d+:|[0-9a-f]{32}/i);
    expect([...src.matchAll(/@connect\s+(\S+)/g)].map((m) => m[1])).toEqual(["precos.143-95-214-240.sslip.io"]);
    expect(src).toMatch(/@match\s+https:\/\/www\.amazon\.com\.br\/\*/);
  });
});

describe("selo", () => {
  const sv = (core as any).seloView as (s: unknown) => { cor: string; linhas: string[] };
  test("item não rastreado convida a rastrear", () => {
    expect(sv({ rastreado: false }).linhas[0]).toContain("Não rastreado");
  });
  test("mostra veredito, mínimo, máximo e média em reais", () => {
    const v = sv({ rastreado: true, veredito: "bom", min: 8, max: 12.5, media: 10, atual: 9 });
    expect(v.linhas).toEqual(["Abaixo da média de 30 dias", "Mín R$ 8,00 · Máx R$ 12,50 · Média R$ 10,00"]);
  });
  test("veredito desconhecido cai em histórico curto", () => {
    expect(sv({ rastreado: true, veredito: "x" }).linhas[0]).toBe("Histórico ainda curto");
  });
});
