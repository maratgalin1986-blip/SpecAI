// «Значки прораба»: light, just-for-fun achievements on /stroyka. No
// discounts, no promises. Pure rules plus a localStorage wrapper that never
// throws (private windows and blocked storage just start empty).

export type BadgeId = 'tour' | 'night' | 'rain' | 'talk' | 'dog' | 'order';

export interface Badge {
  id: BadgeId;
  icon: string;
  title: string;
  hint: string;
}

export const BADGES: Badge[] = [
  { id: 'tour', icon: '🚶', title: 'Обошёл весь объект', hint: 'Побывать во всех зонах стройки' },
  { id: 'night', icon: '🌙', title: 'Ночная смена', hint: 'Заглянуть на объект ночью' },
  { id: 'rain', icon: '🌧️', title: 'Пережил ливень', hint: 'Прийти на стройку в дождь' },
  { id: 'talk', icon: '💬', title: 'Поговорил со всеми', hint: 'Поговорить с каждым на объекте' },
  { id: 'dog', icon: '🐶', title: 'Нашёл Бетона', hint: 'Погладить собаку прораба' },
  { id: 'order', icon: '📋', title: 'Собрал наряд', hint: 'Заполнить все пункты наряда' },
];

export interface BadgeState {
  earned: BadgeId[];
  zones: string[];
  speakers: string[];
}

export type BadgeEvent =
  | { type: 'zone'; zone: string; all: readonly string[] }
  | { type: 'talk'; speaker: string; all: readonly string[] }
  | { type: 'night' }
  | { type: 'rain' }
  | { type: 'dog' }
  | { type: 'order' };

export const emptyBadges = (): BadgeState => ({ earned: [], zones: [], speakers: [] });

/** Applies an event; returns the new state and the badges earned just now. */
export function applyBadge(
  state: BadgeState,
  event: BadgeEvent,
): { state: BadgeState; earned: Badge[] } {
  const next: BadgeState = {
    earned: [...state.earned],
    zones: [...state.zones],
    speakers: [...state.speakers],
  };
  let id: BadgeId | null = null;
  switch (event.type) {
    case 'zone':
      if (!next.zones.includes(event.zone)) next.zones.push(event.zone);
      if (event.all.every((z) => next.zones.includes(z))) id = 'tour';
      break;
    case 'talk':
      if (!next.speakers.includes(event.speaker)) next.speakers.push(event.speaker);
      if (event.all.every((s) => next.speakers.includes(s))) id = 'talk';
      break;
    default:
      id = event.type;
  }
  if (!id || next.earned.includes(id)) return { state: next, earned: [] };
  next.earned.push(id);
  return { state: next, earned: BADGES.filter((b) => b.id === id) };
}

export const BADGES_KEY = 'stroyka.badges.v1';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function storage(): StorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

const ids = new Set<string>(BADGES.map((b) => b.id));
const strings = (v: unknown) =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 50) : [];

export function loadBadges(store: StorageLike | null = storage()): BadgeState {
  try {
    const raw = JSON.parse(store?.getItem(BADGES_KEY) ?? 'null') as Partial<BadgeState> | null;
    if (!raw || typeof raw !== 'object') return emptyBadges();
    return {
      earned: strings(raw.earned).filter((x): x is BadgeId => ids.has(x)),
      zones: strings(raw.zones),
      speakers: strings(raw.speakers),
    };
  } catch {
    return emptyBadges();
  }
}

export function saveBadges(state: BadgeState, store: StorageLike | null = storage()) {
  try {
    store?.setItem(BADGES_KEY, JSON.stringify(state));
  } catch {
    // Storage full or blocked: the badges live for this visit only.
  }
}
