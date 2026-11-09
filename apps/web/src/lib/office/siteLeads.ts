// Заявки с клиентских сайтов «Сайты под ключ» (S4): посетитель опубликованного сайта
// /s/<slug> (или домена клиента) оставляет имя, телефон и комментарий, площадка сохраняет
// заявку (SiteLead), пересылает её письмом на почту компании и коротко сообщает владельцу
// в Telegram. Публичный адрес без входа (REVIEW.md §2): ловушка для ботов, лимит по IP и не
// больше SITE_LEAD_DAILY_CAP заявок в сутки на сайт; ответ — только `{ ok }` или текст ошибки.
//
// Здесь — вся логика приёма: база, письмо, уведомление, часы и лимит приходят извне
// (`acceptSiteLead(input, deps)`), поэтому модуль проверяется тестами без сети и базы.
// Комментарий не маскируется (lib/privacy.ts): его читает только сама компания, которой
// посетитель и пишет, с галочкой согласия на передачу имени и телефона.

import { z } from 'zod';
import type { SendEmailInput, SendEmailResult } from '@/lib/email';
import { escapeHtml } from '@/lib/emailTemplates';
import type { RateLimitOptions, RateLimitResult } from '@/lib/rateLimit';
import { SITE } from '@/lib/site';
import { domainKeys, normalizeHost } from './domains';
import { phoneDigits, phoneText, quotedName } from './pages';
import { parseSiteContent } from './siteContent';
import { candidateEmail, candidatePhone } from './sources/phone';

/** Длины полей формы — те же, что у SiteLeadForm (lib/office/clientSite.ts). */
export const SITE_LEAD_LIMITS = { name: 80, phone: 30, message: 1000 } as const;

/** Лимит по IP: 5 заявок за 10 минут (ключ `site-lead:ip:<ip>`). */
export const SITE_LEAD_IP_LIMIT: RateLimitOptions = { limit: 5, windowMs: 10 * 60 * 1000 };

/** Больше заявок на один сайт за сутки (скользящие 24 часа) не принимаем — защита почты компании. */
export const SITE_LEAD_DAILY_CAP = 50;

/** Письмо компании не дольше этого, мс: посетитель ждёт ответа формы. */
export const SITE_LEAD_SEND_TIMEOUT_MS = 8_000;

/** Длина `forwardError` в базе. */
export const FORWARD_ERROR_MAX = 300;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Адрес опубликованного сайта, как в `visibility.ts` (SLUG_RE). */
const SLUG_RE = /^[a-z0-9-]{3,80}$/;

/** Управляющие символы (кроме перевода строки и табуляции) из текста посетителя убираем. */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** Строка без управляющих символов, пробелы подряд — один пробел (имя, тема письма). */
function oneLine(value: string): string {
  return value.replace(CONTROL_CHARS, '').replace(/\s+/g, ' ').trim();
}

/** Многострочный текст: переводы строк сохраняются, лишние пустые строки — нет. */
function multiLine(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(CONTROL_CHARS, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const NAME_ERROR = 'Как к вам обращаться? Напишите имя';
const PHONE_ERROR = 'Укажите российский номер телефона: от 10 цифр';
const CONSENT_ERROR = 'Отметьте согласие на передачу имени и телефона компании';

export const siteLeadSchema = z.object({
  slug: z
    .string({ message: 'Форма не знает, с какого она сайта. Обновите страницу' })
    .regex(SLUG_RE, 'Форма не знает, с какого она сайта. Обновите страницу'),
  name: z
    .string({ message: NAME_ERROR })
    .transform(oneLine)
    .pipe(
      z
        .string()
        .min(1, NAME_ERROR)
        .max(SITE_LEAD_LIMITS.name, `Имя — не длиннее ${SITE_LEAD_LIMITS.name} символов`),
    ),
  phone: z
    .string({ message: PHONE_ERROR })
    .trim()
    .max(SITE_LEAD_LIMITS.phone, PHONE_ERROR)
    .transform((value, ctx) => {
      const phone = candidatePhone(value);
      if (!phone) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: PHONE_ERROR });
        return z.NEVER;
      }
      return phone;
    }),
  message: z
    .string({ message: 'Комментарий — текстом' })
    .nullish()
    .transform((value) => multiLine(value ?? ''))
    .pipe(
      z
        .string()
        .max(
          SITE_LEAD_LIMITS.message,
          `Комментарий — не длиннее ${SITE_LEAD_LIMITS.message} символов`,
        ),
    )
    .transform((value) => value || null),
  // Согласие на передачу имени и телефона компании (152-ФЗ) обязательно.
  consent: z.literal(true, { errorMap: () => ({ message: CONSENT_ERROR }) }),
});

