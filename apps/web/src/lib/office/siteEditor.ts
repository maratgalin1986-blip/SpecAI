// Редактор клиентского сайта в админке (S5) и поле «Свой домен» (S7): чистые правила формы,
// загрузки фото и записи правки в `Prospect.siteJson`. Файл попадает в браузер вместе с
// OfficeSiteEditor, поэтому из siteContent.ts берутся только типы (он тянет zod и проверку
// телефона с node-модулями); лимиты и цвета страница передаёт редактору пропсами, а сама
// проверка правки — validateSiteContent в маршруте PUT.

import { IMAGE_UPLOAD_MAX_BYTES } from '@/lib/blob';
import { FILES_PATH } from '@/lib/fileUrls';
import type { SitePage } from './pages';
import type { SiteContent } from './siteContent';

export type SiteAccent = NonNullable<SiteContent['accent']>;

/** Цвета сайта по-русски — для выбора в редакторе. */
export const ACCENT_TITLES: Record<SiteAccent, string> = {
  teal: 'Бирюзовый',
  amber: 'Янтарный',
  rose: 'Розовый',
  sky: 'Голубой',
  lime: 'Зелёный',
  orange: 'Оранжевый',
};

/** Состояние формы: строки как в полях ввода; пустая строка — «как в карточке». */
export interface SiteEditorDraft {
  title: string;
  hero: string;
  about: string;
  services: string[];
  hours: string;
  address: string;
  phone: string;
  whatsapp: string;
  /** '' — цвет ниши. */
  accent: SiteAccent | '';
  photos: string[];
  leadForm: boolean;
}

const TEXT_FIELDS = ['title', 'hero', 'about', 'hours', 'address', 'phone', 'whatsapp'] as const;

/** Длина полей «Телефон» и «WhatsApp» — как в siteContentSchema (text(30)). */
export const EDITOR_PHONE_MAX = 30;

/** Длина поля «Свой домен» (имя хоста — не длиннее 253 символов). */
export const EDITOR_DOMAIN_MAX = 253;

/** Что показывает сайт без правок — подсказки в пустых полях редактора. */
export interface SiteEditorDefaults {
  title: string;
  hero: string;
  services: string[];
  hours: string;
  address: string;
  phone: string;
  accent: SiteAccent;
}

/** Подсказки редактора из страницы по карточке (buildSitePage без правок). */
export function editorDefaults(page: SitePage): SiteEditorDefaults {
  return {
    title: page.title,
    hero: page.hero,
    services: [...page.services],
    hours: page.hours ?? '',
    address: page.address ?? '',
    phone: page.phone,
    accent: page.accent,
  };
}

/** Правка из базы (parseSiteContent) → поля формы. */
export function editorDraft(content: SiteContent): SiteEditorDraft {
  return {
    title: content.title ?? '',
    hero: content.hero ?? '',
    about: content.about ?? '',
    services: [...(content.services ?? [])],
    hours: content.hours ?? '',
    address: content.address ?? '',
    phone: content.phone ?? '',
    whatsapp: content.whatsapp ?? '',
    accent: content.accent ?? '',
    photos: [...(content.photos ?? [])],
    leadForm: content.leadForm !== false,
  };
}

/**
 * Поля формы → тело правки для PUT: строки без пробелов по краям, пустые не отправляются
 * (значит «как в карточке»), пустые услуги и повторы фото убраны, форма заявки — только
 * когда выключена (по умолчанию она есть).
 */
export function draftToContent(draft: SiteEditorDraft): SiteContent {
  const content: SiteContent = {};
  for (const key of TEXT_FIELDS) {
    const value = draft[key].trim();
    if (value) content[key] = value;
  }
  const services = draft.services.map((s) => s.trim()).filter(Boolean);
  if (services.length) content.services = services;
  if (draft.accent) content.accent = draft.accent;
  const photos = [...new Set(draft.photos.map((p) => p.trim()).filter(Boolean))];
  if (photos.length) content.photos = photos;
  if (!draft.leadForm) content.leadForm = false;
  return content;
}

/**
 * Проверенная правка → значение `Prospect.siteJson`. Всё, что совпадает с сайтом без правок
 * (пустые строки и списки, форма заявки включена), не записывается; ничего не осталось — null.
 */
export function siteJsonFor(content: SiteContent): string | null {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(content)) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' && value.trim() === '') continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (key === 'leadForm' && value === true) continue;
    out[key] = value;
  }
  return Object.keys(out).length ? JSON.stringify(out) : null;
}

/** Что сравнивать, чтобы понять, есть ли несохранённые изменения. */
export function editorSnapshot(draft: SiteEditorDraft, domain: string): string {
  return JSON.stringify({ content: draftToContent(draft), domain: domain.trim().toLowerCase() });
}

/** Новая пустая строка услуги, пока не больше лимита. */
export function addService(services: readonly string[], max: number): string[] {
  return services.length >= max ? [...services] : [...services, ''];
}

export function removeAt<T>(list: readonly T[], index: number): T[] {
  return list.filter((_, i) => i !== index);
}

/** Загруженное фото в конец списка: без повторов и не больше лимита. */
export function addPhoto(photos: readonly string[], url: string, max: number): string[] {
  if (!url || photos.includes(url) || photos.length >= max) return [...photos];
  return [...photos, url];
}

/** Фото для клиентского сайта — только эти форматы (без PDF, в отличие от общей загрузки). */
export const SITE_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

const PHOTO_EXTENSIONS: Record<(typeof SITE_PHOTO_TYPES)[number], string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function isSitePhotoType(type: string): type is (typeof SITE_PHOTO_TYPES)[number] {
  return (SITE_PHOTO_TYPES as readonly string[]).includes(type);
}

/**
 * Ошибка по-русски (и код ответа для маршрута загрузки), если файл не подходит для фото
 * сайта; null — можно загружать. Редактор проверяет то же самое до отправки.
 */
export function sitePhotoProblem(file: {
  type: string;
  size: number;
}): { error: string; status: 400 | 413 | 415 } | null {
  if (!isSitePhotoType(file.type)) {
    return { error: 'Фото — только JPEG, PNG или WebP', status: 415 };
  }
  if (file.size <= 0) return { error: 'Файл пустой', status: 400 };
  if (file.size > IMAGE_UPLOAD_MAX_BYTES) {
    return { error: 'Фото больше 5 МБ — сожмите его', status: 413 };
  }
  return null;
}

/**
 * Куда положить фото: `office/<адрес сайта>/photo.jpg` — у каждого сайта своя папка и свой
 * лимит хранилища. В адрес фото попадает только slug (он и так публичный), не id кандидата.
 */
export function sitePhotoStorePath(type: string, slug?: string | null): string {
  const ext = isSitePhotoType(type) ? PHOTO_EXTENSIONS[type] : 'jpg';
  const folder = slug && /^[a-z0-9-]{3,80}$/.test(slug) ? `office/${slug}` : 'office';
  return `${folder}/photo.${ext}`;
}

/**
 * Адрес фото для siteJson. Хранилище в базе отдаёт абсолютный адрес площадки
 * (`https://<площадка>/api/files/<ключ>`), а клиентский сайт открывается и на своём домене —
 * поэтому сохраняем относительный `/api/files/<ключ>`. Адрес Vercel Blob остаётся как есть.
 */
export function sitePhotoPath(url: string, base: string): string {
  const origin = base.trim().replace(/\/+$/, '');
  if (origin && url.startsWith(`${origin}${FILES_PATH}`)) return url.slice(origin.length);
  return url;
}
