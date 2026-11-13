// Background footage on phones (screens up to 640 px), one rule for every
// player (CinemaVideo, LoopVideo, SiteJourney):
// - nothing starts by itself on a timer: the poster frame stays until the
//   visitor's first touch;
// - at most one clip per page: the first player that gets to start owns the
//   page's single video, the others keep their poster frames;
// - pages with a form to fill in (/contacts, /orders) and the machine and job
//   pages (/arenda/*, /raboty/*) show only the poster frame.
// Wider screens keep the full show.

/** The widest screen that counts as a phone (the light cut of a clip, too). */
export const PHONE_MAX_PX = 640;

export function isPhoneScreen(): boolean {
  return (
    typeof window !== 'undefined' && window.matchMedia(`(max-width: ${PHONE_MAX_PX}px)`).matches
  );
}

const POSTER_ONLY = [/^\/contacts\/?$/, /^\/orders(\/|$)/, /^\/arenda(\/|$)/, /^\/raboty(\/|$)/];

/** Whether a phone gets only the poster frame on this page (no video at all). */
export function phonePosterOnly(pathname: string): boolean {
  return POSTER_ONLY.some((pattern) => pattern.test(pathname));
}

let owner: object | null = null;

/**
 * Takes the page's single phone video for `token`: true when it is free or
 * already this player's. Give it back with releasePhoneVideo on unmount.
 */
export function claimPhoneVideo(token: object): boolean {
  if (owner && owner !== token) return false;
  owner = token;
  return true;
}

export function releasePhoneVideo(token: object): void {
  if (owner === token) owner = null;
}

const FIRST_INPUT = ['pointerdown', 'touchstart', 'keydown'] as const;

/**
 * Runs `start` on the visitor's next touch, tap or key press; returns a
 * canceller. Phones start footage only this way, never on a timer.
 */
export function onFirstInput(start: () => void): () => void {
  const opts = { passive: true, capture: true } as const;
  let done = false;
  const fire = () => {
    if (done) return;
    cancel();
    start();
  };
  const cancel = () => {
    done = true;
    FIRST_INPUT.forEach((type) => window.removeEventListener(type, fire, opts));
  };
  FIRST_INPUT.forEach((type) => window.addEventListener(type, fire, opts));
  return cancel;
}
