// Досье фирмы (S13): что офис знает о конкретной компании до того, как ей писать. Только
// проверяемые факты — из её карточки на карте и из того же поиска (соседи той же ниши):
// часы работы, каналы связи, пробелы в карточке, сколько конкурентов рядом и у скольких из
// них уже есть сайт. Ничего не выдумываем: нет данных — нет факта. По досье выбирается
// заход персонального предложения (offer.ts), по заходам офис учится (learning.ts).

import { distanceKm } from '@/lib/geo';
import type { Candidate, Neighbor } from './sources/types';

/** Конкуренты считаются в этом радиусе от фирмы. */
export const DOSSIER_RADIUS_KM = 2;

export interface DossierHours {
  /** Позднее закрытие в будни — «21:00», если позже 20:00; иначе null. */
  lateClose: string | null;
  /** Работает в субботу или воскресенье. */
  weekends: boolean;
  roundTheClock: boolean;
}

export interface Dossier {
  v: 1;
  niche: string;
  nicheTitle: string;
  city: string | null;
  /** Факты карточки, как их можно сказать в письме. */
  facts: string[];
  hours: DossierHours | null;
  /** null — у фирмы нет координат, сравнивать не с чем. */
  competitors: { radiusKm: number; sameNiche: number; withSite: number } | null;
  channels: { email: boolean; whatsapp: boolean; telegram: boolean };
  /** Чего не хватает в интернете: «нет сайта» — всегда первым. */
  gaps: string[];
}

const DAY_RU: Record<string, string> = {
  Mo: 'пн',
  Tu: 'вт',
  We: 'ср',
  Th: 'чт',
  Fr: 'пт',
  Sa: 'сб',
  Su: 'вс',
};

/**
 * Часы из карточки: формат OSM («Mo-Fr 09:00-21:00; Sa 10:00-16:00», «24/7») и 2ГИС
 * («Пн–Пт 09:00–20:00»). Позднее закрытие — самое позднее время «до» после 20:00
 * (24:00 и ночные интервалы не считаем «поздним» — это круглосуточно или ночная смена).
 */
export function parseHours(raw: string | null | undefined): DossierHours | null {
  const text = (raw ?? '').trim();
  if (!text) return null;
  const roundTheClock = /24\s*\/\s*7|круглосуточно|00:00\s*[-–]\s*24:00/i.test(text);
  const weekends =
    /(^|[^a-zа-яё])(sa|su|сб|вс|суб|воскр)/i.test(text) ||
    /mo\s*[-–]\s*su|пн\s*[-–]\s*вс/i.test(text);
  let latest = -1;
  for (const m of text.matchAll(/(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})/g)) {
    const from = Number(m[1]) * 60 + Number(m[2]);
    const to = Number(m[3]) * 60 + Number(m[4]);
    if (to <= from || to >= 24 * 60) continue;
    latest = Math.max(latest, to);
  }
  const lateClose =
    latest > 20 * 60
      ? `${String(Math.floor(latest / 60)).padStart(2, '0')}:${String(latest % 60).padStart(2, '0')}`
      : null;
  return { lateClose, weekends, roundTheClock };
}

/** «Mo-Fr 09:00-21:00» → «пн-пт 09:00-21:00» для текста письма. */
export function hoursForText(raw: string): string {
  return raw.replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su)\b/g, (d) => DAY_RU[d] ?? d).replace(/;\s*/g, '; ');
}

/** Соседи из списка кандидатов — когда источник не отдал отдельный список объектов ниши. */
export function neighborsOf(candidates: readonly Candidate[]): Neighbor[] {
  const out: Neighbor[] = [];
  for (const c of candidates) {
    if (c.lat === null || c.lon === null) continue;
    out.push({ ref: c.sourceRef, lat: c.lat, lon: c.lon, hasSite: Boolean(c.website) });
  }
  return out;
}

/**
 * Досье по карточке и соседям из того же поиска. `neighbors` — все названные объекты этой
 * ниши (с сайтом и без, с телефоном и без); сама фирма и дубли по ссылке источника не считаются.
 * Список должен быть полным по району: по выборке числа «рядом» выходят заниженными.
 */
export function buildDossier(input: {
  candidate: Candidate;
  neighbors: readonly Neighbor[];
  niche: string;
  nicheTitle: string;
  city: string | null;
}): Dossier {
  const { candidate: c } = input;
  const hours = parseHours(c.hours);
  const facts: string[] = [];
  if (c.address) facts.push(`адрес: ${c.address}`);
  if (c.hours) facts.push(`часы: ${hoursForText(c.hours)}`);
  if (c.whatsapp) facts.push('в карточке указан WhatsApp');
  if (c.email) facts.push('в карточке есть почта');
  if (c.tags.length) facts.push(`в карточке: ${c.tags.slice(0, 5).join(', ')}`);

  let competitors: Dossier['competitors'] = null;
  if (c.lat !== null && c.lon !== null) {
    const seen = new Set<string>([c.sourceRef]);
    let sameNiche = 0;
    let withSite = 0;
    for (const n of input.neighbors) {
      if (seen.has(n.ref)) continue;
      seen.add(n.ref);
      if (distanceKm({ lat: c.lat, lon: c.lon }, { lat: n.lat, lon: n.lon }) > DOSSIER_RADIUS_KM)
        continue;
      sameNiche += 1;
      if (n.hasSite) withSite += 1;
    }
    competitors = { radiusKm: DOSSIER_RADIUS_KM, sameNiche, withSite };
  }

  const gaps = ['нет своего сайта'];
  if (!c.hours) gaps.push('в карточке нет часов работы');
  if (!c.email && !c.whatsapp && !c.telegram) gaps.push('кроме телефона, связаться не через что');

  return {
    v: 1,
    niche: input.niche,
    nicheTitle: input.nicheTitle,
    city: input.city,
    facts,
    hours,
    competitors,
    channels: {
      email: Boolean(c.email),
      whatsapp: Boolean(c.whatsapp),
      telegram: Boolean(c.telegram),
    },
    gaps,
  };
}

/** Досье из базы; битое или старой версии — null (письмо уйдёт с общим заходом). */
export function parseDossier(raw: string | null | undefined): Dossier | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as Partial<Dossier>;
    if (
      d?.v !== 1 ||
      typeof d.niche !== 'string' ||
      !Array.isArray(d.facts) ||
      !Array.isArray(d.gaps)
    ) {
      return null;
    }
    return d as Dossier;
  } catch {
    return null;
  }
}
