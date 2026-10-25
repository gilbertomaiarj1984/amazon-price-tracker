export interface Config {
  botToken: string;
  chatId: number;
  dbPath: string;
  intervalMin: number;
  reqMinMs: number;
  reqMaxMs: number;
  /** Painel web. Sem PANEL_PORT, desligado. */
  panel: { host: string; port: number } | null;
  /** Token do selo do userscript (GET /api/selo/ASIN). Sem PANEL_TOKEN, o endpoint fica desligado. */
  panelToken: string | null;
  /** Token da API do userscript (/api/us/*: ver item, definir alvo, rastrear). Sem USERSCRIPT_TOKEN, desligada. */
  userscriptToken: string | null;
  /** PANEL_READONLY=1 desliga as ações de escrita do painel (cadastrar, alvo, pausar, linhas, remover). */
  panelReadonly: boolean;
  /** ALERTAS_APENAS_ALVO (padrão ligado; =0 desliga): o bot só avisa por conta própria de item dentro do alvo. */
  alertasApenasAlvo: boolean;
  /** Resumo no Telegram nas horas cheias (Brasília) listadas. RESUMO=0 desliga; RESUMO_HORAS=9,19 (padrão). */
  resumoHoras: number[] | null;
  /** Varredura diária de equivalentes vendidos pela Amazon (SUGESTOES=0 desliga). */
  sugestoes: { hora: number; maxItens: number; maxCandidatos: number; pausaMinMs: number; pausaMaxMs: number } | null;
}

function intOf(env: Record<string, string | undefined>, key: string, def: number, min: number): number {
  const raw = env[key];
  if (raw == null || raw === "") return def;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min) throw new Error(`${key} inválido: use um inteiro >= ${min}`);
  return n;
}

function horasOf(raw: string | undefined): number[] {
  if (raw == null || raw.trim() === "") return [9, 19];
  const hs = raw.split(",").map((x) => x.trim());
  if (hs.some((h) => !/^\d{1,2}$/.test(h) || Number(h) > 23)) throw new Error("RESUMO_HORAS inválido: use horas de 0 a 23 separadas por vírgula (ex.: 9,19)");
  return [...new Set(hs.map(Number))].sort((a, b) => a - b);
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const botToken = env["TELEGRAM_BOT_TOKEN"]?.trim();
  const chat = env["TELEGRAM_CHAT_ID"]?.trim();
  if (!botToken) throw new Error("Defina TELEGRAM_BOT_TOKEN no .env");
  if (!chat || !/^-?\d+$/.test(chat)) throw new Error("Defina TELEGRAM_CHAT_ID (número) no .env");
  const panelToken = env["PANEL_TOKEN"]?.trim();
  if (panelToken && panelToken.length < 24) throw new Error("PANEL_TOKEN curto demais: use pelo menos 24 caracteres (openssl rand -hex 24)");
  const usToken = env["USERSCRIPT_TOKEN"]?.trim();
  if (usToken && usToken.length < 24) throw new Error("USERSCRIPT_TOKEN curto demais: use pelo menos 24 caracteres (openssl rand -hex 24)");
  if (usToken && usToken === panelToken) throw new Error("USERSCRIPT_TOKEN deve ser diferente do PANEL_TOKEN");
  const reqMinMs = intOf(env, "REQ_MIN_MS", 2000, 500);
  const reqMaxMs = intOf(env, "REQ_MAX_MS", 5000, reqMinMs);
  const pausaMinMs = intOf(env, "SUGESTOES_PAUSA_MIN_MS", 15_000, 2000);
  return {
    alertasApenasAlvo: !/^(0|false|nao|não)$/i.test(env["ALERTAS_APENAS_ALVO"]?.trim() ?? ""),
    resumoHoras: /^(0|false|nao|não)$/i.test(env["RESUMO"]?.trim() ?? "") ? null : horasOf(env["RESUMO_HORAS"]),
    sugestoes: /^(0|false|nao|não)$/i.test(env["SUGESTOES"]?.trim() ?? "")
      ? null
      : {
          hora: Math.min(23, intOf(env, "SUGESTOES_HORA", 4, 0)),
          maxItens: intOf(env, "SUGESTOES_MAX_ITENS", 10, 1),
          maxCandidatos: intOf(env, "SUGESTOES_MAX_CANDIDATOS", 4, 1),
          pausaMinMs,
          pausaMaxMs: intOf(env, "SUGESTOES_PAUSA_MAX_MS", 30_000, pausaMinMs),
        },
    botToken,
    chatId: Number(chat),
    dbPath: env["DB_PATH"]?.trim() || "./data/tracker.db",
    intervalMin: intOf(env, "INTERVAL_MIN", 30, 5),
    reqMinMs,
    reqMaxMs,
    panelReadonly: /^(1|true|sim)$/i.test(env["PANEL_READONLY"]?.trim() ?? ""),
    userscriptToken: usToken || null,
    panelToken: env["PANEL_TOKEN"]?.trim() || null,
    panel: env["PANEL_PORT"]?.trim() ? { host: env["PANEL_HOST"]?.trim() || "127.0.0.1", port: intOf(env, "PANEL_PORT", 0, 1) } : null,
  };
}
