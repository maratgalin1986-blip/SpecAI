import { describe, expect, it } from 'vitest';
import { EXACT_ADDRESS_LATER, fromBaseText, isRoughLocation, orderPlace } from './orderPlace';

const base = { lat: 55.7436, lon: 52.3959 };

describe('order place as the viewer may read it', () => {
  it('a provider before the booking: city, whole km from the base and the hint — no point', () => {
    const place = orderPlace(
      {
        description: 'Выкопать траншею',
        location: {
          city: 'Казань',
          addressLine: null,
          latitude: null,
          longitude: null,
          distanceKm: 203,
        },
      },
      base,
    );
    expect(place).toEqual({
      text: 'Казань',
      rough: true,
      km: 203,
      distanceText: '≈ 203 км',
      fromBaseText: '≈ 203 км от вашей базы',
      hint: EXACT_ADDRESS_LATER,
      point: null,
    });
    expect(JSON.stringify(place)).not.toContain('null км');
  });

  it('no base and no city: only the hint, never the word «null»', () => {
    const place = orderPlace(
      {
        description: '',
        location: {
          city: null,
          addressLine: null,
          latitude: null,
          longitude: null,
          distanceKm: null,
        },
      },
      null,
    );
    expect(place.text).toBeNull();
    expect(place.km).toBeNull();
    expect(place.distanceText).toBeNull();
    expect(place.fromBaseText).toBeNull();
    expect(place.hint).toBe(EXACT_ADDRESS_LATER);
    expect(place.point).toBeNull();
    expect([place.text, place.fromBaseText].filter(Boolean).join(' · ')).toBe('');
  });

  it('does not dig the address out of the description while it is hidden', () => {
    const place = orderPlace(
      {
        description: 'Адрес: Казань, Баумана 1\nНужен экскаватор',
        location: {
          city: 'Казань',
          addressLine: null,
          latitude: null,
          longitude: null,
          distanceKm: 0,
        },
      },
      base,
    );
    expect(place.text).toBe('Казань');
    expect(place.fromBaseText).toBe('меньше 1 км от вашей базы');
    expect(place.distanceText).toBe('< 1 км');
  });

  it('the customer and the booked provider read the address and the point', () => {
    const place = orderPlace(
      {
        description: 'Копать',
        location: {
          city: 'Набережные Челны',
          addressLine: 'Набережные Челны, Мира 10',
          latitude: 55.75,
          longitude: 52.41,
        },
      },
      base,
    );
    expect(place.rough).toBe(false);
    expect(place.text).toBe('Набережные Челны, Мира 10');
    expect(place.point).toEqual({ lat: 55.75, lon: 52.41 });
    expect(place.km).toBeGreaterThan(0.5);
    expect(place.km).toBeLessThan(2);
    expect(place.distanceText).toMatch(/км$/);
    expect(place.hint).toBeNull();
    expect(place.fromBaseText).toBeNull();
  });

  it('old orders keep the «Адрес:» line of the description; no location is not a crash', () => {
    expect(
      orderPlace({ description: 'Адрес: Мира 10\nКопать', location: null }, base),
    ).toMatchObject({ text: 'Мира 10', rough: false, km: null, point: null, hint: null });
    expect(orderPlace({ description: 'Копать', location: undefined }, null).text).toBeNull();
    // A full location that was never geocoded is not «hidden».
    expect(
      isRoughLocation({ addressLine: 'Мира 10', city: null, latitude: null, longitude: null }),
    ).toBe(false);
    expect(isRoughLocation({ city: 'Казань', latitude: null, longitude: null })).toBe(false);
  });

  it('words the distance from the base', () => {
    expect(fromBaseText(12.4)).toBe('≈ 12 км от вашей базы');
    expect(fromBaseText(0.3)).toBe('меньше 1 км от вашей базы');
  });
});
