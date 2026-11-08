import { describe, expect, it } from 'vitest';
import { RUSSIAN_CITIES, cityByName } from '@specai/shared';
import { INTAKE_MAX, INTAKE_TITLE, clearOf, intakeHref, intakePoints } from './intakePoints';

const kazan = cityByName('Казань')!;
const moscow = cityByName('Москва')!;

describe('intakePoints', () => {
  it('labels the platform only: no company, price, person or «на линии»', () => {
    const points = intakePoints([]);
    expect(points.length).toBe(INTAKE_MAX);
    for (const point of points) {
      expect(Object.keys(point).sort()).toEqual(
        ['city', 'href', 'id', 'lat', 'lon', 'text', 'title'].sort(),
      );
      expect(point.title).toBe(INTAKE_TITLE);
      expect(point.title).toBe('ИИСтройка24 · приём заявок');
      const all = `${point.title} ${point.text}`;
      expect(all).not.toMatch(/₽|руб|на линии|СпецПласт16|машинист|\+7|\d{3}/i);
      expect(point.text).toBe(`${point.city}: оставьте заявку — найдём технику`);
      expect(point.href).toBe(intakeHref(point.city));
      expect(point.id).toBe(`intake-${point.city}`);
    }
  });

  it('starts with the biggest cities', () => {
    expect(
      intakePoints([])
        .slice(0, 2)
        .map((p) => p.city),
    ).toEqual([RUSSIAN_CITIES[0]!.name, RUSSIAN_CITIES[1]!.name]);
  });

  it('skips a city with a real provider within 30 km, keeps one farther away', () => {
    const near = { lat: kazan.lat + 0.1, lon: kazan.lon }; // ~11 km
    const far = { lat: kazan.lat + 0.5, lon: kazan.lon }; // ~55 km
    expect(intakePoints([near]).map((p) => p.city)).not.toContain('Казань');
    expect(intakePoints([far]).map((p) => p.city)).toContain('Казань');
  });

  it('opens the order form with the city in the address', () => {
    expect(intakeHref('Нижний Новгород')).toBe(
      '/orders?address=%D0%9D%D0%B8%D0%B6%D0%BD%D0%B8%D0%B9%20%D0%9D%D0%BE%D0%B2%D0%B3%D0%BE%D1%80%D0%BE%D0%B4#new',
    );
  });

  it('drops points a machine on the line came near later', () => {
    const points = intakePoints([]);
    const left = clearOf(points, [{ lat: moscow.lat, lon: moscow.lon + 0.2 }]);
    expect(left.map((p) => p.city)).not.toContain('Москва');
    expect(left.length).toBe(points.length - 1);
  });
});
