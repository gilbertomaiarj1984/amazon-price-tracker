import { describe, expect, test } from "bun:test";
import { VIGIA_INICIAL, avaliarVigia, painelNoAr } from "../src/vigia-painel.ts";

const resp = (status: number) => (async () => new Response("", { status })) as unknown as typeof fetch;

describe("painelNoAr", () => {
  test("401 e 200 são ok", async () => {
    expect((await painelNoAr("https://x.test/", resp(401))).ok).toBe(true);
    expect((await painelNoAr("https://x.test", resp(200))).ok).toBe(true);
  });
  test("404, 502 e erro de TLS são fora", async () => {
    expect((await painelNoAr("https://x.test", resp(404))).ok).toBe(false);
    expect((await painelNoAr("https://x.test", resp(502))).ok).toBe(false);
    const r = await painelNoAr("https://x.test", (async () => { throw new Error("ssl"); }) as unknown as typeof fetch);
    expect(r.ok).toBe(false);
  });
  test("consulta /api/itens sem barra dupla", async () => {
    let url = "";
    await painelNoAr("https://x.test/", (async (u: string) => { url = u; return new Response("", { status: 401 }); }) as unknown as typeof fetch);
    expect(url).toBe("https://x.test/api/itens");
  });
});

describe("avaliarVigia", () => {
  test("avisa só na segunda falha seguida e uma única vez", () => {
    let s = VIGIA_INICIAL;
    let r = avaliarVigia(s, false);
    expect(r.acao).toBeNull();
    s = r.next;
    r = avaliarVigia(s, false);
    expect(r.acao).toBe("avisar_queda");
    s = r.next;
    r = avaliarVigia(s, false);
    expect(r.acao).toBeNull();
  });
  test("falha isolada seguida de sucesso não avisa nada", () => {
    const r = avaliarVigia(avaliarVigia(VIGIA_INICIAL, false).next, true);
    expect(r.acao).toBeNull();
    expect(r.next).toEqual(VIGIA_INICIAL);
  });
  test("avisa a volta depois de ter avisado a queda", () => {
    const caiu = avaliarVigia(avaliarVigia(VIGIA_INICIAL, false).next, false).next;
    expect(avaliarVigia(caiu, true).acao).toBe("avisar_volta");
  });
});
