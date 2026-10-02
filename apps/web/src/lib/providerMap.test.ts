import { describe, expect, it } from 'vitest';
import { HOUSE_COMPANY_ID } from './fleet';
import {
  BASE_OUTSIDE_MESSAGE,
  BASE_REQUIRED_MESSAGE,
  PIN_NOTE_CONTACTS_MESSAGE,
  PIN_NOTE_EXAMPLES,
  PIN_NOTE_MAX,
  hasCoords,
  isAllowedPinImage,
  isDisplayableImage,
  machineCountLabel,
  parseBaseCoords,
  sanitizePinNote,
  toMapPins,
  type ProviderMapRow,
} from './providerMap';

describe('parseBaseCoords', () => {
  it('accepts a point in Naberezhnye Chelny, also as strings with a comma', () => {
    expect(parseBaseCoords(55.7436, 52.3959)).toEqual({
      ok: true,
      value: { lat: 55.7436, lon: 52.3959 },
    });
    expect(parseBaseCoords('55,7436', ' 52.3959 ')).toEqual({
      ok: true,
      value: { lat: 55.7436, lon: 52.3959 },
    });
  });
  it('rounds to six decimals', () => {
    const result = parseBaseCoords(55.123456789, 52.987654321);
    expect(result).toEqual({ ok: true, value: { lat: 55.123457, lon: 52.987654 } });
  });
  it('requires both coordinates', () => {
    expect(parseBaseCoords(undefined, 52.4)).toEqual({ ok: false, error: BASE_REQUIRED_MESSAGE });
    expect(parseBaseCoords('', '')).toEqual({ ok: false, error: BASE_REQUIRED_MESSAGE });
    expect(parseBaseCoords(Number.NaN, 52.4)).toEqual({ ok: false, error: BASE_REQUIRED_MESSAGE });
    expect(parseBaseCoords('abc', 52.4)).toEqual({ ok: false, error: BASE_REQUIRED_MESSAGE });
  });
  it('refuses points far from Tatarstan and impossible values', () => {
    expect(parseBaseCoords(55.7558, 37.6173)).toEqual({ ok: false, error: BASE_OUTSIDE_MESSAGE }); // Moscow
    expect(parseBaseCoords(0, 0)).toEqual({ ok: false, error: BASE_OUTSIDE_MESSAGE });
    expect(parseBaseCoords(552, 52)).toEqual({ ok: false, error: BASE_OUTSIDE_MESSAGE });
    expect(parseBaseCoords(Infinity, 52)).toEqual({ ok: false, error: BASE_REQUIRED_MESSAGE });
  });
  it('hasCoords tells an empty point from a given one', () => {
    expect(hasCoords(55.7, 52.4)).toBe(true);
    expect(hasCoords(null, 52.4)).toBe(false);
    expect(hasCoords(undefined, undefined)).toBe(false);
  });
});

describe('sanitizePinNote', () => {
  it('keeps a normal note and trims spaces', () => {
    expect(sanitizePinNote('  от 2 500 ₽/ч,   скидка 10%\nна неделю ')).toEqual({
      ok: true,
      value: 'от 2 500 ₽/ч, скидка 10% на неделю',
    });
  });
  it('turns empty input into null', () => {
    expect(sanitizePinNote('')).toEqual({ ok: true, value: null });
    expect(sanitizePinNote('   ')).toEqual({ ok: true, value: null });
    expect(sanitizePinNote(null)).toEqual({ ok: true, value: null });
    expect(sanitizePinNote(undefined)).toEqual({ ok: true, value: null });
  });
  it('strips tags and invisible characters', () => {
    expect(sanitizePinNote('<b>Без выходных</b><script>x</script>​')).toEqual({
      ok: true,
      value: 'Без выходных x',
    });
  });
  it('limits the length', () => {
    expect(sanitizePinNote('а'.repeat(PIN_NOTE_MAX))).toEqual({
      ok: true,
      value: 'а'.repeat(PIN_NOTE_MAX),
    });
    const tooLong = sanitizePinNote('а'.repeat(PIN_NOTE_MAX + 1));
    expect(tooLong.ok).toBe(false);
  });
  it('refuses phones, e-mails and links', () => {
    for (const note of [
      'Звоните +7 927 123-45-67',
      'пишите ivan@mail.ru',
      'Телеграм t.me/ivan_jcb',
      'сайт https://example.com',
      'наш сайт ekskavator16.ru',
    ]) {
      expect(sanitizePinNote(note)).toEqual({ ok: false, error: PIN_NOTE_CONTACTS_MESSAGE });
    }
  });
  it('accepts every example shown to providers', () => {
    for (const example of PIN_NOTE_EXAMPLES) {
      expect(sanitizePinNote(example)).toEqual({ ok: true, value: example });
      expect(example.length).toBeLessThanOrEqual(PIN_NOTE_MAX);
    }
  });
  it('refuses non-text', () => {
    expect(sanitizePinNote(42).ok).toBe(false);
  });
});

