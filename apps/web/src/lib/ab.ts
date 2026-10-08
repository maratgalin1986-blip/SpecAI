// A/B test «кино или спокойно»: the variant decides whether a visitor gets the
// cinema effects (intro titles, click rings) or a calm site. The owner wants the
// cinema for everyone, so the default is «cine»; `?ab=calm|cine` switches it for
// comparison and is remembered in localStorage (`sp_ab`). It used to be a
// cookie set by the middleware before any consent (152-ФЗ review, round 2):
// now nothing is written unless the visitor opens a link with `?ab=`.
export const AB_KEY = 'sp_ab';
export type AbVariant = 'cine' | 'calm';

export function parseAbVariant(value: string | null | undefined): AbVariant | null {
  return value === 'cine' || value === 'calm' ? value : null;
}

export function pickVariant(random: () => number = Math.random): AbVariant {
  return random() < 0.5 ? 'cine' : 'calm';
}

type AbStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** The variant from `?ab=` (then remembered) or from storage; «cine» by default. */
export function readAbVariant(search: string, storage: AbStorage | null): AbVariant {
  const forced = parseAbVariant(/[?&]ab=([^&#]*)/.exec(search)?.[1]);
  try {
    if (forced) storage?.setItem(AB_KEY, forced);
    return forced ?? parseAbVariant(storage?.getItem(AB_KEY)) ?? 'cine';
  } catch {
    return forced ?? 'cine';
  }
}

/** In the browser: the current visitor's variant. */
export function abVariant(): AbVariant {
  if (typeof window === 'undefined') return 'cine';
  let storage: AbStorage | null = null;
  try {
    storage = window.localStorage;
  } catch {
    // Storage blocked: the default variant.
  }
  return readAbVariant(window.location.search, storage);
}

/**
 * The same in plain ES5 for the inline head scripts (intro, Metrika): defines
 * `var ab` as 'cine' or 'calm'.
 */
export const AB_INLINE =
  `var ab='cine';try{var abq=/[?&]ab=(cine|calm)(?:&|#|$)/.exec(location.search);` +
  `if(abq)localStorage.setItem('${AB_KEY}',abq[1]);` +
  `var abs=localStorage.getItem('${AB_KEY}');if(abs==='calm'||abs==='cine')ab=abs}catch(e){}`;
