// The platform's one headline promise (owner, 2026-10-17: «основной акцент в
// рекламе — всё бесплатно и без посредников»). One source for the site
// (SITE.promise in apps/web/src/lib/site.ts), the AI assistant prompt and the
// app (a copy in apps/mobile/src/lib/site.ts, checked by apps/web site.test.ts).
//
// It is true only while the platform takes no money from the deal: no online
// payment (isOnlinePaymentEnabled() in apps/web/src/lib/stripe.ts is false), no
// commission, no markup; each provider sets its own price and the customer pays
// the provider directly. If a commission, a paid plan or online payment is ever
// introduced, these texts must change in the same PR (REVIEW.md, «Тексты»):
// an advertising claim must be accurate (ФЗ «О рекламе», ст. 5).

// Owner, 2026-11-13: the headline is «Без комиссии для заказчика» (it replaces
// «Бесплатно и без посредников»: the dispatcher of СпецПласт16 is in the
// chain, so «без посредников» did not read true), and every page says the
// same about who calls back (PLATFORM_CALLBACK_WHO).

/** The headline: «Без комиссии для заказчика». */
export const PLATFORM_PROMISE = 'Без комиссии для заказчика';

/** The same for tight places (the site header, the app's map chip). */
export const PLATFORM_PROMISE_SHORT = 'Без комиссии для заказчика';

/** The one-line explanation that goes with the headline wherever there is room. */
export const PLATFORM_PROMISE_DETAIL =
  'Цену назначает владелец техники, расчёт — напрямую с ним, площадка не берёт процент.';

/** Who calls back after a заявка, in the same words everywhere. */
export const PLATFORM_CALLBACK_WHO =
  'Перезвонит диспетчер СпецПласт16 — он сравнивает предложения исполнителей.';

/**
 * The smallest order (owner, 2026-11-13): 4 hours, then by the hour. Used by
 * the site (apps/web/src/lib/prices.ts MIN_ORDER_HOURS) and the assistant.
 */
export const PLATFORM_MIN_ORDER_HOURS = 4;

/** «Минимум 4 часа, дальше по часам». */
export const PLATFORM_MIN_ORDER_TEXT = `Минимум ${PLATFORM_MIN_ORDER_HOURS} часа, дальше по часам`;

/** Both in one sentence: «Бесплатно и без посредников: цену назначает…». */
export const PLATFORM_PROMISE_LINE = `${PLATFORM_PROMISE}: ${PLATFORM_PROMISE_DETAIL.charAt(0).toLowerCase()}${PLATFORM_PROMISE_DETAIL.slice(1)}`;
