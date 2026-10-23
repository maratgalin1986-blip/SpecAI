import { describe, expect, it, vi } from 'vitest';
import { deliver, genericEmail, type DeliverDeps } from './deliver';
import { DEFAULT_PREFS, type Recipient } from './routing';

function fakeDeps(overrides: Partial<DeliverDeps['send']> = {}): DeliverDeps {
  return {
    server: { telegram: true, push: true, email: true, whatsapp: false, sms: false },
    baseUrl: 'https://site.ru',
    send: {
      telegram: vi.fn(async () => ({ ok: true as const })),
      push: vi.fn(async () => ({ ok: true as const })),
      email: vi.fn(async () => ({ ok: true as const })),
      whatsapp: vi.fn(async () => ({ ok: true as const })),
      sms: vi.fn(async () => ({ ok: true as const })),
      ...overrides,
    },
    onInvalidPushTokens: vi.fn(),
  };
}

const RECIPIENT: Recipient = {
  userId: 'u1',
  email: 'anna@example.com',
  phone: '+79171234567',
  telegramChatId: '42',
  pushTokens: ['ExponentPushToken[a]'],
};

const EVENT = {
  type: 'bid.new' as const,
  orderId: 'o1',
  equipmentName: 'JCB 4CX',
  price: '10 000 ₽',
};

describe('deliver', () => {
  it('sends to every chosen and reachable channel', async () => {
    const deps = fakeDeps();
    const report = await deliver(RECIPIENT, DEFAULT_PREFS, EVENT, deps);
    expect(Object.keys(report).sort()).toEqual(['email', 'push', 'telegram']);
    expect(deps.send.telegram).toHaveBeenCalledWith(
      '42',
      expect.stringContaining('https://site.ru/orders/o1'),
    );
    expect(deps.send.push).toHaveBeenCalledWith(['ExponentPushToken[a]'], {
      title: 'Новое предложение по вашей заявке',
      body: expect.stringContaining('JCB 4CX'),
      data: { path: '/orders/o1' },
    });
    expect(deps.send.whatsapp).not.toHaveBeenCalled();
  });

  it('uses a ready-made letter when given', async () => {
    const deps = fakeDeps();
    const letter = { subject: 'Своё письмо', html: '<p>x</p>', text: 'x' };
    await deliver(RECIPIENT, DEFAULT_PREFS, EVENT, deps, { email: letter });
    expect(deps.send.email).toHaveBeenCalledWith('anna@example.com', letter);
  });

  it('a failing channel never stops the others and never throws', async () => {
    const deps = fakeDeps({
      telegram: vi.fn(async () => {
        throw new Error('network down');
      }),
    });
    const report = await deliver(RECIPIENT, DEFAULT_PREFS, EVENT, deps);
    expect(report.telegram).toEqual({ ok: false, error: 'network down' });
    expect(report.email).toEqual({ ok: true });
    expect(report.push).toEqual({ ok: true });
  });

  it('removes push tokens of uninstalled apps', async () => {
    const deps = fakeDeps({
      push: vi.fn(async () => ({
        ok: false as const,
        error: 'gone',
        invalidTokens: ['ExponentPushToken[a]'],
      })),
    });
    await deliver(RECIPIENT, DEFAULT_PREFS, EVENT, deps);
    expect(deps.onInvalidPushTokens).toHaveBeenCalledWith(['ExponentPushToken[a]']);
  });

  it('can be limited to some channels', async () => {
    const deps = fakeDeps();
    const report = await deliver(RECIPIENT, DEFAULT_PREFS, EVENT, deps, { only: ['push'] });
    expect(Object.keys(report)).toEqual(['push']);
  });

  it('sends the owner no second Telegram copy of what lib/notify.ts already sent', async () => {
    const deps = { ...fakeDeps(), ownerTelegramChatId: '42' };
    const order = {
      type: 'order.new' as const,
      orderId: 'o1',
      description: 'Нужен экскаватор',
      startDate: new Date('2026-10-20T06:00:00Z'),
    };
    // The owner (recipient chat 42 = TELEGRAM_CHAT_ID): push and e-mail only.
    const report = await deliver(RECIPIENT, DEFAULT_PREFS, order, deps);
    expect(Object.keys(report).sort()).toEqual(['email', 'push']);
    expect(deps.send.telegram).not.toHaveBeenCalled();
    // Another provider with his own chat still gets Telegram.
    await deliver({ ...RECIPIENT, telegramChatId: '7' }, DEFAULT_PREFS, order, deps);
    expect(deps.send.telegram).toHaveBeenCalledTimes(1);
    // The owner still gets Telegram for events the legacy alert does not cover.
    await deliver(RECIPIENT, DEFAULT_PREFS, EVENT, deps);
    expect(deps.send.telegram).toHaveBeenCalledTimes(2);
  });

  it('sends nothing when nothing is chosen', async () => {
    const deps = fakeDeps();
    const none = { ...DEFAULT_PREFS, telegram: false, push: false, email: false };
    expect(await deliver(RECIPIENT, none, EVENT, deps)).toEqual({});
  });

  it('routes WhatsApp and SMS to normalised phone digits once switched on', async () => {
    const deps = fakeDeps();
    deps.server = { ...deps.server, whatsapp: true, sms: true };
    const prefs = { ...DEFAULT_PREFS, whatsapp: true, sms: true };
    await deliver({ ...RECIPIENT, phone: '8 917 123-45-67' }, prefs, EVENT, deps);
    expect(deps.send.whatsapp).toHaveBeenCalledWith('79171234567', expect.any(String));
    expect(deps.send.sms).toHaveBeenCalledWith('79171234567', expect.any(String));
  });

  it('sends the daily «Спрос рядом» to push and Telegram only, whatever else is chosen', async () => {
    const deps = fakeDeps();
    deps.server = { ...deps.server, whatsapp: true, sms: true };
    const all = { telegram: true, push: true, email: true, whatsapp: true, sms: true };
    const report = await deliver(RECIPIENT, all, { type: 'demand.today', count: 3 }, deps);
    expect(Object.keys(report).sort()).toEqual(['push', 'telegram']);
    expect(deps.send.email).not.toHaveBeenCalled();
    expect(deps.send.whatsapp).not.toHaveBeenCalled();
    expect(deps.send.sms).not.toHaveBeenCalled();
    expect(deps.send.push).toHaveBeenCalledWith(['ExponentPushToken[a]'], {
      title: 'Сегодня 3 заявки рядом',
      body: expect.stringContaining('Выйдите на линию'),
      data: { path: '/orders' },
    });
    // The user's own choice still counts: no push chosen, Telegram only.
    const telegramOnly = await deliver(
      RECIPIENT,
      { ...all, push: false },
      { type: 'demand.today', count: 1 },
      deps,
    );
    expect(Object.keys(telegramOnly)).toEqual(['telegram']);
    // Other events keep every chosen channel.
    const other = await deliver(RECIPIENT, all, EVENT, deps);
    expect(Object.keys(other).sort()).toEqual(['email', 'push', 'sms', 'telegram', 'whatsapp']);
  });
});

describe('genericEmail', () => {
  it('escapes HTML and links to the site', () => {
    const letter = genericEmail(
      { title: 'A <b>', body: 'x & y', path: '/orders/1' },
      'https://site.ru/',
    );
    expect(letter.subject).toBe('A <b>');
    expect(letter.html).toContain('A &lt;b&gt;');
    expect(letter.html).toContain('x &amp; y');
    expect(letter.html).toContain('https://site.ru/orders/1');
  });
});
