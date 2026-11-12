// The phone field of the lead forms: what the visitor types or pastes
// («8 927 …», «9271234567», «+7(927)123-45-67», «7927…») is shown as
// «+7 (927) 123-45-67». The server still accepts any formatting with 10–15
// digits (packages/shared, createLeadSchema); this only helps typing and gives
// the form its own words for a short number. Pure, unit-tested.

export const PHONE_PLACEHOLDER = '+7 (___) ___-__-__';

export const PHONE_ERRORS = {
  empty: 'Укажите телефон — по нему перезвоним',
  short: 'Номер неполный: нужно 10 цифр после +7',
  long: 'В номере лишние цифры — проверьте его',
} as const;

function digitsOf(value: string): string {
  return value.replace(/\D/g, '');
}

/** The ten digits after +7, as far as they are typed. */
function nationalDigits(raw: string): string {
  let digits = digitsOf(raw);
  if (raw.trimStart().startsWith('+')) {
    // «+7 …» (the caller has checked the 7).
    digits = digits.slice(1);
  } else if (/^[78]/.test(digits) && (digits[1] === '9' || digits.length >= 11)) {
    // «8 927 …», «7 927 …» and any full 11-digit number carry the country
    // code. A lone leading 8 is kept until then: «8552 …» is a city code
    // (Набережные Челны), not «8» and a number.
    digits = digits.slice(1);
  }
  // Typed into the masked field the same prefix arrives as «+7 (89…», «+7 (88…»
  // or «+7 (79…»: no Russian code starts with 89, 88 or 79, so the first digit
  // is the «8» or «7» people dial before the number.
  if (/^(?:89|88|79)/.test(digits)) digits = digits.slice(1);
  return digits.slice(0, 10);
}

function mask(national: string): string {
  let out = '+7 (' + national.slice(0, 3);
  if (national.length > 3) out += ') ' + national.slice(3, 6);
  if (national.length > 6) out += '-' + national.slice(6, 8);
  if (national.length > 8) out += '-' + national.slice(8, 10);
  return out;
}

/**
 * The field's next value. `previous` is what the field showed before this
 * change: when a backspace removed only a bracket, a space or a dash, the
 * last digit goes with it, so the field never gets stuck on a separator.
 */
export function formatPhone(raw: string, previous = ''): string {
  const trimmed = raw.trimStart();
  const digits = digitsOf(trimmed);
  if (!digits) return trimmed.startsWith('+') ? '+' : '';
  // Another country: «+375 …» is left as typed, digits only.
  if (trimmed.startsWith('+') && !digits.startsWith('7')) return '+' + digits.slice(0, 15);
  let national = nationalDigits(trimmed);
  if (!national) return trimmed.startsWith('+') ? '+7' : '';
  if (
    previous &&
    raw.length < previous.length &&
    previous.startsWith(raw) &&
    national === nationalDigits(previous)
  ) {
    national = national.slice(0, -1);
    if (!national) return '';
  }
  return mask(national);
}

/** Why the number cannot be sent, in the form's own words; null when it can. */
export function phoneError(value: string): string | null {
  const trimmed = value.trim();
  const digits = digitsOf(trimmed);
  if (!digits) return PHONE_ERRORS.empty;
  // «+7 (927) 123-45-67» is 11 digits; a foreign number is 10 to 15.
  const russian = !trimmed.startsWith('+') || digits.startsWith('7');
  if (russian && trimmed.startsWith('+7') && digits.length < 11) return PHONE_ERRORS.short;
  if (digits.length < 10) return PHONE_ERRORS.short;
  if (digits.length > 15) return PHONE_ERRORS.long;
  return null;
}
