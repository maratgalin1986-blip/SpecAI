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

/**
 * Насколько адрес похож на адрес человека, который решает (владелец, 2026-11-18: «директора,
 * руководителя, отдел закупок, где указаны»). Больше — лучше; общий ящик («info», «office») —
 * ниже, служебный — самый низ. Сравнивается только имя до «@».
 */
export function emailRank(email: string): number {
  const local = (email.split('@')[0] ?? '').toLowerCase();
  if (
    /^(?:dir|director|direktor|ceo|boss|head|rukovoditel|gendir|gd|nachalnik)\b|director|direktor/.test(
      local,
    )
  )
    return 5;
  if (
    /zakup|snab|tender|purchas|procure|supply|sales|sale|prodazh|opt\b|market|commerc|kommerc|manager|menedzher|mng/.test(
      local,
    )
  )
    return 4;
  if (/^[a-z]+\.[a-z]+$|^[a-z]+_[a-z]+$/.test(local)) return 3; // «ivan.petrov» — личный адрес
  if (
    /^(?:info|office|mail|contact|contacts|post|zakaz|order|orders|reception|priem|secretar|sekretar)$/.test(
      local,
    )
  )
    return 2;
  if (/^(?:support|help|service|admin|webmaster|hr|job|jobs|buh|bugalter|accounting)$/.test(local))
    return 1;
  return 2;
}

/**
 * E-mail из строки (через `;`/`,`/пробел), в нижнем регистре. Адресов в карточке бывает несколько:
 * берётся тот, что похож на адрес руководителя или закупок; при равенстве — первый.
 */
export function candidateEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let best: { value: string; rank: number } | null = null;
  for (const part of raw.split(/[;,\s]+/)) {
    const value = part
      .trim()
      .replace(/^mailto:/i, '')
      .toLowerCase();
    if (!EMAIL_RE.test(value)) continue;
    const rank = emailRank(value);
    if (!best || rank > best.rank) best = { value, rank };
  }
  return best?.value ?? null;
}

/** Имя пользователя Telegram без «@» — из «@name», «name» или ссылки t.me/name. */
export function candidateTelegram(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const first = raw.split(/[;,\s]+/)[0]?.trim() ?? '';
  const fromLink = first.match(/(?:t\.me|telegram\.me|telegram\.dog)\/(?:s\/)?([A-Za-z0-9_]+)/i);
  const name = (fromLink?.[1] ?? first.replace(/^@/, '')).replace(/\/.*$/, '');
  return /^[A-Za-z][A-Za-z0-9_]{3,31}$/.test(name) ? name : null;
}
