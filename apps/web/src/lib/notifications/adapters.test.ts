import { afterEach, describe, expect, it, vi } from 'vitest';
import { EXPO_PUSH_URL, isExpoPushToken, sendExpoPush, serverChannels } from './adapters';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('isExpoPushToken', () => {
  it('accepts Expo tokens only', () => {
    expect(isExpoPushToken('ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]')).toBe(true);
    expect(isExpoPushToken('ExpoPushToken[abc_DEF-123]')).toBe(true);
    expect(isExpoPushToken('fcm:abc')).toBe(false);
    expect(isExpoPushToken('ExponentPushToken[<script>]')).toBe(false);
    expect(isExpoPushToken(42)).toBe(false);
  });
});

describe('serverChannels', () => {
  it('keeps the paid channels off without their keys', () => {
    vi.stubEnv('GREEN_API_INSTANCE_ID', '');
    vi.stubEnv('GREEN_API_TOKEN', '');
    vi.stubEnv('SMSRU_API_ID', '');
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'x');
    expect(serverChannels()).toMatchObject({
      telegram: true,
      push: true,
      whatsapp: false,
      sms: false,
    });
  });

  it('switches WhatsApp and SMS on with env vars', () => {
    vi.stubEnv('GREEN_API_INSTANCE_ID', '1101');
    vi.stubEnv('GREEN_API_TOKEN', 'secret');
    vi.stubEnv('SMSRU_API_ID', 'id');
    expect(serverChannels()).toMatchObject({ whatsapp: true, sms: true });
  });
});

describe('sendExpoPush', () => {
  it('posts to the Expo push API and reports uninstalled devices', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        data: [
          { status: 'ok', id: '1' },
          { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const result = await sendExpoPush(['ExponentPushToken[a]', 'ExponentPushToken[b]', 'junk'], {
      title: 'T',
      body: 'B',
    });
    expect(fetchMock).toHaveBeenCalledWith(EXPO_PUSH_URL, expect.anything());
    const body = JSON.parse(
      (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string,
    );
    expect(body).toHaveLength(2);
    expect(result).toEqual({
      ok: false,
      error: 'some devices are gone',
      invalidTokens: ['ExponentPushToken[b]'],
    });
  });

  it('never throws on a network error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );
    expect(await sendExpoPush(['ExponentPushToken[a]'], { title: 'T', body: 'B' })).toEqual({
      ok: false,
      error: 'offline',
    });
  });
});
