// Страница услуги «Сайт под ключ» (/sajt-pod-klyuch, S2) и примеры шаблона
// (/sajt-pod-klyuch/primer/<ниша>, S3): чистые тексты и данные, без базы и сети.
// Цены — только из sitePackages (lib/prices.ts) от базы настроек офиса, их передаёт
// страница; ни отзывов, ни рейтингов, ни чисел «наугад» (REVIEW § 3, § 5).
// Пример — вымышленная компания «Ваша <ниша>» с телефоном СпецПласт16, а не выдуманным.

import { SERVICE_PAGE_PATH } from './clientSite';
import { rub, sitePackages, type SitePackage } from '@/lib/prices';
import { SITE } from '@/lib/site';
import { nicheByKey, nichesOf, type Niche } from './niches';
import { buildSitePage, mapHref, type SitePage } from './pages';
import type { PageNiche, PageProspect } from './pageTypes';
import { SITE_CONTENT_LIMITS } from './siteContent';

/** Адрес страницы услуги; на него ведут письма и подвал клиентских сайтов. */
/** Один адрес страницы услуги на весь код — `SERVICE_PAGE_PATH` из clientSite.ts. */
export const LANDING_PATH = SERVICE_PAGE_PATH;

/** Якорь формы «Хочу сайт» и раздела примеров на странице услуги. */
export const LANDING_FORM_ANCHOR = 'zayavka';
export const LANDING_EXAMPLES_ANCHOR = 'primery';

/** Город вымышленной компании в примерах. */
export const DEMO_CITY = 'Казань';

/** База цен из настроек офиса (lib/office/prices.ts → officePrices). */
export interface LandingPriceBase {
  setup: number;
  monthly: number;
  /** Поддержка за год (К12); без неё — 12 × месяц. */
  yearly?: number;
}

export interface LandingStep {
  title: string;
  text: string;
}

/** «Как это работает» — три шага. */
export const LANDING_STEPS: readonly LandingStep[] = [
  {
    title: 'Собираем сайт по вашей карточке',
    text:
      'Находим компанию на карте или берём данные из вашей заявки и делаем сайт: название, ' +
      'услуги, адрес, часы работы, телефон и карта.',
  },
  {
    title: 'Присылаем ссылку — смотрите бесплатно',
    text:
      'Пишем на почту или в WhatsApp. Открываете готовый сайт с телефона или компьютера, ' +
      'показываете коллегам, просите поправить тексты, услуги или фото.',
  },
  {
    title: 'Решаете потом',
    text:
      'Понравился — публикуем на нашем адресе или на вашем домене, вы оплачиваете по счёту. ' +
      'Не понравился — ответьте «нет», и ссылка перестанет открываться.',
  },
];

/** «Что входит» — для обоих пакетов. */
export const LANDING_INCLUDES: readonly string[] = [
  'Страница компании: название, услуги, адрес, часы работы и карта',
  'Кнопки «Позвонить» и «Написать в WhatsApp» — клиенту хватает одного нажатия',
  'Форма заявки: имя, телефон и комментарий клиента приходят вам на почту',
  `Блок «О компании» и до ${SITE_CONTENT_LIMITS.photos} фото — по вашим материалам`,
  'Удобно с телефона и с компьютера',
  'Разметка для поисковиков: название, адрес и телефон организации',
  'Правки по вашей просьбе, работа сайта и поддержка — в ежемесячной плате',
];

export interface FaqItem {
  q: string;
  a: string;
}

function money(value: number): string {
  return `${rub(value)}\u00a0₽`;
}

/**
 * Цена пакета одной строкой: «3 900 ₽ разово и 990 ₽ в месяц», а когда год дешевле 12 месяцев
 * (К12) — «… в месяц или 9 900 ₽ сразу за год».
 */
export function packagePriceLine(
  pkg: Pick<SitePackage, 'setup' | 'monthly'> & { yearly?: number },
): string {
  const line = `${money(pkg.setup)} разово и ${money(pkg.monthly)} в месяц`;
  const yearly = pkg.yearly;
  if (yearly === undefined || yearly <= 0 || yearly >= pkg.monthly * 12) return line;
  return `${line} или ${money(yearly)} сразу за год`;
}

/**
 * Вопросы и ответы страницы услуги (7 штук). Цены — из пакетов от базы настроек офиса,
 * поэтому список строится функцией, а не константой.
 */
