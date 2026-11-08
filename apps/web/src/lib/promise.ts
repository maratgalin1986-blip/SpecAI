// «Бесплатно и без посредников — как это?» (owner, 2026-10-17): the honest
// explanation behind the headline promise (SITE.promise), shown on
// /kak-polzovatsya#besplatno, where the header pill and every promise note
// lead. Who sets the price, how the customer pays, what the platform takes,
// how СпецПласт16 earns. Must change together with packages/shared/src/promise.ts
// if a commission or online payment is ever introduced.
import { SITE } from './site';

export const PROMISE_POINTS: readonly string[] = [
  'Цену назначает сам владелец техники — компания или частник со своей машиной и машинистом.',
  'Договариваетесь и рассчитываетесь вы напрямую с ним, по его договору: онлайн-оплаты на площадке нет.',
  'Площадка не берёт процент ни с заказчика, ни с исполнителя и ничего не добавляет к цене. Регистрация, заявки, предложения и выход на линию бесплатны.',
  `${SITE.name} — один из исполнителей: зарабатывает, как и остальные, работой своей техники, а ещё продаёт строительные материалы.`,
];
