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
