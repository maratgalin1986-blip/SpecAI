import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ZONE_FILMS, zoneFilmPoster, zoneFilmSrc } from './zoneFilms';
import type { ZoneId } from '@/lib/stroyka';

const PUBLIC = join(__dirname, '../../../public');
const size = (url: string) => statSync(join(PUBLIC, url)).size;

describe('ZONE_FILMS', () => {
  const zones = Object.keys(ZONE_FILMS) as ZoneId[];

  it('has every cut of every loop, within its weight', () => {
    for (const zone of zones) {
      const files: [string, number][] = [
        [zoneFilmSrc(zone, false), 1_600_000],
        [zoneFilmSrc(zone, true), 700_000],
        [zoneFilmSrc(zone, true, true), 1_200_000],
        [zoneFilmPoster(zone), 90_000],
        [zoneFilmPoster(zone, true), 90_000],
      ];
      for (const [url, limit] of files) {
        expect(existsSync(join(PUBLIC, url)), url).toBe(true);
        expect(size(url), url).toBeLessThanOrEqual(limit);
      }
    }
  });

  it('gives every loop a focus point and its sources', () => {
    for (const zone of zones) {
      expect(ZONE_FILMS[zone].focus).toMatch(/^\d{1,3}% \d{1,3}%$/);
      expect(ZONE_FILMS[zone].sources.length).toBeGreaterThan(0);
    }
  });

  it('has the vertical cut of the opening film', () => {
    expect(size('/film/stroyka-film-v.mp4')).toBeLessThanOrEqual(4_000_000);
  });
});
