import { normalizeRuPhone } from '@/lib/quickProvider';

/**
 * Телефон кандидата в формате `+7XXXXXXXXXX`.
 *
 * Мобильные — через `normalizeRuPhone` (`lib/quickProvider.ts`); у компаний на
 * карте часто городские номера («8 (843) 123-45-67»), поэтому дополнительно
 * принимаются любые 10 цифр (с ведущим кодом 3–9) и 11 цифр с 7/8 в начале.
 * Несколько номеров через `;` или `,` — берётся первый валидный.
 */
export function candidatePhone(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  for (const part of raw.split(/[;,]/)) {
    const mobile = normalizeRuPhone(part);
    if (mobile) return `+${mobile}`;
    let digits = part.replace(/\D/g, '');
    if (digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))) {
      digits = digits.slice(1);
    }
    if (/^[3-9]\d{9}$/.test(digits)) return `+7${digits}`;
  }
  return null;
}

const EMAIL_RE = /^[^\s@;,<>]+@[^\s@;,<>]+\.[a-z]{2,}$/i;

/** Первый валидный e-mail из строки (через `;`/`,`), в нижнем регистре. */
export function candidateEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  for (const part of raw.split(/[;,\s]+/)) {
    const value = part
      .trim()
      .replace(/^mailto:/i, '')
      .toLowerCase();
    if (EMAIL_RE.test(value)) return value;
  }
  return null;
}

/** Имя пользователя Telegram без «@» — из «@name», «name» или ссылки t.me/name. */
export function candidateTelegram(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const first = raw.split(/[;,\s]+/)[0]?.trim() ?? '';
  const fromLink = first.match(/(?:t\.me|telegram\.me|telegram\.dog)\/(?:s\/)?([A-Za-z0-9_]+)/i);
  const name = (fromLink?.[1] ?? first.replace(/^@/, '')).replace(/\/.*$/, '');
  return /^[A-Za-z][A-Za-z0-9_]{3,31}$/.test(name) ? name : null;
}