export function landingFaq(base: LandingPriceBase): FaqItem[] {
  const packages = sitePackages(base);
  const prices = packages.map((p) => `«${p.title}» — ${packagePriceLine(p)}`).join('; ');
  return [
    {
      q: 'Сколько стоит сайт?',
      a:
        `${prices}. В ежемесячную плату входят работа сайта, поддержка и правки. ` +
        'Сам домен оформляется на вас и продлевается по цене регистратора. ' +
        'Посмотреть готовый сайт до решения — бесплатно.',
    },
    {
      q: 'Что нужно от меня?',
      a:
        'Только посмотреть сайт и сказать, подходит ли он. Мы собираем его по вашей карточке на ' +
        'карте. Хотите — пришлите фото, пару слов о компании и список услуг, добавим.',
    },
    {
      q: 'Можно ли свой домен?',
      a:
        'Да, это пакет «Сайт на своём домене». Если домен уже есть — подскажем две записи в ' +
        'настройках у регистратора и подключим. Если нет — поможем оформить его на вас. Без своего ' +
        'домена сайт работает на нашем адресе.',
    },
    {
      q: 'Как приходят заявки с сайта?',
      a:
        'Клиент нажимает «Позвонить» или «Написать в WhatsApp» и попадает прямо к вам. Ещё на ' +
        'сайте есть форма заявки: имя, телефон и комментарий клиента приходят вам на почту. ' +
        'Форму можно выключить.',
    },
    {
      q: 'Как поменять тексты, услуги или фото?',
      a:
        'Напишите или позвоните нам — поправим тексты, услуги, часы работы, адрес, телефон, цвет ' +
        'и фото. Правки входят в ежемесячную плату, программист вам не нужен.',
    },
    {
      q: 'Что, если сайт не понравится?',
      a:
        'Вы ничего не платите. Скажите, что поправить, — переделаем. Или ответьте «нет», и ' +
        'ссылка на сайт перестанет открываться. Решите отказаться позже — сайт снимем с ' +
        'публикации, платить дальше не нужно.',
    },
    {
      q: 'Как оформляются договор и оплата?',
      a:
        `Исполнитель — ${SITE.legalName} (ИНН ${SITE.inn}). Оплата по счёту банковским ` +
        'переводом, онлайн-оплаты нет. Счёт присылаем только после того, как вы посмотрели сайт ' +
        'и согласились. Договор пришлём по запросу.',
    },
  ];
}

/** Ссылка на пример сайта ниши. */
export function primerPath(nicheKey: string): string {
  return `${LANDING_PATH}/primer/${encodeURIComponent(nicheKey)}`;
}

const ADJ_ENDING: readonly { re: RegExp; noun: RegExp; word: string }[] = [
  { re: /(ая|яя)$/, noun: /[ая]$/, word: 'Ваша' },
  { re: /(ое|ее)$/, noun: /[ое]$/, word: 'Ваше' },
  { re: /(ые|ие)$/, noun: /[ыи]$/, word: 'Ваши' },
  { re: /(ый|ий|ой)$/, noun: /[^аяоеёыиуюэ]$/, word: 'Ваш' },
];

function possessiveForNoun(word: string): string {
  if (/[ая]$/.test(word)) return 'Ваша';
  if (/[оеё]$/.test(word)) return 'Ваше';
  if (/[ыи]$/.test(word)) return 'Ваши';
  return 'Ваш';
}

