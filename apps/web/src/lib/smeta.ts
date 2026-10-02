import type { MachineType } from '@/lib/machinePhotos';
import { HAMMER_RATE, MACHINE_WORKS } from '@/lib/machineWorks';

// «Рассчитать примерную смету»: the visitor picks a job and its size, and we
// work out which СпецПласт16 machines it needs and for how long, from typical
// output rates and the owner's hourly prices. It is a rough guide, never an
// offer: the dispatcher names the exact price. Pure functions, no I/O.

/** Each machine is booked for at least this long in the estimate. */
export const MIN_HOURS = 4;
/** The upper bound: soil, access and weather usually add up to a quarter. */
export const RESERVE = 1.25;
/** A dump truck carries about 10 m³ a trip; a city trip takes about 1.2 h. */
const TRUCK_M3 = 10;
const TRUCK_TRIP_H = 1.2;
/** Dug soil takes about a quarter more room in the truck. */
const SWELL = 1.25;
/** Crane rate for heavy lifts (the 32 t crane). */
export const CRANE_HEAVY_RATE = 4500;

export type FieldId =
  | 'length'
  | 'width'
  | 'depth'
  | 'area'
  | 'volume'
  | 'thickness'
  | 'lifts'
  | 'weight'
  | 'trips'
  | 'distance'
  | 'hours'
  | 'layers';

export interface Field {
  id: FieldId;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  initial: number;
}

export type Option = 'haul' | 'backfill' | 'roller';

export interface SmetaJob {
  id: string;
  title: string;
  hint: string;
  fields: Field[];
  options: { id: Option; label: string; initial: boolean }[];
}

export interface SmetaRow {
  machine: MachineType;
  name: string;
  /** What it does in this job, e.g. «копает 27 м³». */
  task: string;
  hours: number;
  rate: number;
  sum: number;
}

export interface Smeta {
  job: SmetaJob;
  rows: SmetaRow[];
  total: number;
  totalHigh: number;
  notes: string[];
}

const field = (
  id: FieldId,
  label: string,
  unit: string,
  initial: number,
  min: number,
  max: number,
  step = 1,
): Field => ({ id, label, unit, initial, min, max, step });

export const SMETA_JOBS: SmetaJob[] = [
  {
    id: 'trench',
    title: 'Траншея под коммуникации',
    hint: 'Водопровод, канализация, кабель',
    fields: [
      field('length', 'Длина', 'м', 30, 1, 2000),
      field('width', 'Ширина', 'м', 0.6, 0.3, 3, 0.1),
      field('depth', 'Глубина', 'м', 1.5, 0.5, 5, 0.1),
    ],
    options: [
      { id: 'backfill', label: 'Обратная засыпка', initial: true },
      { id: 'haul', label: 'Вывезти лишний грунт', initial: false },
    ],
  },
  {
    id: 'pit',
    title: 'Котлован под фундамент',
    hint: 'Дом, баня, септик, бассейн',
    fields: [
      field('length', 'Длина', 'м', 10, 1, 200),
      field('width', 'Ширина', 'м', 8, 1, 200),
      field('depth', 'Глубина', 'м', 1.5, 0.5, 8, 0.1),
    ],
    options: [{ id: 'haul', label: 'Вывезти грунт', initial: true }],
  },
  {
    id: 'planning',
    title: 'Планировка участка',
    hint: 'Выровнять, разровнять грунт',
    fields: [field('area', 'Площадь', 'м²', 1000, 50, 100000, 50)],
    options: [{ id: 'roller', label: 'Укатать катком', initial: false }],
  },
  {
    id: 'haul',
    title: 'Вывоз грунта или мусора',
    hint: 'Погрузка и вывоз самосвалами',
    fields: [field('volume', 'Объём', 'м³', 40, 5, 5000, 5)],
    options: [],
  },
  {
    id: 'demolition',
    title: 'Демонтаж гидромолотом',
    hint: 'Бетон, асфальт, фундамент',
    fields: [
      field('area', 'Площадь', 'м²', 20, 1, 5000),
      field('thickness', 'Толщина', 'см', 20, 5, 150, 5),
    ],
    options: [{ id: 'haul', label: 'Вывезти обломки', initial: true }],
  },
  {
    id: 'lift',
    title: 'Подъём и монтаж краном',
    hint: 'Плиты, блоки, конструкции',
    fields: [
      field('lifts', 'Подъёмов', 'шт', 20, 1, 500),
      field('weight', 'Самый тяжёлый груз', 'т', 3, 0.5, 30, 0.5),
    ],
    options: [],
  },
  {
    id: 'kmu',
    title: 'Перевезти и выгрузить манипулятором',
    hint: 'Блоки, бытовка, оборудование до 7 т',
    fields: [
      field('trips', 'Рейсов', 'шт', 2, 1, 50),
      field('distance', 'Расстояние', 'км', 15, 1, 300),
    ],
    options: [],
  },
  {
    id: 'height',
    title: 'Работы на высоте (автовышка)',
    hint: 'Фасад, кровля, деревья, освещение',
    fields: [field('hours', 'Время работы', 'ч', 4, 1, 200)],
    options: [],
  },
  {
    id: 'compaction',
    title: 'Уплотнение катком',
    hint: 'Грунт, щебень, песок, асфальт',
    fields: [
      field('area', 'Площадь', 'м²', 500, 50, 100000, 50),
      field('layers', 'Слоёв', 'шт', 2, 1, 6),
    ],
    options: [],
  },
  {
    id: 'snow',
    title: 'Уборка и вывоз снега',
    hint: 'Площадки, дворы, стоянки',
    fields: [
      field('area', 'Площадь', 'м²', 2000, 100, 200000, 100),
      field('depth', 'Слой снега', 'м', 0.3, 0.1, 2, 0.1),
    ],
    options: [{ id: 'haul', label: 'Вывезти снег', initial: true }],
  },
];

