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
  alvoStatus: (a: number | null, b: number | null) => { k: string; cor: string; texto: string } | null;
  parseValor: (s: string) => number | null;
  quando: (iso: string | null, agora: number) => string;
};

describe("userscript: alvo e detalhes", () => {
  test("status do alvo com as mesmas faixas do painel", () => {
    expect(core.alvoStatus(100, null)).toBeNull();
    expect(core.alvoStatus(null, 100)).toBeNull();
    expect(core.alvoStatus(90, 100)?.k).toBe("dentro");
    expect(core.alvoStatus(100, 100)?.texto).toBe("No alvo");
    expect(core.alvoStatus(110, 100)).toMatchObject({ k: "perto", texto: "▲ 10,0% acima do alvo" });
    expect(core.alvoStatus(120, 100)?.k).toBe("perto");
    expect(core.alvoStatus(121, 100)?.k).toBe("longe");
  });
  test("valor digitado", () => {
    expect(core.parseValor("449,90")).toBe(449.9);
    expect(core.parseValor("1.299,90")).toBe(1299.9);
    expect(core.parseValor("R$ 199")).toBe(199);
    expect(core.parseValor("449.90")).toBe(449.9);
    for (const x of ["", "abc", "0", "-5", "2000000"]) expect(core.parseValor(x)).toBeNull();
  });
  test("há quanto tempo", () => {
    const now = Date.parse("2026-10-23T15:00:00Z");
    expect(core.quando("2026-10-23T14:59:40Z", now)).toBe("agora");
    expect(core.quando("2026-10-23T14:30:00Z", now)).toBe("há 30 min");
    expect(core.quando("2026-10-23T12:00:00Z", now)).toBe("há 3 h");
    expect(core.quando("2026-10-21T15:00:00Z", now)).toBe("há 2 dias");
    expect(core.quando(null, now)).toBe("");
  });
});

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

describe("gráfico do selo", () => {
  const cg = (core as any).chartGeometry as (s: unknown, w: number, h: number, p: number) => any;
  test("sem pontos válidos não desenha", () => {
    expect(cg([], 280, 110, 8)).toBeNull();
    expect(cg([{ t: "x", v: 1 }], 280, 110, 8)).toBeNull();
  });
  test("um ponto fica no centro e preço constante não quebra a escala", () => {
    const g = cg([{ t: "2026-10-23T10:00:00Z", v: 162.96 }], 280, 110, 8);
    expect(g.xy[0][0]).toBe(140);
    expect(Number.isFinite(g.xy[0][1])).toBe(true);
  });
  test("preço menor fica mais abaixo; tempo cresce para a direita", () => {
    const g = cg([{ t: "2026-10-01T00:00:00Z", v: 20 }, { t: "2026-10-10T00:00:00Z", v: 10 }], 280, 110, 8);
    expect(g.xy[1][0]).toBeGreaterThan(g.xy[0][0]);
    expect(g.xy[1][1]).toBeGreaterThan(g.xy[0][1]);
    expect(g.xy.every(([x, y]: [number, number]) => x >= 0 && x <= 280 && y >= 0 && y <= 110)).toBe(true);
  });
});
