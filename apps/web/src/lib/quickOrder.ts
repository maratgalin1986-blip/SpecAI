// The quick-order panel at the top of the customer cabinet: a machine type,
// «Нужна сейчас» or «На дату», an address and one button that opens the usual
// order form (/orders) already filled in. Pure functions, unit-tested.

export type QuickWhen = 'now' | 'date';

export interface QuickOrderInput {
  categoryId?: string;
  when: QuickWhen;
  /** YYYY-MM-DD, used when `when` is 'date'. */
  date?: string;
  address?: string;
}

export interface OrderPrefill {
  categoryId?: string;
  startDate?: string;
  endDate?: string;
  address?: string;
  description?: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[\w-]{1,64}$/;

/** Today in Moscow as YYYY-MM-DD. */
export function todayMsk(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(now);
}

/** Link from the panel to the prefilled order form. */
export function quickOrderHref(input: QuickOrderInput, now: Date = new Date()): string {
  const params = new URLSearchParams();
  if (input.categoryId && ID.test(input.categoryId)) params.set('category', input.categoryId);
  const date = input.when === 'now' ? todayMsk(now) : input.date;
  if (date && DATE.test(date)) params.set('start', date);
  if (input.when === 'now') params.set('now', '1');
  const address = input.address?.trim().slice(0, 200);
  if (address) params.set('address', address);
  const query = params.toString();
  return `/orders${query ? `?${query}` : ''}#new`;
}

/** Search params of /orders → initial values of the order form (invalid ones dropped). */
export function orderPrefill(
  params: { category?: string; start?: string; now?: string; address?: string },
  now: Date = new Date(),
): OrderPrefill {
  const today = todayMsk(now);
  const prefill: OrderPrefill = {};
  if (params.category && ID.test(params.category)) prefill.categoryId = params.category;
  if (params.start && DATE.test(params.start) && params.start >= today) {
    prefill.startDate = params.start;
    prefill.endDate = params.start;
  }
  const address = params.address?.trim().slice(0, 200);
  if (address) prefill.address = address;
  if (params.now === '1') {
    prefill.startDate = today;
    prefill.endDate = today;
    prefill.description = 'Нужна сейчас, как можно скорее. ';
  }
  return prefill;
}