const NAMES: Partial<Record<MachineType, string>> = {
  backhoe: 'Экскаватор-погрузчик',
  excavator: 'Гусеничный экскаватор',
  'wheeled-excavator': 'Колёсный экскаватор с гидромолотом',
  truck: 'Самосвал',
  dozer: 'Бульдозер',
  roller: 'Виброкаток',
  loader: 'Фронтальный погрузчик',
  crane: 'Автокран',
  kmu: 'Манипулятор КМУ 7 т',
  agp: 'Автовышка АГП',
};

export function rateOf(machine: MachineType): number {
  return MACHINE_WORKS[machine]?.rate ?? 3000;
}

/** Whole hours, at least the minimum booking. */
export function billableHours(hours: number): number {
  return Math.max(MIN_HOURS, Math.ceil(hours - 1e-9));
}

const fmt = (n: number) => (Math.round(n * 10) / 10).toLocaleString('ru-RU');

function row(machine: MachineType, task: string, hours: number, rate = rateOf(machine)): SmetaRow {
  const billed = billableHours(hours);
  return {
    machine,
    name: NAMES[machine] ?? machine,
    task,
    hours: billed,
    rate,
    sum: billed * rate,
  };
}

function haulRows(volumeInBank: number, loose = true): SmetaRow {
  const loaded = volumeInBank * (loose ? SWELL : 1);
  const trips = Math.max(1, Math.ceil(loaded / TRUCK_M3));
  return row('truck', `вывоз ≈ ${fmt(loaded)} м³, ${trips} рейс(ов)`, trips * TRUCK_TRIP_H);
}

export type SmetaInput = Partial<Record<FieldId, number>> & {
  options?: Partial<Record<Option, boolean>>;
};

