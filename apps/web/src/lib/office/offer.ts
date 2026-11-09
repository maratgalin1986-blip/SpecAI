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

const GENERIC_NEED = 'чем вы занимаетесь, где вы и как с вами связаться';

export interface Offer {
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

function nicheLower(d: Dossier): string {
  return d.nicheTitle.charAt(0).toLowerCase() + d.nicheTitle.slice(1);
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
}): Offer {
  const d = input.dossier;
  const name = input.companyName.trim();
  const where = d?.city ? ` в городе ${d.city}` : '';
  const need = (d && NICHE_NEEDS[d.niche]) || GENERIC_NEED;
  const c = d?.competitors ?? null;
  const niche = d ? nicheLower(d) : 'компаний';

  // Название — только в именительном падеже («Улыбка: …»): склонять названия компаний нельзя.
  let subject = `${name}: сделали вам страницу — посмотрите`;
  let opener = `Мы увидели вашу компанию на карте${where} — ${name}: телефон и адрес есть, а своего сайта нет.`;
  let angleBullet = 'Страница открывается с телефона за секунду: кнопки «Позвонить» и «Написать».';

  switch (input.angle) {
    case 'competitors_have_sites':
      if (c) {
        subject = `У ${c.withSite} из ${c.sameNiche} соседей по сфере уже есть сайт — сделали и вам`;
        opener =
          `Мы посмотрели, кто работает рядом с вами: в ${c.radiusKm} км ещё ${c.sameNiche} ` +
          `${plural(c.sameNiche, 'компания', 'компании', 'компаний')} той же сферы, и у ${c.withSite} из них уже есть свой сайт — ` +
          'клиенты из поиска видят их первыми.';
        angleBullet =
          'Клиент, который сравнивает варианты, увидит и вас — а не только соседей с сайтом.';
      }
      break;
    case 'first_in_area':
      if (c) {
        subject = 'Рядом с вами ни у кого нет сайта — сделали вам первым';
        opener =
          `Мы посмотрели, кто работает рядом с вами: в ${c.radiusKm} км ещё ${c.sameNiche} ` +
          `${plural(c.sameNiche, 'компания', 'компании', 'компаний')} той же сферы, и ни у одной нет своего сайта.`;
        angleBullet =
          'Кто первым появится в поиске со своей страницей, к тому и пойдут эти клиенты.';
      }
      break;
    case 'open_late':
      if (d?.hours?.lateClose) {
        subject = `Вы работаете до ${d.hours.lateClose} — пусть клиенты видят это сразу`;
        opener = `Вы работаете до ${d.hours.lateClose} — это сильная сторона, но без сайта её видно только в карточке на карте.`;
        angleBullet = `На странице сразу видно «работаем до ${d.hours.lateClose}», а заявку можно оставить в любое время.`;
      }
      break;
    case 'weekends':
      subject = 'Вы работаете в выходные — пусть клиенты видят это сразу';
      opener =
        'Вы принимаете клиентов и в выходные — тем, кто ищет в субботу или воскресенье, важно увидеть это сразу.';
      angleBullet = 'Часы работы с выходными — на первом экране страницы.';
      break;
    case 'whatsapp':
      subject = 'У вас есть WhatsApp — на сайте будет кнопка «Написать»';
      opener = 'У вас в карточке указан WhatsApp — многие клиенты охотнее напишут, чем позвонят.';
      angleBullet = 'Кнопка «Написать в WhatsApp» на странице — клиенту не нужно звонить.';
      break;
    case 'leads_to_email':
      subject = `${name}: сделали вам страницу, заявки — вам на почту`;
      angleBullet =
        'Если телефон занят, клиент оставит заявку на странице — она придёт вам на почту.';
      break;
    case 'search':
      subject = `Люди ищут «${niche}${d?.city ? ` ${d.city}` : ''}» — сделали вам страницу`;
      opener = 'На карте вас найти можно, а в обычном поиске без своего сайта — сложно.';
      angleBullet = 'Своя страница — ещё одно место, где вас находят, кроме карт.';
      break;
  }

  const bullets = [
    `Клиенты сначала хотят увидеть ${need} — это на первом экране вашей страницы.`,
    angleBullet,
    input.angle === 'leads_to_email'
      ? 'Тексты, услуги, часы и фото поменяем по вашей просьбе — без программиста.'
      : 'Заявки со страницы приходят вам на почту — даже когда телефон занят.',
  ];

  const domen = Boolean(c && c.withSite >= 2);
  return {
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
