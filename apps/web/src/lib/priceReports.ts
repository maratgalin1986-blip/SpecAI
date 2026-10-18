// «Узнай цены в своём городе» (2026-10-18): the open price survey. The
// platform asks as itself; people answer voluntarily (the site's form, or a
// private chat they start with the bot) and get the colleagues' prices back at
// once (lib/priceIndex.ts, k-anonymous). Name, company and phone are optional
// and kept only with the consent tick (152-ФЗ); without it nothing personal is
// stored. Pure helpers, safe for client components; the hash of the reporter
// is made on the server (lib/priceReportStore.ts).

import { z } from 'zod';
import { CATEGORY_SLUGS, categoryBySlug, categoryName, cityByName } from '@specai/shared';
import type { RateLimitOptions } from './rateLimit';

export const PRICE_SURVEY_PATH = '/ceny/opros';

export const PRICE_SURVEY_TITLE = 'Сколько берут за технику в вашем городе?';
export const PRICE_SURVEY_LEAD = 'Ответьте на 3 вопроса — сразу покажем цены коллег.';

/** The source of an answer (a string column, CLAUDE.md rule 2). */
export type PriceReportSource = 'web' | 'telegram' | 'group';

/**
 * Sane hourly prices with an operator, ₽ — only to catch typos and jokes
 * («1», «999999»), generous on purpose: lifting machinery (heavy cranes) may
 * cost more, small equipment (generators, compressors) less.
 */
export const PRICE_BOUNDS: Record<'default' | 'lifting' | 'equipment', [number, number]> = {
  default: [500, 30_000],
  lifting: [500, 60_000],
  equipment: [100, 15_000],
};

export function priceBoundsFor(categorySlug: string): [number, number] {
  const group = categoryBySlug(categorySlug)?.group;
  if (group === 'lifting') return PRICE_BOUNDS.lifting;
  if (group === 'equipment') return PRICE_BOUNDS.equipment;
  return PRICE_BOUNDS.default;
}

export function priceInBounds(categorySlug: string, hourly: number): boolean {
  const [min, max] = priceBoundsFor(categorySlug);
  return Number.isInteger(hourly) && hourly >= min && hourly <= max;
}

/** Per hour from one address and, in the database, from one reporter. */
export const PRICE_SURVEY_RATE_LIMIT: RateLimitOptions = { limit: 5, windowMs: 60 * 60 * 1000 };
/** Answers one reporter may leave in an hour (checked in the database: all instances). */
export const PRICE_SURVEY_DB_LIMIT = 5;

export const PRICE_SURVEY_CONSENT_ERROR =
  'Отметьте согласие на обработку персональных данных — или уберите имя, компанию и телефон';

const PHONE_CHARS_RE = /^[\d\s()+\-.]+$/;
const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .optional()
    .nullable()
    .transform((value) => value || null);

export const priceSurveySchema = z.object({
  categorySlug: z.enum(CATEGORY_SLUGS, { message: 'Выберите вид техники' }),
  city: z
    .string({ message: 'Выберите город' })
    .trim()
    .refine((value) => cityByName(value) !== null, 'Выберите город из списка'),
  hourlyRate: z.coerce
    .number({ message: 'Укажите цену за час числом' })
    .int('Цену за час — в целых рублях'),
  companyName: optionalText(120, 'Название компании — не длиннее 120 символов'),
  contactName: optionalText(100, 'Имя — не длиннее 100 символов'),
  phone: optionalText(30, 'Телефон слишком длинный').refine(
    (value) =>
      value === null ||
      (PHONE_CHARS_RE.test(value) &&
        value.replace(/\D/g, '').length >= 10 &&
        value.replace(/\D/g, '').length <= 15),
    'Телефон — от 10 цифр, например +7 900 000-00-00',
  ),
  wantsOrders: z.boolean().optional().default(false),
  consent: z.boolean().optional().default(false),
});

export type PriceSurveyInput = z.input<typeof priceSurveySchema>;

/** The row to store, or the reason to refuse: bounds and the consent rule. */
export function priceReportData(
  body: unknown,
  now: Date,
):
  | {
      ok: true;
      data: {
        categorySlug: string;
        city: string;
        region: string;
        hourlyRate: number;
        companyName: string | null;
        contactName: string | null;
        phone: string | null;
        wantsOrders: boolean;
        consentAt: Date | null;
      };
    }
  | { ok: false; error: string } {
  const parsed = priceSurveySchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Проверьте ответы' };
  }
  const input = parsed.data;
  if (!priceInBounds(input.categorySlug, input.hourlyRate)) {
    const [min, max] = priceBoundsFor(input.categorySlug);
    return {
      ok: false,
      error: `Похоже на опечатку: цена за час для «${categoryName(input.categorySlug)}» — от ${min} до ${max} ₽`,
    };
  }
  const personal = Boolean(input.companyName || input.contactName || input.phone);
  if (personal && !input.consent) return { ok: false, error: PRICE_SURVEY_CONSENT_ERROR };
  const city = cityByName(input.city)!;
  // Without consent nothing personal is kept (there is nothing then anyway).
  const consented = personal && input.consent;
  return {
    ok: true,
    data: {
      categorySlug: input.categorySlug,
      city: city.name,
      region: city.region,
      hourlyRate: input.hourlyRate,
      companyName: consented ? input.companyName : null,
      contactName: consented ? input.contactName : null,
      phone: consented ? input.phone : null,
      wantsOrders: input.wantsOrders,
      consentAt: consented ? now : null,
    },
  };
}

