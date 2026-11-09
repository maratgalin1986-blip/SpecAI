// «Опубликовать» клиентский сайт (К10) из админки: из /admin/office и /admin/office/clients.
// Неоплаченный сайт — только после подтверждения «Сайт не оплачен — опубликовать?»; если
// админка не знала, что сайт не оплачен, маршрут ответит 409 с `needsConfirm`, и вопрос
// задаётся тогда. PATCH /api/admin/office/prospects/[id] { action: 'publish' }.

import { PUBLISH_UNPAID_QUESTION } from '@/lib/office/transitions';

export type PublishOutcome = { ok: true } | { ok: false; error: string } | { cancelled: true };

async function patch(id: string, confirmUnpaid: boolean) {
  const response = await fetch(`/api/admin/office/prospects/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'publish', ...(confirmUnpaid ? { confirmUnpaid: true } : {}) }),
  }).catch(() => null);
  const data = (await response?.json().catch(() => null)) as {
    error?: string;
    needsConfirm?: boolean;
  } | null;
  return { response, data };
}

export async function publishSite(id: string, paid: boolean): Promise<PublishOutcome> {
  let confirmed = false;
  if (!paid) {
    if (!window.confirm(PUBLISH_UNPAID_QUESTION)) return { cancelled: true };
    confirmed = true;
  }
  let { response, data } = await patch(id, confirmed);
  if (response?.status === 409 && data?.needsConfirm && !confirmed) {
    if (!window.confirm(PUBLISH_UNPAID_QUESTION)) return { cancelled: true };
    ({ response, data } = await patch(id, true));
  }
  if (response?.ok) return { ok: true };
  return {
    ok: false,
    error: typeof data?.error === 'string' ? data.error : 'Не сохранилось — попробуйте ещё раз',
  };
}
