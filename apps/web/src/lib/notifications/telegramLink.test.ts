import { describe, expect, it, vi } from 'vitest';

vi.mock('@specai/database', () => ({ prisma: {} }));

const { deepLink, hashLinkToken, isStopCommand, newLinkToken, parseStartToken } =
  await import('./telegramLink');

describe('telegram link tokens', () => {
  it('are url-safe, long enough and unique', () => {
    const a = newLinkToken();
    const b = newLinkToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(a).not.toBe(b);
  });

  it('are stored only as a hash', () => {
    const token = newLinkToken();
    expect(hashLinkToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashLinkToken(token)).not.toContain(token);
  });

  it('build the deep link', () => {
    expect(deepLink('@specplast16_zayavki_bot', 'abcdefghijklmnop1234')).toBe(
      'https://t.me/specplast16_zayavki_bot?start=abcdefghijklmnop1234',
    );
  });
});

describe('parseStartToken', () => {
  it('reads the token of /start', () => {
    const token = newLinkToken();
    expect(parseStartToken(`/start ${token}`)).toBe(token);
    expect(parseStartToken(`/start@my_bot ${token}`)).toBe(token);
  });

  it('ignores a plain /start and other text', () => {
    expect(parseStartToken('/start')).toBeNull();
    expect(parseStartToken('/start short')).toBeNull();
    expect(parseStartToken('Нужен экскаватор завтра')).toBeNull();
    expect(parseStartToken('/start abc def ghi jkl mno pqr')).toBeNull();
  });
});

describe('isStopCommand', () => {
  it('matches /stop only', () => {
    expect(isStopCommand('/stop')).toBe(true);
    expect(isStopCommand('/stop@my_bot')).toBe(true);
    expect(isStopCommand('/stopped')).toBe(false);
    expect(isStopCommand('stop')).toBe(false);
  });
});
