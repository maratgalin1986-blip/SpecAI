// Клиентский сайт (S4, S5, S11): чистые правила, общие для страницы (серверной) и формы
// заявки (клиентской). Файл попадает в браузер вместе с SiteLeadForm, поэтому здесь нет
// базы, zod и node-модулей: только pages.ts (сам чистый) и строки.

import { quotedName } from './pages';

/** Страница услуги «Сайт под ключ» на площадке (T1). */
export const SERVICE_PAGE_PATH = '/sajt-pod-klyuch';

/** Больше фото на сайте не показываем (как и в редакторе, SITE_CONTENT_LIMITS.photos). */
export const CLIENT_SITE_MAX_PHOTOS = 6;

/** Длины полей формы — те же, что проверяет приём заявки (T3). */
export const SITE_LEAD_LIMITS = { name: 80, phone: 30, message: 1000 } as const;

/** Адрес, куда форма отправляет заявку (относительный: работает и на домене клиента). */
export const SITE_LEAD_ENDPOINT = '/api/office/site-lead';

/** Фото для галереи: без пустых строк и дублей, не больше шести. */
export function galleryPhotos(photos: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of photos) {
    const src = raw.trim();
    if (!src || seen.has(src)) continue;
    seen.add(src);
    out.push(src);
    if (out.length === CLIENT_SITE_MAX_PHOTOS) break;
  }
  return out;
}

/**
 * «Хотите такой же сайт?» в подвале клиентского сайта: абсолютная ссылка на страницу услуги
 * (на домене клиента относительная вела бы на его же сайт) с меткой, с какого сайта пришли.
 */
export function moreSitesHref(base: string, slug?: string | null): string {
  const query = new URLSearchParams({ utm_source: 'client-site' });
  if (slug) query.set('utm_campaign', slug);
  return `${base.replace(/\/+$/, '')}${SERVICE_PAGE_PATH}?${query.toString()}`;
}

/** Текст галочки согласия под формой заявки. */
export function siteLeadConsentText(companyTitle: string): string {
  return `Согласен на передачу имени и телефона компании ${quotedName(companyTitle)} для ответа на заявку`;
}

export interface SiteLeadFields {
  slug: string;
  name: string;
  phone: string;
  message: string;
  consent: boolean;
  /** Поле-ловушка для ботов: у человека пустое. */
  website: string;
}

/** Тело POST /api/office/site-lead: строки без пробелов по краям и не длиннее лимитов. */
export function siteLeadPayload(fields: SiteLeadFields): SiteLeadFields {
  return {
    slug: fields.slug,
    name: fields.name.trim().slice(0, SITE_LEAD_LIMITS.name),
    phone: fields.phone.trim().slice(0, SITE_LEAD_LIMITS.phone),
    message: fields.message.trim().slice(0, SITE_LEAD_LIMITS.message),
    consent: fields.consent === true,
    website: fields.website,
  };
}

const MAX_ERROR_LENGTH = 300;

/**
 * Ответ приёма заявки → что показать посетителю. Текст ошибки — из ответа сервера
 * (он по-русски), иначе — по коду ответа; везде — что делать дальше (позвонить).
 */
export function siteLeadReply(
  status: number,
  body: unknown,
  companyPhone: string,
): { ok: true } | { ok: false; error: string } {
  const data = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  if (status >= 200 && status < 300 && data.ok === true) return { ok: true };
  const fromServer = typeof data.error === 'string' ? data.error.trim() : '';
  if (fromServer) return { ok: false, error: fromServer.slice(0, MAX_ERROR_LENGTH) };
  if (status === 429) {
    return {
      ok: false,
      error: `Слишком много заявок подряд. Попробуйте через 10 минут или позвоните: ${companyPhone}`,
    };
  }
  if (status === 404) {
    return {
      ok: false,
      error: `Форма сейчас не принимает заявки. Позвоните: ${companyPhone}`,
    };
  }
  return {
    ok: false,
    error: `Не удалось отправить заявку. Попробуйте ещё раз или позвоните: ${companyPhone}`,
  };
}

/** Заявка не ушла из-за связи (fetch упал). */
export function siteLeadOfflineText(companyPhone: string): string {
  return `Нет связи — заявка не ушла. Проверьте интернет и отправьте ещё раз или позвоните: ${companyPhone}`;
}
