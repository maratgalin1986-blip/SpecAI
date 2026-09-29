import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/admin';
import { telegramWebhookSecret } from '@/lib/integrations';

// Points the Telegram bot's webhook at this site (one click in /admin).
export async function POST(request: NextRequest) {
  if (!isAdminRequest()) return NextResponse.json({ error: 'Нет доступа' }, { status: 401 });
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const secret = telegramWebhookSecret();
  if (!token || !secret) {
    return NextResponse.json(
      { error: 'Добавьте TELEGRAM_BOT_TOKEN в настройках Vercel и сделайте Redeploy' },
      { status: 400 },
    );
  }
  const api = (method: string, body?: unknown) =>
    fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10_000),
    }).then(
      (r) =>
        r.json() as Promise<{ ok: boolean; result?: { username?: string }; description?: string }>,
    );

  try {
    const me = await api('getMe');
    if (!me.ok) return NextResponse.json({ error: `Telegram: ${me.description}` }, { status: 400 });
    const url = `${new URL(request.url).origin}/api/integrations/telegram`;
    const hook = await api('setWebhook', {
      url,
      secret_token: secret,
      allowed_updates: ['message', 'channel_post'],
    });
    if (!hook.ok) {
      return NextResponse.json({ error: `Telegram: ${hook.description}` }, { status: 400 });
    }
    // The bot's menu button opens the site as a Telegram Mini App.
    const origin = new URL(request.url).origin;
    const menu = await api('setChatMenuButton', {
      menu_button: { type: 'web_app', text: 'Заказать технику', web_app: { url: origin } },
    });
    return NextResponse.json({ ok: true, bot: me.result?.username, url, miniApp: menu.ok });
  } catch (error) {
    return NextResponse.json(
      { error: `Не удалось связаться с Telegram: ${String(error)}` },
      { status: 502 },
    );
  }
}
