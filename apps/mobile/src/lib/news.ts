import { apiFetch } from './api';

// Еженедельное письмо «Заявки рядом за неделю» — только по согласию
// (ФЗ «О рекламе» ст. 18). Текст согласия — слово в слово как на сайте
// (packages/shared newsConsent.ts); apps/web lib/newsConsent.test.ts сверяет их.

export const NEWS_CONSENT_LABEL =
  'Присылать раз в неделю заявки рядом и новости площадки (можно отписаться в один клик)';

export interface NewsSubscription {
  /** false — машинист: рассылка не для него, переключатель не показываем. */
  available: boolean;
  subscribed: boolean;
  /** Письма уходят только на подтверждённый e-mail. */
  emailVerified?: boolean;
}

export function fetchNewsSubscription() {
  return apiFetch<NewsSubscription>('/api/account/news');
}

export function setNewsSubscription(subscribed: boolean) {
  return apiFetch<NewsSubscription>('/api/account/news', {
    method: 'PATCH',
    body: { subscribed },
  });
}
