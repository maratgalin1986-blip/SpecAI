// Форма «Хочу сайт» на странице услуги (/sajt-pod-klyuch): чистая часть без React и без
// тяжёлых модулей (словарь ниш, zod) — её грузит клиентская форма SiteRequestForm.

/** Источник заявки «Хочу сайт» в CRM (/admin/leads); канал рекламы допишет submitLead. */
export const LANDING_LEAD_SOURCE = 'sajt-pod-klyuch';

/** Длины полей формы, кроме имени и телефона (их проверяет /api/leads). */
export const SITE_REQUEST_LIMITS = { business: 200, city: 80 } as const;

/** Предельная длина комментария заявки в /api/leads. */
const MESSAGE_MAX = 1000;

function oneLine(value: string | undefined, max: number): string {
  return (value ?? '').replace(/\s+/g, ' ').trim().slice(0, max).trim();
}

/**
 * Комментарий заявки «Хочу сайт» для CRM: «Хочу сайт под ключ.», чем занимается компания
 * и город. Пустые поля пропускаются; длина — в пределах /api/leads.
 */
export function siteRequestMessage(input: { business?: string; city?: string }): string {
  const business = oneLine(input.business, SITE_REQUEST_LIMITS.business);
  const city = oneLine(input.city, SITE_REQUEST_LIMITS.city);
  const lines = ['Хочу сайт под ключ.'];
  if (business) lines.push(`Чем занимаемся: ${business}`);
  if (city) lines.push(`Город: ${city}`);
  return lines.join('\n').slice(0, MESSAGE_MAX);
}
