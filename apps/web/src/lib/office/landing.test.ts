import { describe, expect, it } from 'vitest';
import { rub, SITE_DOMAIN_SETUP_EXTRA, sitePackages } from '@/lib/prices';
import { SITE } from '@/lib/site';
import {
  DEMO_ABOUT,
  DEMO_CITY,
  LANDING_INCLUDES,
  LANDING_PATH,
  LANDING_STEPS,
  demoCompanyName,
  demoProspect,
  demoSitePage,
  landingExamples,
  landingFaq,
  packagePriceLine,
  primerPath,
  serviceJsonLd,
} from './landing';
import { nichesOf } from './niches';

const BASE = { setup: 15000, monthly: 1500 };
/** Обещания, запрещённые ФЗ «О рекламе» рядом с ценой (REVIEW § 5). */
const FORBIDDEN = /лучш|самы[ей] низк|гарантир|отзыв|рейтинг/i;

describe('LANDING_STEPS и LANDING_INCLUDES', () => {
  it('три шага с заголовком и текстом, без запрещённых обещаний', () => {
    expect(LANDING_STEPS).toHaveLength(3);
    for (const step of LANDING_STEPS) {
      expect(step.title.trim()).not.toBe('');
      expect(step.text.trim()).not.toBe('');
      expect(`${step.title} ${step.text}`).not.toMatch(FORBIDDEN);
    }
  });

  it('суть: смотрите бесплатно, решаете потом', () => {
    const text = LANDING_STEPS.map((s) => `${s.title} ${s.text}`).join(' ');
    expect(text).toMatch(/бесплатно/);
    expect(text).toMatch(/Решаете потом/);
    expect(text).toMatch(/карт/);
  });

  it('что входит: форма заявки на почту и до 6 фото', () => {
    expect(LANDING_INCLUDES.length).toBeGreaterThanOrEqual(5);
    expect(LANDING_INCLUDES.join(' ')).toMatch(/на почту/);
    expect(LANDING_INCLUDES.join(' ')).toMatch(/до 6 фото/);
    for (const line of LANDING_INCLUDES) expect(line).not.toMatch(FORBIDDEN);
  });
});

describe('landingFaq', () => {
  const faq = landingFaq(BASE);

  it('6–8 вопросов на нужные темы', () => {
    expect(faq.length).toBeGreaterThanOrEqual(6);
    expect(faq.length).toBeLessThanOrEqual(8);
    const questions = faq.map((f) => f.q).join(' | ');
    for (const topic of [
      /Сколько стоит/,
      /нужно от меня/,
      /свой домен/,
      /заявки/,
      /поменять тексты/,
      /не понравится/,
      /договор и оплата/,
    ]) {
      expect(questions).toMatch(topic);
    }
  });

  it('цены — из пакетов от базы настроек, обе цифры каждого пакета', () => {
    const price = faq[0]!.a;
    expect(price).toContain(`${rub(BASE.setup)}\u00a0₽`);
    expect(price).toContain(`${rub(BASE.setup + SITE_DOMAIN_SETUP_EXTRA)}\u00a0₽`);
    expect(price).toContain(`${rub(BASE.monthly)}\u00a0₽ в месяц`);
    const other = landingFaq({ setup: 20000, monthly: 2000 })[0]!.a;
    expect(other).toContain(`${rub(20000)}\u00a0₽`);
    expect(other).toContain(`${rub(2000)}\u00a0₽ в месяц`);
    expect(other).not.toContain(`${rub(BASE.setup)}\u00a0₽ разово`);
  });

  it('договор — с юрлицом площадки, без онлайн-оплаты', () => {
    const contract = faq.find((f) => /договор/.test(f.q))!.a;
    expect(contract).toContain(SITE.legalName);
    expect(contract).toContain(SITE.inn);
    expect(contract).toMatch(/онлайн-оплаты нет/);
  });

  it('уникальные вопросы, непустые ответы, без запрещённых обещаний', () => {
    expect(new Set(faq.map((f) => f.q)).size).toBe(faq.length);
    for (const item of faq) {
      expect(item.a.trim().length).toBeGreaterThan(20);
      expect(`${item.q} ${item.a}`).not.toMatch(FORBIDDEN);
    }
  });
});

describe('packagePriceLine', () => {
  it('разово и в месяц, с неразрывными пробелами', () => {
    expect(packagePriceLine({ setup: 17000, monthly: 1500 })).toBe(
      '17\u00a0000\u00a0₽ разово и 1\u00a0500\u00a0₽ в месяц',
    );
  });
});

