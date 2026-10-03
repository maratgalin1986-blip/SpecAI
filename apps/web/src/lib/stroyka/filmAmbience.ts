// The sound of the film tour (/stroyka, phase 'film'): the 3D engine is not
// running there, so the page itself tells the sound layer about the weather
// (sp:nature) and lets the crew talk in the background now and then. Pure
// helpers, so the same rules as the engine can be tested.

import type { ZoneId } from '@/lib/stroyka';
import type { NatureEventDetail } from '@/lib/sceneEvents';
import { CREW, crewLine } from '@/lib/stroyka/crew';
import { skyPalette, sunPosition, weatherScene, type WeatherPoint } from '@/lib/stroykaSky';

const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * The weather around the visitor, as the 3D engine reports it: rain and snow
 * from the forecast point, wind in m/s, night from the sun over Челны at this
 * time, the ground dry, wet or under snow. `seasonSnow` is the New Year snow
 * that falls whatever the forecast (as in the engine).
 */
export function filmNature(
  date: Date,
  point: WeatherPoint | null,
  seasonSnow = false,
): NatureEventDetail {
  let w = weatherScene(point);
  if (seasonSnow)
    w = { ...w, snow: Math.max(w.snow, w.rain, 0.3), rain: 0, wet: false, snowGround: true };
  const night = skyPalette(sunPosition(date).elevation).night;
  return {
    rain: round2(w.rain),
    snow: round2(w.snow),
    wind: round2(w.wind),
    night: round2(night),
    ground: w.snowGround ? 'snow' : w.wet ? 'wet' : 'dry',
  };
}

/** Who works at which stop of the tour (crew ids from lib/stroyka/crew.ts). */
export const ZONE_CREW: Partial<Record<ZoneId, string>> = {
  gate: 'guard',
  kotlovan: 'worker-pit',
  doroga: 'worker-road',
  sklad: 'worker-yard',
  montazh: 'worker-sling',
};

/** How often a background line is heard, in ms (12…25 s). */
export function crewDelay(random = Math.random): number {
  return 12_000 + Math.floor(random() * 13_000);
}

/**
 * A background crew line for this stop: mostly the worker of the zone (when it
 * has one), otherwise anyone on the site; never the line heard just before.
 */
export function pickCrewLine(
  zone: ZoneId | null,
  last: string | null,
  random = Math.random,
): { id: string; name: string; text: string } {
  const local = zone ? ZONE_CREW[zone] : undefined;
  const ids = Object.keys(CREW);
  const id = local && random() < 0.7 ? local : ids[Math.floor(random() * ids.length) % ids.length]!;
  const line = crewLine(id, last ?? undefined, random)!;
  return { id, ...line };
}
