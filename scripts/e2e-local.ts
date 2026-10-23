/**
 * Teste de ponta a ponta local: sobe um Telegram falso, roda o app de verdade contra ele
 * (banco temporário) e imprime a conversa. Faz poucas requisições REAIS à Amazon (as do link colado).
 *
 *   bun scripts/e2e-local.ts [link-da-amazon]
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const LINK = process.argv[2] ?? "https://www.amazon.com.br/dp/B097BYXGXN";
const CHAT = 4242;
const TOKEN = "e2e-token";
const script = ["/start", LINK, "18", "/lista", "/historico 1", "/alvo 1 17,5", "/linhas 1", "mensagem de outro chat"];

const sent: string[] = [];
let idx = 0;
let updateId = 100;

const server = Bun.serve({
  port: 0,
  async fetch(req) {
    const url = new URL(req.url);
    const method = url.pathname.split("/").pop();
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    if (!url.pathname.startsWith(`/bot${TOKEN}/`)) return new Response("{}", { status: 404 });
    if (method === "getUpdates") {
      // entrega a próxima fala só quando a anterior já foi respondida
      await Bun.sleep(1500);
      if (idx < script.length && sent.length >= idx * 1) {
        const text = script[idx++]!;
        const chat = text === "mensagem de outro chat" ? 999 : CHAT;
        return Response.json({ ok: true, result: [{ update_id: updateId++, message: { chat: { id: chat }, text } }] });
      }
      return Response.json({ ok: true, result: [] });
    }
    if (method === "sendMessage") {
      sent.push(String(body["text"]));
      return Response.json({ ok: true, result: {} });
    }
    return Response.json({ ok: true, result: true });
  },
});

const dir = mkdtempSync(join(tmpdir(), "tracker-e2e-"));
const proc = Bun.spawn(["bun", "src/index.ts"], {
  env: {
    ...process.env,
    TELEGRAM_BOT_TOKEN: TOKEN,
    TELEGRAM_CHAT_ID: String(CHAT),
    TELEGRAM_API_BASE: `http://localhost:${server.port}`,
    DB_PATH: join(dir, "t.db"),
    HEARTBEAT_FILE: join(dir, "hb"),
    INTERVAL_MIN: "60",
  },
  stdout: "inherit",
  stderr: "inherit",
});

const deadline = Date.now() + 120_000;
while (Date.now() < deadline && idx < script.length) await Bun.sleep(500);
await Bun.sleep(8000);
proc.kill();
server.stop(true);
rmSync(dir, { recursive: true, force: true });

console.log("\n======== conversa ========");
sent.forEach((m, i) => console.log(`\n[bot ${i + 1}]\n${m.replace(/<\/?[a-z]+>/g, "")}`));
const intruder = sent.some((m) => m.includes("Não entendi") && false);
console.log(`\nmensagens do bot: ${sent.length}; falas enviadas: ${idx}/${script.length}${intruder ? "" : ""}`);
