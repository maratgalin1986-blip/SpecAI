// «Уборка снега» (/uborka-snega): the seasonal page of СпецПласт16's own fleet
// in Набережные Челны (docs/launch-plan.md § 4). Everything the page says is
// here so it can be tested: the machines (only kinds that exist in the price
// list), the package «погрузчик + самосвал», who it is for, the steps, the FAQ
// and the season. Prices come from lib/prices.ts only — no ruble figure of its
// own, and no «package price» other than the two hourly prices added up.

import { moscowDateKey } from '@/lib/bookingRules';
import { DELIVERY_NOTE } from '@/lib/cities';
import type { IconName } from '@/components/Icon';
import { MACHINE_LABELS, type MachineType } from '@/lib/machinePhotos';
import { fromPerHour, fromPrice, MIN_ORDER_TEXT, rateOf } from '@/lib/prices';
import { SITE } from '@/lib/site';

export const SNEG_PATH = '/uborka-snega';

/** The city of the house fleet, as the page's texts decline it. */
export const SNEG_CITY = { in: 'Набережных Челнах', across: 'Челнам' } as const;

/**
 * Owner, 2026-11-02: the house fleet reaches a site in Набережные Челны within
 * two hours of the order (the same promise as the home page's first screen).
 */
export const HOUSE_DELIVERY_HOURS = 2;
export const HOUSE_DELIVERY_PROMISE = `Подача по ${SNEG_CITY.across} в течение ${HOUSE_DELIVERY_HOURS} часов`;

export interface SnegMachine {
  type: MachineType;
  /** The machine's page in lib/landings.ts. */
  landing: string;
  name: string;
  /** What the machine does with the snow. */
  role: string;
  icon: IconName;
  /** Part of the package «Вывоз снега: погрузчик + самосвал». */
  inPackage: boolean;
}

export const SNEG_MACHINES: readonly SnegMachine[] = [
  {
    type: 'loader',
    landing: 'frontalnyj-pogruzchik',
    name: MACHINE_LABELS.loader,
    role: 'Сгребает снег в кучи и грузит его в самосвал.',
    icon: 'loader',
    inPackage: true,
  },
  {
    type: 'truck',
    landing: 'samosval',
    name: MACHINE_LABELS.truck,
    role: 'Вывозит снег с территории.',
    icon: 'arrow',
    inPackage: true,
  },
  {
    type: 'tractor',
    landing: 'traktor',
    name: MACHINE_LABELS.tractor,
    role: 'Расчищает дворы, проезды и стоянки, когда вывозить снег не нужно.',
    icon: 'tractor',
    inPackage: false,
  },
];

export const SNEG_PACKAGE_TITLE = 'Вывоз снега: погрузчик + самосвал';

/**
 * The package: the loader and one dump truck working the same hour. `total` is
 * the two hourly prices added up — there is no discounted package price.
 */
export function snegPackage(): { loader: number; truck: number; total: number } {
  const loader = rateOf('loader');
  const truck = rateOf('truck');
  return { loader, truck, total: loader + truck };
}

/** «погрузчик — от 4 000 ₽/ч с машинистом, самосвал — от 3 300 ₽/ч с машинистом». */
export function snegPackageLine(): string {
  const { loader, truck } = snegPackage();
  return `погрузчик — ${fromPerHour(loader)}, самосвал — ${fromPerHour(truck)}`;
}

/** Who orders snow removal (docs/launch-plan.md § 4 and the roadmap row). */
export const SNEG_AUDIENCE: readonly { title: string; text: string }[] = [
  {
    title: 'Управляющие компании',
    text: 'Дворы, проезды и стоянки у домов — техника по вызову после снегопада.',
  },
  { title: 'ТСЖ', text: 'Расчистка двора и вывоз накопившихся куч, оплата по часам.' },
  { title: 'Магазины', text: 'Парковка и подъезд для покупателей, зона разгрузки.' },
  { title: 'Склады', text: 'Площадки, подъездные пути и места для фур.' },
  { title: 'Частные дворы', text: 'Въезд, двор и участок у дома.' },
  { title: 'Администрации', text: 'Улицы, площади и территории учреждений.' },
];

export const SNEG_STEPS: readonly { title: string; text: string }[] = [
  {
    title: 'Заявка',
    text: 'Оставьте телефон, позвоните или напишите. Назовите адрес и что убрать.',
  },
  {
    title: 'Расчёт',
    text: 'Диспетчер уточнит площадь и объём, подберёт машины и назовёт стоимость подачи.',
  },
  {
    title: 'Подача',
    text: `${HOUSE_DELIVERY_PROMISE} после подтверждения заявки. Техника приезжает с машинистом.`,
  },
  {
    title: 'Работа и оплата',
    text: 'Погрузчик сгребает и грузит, самосвал вывозит. Оплата — по фактически отработанным часам каждой машины.',
  },
];

/** The same wording as the «Работаете с НДС?» answer of the machine pages (lib/landings.ts). */
const VAT_ANSWER = `У ${SITE.name} — да: договор, оплата по безналу с НДС, закрывающие документы и ЭДО. У других исполнителей площадки условия по НДС уточняйте при заказе.`;

export function snegFaq(): { q: string; a: string }[] {
  const { total } = snegPackage();
  return [
    {
      q: 'Сколько стоит уборка и вывоз снега?',
      a: `Цены парка ${SITE.name}: ${snegPackageLine()}, трактор — ${fromPerHour('tractor')}. Погрузчик и один самосвал вместе — ${fromPrice(total)} за две машины. Оплата — по фактически отработанным часам. ${DELIVERY_NOTE}`,
    },
    {
      q: 'Как быстро приедет техника?',
      a: `${HOUSE_DELIVERY_PROMISE} после подтверждения заявки диспетчером. В других городах срок называет исполнитель, который ответит на заявку.`,
    },
    {
      q: 'Сколько машин нужно на мою территорию?',
      a: 'Зависит от площади, объёма снега и расстояния вывоза. Назовите адрес и примерную площадь — диспетчер подберёт число машин.',
    },
    { q: 'Работаете с НДС и по договору?', a: VAT_ANSWER },
    {
      q: 'Можно заключить договор на сезон?',
      a: `Да, для управляющих компаний, ТСЖ и организаций: техника по вызову. ${MIN_ORDER_TEXT}. Условия обсудит диспетчер.`,
    },
    {
      q: 'Я не в Набережных Челнах. Можно заказать?',
      a: `Да. Свой парк ${SITE.name} работает в ${SNEG_CITY.in}. В других городах разместите заявку на площадке ${SITE.platform} — на неё ответят исполнители вашего города со своими ценами.`,
    },
  ];
}

/** Snow season, November to March, by the Moscow calendar date. */
export function isSnowSeason(date: Date = new Date()): boolean {
  const month = Number(moscowDateKey(date).slice(5, 7));
  return month >= 11 || month <= 3;
}
