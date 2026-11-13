// «Кто увидит мой телефон» — one answer for every page that asks for a phone,
// written from what the code does (lib/customerPrivacy.ts, lib/chatOrders.ts,
// api/orders/[id]/phone):
// - a заявка without an account (/orders, api/orders/guest) is on the board
//   with the phone masked; the dispatcher sees it, a signed-in provider opens
//   it with «Показать телефон» (each reveal logged, limited per day);
// - with an account the provider gets the phone once he confirms the booking;
// - a callback or a map заявка (api/leads) reaches only the dispatcher.

import { SITE } from './site';

/** The заявка on /orders without an account. */
export const GUEST_PHONE_VISIBILITY =
  `Номер не публикуется: его видят диспетчер ${SITE.name} и исполнители ` +
  'по кнопке «Показать телефон», каждый показ записан.';

/** A customer with an account. */
export const ACCOUNT_PHONE_VISIBILITY =
  'С аккаунтом ваш телефон исполнитель увидит только после того, как подтвердит бронь.';

/** «Перезвоните мне» and the map: the lead goes to the dispatcher only. */
export const LEAD_PHONE_VISIBILITY = `Номер получает только диспетчер ${SITE.name}, исполнителям он не передаётся.`;

/** The whole answer, where the page does not say which of the three it is. */
export const PHONE_VISIBILITY = `${GUEST_PHONE_VISIBILITY} ${ACCOUNT_PHONE_VISIBILITY}`;
