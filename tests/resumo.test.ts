import { beforeEach, describe, expect, test } from "bun:test";
import { Bot } from "../src/bot.ts";
import { loadConfig } from "../src/config.ts";
import { Store } from "../src/db.ts";
import { dividir, marcarResumo, resumoDevido, resumoMensagens } from "../src/resumo.ts";

let store: Store;
const NOW = new Date("2026-10-25T12:00:00.000Z"); // 09:00 em Brasília

const pt = (id: number, preco: number, at: string): void => store.saveSnapshot(id, at, [], { amazon: { linha: "amazon", preco, vendedor: "Amazon" } });

function item(asin: string, titulo: string, preco: number, alvo: number | null, extra: { estrela?: boolean; antes?: number } = {}): void {
  const p = store.addProduct(asin, titulo, "2026-10-20T00:00:00.000Z");
  if (alvo != null) store.setAlvo(p.id, alvo);
  if (extra.estrela) store.setEstrela(p.id, true);
  if (extra.antes != null) pt(p.id, extra.antes, "2026-10-24T12:00:00.000Z");
  pt(p.id, preco, "2026-10-25T11:30:00.000Z");
}

beforeEach(() => {
  store = new Store(":memory:");
});

describe("resumoMensagens", () => {
  test("seções, links da Amazon, estrela primeiro e HTML escapado", () => {
    item("B000000001", "Tênis <Azul> & Cia", 80, 100, { antes: 100 });
    item("B000000002", "Fone", 90, 100, { estrela: true, antes: 100 });
    item("B000000003", "Mouse", 110, 100);
    item("B000000004", "Sem alvo", 50, null);
    const p = store.getByAsin("B000000003")!;
    store.addSugestao({ origemId: p.id, asin: "B000000009", titulo: "Mouse CD", formato: "CD", formatoOrigem: "Vinil", certeza: "baixa", preco: 99, vendedor: "Amazon", criadoEm: NOW.toISOString() });
    const [m] = resumoMensagens(store, NOW);
    expect(m).toContain("Dentro do alvo");
    expect(m).toContain('<a href="https://www.amazon.com.br/dp/B000000001">Tênis &lt;Azul&gt; &amp; Cia</a>');
    expect(m).toContain('★ <a href="https://www.amazon.com.br/dp/B000000002">Fone</a>\n   └ <b>R$ 90,00</b>');
    expect(m).toContain("• <a");
    expect(m).toContain("</a>\n   └ ");
    expect(m).toMatch(/\n\n• <a/); // linha em branco entre itens
    expect(m).toContain("Maiores quedas");
    expect(m).toContain("Mais perto do alvo");
    expect(m).toContain('dp/B000000009">Mouse CD</a>');
    expect(m).toContain("1 sugestão pendente");
    expect(m).toContain("2 dentro do alvo");
  });

  test("sem itens no alvo ainda gera resumo", () => {
    item("B000000003", "Mouse", 110, 100);
    const [m] = resumoMensagens(store, NOW);
    expect(m).toContain("Nenhum item dentro do alvo agora.");
    expect(m).toContain("Nenhuma sugestão pendente.");
  });

  test("limita a 10 por seção e divide em mensagens de até 4096 caracteres", () => {
    for (let i = 0; i < 25; i++) item(`B0000001${String(i).padStart(2, "0")}`, `Produto ${i} ${"x".repeat(60)}`, 50, 100);
    const msgs = resumoMensagens(store, NOW);
    const todas = msgs.join("\n");
    expect((todas.match(/<a href/g) ?? []).length).toBe(10);
    expect(todas).toContain("e mais 15 no painel");
    for (const m of msgs) expect(m.length).toBeLessThan(4096);
  });

  test("dividir quebra por seção quando passa do limite", () => {
    const bloco = Array.from({ length: 40 }, (_, i) => `linha ${i} ${"y".repeat(80)}`);
    const msgs = dividir([bloco, bloco]);
    expect(msgs.length).toBeGreaterThan(1);
    for (const m of msgs) expect(m.length).toBeLessThan(4096);
  });
});

describe("resumoDevido", () => {
  test("só no slot :00 de uma hora configurada e uma vez", () => {
    expect(resumoDevido(store, NOW, [9, 19])).toBe("2026-10-25 09");
    expect(resumoDevido(store, new Date("2026-10-25T12:30:05.000Z"), [9, 19])).toBeNull(); // 09:30: reinício tardio não dispara
    expect(resumoDevido(store, new Date("2026-10-25T13:00:00.000Z"), [9, 19])).toBeNull(); // 10h
    marcarResumo(store, "2026-10-25 09");
    expect(resumoDevido(store, NOW, [9, 19])).toBeNull();
    expect(resumoDevido(store, new Date("2026-10-25T22:00:00.000Z"), [9, 19])).toBe("2026-10-25 19");
  });
});

describe("config", () => {
  const base = { TELEGRAM_BOT_TOKEN: "t", TELEGRAM_CHAT_ID: "1" };
  test("padrão 9 e 19; lista própria; RESUMO=0 desliga; inválido falha", () => {
    expect(loadConfig(base).resumoHoras).toEqual([9, 19]);
    expect(loadConfig({ ...base, RESUMO_HORAS: "20, 8,8" }).resumoHoras).toEqual([8, 20]);
    expect(loadConfig({ ...base, RESUMO: "0" }).resumoHoras).toBeNull();
    expect(() => loadConfig({ ...base, RESUMO_HORAS: "25" })).toThrow("RESUMO_HORAS");
  });
});

test("/resumo manda o resumo na hora", async () => {
  item("B000000001", "Fone", 90, 100);
  const sent: string[] = [];
  const bot = new Bot({ store, send: async (h) => void sent.push(h), collect: async () => { throw new Error("x"); }, resolve: async () => { throw new Error("x"); }, now: () => NOW });
  await bot.handleText("/resumo");
  expect(sent.join("\n")).toContain("Resumo dos preços");
});
