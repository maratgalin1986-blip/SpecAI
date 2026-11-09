import { describe, expect, it } from 'vitest';
import type { MachineName, PageNiche, PageProspect } from './pageTypes';
import {
  buildProviderPage,
  buildSitePage,
  heroWithCity,
  mapHref,
  phoneDigits,
  contactWaysText,
  sitePolicyHref,
  previewBannerText,
  previewSourceCredit,
  whatsappHrefFor,
  phoneText,
} from './pages';

const PHONE = '+7 (927) 123-45-67';
const DIGITS = '79271234567';

const niche: PageNiche = {
  key: 'dentist',
  title: 'Стоматология',
  services: ['Лечение кариеса', 'Чистка зубов', 'Протезирование'],
  heroLine: 'Лечение зубов без боли в городе {city}',
  accent: 'teal',
};

const prospect: PageProspect = {
  kind: 'site',
  status: 'NEW',
  slug: 'ulybka-kazan',
  name: 'Стоматология «Улыбка»',
  phone: PHONE,
  address: 'Казань, ул. Баумана, 1',
  city: 'Казань',
  lat: 55.7887,
  lon: 49.1221,
  tags: null,
  hours: 'Пн–Пт 9:00–18:00',
};

const machines: MachineName[] = [
  { slug: 'ekskavator', name: 'Экскаватор' },
  { slug: 'avtokran', name: 'Автокран' },
];

describe('phoneDigits', () => {
  it('normalises Russian numbers to 7XXXXXXXXXX', () => {
    expect(phoneDigits(PHONE)).toBe(DIGITS);
    expect(phoneDigits('8 927 123-45-67')).toBe(DIGITS);
    expect(phoneDigits('9271234567')).toBe(DIGITS);
  });
});

describe('buildSitePage', () => {
  const page = buildSitePage(prospect, niche);

  it('takes the card and the niche as they are, nothing invented', () => {
    expect(page.title).toBe('Стоматология «Улыбка»');
    expect(page.eyebrow).toBe('Стоматология');
    expect(page.services).toEqual(niche.services);
    expect(page.address).toBe('Казань, ул. Баумана, 1');
    expect(page.hours).toBe('Пн–Пт 9:00–18:00');
    expect(page.accent).toBe('teal');
    expect(page.city).toBe('Казань');
    expect(Object.keys(page)).not.toContain('reviews');
    expect(Object.keys(page)).not.toContain('rating');
    expect(Object.keys(page)).not.toContain('price');
  });

  it('puts the city into the hero line in the nominative', () => {
    expect(page.hero).toBe('Лечение зубов без боли в городе Казань');
    expect(heroWithCity('Лечение зубов без боли в городе {city}', null)).toBe(
      'Лечение зубов без боли',
    );
    expect(heroWithCity('Шиномонтаж', 'Уфа')).toBe('Шиномонтаж · Уфа');
    expect(heroWithCity('Шиномонтаж', null)).toBe('Шиномонтаж');
  });

  it('links phone and the map; no WhatsApp unless the card names it (8.2)', () => {
    expect(page.phone).toBe('+7 927 123-45-67');
    expect(page.phoneHref).toBe(`tel:+${DIGITS}`);
    expect(page.whatsappHref).toBeNull();
    expect(page.mapHref).toBe('https://yandex.ru/maps/?pt=49.1221,55.7887&z=16&l=map');
  });

  it('WhatsApp from the card, digits only', () => {
    const withWa = buildSitePage({ ...prospect, whatsapp: PHONE }, niche);
    expect(withWa.whatsappHref).toBe(`https://wa.me/${DIGITS}`);
    expect(withWa.whatsappHref).toMatch(/^https:\/\/wa\.me\/\d+$/);
    expect(buildSitePage({ ...prospect, whatsapp: null }, niche).whatsappHref).toBeNull();
    expect(whatsappHrefFor('12')).toBeNull();
    expect(whatsappHrefFor('  ')).toBeNull();
  });

  it('the lead form is off and the footer credit is on by default (К10)', () => {
    expect(page.leadForm).toBe(false);
    expect(page.hideCredit).toBe(false);
  });
});

describe('mapHref', () => {
  it('prefers coordinates, falls back to the address, else null', () => {
    expect(mapHref({ lat: 55.1, lon: 49.2, address: 'x' })).toBe(
      'https://yandex.ru/maps/?pt=49.2,55.1&z=16&l=map',
    );
    expect(mapHref({ lat: null, lon: null, address: 'Казань, ул. Баумана, 1' })).toBe(
      `https://yandex.ru/maps/?text=${encodeURIComponent('Казань, ул. Баумана, 1')}`,
    );
    expect(mapHref({ lat: null, lon: null, address: null })).toBeNull();
    expect(mapHref({ lat: null, lon: null, address: '  ' })).toBeNull();
  });
});