function lowerFirst(text: string): string {
  // Аббревиатуру («СТО») оставляем как есть.
  if (/^[А-ЯЁA-Z]{2}/.test(text)) return text;
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/**
 * Название вымышленной компании примера: «Ваша стоматология», «Ваш салон красоты»,
 * «Ваше кафе», «Ваши юридические услуги». Род — по первому слову: прилагательное
 * («Ветеринарная клиника») согласуется со следующим словом, иначе — по окончанию
 * существительного («Салон красоты», «Автомойка»).
 */
export function demoCompanyName(nicheTitle: string): string {
  const title = nicheTitle.trim();
  const words = title.toLowerCase().split(/\s+/);
  const first = words[0] ?? '';
  const second = words[1];
  let possessive = possessiveForNoun(first);
  if (second) {
    const adjective = ADJ_ENDING.find((e) => e.re.test(first) && e.noun.test(second));
    if (adjective) possessive = adjective.word;
  }
  return `${possessive} ${lowerFirst(title)}`;
}

/** Ниша агента «Сайты» по ключу; ниша подрядчиков и неизвестный ключ — null. */
export function demoNiche(nicheKey: string): Niche | null {
  const niche = nicheByKey(nicheKey);
  return niche && niche.agent === 'sites' ? niche : null;
}

/** Кандидат-пример: вымышленная компания, телефон СпецПласт16 (не выдуманный). */
export type DemoProspect = PageProspect & { niche: string };

/** Вымышленная компания «Ваша <ниша>» в городе DEMO_CITY; неизвестная ниша — null. */
export function demoProspect(nicheKey: string): DemoProspect | null {
  const niche = demoNiche(nicheKey);
  if (!niche) return null;
  return {
    kind: 'site',
    status: 'DEMO',
    slug: `primer-${niche.key.replace(/_/g, '-')}`,
    name: demoCompanyName(niche.title),
    phone: SITE.phone,
    address: `${DEMO_CITY}, здесь будет ваш адрес из карточки на карте`,
    city: DEMO_CITY,
    lat: null,
    lon: null,
    tags: null,
    hours: 'Ваши часы работы',
    niche: niche.key,
  };
}

function pageNiche(n: Niche): PageNiche {
  return {
    key: n.key,
    title: n.title,
    services: [...n.services],
    heroLine: n.heroLine,
    accent: n.accent,
  };
}

/** Текст блока «О компании» в примере — объясняет, что в нём будет, а не выдумывает историю. */
export const DEMO_ABOUT =
  'Здесь — рассказ о вашей компании: сколько лет вы работаете, чем отличаетесь, кто у вас ' +
  'работает. Напишем его вместе с вами по вашим словам — или уберём блок, если он не нужен.';

/**
 * Страница примера: шаблон клиентского сайта на вымышленной компании. Звонок и WhatsApp
 * ведут к СпецПласт16 (WhatsApp — с готовым текстом про пример), карта — на город примера.
 */
export function demoSitePage(nicheKey: string): SitePage | null {
  const prospect = demoProspect(nicheKey);
  const niche = demoNiche(nicheKey);
  if (!prospect || !niche) return null;
  const page = buildSitePage(prospect, pageNiche(niche));
  const hello = `Здравствуйте! Посмотрел пример сайта «${niche.title}» — хочу такой же для своей компании.`;
  return {
    ...page,
    whatsappHref: `${SITE.whatsappHref}?text=${encodeURIComponent(hello)}`,
    mapHref: mapHref({ lat: null, lon: null, address: DEMO_CITY }),
    about: DEMO_ABOUT,
    photos: [],
    leadForm: true,
  };
}

export interface LandingExample {
  key: string;
  /** «Стоматология». */
  title: string;
  /** «Ваша стоматология». */
  name: string;
  href: string;
  accent: Niche['accent'];
  /** Первые услуги ниши для карточки. */
  services: string[];
}

/** Карточки примеров — все ниши агента «Сайты», в порядке словаря. */
export function landingExamples(servicesPerCard = 3): LandingExample[] {
  return nichesOf('sites').map((n) => ({
    key: n.key,
    title: n.title,
    name: demoCompanyName(n.title),
    href: primerPath(n.key),
    accent: n.accent,
    services: n.services.slice(0, servicesPerCard),
  }));
}

/** Разметка schema.org Service для страницы услуги: пакеты как предложения с ценой. */
export function serviceJsonLd(base: LandingPriceBase, url: string): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: 'Сайт для бизнеса под ключ',
    serviceType: 'Создание сайта-визитки для компании',
    url,
    areaServed: { '@type': 'Country', name: 'Россия' },
    provider: {
      '@type': 'Organization',
      name: `${SITE.platform} от ${SITE.name}`,
      legalName: SITE.legalName,
      telephone: SITE.phoneHref.replace(/^tel:/, ''),
    },
    offers: sitePackages(base).map((p) => ({
      '@type': 'Offer',
      name: p.title,
      price: p.setup,
      priceCurrency: 'RUB',
      description: `${packagePriceLine(p)}. ${p.includes.join('. ')}`,
    })),
  };
}
