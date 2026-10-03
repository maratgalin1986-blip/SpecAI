import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/integrations', () => ({ telegramWebhookSecret: () => 'secret' }));
const calls: { method: string; body: Record<string, unknown> }[] = [];
let webhookUrl = '';
vi.stubGlobal(
  'fetch',
  vi.fn(async (url: string, init: { body?: string }) => {
    const method = url.split('/').pop()!;
    calls.push({ method, body: init.body ? JSON.parse(init.body) : {} });
    const result =
      method === 'getMe'
        ? { username: 'specplast16_zayavki_bot' }
        : method === 'getWebhookInfo'
          ? { url: webhookUrl, allowed_updates: ['message', 'channel_post', 'callback_query'] }
          : true;
    return new Response(JSON.stringify({ ok: true, result }));
  }),
);
process.env.TELEGRAM_BOT_TOKEN = 'token';
const { connectBot } = await import('./telegramSetup');

describe('connectBot', () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it('points the bot at this site and opens the Mini App from the menu', async () => {
    webhookUrl = 'https://old.example/hook';
    const r = await connectBot('https://spec-ai-web.vercel.app');
    expect(r).toMatchObject({ ok: true, already: false, bot: 'specplast16_zayavki_bot' });
    const hook = calls.find((c) => c.method === 'setWebhook')!.body;
    expect(hook.url).toBe('https://spec-ai-web.vercel.app/api/integrations/telegram');
    expect(hook.allowed_updates).toContain('callback_query');
    const menu = calls.find((c) => c.method === 'setChatMenuButton')!.body as {
      menu_button: { web_app: { url: string } };
    };
    expect(menu.menu_button.web_app.url).toBe('https://spec-ai-web.vercel.app/tg');
  });

  it('does nothing when the webhook is already right', async () => {
    webhookUrl = 'https://spec-ai-web.vercel.app/api/integrations/telegram';
    const r = await connectBot('https://spec-ai-web.vercel.app');
    expect(r).toMatchObject({ ok: true, already: true });
    expect(calls.some((c) => c.method === 'setWebhook')).toBe(false);
  });
});
