import { describe, expect, it } from 'vitest';
import { addressCity, cityInText, orderPoint } from './geo';

describe('cityInText', () => {
  it('finds a known city in an address or a sentence, in any form', () => {
    expect(cityInText('Елабуга, ул. Окружное шоссе 1')?.name).toBe('Елабуга');
    expect(cityInText('нужен кран в Набережных Челнах')?.name).toBe('Набережные Челны');
    expect(cityInText('из Казани')?.name).toBe('Казань');
    expect(cityInText('Альметьевске, промзона')?.name).toBe('Альметьевск');
  });

  it('knows the cities of the whole country', () => {
    expect(cityInText('Екатеринбург, ул. Малышева 5')?.name).toBe('Екатеринбург');
    expect(cityInText('объект под Новосибирском')?.name).toBe('Новосибирск');
    expect(cityInText('в Ростове-на-Дону')?.name).toBe('Ростов-на-Дону');
  });

  it('takes the city named first and ignores unknown places', () => {
    expect(cityInText('Елабуга, рядом с Казанью')?.name).toBe('Елабуга');
    expect(cityInText('ул. Ленина, 5')).toBeNull();
    expect(cityInText(null)).toBeNull();
  });
});

describe('orderPoint', () => {
  it('prefers the geocoded point', () => {
    expect(orderPoint({ latitude: 55.1, longitude: 52.2, city: 'Елабуга' })).toEqual({
      lat: 55.1,
      lon: 52.2,
    });
  });

  it("uses a known city's centre for a chat order that stores only the city", () => {
    expect(orderPoint({ city: 'Елабуга', addressLine: 'Елабуга' })).toEqual({
      lat: 55.7565,
      lon: 52.0634,
    });
    expect(orderPoint({ city: '', addressLine: 'Самара, ул. Ленина 5' })).toEqual({
      lat: 53.1959,
      lon: 50.1002,
    });
  });

  it('puts an order without a location or with an unknown place nowhere', () => {
    // Not in Набережные Челны: the place is unknown.
    expect(orderPoint(null)).toBeNull();
    expect(orderPoint(undefined)).toBeNull();
    expect(orderPoint({ city: 'Бавлы', addressLine: 'Бавлы' })).toBeNull();
    expect(orderPoint({ city: '', addressLine: 'ул. Мира 10' })).toBeNull();
  });
});

describe('addressCity', () => {
  it('keeps the geocoder city, else a city the address names, else nothing', () => {
    expect(addressCity('Мира 10', { city: 'Пермь' })).toBe('Пермь');
    expect(addressCity('Елабуга, Окружное шоссе 1', null)).toBe('Елабуга');
    expect(addressCity('в Тольятти, Южное шоссе', { city: '  ' })).toBe('Тольятти');
    // Never a default town.
    expect(addressCity('ул. Мира 10', null)).toBe('');
  });
});

describe('cityInText and street names', () => {
  it('does not take a street named after a city for the city', () => {
    expect(cityInText('Нижнекамское шоссе 10, Набережные Челны')?.name).toBe('Набережные Челны');
    expect(cityInText('ул. Казанская 5, Елабуга')?.name).toBe('Елабуга');
    expect(cityInText('ул. Чистопольская 3')).toBeNull();
    expect(cityInText('в Нижнекамске, промзона')?.name).toBe('Нижнекамск');
    expect(cityInText('Казань, ул. Баумана 1')?.name).toBe('Казань');
    expect(cityInText('Самара, ул. Кирова 10')?.name).toBe('Самара');
  });
});