export type SiteLeadInput = z.output<typeof siteLeadSchema>;

/**
 * Бот заполнил скрытое поле `website` (любое непустое значение): отвечаем «принято», ничего
 * не сохраняем и не пересылаем — ошибка про это поле выдала бы ловушку.
 */
export function isSiteLeadHoneypot(body: unknown): boolean {
  if (!body || typeof body !== 'object' || !('website' in body)) return false;
  const value = (body as { website: unknown }).website;
  return value !== undefined && value !== null && value !== '';
}

/** Что нужно приёму о сайте: только для проверок и письма, в ответ ничего из этого не уходит. */
export const SITE_LEAD_PROSPECT_SELECT = {
  id: true,
  kind: true,
  status: true,
  slug: true,
  name: true,
  email: true,
  domain: true,
  siteJson: true,
} as const;

export interface SiteLeadProspect {
  id: string;
  kind: string;
  status: string;
  slug: string;
  name: string;
  email: string | null;
  domain: string | null;
  siteJson: string | null;
}

/** Ровно те запросы, которые делает приём (prisma подходит структурно). */
export interface SiteLeadDb {
  prospect: {
    findUnique(args: {
      where: { slug: string };
      select: typeof SITE_LEAD_PROSPECT_SELECT;
    }): Promise<SiteLeadProspect | null>;
  };
  siteLead: {
    count(args: { where: { prospectId: string; createdAt: { gte: Date } } }): Promise<number>;
    create(args: {
      data: {
        prospectId: string;
        name: string;
        phone: string;
        message: string | null;
        createdAt: Date;
      };
      select: { id: true };
    }): Promise<{ id: string }>;
    update(args: {
      where: { id: string };
      data: { forwardedAt?: Date; forwardError?: string };
    }): Promise<unknown>;
  };
}

export interface SiteLeadDeps {
  db: SiteLeadDb;
  sendEmail: (input: SendEmailInput) => Promise<SendEmailResult>;
  /** Строка владельцу в Telegram (`notifyTelegram`): true — доставлена. */
  notify: (text: string) => Promise<boolean>;
  now: () => Date;
  /** Лимит по ключу, каждый вызов засчитывается (`checkRateLimit`). */
  rateLimit: (key: string, options: RateLimitOptions) => RateLimitResult;
  /** Адрес площадки (`siteUrl()`): ссылка на сайт в письме, если заявка пришла не с домена клиента. */
  baseUrl: string;
  /** Тайм-аут письма, мс (по умолчанию SITE_LEAD_SEND_TIMEOUT_MS). */
  sendTimeoutMs?: number;
}

export interface SiteLeadRequest {
  /** Тело запроса как пришло (JSON). */
  body: unknown;
  /** IP посетителя — только для лимита, не сохраняется. */
  ip: string;
  /** Host запроса: заявка с домена клиента — в письме его адрес, а не /s/<slug>. */
  host?: string | null;
}

export type SiteLeadBody = { ok: true } | { error: string };

export interface SiteLeadOutcome {
  status: 200 | 400 | 404 | 429 | 503;
  body: SiteLeadBody;
  /** Для заголовка Retry-After при 429. */
  retryAfterSec?: number;
}

const OK: SiteLeadOutcome = { status: 200, body: { ok: true } };

export const SITE_LEAD_ERRORS = {
  invalid: 'Проверьте поля формы',
  tooManyFromIp:
    'Слишком много заявок подряд. Попробуйте через 10 минут или позвоните по телефону на сайте',
  closed: 'Форма сейчас не принимает заявки. Позвоните по телефону на сайте',
  dailyCap: 'Сайт сегодня уже принял много заявок. Позвоните по телефону на сайте',
  unavailable:
    'Не удалось отправить заявку. Попробуйте ещё раз через минуту или позвоните по телефону на сайте',
} as const;

/** Сайт принимает заявки: клиентский сайт опубликован (как `visibleFor(…, 'site')`) и форма не выключена. */
export function acceptsSiteLeads(
  p: Pick<SiteLeadProspect, 'kind' | 'status' | 'siteJson'>,
): boolean {
  if (p.kind !== 'site' || p.status !== 'PUBLISHED') return false;
  return parseSiteContent(p.siteJson).leadForm !== false;
}

/**
 * Адрес сайта для письма: домен клиента, если заявка пришла через него (Host запроса — один из
 * хостов домена сайта), иначе `/s/<slug>` на площадке.
 */
