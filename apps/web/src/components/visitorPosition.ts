'use client';

// The visitor's own position for the site's maps («Вы здесь») and for
// «Я на объекте» (owner, 2026-10-18: «на карте должна быть точка — геопозиция
// того, кто зашёл на сайт»). The position stays in the browser: it is drawn on
// the map, and it leaves the phone only as the work point of an order the
// person sends (or rounded, as the `near` of an address search). It is never
// sent on its own and never stored.

export interface VisitorFix {
  lat: number;
  lon: number;
  /** Metres, as the browser reports it. */
  accuracy: number;
}

/** sessionStorage key: the visitor said «no» this session, maps do not ask again. */
export const GEO_DECLINED_KEY = 'specai.geo.declined';

function declinedThisSession(): boolean {
  try {
    return window.sessionStorage.getItem(GEO_DECLINED_KEY) === '1';
  } catch {
    return false;
  }
}

function rememberDecline(): void {
  try {
    window.sessionStorage.setItem(GEO_DECLINED_KEY, '1');
  } catch {
    // Storage blocked: the browser's own «denied» still stops further asks.
  }
}

async function permissionState(): Promise<PermissionState | 'unknown'> {
  try {
    if (!navigator.permissions?.query) return 'unknown';
    return (await navigator.permissions.query({ name: 'geolocation' })).state;
  } catch {
    // Older Safari: no query for geolocation.
    return 'unknown';
  }
}

type Outcome = { fix: VisitorFix } | { error: 'denied' | 'failed' | 'unsupported' };

function currentPosition(options: PositionOptions): Promise<Outcome> {
  return new Promise((resolve) => {
    try {
      navigator.geolocation.getCurrentPosition(
        ({ coords }) =>
          resolve({
            fix: { lat: coords.latitude, lon: coords.longitude, accuracy: coords.accuracy },
          }),
        (error) => {
          if (error.code === error.PERMISSION_DENIED) {
            rememberDecline();
            resolve({ error: 'denied' });
          } else {
            resolve({ error: 'failed' });
          }
        },
        options,
      );
    } catch {
      resolve({ error: 'failed' });
    }
  });
}

// One question at a time: two maps on a page share the answer.
let asking: Promise<VisitorFix | null> | null = null;

/**
 * The position for a map, asking at most once per session: at once when the
 * browser already allows it, one question when it has not decided yet (the
 * owner wants the dot to appear), nothing after a «no» — the browser's or
 * this session's. Null when there is no position; never throws.
 */
export async function mapVisitorFix(maximumAge = 60_000): Promise<VisitorFix | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return null;
  const state = await permissionState();
  if (state === 'denied') return null;
  if (state !== 'granted') {
    if (declinedThisSession()) return null;
    asking ??= currentPosition({ maximumAge: 10 * 60_000, timeout: 20_000 }).then((outcome) => {
      asking = null;
      return 'fix' in outcome ? outcome.fix : null;
    });
    return asking;
  }
  const outcome = await currentPosition({ maximumAge, timeout: 15_000 });
  return 'fix' in outcome ? outcome.fix : null;
}

/** The position only when the browser already allows it: never asks. */
export async function allowedVisitorFix(): Promise<VisitorFix | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return null;
  if ((await permissionState()) !== 'granted') return null;
  const outcome = await currentPosition({ maximumAge: 10 * 60_000, timeout: 10_000 });
  return 'fix' in outcome ? outcome.fix : null;
}

export const TAP_ERRORS = {
  unsupported: 'Браузер не даёт местоположение — нажмите на карту там, где объект',
  denied:
    'Доступ к местоположению закрыт — разрешите его в настройках браузера или нажмите на карту',
  failed: 'Не удалось определить место — нажмите на карту или найдите адрес',
} as const;

/**
 * «Я на объекте»: a fresh, precise position after the person's tap. The
 * browser asks here if it has to — the person asked for it, so a «no»
 * earlier this session does not stop it.
 */
export async function tapVisitorFix(): Promise<Outcome> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return { error: 'unsupported' };
  }
  return currentPosition({ enableHighAccuracy: true, maximumAge: 30_000, timeout: 15_000 });
}
