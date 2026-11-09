// Правки клиентского сайта из админки (S5): владелец меняет заголовок, тексты, услуги,
// часы, контакты, цвет и фото, не трогая данные карточки кандидата. Хранится JSON-строкой
// в `Prospect.siteJson`; всё необязательное — пустая правка оставляет значение карточки.
// Битый JSON или чужие поля не ломают страницу: parseSiteContent возвращает {}.

import { z } from 'zod';
import { candidatePhone } from './sources/phone';
import { mapHref, phoneDigits, phoneText, whatsappHrefFor, type SitePage } from './pages';

export const SITE_ACCENTS = ['teal', 'amber', 'rose', 'sky', 'lime', 'orange'] as const;

export const SITE_CONTENT_LIMITS = {
  title: 120,
  hero: 200,
  about: 1500,
  service: 80,
  services: 12,
  hours: 160,
  address: 200,
  photos: 6,
} as const;

/**
 * Фото — только из своего хранилища: относительный `/api/files/<ключ>` (lib/fileStore.ts)
 * или публичный адрес Vercel Blob. Чужие картинки на клиентском сайте не показываем.
 */
export const PHOTO_URL =
  /^(\/api\/files\/[\w./-]{1,300}|https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\/[\w./%-]{1,300})$/i;

const text = (max: number) => z.string().trim().max(max);

export const siteContentSchema = z
  .object({
    title: text(SITE_CONTENT_LIMITS.title).optional(),
    hero: text(SITE_CONTENT_LIMITS.hero).optional(),
    about: text(SITE_CONTENT_LIMITS.about).optional(),
    services: z
      .array(text(SITE_CONTENT_LIMITS.service).min(1))
      .max(SITE_CONTENT_LIMITS.services)
      .optional(),
    hours: text(SITE_CONTENT_LIMITS.hours).optional(),
    address: text(SITE_CONTENT_LIMITS.address).optional(),
    /** Любая запись российского номера; проверяется candidatePhone. */
    phone: text(30).optional(),
    whatsapp: text(30).optional(),
    accent: z.enum(SITE_ACCENTS).optional(),
    photos: z.array(z.string().regex(PHOTO_URL)).max(SITE_CONTENT_LIMITS.photos).optional(),
    /** Форма заявки: true — включена владельцем после оферты (К10); иначе выключена. */
    leadForm: z.boolean().optional(),
    /** true — без «Хотите такой же сайт?» в подвале. */
    hideCredit: z.boolean().optional(),
  })
  .strict();

export type SiteContent = z.infer<typeof siteContentSchema>;

/** Правки из базы; битый JSON или неверные поля → {} (страница остаётся по карточке). */
export function parseSiteContent(raw: string | null | undefined): SiteContent {
  if (!raw) return {};
  try {
    const parsed = siteContentSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

/**
 * Проверка правки из админки: ошибки по-русски для формы. Телефоны приводятся к +7…,
 * пустые строки убираются (значит «как в карточке»).
 */
export function validateSiteContent(
  input: unknown,
): { ok: true; content: SiteContent } | { ok: false; error: string } {
  const parsed = siteContentSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path[0];
    return { ok: false, error: `Проверьте поле «${fieldTitle(field)}»: ${issueText(issue)}` };
  }
  const content: SiteContent = {};
  for (const [key, value] of Object.entries(parsed.data) as [keyof SiteContent, unknown][]) {
    if (typeof value === 'string' && value.trim() === '') continue;
    if (Array.isArray(value) && value.length === 0 && key !== 'photos') continue;
    (content as Record<string, unknown>)[key] = value;
  }
  for (const key of ['phone', 'whatsapp'] as const) {
    if (content[key] === undefined) continue;
    const normalized = candidatePhone(content[key]);
    if (!normalized)
      return { ok: false, error: `Проверьте поле «${fieldTitle(key)}»: нужен российский номер` };
    content[key] = normalized;
  }
  return { ok: true, content };
}

function fieldTitle(field: PropertyKey | undefined): string {
  const titles: Record<string, string> = {
    title: 'Название',
    hero: 'Главная строка',
    about: 'О компании',
    services: 'Услуги',
    hours: 'Часы работы',
    address: 'Адрес',
    phone: 'Телефон',
    whatsapp: 'WhatsApp',
    accent: 'Цвет',
    photos: 'Фото',
    leadForm: 'Форма заявки',
    hideCredit: 'Подвал',
  };
  return typeof field === 'string' ? (titles[field] ?? field) : 'форма';
}

function issueText(issue: z.ZodIssue | undefined): string {
  if (!issue) return 'неверное значение';
  if (issue.code === 'too_big') return 'слишком длинно или слишком много';
  if (issue.code === 'too_small') return 'пусто';
  if (issue.code === 'unrecognized_keys') return 'лишнее поле';
  if (issue.code === 'invalid_string') return 'фото можно только загруженные через админку';
  return 'неверное значение';
}

/**
 * Страница по карточке + правки владельца. Телефон в правке пересчитывает ссылку «Позвонить»,
 * но не WhatsApp: WhatsApp — только тот, что указан в карточке или в правке (8.2).
 */
export function applySiteContent(page: SitePage, content: SiteContent): SitePage {
  const next: SitePage = { ...page };
  if (content.title) next.title = content.title;
  if (content.hero) next.hero = content.hero;
  if (content.about) next.about = content.about;
  if (content.services?.length) next.services = [...content.services];
  if (content.hours) next.hours = content.hours;
  if (content.address) {
    next.address = content.address;
    // Новый адрес — карта ищет по нему, а не по старым координатам карточки.
    next.mapHref = mapHref({ lat: null, lon: null, address: content.address });
  }
  if (content.phone) {
    next.phone = phoneText(content.phone);
    next.phoneHref = `tel:+${phoneDigits(content.phone)}`;
  }
  if (content.whatsapp) next.whatsappHref = whatsappHrefFor(content.whatsapp) ?? next.whatsappHref;
  if (content.accent) next.accent = content.accent;
  if (content.photos) next.photos = [...content.photos];
  if (content.leadForm !== undefined) next.leadForm = content.leadForm;
  if (content.hideCredit !== undefined) next.hideCredit = content.hideCredit;
  return next;
}