export function siteLeadSiteAddress(
  p: Pick<SiteLeadProspect, 'slug' | 'domain'>,
  host: string | null | undefined,
  baseUrl: string,
): string {
  const requestHost = normalizeHost(host);
  const keys = p.domain ? domainKeys(p.domain) : [];
  if (requestHost && keys.includes(requestHost)) return `https://${keys[0]}`;
  return `${baseUrl.replace(/\/+$/, '')}/s/${encodeURIComponent(p.slug)}`;
}

export interface SiteLeadEmailInput {
  name: string;
  /** `+7XXXXXXXXXX` */
  phone: string;
  message: string | null;
  /** Адрес сайта, с которого пришла заявка. */
  siteAddress: string;
}

/** Письмо компании: кто, телефон ссылкой, комментарий и откуда заявка. Всё от посетителя экранируется. */
export function buildSiteLeadEmail(lead: SiteLeadEmailInput): {
  subject: string;
  text: string;
  html: string;
} {
  const subject = `Заявка с сайта: ${oneLine(lead.name)}`;
  const phone = phoneText(lead.phone);
  const telHref = `tel:+${phoneDigits(lead.phone)}`;
  const origin = `Заявка пришла с вашего сайта ${lead.siteAddress}. Сайт сделан ${SITE.platform} от ${SITE.name}.`;
  const consent = 'Человек согласился передать вам имя и телефон для ответа на эту заявку.';
  const questions = `Вопросы по сайту — звоните ${SITE.phone}.`;

  const text = [
    'Здравствуйте! Новая заявка с вашего сайта.',
    '',
    `Имя: ${lead.name}`,
    `Телефон: ${phone}`,
    ...(lead.message ? ['Комментарий:', lead.message] : []),
    '',
    'Перезвоните, пока человек ждёт ответа.',
    consent,
    '',
    origin,
    questions,
  ].join('\n');

  const row = (label: string, value: string) =>
    `<p style="margin:0 0 8px"><span style="color:#6b7280">${escapeHtml(label)}:</span> ${value}</p>`;
  const paragraph = (value: string, style = 'margin:0 0 12px') =>
    `<p style="${style}">${escapeHtml(value)}</p>`;
  const message = lead.message
    ? `<p style="margin:0 0 4px;color:#6b7280">Комментарий:</p>
<p style="margin:0 0 12px">${escapeHtml(lead.message).replace(/\n/g, '<br>')}</p>`
    : '';
  const html = `<!doctype html>
<html lang="ru">
<body style="margin:0;padding:24px;background:#f9fafb;font-family:Arial,Helvetica,sans-serif;color:#111827;font-size:15px;line-height:1.5">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;padding:24px">
<h1 style="margin:0 0 16px;font-size:20px">${escapeHtml(subject)}</h1>
${row('Имя', escapeHtml(lead.name))}
${row('Телефон', `<a href="${escapeHtml(telHref)}">${escapeHtml(phone)}</a>`)}
${message}
${paragraph('Перезвоните, пока человек ждёт ответа.')}
${paragraph(consent, 'margin:0 0 12px;color:#6b7280;font-size:13px')}
<p style="margin:24px 0 0;color:#6b7280;font-size:13px">Заявка пришла с вашего сайта <a href="${escapeHtml(lead.siteAddress)}">${escapeHtml(lead.siteAddress)}</a>. ${escapeHtml(`Сайт сделан ${SITE.platform} от ${SITE.name}.`)}</p>
${paragraph(questions, 'margin:4px 0 0;color:#6b7280;font-size:13px')}
</div>
</body>
</html>`;
  return { subject, text, html };
}

/** Почему письмо компании не ушло — по-русски, одной строкой, не длиннее FORWARD_ERROR_MAX. */
export function siteLeadForwardError(
  reason: 'no-email' | 'not-configured' | { error: string },
): string {
  const text =
    reason === 'no-email'
      ? 'У компании не указана почта — заявка не переслана'
      : reason === 'not-configured'
        ? 'Почта площадки не настроена — письмо компании не отправлено'
        : `Письмо компании не отправлено: ${oneLine(reason.error) || 'неизвестная ошибка'}`;
  return text.slice(0, FORWARD_ERROR_MAX);
}

