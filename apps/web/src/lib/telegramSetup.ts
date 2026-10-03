// Connects the Telegram bot to this site: the webhook (with the funnel's
// button presses) and the menu button that opens the Mini App (/tg). Used by
// the admin button and by the automatic, idempotent production check.

import { telegramWebhookSecret } from '@/lib/integrations';

type TgResult<T> = { ok: boolean; result?: T; description?: string };

export type ConnectResult =
  | { ok: true; bot?: string; url: string; already: boolean; miniApp: boolean }
  | { ok: false; error: string; status: number };

const UPDATES = ['message', 'channel_post', 'callback_query'];

export async function connectBot(origin: string, force = false): Promise<ConnectResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const secret = telegramWebhookSecret();
  if (!token || !secret) {
    return {
      ok: false,
      status: 400,
      error: 'Добавьте TELEGRAM_BOT_TOKEN в настройках Vercel и сделайте Redeploy',
    };
  }
  const api = <T>(method: string, body?: unknown) =>
    fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10_000),
    }).then((r) => r.json() as Promise<TgResult<T>>);

  try {
    const me = await api<{ username?: string }>('getMe');
    if (!me.ok) return { ok: false, status: 400, error: `Telegram: ${me.description}` };
    const url = `${origin}/api/integrations/telegram`;
    const info = await api<{ url?: string; allowed_updates?: string[] }>('getWebhookInfo');
    const already =
      !force &&
      info.result?.url === url &&
      UPDATES.every((u) => info.result?.allowed_updates?.includes(u));
    if (already) return { ok: true, bot: me.result?.username, url, already: true, miniApp: true };
    const hook = await api('setWebhook', {
      url,
      secret_token: secret,
      // callback_query: the order funnel's buttons (lib/botFunnel.ts).
      allowed_updates: UPDATES,
    });
    if (!hook.ok) return { ok: false, status: 400, error: `Telegram: ${hook.description}` };
    // The bot's menu button opens the Telegram Mini App (/tg).
    const menu = await api('setChatMenuButton', {
      menu_button: { type: 'web_app', text: 'Заказать технику', web_app: { url: `${origin}/tg` } },
    });
    return { ok: true, bot: me.result?.username, url, already: false, miniApp: menu.ok };
  } catch (error) {
    return { ok: false, status: 502, error: `Не удалось связаться с Telegram: ${String(error)}` };
  }
}
