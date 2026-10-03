import { describe, expect, it } from 'vitest';
import { awayTitle, COPY_SOURCE_LINE, keepsTitle, SITE_HOST, withCopySource } from './brandMoments';

const LONG =
  'Экскаватор-погрузчик копает траншеи, котлованы и ямы под септик, планирует участок, ' +
  'грузит грунт в самосвал и убирает снег. Машинист приезжает со своей машиной, ' +
  'подачу считаем от базы до объекта, работаем по Набережным Челнам и Татарстану.';

describe('withCopySource', () => {
  it('adds the source line to long copied text', () => {
    expect(LONG.length).toBeGreaterThan(200);
    const out = withCopySource(LONG);
    expect(out.startsWith(LONG)).toBe(true);
    expect(out.endsWith(COPY_SOURCE_LINE)).toBe(true);
    expect(COPY_SOURCE_LINE).toBe(`— СпецПласт16, ${SITE_HOST}`);
  });

  it('leaves short text, phones and prices alone', () => {
    expect(withCopySource('+7 (927) 242-80-88')).toBe('+7 (927) 242-80-88');
    expect(withCopySource('3 500 ₽/ч')).toBe('3 500 ₽/ч');
    expect(withCopySource('Аренда экскаватора')).toBe('Аренда экскаватора');
    const phones = '+7 (927) 242-80-88, '.repeat(15);
    expect(withCopySource(phones)).toBe(phones);
    const prices = 'от 3 500 ₽/ч, 28 000 ₽/смена; '.repeat(10);
    expect(withCopySource(prices)).toBe(prices);
  });

  it('does not add the line twice', () => {
    const once = withCopySource(LONG);
    expect(withCopySource(once)).toBe(once);
  });

  it('never shortens the brand', () => {
    expect(withCopySource(LONG)).not.toContain('СП16');
  });
});

describe('tab title', () => {
  it('names the company and fits a tab', () => {
    for (const path of ['/', '/stroyka', '/smeta', '/equipment']) {
      const title = awayTitle(path);
      expect(title).toContain('СпецПласт16');
      expect(title).not.toContain('СП16');
      expect(title.length).toBeLessThan(40);
    }
  });

  it('keeps staff and legal pages as they are', () => {
    expect(keepsTitle('/admin')).toBe(true);
    expect(keepsTitle('/privacy')).toBe(true);
    expect(keepsTitle('/equipment')).toBe(false);
  });
});
