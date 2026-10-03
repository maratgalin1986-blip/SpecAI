// A small Telegram Bot API caller: the token stays on the server
// (TELEGRAM_BOT_TOKEN in Vercel); failures are logged, never thrown.

export async function telegramApi(method: string, body: unknown): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch (error) {
    console.error(`[telegram] ${method} failed`, error);
    return false;
  }
}
