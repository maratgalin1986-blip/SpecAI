import { landingBySlug } from '@/lib/landings';
import { MACHINE_LABELS, type MachineType } from '@/lib/machinePhotos';
import { CRANE_HEAVY_RATE, HAMMER_RATE, rateOf } from '@/lib/prices';

// Job pages (/raboty/<slug>): what a customer needs done, which СпецПласт16
// machine does it, how the work goes and what an example shift costs. Prices
// come from lib/prices.ts only; delivery is priced by the dispatcher.

export interface JobMachine {
  type: MachineType;
  /** The machine's landing in lib/landings.ts. */
  landing: string;
  /** What the machine does in this job. */
  role: string;
  /** Works with the hydraulic hammer: HAMMER_RATE. */
  hammer?: boolean;
  /** The 32 t crane: CRANE_HEAVY_RATE. */
  heavy?: boolean;
}

export interface Job {
  slug: string;
  /** «Копка траншеи» */
  name: string;
  /** One line for the index card and the description. */
  short: string;
  /** How the work goes, step by step. */
  steps: string[];
  /** The first machine is the main one: its price is the page's «от …». */
  machines: JobMachine[];
}

export const JOBS: Job[] = [
  {
    slug: 'kopka-transhei',
    name: 'Копка траншеи',
    short: 'Траншеи под водопровод, канализацию и кабель — экскаватором с машинистом.',
    steps: [
      'Вы называете длину, глубину и что пойдёт в траншею; диспетчер подбирает машину.',
      'Короткие траншеи на участке копает экскаватор-погрузчик, длинные и глубокие — гусеничный экскаватор.',
      'Грунт складывается рядом с траншеей для обратной засыпки или грузится в самосвал на вывоз.',
      'Оплата — по фактически отработанным часам.',
    ],
    machines: [
      { type: 'backhoe', landing: 'ekskavator-pogruzchik', role: 'траншеи на участке и во дворе' },
      {
        type: 'excavator',
        landing: 'gusenichnyj-ekskavator',
        role: 'длинные и глубокие траншеи под трубы и кабель',
      },
    ],
  },
  {
    slug: 'kotlovan-pod-fundament',
    name: 'Котлован под фундамент',
    short: 'Котлован под дом, баню или подвал: экскаватор копает, самосвал вывозит грунт.',
    steps: [
      'Нужны размеры и глубина котлована; если есть проект — пришлите его диспетчеру.',
      'Экскаватор разрабатывает котлован по разметке, лишний грунт сразу грузится в самосвал.',
      'Часть грунта можно оставить на участке для обратной засыпки пазух.',
      'Оплата — по фактически отработанным часам каждой машины.',
    ],
    machines: [
      {
        type: 'excavator',
        landing: 'gusenichnyj-ekskavator',
        role: 'котлованы большого объёма',
      },
      {
        type: 'backhoe',
        landing: 'ekskavator-pogruzchik',
        role: 'небольшие котлованы под дом и баню',
      },
      { type: 'truck', landing: 'samosval', role: 'вывоз лишнего грунта' },
    ],
  },
  {
    slug: 'septik',
    name: 'Яма под септик',
    short: 'Выкопать яму под септик или кольца колодца и опустить их на место.',
    steps: [
      'Сообщите модель септика или число колец — по ним считаются размеры ямы.',
      'Экскаватор-погрузчик копает яму и траншею к дому.',
      'Тяжёлые кольца или ёмкость можно опустить манипулятором — скажите об этом в заявке.',
      'После монтажа машина делает обратную засыпку.',
    ],
    machines: [
      { type: 'backhoe', landing: 'ekskavator-pogruzchik', role: 'яма, траншея и засыпка' },
      { type: 'kmu', landing: 'manipulyator-kmu', role: 'доставка и установка колец' },
    ],
  },
  {
    slug: 'vyvoz-snega',
    name: 'Вывоз снега',
    short: 'Уборка снега с территорий и стоянок: погрузчик грузит, самосвалы вывозят.',
    steps: [
      'Назовите адрес и примерную площадь — диспетчер подберёт число машин.',
      'Фронтальный погрузчик сдвигает снег в кучи и грузит его в самосвалы.',
      'Самосвалы вывозят снег с территории.',
      'Оплата — по фактически отработанным часам каждой машины.',
    ],
    machines: [
      {
        type: 'loader',
        landing: 'frontalnyj-pogruzchik',
        role: 'сгребание и погрузка снега',
      },
      { type: 'truck', landing: 'samosval', role: 'вывоз снега' },
      { type: 'backhoe', landing: 'ekskavator-pogruzchik', role: 'уборка во дворах и проездах' },
    ],
  },
  {
    slug: 'demontazh',
    name: 'Демонтаж',
    short: 'Снос старых фундаментов и бетона, вскрытие асфальта — экскаватором с гидромолотом.',
    steps: [
      'Расскажите, что нужно разобрать: бетон, кирпич, асфальт, фундамент.',
      'Гидромолот разбивает конструкцию, ковш собирает обломки.',
      'Мусор грузится в самосвал и вывозится — закажите его той же заявкой.',
      'Работа с гидромолотом идёт по отдельной ставке.',
    ],
    machines: [
      {
        type: 'wheeled-excavator',
        landing: 'kolyosnyj-ekskavator-gidromolot',
        role: 'бетон, асфальт и фундаменты гидромолотом',
        hammer: true,
      },
      {
        type: 'backhoe',
        landing: 'ekskavator-pogruzchik',
        role: 'небольшой демонтаж гидромолотом',
        hammer: true,
      },
      { type: 'truck', landing: 'samosval', role: 'вывоз строительного мусора' },
    ],
  },
  {
    slug: 'planirovka-uchastka',
    name: 'Планировка участка',
    short: 'Выровнять участок, срезать растительный слой, разровнять и укатать грунт.',
    steps: [
      'Назовите площадь участка и что на нём будет: дом, газон, площадка, проезд.',
      'Бульдозер срезает и разравнивает грунт, на небольших участках работает экскаватор-погрузчик.',
      'Под площадку или проезд основание уплотняет виброкаток.',
      'Оплата — по фактически отработанным часам.',
    ],
    machines: [
      { type: 'dozer', landing: 'buldozer', role: 'планировка больших площадей' },
      { type: 'backhoe', landing: 'ekskavator-pogruzchik', role: 'небольшие участки' },
      { type: 'roller', landing: 'vibrokatok', role: 'уплотнение основания' },
    ],
  },
  {
    slug: 'podyom-gruzov-kranom',
    name: 'Подъём грузов краном',
    short: 'Подъём материалов на этажи и кровлю, монтаж конструкций, погрузка и разгрузка.',
    steps: [
      'Сообщите вес груза, высоту и вылет стрелы — от них зависит выбор крана.',
      'Диспетчер подберёт автокран 25 т или 32 т и подскажет, нужен ли стропальщик.',
      'Кран встаёт на выносные опоры на подготовленной площадке и поднимает груз.',
      'Оплата — по фактически отработанным часам.',
    ],
    machines: [
      { type: 'crane', landing: 'avtokran', role: 'подъём и монтаж, кран 25 т' },
      { type: 'crane', landing: 'avtokran', role: 'тяжёлые подъёмы', heavy: true },
    ],
  },
  {
    slug: 'montazh-na-vysote',
    name: 'Монтаж на высоте',
    short: 'Вывески, освещение, фасады, кровли и деревья — с автовышки АГП, без лесов.',
    steps: [
      'Назовите высоту работ и что нужно сделать.',
      'Диспетчер подберёт автовышку АГП с подходящей высотой подъёма.',
      'Оператор автовышки подаёт люльку к нужной точке, работы ведутся прямо из люльки.',
      'Оплата — по фактически отработанным часам.',
    ],
    machines: [{ type: 'agp', landing: 'avtovyshka-agp', role: 'работы на высоте из люльки' }],
  },
];

export function jobBySlug(slug: string): Job | undefined {
  return JOBS.find((job) => job.slug === slug);
}

/** The hourly rate of a machine in a job, from lib/prices.ts. */
export function jobMachineRate(machine: JobMachine): number {
  if (machine.hammer) return HAMMER_RATE;
  if (machine.heavy) return CRANE_HEAVY_RATE;
  return rateOf(machine.type);
}

/** The page's «от …»: the main machine's rate. */
export function jobRate(job: Job): number {
  return jobMachineRate(job.machines[0]!);
}

/** «Экскаватор-погрузчик с гидромолотом», «Автокран 32 т» */
export function jobMachineLabel(machine: JobMachine): string {
  const label = MACHINE_LABELS[machine.type];
  if (machine.heavy) return `${label} 32 т`;
  return machine.hammer && !/гидромолот/i.test(label) ? `${label} с гидромолотом` : label;
}

/** The landing of the job's main machine. */
export function jobLanding(job: Job) {
  return landingBySlug(job.machines[0]!.landing);
}
