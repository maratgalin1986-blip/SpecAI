import { describe, expect, it } from 'vitest';
import { domainKeys, isPlatformHost, normalizeDomain, normalizeHost } from './domains';

describe('domains', () => {
  it('normalizeHost: регистр, порт, точка, кириллица', () => {
    expect(normalizeHost('Ulybka.RU:443')).toBe('ulybka.ru');
    expect(normalizeHost('ulybka.ru.')).toBe('ulybka.ru');
    expect(normalizeHost('улыбка.рф')).toBe('xn--80ab1ac3bxc.xn--p1ai');
    expect(normalizeHost('')).toBe('');
  });

  it('свои хосты площадки не считаются клиентскими', () => {
    expect(isPlatformHost('xn--24-6kc5aagh4arjl.xn--p1ai')).toBe(true);
    expect(isPlatformHost('иистройка24.рф')).toBe(true);
    expect(isPlatformHost('spec-ai-web.vercel.app')).toBe(true);
    expect(isPlatformHost('spec-ai-web-git-x-marat10.vercel.app')).toBe(true);
    expect(isPlatformHost('localhost:3000')).toBe(true);
    expect(isPlatformHost('ulybka-kazan.ru')).toBe(false);
  });

  it('normalizeDomain: чистит ввод, отклоняет мусор и свой домен', () => {
    expect(normalizeDomain('https://www.Ulybka-Kazan.ru/kontakty')).toEqual({
      ok: true,
      domain: 'ulybka-kazan.ru',
    });
    expect(normalizeDomain('')).toEqual({ ok: true, domain: null });
    expect(normalizeDomain(null)).toEqual({ ok: true, domain: null });
    expect(normalizeDomain('улыбка.рф')).toEqual({ ok: true, domain: 'xn--80ab1ac3bxc.xn--p1ai' });
    expect(normalizeDomain('ulybka')).toMatchObject({ ok: false });
    expect(normalizeDomain('-bad-.ru')).toMatchObject({ ok: false });
    expect(normalizeDomain('иистройка24.рф')).toMatchObject({ ok: false });
    expect(domainKeys('www.ulybka.ru')).toEqual(['ulybka.ru', 'www.ulybka.ru']);
  });
});