describe('isAllowedPinImage', () => {
  const owner = {
    companyId: 'c1',
    ownImageUrls: [
      'https://abc.public.blob.vercel-storage.com/equipment/c1/jcb.jpg',
      '/photos/x.jpg',
    ],
  };
  it('allows photos of own machinery and own uploads', () => {
    expect(isAllowedPinImage(owner.ownImageUrls[0]!, owner)).toBe(true);
    expect(isAllowedPinImage('/photos/x.jpg', owner)).toBe(true);
    expect(
      isAllowedPinImage(
        'https://abc.public.blob.vercel-storage.com/equipment/c1/new-ab12.png',
        owner,
      ),
    ).toBe(true);
  });
  it('refuses other companies’ uploads and foreign sites', () => {
    expect(
      isAllowedPinImage('https://abc.public.blob.vercel-storage.com/equipment/c2/a.png', owner),
    ).toBe(false);
    expect(isAllowedPinImage('https://evil.example/equipment/c1/a.png', owner)).toBe(false);
    expect(isAllowedPinImage('javascript:alert(1)', owner)).toBe(false);
    expect(isAllowedPinImage('', owner)).toBe(false);
  });
  it('isDisplayableImage accepts https and site paths only', () => {
    expect(isDisplayableImage('https://x.ru/a.jpg')).toBe(true);
    expect(isDisplayableImage('/photos/a.jpg')).toBe(true);
    expect(isDisplayableImage('//evil.example/a.jpg')).toBe(false);
    expect(isDisplayableImage('http://x.ru/a.jpg')).toBe(false);
    expect(isDisplayableImage('data:image/png;base64,AAAA')).toBe(false);
    expect(isDisplayableImage(null)).toBe(false);
  });
});

describe('toMapPins', () => {
  const base: ProviderMapRow = {
    id: 'p1',
    name: 'ИП Иванов',
    isProvider: true,
    baseLat: 55.743612345,
    baseLon: 52.395987654,
    pinImageUrl: 'https://abc.public.blob.vercel-storage.com/equipment/p1/jcb.jpg',
    pinNote: 'Без выходных',
    equipmentCount: 3,
  };

  it('returns only the safe fields, without phones, e-mails or addresses', () => {
    const row = {
      ...base,
      phone: '+79270000000',
      email: 'ivan@example.ru',
      baseAddress: 'ул. Ленина, 1, кв. 5',
      taxId: '123456789012',
      users: [{ email: 'ivan@example.ru', phone: '+79270000000' }],
    };
    const [pin] = toMapPins([row]);
    expect(pin).toEqual({
      id: 'p1',
      name: 'ИП Иванов',
      lat: 55.7436,
      lon: 52.396,
      note: 'Без выходных',
      imageUrl: base.pinImageUrl,
      equipmentCount: 3,
      isHouse: false,
      catalogUrl: '/equipment?company=p1',
    });
    const json = JSON.stringify(toMapPins([row]));
    expect(json).not.toContain('79270000000');
    expect(json).not.toContain('@');
    expect(json).not.toContain('Ленина');
    expect(json).not.toContain('123456789012');
  });

  it('skips companies without a base, outside the area or not providers', () => {
    expect(toMapPins([{ ...base, baseLat: null }])).toEqual([]);
    expect(toMapPins([{ ...base, baseLat: 55.75, baseLon: 37.61 }])).toEqual([]);
    expect(toMapPins([{ ...base, isProvider: false }])).toEqual([]);
  });

  it('drops unsafe pictures and notes with contacts that slipped into the database', () => {
    const [pin] = toMapPins([
      { ...base, pinImageUrl: 'javascript:alert(1)', pinNote: 'звоните 8 927 000-00-00' },
    ]);
    expect(pin?.imageUrl).toBeNull();
    expect(pin?.note).toBeNull();
  });

  it('marks the own fleet and puts it first', () => {
    const pins = toMapPins([
      { ...base, id: 'p2', equipmentCount: 10 },
      { ...base, id: HOUSE_COMPANY_ID, name: 'СпецПласт16', equipmentCount: 2 },
    ]);
    expect(pins.map((pin) => pin.id)).toEqual([HOUSE_COMPANY_ID, 'p2']);
    expect(pins[0]?.isHouse).toBe(true);
    expect(pins[1]?.isHouse).toBe(false);
  });
});

describe('machineCountLabel', () => {
  it('declines the word', () => {
    expect(machineCountLabel(1)).toBe('1 единица техники');
    expect(machineCountLabel(3)).toBe('3 единицы техники');
    expect(machineCountLabel(11)).toBe('11 единиц техники');
    expect(machineCountLabel(0)).toBe('0 единиц техники');
  });
});
