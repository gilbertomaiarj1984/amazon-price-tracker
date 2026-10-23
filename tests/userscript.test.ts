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
  test("sem rede nem token", () => {
    const src = readFileSync(path, "utf8");
    expect(src).not.toMatch(/fetch\(|XMLHttpRequest|GM_xmlhttpRequest|@connect|api\.telegram|TOKEN/i);
    expect(src).toMatch(/@match\s+https:\/\/www\.amazon\.com\.br\/\*/);
  });
});