/** Строка владельцу: «Заявка с сайта «Улыбка»: Анна, +7 927 …» и, если не ушла, — почему. */
export function siteLeadTelegramText(
  companyName: string,
  lead: { name: string; phone: string },
  problems: { forwardError: string | null; saved: boolean },
): string {
  let line = `Заявка с сайта ${quotedName(oneLine(companyName))}: ${oneLine(lead.name)}, ${phoneText(lead.phone)}`;
  if (problems.forwardError) line += ` — не доставлена клиенту (${problems.forwardError})`;
  if (!problems.saved) line += ' — в базе не сохранена';
  return oneLine(line);
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`почта не ответила за ${Math.round(ms / 1000)} с`)),
      ms,
    );
    promise.then(
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

/** Пересылка компании: `null` — письмо ушло, иначе текст причины для `forwardError`. */
async function forward(
  site: SiteLeadProspect,
  lead: SiteLeadInput,
  siteAddress: string,
  deps: SiteLeadDeps,
): Promise<string | null> {
  const to = candidateEmail(site.email);
  if (!to) return siteLeadForwardError('no-email');
  const letter = buildSiteLeadEmail({ ...lead, siteAddress });
  const sent = await withTimeout(
    deps.sendEmail({ to, subject: letter.subject, html: letter.html, text: letter.text }),
    deps.sendTimeoutMs ?? SITE_LEAD_SEND_TIMEOUT_MS,
  ).catch((error: unknown): SendEmailResult => ({
    skipped: false,
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  }));
  if (sent.skipped) {
    return siteLeadForwardError(sent.reason === 'no recipients' ? 'no-email' : 'not-configured');
  }
  return sent.ok ? null : siteLeadForwardError({ error: sent.error });
}

/**
 * Приём заявки с клиентского сайта: ловушка → проверка полей → лимит по IP → сайт опубликован
 * и форма включена → не больше SITE_LEAD_DAILY_CAP за сутки → сохранить → переслать компании →
 * строка владельцу. Ответ без id и данных компании.
 */
export async function acceptSiteLead(
  request: SiteLeadRequest,
  deps: SiteLeadDeps,
): Promise<SiteLeadOutcome> {
  // Боты, заполнившие ловушку, получают тот же успех — ловушка остаётся незаметной.
  if (isSiteLeadHoneypot(request.body)) return OK;

  const parsed = siteLeadSchema.safeParse(request.body);
  if (!parsed.success) {
    return {
      status: 400,
      body: { error: parsed.error.issues[0]?.message ?? SITE_LEAD_ERRORS.invalid },
    };
  }
  const lead = parsed.data;

  const limited = deps.rateLimit(`site-lead:ip:${request.ip}`, SITE_LEAD_IP_LIMIT);
  if (!limited.ok) {
    return {
      status: 429,
      body: { error: SITE_LEAD_ERRORS.tooManyFromIp },
      retryAfterSec: limited.retryAfterSec,
    };
  }

  const now = deps.now();
  let site: SiteLeadProspect | null;
  let today: number;
  try {
    site = await deps.db.prospect.findUnique({
      where: { slug: lead.slug },
      select: SITE_LEAD_PROSPECT_SELECT,
    });
    if (!site || !acceptsSiteLeads(site)) {
      return { status: 404, body: { error: SITE_LEAD_ERRORS.closed } };
    }
    today = await deps.db.siteLead.count({
      where: { prospectId: site.id, createdAt: { gte: new Date(now.getTime() - DAY_MS) } },
    });
  } catch (error) {
    console.error('[site-lead] lookup failed', error);
    return { status: 503, body: { error: SITE_LEAD_ERRORS.unavailable } };
  }
  if (today >= SITE_LEAD_DAILY_CAP) {
    return { status: 429, body: { error: SITE_LEAD_ERRORS.dailyCap } };
  }

  const saved = await deps.db.siteLead
    .create({
      data: {
        prospectId: site.id,
        name: lead.name,
        phone: lead.phone,
        message: lead.message,
        createdAt: now,
      },
      select: { id: true },
    })
    .catch((error: unknown) => {
      console.error('[site-lead] failed to save', error);
      return null;
    });

  const forwardError = await forward(
    site,
    lead,
    siteLeadSiteAddress(site, request.host, deps.baseUrl),
    deps,
  );
  if (saved) {
    await deps.db.siteLead
      .update({
        where: { id: saved.id },
        data: forwardError ? { forwardError } : { forwardedAt: deps.now() },
      })
      .catch((error: unknown) => console.error('[site-lead] failed to mark forwarding', error));
  }

  const notified = await deps
    .notify(siteLeadTelegramText(site.name, lead, { forwardError, saved: Boolean(saved) }))
    .catch(() => false);

  // Заявка потерялась бы целиком: не сохранена, не ушла компании и владелец не узнал.
  if (!saved && forwardError && !notified) {
    return { status: 503, body: { error: SITE_LEAD_ERRORS.unavailable } };
  }
  return OK;
}
