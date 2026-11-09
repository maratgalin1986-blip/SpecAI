// Свой домен клиента (S7): сайт компании открывается по её адресу (ulybka-kazan.ru), а не только
// по /s/<slug>. Здесь — чистые правила: как записать домен и какие хосты принадлежат самой
// площадке (их middleware никогда не подменяет клиентским сайтом).

import { LEGACY_SITE_HOST, MAIN_DOMAIN_HOST, PENDING_DOMAINS } from '@/lib/siteUrl';

/** Хосты площадки и служебные: на них работает обычный сайт ИИСтройка24. */
const PLATFORM_HOSTS = new Set<string>([
  MAIN_DOMAIN_HOST,
  `www.${MAIN_DOMAIN_HOST}`,
  LEGACY_SITE_HOST,
  ...PENDING_DOMAINS,
  ...PENDING_DOMAINS.map((d) => `www.${d}`),
  'localhost',
  '127.0.0.1',
]);

/** Хост без порта и точки в конце, в нижнем регистре; кириллица → punycode. */
export function normalizeHost(host: string | null | undefined): string {
  const bare = (host ?? '').trim().toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');
  if (!bare) return '';
  try {
    return new URL(`http://${bare}`).hostname;
  } catch {
    return '';
  }
}

/** Свои хосты: домен площадки, старый адрес, превью Vercel, локальная разработка. */
export function isPlatformHost(host: string | null | undefined): boolean {
  const h = normalizeHost(host);
  if (!h) return true;
  return PLATFORM_HOSTS.has(h) || h.endsWith('.vercel.app') || h.endsWith('.localhost');
}

/**
 * Домен клиента из поля админки: «https://www.Ulybka-Kazan.ru/» → «ulybka-kazan.ru»;
 * «улыбка.рф» → punycode. Пусто — null (домен не подключён). Невалидный или свой хост
 * площадки — ошибка по-русски.
 */
export function normalizeDomain(
  input: unknown,
): { ok: true; domain: string | null } | { ok: false; error: string } {
  if (input === null || input === undefined) return { ok: true, domain: null };
  if (typeof input !== 'string') return { ok: false, error: 'Домен — строка вида ulybka-kazan.ru' };
  let raw = input.trim().toLowerCase();
  if (!raw) return { ok: true, domain: null };
  raw = raw
    .replace(/^[a-z]+:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/^www\./, '');
  const host = normalizeHost(raw);
  const labels = host.split('.');
  const valid =
    host.length > 0 &&
    host.length <= 253 &&
    labels.length >= 2 &&
    labels.every((l) => /^[a-z0-9-]{1,63}$/.test(l) && !l.startsWith('-') && !l.endsWith('-')) &&
    /^(xn--[a-z0-9-]+|[a-z]{2,})$/.test(labels[labels.length - 1] ?? '');
  if (!valid) return { ok: false, error: 'Домен — вида ulybka-kazan.ru, без http и путей' };
  if (isPlatformHost(host)) return { ok: false, error: 'Это адрес самой площадки' };
  return { ok: true, domain: host };
}

/** Тот же сайт с «www.» и без: оба хоста ведут на одного клиента. */
export function domainKeys(domain: string): string[] {
  const d = normalizeHost(domain).replace(/^www\./, '');
  return d ? [d, `www.${d}`] : [];
}
