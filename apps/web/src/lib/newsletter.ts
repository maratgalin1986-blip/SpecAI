// «Заявки рядом за неделю»: the weekly letter to users who subscribed
// themselves (lib/newsConsent.ts). Pure parts — the unsubscribe token, who
// gets it, what it says — unit-tested; lib/newsletterData.ts loads the
// numbers and sends from the weekly cron.
//
// Advertising law (ФЗ «О рекламе» ст. 18): only with the person's consent,
// the sender named, the reason given and a one-click unsubscribe in the body
// and in the headers (RFC 8058). Real numbers only: nothing is sent when
// there is nothing true to say; no names, phones or prices of other people.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { escapeHtml, type EmailTemplate } from './emailTemplates';
import { NEAR_KM } from './geo';
import { NEWS_ROLES } from './newsConsent';
import { pluralizeRu } from './pluralize';
import { SITE } from './site';

const DAY_MS = 86_400_000;
/** The letter covers the last 7 days. */
export const NEWS_WINDOW_MS = 7 * DAY_MS;
/** A user gets at most one letter in this time: a retried cron does not resend. */
export const NEWS_INTERVAL_MS = 6 * DAY_MS;

export const NEWS_SUBJECT = `Заявки рядом за неделю — ${SITE.platform}`;

// ---------------------------------------------------------------------------
// Unsubscribe token: HMAC of the user id and the purpose, no expiry.
// ---------------------------------------------------------------------------

const TOKEN_PURPOSE = 'news-unsubscribe:v1';
const USER_ID = /^[A-Za-z0-9_-]{1,64}$/;

function tokenSecret(override?: string): string | null {
  const secret = override ?? process.env.NEXTAUTH_SECRET;
  return secret && secret.trim() ? secret : null;
}

function signature(userId: string, secret: string): string {
  return createHmac('sha256', secret).update(`${TOKEN_PURPOSE}:${userId}`).digest('base64url');
}

/** `<base64url(userId)>.<HMAC>`; null without NEXTAUTH_SECRET (then no letters go). */
export function unsubscribeToken(userId: string, secretOverride?: string): string | null {
  const secret = tokenSecret(secretOverride);
  if (!secret || !USER_ID.test(userId)) return null;
  return `${Buffer.from(userId, 'utf8').toString('base64url')}.${signature(userId, secret)}`;
}

/** The user id of a valid token; null for anything forged, cut or tampered with. */
export function verifyUnsubscribeToken(token: unknown, secretOverride?: string): string | null {
  if (typeof token !== 'string' || token.length > 200) return null;
  const secret = tokenSecret(secretOverride);
  if (!secret) return null;
  const [encoded, given, extra] = token.split('.');
  if (!encoded || !given || extra !== undefined) return null;
  const userId = Buffer.from(encoded, 'base64url').toString('utf8');
  if (!USER_ID.test(userId)) return null;
  const expected = Buffer.from(signature(userId, secret));
  const actual = Buffer.from(given);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  return userId;
}

/** The confirm page (a person) and the one-click address (mail clients, RFC 8058). */
export function unsubscribeUrls(baseUrl: string, token: string) {
  const t = encodeURIComponent(token);
  return { page: `${baseUrl}/unsubscribe?t=${t}`, oneClick: `${baseUrl}/api/unsubscribe?t=${t}` };
}

/** «m***@g***.ru»: enough to recognise one's own address, not to read it. */
export function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.trim().split('@');
  const dot = domain.lastIndexOf('.');
  const host = dot > 0 ? domain.slice(0, dot) : domain;
  const zone = dot > 0 ? domain.slice(dot) : '';
  return `${local.slice(0, 1) || '*'}***@${host.slice(0, 1) || '*'}***${zone}`;
}

// ---------------------------------------------------------------------------
// Who gets it
// ---------------------------------------------------------------------------

