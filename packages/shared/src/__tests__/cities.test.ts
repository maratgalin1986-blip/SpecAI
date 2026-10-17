import { describe, expect, it } from 'vitest';
import { RUSSIAN_CITIES, cityByName, cityForms, findCityInText } from '../cities';
import { parseEquipmentRequest } from '../messageParser';

const NOW = new Date(2026, 9, 17, 10, 0, 0);
const cityOf = (text: string) => findCityInText(text)?.city.name ?? null;

describe('RUSSIAN_CITIES', () => {
  it('covers the big cities of the whole country, not only Tatarstan', () => {
    expect(RUSSIAN_CITIES.length).toBeGreaterThanOrEqual(170);
    for (const name of ['Москва', 'Владивосток', 'Калининград', 'Якутск', 'Набережные Челны']) {
      expect(cityByName(name)?.name).toBe(name);
    }
    expect(new Set(RUSSIAN_CITIES.map((city) => city.name)).size).toBe(RUSSIAN_CITIES.length);
  });

  it('keeps every centre inside Russia', () => {
    for (const city of RUSSIAN_CITIES) {
      expect(city.lat, city.name).toBeGreaterThan(41);
      expect(city.lat, city.name).toBeLessThan(70);
      expect(city.lon, city.name).toBeGreaterThan(19);
      expect(city.lon, city.name).toBeLessThan(180);
      expect(city.region, city.name).not.toBe('');
    }
  });

  it('finds a name in any case and with «ё»', () => {
    expect(cityByName('  орёл ')?.name).toBe('Орёл');
    expect(cityByName('ОРЕЛ')?.name).toBe('Орёл');
    expect(cityByName('Бавлы')).toBeNull();
  });
});

describe('cityForms', () => {
  it('declines one-word names', () => {
    expect(cityForms('Казань')).toEqual(expect.arrayContaining(['казань', 'казани', 'казанью']));
    expect(cityForms('Самара')).toEqual(expect.arrayContaining(['самаре', 'самары', 'самарой']));
    expect(cityForms('Екатеринбург')).toEqual(
      expect.arrayContaining(['екатеринбурга', 'екатеринбурге', 'екатеринбургу']),
    );
    expect(cityForms('Чебоксары')).toEqual(expect.arrayContaining(['чебоксар', 'чебоксарах']));
    expect(cityForms('Иваново')).toEqual(expect.arrayContaining(['иванове', 'иванова']));
  });

  it('declines names of several words', () => {
    expect(cityForms('Нижний Новгород')).toEqual(
      expect.arrayContaining(['нижнем новгороде', 'нижнего новгорода']),
    );
    expect(cityForms('Набережные Челны')).toEqual(
      expect.arrayContaining(['набережных челнах', 'челнов', 'челнам', 'нч']),
    );
    expect(cityForms('Ростов-на-Дону')).toEqual(
      expect.arrayContaining(['ростове-на-дону', 'ростова-на-дону', 'ростове']),
    );
    expect(cityForms('Петропавловск-Камчатский')).toContain('петропавловске-камчатском');
    expect(cityForms('Сергиев Посад')).toContain('сергиевом посаде');
    expect(cityForms('Санкт-Петербург')).toEqual(
      expect.arrayContaining(['санкт-петербурге', 'питере', 'спб']),
    );
  });

  it('leaves indeclinable names as they are', () => {
    expect(cityForms('Сочи')).toEqual(['сочи']);
    expect(cityForms('Тольятти')).toEqual(['тольятти']);
  });
});

describe('findCityInText', () => {
  it('reads cities of all Russia in their case forms', () => {
    expect(cityOf('нужен кран в Казани')).toBe('Казань');
    expect(cityOf('Требуется экскаватор в Самаре на 2 дня')).toBe('Самара');
    expect(cityOf('трал из Екатеринбурга в Челябинск')).toBe('Екатеринбург');
    expect(cityOf('самосвал по Новосибирску')).toBe('Новосибирск');
    expect(cityOf('кран под Нижним Новгородом')).toBe('Нижний Новгород');
    expect(cityOf('в Ростове-на-Дону, Левобережная')).toBe('Ростов-на-Дону');
    expect(cityOf('объект в Тольятти')).toBe('Тольятти');
    expect(cityOf('Москва, Тверская 3')).toBe('Москва');
    expect(cityOf('в Питере нужен погрузчик')).toBe('Санкт-Петербург');
  });

  it('takes the earliest city of the text', () => {
    expect(cityOf('Елабуга, рядом с Казанью')).toBe('Елабуга');
    expect(cityOf('из Челнов в Елабугу')).toBe('Набережные Челны');
  });

  it('does not take a street named after a city or a person', () => {
    expect(cityOf('Нижнекамское шоссе 10, Набережные Челны')).toBe('Набережные Челны');
    expect(cityOf('ул. Казанская 5, Елабуга')).toBe('Елабуга');
    expect(cityOf('ул. Чистопольская 3')).toBeNull();
    expect(cityOf('Кемерово, ул. Кирова 12')).toBe('Кемерово');
    expect(cityOf('проспект Победы, Пушкина 3')).toBeNull();
    expect(cityOf('ул. Ленина, 5')).toBeNull();
  });

  it('counts a name that is also a word only as a place', () => {
    // In a chat message a name before a comma may be a person.
    expect(cityOf('Артём, нужен кран')).toBeNull();
    expect(cityOf('Киров, нужен кран')).toBeNull();
    expect(cityOf('нужен кран в Кирове')).toBe('Киров');
    expect(cityOf('Нашли находку для стройки, звоните Артёму')).toBeNull();
    expect(cityOf('Работы в Находке, порт')).toBe('Находка');
    expect(cityOf('из шахты вывезти грунт')).toBeNull();
    expect(cityOf('г. Шахты, нужен самосвал')).toBe('Шахты');
    expect(cityOf('Октябрьский район, ул. Гагарина')).toBeNull();
  });

  it('takes such a name as a whole part of an address', () => {
    const address = (text: string) => findCityInText(text, { address: true })?.city.name ?? null;
    expect(address('Киров')).toBe('Киров');
    expect(address('Владимир, ул. Ленина 5')).toBe('Владимир');
    expect(address('ул. Ленина 5, Курган')).toBe('Курган');
    expect(address('Кирова 12')).toBeNull();
    expect(address('Октябрьский район, ул. Гагарина')).toBeNull();
    expect(address('ул. Кирова, 12')).toBeNull();
  });

  it('does not find a city inside another word', () => {
    expect(cityOf('читаю объявление про уфологию')).toBeNull();
    expect(cityOf('мостовой кран')).toBeNull();
  });
});

describe('parseEquipmentRequest city', () => {
  it.each([
    ['Нужен экскаватор-погрузчик завтра в Самаре, траншея', 'Самара'],
    ['Ищу автокран 25 т в Екатеринбурге на 2 дня', 'Екатеринбург'],
    ['Требуется самосвал, Краснодар, песок 20 куб', 'Краснодар'],
    ['Нужен манипулятор по Новосибирску срочно', 'Новосибирск'],
    ['Нужен кран в Челнах', 'Набережные Челны'],
    ['Нужен трактор в Тукаевском районе', 'Тукаевский район'],
  ])('«%s» → %s', (text, city) => {
    expect(parseEquipmentRequest(text, NOW).city).toBe(city);
  });

  it('leaves the city empty when the text names none', () => {
    expect(parseEquipmentRequest('Нужен экскаватор на завтра, ул. Кирова 5', NOW).city).toBe(
      undefined,
    );
  });
});
