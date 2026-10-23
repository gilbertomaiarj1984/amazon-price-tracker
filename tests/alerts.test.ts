import { describe, expect, test } from "bun:test";
import { EMPTY_ALERT_STATE, evaluate, recovered, shouldAlertFailures } from "../src/alerts.ts";
import type { AlertState, EvaluateInput } from "../src/alerts.ts";

const base = (o: Partial<EvaluateInput> = {}): EvaluateInput => ({
  linha: "amazon", preco: 210, alvo: 199, minimoAnterior: 205, avisarNovoMinimo: true, prev: { ...EMPTY_ALERT_STATE, disponivel: true }, ...o,
});

describe("evaluate", () => {
  test("acima do alvo: nada", () => {
    expect(evaluate(base()).eventos).toEqual([]);
  });
  test("cruza o alvo: avisa e guarda o preço avisado", () => {
    const r = evaluate(base({ preco: 195 }));
    expect(r.eventos).toEqual([{ tipo: "alvo", linha: "amazon", preco: 195, alvo: 199, minimo: 205, novoMinimo: true }]);
    expect(r.next.ultimoAlertado).toBe(195);
  });
  test("mesmo preço de novo: não repete", () => {
    const prev: AlertState = { ultimoAlertado: 195, disponivel: true };
    expect(evaluate(base({ preco: 195, prev, minimoAnterior: 195 })).eventos).toEqual([]);
  });
  test("preço cai mais: avisa de novo", () => {
    const prev: AlertState = { ultimoAlertado: 195, disponivel: true };
    const r = evaluate(base({ preco: 190, prev }));
    expect(r.eventos[0]?.tipo).toBe("alvo");
    expect(r.next.ultimoAlertado).toBe(190);
  });
  test("preço sobe um pouco dentro da faixa: não repete", () => {
    const prev: AlertState = { ultimoAlertado: 190, disponivel: true };
    const r = evaluate(base({ preco: 197, prev, minimoAnterior: 190 }));
    expect(r.eventos).toEqual([]);
    expect(r.next.ultimoAlertado).toBe(190);
  });
  test("sai da faixa e volta: avisa de novo", () => {
    const prev: AlertState = { ultimoAlertado: 190, disponivel: true };
    const fora = evaluate(base({ preco: 215, prev }));
    expect(fora.next.ultimoAlertado).toBeNull();
    expect(evaluate(base({ preco: 198, prev: fora.next })).eventos[0]?.tipo).toBe("alvo");
  });
  test("novo mínimo sem alvo", () => {
    const r = evaluate(base({ alvo: null, preco: 200 }));
    expect(r.eventos).toEqual([{ tipo: "novo_minimo", linha: "amazon", preco: 200, minimoAnterior: 205 }]);
  });
  test("novo mínimo desligado", () => {
    expect(evaluate(base({ alvo: null, preco: 200, avisarNovoMinimo: false })).eventos).toEqual([]);
  });
  test("sem histórico não existe novo mínimo", () => {
    expect(evaluate(base({ alvo: null, preco: 200, minimoAnterior: null })).eventos).toEqual([]);
  });
  test("alvo e novo mínimo juntos viram um aviso só", () => {
    expect(evaluate(base({ preco: 195 })).eventos).toHaveLength(1);
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