describe('buildProviderPage', () => {
  const provider: PageProspect = {
    ...prospect,
    kind: 'provider',
    slug: 'tehno-chelny',
    name: 'ООО «ТехноЧелны»',
    city: 'Набережные Челны',
    tags: 'ekskavator',
  };

  it('shows no phone anywhere before publication (R13)', () => {
    const page = buildProviderPage(provider, machines, { published: false });
    expect(page.phone).toBeNull();
    expect(page.phoneHref).toBeNull();
    const json = JSON.stringify(page);
    expect(json).not.toContain(DIGITS);
    expect(json).not.toContain('1234567');
    expect(json).not.toContain('123-45-67');
    expect(json).not.toContain('tel:');
  });

  it('shows the phone once published and prefills it in the sign-up link', () => {
    const page = buildProviderPage(provider, machines, { published: true });
    expect(page.phone).toBe('+7 927 123-45-67');
    expect(page.phoneHref).toBe(`tel:+${DIGITS}`);
    const join = new URL(page.joinHref, 'https://example.test');
    expect(join.pathname).toBe('/register');
    expect(join.searchParams.get('role')).toBe('provider');
    expect(join.searchParams.get('prospect')).toBe('tehno-chelny');
    expect(join.searchParams.get('name')).toBe('ООО «ТехноЧелны»');
    expect(join.searchParams.get('city')).toBe('Набережные Челны');
    expect(join.searchParams.get('phone')).toBe(`+${DIGITS}`);
    // Encoded, not raw: no spaces, brackets or Cyrillic in the link itself.
    expect(page.joinHref).toContain('phone=%2B79271234567');
    expect(page.joinHref).not.toMatch(/[\s()«»]|[А-Яа-я]/);
  });

  it('adds the category to the order link only with exactly one machine type', () => {
    const one = buildProviderPage(provider, machines, { published: false });
    expect(one.machines).toEqual(['Экскаватор']);
    expect(one.orderHref).toBe(
      `/orders?city=${encodeURIComponent('Набережные Челны').replace(/%20/g, '+')}&category=ekskavator`,
    );
    const two = buildProviderPage({ ...provider, tags: 'ekskavator, avtokran' }, machines, {
      published: false,
    });
    expect(two.machines).toEqual(['Экскаватор', 'Автокран']);
    expect(two.orderHref).not.toContain('category=');
    expect(two.orderHref).toContain('city=');
  });

  it('falls back to «Спецтехника» for unknown or empty tags', () => {
    expect(
      buildProviderPage({ ...provider, tags: null }, machines, { published: false }).machines,
    ).toEqual(['Спецтехника']);
    expect(
      buildProviderPage({ ...provider, tags: 'unknown-slug' }, machines, { published: false })
        .machines,
    ).toEqual(['Спецтехника']);
    const noCity = buildProviderPage({ ...provider, city: null, tags: null }, machines, {
      published: false,
    });
    expect(noCity.orderHref).toBe('/orders');
  });
});

describe('previewBannerText (К6)', () => {
  it('a draft by the platform from open card data, not the official site', () => {
    expect(previewBannerText()).toBe(
      'Черновик: подготовлен ИИСтройка24 по открытым данным карточки на карте. ' +
        'Это не официальный сайт компании',
    );
  });

  it('credits OpenStreetMap only for OSM cards', () => {
    expect(previewSourceCredit({ source: 'osm' })).toBe(
      'Данные карточки: © участники OpenStreetMap',
    );
    expect(previewSourceCredit({ source: 'manual' })).toBeNull();
    expect(previewSourceCredit({ source: '2gis' })).toBeNull();
    expect(previewSourceCredit({})).toBeNull();
  });
});

describe('phoneText', () => {
  it('пишет номер как люди: +7 843 212-34-56; иностранный — как записан', () => {
    expect(phoneText('+78432123456')).toBe('+7 843 212-34-56');
    expect(phoneText('89170001122')).toBe('+7 917 000-11-22');
    expect(phoneText('12345')).toBe('12345');
    expect(phoneText('+1 234 567 8901')).toBe('+1 234 567 8901');
  });
});

describe('contactWaysText and sitePolicyHref', () => {
  it('names only the ways the site has', () => {
    expect(contactWaysText({ whatsappHref: null, leadForm: false })).toBe(
      'Уточнить детали и записаться можно по телефону.',
    );
    expect(contactWaysText({ whatsappHref: 'https://wa.me/7', leadForm: false })).toBe(
      'Уточнить детали и записаться можно по телефону или в WhatsApp.',
    );
    expect(contactWaysText({ whatsappHref: null, leadForm: true })).toBe(
      'Уточнить детали и записаться можно по телефону или через заявку ниже.',
    );
    expect(contactWaysText({ whatsappHref: 'https://wa.me/7', leadForm: true })).toBe(
      'Уточнить детали и записаться можно по телефону, в WhatsApp или через заявку ниже.',
    );
  });

  it('the policy lives at /s/<slug>/politika on the platform', () => {
    expect(sitePolicyHref('https://example.ru/', 'ulybka-kazan')).toBe(
      'https://example.ru/s/ulybka-kazan/politika',
    );
  });
});
