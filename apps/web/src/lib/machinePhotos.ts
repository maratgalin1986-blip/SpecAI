// Illustrative machine photos: which pictures exist for each machine type and
// a picker that shows a different variant on every visit. Pure module — safe
// to import from server code; only pickPhoto() touches the browser.

export type MachineType =
  | 'backhoe'
  | 'excavator'
  | 'wheeled-excavator'
  | 'kmu'
  | 'agp'
  | 'roller'
  | 'crane'
  | 'loader'
  | 'truck'
  | 'dozer'
  | 'tractor'
  | 'trench';

export const MACHINE_LABELS: Record<MachineType, string> = {
  backhoe: 'Экскаватор-погрузчик',
  excavator: 'Гусеничный экскаватор',
  'wheeled-excavator': 'Колёсный экскаватор с гидромолотом',
  kmu: 'Манипулятор КМУ 7 т',
  agp: 'Автовышка АГП',
  roller: 'Виброкаток',
  crane: 'Автокран',
  loader: 'Фронтальный погрузчик',
  truck: 'Самосвал',
  dozer: 'Бульдозер',
  tractor: 'Трактор',
  trench: 'Траншея ночью',
};

/**
 * THE ONE CONSTANT TO EDIT when new photos land.
 *
 * How many files /images/machines/<type>-1.jpg … <type>-N.jpg exist for each
 * type. A type listed here uses exactly those files; a type left out (or 0)
 * falls back to the single legacy photo in LEGACY_PHOTO below. Check that the
 * files are really there before adding a type — a missing file is a broken
 * image, not a fallback.
 *
 * Example once everything is generated:
 *   { backhoe: 3, excavator: 3, 'wheeled-excavator': 3, kmu: 3, agp: 3,
 *     roller: 3, crane: 3, loader: 3, truck: 3, dozer: 3, tractor: 3, trench: 3 }
 */
export const MACHINE_PHOTO_VARIANTS: Partial<Record<MachineType, number>> = {
  backhoe: 3,
  excavator: 3,
  'wheeled-excavator': 3,
  kmu: 3,
  agp: 3,
  roller: 3,
  crane: 3,
  loader: 3,
  truck: 3,
  dozer: 3,
  tractor: 3,
};

/** Photos that already ship with the site; used until a type has variants. */
const LEGACY_PHOTO: Record<MachineType, string> = {
  backhoe: '/images/backhoe.jpg',
  excavator: '/images/backhoe.jpg',
  'wheeled-excavator': '/images/backhoe.jpg',
  kmu: '/images/crane.jpg',
  agp: '/images/crane.jpg',
  roller: '/images/dozer.jpg',
  crane: '/images/crane.jpg',
  loader: '/images/loader.jpg',
  truck: '/images/truck.jpg',
  dozer: '/images/dozer.jpg',
  tractor: '/images/tractor.jpg',
  trench: '/images/trench.jpg',
};

export const MACHINE_TYPES = Object.keys(LEGACY_PHOTO) as MachineType[];

/** All photo paths for a type; the first one is what the server renders. */
export function photosOf(type: MachineType): readonly string[] {
  const count = MACHINE_PHOTO_VARIANTS[type] ?? 0;
  if (count <= 0) return [LEGACY_PHOTO[type]];
  return Array.from({ length: count }, (_, i) => `/images/machines/${type}-${i + 1}.jpg`);
}

/** The server-rendered (first) photo of a type. */
export function defaultPhotoOf(type: MachineType): string {
  return photosOf(type)[0]!;
}

const STORAGE_PREFIX = 'machine-photo:';

function readLast(key: string): string | null {
  try {
    return window.sessionStorage.getItem(STORAGE_PREFIX + key);
  } catch {
    return null;
  }
}

function writeLast(key: string, src: string) {
  try {
    window.sessionStorage.setItem(STORAGE_PREFIX + key, src);
  } catch {
    // Private mode or blocked storage: variants just repeat more often.
  }
}

/**
 * A random photo of the type, never the one shown last time for that type
 * (remembered for the browser session). `slot` separates places that show
 * the same type on one page (e.g. the hero and the story), so each of them
 * changes between visits. Client only; on the server it returns the default.
 */
export function pickPhoto(
  type: MachineType,
  slot = '',
  random: () => number = Math.random,
): string {
  const photos = photosOf(type);
  if (typeof window === 'undefined' || photos.length === 1) return photos[0]!;
  const key = slot ? `${type}:${slot}` : type;
  const last = readLast(key);
  const choices = photos.filter((src) => src !== last);
  const pick = choices[Math.floor(random() * choices.length)] ?? photos[0]!;
  writeLast(key, pick);
  return pick;
}
