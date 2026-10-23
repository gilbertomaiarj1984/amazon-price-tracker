export type Button = { text: string; callback_data: string } | { text: string; url: string };

export interface Update {
  update_id: number;
  message?: { chat: { id: number }; text?: string };
  callback_query?: { id: string; data?: string; message?: { chat: { id: number } } };
}

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

/** Cliente mínimo da Bot API. O token vai na URL, então os erros nunca repetem a URL. */
export class Telegram {
  constructor(
    private readonly token: string,
    private readonly fetchFn: FetchFn = fetch,
    /** Só para teste local (scripts/e2e-local.ts). Em produção fica o padrão. */
    private readonly base: string = "https://api.telegram.org",
  ) {}

  private async call<T>(method: string, body: Record<string, unknown>, timeoutMs = 15_000): Promise<T> {
    let res: Response;
    try {
      res = await this.fetchFn(`${this.base}/bot${this.token}/${method}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      throw new Error(`Telegram ${method}: falha de rede (${(e as Error).name})`);
    }
    const json = (await res.json().catch(() => null)) as { ok?: boolean; result?: T; description?: string } | null;
    if (!res.ok || !json?.ok) throw new Error(`Telegram ${method}: HTTP ${res.status} ${json?.description ?? ""}`.trim());
    return json.result as T;
  }

  getUpdates(offset: number, timeoutSec = 50): Promise<Update[]> {
    return this.call<Update[]>(
      "getUpdates",
      { offset, timeout: timeoutSec, allowed_updates: ["message", "callback_query"] },
      (timeoutSec + 10) * 1000,
    );
  }

  async sendMessage(chatId: number, html: string, keyboard?: Button[][]): Promise<void> {
    await this.call("sendMessage", {
      chat_id: chatId,
      text: html,
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
    });
  }

  async answerCallback(id: string): Promise<void> {
    await this.call("answerCallbackQuery", { callback_query_id: id });
  }
}

/** Chat de onde a atualização veio. Só o chat do dono é atendido; o resto é ignorado em silêncio. */
export function chatOf(u: Update): number | undefined {
  return u.message?.chat.id ?? u.callback_query?.message?.chat.id;
}
