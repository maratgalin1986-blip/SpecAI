// Офис агентов: адрес страницы кандидата и секрет превью (spec §4).
// Адрес — `<название>-<город>-<4 символа>`, только [a-z0-9-], не длиннее 60 символов.
// Транслит — своя таблица: lib/translit.ts в проекте нет.

import { randomBytes } from 'node:crypto';

export const SLUG_MAX_LENGTH = 60;

const TRANSLIT: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'sch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
};

/** Кириллица → латиница; остальное — как есть (в нижнем регистре). */
export function translit(text: string): string {
  let out = '';
  for (const ch of text.toLowerCase()) {
    out += Object.prototype.hasOwnProperty.call(TRANSLIT, ch) ? TRANSLIT[ch] : ch;
  }
  return out;
}

/** «ООО Ромашка-Сервис!» → «ooo-romashka-servis»; пустой вход → ''. */
export function slugify(text: string, maxLength = SLUG_MAX_LENGTH): string {
  const slug = translit(text)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (slug.length <= maxLength) return slug;
  return slug.slice(0, maxLength).replace(/-+$/g, '');
}

const SUFFIX_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** Четыре случайных символа [a-z0-9]. */
export function randomSuffix(length = 4): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += SUFFIX_ALPHABET[(bytes[i] ?? 0) % SUFFIX_ALPHABET.length];
  }
  return out;
}

/**
 * `<название>-<город>-<4 символа>`, ≤ 60 символов, только [a-z0-9-]. Суффикс
 * и город режут название, а не наоборот: хвост всегда остаётся различимым.
 */
export function prospectSlug(name: string, city: string, random4: string = randomSuffix()): string {
  const suffix = slugify(random4, 4) || randomSuffix();
  const citySlug = slugify(city, 20);
  const tail = citySlug ? `-${citySlug}-${suffix}` : `-${suffix}`;
  const nameSlug = slugify(name, SLUG_MAX_LENGTH - tail.length) || 'kompaniya';
  return `${nameSlug}${tail}`.slice(0, SLUG_MAX_LENGTH);
}

/** Секрет превью: 32 шестнадцатеричных символа. */
export function newToken(): string {
  return randomBytes(16).toString('hex');
}
