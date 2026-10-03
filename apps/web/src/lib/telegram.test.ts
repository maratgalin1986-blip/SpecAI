import { describe, expect, it } from 'vitest';
import { parseStart, startParam, telegramLink, withYclid } from './telegram';

describe('telegram deep links', () => {
  it('builds a safe start parameter from the page and the campaign', () => {
    expect(startParam('/arenda/samosval', 'direct-kran')).toBe('arenda-samosval__direct-kran');
    expect(startParam('/', null)).toBe('home');
    expect(startParam('/smeta?x=1', 'Мастер 2026')).toBe('smeta-x-1__2026');
    expect(startParam('/a'.repeat(80)).length).toBeLessThanOrEqual(64);
    expect(startParam('/a'.repeat(80))).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('reads it back and refuses junk', () => {
    expect(parseStart('arenda-samosval__direct-kran')).toEqual({
      page: 'arenda-samosval',
      campaign: 'direct-kran',
      yclid: '',
    });
    expect(parseStart(withYclid('home__master-2026', '1234567890'))).toEqual({
      page: 'home',
      campaign: 'master-2026',
      yclid: '1234567890',
    });
    expect(parseStart('../../etc')).toEqual({ page: '', campaign: '', yclid: '' });
  });

  it('links to the bot', () => {
    expect(telegramLink('home')).toBe('https://t.me/specplast16_zayavki_bot?start=home');
  });
});
