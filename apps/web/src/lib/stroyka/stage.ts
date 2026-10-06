// What Михалыч offers at the object: the machine the current stage really needs.

import { MACHINE_LABELS } from '@/lib/machinePhotos';
import { CALL, orderHref, PRICES, rub, type DialogNode } from '@/lib/stroyka';
import { STAGE_MACHINE, type StageKey, type WorldProgress } from '@/lib/stroyka/progress';

const P = (value: number) => `${rub(value)}\u00a0₽/ч`;

const TEXT: Record<StageKey, (p: WorldProgress) => string> = {
  pit: (p) =>
    `Котлован под ${p.projectName} копаем — экскаватор-погрузчик и самосвалы с утра. Экскаватор-погрузчик СпецПласт16 — от ${P(PRICES.other)}. Вам на какой объект техника?`,
  foundation: () =>
    `Фундамент заливаем: миксеры, бадья, автокран. Кран от ${P(PRICES.crane)}. Вам что поднять или залить?`,
  frame: (p) =>
    `Каркас растёт — ${p.floorsBuilt}-й этаж из ${p.floors}. Автокран СпецПласт16: от ${P(PRICES.crane)}, 32 т — ${P(PRICES.crane32)}.`,
  roof: () =>
    `Кровлю монтируем — кран подаёт материалы наверх. Нужен кран на вашу крышу? От ${P(PRICES.crane)}.`,
  facade: () =>
    `Фасад пошёл — без автовышки никуда. Вам на какой объект вышка? У СпецПласт16 от ${P(PRICES.agp)}.`,
  utilities: () =>
    `Сети тянем: траншеи под воду и канализацию. Экскаватор-погрузчик от ${P(PRICES.other)} — траншею сделает за смену.`,
  interior: () =>
    `Внутри отделка: манипулятор возит материалы, поддоны на этажи. КМУ от ${P(PRICES.other)}.`,
  landscape: () =>
    `Благоустройство: асфальт, бордюры, газоны. Каток, погрузчик, самосвалы — всё своё. Каток от ${P(PRICES.other)}.`,
  handover: (p) =>
    `Сдаём ${p.projectName}! Ленточка, флаги. А вам техника на следующий объект? Погрузчик от ${P(PRICES.other)}.`,
};

/** The object's dialogue line for the current stage. */
export function stageNode(p: WorldProgress): DialogNode {
  const machine = STAGE_MACHINE[p.stageKey];
  return {
    id: 'korpus',
    speaker: 'mihalych',
    text: TEXT[p.stageKey](p),
    replies: [
      {
        label: `Заявка: ${MACHINE_LABELS[machine].toLowerCase()}`,
        action: { kind: 'link', href: orderHref(machine) },
        primary: true,
        set: { machine },
      },
      { label: 'Передать Свете — оформить', action: { kind: 'form' }, set: { machine } },
      CALL,
      { label: 'Дальше по объекту', action: { kind: 'next' } },
    ],
  };
}
