import { describe, expect, it } from 'vitest';
import {
  addressLabel,
  tileAllowed,
  formatCoords,
  shortLabel,
  TILE_SIZE,
  tilePosition,
  tilesAround,
} from './geo';

describe('tilePosition', () => {
  it('matches the Web Mercator tile scheme', () => {
    expect(tilePosition(0, 0, 1)).toEqual({ x: 1, y: 1 });
    const { x, y } = tilePosition(55.74, 52.4, 17);
    // Naberezhnye Chelny at zoom 17 (tile 17/84614/40983, centre of the city).
    expect(Math.floor(x)).toBe(84614);
    expect(Math.floor(y)).toBe(40983);
  });
});

describe('tilesAround', () => {
  it('covers a 5×3 block with the point at the origin', () => {
    const tiles = tilesAround(55.74, 52.4, 17);
    expect(tiles).toHaveLength(15);
    // The point lies inside the centre tile: its left/top are within one tile.
    const centre = tiles[7]!;
    expect(centre.left).toBeLessThanOrEqual(0);
    expect(centre.left).toBeGreaterThan(-TILE_SIZE);
    expect(centre.top).toBeLessThanOrEqual(0);
    expect(centre.top).toBeGreaterThan(-TILE_SIZE);
    expect(centre.src).toMatch(/^\/api\/tiles\/17\/\d+\/\d+$/);
  });
});

describe('labels', () => {
  it('shortens Nominatim display names', () => {
    expect(
      shortLabel(
        'Шалуны, 49А, проспект Мира, Новый город, Набережные Челны, городской округ Набережные Челны, Татарстан, Приволжский федеральный округ, 423812, Россия',
      ),
    ).toBe('Шалуны, 49А, проспект Мира, Новый город');
    expect(formatCoords(55.73989, 52.404497)).toBe('55.7399° с. ш., 52.4045° в. д.');
  });
});

describe('addressLabel', () => {
  it('builds «street, number, city» and ignores shop names', () => {
    expect(addressLabel({ road: 'проспект Мира', house_number: '49А' }, 'Набережные Челны')).toBe(
      'проспект Мира, 49А, Набережные Челны',
    );
    expect(addressLabel({}, 'Набережные Челны')).toBeNull();
  });
});

describe('tileAllowed', () => {
  it('serves street-level tiles in Naberezhnye Chelny', () => {
    const { x, y } = tilePosition(55.7436, 52.3959, 17);
    expect(tileAllowed(17, Math.floor(x), Math.floor(y))).toBe(true);
  });
  it('serves overview zooms of Tatarstan for the providers map', () => {
    for (const zoom of [6, 7, 8, 10]) {
      const { x, y } = tilePosition(55.7436, 52.3959, zoom);
      expect(tileAllowed(zoom, Math.floor(x), Math.floor(y))).toBe(true);
    }
    // Kazan at z9 as well.
    const { x, y } = tilePosition(55.7887, 49.1221, 9);
    expect(tileAllowed(9, Math.floor(x), Math.floor(y))).toBe(true);
  });
  it('refuses world-level zooms and tiles far away', () => {
    expect(tileAllowed(5, 20, 10)).toBe(false);
    const moscow = tilePosition(55.7558, 37.6173, 8);
    expect(tileAllowed(8, Math.floor(moscow.x), Math.floor(moscow.y))).toBe(false);
    const { x, y } = tilePosition(48.8566, 2.3522, 17); // Paris
    expect(tileAllowed(17, Math.floor(x), Math.floor(y))).toBe(false);
  });
});
