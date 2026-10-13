import { describe, expect, it } from 'vitest';
import { cityInText, orderPoint } from './geo';

describe('cityInText', () => {
  it('finds a known city in an address or a sentence, in any form', () => {
    expect(cityInText('Елабуга, ул. Окружное шоссе 1')?.name).toBe('Елабуга');
    expect(cityInText('нужен кран в Набережных Челнах')?.name).toBe('Набережные Челны');
    expect(cityInText('из Казани')?.name).toBe('Казань');
    expect(cityInText('Альметьевске, промзона')?.name).toBe('Альметьевск');
  });

  it('takes the city named first and ignores unknown places', () => {
    expect(cityInText('Елабуга, рядом с Казанью')?.name).toBe('Елабуга');
    expect(cityInText('ул. Ленина, 5')).toBeNull();
    expect(cityInText(null)).toBeNull();
  });
});

describe('orderPoint', () => {
  it('prefers the geocoded point', () => {
    expect(
      orderPoint({ latitude: 55.1, longitude: 52.2, city: 'Елабуга' }, 'Набережные Челны'),
    ).toEqual({ lat: 55.1, lon: 52.2 });
  });

  it("uses a known city's centre for a chat order that stores only the city", () => {
    expect(orderPoint({ city: 'Елабуга', addressLine: 'Елабуга' }, 'Набережные Челны')).toEqual({
      lat: 55.7565,
      lon: 52.0634,
    });
  });

  it('puts an order without a location in the home city, an unknown place nowhere', () => {
    expect(orderPoint(null, 'Набережные Челны')).toEqual({ lat: 55.7436, lon: 52.3959 });
    expect(orderPoint({ city: 'Бавлы', addressLine: 'Бавлы' }, 'Набережные Челны')).toBeNull();
  });
});
