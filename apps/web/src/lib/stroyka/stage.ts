// What Михалыч offers at the object: the machine the current stage really needs.
// He says «ты»; prices as everywhere on /stroyka (P: «от … ₽/ч с машинистом»).

import { MACHINE_LABELS } from '@/lib/machinePhotos';
import { CALL, orderHref, orderReply, P, PRICES, type DialogNode } from '@/lib/stroyka';
import { STAGE_MACHINE, type StageKey, type WorldProgress } from '@/lib/stroyka/progress';

const TEXT: Record<StageKey, (p: WorldProgress) => string> = {
  pit: (p) =>
    `Котлован под ${p.projectName} копаем — экскаватор-погрузчик и самосвалы с утра. Экскаватор-погрузчик — ${P(PRICES.other)}. Тебе на какой объект техника?`,
  foundation: () =>
    `Фундамент заливаем: миксеры, бадья, автокран. Автокран — ${P(PRICES.crane)}. Тебе что поднять или залить?`,
  frame: (p) =>
    `Каркас растёт — ${p.floorsBuilt}-й этаж из ${p.floors}. Автокран: 25 т — ${P(PRICES.crane)}, 32 т — ${P(PRICES.crane32)}.`,
  roof: () =>
    `Кровлю монтируем — кран подаёт материалы наверх. Нужен кран на твою крышу? Автокран — ${P(PRICES.crane)}.`,
  facade: () =>
    `Фасад пошёл — без автовышки никуда. Тебе на какой объект вышка? Автовышка — ${P(PRICES.agp)}.`,
  utilities: () =>
    `Сети тянем: траншеи под воду и канализацию. Экскаватор-погрузчик — ${P(PRICES.other)}, обычно управляемся за смену, если грунт без сюрпризов.`,
  interior: () =>
    `Внутри отделка: манипулятор возит материалы, поддоны на этажи. Манипулятор КМУ — ${P(PRICES.other)}.`,
  landscape: () =>
    `Благоустройство: асфальт, бордюры, газоны. Каток, погрузчик, самосвалы — всё своё. Каток — ${P(PRICES.other)}.`,
  handover: (p) =>
    `Сдаём ${p.projectName}! Ленточка, флаги. А тебе техника на следующий объект? Фронтальный погрузчик — ${P(PRICES.other)}.`,
};

/** The object's dialogue line for the current stage. */
export function stageNode(p: WorldProgress): DialogNode {
  const machine = STAGE_MACHINE[p.stageKey];
  return {
    id: 'korpus',
    speaker: 'mihalych',
    text: TEXT[p.stageKey](p),
    replies: [
      // Ordered right here, in the film (Света's form); the wizard is secondary.
      orderReply(machine),
      {
        label: `Подробнее: ${MACHINE_LABELS[machine].toLowerCase()}`,
        action: { kind: 'link', href: orderHref(machine) },
      },
      CALL,
      { label: 'Дальше по объекту', action: { kind: 'next' } },
    ],
  };
}
