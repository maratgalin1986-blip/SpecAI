import { describe, expect, it } from 'vitest';
import { HOUSE_COMPANY_ID } from './fleet';
import {
  BASE_OUTSIDE_MESSAGE,
  BASE_REQUIRED_MESSAGE,
  PIN_NOTE_CONTACTS_MESSAGE,
  PIN_NOTE_EXAMPLES,
  PIN_NOTE_MAX,
  baseAfterAddressEdit,
  hasCoords,
  isAllowedPinImage,
  isDisplayableImage,
  machineCountLabel,
  nearestPins,
  parseBaseCoords,
  parseBbox,
  pinPhotoChoices,
  providerMapPhone,
  providerPagePhone,
  sanitizePinNote,
  siteMachinePhotos,
  spreadOverlapping,
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
  it('takes a base anywhere in Russia, refuses points abroad and impossible values', () => {
    expect(parseBaseCoords(55.7558, 37.6173)).toEqual({
      ok: true,
      value: { lat: 55.7558, lon: 37.6173 },
    }); // Moscow
    expect(parseBaseCoords(43.1155, 131.8855).ok).toBe(true); // Vladivostok
    expect(parseBaseCoords(48.8566, 2.3522)).toEqual({ ok: false, error: BASE_OUTSIDE_MESSAGE }); // Paris
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
  it('lets only the own fleet use the site machine photos', () => {
    const photo = siteMachinePhotos()[0]!;
    expect(photo).toMatch(/^\/images\//);
    expect(isAllowedPinImage(photo, { companyId: HOUSE_COMPANY_ID, ownImageUrls: [] })).toBe(true);
    expect(isAllowedPinImage(photo, owner)).toBe(false);
    expect(pinPhotoChoices(HOUSE_COMPANY_ID, ['javascript:x', 'https://a.ru/1.jpg'])).toEqual([
      'https://a.ru/1.jpg',
      ...siteMachinePhotos(),
    ]);
    expect(pinPhotoChoices('c1', ['https://a.ru/1.jpg', 'https://a.ru/1.jpg'])).toEqual([
      'https://a.ru/1.jpg',
    ]);
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

  it('returns only the safe fields: the contact phone by the owner’s rule, never e-mails, addresses or people', () => {
    const row = {
      ...base,
      phone: '+79270000000',
      email: 'ivan@example.ru',
      baseAddress: 'Набережные Челны, ул. Ленина, 1, кв. 5',
      taxId: '123456789012',
      createdAt: new Date('2026-01-02T03:04:05Z'),
      users: [{ email: 'ivan@example.ru', phone: '+79270000001', name: 'Иван Иванов' }],
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
      catalogUrl: '/providers/p1',
      machines: [],
      machinesMore: 0,
      city: 'Набережные Челны',
      priceText: null,
      phone: '+7 927 000-00-00',
      phoneHref: 'tel:+79270000000',
      onLine: false,
      orderUrl: '/orders?provider=p1',
    });
    const json = JSON.stringify(toMapPins([row]));
    expect(json).not.toContain('79270000001'); // a person's phone, not the company's
    expect(json).not.toContain('@');
    expect(json).not.toContain('Ленина');
    expect(json).not.toContain('123456789012');
    expect(json).not.toContain('2026-01-02'); // no registration date or time
    expect(json).not.toContain('Иван Иванов');
  });

  // «Все всех всегда должны видеть на карте в режиме офлайн и навсегда, пока
  // не поменяют сами вручную» (owner, 2026-11-08).
  describe('visibility rule', () => {
    it('shows a provider that is not on the line, dimmed, not hidden', () => {
      const [pin] = toMapPins([{ ...base, onLine: false }]);
      expect(pin).toBeDefined();
      expect(pin?.onLine).toBe(false);
      expect(toMapPins([{ ...base, onLine: true }])[0]?.onLine).toBe(true);
    });

    it('older rows without the switches (null) are on the map with the phone', () => {
      const [pin] = toMapPins([
        { ...base, showOnMap: null, showPhoneOnMap: null, phone: '8 (927) 000-00-00' },
      ]);
      expect(pin?.phone).toBe('+7 927 000-00-00');
      expect(pin?.phoneHref).toBe('tel:+79270000000');
    });

    it('hides a provider only by its own switch', () => {
      expect(toMapPins([{ ...base, showOnMap: false }])).toEqual([]);
      expect(toMapPins([{ ...base, showOnMap: true }])).toHaveLength(1);
    });

    it('hides the phone by its own switch and offers «Написать» instead', () => {
      const [pin] = toMapPins([{ ...base, phone: '+79270000000', showPhoneOnMap: false }]);
      expect(pin?.phone).toBeNull();
      expect(pin?.phoneHref).toBeNull();
      expect(pin?.orderUrl).toBe('/orders?provider=p1');
      expect(JSON.stringify(pin)).not.toContain('79270000000');
    });

    it('a text that is not a phone is not a phone', () => {
      expect(
        providerMapPhone({ id: 'p1', phone: 'Telegram @ivan', showPhoneOnMap: true }),
      ).toBeNull();
      expect(providerMapPhone({ id: 'p1', phone: null, showPhoneOnMap: null })).toBeNull();
    });

    it('the provider page shows the phone by the same switch as the map', () => {
      const row = { id: 'p1', phone: '8 (927) 000-00-00', showPhoneOnMap: null, showOnMap: null };
      expect(providerPagePhone(row)).toEqual({
        phone: providerMapPhone(row)!.phone,
        phoneHref: 'tel:+79270000000',
      });
      expect(providerPagePhone({ ...row, showPhoneOnMap: true })?.phoneHref).toBe(
        'tel:+79270000000',
      );
      // «Показывать телефон на карте» off, or the company left the map: no phone on the page.
      expect(providerPagePhone({ ...row, showPhoneOnMap: false })).toBeNull();
      expect(providerPagePhone({ ...row, showOnMap: false })).toBeNull();
      expect(providerPagePhone({ ...row, phone: 'пишите в Telegram' })).toBeNull();
    });

    it('the house fleet shows the site phone', () => {
      const [pin] = toMapPins([{ ...base, id: HOUSE_COMPANY_ID, phone: null }]);
      expect(pin?.isHouse).toBe(true);
      expect(pin?.phoneHref).toBe('tel:+79272428088');
    });

    it('a provider without a base stands at its machine’s own point', () => {
      const [pin] = toMapPins([
        {
          ...base,
          baseLat: null,
          baseLon: null,
          machines: [
            {
              name: 'JCB 3CX',
              category: 'Экскаваторы-погрузчики',
              dailyRate: 24000,
              location: { latitude: 55.79, longitude: 49.12 },
            },
          ],
        },
      ]);
      expect(pin).toMatchObject({ lat: 55.79, lon: 49.12, city: 'Казань' });
    });

    it('lists machinery types, «ещё N» and the cheapest shift', () => {
      const [pin] = toMapPins([
        {
          ...base,
          machines: [
            { name: 'JCB 3CX', category: 'Экскаваторы-погрузчики', dailyRate: 24000 },
            { name: 'JCB 4CX', category: 'Экскаваторы-погрузчики', dailyRate: 0 },
            { name: 'КамАЗ', category: 'Самосвалы', dailyRate: 18000 },
            { name: 'Hitachi', category: 'Гусеничные экскаваторы', dailyRate: 32000 },
            { name: 'Ивановец', category: 'Автокраны', dailyRate: 28000 },
            { name: 'Без категории', category: null, dailyRate: 0 },
          ],
        },
      ]);
      expect(pin?.machines).toEqual([
        'Экскаваторы-погрузчики',
        'Самосвалы',
        'Гусеничные экскаваторы',
      ]);
      expect(pin?.machinesMore).toBe(2);
      expect(pin?.priceText).toBe('от 18\u00a0000\u00a0₽/смена');
    });
  });

  describe('viewport', () => {
    it('parses a box and refuses a broken one', () => {
      expect(parseBbox('55,52,56,53')).toEqual({ south: 55, west: 52, north: 56, east: 53 });
      expect(parseBbox('56,52,55,53')).toBeNull();
      expect(parseBbox('a,b,c,d')).toBeNull();
      expect(parseBbox('1,2,3')).toBeNull();
      expect(parseBbox(null)).toBeNull();
    });

    it('keeps the nearest pins to a point, the house fleet first', () => {
      const pins = [
        { id: 'far', lat: 59.9, lon: 30.3 },
        { id: 'house', lat: 55.74, lon: 52.4, isHouse: true },
        { id: 'near', lat: 55.8, lon: 49.1 },
        { id: 'mid', lat: 56.3, lon: 44.0 },
      ];
      const around = { lat: 55.79, lon: 49.12 }; // Kazan
      expect(nearestPins(pins, around, 2).map((pin) => pin.id)).toEqual(['house', 'near']);
      expect(nearestPins(pins, around, 3).map((pin) => pin.id)).toEqual(['house', 'near', 'mid']);
      expect(nearestPins(pins, null, 2).map((pin) => pin.id)).toEqual(['far', 'house']);
    });
  });

  it('skips companies without a base, outside the area or not providers', () => {
    expect(toMapPins([{ ...base, baseLat: null }])).toEqual([]);
    expect(toMapPins([{ ...base, baseLat: 48.85, baseLon: 2.35 }])).toEqual([]); // Paris
    // Moscow is in the area now: the whole of Russia.
    expect(toMapPins([{ ...base, baseLat: 55.75, baseLon: 37.61 }])).toHaveLength(1);
    expect(toMapPins([{ ...base, isProvider: false }])).toEqual([]);
  });

  it('drops unsafe pictures and notes with contacts that slipped into the database', () => {
    const [pin] = toMapPins([
      { ...base, pinImageUrl: 'javascript:alert(1)', pinNote: 'звоните 8 927 000-00-00' },
    ]);
    expect(pin?.imageUrl).toBeNull();
    expect(pin?.note).toBeNull();
  });

  it('skips providers without published machinery', () => {
    expect(toMapPins([{ ...base, equipmentCount: 0 }])).toEqual([]);
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

describe('baseAfterAddressEdit', () => {
  const found = { address: 'Челны, Мира 49', lat: 55.7, lon: 52.4 };
  it('drops a point found for another address', () => {
    expect(baseAfterAddressEdit(found, 'Челны, Мира 51', 'Челны, Мира 49')).toEqual({
      address: 'Челны, Мира 51',
      lat: null,
      lon: null,
    });
    expect(baseAfterAddressEdit(found, 'Челны, Мира 49 ', 'Челны, Мира 49')).toEqual({
      ...found,
      address: 'Челны, Мира 49 ',
    });
  });
  it('keeps a point placed by hand', () => {
    expect(baseAfterAddressEdit(found, 'База у трассы', null)).toEqual({
      ...found,
      address: 'База у трассы',
    });
  });
});

describe('spreadOverlapping', () => {
  it('leaves distant markers alone and spreads the ones on top of each other', () => {
    const shifts = spreadOverlapping([
      { id: 'a', x: 100, y: 100 },
      { id: 'b', x: 102, y: 101 },
      { id: 'c', x: 400, y: 400 },
    ]);
    expect(shifts.get('c')).toEqual({ dx: 0, dy: 0 });
    const a = shifts.get('a')!;
    const b = shifts.get('b')!;
    const distance = Math.hypot(100 + a.dx - (102 + b.dx), 100 + a.dy - (101 + b.dy));
    expect(distance).toBeGreaterThanOrEqual(44);
  });
});
