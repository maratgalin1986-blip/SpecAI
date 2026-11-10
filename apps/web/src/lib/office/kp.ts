// Коммерческое предложение одной фирме — страница /kp/<token> (владелец, 2026-11-10: «красивое
// коммерческое… чтоб было как шоу»). Чистая сборка модели страницы из досье и предложения:
// цифры — только посчитанные по карточке и соседям (lib/office/dossier.ts), цены — из настроек
// офиса; без «лучший / гарантируем / самые» (REVIEW § 5). Ссылку на страницу офис ставит в
// сообщение WhatsApp; до согласия фирмы она не индексируется и открывается только по токену.
import { sitePackages, type SitePackage, type SitePriceBase } from '@/lib/prices';
import type { Dossier } from './dossier';
import type { Offer } from './offer';
import { quotedName } from './quotedName';

/** Адрес страницы предложения. */
export function kpPath(token: string): string {
  return `/kp/${encodeURIComponent(token)}`;
}

export function kpUrl(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/+$/, '')}${kpPath(token)}`;
}

/** Крупная цифра первого экрана: число и подпись под ним. */
export interface KpStat {
  value: string;
  label: string;
}

export interface KpView {
  /** «Стоматология «Улыбка»» — название в кавычках, как в письмах. */
  company: string;
  city: string | null;
  /** Вступление персонального предложения — про эту фирму. */
  opener: string;
  stats: KpStat[];
  bullets: string[];
  packages: (SitePackage & { recommended: boolean })[];
  packageReason: string;
  steps: { title: string; text: string }[];
}

function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

/** Цифры из досье: соседи той же сферы, у скольких сайт, часы. Нет фактов — нет цифр. */
export function kpStats(dossier: Dossier | null): KpStat[] {
  const out: KpStat[] = [];
  const c = dossier?.competitors;
  if (c && c.sameNiche >= 1) {
    out.push({
      value: String(c.sameNiche),
      label: `${plural(c.sameNiche, 'компания', 'компании', 'компаний')} вашей сферы в ${c.radiusKm} км от вас`,
    });
    out.push({
      value: String(c.withSite),
      label:
        c.withSite === 0
          ? 'из них со своим сайтом — вы можете быть первыми'
          : `из них уже со своим сайтом`,
    });
  }
  const h = dossier?.hours;
  if (h?.roundTheClock) out.push({ value: '24/7', label: 'вы работаете круглосуточно' });
  else if (h?.lateClose) out.push({ value: h.lateClose, label: 'до этого часа вы работаете' });
  // «7 дней» — только если все семь дней названы рабочими в карточке (не «сб — да, вс — нет»).
  else if (h?.everyDay) out.push({ value: '7', label: 'дней в неделю вы принимаете клиентов' });
  return out.slice(0, 3);
}

export const KP_STEPS: KpView['steps'] = [
  { title: 'Смотрите', text: 'Сайт уже собран по вашей карточке на карте — откройте и оцените.' },
  {
    title: 'Правим',
    text: 'Скажете, что поменять: тексты, услуги, часы, фото — поправим за день.',
  },
  { title: 'Запускаем', text: 'После оплаты сайт открывается по своему адресу в тот же день.' },
];

export function buildKp(input: {
  name: string;
  city: string | null;
  dossier: Dossier | null;
  offer: Pick<Offer, 'opener' | 'bullets' | 'packageKey' | 'packageReason'>;
  prices: SitePriceBase;
}): KpView {
  return {
    company: quotedName(input.name),
    city: input.city?.trim() || null,
    opener: input.offer.opener,
    stats: kpStats(input.dossier),
    bullets: input.offer.bullets,
    packages: sitePackages(input.prices).map((p) => ({
      ...p,
      recommended: p.key === input.offer.packageKey,
    })),
    packageReason: input.offer.packageReason,
    steps: KP_STEPS,
  };
}
