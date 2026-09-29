// Every visit shows a different construction project: its own name, hero
// footage and footage at the stops of the site journey. The projects come
// from a shuffled deck kept in localStorage, so none repeats until all of
// them have been shown, and a new deck never starts with the last one.
// Clips live in public/video/<name>.{webm,mp4} with a .webp poster frame.

/** Journey stops whose footage depends on the project. */
export type ObjectStop = 'gate' | 'pit' | 'yard' | 'height' | 'demolition' | 'finale';

export type SiteObject = {
  id: string;
  name: string;
  hero: string;
  clips: Record<ObjectStop, string>;
};

export const SITE_OBJECTS: SiteObject[] = [
  {
    id: 'kvartal',
    name: 'Жилой квартал',
    hero: 'site-aerial',
    clips: {
      gate: 'site-aerial',
      pit: 'excavator-truck',
      yard: 'workers',
      height: 'tower-glass',
      demolition: 'demolition',
      finale: 'frame-sunset',
    },
  },
  {
    id: 'bashnya',
    name: 'Башня в центре города',
    hero: 'city-cranes',
    clips: {
      gate: 'city-cranes',
      pit: 'excavator-truck',
      yard: 'steel-frame',
      height: 'tower-glass',
      demolition: 'demolition',
      finale: 'building-sun',
    },
  },
  {
    id: 'ceh',
    name: 'Производственный цех',
    hero: 'steel-frame',
    clips: {
      gate: 'steel-frame',
      pit: 'excavator-truck',
      yard: 'workers',
      height: 'welder-height',
      demolition: 'demolition',
      finale: 'crane-sun',
    },
  },
  {
    id: 'poselok',
    name: 'Коттеджный посёлок',
    hero: 'house-frame',
    clips: {
      gate: 'house-frame',
      pit: 'excavator-truck',
      yard: 'workers',
      height: 'frame-sunset',
      demolition: 'demolition',
      finale: 'building-sun',
    },
  },
  {
    id: 'rekonstrukciya',
    name: 'Реконструкция квартала',
    hero: 'crane-sun',
    clips: {
      gate: 'crane-sun',
      pit: 'excavator-truck',
      yard: 'steel-frame',
      height: 'welder-height',
      demolition: 'demolition',
      finale: 'frame-sunset',
    },
  },
  {
    id: 'biznes-centr',
    name: 'Деловой центр',
    hero: 'tower-glass',
    clips: {
      gate: 'tower-glass',
      pit: 'excavator-truck',
      yard: 'workers',
      height: 'welder-height',
      demolition: 'demolition',
      finale: 'building-sun',
    },
  },
];

const DECK_KEY = 'sp16_object_deck';

function shuffle<T>(items: T[]) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Builds the next deck; `last` never comes first, so no back-to-back repeat. */
export function nextDeck(ids: string[], last?: string) {
  const deck = shuffle(ids);
  if (last && deck.length > 1 && deck[0] === last) {
    [deck[0], deck[1]] = [deck[1]!, deck[0]!];
  }
  return deck;
}

let current: SiteObject | null = null;

/**
 * The project for this page load: the hero and the journey share it. Call it
 * after hydration (in an effect); the server always renders the first one.
 */
export function currentSiteObject(): SiteObject {
  if (current) return current;
  const ids = SITE_OBJECTS.map((item) => item.id);
  let deck: string[] = [];
  let last: string | undefined;
  try {
    const saved = JSON.parse(localStorage.getItem(DECK_KEY) ?? 'null') as {
      deck?: string[];
      last?: string;
    } | null;
    deck = (saved?.deck ?? []).filter((id) => ids.includes(id));
    last = saved?.last;
  } catch {
    // Storage blocked: fall back to a random project.
  }
  if (!deck.length) deck = nextDeck(ids, last);
  const [id, ...rest] = deck;
  try {
    localStorage.setItem(DECK_KEY, JSON.stringify({ deck: rest, last: id }));
  } catch {
    // Ignore: the visitor just may see a repeat later.
  }
  current = SITE_OBJECTS.find((item) => item.id === id) ?? SITE_OBJECTS[0]!;
  return current;
}
