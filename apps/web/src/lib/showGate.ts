// The «show» layer (app/show.css, components/ShowRuntime.tsx): one decision for
// the whole site, written on <html data-show="full|calm|off">.
//   full — entrances, light sweeps, magnetic buttons, parallax, confetti;
//   calm — entrances and press feedback only, no loops, no parallax, a small
//          confetti (data saver, a slow network, a weak phone, ?ab=calm);
//   off  — nothing moves (prefers-reduced-motion).
// The attribute is absent on pages that are not the public platform (cabinets,
// admin, legal pages, the office's client pages): the show CSS keys on it, so
// those pages never get any of it.

export type ShowLevel = 'full' | 'calm' | 'off';

export interface ShowSignals {
  reducedMotion: boolean;
  saveData: boolean;
  /** effectiveType of the connection: 'slow-2g' | '2g' | '3g' | '4g'. */
  connection: string | null;
  cores: number | null;
  memoryGb: number | null;
  /** The A/B group «calm» (lib/ab.ts). */
  calmVariant: boolean;
}

/** A phone with 2 cores or up to 2 GB of memory (where the browser says so). */
export function isLowPower(cores: number | null, memoryGb: number | null): boolean {
  return (memoryGb !== null && memoryGb <= 2) || (cores !== null && cores <= 2);
}

export function showLevel(s: ShowSignals): ShowLevel {
  if (s.reducedMotion) return 'off';
  if (
    s.saveData ||
    s.calmVariant ||
    s.connection === 'slow-2g' ||
    s.connection === '2g' ||
    isLowPower(s.cores, s.memoryGb)
  ) {
    return 'calm';
  }
  return 'full';
}

/**
 * The public platform pages that get the show: the home page, the catalogue and
 * machine pages, the map, the guest order page (not an order's own page), the
 * providers, prices, works, contacts and the how-to pages.
 */
export const SHOW_PAGES =
  /^\/(?:$|orders\/?$|(?:arenda|map|providers|ceny|raboty|contacts|equipment|kak-polzovatsya|predlozheniya)(?:\/|$))/;

export function showPage(pathname: string | null | undefined): boolean {
  return SHOW_PAGES.test(pathname ?? '');
}

type Conn = { saveData?: boolean; effectiveType?: string };
type ShowNavigator = Navigator & {
  connection?: Conn;
  deviceMemory?: number;
};

/** The signals of the current browser. */
export function readShowSignals(
  win: Pick<Window, 'matchMedia' | 'navigator' | 'location' | 'localStorage'> = window,
): ShowSignals {
  const nav = win.navigator as ShowNavigator;
  let calmVariant = false;
  try {
    const forced = /[?&]ab=(cine|calm)(?:&|#|$)/.exec(win.location.search)?.[1];
    calmVariant = (forced ?? win.localStorage.getItem('sp_ab')) === 'calm';
  } catch {
    // Storage blocked: the default group.
  }
  return {
    reducedMotion: win.matchMedia('(prefers-reduced-motion: reduce)').matches,
    saveData: !!nav.connection?.saveData,
    connection: nav.connection?.effectiveType ?? null,
    cores: nav.hardwareConcurrency || null,
    memoryGb: nav.deviceMemory ?? null,
    calmVariant,
  };
}

/** The level for the current page and browser, or null where there is no show. */
export function currentShowLevel(pathname: string | null | undefined): ShowLevel | null {
  if (typeof window === 'undefined' || !showPage(pathname)) return null;
  return showLevel(readShowSignals());
}
