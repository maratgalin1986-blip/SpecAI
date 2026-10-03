// «Сколько стоит моя работа»: kind of work → machine → hours → sum. Rates
// only from lib/prices.ts; the machine list is the landing list, so the bot
// hand-off (calc_<landing>_<hours>, lib/botFunnel.ts) uses the same indexes.

import { LANDINGS } from '@/lib/landings';
import type { MachineType } from '@/lib/machinePhotos';
import { rateOf } from '@/lib/prices';

export const WORKS: { id: string; label: string; machine: MachineType; hours: number }[] = [
  { id: 'transheya', label: 'Траншея под трубы или кабель', machine: 'backhoe', hours: 8 },
  { id: 'kotlovan', label: 'Котлован под фундамент', machine: 'excavator', hours: 16 },
  { id: 'vyvoz', label: 'Вывоз грунта или мусора', machine: 'truck', hours: 8 },
  { id: 'kran', label: 'Подъём грузов краном', machine: 'crane', hours: 4 },
  { id: 'vysota', label: 'Работы на высоте', machine: 'agp', hours: 4 },
  { id: 'pogruzka', label: 'Погрузка, расчистка, снег', machine: 'loader', hours: 4 },
  { id: 'kmu', label: 'Перевезти и разгрузить манипулятором', machine: 'kmu', hours: 4 },
  { id: 'demontazh', label: 'Демонтаж, взломать бетон', machine: 'wheeled-excavator', hours: 4 },
  { id: 'katok', label: 'Уплотнить основание катком', machine: 'roller', hours: 4 },
  { id: 'planirovka', label: 'Планировка участка', machine: 'dozer', hours: 8 },
];

/** Index of the landing for a machine (−1 when there is none). */
export const landingIndex = (machine: MachineType) =>
  LANDINGS.findIndex((l) => l.machine === machine);

export function workCost(machine: MachineType, hours: number) {
  const rate = rateOf(machine);
  return { rate, hours, total: rate * hours };
}
