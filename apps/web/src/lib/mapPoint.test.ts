import { describe, expect, it } from 'vitest';
import { pointAddress, pointMessageLine, withPointLine, yandexMapsLink } from './mapPoint';

const point = { lat: 55.743123, lon: 52.398111 };

describe('map point helpers', () => {
  it('builds a Yandex Maps link with lon,lat order', () => {
    expect(yandexMapsLink(point)).toBe('https://yandex.ru/maps/?pt=52.398111,55.743123&z=17&l=map');
  });
  it('keeps the address short', () => {
    expect(pointAddress(point).length).toBeLessThan(60);
  });
  it('appends the point once and replaces it when moved', () => {
    const once = withPointLine('Траншея под водопровод', point);
    expect(once.split('\n')).toHaveLength(2);
    const moved = withPointLine(once, { lat: 55.7, lon: 52.3 });
    expect(moved.split('\n')).toHaveLength(2);
    expect(moved).toContain('52.300000,55.700000');
    expect(withPointLine('', point).startsWith('Место работ')).toBe(true);
  });
});

describe('parseCoordinates', () => {
  it('reads a picked point and plain coordinates, ignores addresses', async () => {
    const { parseCoordinates } = await import('./geo');
    expect(parseCoordinates('Точка на карте: 55.7431° с. ш., 52.3981° в. д.')).toEqual({
      lat: 55.7431,
      lon: 52.3981,
    });
    expect(parseCoordinates('55.743123, 52.398111')).toEqual({ lat: 55.743123, lon: 52.398111 });
    expect(parseCoordinates('Набережные Челны, проспект Мира, 49')).toBeNull();
  });

  it('shortens a long message, never the point line', () => {
    const point = { lat: 55.74, lon: 52.4 };
    const text = withPointLine('а'.repeat(1200), point);
    expect(text.length).toBeLessThanOrEqual(1000);
    expect(text.endsWith(pointMessageLine(point))).toBe(true);
  });
});
