// Персональное коммерческое предложение (S14): под каждую фирму — свой заход, своя тема
// письма и свои пункты, собранные из её досье (dossier.ts). Каждая фраза опирается на факт
// досье или на нишу; цифры в тексте — только посчитанные (конкуренты рядом). Какой заход
// выбрать из подходящих, решает обучение (learning.ts) по ответам прошлых писем.

import type { Dossier } from './dossier';

export const OFFER_ANGLES = [
  'competitors_have_sites',
  'first_in_area',
  'open_late',
  'weekends',
  'whatsapp',
  'leads_to_email',
  'search',
] as const;
export type OfferAngle = (typeof OFFER_ANGLES)[number];

export const ANGLE_TITLES: Record<OfferAngle, string> = {
  competitors_have_sites: 'У конкурентов рядом уже есть сайт',
  first_in_area: 'Первым в районе с сайтом',
  open_late: 'Работаете допоздна',
  weekends: 'Работаете в выходные',
  whatsapp: 'Есть WhatsApp — кнопка «Написать»',
  leads_to_email: 'Заявки на почту, даже когда телефон занят',
  search: 'Находят не только на карте',
};

/** Что клиент ниши хочет увидеть первым — по нише, без выдумок о фирме. */
export const NICHE_NEEDS: Record<string, string> = {
  dentist: 'услуги, цены на лечение и как записаться',
  car_repair: 'какие работы вы делаете и как записаться на ремонт',
  tyres: 'как записаться на переобувку в сезон',
  beauty: 'услуги и как записаться к мастеру',
  vet: 'часы работы и можно ли прийти срочно',
  cafe: 'меню, часы и как доехать',
  car_wash: 'услуги, цены и часы работы',
  fitness: 'расписание и абонементы',
  lawyer: 'с какими делами вы помогаете и как записаться на консультацию',
  accounting: 'какие услуги вы ведёте и для кого',
  repair: 'что вы ремонтируете и как сдать технику',
  florist: 'букеты и есть ли доставка',
  building_materials: 'что есть в наличии и есть ли доставка',
  machinery: 'какая у вас техника и как её заказать',
};

/**
 * Версия текстов предложения. Неотправленное предложение прежней версии (до правил § 8.10
 * бизнес-плана: цены, «сайта нет», обещания сроков) не отправляется — строится заново.
 */
export const OFFER_TEXT_VERSION = 2;

export interface Offer {
  /** Версия текстов (OFFER_TEXT_VERSION); у предложений до 2026-11-11 поля нет. */
  v?: number;
  angle: OfferAngle;
  /** Тема письма. */
  subject: string;
  /** Первое предложение после приветствия — про эту фирму. */
  opener: string;
  /** Три пункта «что даст сайт именно вам». */
  bullets: string[];
  packageKey: 'vizitka' | 'domen';
  packageReason: string;
}

function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

/** Заходы, для которых у фирмы есть факты; общие — всегда в конце. */
export function applicableAngles(d: Dossier | null): OfferAngle[] {
  if (!d) return ['leads_to_email', 'search'];
  const out: OfferAngle[] = [];
  const c = d.competitors;
  if (c && c.sameNiche >= 2 && c.withSite >= 1) out.push('competitors_have_sites');
  if (c && c.sameNiche >= 2 && c.withSite === 0) out.push('first_in_area');
  if (d.hours?.lateClose && !d.hours.roundTheClock) out.push('open_late');
  if (d.hours?.weekends) out.push('weekends');
  if (d.channels.whatsapp) out.push('whatsapp');
  out.push('leads_to_email', 'search');
  return out;
}

/** Предложение под фирму с выбранным заходом (заход должен быть из applicableAngles). */
export function buildOffer(input: {
  dossier: Dossier | null;
  angle: OfferAngle;
  companyName: string;
  /** Город строки — когда досье нет (старые кандидаты, ручной ввод без адреса). */
  city?: string | null;
}): Offer {
  const d = input.dossier;
  const name = input.companyName.trim();
  const c = d?.competitors ?? null;

  // Название — только в именительном падеже («Улыбка: …»): склонять названия компаний нельзя.
  let subject = `Черновик страницы для ${name}`;
  // Факт — о карточке, а не о фирме: сайта может не быть только в карточке (§ 9.1, п. 3).
  let opener = `В открытой карточке компании ${name} на карте не указан сайт.`;
  let angleBullet = 'Страница открывается с телефона: кнопка «Позвонить» и ссылка на карту.';

  switch (input.angle) {
    case 'competitors_have_sites':
      if (c) {
        subject = `${name}: черновик страницы — у соседей по сфере сайты в карточках указаны`;
        opener =
          `По данным открытой карты, в ${c.radiusKm} км от вас ещё ${c.sameNiche} ` +
          `${plural(c.sameNiche, 'компания', 'компании', 'компаний')} той же сферы, и у ${c.withSite} из них в карточке указан сайт; ` +
          'в вашей карточке сайта нет.';
        angleBullet = 'Ссылку на страницу можно добавить в вашу карточку на картах.';
      }
      break;
    case 'first_in_area':
      if (c) {
        subject = `${name}: черновик страницы для вашей компании`;
        opener =
          `По данным открытой карты, в ${c.radiusKm} км от вас ещё ${c.sameNiche} ` +
          `${plural(c.sameNiche, 'компания', 'компании', 'компаний')} той же сферы, и ни у одной в карточке не указан сайт — как и у вас.`;
        angleBullet = 'Ссылку на страницу можно добавить в вашу карточку на картах.';
      }
      break;
    case 'open_late':
      if (d?.hours?.lateClose) {
        subject = `${name}: черновик страницы с вашими часами работы`;
        opener = `В вашей карточке на карте указано, что вы работаете до ${d.hours.lateClose}, а сайт не указан.`;
        angleBullet = 'Часы работы из карточки показаны на странице.';
      }
      break;
    case 'weekends':
      subject = `${name}: черновик страницы с вашими часами работы`;
      opener =
        'В вашей карточке на карте указано, что вы работаете и в выходные, а сайт не указан.';
      angleBullet = 'Часы работы из карточки, с выходными, показаны на странице.';
      break;
    case 'whatsapp':
      subject = `${name}: черновик страницы с кнопкой «Написать»`;
      opener = 'В вашей карточке на карте указан WhatsApp, а сайт не указан.';
      angleBullet = 'На странице есть кнопка «Написать в WhatsApp» — номер из карточки.';
      break;
    case 'leads_to_email':
      subject = `${name}: черновик страницы, заявки — вам на почту`;
      angleBullet =
        'После подключения клиент сможет оставить заявку на странице — она придёт вам на почту.';
      break;
    case 'search':
      subject = `Черновик страницы для ${name}`;
      angleBullet = 'Своя страница — ещё одно место, где о вас можно узнать, кроме карт.';
      break;
  }

  const bullets = [
    'Название, адрес, часы работы и телефон — из вашей карточки; список услуг — типовой для вашей сферы, поправим по вашим словам.',
    angleBullet,
    input.angle === 'leads_to_email'
      ? 'Тексты, услуги, часы и фото поменяем по вашей просьбе.'
      : 'После подключения заявки со страницы будут приходить вам на почту.',
  ];

  const domen = Boolean(c && c.withSite >= 2);
  return {
    v: OFFER_TEXT_VERSION,
    angle: input.angle,
    subject,
    opener,
    bullets,
    packageKey: domen ? 'domen' : 'vizitka',
    packageReason: domen
      ? 'рядом несколько конкурентов со своими сайтами — свой адрес поможет выделиться'
      : 'для старта хватит визитки, домен можно подключить потом',
  };
}