/**
 * Subscribed, not unsubscribed, a confirmed real address (technical accounts
 * of guest and chat orders use «.invalid»; an unconfirmed address may belong
 * to someone else, who never agreed), and a role that subscribes.
 */
export function newsSubscribersWhere() {
  return {
    newsConsentAt: { not: null },
    newsUnsubscribedAt: null,
    emailVerified: { not: null },
    role: { in: [...NEWS_ROLES] },
    email: { contains: '@', not: { endsWith: '.invalid' } },
  };
}

/** Subscribers who got no letter in the last NEWS_INTERVAL_MS. */
export function newsRecipientsWhere(now: Date) {
  return {
    ...newsSubscribersWhere(),
    OR: [{ lastNewsAt: null }, { lastNewsAt: { lt: new Date(now.getTime() - NEWS_INTERVAL_MS) } }],
  };
}

/** Line rows of the week, one per machine (a machine two people took counts once). */
export function distinctMachines<T extends { equipmentId: string | null; userId: string }>(
  rows: readonly T[],
): T[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = row.equipmentId ?? `user:${row.userId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** How many points lie within NEAR_KM of `point`. */
export function countNear(
  point: { lat: number; lon: number },
  points: readonly { lat: number; lon: number }[],
  distance: (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => number,
): number {
  return points.filter((other) => distance(point, other) <= NEAR_KM).length;
}

// ---------------------------------------------------------------------------
// What it says
// ---------------------------------------------------------------------------

export interface NationwideStats {
  /** Orders published in the last 7 days (open or already matched). */
  newOrders: number;
  /** Provider companies with at least one machine. */
  providers: number;
  /** Machines that went on the line in the last 7 days. */
  machinesOnLine: number;
}

export type NewsContent =
  | { kind: 'provider'; hasMachines: boolean; matched: number }
  | { kind: 'customer'; near: { providers: number; machinesOnLine: number } | null };

export interface NewsBody {
  lines: string[];
  link: { path: string; label: string };
}

const ORDERS: [string, string, string] = ['заявка', 'заявки', 'заявок'];
const NEW_ORDERS: [string, string, string] = ['новая заявка', 'новые заявки', 'новых заявок'];
const PROVIDERS: [string, string, string] = ['исполнитель', 'исполнителя', 'исполнителей'];
const MACHINES: [string, string, string] = ['машина', 'машины', 'машин'];

const LINE_NUDGE =
  'Выйдите на линию в приложении со свободной машиной — заказчики рядом увидят её на карте.';

function onLineText(count: number): string {
  return `${pluralizeRu(count, MACHINES)} ${count % 10 === 1 && count % 100 !== 11 ? 'выходила' : 'выходили'} на линию`;
}

/** The letter's lines, or null when there is nothing true and useful to say. */
export function newsBody(content: NewsContent, nationwide: NationwideStats): NewsBody | null {
  if (content.kind === 'provider') {
    const feed = { path: '/provider#feed', label: 'Открыть входящие заявки' };
    if (content.matched > 0) {
      return {
        lines: [
          `За 7 дней под вашу технику в вашем радиусе выезда — ${pluralizeRu(content.matched, ORDERS)}, ${content.matched === 1 ? 'она ещё ждёт' : 'они ещё ждут'} предложений.`,
          'Назовите свою цену — заказчик выбирает сам.',
          LINE_NUDGE,
        ],
        link: feed,
      };
    }
    if (nationwide.newOrders === 0) return null;
    return {
      lines: [
        content.hasMachines
          ? 'В вашем радиусе выезда новых заявок под вашу технику за неделю не было.'
          : 'Заявки подбираются под вашу технику, а её в кабинете пока нет — добавьте хотя бы одну машину.',
        `По всей России за неделю — ${pluralizeRu(nationwide.newOrders, NEW_ORDERS)}.`,
        ...(content.hasMachines
          ? ['Проверьте радиус выезда и список техники — так заявки рядом будут доходить до вас.']
          : []),
        LINE_NUDGE,
      ],
      link: content.hasMachines
        ? feed
        : { path: '/provider#add-equipment', label: 'Добавить технику' },
    };
  }

  const order = { path: '/orders#new', label: 'Оставить заявку' };
  const near = content.near;
  const counts =
    near && (near.providers > 0 || near.machinesOnLine > 0)
      ? { ...near, where: `Рядом с местом вашей последней заявки (до ${NEAR_KM} км)` }
      : { ...nationwide, where: 'На площадке по всей России' };
  if (counts.providers === 0 && counts.machinesOnLine === 0) return null;
  const parts = [
    ...(counts.providers > 0 ? [`${pluralizeRu(counts.providers, PROVIDERS)} с техникой`] : []),
    ...(counts.machinesOnLine > 0 ? [`за неделю ${onLineText(counts.machinesOnLine)}`] : []),
  ];
  return {
    lines: [
      `${counts.where}: ${parts.join(', ')}.`,
      'Нужна техника — оставьте заявку, исполнители пришлют свои цены, а вы выберете сами.',
    ],
    link: order,
  };
}

export interface NewsEmail extends EmailTemplate {
  headers: Record<string, string>;
}

/** The letter with the sender, the reason and the unsubscribe link in the body and the headers. */
export function buildNewsEmail(input: {
  name: string;
  body: NewsBody;
  baseUrl: string;
  token: string;
}): NewsEmail {
  const { page, oneClick } = unsubscribeUrls(input.baseUrl, input.token);
  const href = `${input.baseUrl}${input.body.link.path}`;
  const title = 'Заявки рядом за неделю';
  const name = input.name.trim().split(/\s+/)[0] ?? '';
  const greeting = name ? `Здравствуйте, ${name}!` : 'Здравствуйте!';
  // TODO(promise): switch to SITE.promise once lib/site.ts has it.
  const promise = 'Бесплатно и без посредников';
  const platform = `${SITE.platform} от ${SITE.name}`;
  const reason = `Вы получили это письмо, потому что сами подписались на еженедельную рассылку площадки ${platform}.`;
  const sender = `Отправитель: ${SITE.legalName}, ИНН ${SITE.inn}, ${SITE.email}.`;

  const paragraphs = [greeting, ...input.body.lines]
    .map((line) => `<p style="margin:0 0 12px">${escapeHtml(line)}</p>`)
    .join('\n');
  const html = `<!doctype html>
<html lang="ru">
<body style="margin:0;padding:24px;background:#f9fafb;font-family:Arial,Helvetica,sans-serif;color:#111827;font-size:15px;line-height:1.5">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;padding:24px">
<h1 style="margin:0 0 16px;font-size:20px">${escapeHtml(title)}</h1>
${paragraphs}
<p style="margin:20px 0"><a href="${escapeHtml(href)}" style="display:inline-block;padding:10px 18px;background:#0f766e;color:#ffffff;text-decoration:none;border-radius:6px">${escapeHtml(input.body.link.label)}</a></p>
<p style="margin:24px 0 4px;color:#374151;font-size:13px">${escapeHtml(platform)} — ${escapeHtml(promise)}.</p>
<p style="margin:0 0 4px;color:#6b7280;font-size:12px">${escapeHtml(reason)} <a href="${escapeHtml(page)}" style="color:#6b7280">Отписаться</a>.</p>
<p style="margin:0;color:#6b7280;font-size:12px">${escapeHtml(sender)}</p>
</div>
</body>
</html>`;
  const text = [
    title,
    '',
    greeting,
    '',
    ...input.body.lines,
    '',
    `${input.body.link.label}: ${href}`,
    '',
    `— ${platform}. ${promise}.`,
    reason,
    `Отписаться: ${page}`,
    sender,
  ].join('\n');

  return {
    subject: NEWS_SUBJECT,
    html,
    text,
    headers: {
      'List-Unsubscribe': `<${oneClick}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  };
}
