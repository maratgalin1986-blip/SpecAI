import { describe, expect, it } from 'vitest';
import { applySiteContent, parseSiteContent, validateSiteContent } from './siteContent';
import { buildSitePage } from './pages';

const base = buildSitePage(
  {
    kind: 'site',
    status: 'PUBLISHED',
    slug: 'ulybka-kazan-ab12',
    name: 'Стоматология «Улыбка»',
    phone: '+78432123456',
    address: 'ул. Баумана, 10, Казань',
    city: 'Казань',
    lat: 55.79,
    lon: 49.11,
    tags: null,
    hours: null,
  },
  {
    key: 'dentist',
    title: 'Стоматология',
    services: ['Лечение кариеса'],
    heroLine: 'Стоматология в городе {city}',
    accent: 'teal',
  },
);

describe('parseSiteContent', () => {
  it('битый JSON, лишние поля и чужие фото — пустая правка', () => {
    expect(parseSiteContent(null)).toEqual({});
    expect(parseSiteContent('{не json')).toEqual({});
    expect(parseSiteContent(JSON.stringify({ title: 'X', evil: 1 }))).toEqual({});
    expect(parseSiteContent(JSON.stringify({ photos: ['https://evil.example/a.jpg'] }))).toEqual(
      {},
    );
    expect(parseSiteContent(JSON.stringify({ title: 'Улыбка' }))).toEqual({ title: 'Улыбка' });
  });
});

describe('validateSiteContent', () => {
  it('приводит телефоны к +7, убирает пустые строки, ошибки — по-русски', () => {
    const ok = validateSiteContent({ title: ' ', phone: '8 (917) 000-11-22', services: [] });
    expect(ok).toEqual({ ok: true, content: { phone: '+79170001122' } });
    const bad = validateSiteContent({ phone: '123' });
    expect(bad).toMatchObject({ ok: false });
    expect(!bad.ok && bad.error).toContain('Телефон');
    const long = validateSiteContent({ about: 'а'.repeat(2000) });
    expect(!long.ok && long.error).toContain('О компании');
    const photo = validateSiteContent({
      photos: ['/api/files/office/a.jpg', 'https://x.public.blob.vercel-storage.com/b.png'],
    });
    expect(photo.ok).toBe(true);
  });
});

describe('applySiteContent', () => {
  it('правки поверх карточки; телефон пересчитывает «Позвонить», не WhatsApp; адрес — карту', () => {
    const page = applySiteContent(base, {
      title: 'Улыбка',
      about: 'Работаем с 2010 года.',
      services: ['Чистка', 'Имплантация'],
      phone: '+79170001122',
      address: 'ул. Пушкина, 1, Казань',
      photos: ['/api/files/office/a.jpg'],
      leadForm: false,
    });
    expect(page).toMatchObject({
      title: 'Улыбка',
      about: 'Работаем с 2010 года.',
      services: ['Чистка', 'Имплантация'],
      phone: '+7 917 000-11-22',
      phoneHref: 'tel:+79170001122',
      whatsappHref: null,
      photos: ['/api/files/office/a.jpg'],
      leadForm: false,
    });
    expect(page.mapHref).toContain(encodeURIComponent('ул. Пушкина, 1, Казань'));
    expect(applySiteContent(base, {})).toEqual(base);
    expect(base).toMatchObject({
      about: null,
      photos: [],
      leadForm: false,
      hideCredit: false,
      whatsappHref: null,
    });
  });

  it('WhatsApp — только из правки или карточки (8.2)', () => {
    expect(applySiteContent(base, { whatsapp: '+79170001122' }).whatsappHref).toBe(
      'https://wa.me/79170001122',
    );
    const withCard = buildSitePage(
      {
        kind: 'site',
        status: 'PUBLISHED',
        slug: 'ulybka-kazan-ab12',
        name: 'Улыбка',
        phone: '+78432123456',
        address: null,
        city: null,
        lat: null,
        lon: null,
        tags: null,
        hours: null,
        whatsapp: '8 917 000-33-44',
      },
      { key: 'dentist', title: 'Стоматология', services: [], heroLine: 'X', accent: 'teal' },
    );
    expect(withCard.whatsappHref).toBe('https://wa.me/79170003344');
    expect(applySiteContent(withCard, { phone: '+79170001122' }).whatsappHref).toBe(
      'https://wa.me/79170003344',
    );
  });

  it('форма заявки включается только правкой; «Хотите такой же сайт?» убирается галочкой', () => {
    expect(applySiteContent(base, { leadForm: true }).leadForm).toBe(true);
    expect(applySiteContent(base, { hideCredit: true }).hideCredit).toBe(true);
    expect(parseSiteContent(JSON.stringify({ hideCredit: true, leadForm: true }))).toEqual({
      hideCredit: true,
      leadForm: true,
    });
    expect(validateSiteContent({ hideCredit: 'да' })).toMatchObject({ ok: false });
  });
});
