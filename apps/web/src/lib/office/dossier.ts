// Досье фирмы (S13): что офис знает о конкретной компании до того, как ей писать. Только
// проверяемые факты — из её карточки на карте и из того же поиска (соседи той же ниши):
// часы работы, каналы связи, пробелы в карточке, сколько конкурентов рядом и у скольких из
// них уже есть сайт. Ничего не выдумываем: нет данных — нет факта. По досье выбирается
// заход персонального предложения (offer.ts), по заходам офис учится (learning.ts).

import { distanceKm } from '@/lib/geo';
import type { Candidate, Neighbor } from './sources/types';

/** Начало факта «часы работы» в досье — по нему часы читаются заново (parseDossier). */
const HOURS_FACT = 'часы: ';

/** Конкуренты считаются в этом радиусе от фирмы. */
export const DOSSIER_RADIUS_KM = 2;

export interface DossierHours {
  /** Позднее закрытие в будни — «21:00», если позже 20:00; иначе null. */
  lateClose: string | null;
  /** Суббота или воскресенье прямо названы рабочими («Sa,Su off» — это не работа в выходные). */
  weekends: boolean;
  /** Все семь дней прямо названы рабочими. В досье, записанных до 2026-11-10, поля нет. */
  everyDay?: boolean;
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

/** Дни недели в часах работы: 0 — понедельник … 6 — воскресенье. */
const DAY_TOKENS: readonly (readonly [RegExp, number])[] = [
  [/^(mo(n(day)?)?|пн|понедельник\S*)$/i, 0],
  [/^(tu(e(s(day)?)?)?|вт|вторник\S*)$/i, 1],
  [/^(we(d(nesday)?)?|ср|сред[аыу])$/i, 2],
  [/^(th(u(r(s(day)?)?)?)?|чт|четверг\S*)$/i, 3],
  [/^(fr(i(day)?)?|пт|пятниц\S*)$/i, 4],
  [/^(sa(t(urday)?)?|сб|суб|суббот\S*)$/i, 5],
  [/^(su(n(day)?)?|вс|вск|воскр|воскресень\S*)$/i, 6],
];
const DAY_WORD =
  '(?:mo(?:n(?:day)?)?|tu(?:e(?:s(?:day)?)?)?|we(?:d(?:nesday)?)?|th(?:u(?:r(?:s(?:day)?)?)?)?|fr(?:i(?:day)?)?|sa(?:t(?:urday)?)?|su(?:n(?:day)?)?|пн|вт|ср|чт|пт|сб|вс|вск|суб|воскр|понедельник[а-яё]*|вторник[а-яё]*|сред[аыу]|четверг[а-яё]*|пятниц[а-яё]*|суббот[а-яё]*|воскресень[а-яё]*)';
/** Слово-день целиком: «вс» не находится во «все», «sa» — в «sale». */
const DAY_RE = new RegExp(`(?<![a-zа-яё])${DAY_WORD}(?![a-zа-яё])`, 'gi');
const DAY_RANGE_RE = new RegExp(
  `(?<![a-zа-яё])(${DAY_WORD})\\s*[-–—]\\s*(${DAY_WORD})(?![a-zа-яё])`,
  'gi',
);
const NO_DAYS_OFF_RE = /без\s+выходных/gi;
const EXCEPT_RE = /^\s*(кроме|except)/i;
const EVERY_DAY_RE = /ежедневно|без\s+выходных|каждый\s+день|daily|every\s*day/i;
const CLOSED_RE = /(?<![a-zа-яё])(off|closed)(?![a-zа-яё])|выходн|закрыт|не\s+работа/i;
const ALL_DAY_RE = /24\s*\/\s*7|круглосуточно/i;
const TIME_RANGE_RE = /\d{1,2}[:.]\d{2}\s*[-–—]\s*\d{1,2}[:.]\d{2}/;

function dayIndex(word: string): number {
  for (const [re, index] of DAY_TOKENS) if (re.test(word)) return index;
  return -1;
}

/** Дни, названные в куске правила: «Mo-Fr» — диапазон (и через выходные: «Fr-Mo»), «Sa,Su» — список. */
function daysOf(piece: string): number[] {
  const days = new Set<number>();
  if (EVERY_DAY_RE.test(piece)) for (let d = 0; d < 7; d += 1) days.add(d);
  const rest = piece.replace(DAY_RANGE_RE, (_m, a: string, b: string) => {
    const from = dayIndex(a);
    const to = dayIndex(b);
    if (from >= 0 && to >= 0) {
      for (let d = from; ; d = (d + 1) % 7) {
        days.add(d);
        if (d === to) break;
      }
    }
    return ' ';
  });
  for (const m of rest.matchAll(DAY_RE)) {
    const d = dayIndex(m[0]);
    if (d >= 0) days.add(d);
  }
  return [...days];
}

/**
 * По каким дням фирма открыта — только то, что сказано прямо: день с интервалом времени открыт,
 * день с «off»/«выходной» закрыт, позднее правило отменяет раннее («Mo-Su 09:00-18:00; Su off»).
 * Правило без дней («09:00-18:00») дней не называет — по нему ничего не утверждаем.
 */
function openDays(text: string): (boolean | undefined)[] {
  const open: (boolean | undefined)[] = Array.from({ length: 7 }, () => undefined);
  for (const rule of text.split(/[;\n]/)) {
    // «Sa,Su off» и «Сб, Вс — выходной»: дни без времени относятся к следующему куску.
    let carried: number[] = [];
    // «ежедневно, кроме воскресенья»: названные после «кроме» дни закрыты.
    const except: number[] = [];
    for (const piece of rule.split(/,|(?=кроме)|(?=except)/i)) {
      if (EXCEPT_RE.test(piece)) {
        except.push(...daysOf(piece));
        if (!TIME_RANGE_RE.test(piece)) continue;
        for (const d of carried) open[d] = true;
        carried = [];
        continue;
      }
      const days = [...carried, ...daysOf(piece)];
      const closed = CLOSED_RE.test(piece.replace(NO_DAYS_OFF_RE, ' '));
      const works = TIME_RANGE_RE.test(piece) || ALL_DAY_RE.test(piece);
      if (!closed && !works) {
        carried = days;
        continue;
      }
      carried = [];
      for (const d of days) open[d] = !closed;
    }
    for (const d of except) open[d] = false;
  }
  return open;
}

/**
 * Часы из карточки: формат OSM («Mo-Fr 09:00-21:00; Sa 10:00-16:00», «24/7») и 2ГИС
 * («Пн–Пт 09:00–20:00»). Позднее закрытие — самое позднее время «до» после 20:00
 * (24:00 и ночные интервалы не считаем «поздним» — это круглосуточно или ночная смена).
 * «Работает в выходные» — только если суббота или воскресенье названы открытыми:
 * «Mo-Fr 09:00-18:00; Sa,Su off» — это не работа в выходные.
 */
export function parseHours(raw: string | null | undefined): DossierHours | null {
  const text = (raw ?? '').trim();
  if (!text) return null;
  const roundTheClock = /24\s*\/\s*7|круглосуточно|00:00\s*[-–]\s*24:00/i.test(text);
  const open = openDays(text);
  const weekends = open[5] === true || open[6] === true;
  const everyDay = open.every((d) => d === true);
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
  return { lateClose, weekends, everyDay, roundTheClock };
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
  if (c.hours) facts.push(`${HOURS_FACT}${hoursForText(c.hours)}`);
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

/**
 * Источник, который отдаёт только часть фирм города (Nominatim — не больше сотни объектов на
 * тег, 2ГИС — только карточки с телефоном): числа «сколько конкурентов рядом» по такому списку
 * неверны. Кандидаты, созданные до 2026-11-10, записаны с источником «nominatim+osm».
 */
export function isSampleSource(source: string | null | undefined): boolean {
  return /nominatim|2gis|dgis/i.test(source ?? '');
}

/** Досье из базы; битое или старой версии — null (письмо уйдёт с общим заходом). */
export function parseDossier(
  raw: string | null | undefined,
  source?: string | null,
): Dossier | null {
  const dossier = parseDossierJson(raw);
  // Числа соседей из неполного списка не показываем и в заходах не используем.
  return dossier && isSampleSource(source) ? { ...dossier, competitors: null } : dossier;
}

function parseDossierJson(raw: string | null | undefined): Dossier | null {
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
    // Часы пересчитываются из записанного факта карточки: в досье до 2026-11-10 «выходные»
    // ставились по одному упоминанию «сб/вс», даже в «Sa,Su off».
    const hoursFact = d.facts.find(
      (fact): fact is string => typeof fact === 'string' && fact.startsWith(HOURS_FACT),
    );
    const hours = hoursFact ? parseHours(hoursFact.slice(HOURS_FACT.length)) : (d.hours ?? null);
    return { ...(d as Dossier), hours };
  } catch {
    return null;
  }
}
