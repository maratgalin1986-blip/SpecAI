import { MACHINE_LABELS, type MachineType } from '@/lib/machinePhotos';

// What each machine is ordered for: the «Наряд» buttons open the wizard with
// these jobs instead of the general list, with the owner's hourly rate.

export interface MachineWorks {
  /** «краном-манипулятором» — for «Что нужно сделать …?» */
  instrumental: string;
  rate: number;
  landing?: string;
  works: string[];
}

export const MACHINE_WORKS: Partial<Record<MachineType, MachineWorks>> = {
  backhoe: {
    instrumental: 'экскаватором-погрузчиком',
    rate: 3000,
    landing: 'ekskavator-pogruzchik',
    works: [
      'Выкопать траншею под коммуникации',
      'Котлован под фундамент или септик',
      'Работа гидромолотом: демонтаж, мёрзлый грунт',
      'Засыпка и планировка',
      'Погрузка грунта и сыпучих материалов',
      'Уборка снега',
    ],
  },
  excavator: {
    instrumental: 'гусеничным экскаватором',
    rate: 3000,
    landing: 'gusenichnyj-ekskavator',
    works: [
      'Котлован под фундамент',
      'Траншея большой глубины',
      'Погрузка грунта в самосвалы',
      'Демонтаж зданий и конструкций',
      'Работа на слабом грунте',
    ],
  },
  'wheeled-excavator': {
    instrumental: 'колёсным экскаватором',
    rate: 3000,
    landing: 'kolyosnyj-ekskavator-gidromolot',
    works: [
      'Разбить бетон или асфальт гидромолотом',
      'Демонтаж фундаментов и конструкций',
      'Траншея в городе',
      'Работа по мёрзлому грунту',
      'Погрузка строительного мусора',
    ],
  },
  kmu: {
    instrumental: 'краном-манипулятором (КМУ 7 т)',
    rate: 3000,
    landing: 'manipulyator-kmu',
    works: [
      'Перевезти груз до 7 т',
      'Поднять и выгрузить: блоки, плиты, трубы',
      'Монтаж: бытовки, контейнеры, конструкции',
      'Перевезти оборудование или технику',
      'Погрузка и разгрузка на объекте',
    ],
  },
  agp: {
    instrumental: 'автовышкой',
    rate: 2500,
    landing: 'avtovyshka-agp',
    works: [
      'Фасадные работы',
      'Ремонт кровли и водостоков',
      'Спил или обрезка деревьев',
      'Монтаж освещения или рекламы',
      'Мойка окон и фасадов',
    ],
  },
  crane: {
    instrumental: 'автокраном',
    rate: 3500,
    landing: 'avtokran',
    works: [
      'Монтаж конструкций и плит',
      'Подъём грузов на высоту',
      'Погрузка и разгрузка',
      'Установка бытовок и контейнеров',
    ],
  },
  loader: {
    instrumental: 'фронтальным погрузчиком',
    rate: 3000,
    landing: 'frontalnyj-pogruzchik',
    works: [
      'Погрузка песка, щебня, грунта',
      'Уборка и погрузка снега',
      'Планировка площадки',
      'Перемещение материалов по объекту',
    ],
  },
  roller: {
    instrumental: 'виброкатком',
    rate: 3000,
    landing: 'vibrokatok',
    works: ['Уплотнение грунта', 'Уплотнение щебня и песка', 'Укатка асфальта'],
  },
  truck: {
    instrumental: 'самосвалом',
    rate: 2300,
    landing: 'samosval',
    works: ['Вывезти грунт', 'Вывезти строительный мусор', 'Привезти песок, щебень или ПГС'],
  },
  dozer: {
    instrumental: 'бульдозером',
    rate: 3000,
    landing: 'buldozer',
    works: [
      'Спланировать участок',
      'Переместить и разровнять грунт',
      'Засыпать котлован или траншею',
      'Расчистить территорию',
    ],
  },
  tractor: {
    instrumental: 'трактором',
    rate: 2500,
    landing: 'traktor',
    works: [
      'Уборка снега',
      'Покос и благоустройство',
      'Перевозка на прицепе',
      'Коммунальные работы',
    ],
  },
};

/** The machine a «Наряд» link asked for (`?m=kmu`), if it has a works list. */
export function machineFromQuery(value: string | null): MachineType | null {
  // Own keys only: `?m=toString` must not reach Object.prototype.
  return value && Object.prototype.hasOwnProperty.call(MACHINE_WORKS, value)
    ? (value as MachineType)
    : null;
}

export function machineLabel(type: MachineType) {
  return MACHINE_LABELS[type];
}
