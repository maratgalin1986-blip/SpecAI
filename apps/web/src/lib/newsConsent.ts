// The weekly newsletter «Заявки рядом за неделю» goes only to people who ticked
// the box themselves (ФЗ «О рекламе» ст. 18, 152-ФЗ): never ticked by default,
// never assumed for existing accounts. Client-safe (the register form uses it);
// the token and the letter live in lib/newsletter.ts.

/** The checkbox at sign-up and the switch in the settings (the app uses the same text). */
// From the file, not the package index: client bundles skip zod and the city list.
export { NEWS_CONSENT_LABEL } from '@specai/shared/src/newsConsent';

/** Who can subscribe: machinists work under their company's account and get nothing. */
export const NEWS_ROLES = ['CUSTOMER', 'PROVIDER_ADMIN', 'PLATFORM_ADMIN'] as const;

export function newsAvailableFor(role: string | null | undefined): boolean {
  return (NEWS_ROLES as readonly string[]).includes(role ?? '');
}

/** The sign-up body: only a literal `newsConsent: true` (a ticked box) subscribes. */
export function newsConsentFrom(body: unknown, now: Date = new Date()): Date | null {
  if (typeof body !== 'object' || body === null) return null;
  return (body as { newsConsent?: unknown }).newsConsent === true ? now : null;
}

export interface NewsState {
  newsConsentAt: Date | null;
  newsUnsubscribedAt: Date | null;
}

/** Subscribed: agreed and not unsubscribed since. */
export function newsSubscribed(user: Partial<NewsState> | null | undefined): boolean {
  return Boolean(user?.newsConsentAt) && !user?.newsUnsubscribedAt;
}

/** The columns for «подписаться» / «отписаться» (an unsubscribe also drops the consent). */
export function newsUpdate(subscribe: boolean, now: Date = new Date()): NewsState {
  return subscribe
    ? { newsConsentAt: now, newsUnsubscribedAt: null }
    : { newsConsentAt: null, newsUnsubscribedAt: now };
}
