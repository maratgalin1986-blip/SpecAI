import { prisma } from '@specai/database';
import { SITE } from '@/lib/site';

/**
 * «После выполненного заказа» (docs/launch-plan.md § 6, roadmap № 3): the
 * customer whose booking was completed hears once — in the same status
 * message — «оцените исполнителя», «отзыв о площадке в 2ГИС и Яндекс Картах»
 * and «Пригласите коллегу». The two map cards are the platform's own; the
 * owner enters their links in the admin menu (AppSetting). Until he does,
 * those lines are simply left out. No rewards for reviews: the maps' rules
 * and ФЗ «О рекламе» forbid buying them.
 */
export const REVIEW_KEYS = {
  twoGis: 'reviews.2gis',
  yandex: 'reviews.yandex',
} as const;

export type ReviewLinkKind = keyof typeof REVIEW_KEYS;

const KEY_LIST = Object.values(REVIEW_KEYS);

const HOSTS: Record<ReviewLinkKind, readonly string[]> = {
  twoGis: ['2gis.ru', '2gis.com'],
  yandex: ['yandex.ru', 'yandex.com'],
};

export const REVIEW_URL_MAX = 500;

function hostAllowed(host: string, allowed: readonly string[]): boolean {
  return allowed.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

/**
 * A link the owner pasted → the https link to store; '' clears it; anything
 * else (another site, http, junk) → null.
 */
export function normalizeReviewUrl(kind: ReviewLinkKind, input: unknown): string | null {
  if (input === null || input === undefined) return '';
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return '';
  if (trimmed.length > REVIEW_URL_MAX) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  if (!hostAllowed(host, HOSTS[kind])) return null;
  // Only the Maps card on Yandex: not a search page, Disk or Mail by mistake.
  if (kind === 'yandex') {
    if (!HOSTS.yandex.includes(host.replace(/^www\./, ''))) return null;
    if (!/^\/(maps|profile)(\/|$)/.test(url.pathname)) return null;
  }
  return url.toString();
}

export interface ReviewLinks {
  twoGis: string;
  yandex: string;
  updatedAt: string | null;
}

/** Stored rows → links; a stored value that is no longer valid is ignored. */
export function linksFromRows(
  rows: readonly { key: string; value: string; updatedAt?: Date | string | null }[],
): ReviewLinks {
  const byKey = new Map(rows.map((row) => [row.key, row]));
  const read = (kind: ReviewLinkKind) =>
    normalizeReviewUrl(kind, byKey.get(REVIEW_KEYS[kind])?.value ?? '') ?? '';
  const updated = rows
    .map((row) => (row.updatedAt ? new Date(row.updatedAt).getTime() : NaN))
    .filter((time) => Number.isFinite(time));
  return {
    twoGis: read('twoGis'),
    yandex: read('yandex'),
    updatedAt: updated.length ? new Date(Math.max(...updated)).toISOString() : null,
  };
}

export async function loadReviewLinks(): Promise<ReviewLinks> {
  const rows = await prisma.appSetting.findMany({
    where: { key: { in: KEY_LIST } },
    orderBy: { key: 'asc' },
    take: KEY_LIST.length,
  });
  return linksFromRows(rows);
}

export type ReviewLinksUpdate = { twoGis: string; yandex: string };

const ERRORS: Record<ReviewLinkKind, string> = {
  twoGis: 'Ссылка на 2ГИС должна начинаться с https://2gis.ru/ (скопируйте её из карточки в 2ГИС)',
  yandex:
    'Ссылка на Яндекс Карты должна начинаться с https://yandex.ru/maps/ (скопируйте её из карточки)',
};

/** The admin form → links to store, or the reason in plain Russian. A field not sent keeps its value. */
export function parseReviewLinksUpdate(
  body: unknown,
  current: ReviewLinksUpdate = { twoGis: '', yandex: '' },
): { ok: true; value: ReviewLinksUpdate } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Пустой запрос' };
  const input = body as Record<string, unknown>;
  const value = { ...current };
  for (const kind of ['twoGis', 'yandex'] as const) {
    if (input[kind] === undefined) continue;
    const link = normalizeReviewUrl(kind, input[kind]);
    if (link === null) return { ok: false, error: ERRORS[kind] };
    value[kind] = link;
  }
  return { ok: true, value };
}

export async function saveReviewLinks(update: ReviewLinksUpdate): Promise<ReviewLinks> {
  await prisma.$transaction(
    (['twoGis', 'yandex'] as const).map((kind) => {
      const key = REVIEW_KEYS[kind];
      const value = update[kind];
      return value
        ? prisma.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } })
        : prisma.appSetting.deleteMany({ where: { key } });
    }),
  );
  return loadReviewLinks();
}

/**
 * The lines added to «Бронь завершена» for the customer, in order: thanks,
 * rate the provider (the message's own link leads to the booking), the
 * platform's map cards (only those set), invite a colleague (only with a
 * personal link). Not in the push or SMS: they keep their one short line.
 */
export function completionFollowUp(params: {
  links: Pick<ReviewLinks, 'twoGis' | 'yandex'>;
  inviteUrl: string | null;
}): string[] {
  const lines = [
    `Спасибо, что заказали через ${SITE.platform} от ${SITE.name}!`,
    'Оцените исполнителя — форма отзыва у этой брони в кабинете, ссылка ниже.',
  ];
  const maps = [
    params.links.twoGis ? `2ГИС — ${params.links.twoGis}` : null,
    params.links.yandex ? `Яндекс Карты — ${params.links.yandex}` : null,
  ].filter((line): line is string => line !== null);
  if (maps.length) lines.push(`Оставьте отзыв о площадке: ${maps.join(', ')}`);
  if (params.inviteUrl) {
    lines.push(`Пригласите коллегу — нужна техника? Отправьте ему ссылку: ${params.inviteUrl}`);
  }
  return lines;
}
