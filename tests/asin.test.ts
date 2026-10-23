import { describe, expect, test } from "bun:test";
import { extractAsin, normalizeUrl, resolveAsin } from "../src/amazon/asin.ts";
import type { FetchFn } from "../src/amazon/asin.ts";

describe("extractAsin", () => {
  test.each([
    ["https://www.amazon.com.br/dp/B0C8XK2M4N", "B0C8XK2M4N"],
    ["https://www.amazon.com.br/Fone-JBL/dp/B0C8XK2M4N/ref=sr_1_3?crid=1", "B0C8XK2M4N"],
    ["https://www.amazon.com.br/gp/product/b0c8xk2m4n?th=1", "B0C8XK2M4N"],
    ["https://www.amazon.com.br/gp/aw/d/B0C8XK2M4N", "B0C8XK2M4N"],
    ["https://www.amazon.com.br/x?asin=B0C8XK2M4N", "B0C8XK2M4N"],
  ])("%s", (u, a) => expect(extractAsin(u)).toBe(a));
  test("sem ASIN", () => expect(extractAsin("https://www.amazon.com.br/s?k=fone")).toBeNull());
  test("normalizeUrl", () => expect(normalizeUrl("B0C8XK2M4N")).toBe("https://www.amazon.com.br/dp/B0C8XK2M4N"));
});

const redirect = (map: Record<string, string>): FetchFn => async (url) => {
  const loc = map[url];
  return new Response(null, { status: loc ? 302 : 404, headers: loc ? { location: loc } : {} });
};

describe("resolveAsin", () => {
  test("link longo no meio do texto", async () => {
    const r = await resolveAsin("olha isso https://www.amazon.com.br/dp/B0C8XK2M4N, bom preço");
    expect(r).toEqual({ ok: true, asin: "B0C8XK2M4N" });
  });
  test("link curto resolvido por redirect", async () => {
    const f = redirect({ "https://amzn.to/3Vq8LmT": "https://www.amazon.com.br/dp/B0BN6Q2R7T?tag=x" });
    expect(await resolveAsin("https://amzn.to/3Vq8LmT", f)).toEqual({ ok: true, asin: "B0BN6Q2R7T" });
  });
  test("redirect em cadeia, relativo", async () => {
    const f = redirect({ "https://a.co/d/abc": "/x", "https://a.co/x": "https://www.amazon.com.br/dp/B0BN6Q2R7T" });
    expect(await resolveAsin("https://a.co/d/abc", f)).toEqual({ ok: true, asin: "B0BN6Q2R7T" });
  });
  test("host desconhecido nunca é buscado", async () => {
    let called = false;
    const f: FetchFn = async () => ((called = true), new Response());
    expect(await resolveAsin("https://evil.example/dp/B0C8XK2M4N", f)).toEqual({ ok: false, motivo: "dominio_nao_suportado" });
    expect(called).toBe(false);
  });
  test("amazon.com (EUA) não é suportado", async () => {
    expect((await resolveAsin("https://www.amazon.com/dp/B0C8XK2M4N")).ok).toBe(false);
  });
  test("redirect para fora da Amazon é recusado", async () => {
    const f = redirect({ "https://amzn.to/x": "https://evil.example/dp/B0C8XK2M4N" });
    expect(await resolveAsin("https://amzn.to/x", f)).toEqual({ ok: false, motivo: "dominio_nao_suportado" });
  });
  test("sem link", async () => expect(await resolveAsin("oi")).toEqual({ ok: false, motivo: "sem_link" }));
  test("loop de redirects termina", async () => {
    const f = redirect({ "https://a.co/a": "https://a.co/a" });
    expect(await resolveAsin("https://a.co/a", f)).toEqual({ ok: false, motivo: "falha_ao_resolver" });
  });
});