/** The estimate for a job; missing values take the field defaults. */
export function buildSmeta(jobId: string, input: SmetaInput = {}): Smeta | null {
  const job = SMETA_JOBS.find((item) => item.id === jobId);
  if (!job) return null;
  const v = (id: FieldId) => {
    const spec = job.fields.find((item) => item.id === id);
    const value = input[id] ?? spec?.initial ?? 0;
    return spec ? Math.min(spec.max, Math.max(spec.min, value)) : value;
  };
  const opt = (id: Option) =>
    input.options?.[id] ?? job.options.find((o) => o.id === id)?.initial ?? false;
  const rows: SmetaRow[] = [];
  const notes: string[] = [];

  switch (job.id) {
    case 'trench': {
      const volume = v('length') * v('width') * v('depth');
      rows.push(
        row(
          'backhoe',
          `копает ≈ ${fmt(volume)} м³`,
          volume / 18 + (opt('backfill') ? volume / 40 : 0),
        ),
      );
      if (opt('haul')) rows.push(haulRows(volume * 0.3));
      notes.push('Экскаватор-погрузчик: около 18 м³/ч в обычном грунте, засыпка — около 40 м³/ч.');
      if (opt('haul')) notes.push('Вывозим примерно треть грунта — остальное уходит в засыпку.');
      break;
    }
    case 'pit': {
      const volume = v('length') * v('width') * v('depth');
      const big = volume > 300;
      rows.push(
        row(big ? 'excavator' : 'backhoe', `копает ≈ ${fmt(volume)} м³`, volume / (big ? 45 : 20)),
      );
      if (opt('haul')) rows.push(haulRows(volume));
      notes.push(
        big
          ? 'Большой объём — берём гусеничный экскаватор, около 45 м³/ч.'
          : 'Экскаватор-погрузчик: около 20 м³/ч в обычном грунте.',
      );
      break;
    }
    case 'planning': {
      const area = v('area');
      const big = area > 1500;
      rows.push(
        row(big ? 'dozer' : 'backhoe', `планирует ${fmt(area)} м²`, area / (big ? 400 : 200)),
      );
      if (opt('roller')) rows.push(row('roller', `укатывает ${fmt(area)} м²`, area / 500));
      notes.push(big ? 'Бульдозер: около 400 м²/ч.' : 'Экскаватор-погрузчик: около 200 м²/ч.');
      break;
    }
    case 'haul': {
      const volume = v('volume');
      rows.push(
        row(
          volume > 100 ? 'loader' : 'backhoe',
          `грузит ${fmt(volume)} м³`,
          volume / (volume > 100 ? 80 : 40),
        ),
      );
      rows.push(haulRows(volume, false));
      notes.push('Самосвал берёт около 10 м³ за рейс, рейс по городу — около 1,2 ч.');
      break;
    }
    case 'demolition': {
      const volume = v('area') * (v('thickness') / 100);
      rows.push(row('wheeled-excavator', `разбивает ≈ ${fmt(volume)} м³`, volume / 3, HAMMER_RATE));
      if (opt('haul')) rows.push(haulRows(volume, true));
      notes.push('Гидромолот: около 3 м³/ч по бетону, по асфальту быстрее.');
      break;
    }
    case 'lift': {
      const heavy = v('weight') > 8;
      rows.push(
        row(
          'crane',
          `${v('lifts')} подъёмов, до ${fmt(v('weight'))} т`,
          1 + v('lifts') * 0.2,
          heavy ? CRANE_HEAVY_RATE : rateOf('crane'),
        ),
      );
      notes.push(
        heavy
          ? 'Тяжёлый груз — в расчёте автокран 32 т (4 500 ₽/ч).'
          : 'Около 12 минут на подъём и час на установку крана.',
      );
      notes.push('Грузоподъёмность на нужном вылете стрелы уточнит диспетчер.');
      break;
    }
    case 'kmu': {
      const perTrip = 1 + v('distance') / 30;
      rows.push(
        row('kmu', `${v('trips')} рейс(ов) по ${fmt(v('distance'))} км`, v('trips') * perTrip),
      );
      notes.push('Рейс: около часа на погрузку и выгрузку плюс дорога ~30 км/ч по городу.');
      break;
    }
    case 'height': {
      rows.push(row('agp', 'работа на высоте', v('hours')));
      break;
    }
    case 'compaction': {
      rows.push(
        row(
          'roller',
          `${fmt(v('area'))} м² × ${v('layers')} слоя`,
          (v('area') * v('layers')) / 500,
        ),
      );
      notes.push('Виброкаток: около 500 м²/ч на слой.');
      break;
    }
    case 'snow': {
      const volume = v('area') * v('depth');
      rows.push(
        row(
          'loader',
          `чистит ${fmt(v('area'))} м²`,
          v('area') / 1000 + (opt('haul') ? volume / 80 : 0),
        ),
      );
      if (opt('haul')) rows.push(haulRows(volume * 0.5, false));
      notes.push('Снег при погрузке уплотняется примерно вдвое.');
      break;
    }
  }

  const truckHours = rows.filter((r) => r.machine === 'truck').reduce((h, r) => h + r.hours, 0);
  if (truckHours > 16) {
    notes.push(
      'Самосвалы пустим одновременно — по времени выйдет быстрее, по деньгам примерно столько же.',
    );
  }
  const total = rows.reduce((sum, item) => sum + item.sum, 0);
  notes.push(
    `Каждая машина — не меньше ${MIN_HOURS} ч. Подача техники и точный минимум — у диспетчера.`,
  );
  return { job, rows, total, totalHigh: Math.round((total * RESERVE) / 100) * 100, notes };
}

/** The estimate as plain text for a request or a WhatsApp message. */
export function smetaText(smeta: Smeta, input: SmetaInput): string {
  const params = smeta.job.fields
    .map((f) => `${f.label.toLowerCase()} ${fmt(input[f.id] ?? f.initial)} ${f.unit}`)
    .join(', ');
  const lines = [
    `Примерная смета СпецПласт16: ${smeta.job.title} (${params}).`,
    ...smeta.rows.map(
      (r) =>
        `• ${r.name}: ${r.hours} ч × ${r.rate.toLocaleString('ru-RU')} ₽ = ${r.sum.toLocaleString('ru-RU')} ₽ — ${r.task}`,
    ),
    `Итого примерно ${smeta.total.toLocaleString('ru-RU')} – ${smeta.totalHigh.toLocaleString('ru-RU')} ₽. Прошу назвать точную цену.`,
  ];
  return lines.join('\n');
}
