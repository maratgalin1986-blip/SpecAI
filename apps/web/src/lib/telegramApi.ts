// A small Telegram Bot API caller: the token stays on the server
// (TELEGRAM_BOT_TOKEN in Vercel); failures are logged, never thrown.

export interface TelegramResponse<T = unknown> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

/** Calls the Bot API and gives Telegram's answer (the result or the error). */
export async function telegramRequest<T = unknown>(
  method: string,
  body: unknown,
): Promise<TelegramResponse<T>> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, description: 'no token' };
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    const data = (await res.json().catch(() => null)) as TelegramResponse<T> | null;
    // Not JSON (a proxy's error page): the HTTP status decides.
    return data ?? { ok: res.ok, ...(res.ok ? {} : { error_code: res.status }) };
  } catch (error) {
    console.error(`[telegram] ${method} failed`, error);
    return { ok: false };
  }
}

/** Whether Telegram accepted the call. */
export async function telegramApi(method: string, body: unknown): Promise<boolean> {
  return (await telegramRequest(method, body)).ok;
}
