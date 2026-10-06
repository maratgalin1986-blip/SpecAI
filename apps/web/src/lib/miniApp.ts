// Data and pure helpers of the Telegram Mini App (/tg): the «Наши работы»
// feed, the machine list with prices from lib/prices.ts, the order options
// and the lead text. Safe to import from server and client code.

import { LANDINGS, type Landing } from '@/lib/landings';
import { MACHINE_LABELS, defaultPhotoOf, type MachineType } from '@/lib/machinePhotos';
import { MACHINE_WORKS } from '@/lib/machineWorks';
import { modelPhotosOf } from '@/lib/modelPhotos';
import { OBJECT_PHOTOS } from '@/lib/objectPhotos';
import { fromPrice, rateOf, rub, SHIFT_HOURS } from '@/lib/prices';

export const MINI_APP_SOURCE = 'tg-miniapp';

/** No-break space: «от 32 000 ₽» never splits across lines. */
const NBSP = String.fromCharCode(0xa0);

/** One full-height card of the «Наши работы» feed. */
export type FeedItem =
  | {
      kind: 'photo';
      id: string;
      /** Path under /public. */
      src: string;
      caption: string;
      machine?: string;
      /** Machine type to preselect in the order form, if known. */
      type?: MachineType;
    }
  | {
      kind: 'video';
      id: string;
      /** Name in public/video: <clip>-sm.mp4 with a <clip>.webp poster. */
      clip: string;
      /** A job from MACHINE_WORKS[type].works (the site's own list). */
      work: string;
      type: MachineType;
    };

/**
 * Footage of the kind of work each machine does. The clips are licensed
 * stock (docs/owner-requests.md, item 7), not the owner's own sites, so the
 * card says «Пример работ»; the job wording is the site's own list.
 */
export const FEED_CLIPS: { clip: string; type: MachineType; work: string }[] = [
  { clip: 'excavator-truck', type: 'excavator', work: 'Погрузка грунта в самосвалы' },
  { clip: 'demolition', type: 'wheeled-excavator', work: 'Демонтаж фундаментов и конструкций' },
  { clip: 'crane-sun', type: 'crane', work: 'Монтаж конструкций и плит' },
  { clip: 'site-aerial', type: 'dozer', work: 'Спланировать участок' },
  { clip: 'welder-height', type: 'agp', work: 'Фасадные работы' },
  { clip: 'city-cranes', type: 'crane', work: 'Подъём грузов на высоту' },
  { clip: 'workers', type: 'kmu', work: 'Погрузка и разгрузка на объекте' },
];

/** «Экскаватор-погрузчик» → backhoe, for photos whose machine is a label. */
function typeOfLabel(label?: string): MachineType | undefined {
  if (!label) return undefined;
  const entry = (Object.entries(MACHINE_LABELS) as [MachineType, string][]).find(
    ([, name]) => name.toLowerCase() === label.toLowerCase(),
  );
  return entry?.[0];
}

/** Real photos from job sites first (when there are any), then the footage. */
export function feedItems(): FeedItem[] {
  const photos: FeedItem[] = OBJECT_PHOTOS.map((photo, i) => ({
    kind: 'photo',
    id: `photo-${i}`,
    src: photo.src,
    caption: photo.caption,
    machine: photo.machine,
    type: typeOfLabel(photo.machine),
  }));
  const videos: FeedItem[] = FEED_CLIPS.map((item) => ({
    kind: 'video',
    id: `video-${item.clip}`,
    ...item,
  }));
  return [...photos, ...videos];
}

/** Files under /public a feed item needs. */
export function feedFiles(item: FeedItem): string[] {
  return item.kind === 'photo'
    ? [item.src]
    : [`/video/${item.clip}-sm.mp4`, `/video/${item.clip}.webp`];
}

/** Machines of the catalogue and the order form: the landing pages, in their order. */
export interface MiniAppMachine {
  slug: string;
  type: MachineType;
  name: string;
  /** Singular label for the lead text: «Экскаватор-погрузчик». */
  label: string;
  photo: string;
  /** The photo shows the same model, not this very machine. */
  modelPhoto: boolean;
  rate: number;
  tasks: string[];
}

function toMachine(landing: Landing): MiniAppMachine {
  const label = MACHINE_LABELS[landing.machine];
  const model = modelPhotosOf(label)[0];
  return {
    slug: landing.slug,
    type: landing.machine,
    name: landing.short,
    label,
    photo: model ?? defaultPhotoOf(landing.machine),
    modelPhoto: Boolean(model),
    rate: rateOf(landing.machine),
    tasks: (MACHINE_WORKS[landing.machine]?.works ?? landing.tasks).slice(0, 3),
  };
}

export const MINI_APP_MACHINES: MiniAppMachine[] = LANDINGS.map(toMachine);

export function machineBySlug(slug: string | null | undefined): MiniAppMachine | undefined {
  return MINI_APP_MACHINES.find((machine) => machine.slug === slug);
}

export function machineByType(type: MachineType | undefined): MiniAppMachine | undefined {
  return type ? MINI_APP_MACHINES.find((machine) => machine.type === type) : undefined;
}

/** «от 4 000 ₽/ч» and «от 32 000 ₽» for a shift of SHIFT_HOURS hours. */
export function priceLine(type: MachineType): { hour: string; shift: string } {
  return {
    hour: fromPrice(type),
    shift: ['от', rub(rateOf(type) * SHIFT_HOURS), '₽'].join(NBSP),
  };
}

export const WHEN_OPTIONS = ['Сегодня', 'Завтра', 'На этой неделе', 'Позже'] as const;
export const WHERE_OPTIONS = [
  'Набережные Челны',
  'Елабуга',
  'Нижнекамск',
  'Менделеевск',
  'Другое место',
] as const;

/**
 * Telegram's start parameter as it may go into the lead source: only the
 * characters Telegram itself allows ([A-Za-z0-9_-]), at most 64 of them.
 */
export function sanitizeStartParam(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
}

/** «tg-miniapp» or «tg-miniapp:arenda-samosval__direct». */
export function miniAppSource(startParam: unknown): string {
  const param = sanitizeStartParam(startParam);
  return param ? `${MINI_APP_SOURCE}:${param}` : MINI_APP_SOURCE;
}

/** Phone numbers need 10–15 digits (the same rule as the lead API). */
export function phoneOk(phone: string): boolean {
  const digits = phone.replace(/\D/g, '').length;
  return digits >= 10 && digits <= 15;
}

/** The lead text the dispatcher reads. */
export function orderMessage(order: {
  machine: MiniAppMachine;
  when: string;
  where: string;
}): string {
  const { hour, shift } = priceLine(order.machine.type);
  return [
    `Заявка из Telegram Mini App: ${order.machine.label}`,
    `Когда: ${order.when}`,
    `Где: ${order.where}`,
    `Ориентировочно ${hour}, смена ${SHIFT_HOURS} ч ${shift}`,
  ].join('\n');
}
