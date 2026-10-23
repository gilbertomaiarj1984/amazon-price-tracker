export interface Config {
  botToken: string;
  chatId: number;
  dbPath: string;
  intervalMin: number;
  reqMinMs: number;
  reqMaxMs: number;
}

function intOf(env: Record<string, string | undefined>, key: string, def: number, min: number): number {
  const raw = env[key];
  if (raw == null || raw === "") return def;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min) throw new Error(`${key} inválido: use um inteiro >= ${min}`);
  return n;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const botToken = env["TELEGRAM_BOT_TOKEN"]?.trim();
  const chat = env["TELEGRAM_CHAT_ID"]?.trim();
  if (!botToken) throw new Error("Defina TELEGRAM_BOT_TOKEN no .env");
  if (!chat || !/^-?\d+$/.test(chat)) throw new Error("Defina TELEGRAM_CHAT_ID (número) no .env");
  const reqMinMs = intOf(env, "REQ_MIN_MS", 2000, 500);
  const reqMaxMs = intOf(env, "REQ_MAX_MS", 5000, reqMinMs);
  return {
    botToken,
    chatId: Number(chat),
    dbPath: env["DB_PATH"]?.trim() || "./data/tracker.db",
    intervalMin: intOf(env, "INTERVAL_MIN", 30, 5),
    reqMinMs,
    reqMaxMs,
  };
}
