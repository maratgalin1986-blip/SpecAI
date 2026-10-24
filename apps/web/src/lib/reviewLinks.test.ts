import { describe, expect, it, vi } from 'vitest';

vi.mock('@specai/database', () => ({ prisma: {} }));

const { completionFollowUp, linksFromRows, normalizeReviewUrl, parseReviewLinksUpdate } =
  await import('./reviewLinks');

describe('normalizeReviewUrl', () => {
  it('accepts the map cards over https, subdomains included', () => {
    expect(normalizeReviewUrl('twoGis', 'https://2gis.ru/kazan/firm/70000001')).toBe(
      'https://2gis.ru/kazan/firm/70000001',
    );
    expect(normalizeReviewUrl('twoGis', 'https://go.2gis.com/abc')).toBe('https://go.2gis.com/abc');
    expect(normalizeReviewUrl('yandex', 'https://yandex.ru/maps/org/spetsplast/123/')).toBe(
      'https://yandex.ru/maps/org/spetsplast/123/',
    );
    expect(normalizeReviewUrl('yandex', '  ')).toBe('');
  });

  it('refuses other sites, http, look-alikes and the other map', () => {
    expect(normalizeReviewUrl('twoGis', 'http://2gis.ru/x')).toBeNull();
    expect(normalizeReviewUrl('twoGis', 'https://2gis.ru.evil.example/x')).toBeNull();
    expect(normalizeReviewUrl('twoGis', 'https://not2gis.ru/x')).toBeNull();
    expect(normalizeReviewUrl('yandex', 'https://2gis.ru/x')).toBeNull();
    expect(normalizeReviewUrl('yandex', 'javascript:alert(1)')).toBeNull();
    expect(normalizeReviewUrl('yandex', 'https://user:pw@yandex.ru/maps')).toBeNull();
    expect(normalizeReviewUrl('yandex', 42)).toBeNull();
    // Yandex, but not the Maps card: a search page, Disk, the short ya.ru.
    expect(normalizeReviewUrl('yandex', 'https://yandex.ru/search/?text=x')).toBeNull();
    expect(normalizeReviewUrl('yandex', 'https://disk.yandex.ru/maps/x')).toBeNull();
    expect(normalizeReviewUrl('yandex', 'https://www.yandex.ru/maps/org/1/')).toBe(
      'https://www.yandex.ru/maps/org/1/',
    );
    expect(normalizeReviewUrl('yandex', 'https://ya.ru/maps/org/1')).toBeNull();
    expect(normalizeReviewUrl('yandex', 'https://yandex.ru/mapsfake')).toBeNull();
  });
});

describe('linksFromRows', () => {
  it('ignores a stored value that is no longer a valid link', () => {
    expect(
      linksFromRows([
        { key: 'reviews.2gis', value: 'https://evil.example' },
        { key: 'reviews.yandex', value: 'https://yandex.ru/maps/org/1/' },
      ]),
    ).toEqual({ twoGis: '', yandex: 'https://yandex.ru/maps/org/1/', updatedAt: null });
  });
});

describe('parseReviewLinksUpdate', () => {
  it('keeps fields that were not sent', () => {
    expect(
      parseReviewLinksUpdate({ yandex: '' }, { twoGis: 'https://2gis.ru/a', yandex: 'x' }),
    ).toEqual({ ok: true, value: { twoGis: 'https://2gis.ru/a', yandex: '' } });
  });
  it('explains a wrong link in Russian', () => {
    const result = parseReviewLinksUpdate({ twoGis: 'https://example.com' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('2ГИС');
  });
});

describe('completionFollowUp', () => {
  it('thanks, asks to rate, lists the map cards and the invitation', () => {
    const lines = completionFollowUp({
      links: { twoGis: 'https://2gis.ru/a', yandex: 'https://yandex.ru/maps/org/1/' },
      inviteUrl: 'https://spec-ai-web.vercel.app/r/ABCDEFG',
    });
    expect(lines[0]).toBe('Спасибо, что заказали через ИИСтройка24 от СпецПласт16!');
    expect(lines[1]).toContain('Оцените исполнителя');
    expect(lines[2]).toBe(
      'Оставьте отзыв о площадке: 2ГИС — https://2gis.ru/a, Яндекс Карты — https://yandex.ru/maps/org/1/',
    );
    expect(lines[3]).toContain('Пригласите коллегу — нужна техника?');
    expect(lines[3]).toContain('/r/ABCDEFG');
  });

  it('leaves out the map line without links and the invitation without a code', () => {
    const lines = completionFollowUp({
      links: { twoGis: '', yandex: '' },
      inviteUrl: null,
    });
    expect(lines).toHaveLength(2);
    expect(lines.join('\n')).not.toMatch(/2ГИС|Яндекс|Пригласите/);
  });

  it('shows only the card that is set', () => {
    const lines = completionFollowUp({
      links: { twoGis: '', yandex: 'https://yandex.ru/maps/org/1/' },
      inviteUrl: null,
    });
    expect(lines[2]).toBe(
      'Оставьте отзыв о площадке: Яндекс Карты — https://yandex.ru/maps/org/1/',
    );
  });
});
