import { SITE } from './site';

/** What a guest is told once the order is on the board (api/orders/guest). */
export const GUEST_ORDER_SUCCESS =
  'Заявка опубликована. Исполнители уже видят её и пришлют цены; мы позвоним вам с лучшими предложениями. ' +
  `Срочно — ${SITE.phone}.`;
