import { describe, expect, test } from "bun:test";
import { EMPTY_ALERT_STATE, evaluate, evaluateAlvo, recovered, shouldAlertFailures } from "../src/alerts.ts";
import type { AlertState, EvaluateInput } from "../src/alerts.ts";

const base = (o: Partial<EvaluateInput> = {}): EvaluateInput => ({
  linha: "amazon", preco: 210, minimoAnterior: 205, avisarNovoMinimo: true, prev: { ...EMPTY_ALERT_STATE, disponivel: true }, ...o,
});

describe("evaluate", () => {
  test("novo mínimo", () => {
    const r = evaluate(base({ preco: 200 }));
    expect(r.eventos).toEqual([{ tipo: "novo_minimo", linha: "amazon", preco: 200, minimoAnterior: 205 }]);
  });
  test("acima do mínimo anterior: nada", () => {
    expect(evaluate(base()).eventos).toEqual([]);
  });
  test("novo mínimo desligado", () => {
    expect(evaluate(base({ preco: 200, avisarNovoMinimo: false })).eventos).toEqual([]);
  });
  test("sem histórico não existe novo mínimo", () => {
    expect(evaluate(base({ preco: 200, minimoAnterior: null })).eventos).toEqual([]);
  });
  test("sem oferta: marca indisponível, sem evento e sem inventar preço", () => {
    const r = evaluate(base({ preco: null }));
    expect(r.eventos).toEqual([]);
    expect(r.next.disponivel).toBe(false);
  });
  test("Amazon voltou a vender", () => {
    const r = evaluate(base({ preco: 230, prev: { ultimoAlertado: null, disponivel: false } }));
    expect(r.eventos).toEqual([{ tipo: "voltou", linha: "amazon", preco: 230 }]);
  });
  test("primeira coleta não é 'voltou'", () => {
    expect(evaluate(base({ preco: 230, prev: { ...EMPTY_ALERT_STATE } })).eventos).toEqual([]);
  });
  test("linha de terceiros não gera 'voltou'", () => {
    const r = evaluate(base({ linha: "terceiros", preco: 230, prev: { ultimoAlertado: null, disponivel: false } }));
    expect(r.eventos).toEqual([]);
  });
});

describe("falhas seguidas", () => {
  test.each([[1, false], [2, false], [3, true], [4, false], [15, true], [16, false], [27, true]])("n=%i -> %p", (n, v) =>
    expect(shouldAlertFailures(n)).toBe(v));
  test("recuperação só depois de ter avisado", () => {
    expect(recovered(2)).toBe(false);
    expect(recovered(3)).toBe(true);
  });
});

describe("evaluateAlvo (alvo único)", () => {
  const c = (linha: "amazon" | "terceiros" | "usado", preco: number, minimoAnterior: number | null = 205) => ({ linha, preco, minimoAnterior });
  const run = (candidatos: ReturnType<typeof c>[], ultimoAlertado: number | null = null, alvo: number | null = 199) => evaluateAlvo({ candidatos, alvo, ultimoAlertado });

  test("acima do alvo em todas as fontes: nada", () => {
    expect(run([c("amazon", 210), c("terceiros", 205)])).toEqual({ evento: null, ultimoAlertado: null });
  });
  test("qualquer fonte dentro do alvo avisa, pela mais barata", () => {
    const r = run([c("amazon", 210), c("terceiros", 195), c("usado", 150)]);
    expect(r.evento).toEqual({ tipo: "alvo", linha: "usado", preco: 150, alvo: 199, minimo: 205, novoMinimo: true });
    expect(r.ultimoAlertado).toBe(150);
  });
  test("só Terceiros dentro do alvo (Amazon cara) avisa", () => {
    expect(run([c("amazon", 250), c("terceiros", 190)]).evento?.linha).toBe("terceiros");
  });
  test("mesmo preço de novo não repete; preço menor avisa; sai da faixa rearma", () => {
    expect(run([c("amazon", 195)], 195).evento).toBeNull();
    expect(run([c("amazon", 190)], 195).evento?.preco).toBe(190);
    expect(run([c("amazon", 197)], 190).ultimoAlertado).toBe(190);
    const fora = run([c("amazon", 215)], 190);
    expect(fora.ultimoAlertado).toBeNull();
    expect(run([c("amazon", 198)], fora.ultimoAlertado).evento?.tipo).toBe("alvo");
  });
  test("sem alvo ou sem oferta nenhuma: nada muda", () => {
    expect(run([c("amazon", 100)], 120, null)).toEqual({ evento: null, ultimoAlertado: 120 });
    expect(run([], 120)).toEqual({ evento: null, ultimoAlertado: 120 });
  });
});
