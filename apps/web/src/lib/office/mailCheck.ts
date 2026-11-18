// Проверка адресов из карточек (владелец, 2026-11-18: «адреса из карточек, мне кажется, не рабочие,
// обнови все»). Карточки на карте заполняют люди, и адрес бывает с опечаткой, чужой, закрытого
// домена или служебный. Письмо на такой адрес — отказ почтового сервера, а доля отказов с ящика
// сама снижает доверие к нему. Проверяем без отправки письма: вид адреса, служебные имена,
// опечатки в известных доменах и главное — принимает ли домен почту (запись MX, иначе A/AAAA).
import { promises as dns } from 'node:dns';
import { isFreeMailDomain } from './candidateFilter';

/** Служебные имена ящиков: ответа от них не будет. */
const JUNK_LOCAL =
  /^(?:no-?reply|do-?not-?reply|mailer-daemon|postmaster|abuse|spam|root|test|example|your-?email|email|mail@mail|name|user|username|admin@admin)$/i;
/** Заглушки вместо настоящего адреса. */
const PLACEHOLDER_DOMAINS = new Set([
  'example.com',
  'example.ru',
  'example.org',
  'domain.com',
  'domain.ru',
  'email.com',
  'site.ru',
  'yoursite.ru',
  'yourdomain.com',
  'test.com',
  'test.ru',
  'sample.com',
  'mysite.ru',
]);
/** Частые опечатки в доменах бесплатных почт — адрес заведомо не доставляется. */
const TYPO_DOMAINS = new Set(
  'mail.ry mial.ru mai.ru maii.ru meil.ru mail.tu mail.rt mail.ruu gmial.com gmai.com gmail.ru gmail.con gmal.com yandex.ry yadex.ru yanex.ru yandx.ru yandex.ru.ru yandec.ru yandex.rus bk.ry inbox.ry list.ry rambler.ry ramler.ru'.split(
    ' ',
  ),
);

const DOMAIN_RE = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;
const LOCAL_RE = /^[a-z0-9._%+'-]{1,64}$/;

/** Причина, по которой адрес не годится, без обращения к сети; null — пока годится. */
export function emailProblem(email: string): string | null {
  const value = email.trim().toLowerCase();
  const at = value.lastIndexOf('@');
  if (at < 1 || value.indexOf('@') !== at) return 'неверный вид адреса';
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  if (
    !LOCAL_RE.test(local) ||
    local.startsWith('.') ||
    local.endsWith('.') ||
    local.includes('..')
  ) {
    return 'неверный вид адреса';
  }
  if (!DOMAIN_RE.test(domain)) return 'неверный домен';
  if (PLACEHOLDER_DOMAINS.has(domain)) return 'заглушка вместо адреса';
  if (JUNK_LOCAL.test(local)) return 'служебный адрес';
  if (TYPO_DOMAINS.has(domain)) return 'опечатка в домене';
  return null;
}

export type DomainMail = 'ok' | 'dead' | 'unknown';

/** Подмена DNS в тестах. */
export interface DnsLike {
  resolveMx(domain: string): Promise<{ exchange: string; priority: number }[]>;
  resolve4(domain: string): Promise<string[]>;
  resolve6(domain: string): Promise<string[]>;
}

const REAL_DNS: DnsLike = {
  resolveMx: (domain) => dns.resolveMx(domain),
  resolve4: (domain) => dns.resolve4(domain),
  resolve6: (domain) => dns.resolve6(domain),
};

/** Ответ DNS «такого имени или записи нет» — домен точно не принимает почту. */
const NO_RECORD = new Set(['ENOTFOUND', 'ENODATA', 'NXDOMAIN']);
const DNS_TIMEOUT_MS = 2_500;
const CACHE_TTL_MS = 6 * 3_600_000;
const cache = new Map<string, { status: DomainMail; at: number }>();

/** Для тестов: забыть кэш доменов. */
export function resetDomainCache(): void {
  cache.clear();
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(Object.assign(new Error('timeout'), { code: 'ETIMEOUT' })),
      ms,
    );
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

const codeOf = (error: unknown): string => (error as { code?: string })?.code ?? 'UNKNOWN';

/**
 * Принимает ли домен почту. Есть MX (не «пустой» MX из точки) — да; MX нет — по правилам почты
 * письмо идёт на A/AAAA домена; нет и их — нет. Сбой или молчание DNS — 'unknown': такой адрес
 * не отбрасываем, чтобы не потерять рабочий из-за сбоя сети.
 */
export async function domainMailStatus(
  domain: string,
  now: Date = new Date(),
  resolver: DnsLike = REAL_DNS,
): Promise<DomainMail> {
  const key = domain.trim().toLowerCase();
  const cached = cache.get(key);
  if (cached && now.getTime() - cached.at < CACHE_TTL_MS) return cached.status;
  const remember = (status: DomainMail): DomainMail => {
    if (status !== 'unknown') cache.set(key, { status, at: now.getTime() });
    return status;
  };
  try {
    const mx = await withTimeout(resolver.resolveMx(key), DNS_TIMEOUT_MS);
    const real = mx.filter((m) => m.exchange && m.exchange !== '.');
    if (real.length > 0) return remember('ok');
    // Единственная запись MX «.» — домен прямо заявляет, что почту не принимает.
    if (mx.length > 0) return remember('dead');
  } catch (error) {
    if (!NO_RECORD.has(codeOf(error))) return 'unknown';
  }
  for (const lookup of [resolver.resolve4, resolver.resolve6]) {
    try {
      const addresses = await withTimeout(lookup.call(resolver, key), DNS_TIMEOUT_MS);
      if (addresses.length > 0) return remember('ok');
    } catch (error) {
      if (!NO_RECORD.has(codeOf(error))) return 'unknown';
    }
  }
  return remember('dead');
}

/**
 * Полная проверка адреса: вид и опечатки, затем домен. Бесплатные почтовые сервисы по DNS не
 * проверяем (их домены живы, неверен бывает сам адрес — это видно только из отказа сервера).
 * null — годится или не удалось проверить; строка — причина.
 */
export async function addressProblem(
  email: string,
  now: Date = new Date(),
  resolver: DnsLike = REAL_DNS,
): Promise<string | null> {
  const basic = emailProblem(email);
  if (basic) return basic;
  const domain = email.trim().toLowerCase().split('@')[1]!;
  if (isFreeMailDomain(domain)) return null;
  const status = await domainMailStatus(domain, now, resolver);
  return status === 'dead' ? 'у домена нет почтового сервера' : null;
}
