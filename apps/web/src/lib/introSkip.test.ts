import { describe, expect, it } from 'vitest';
import { introSkipped } from './introSkip';

describe('introSkipped', () => {
  it('skips the titles for ads and click ids', () => {
    expect(introSkipped('?utm_source=yandex&utm_medium=cpc', '')).toBe(true);
    expect(introSkipped('?yclid=123', '')).toBe(true);
    expect(introSkipped('?gclid=abc', '')).toBe(true);
    expect(introSkipped('?a=1&ysclid=xyz', '')).toBe(true);
  });

  it('skips the titles for visitors from a search engine', () => {
    expect(introSkipped('', 'https://yandex.ru/search/?text=аренда')).toBe(true);
    expect(introSkipped('', 'https://www.google.com/')).toBe(true);
    expect(introSkipped('', 'https://ya.ru/')).toBe(true);
    expect(introSkipped('', 'https://go.mail.ru/search?q=1')).toBe(true);
    expect(introSkipped('', 'https://www.bing.com')).toBe(true);
  });

  it('plays them for a direct visit or an ordinary link', () => {
    expect(introSkipped('', '')).toBe(false);
    expect(introSkipped('?page=2', 'https://vk.com/wall1')).toBe(false);
    expect(introSkipped('', 'https://notyandex.example.org/')).toBe(false);
    expect(introSkipped('', 'https://yandexx.example.com/')).toBe(false);
  });
});