/** Whether the honeypot field («website») was filled: a bot. */
export function isSurveyHoneypot(body: unknown): boolean {
  const value = (body as { website?: unknown } | null)?.website;
  return typeof value === 'string' && value.trim() !== '';
}

/** The index key of a stored answer: one participant counts once. */
export function reporterKey(report: {
  id: string;
  reporterHash: string | null;
  networkHash?: string | null;
}): string {
  // A guest counts by his network; a provider's own answer as his company,
  // like his machines («c:…», lib/reporterHash.ts).
  if (report.networkHash) return report.networkHash;
  if (report.reporterHash?.startsWith('c:')) return report.reporterHash;
  return report.reporterHash ? `r:${report.reporterHash}` : `r:${report.id}`;
}

/**
 * The network a guest answers from (IPv4 /24, IPv6 /48): a few addresses of
 * one provider's network count as one participant in the index.
 */
export function ipSubnet(ip: string): string {
  const text = ip.trim().toLowerCase();
  // IPv4, also inside IPv6 («::ffff:1.2.3.4»).
  const v4 = /(?:^|:)(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/.exec(text);
  if (v4) return `${v4[1]}.${v4[2]}.${v4[3]}`;
  if (!text.includes(':')) return text;
  // «2a02:6b8::1» → 8 groups, then the first three (/48).
  const [head = '', tail = ''] = text.split('::');
  const left = head ? head.split(':') : [];
  const right = text.includes('::') && tail ? tail.split(':') : [];
  const groups = text.includes('::')
    ? [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill('0'), ...right]
    : text.split(':');
  return groups
    .slice(0, 3)
    .map((group) => group.replace(/^0+(?=.)/, '') || '0')
    .join(':');
}

// ---------------------------------------------------------------------------
// The owner's database (/admin «Опрос цен»)
// ---------------------------------------------------------------------------

export interface AdminPriceReport {
  id: string;
  categorySlug: string | null;
  city: string | null;
  region: string | null;
  hourlyRate: number | null;
  shiftRate?: number | null;
  /** The machine as the owner wrote it in the group («JCB 3CX»). */
  machineName?: string | null;
  /** The group reply as written (≤ 500 characters). */
  rawText?: string | null;
  /** The author's public Telegram name in the owner's group (admin only). */
  authorName?: string | null;
  companyName: string | null;
  contactName: string | null;
  phone: string | null;
  wantsOrders: boolean;
  consentAt: Date | null;
  source: string;
  createdAt: Date;
}

/** What /admin and the CSV read; the reporter's hash stays on the server. */
export const ADMIN_PRICE_REPORT_SELECT = {
  id: true,
  categorySlug: true,
  city: true,
  region: true,
  hourlyRate: true,
  shiftRate: true,
  machineName: true,
  rawText: true,
  authorName: true,
  companyName: true,
  contactName: true,
  phone: true,
  wantsOrders: true,
  consentAt: true,
  source: true,
  createdAt: true,
} as const;

/** Name, company and phone only where the person consented (never otherwise, even if stored). */
export function personalFields(report: AdminPriceReport) {
  return report.consentAt
    ? { companyName: report.companyName, contactName: report.contactName, phone: report.phone }
    : { companyName: null, contactName: null, phone: null };
}

export const SOURCE_LABELS: Record<string, string> = {
  web: 'сайт',
  telegram: 'Telegram-бот',
  group: 'чат с ботом',
};

/**
 * One CSV cell: quoted, and a leading = + - @ neutralised (no formulas in
 * Excel). A plain phone number («+7 900 000-00-00») cannot be a formula and
 * stays as it is.
 */
function csvCell(value: string | number | null): string {
  let text = value === null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text) && !/^\+?[\d\s()-]+$/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

const CSV_HEADER = [
  'Дата (МСК)',
  'Вид техники',
  'Техника (как написали)',
  'Город',
  'Регион',
  'Цена за час, ₽',
  'Цена за смену, ₽',
  'Автор в группе',
  'Текст ответа',
  'Компания',
  'Имя',
  'Телефон',
  'Хочет заявки',
  'Согласие',
  'Источник',
];

/** The owner's export: «;»-separated, with a BOM so Excel opens Cyrillic right. */
export function priceReportsCsv(reports: readonly AdminPriceReport[]): string {
  const lines = [CSV_HEADER.map(csvCell).join(';')];
  for (const report of reports) {
    const personal = personalFields(report);
    lines.push(
      [
        report.createdAt.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' }),
        report.categorySlug ? categoryName(report.categorySlug) : null,
        report.machineName ?? null,
        report.city,
        report.region,
        report.hourlyRate,
        report.shiftRate ?? null,
        report.authorName ?? null,
        report.rawText ?? null,
        personal.companyName,
        personal.contactName,
        personal.phone,
        report.wantsOrders ? 'да' : 'нет',
        report.consentAt ? 'да' : 'нет',
        SOURCE_LABELS[report.source] ?? report.source,
      ]
        .map(csvCell)
        .join(';'),
    );
  }
  return `\ufeff${lines.join('\r\n')}\r\n`;
}
