import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// «💰 Цены на технику» in a private chat: the person starts it, the bot asks
// three questions with buttons, saves the answer and shows the colleagues'
// prices; the phone only through «Поделиться номером» after the consent notice.

const saveBotPriceReport = vi.fn();
const markWantsOrders = vi.fn();
const findPendingBotReport = vi.fn();
const attachBotPhone = vi.fn();
const findDraft = vi.fn();
const attachPhone = vi.fn();
vi.mock('@specai/database', () => ({ prisma: {} }));
vi.mock('@/lib/notify', () => ({ notifyTelegram: vi.fn(async () => true) }));
vi.mock('@/lib/deferredOrderNotices', () => ({ tickDeferredOrderNotices: async () => undefined }));
vi.mock('@/lib/botDrafts', () => ({
  sendDueReminders: async () => undefined,
  attachPhone,
  findDraft,
  saveDraft: vi.fn(),
  unsubscribe: vi.fn(),
}));
vi.mock('@/lib/botPriceStore', () => ({
  saveBotPriceReport,
  markWantsOrders,
  findPendingBotReport,
  attachBotPhone,
}));
vi.mock('@/lib/integrations', () => ({
  telegramWebhookSecret: () => 'secret',
  safeEqual: (a: string | null, b: string | null) => a === b,
}));

const sent: { method: string; body: Record<string, unknown> }[] = [];
vi.stubGlobal(
  'fetch',
  vi.fn(async (url: string, init: { body: string }) => {
    sent.push({ method: url.split('/').pop()!, body: JSON.parse(init.body) });
    return new Response('{"ok":true}');
  }),
);
process.env.TELEGRAM_BOT_TOKEN = 'token';

const { POST } = await import('./route');

const post = async (update: unknown) =>
  (
    await POST(
      new NextRequest('http://localhost/api/integrations/telegram', {
        method: 'POST',
        headers: { 'x-telegram-bot-api-secret-token': 'secret' },
        body: JSON.stringify(update),
      }),
    )
  ).json();
const chat = { id: 4242, type: 'private' };
let queryId = 0;
const press = (data: string) =>
  post({
    callback_query: { id: String((queryId += 1)), data, from: { id: 4242 }, message: { chat } },
  });
const messages = () => sent.filter((call) => call.method === 'sendMessage');

beforeEach(() => {
  sent.length = 0;
  for (const fn of [
    saveBotPriceReport,
    markWantsOrders,
    findPendingBotReport,
    attachBotPhone,
    findDraft,
    attachPhone,
  ]) {
    fn.mockReset();
  }
  findDraft.mockResolvedValue(null);
  findPendingBotReport.mockResolvedValue(null);
});

describe('the bot’s price survey', () => {
  it('starts with the deep link and asks the machine first', async () => {
    const body = await post({
      message: { message_id: 1, text: '/start ceny', chat, from: { id: 4242 } },
    });
    expect(body.result).toBe('price-survey');
    const [intro] = messages();
    expect(intro!.body.text).toContain('1/3. Какая у вас техника?');
    const keyboard = (
      intro!.body.reply_markup as { inline_keyboard: { callback_data: string }[][] }
    ).inline_keyboard;
    expect(keyboard.flat()[0]!.callback_data).toBe('cc|0');
  });

  it('saves the answer and shows only the colleagues’ aggregate, offering «Хочу заявки рядом»', async () => {
    saveBotPriceReport.mockResolvedValue('Экскаваторы, в городе Казань: медиана 3 500 ₽/ч');
    await press('cv|0|3|3000');
    expect(saveBotPriceReport).toHaveBeenCalledWith(4242, {
      step: 'price',
      landing: 0,
      city: 3,
      price: 3000,
    });
    const [answer] = messages();
    expect(answer!.body.text).toContain('медиана 3 500 ₽/ч');
    expect(answer!.body.text).toContain('/register?role=provider');
    expect(JSON.stringify(answer!.body.reply_markup)).toContain('"callback_data":"cn"');
  });

  it('too many answers from the chat: no save, a polite line', async () => {
    saveBotPriceReport.mockResolvedValue(null);
    await press('cv|0|3|3000');
    expect(messages()[0]!.body.text).toContain('попробуйте через час');
  });

  it('the phone only after «Хочу заявки рядом», with the consent notice, and only a shared contact', async () => {
    markWantsOrders.mockResolvedValue(true);
    await press('cn');
    const ask = messages()[0]!;
    expect(ask.body.text).toContain('/soglasie');
    expect(JSON.stringify(ask.body.reply_markup)).toContain('request_contact');

    // A typed number does not complete a price answer.
    findPendingBotReport.mockResolvedValue({ id: 'r1', createdAt: new Date(), wantsOrders: true });
    await post({ message: { message_id: 2, text: '+7 900 000-00-00', chat, from: { id: 4242 } } });
    expect(attachBotPhone).not.toHaveBeenCalled();

    const body = await post({
      message: {
        message_id: 3,
        chat,
        from: { id: 4242, first_name: 'Иван' },
        contact: { phone_number: '+79000000000', user_id: 4242 },
      },
    });
    expect(body.result).toBe('price-phone');
    expect(attachBotPhone).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'r1' }),
      '+79000000000',
      'Иван',
    );
  });

  it('an order draft newer than the price answer keeps the shared phone', async () => {
    findPendingBotReport.mockResolvedValue({
      id: 'r1',
      createdAt: new Date(Date.now() - 10 * 60_000),
      wantsOrders: true,
    });
    findDraft.mockResolvedValue({ id: 'lead', updatedAt: new Date(), message: '[tg:4242]' });
    await post({
      message: {
        message_id: 4,
        chat,
        from: { id: 4242, first_name: 'Иван' },
        contact: { phone_number: '+79000000000', user_id: 4242 },
      },
    });
    expect(attachBotPhone).not.toHaveBeenCalled();
    expect(attachPhone).toHaveBeenCalled();
  });
});
