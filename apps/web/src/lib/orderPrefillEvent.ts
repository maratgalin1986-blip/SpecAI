// «Заказать» on a machine above an order form (components/OfferNow.tsx) fills
// the form on the same page: the machinery type and a line about the machine.
// A window event, so the list and the form stay separate components.

export const ORDER_PREFILL_EVENT = 'specai:order-prefill';

export interface OrderPrefillDetail {
  /** The machine's catalogue slug: the form picks this type. */
  categorySlug: string | null;
  /** «Нужна: Экскаватор-погрузчик JCB 3CX (СпецПласт16, от 2 500 ₽/ч).» */
  text: string;
}

export function requestOrderPrefill(detail: OrderPrefillDetail): void {
  window.dispatchEvent(new CustomEvent<OrderPrefillDetail>(ORDER_PREFILL_EVENT, { detail }));
}

/** Subscribes a form; returns the unsubscribe function. */
export function onOrderPrefill(handler: (detail: OrderPrefillDetail) => void): () => void {
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<OrderPrefillDetail>).detail;
    if (detail && typeof detail.text === 'string') handler(detail);
  };
  window.addEventListener(ORDER_PREFILL_EVENT, listener);
  return () => window.removeEventListener(ORDER_PREFILL_EVENT, listener);
}

/** The text with the machine's line first, replacing an earlier one. */
export function withPrefillLine(current: string, line: string): string {
  const rest = current
    .split('\n')
    .filter((row) => !row.startsWith('Нужна: '))
    .join('\n')
    .trim();
  return rest ? `${line}\n${rest}` : line;
}
