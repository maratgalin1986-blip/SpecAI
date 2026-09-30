// A/B test «кино или спокойно»: the `sp_ab` cookie decides whether a visitor
// gets the cinema effects (intro titles, click rings) or a calm site.
export const AB_COOKIE = 'sp_ab';
export const AB_MAX_AGE = 60 * 60 * 24 * 180;
export type AbVariant = 'cine' | 'calm';

export function parseAbVariant(value: string | null | undefined): AbVariant | null {
  return value === 'cine' || value === 'calm' ? value : null;
}

export function pickVariant(random: () => number = Math.random): AbVariant {
  return random() < 0.5 ? 'cine' : 'calm';
}

// Reads the variant from a `document.cookie`-style string.
export function parseAbCookie(cookie: string | null | undefined): AbVariant | null {
  const match = /(?:^|;\s*)sp_ab=([^;]*)/.exec(cookie ?? '');
  return parseAbVariant(match?.[1]);
}
