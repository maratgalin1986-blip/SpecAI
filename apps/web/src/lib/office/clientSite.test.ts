import { describe, expect, it } from 'vitest';
import {
  CLIENT_SITE_MAX_PHOTOS,
  galleryPhotos,
  moreSitesHref,
  siteLeadOfflineText,
  siteLeadPayload,
  siteLeadReply,
} from './clientSite';

const PHONE = '+7 843 212-34-56';

describe('galleryPhotos', () => {
  it('keeps at most six photos, in order, without blanks and duplicates', () => {
    const photos = [
      '/api/files/a.jpg',
      ' ',
      '/api/files/a.jpg',
      ...'bcdefgh'.split('').map((x) => `/api/files/${x}.jpg`),
    ];
    const out = galleryPhotos(photos);
    expect(out).toHaveLength(CLIENT_SITE_MAX_PHOTOS);
    expect(out[0]).toBe('/api/files/a.jpg');
    expect(out[1]).toBe('/api/files/b.jpg');
    expect(out).not.toContain(' ');
    expect(new Set(out).size).toBe(out.length);
  });

  it('an empty list stays empty', () => {
    expect(galleryPhotos([])).toEqual([]);
  });
});

describe('moreSitesHref', () => {
  it('is an absolute link to the service page with the client site as the campaign', () => {
    const href = moreSitesHref('https://xn--24-6kc5aagh4arjl.xn--p1ai/', 'ulybka-kazan');
    const url = new URL(href);
    expect(url.origin).toBe('https://xn--24-6kc5aagh4arjl.xn--p1ai');
    expect(url.pathname).toBe('/sajt-pod-klyuch');
    expect(url.searchParams.get('utm_source')).toBe('client-site');
    expect(url.searchParams.get('utm_campaign')).toBe('ulybka-kazan');
  });

  it('without a slug (an example) there is no campaign', () => {
    const url = new URL(moreSitesHref('https://example.ru', null));
    expect(url.searchParams.get('utm_source')).toBe('client-site');
    expect(url.searchParams.has('utm_campaign')).toBe(false);
  });
});

describe('siteLeadPayload', () => {
  it('trims the fields, caps their length and sends the honeypot as is', () => {
    const body = siteLeadPayload({
      slug: 'ulybka-kazan',
      name: '  Анна  ',
      phone: ' +7 927 000-00-00 ',
      message: `  ${'х'.repeat(1200)} `,
      consent: true,
      website: '',
    });
    expect(body).toMatchObject({
      slug: 'ulybka-kazan',
      name: 'Анна',
      phone: '+7 927 000-00-00',
      consent: true,
      website: '',
    });
    expect(body.message).toHaveLength(1000);
    expect(Object.keys(body).sort()).toEqual(
      ['consent', 'message', 'name', 'phone', 'slug', 'website'].sort(),
    );
  });

  it('a bot filling the trap keeps it filled (the server drops the lead)', () => {
    const body = siteLeadPayload({
      slug: 'abc',
      name: 'x',
      phone: '1',
      message: '',
      consent: true,
      website: 'http://spam',
    });
    expect(body.website).toBe('http://spam');
  });
});

describe('siteLeadReply', () => {
  it('ok only on a 2xx with { ok: true }', () => {
    expect(siteLeadReply(200, { ok: true }, PHONE)).toEqual({ ok: true });
    expect(siteLeadReply(200, {}, PHONE).ok).toBe(false);
    expect(siteLeadReply(500, { ok: true }, PHONE).ok).toBe(false);
  });

  it('shows the server error as is, trimmed and capped', () => {
    expect(siteLeadReply(400, { error: '  Проверьте телефон ' }, PHONE)).toEqual({
      ok: false,
      error: 'Проверьте телефон',
    });
    const long = siteLeadReply(400, { error: 'ы'.repeat(500) }, PHONE);
    expect(long.ok === false && long.error.length).toBe(300);
  });

  it('without a server text: by status, always with the company phone', () => {
    for (const status of [429, 404, 500, 502]) {
      const reply = siteLeadReply(status, null, PHONE);
      expect(reply.ok).toBe(false);
      if (!reply.ok) expect(reply.error).toContain(PHONE);
    }
    const limited = siteLeadReply(429, 'not json', PHONE);
    expect(!limited.ok && limited.error).toMatch(/Слишком много заявок/);
  });

  it('the offline text says the lead did not go and names the phone', () => {
    expect(siteLeadOfflineText(PHONE)).toMatch(/не ушла/);
    expect(siteLeadOfflineText(PHONE)).toContain(PHONE);
  });
});
