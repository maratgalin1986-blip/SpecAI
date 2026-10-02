// «Пригласи коллегу»: every user has a short code, the link /r/<code> (or any
// page with ?ref=<code>) remembers it in a cookie for 30 days, and the sign-up
// stores who invited the new user. Rewards are non-monetary: a «Рекомендует N»
// note for providers and the count in the cabinet. Pure functions, safe for
// client components; the database part is lib/referralStore.ts.

/** Cookie that keeps the inviter's code until the visitor signs up. */
export const REFERRAL_COOKIE = 'sp_ref';
export const REFERRAL_MAX_AGE = 30 * 86_400; // seconds

// Without 0/O, 1/I/L: codes are read aloud and typed from a phone screen.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const REFERRAL_CODE_LENGTH = 7;

/** A new random code, e.g. «K7M2QXA». `random` returns numbers in [0, 1). */
export function generateReferralCode(random: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < REFERRAL_CODE_LENGTH; i += 1) {
    const index = Math.min(ALPHABET.length - 1, Math.floor(random() * ALPHABET.length));
    code += ALPHABET[index];
  }
  return code;
}

/** A code from a link or a form: trimmed, upper-cased; null when it cannot be a code. */
export function normalizeReferralCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const code = value.trim().toUpperCase();
  if (code.length !== REFERRAL_CODE_LENGTH) return null;
  for (const char of code) if (!ALPHABET.includes(char)) return null;
  return code;
}

/** The short invitation link. */
export function referralLink(base: string, code: string): string {
  return `${base.replace(/\/$/, '')}/r/${encodeURIComponent(code)}`;
}

/** Where /r/<code> sends the visitor: sign-up with the code and the UTM tags. */
export function referralLanding(code: string, provider = false): string {
  const params = new URLSearchParams({
    ref: code,
    utm_source: 'referral',
    utm_medium: 'invite',
  });
  if (provider) params.set('type', 'provider');
  return `/register?${params.toString()}`;
}

/** The invitation text for messengers. */
export function invitationText(role: 'CUSTOMER' | 'PROVIDER'): string {
  return role === 'PROVIDER'
    ? 'Подключайся к СпецПласт16 — бесплатный сервис заказов спецтехники в Челнах: заявки заказчиков приходят прямо в кабинет, без комиссии.'
    : 'Заказываю спецтехнику через СпецПласт16: пишешь заявку, исполнители сами присылают цены. Бесплатно.';
}

/** «пригласил 1 коллегу / 2 коллег / 5 коллег» (accusative: one form besides 1, 21…). */
export function colleaguesLabel(count: number): string {
  const word = count % 10 === 1 && count % 100 !== 11 ? 'коллегу' : 'коллег';
  return `${count} ${word}`;
}

/** «Рекомендует N» for a provider that brought other providers; null below one. */
export function recommendsNote(invitedProviders: number): string | null {
  if (!Number.isFinite(invitedProviders) || invitedProviders < 1) return null;
  return `Рекомендует сервис: пригласил ${colleaguesLabel(Math.floor(invitedProviders))}`;
}