describe('demoCompanyName', () => {
  it.each([
    ['Стоматология', 'Ваша стоматология'],
    ['Автосервис', 'Ваш автосервис'],
    ['Шиномонтаж', 'Ваш шиномонтаж'],
    ['Салон красоты', 'Ваш салон красоты'],
    ['Ветеринарная клиника', 'Ваша ветеринарная клиника'],
    ['Кафе', 'Ваше кафе'],
    ['Кафе и столовая', 'Ваше кафе и столовая'],
    ['Столовая', 'Ваша столовая'],
    ['Автомойка', 'Ваша автомойка'],
    ['Фитнес-клуб', 'Ваш фитнес-клуб'],
    ['Юридические услуги', 'Ваши юридические услуги'],
    ['Бухгалтерские услуги', 'Ваши бухгалтерские услуги'],
    ['Ремонт техники и электроники', 'Ваш ремонт техники и электроники'],
    ['Цветочный магазин', 'Ваш цветочный магазин'],
    ['Цветы', 'Ваши цветы'],
    ['Стройматериалы', 'Ваши стройматериалы'],
    ['Обучение вождению', 'Ваше обучение вождению'],
  ])('%s → %s', (title, name) => {
    expect(demoCompanyName(title)).toBe(name);
  });

  it('аббревиатура остаётся заглавными буквами', () => {
    expect(demoCompanyName('СТО')).toMatch(/ СТО$/);
  });

  it('у каждой ниши агента «Сайты» — «Ваш…» с маленькой буквы', () => {
    for (const n of nichesOf('sites')) {
      expect(demoCompanyName(n.title)).toMatch(/^Ваш[аеи]? [а-яё]/);
    }
  });
});

describe('demoProspect', () => {
  it('неизвестная ниша и ниша подрядчиков — null', () => {
    expect(demoProspect('nope')).toBeNull();
    expect(demoProspect('')).toBeNull();
    expect(demoProspect('__proto__')).toBeNull();
    expect(demoProspect('machinery')).toBeNull();
  });

  it('вымышленная компания в Казани с телефоном СпецПласт16', () => {
    const p = demoProspect('dentist')!;
    expect(p.name).toBe('Ваша стоматология');
    expect(p.city).toBe(DEMO_CITY);
    expect(p.phone).toBe(SITE.phone);
    expect(p.kind).toBe('site');
    expect(p.niche).toBe('dentist');
    expect(p.slug).toMatch(/^[a-z0-9-]{3,80}$/);
    expect(p.lat).toBeNull();
    expect(p.lon).toBeNull();
  });

  it('есть для каждой ниши агента «Сайты», slug проходит правило адреса', () => {
    for (const n of nichesOf('sites')) {
      const p = demoProspect(n.key)!;
      expect(p).not.toBeNull();
      expect(p.slug).toMatch(/^[a-z0-9-]{3,80}$/);
    }
  });
});

describe('demoSitePage', () => {
  it('null для неизвестной ниши', () => {
    expect(demoSitePage('nope')).toBeNull();
    expect(demoSitePage('machinery')).toBeNull();
  });

  it('звонок и WhatsApp — к СпецПласт16, карта — город примера', () => {
    const page = demoSitePage('car_repair')!;
    expect(page.title).toBe('Ваш автосервис');
    expect(page.eyebrow).toBe('Автосервис');
    expect(page.city).toBe(DEMO_CITY);
    expect(page.hero).toContain(DEMO_CITY);
    expect(page.phoneHref).toBe(SITE.phoneHref);
    expect(page.whatsappHref.startsWith(`${SITE.whatsappHref}?text=`)).toBe(true);
    expect(decodeURIComponent(page.whatsappHref)).toContain('пример сайта «Автосервис»');
    expect(page.mapHref).toBe(`https://yandex.ru/maps/?text=${encodeURIComponent(DEMO_CITY)}`);
  });

  it('показывает блок «О компании» и форму, без чужих фото', () => {
    const page = demoSitePage('dentist')!;
    expect(page.about).toBe(DEMO_ABOUT);
    expect(page.photos).toEqual([]);
    expect(page.leadForm).toBe(true);
    expect(page.services.length).toBeGreaterThan(0);
  });

  it('без выдуманных цифр в текстах, кроме телефона', () => {
    const page = demoSitePage('beauty')!;
    const text = [page.title, page.hero, page.about, page.address, page.hours, ...page.services]
      .filter(Boolean)
      .join(' ');
    expect(text).not.toMatch(/\d/);
    expect(text).not.toMatch(FORBIDDEN);
  });
});

describe('landingExamples и primerPath', () => {
  it('по карточке на каждую нишу «Сайтов», без подрядчиков', () => {
    const examples = landingExamples();
    const keys = nichesOf('sites').map((n) => n.key);
    expect(examples.map((e) => e.key)).toEqual(keys);
    expect(examples.some((e) => e.key === 'machinery')).toBe(false);
    expect(new Set(examples.map((e) => e.href)).size).toBe(examples.length);
  });

  it('ссылки ведут на страницу примера, у карточки до трёх услуг', () => {
    for (const e of landingExamples()) {
      expect(e.href).toBe(`${LANDING_PATH}/primer/${e.key}`);
      expect(e.services.length).toBeGreaterThan(0);
      expect(e.services.length).toBeLessThanOrEqual(3);
      expect(e.name.startsWith('Ваш')).toBe(true);
    }
    expect(primerPath('car_repair')).toBe('/sajt-pod-klyuch/primer/car_repair');
  });
});

describe('serviceJsonLd', () => {
  it('пакеты — предложения с ценой в рублях из базы', () => {
    const ld = serviceJsonLd(BASE, 'https://example.test/sajt-pod-klyuch');
    const offers = ld.offers as { name: string; price: number; priceCurrency: string }[];
    const packages = sitePackages(BASE);
    expect(offers).toHaveLength(packages.length);
    expect(offers.map((o) => o.price)).toEqual(packages.map((p) => p.setup));
    expect(offers.every((o) => o.priceCurrency === 'RUB')).toBe(true);
    expect(ld.url).toBe('https://example.test/sajt-pod-klyuch');
    expect(ld['@type']).toBe('Service');
  });
});
