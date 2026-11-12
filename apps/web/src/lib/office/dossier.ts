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

// ── Разбор часов работы ─────────────────────────────────────────────────────────────────────
// По часам письмо утверждает факты о фирме («работаете в выходные», «до 21:00», «круглосуточно»),
// поэтому разбор строгий: строка должна целиком состоять из понятных частей — дни, интервалы
// времени, «off/выходной», «24/7». Любое незнакомое слово (месяцы «May-Sep», праздники «PH»,
// «по записи», «кроме», скобки, комментарии) — и по часам не утверждается ничего. Ревью
// 10.11.2026: «выходные» ставились по одному упоминанию «сб/вс», даже в «Sa,Su off».

/** Дни недели: 0 — понедельник … 6 — воскресенье. */
const DAY_INDEX: Record<string, number> = {
  mo: 0,
  tu: 1,
  we: 2,
  th: 3,
  fr: 4,
  sa: 5,
  su: 6,
  пн: 0,
  вт: 1,
  ср: 2,
  чт: 3,
  пт: 4,
  сб: 5,
  вс: 6,
};

type HoursToken =
  | { kind: 'day'; day: number }
  | { kind: 'time'; minutes: number }
  | { kind: 'dash' | 'comma' | 'rule' | 'off' | 'allDay' | 'daily' };

/** Слова и знаки часов работы по порядку; null — встретилось что-то незнакомое. */
function hoursTokens(text: string): HoursToken[] | null {
  const tokens: HoursToken[] = [];
  let rest = text.toLowerCase().replace(/ё/g, 'е').replace(/[–—−]/g, '-');
  const take = (re: RegExp): RegExpExecArray | null => {
    const match = re.exec(rest);
    if (match) rest = rest.slice(match[0].length);
    return match;
  };
  // Слово кончается там, где дальше не буква: «вс» не находится во «все», «sa» — в «sale».
  const END = '(?![a-zа-я])';
  while (rest.length > 0) {
    if (take(/^[\s:]+/)) continue;
    if (take(/^[;\n]/)) tokens.push({ kind: 'rule' });
    else if (take(/^,/)) tokens.push({ kind: 'comma' });
    else if (take(/^-/)) tokens.push({ kind: 'dash' });
    else if (take(new RegExp(`^(24\\s*\\/\\s*7|круглосуточно${END})`)))
      tokens.push({ kind: 'allDay' });
    else if (take(new RegExp(`^(off|closed|выходной|выходные|закрыто)${END}`)))
      tokens.push({ kind: 'off' });
    else if (take(new RegExp(`^(ежедневно|без\\s+выходных)${END}`))) tokens.push({ kind: 'daily' });
    else {
      const day = take(new RegExp(`^(mo|tu|we|th|fr|sa|su|пн|вт|ср|чт|пт|сб|вс)${END}\\.?`));
      if (day) {
        tokens.push({ kind: 'day', day: DAY_INDEX[day[1]!]! });
        continue;
      }
      const time = take(/^(\d{1,2})(?:[:.](\d{2}))?(?![\d:.])/);
      if (!time) return null;
      const minutes = Number(time[1]) * 60 + Number(time[2] ?? 0);
      if (minutes > 24 * 60 || Number(time[2] ?? 0) > 59) return null;
      tokens.push({ kind: 'time', minutes });
    }
  }
  return tokens;
}

/** Что сказано о дне: закрыт, открыт круглые сутки или интервалы «с — до» в минутах. */
type DayHours = 'closed' | 'allDay' | [number, number][];

interface HoursSchedule {
  /** По дням недели; undefined — о дне ничего не сказано. */
  days: (DayHours | undefined)[];
  /** Интервалы правил без дней («09:00-18:00»): дни не названы, о них ничего не утверждаем. */
  dayless: [number, number][];
}

/**
 * Расписание из строки часов или null, если она не разобрана целиком. Правила — через «;»,
 * внутри правила группы «дни + что в эти дни»: «Mo-Fr 09:00-18:00, Sa 10:00-14:00, Su off»;
 * позднее правило отменяет раннее для тех же дней («Mo-Su 09:00-18:00; Su off»).
 */
function parseSchedule(text: string): HoursSchedule | null {
  const tokens = hoursTokens(text);
  if (!tokens) return null;
  const schedule: HoursSchedule = {
    days: Array.from({ length: 7 }, () => undefined),
    dayless: [],
  };
  let days: number[] = [];
  let named = false;
  let spec: DayHours | null = null;
  // Группа «дни + что в эти дни» закрывается: без «что» она ничего не значит — строка не разобрана.
  const close = (): boolean => {
    if (!named && spec === null) return true;
    if (spec === null) return false;
    if (!named) {
      // «24/7» без дней — про все дни; интервалы без дней дней не называют.
      if (spec === 'closed') return false;
      if (spec === 'allDay') schedule.days.fill('allDay');
      else schedule.dayless.push(...spec);
    } else {
      for (const d of days) schedule.days[d] = spec;
    }
    days = [];
    named = false;
    spec = null;
    return true;
  };
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i]!;
    const next = tokens[i + 1];
    if (token.kind === 'rule') {
      if (!close()) return null;
    } else if (token.kind === 'comma') {
      // Запятая — между днями («Sa,Su»), между интервалами («08:00-12:00,13:00-17:30») или
      // между группами («…18:00, Sa 10:00-14:00»): что именно, видно по следующему слову.
      if (!next || next.kind === 'comma' || next.kind === 'rule' || next.kind === 'dash')
        return null;
    } else if (token.kind === 'daily') {
      if (spec !== null && !close()) return null;
      named = true;
      days = [0, 1, 2, 3, 4, 5, 6];
    } else if (token.kind === 'day') {
      if (spec !== null && !close()) return null;
      named = true;
      const to = tokens[i + 2];
      if (next?.kind === 'dash' && to?.kind === 'day') {
        for (let d = token.day; ; d = (d + 1) % 7) {
          days.push(d);
          if (d === to.day) break;
        }
        i += 2;
      } else {
        days.push(token.day);
      }
    } else if (token.kind === 'off' || token.kind === 'allDay') {
      if (spec !== null) return null;
      spec = token.kind === 'off' ? 'closed' : 'allDay';
    } else if (token.kind === 'time') {
      const to = tokens[i + 2];
      if (next?.kind !== 'dash' || to?.kind !== 'time') return null;
      if (spec === null) spec = [];
      if (!Array.isArray(spec)) return null;
      spec.push([token.minutes, to.minutes]);
      i += 2;
    } else {
      // Тире само по себе допустимо только перед «выходной»: «Сб, Вс — выходной».
      if (next?.kind !== 'off') return null;
    }
  }
  return close() ? schedule : null;
}

const WHOLE_DAY: [number, number] = [0, 24 * 60];

function isOpen(day: DayHours | undefined): boolean {
  return day === 'allDay' || (Array.isArray(day) && day.length > 0);
}

function isAllDay(day: DayHours | undefined): boolean {
  return (
    day === 'allDay' ||
    (Array.isArray(day) && day.some(([from, to]) => from === WHOLE_DAY[0] && to === WHOLE_DAY[1]))
  );
}

/**
 * Часы из карточки: формат OSM («Mo-Fr 09:00-21:00; Sa 10:00-16:00», «24/7») и 2ГИС
 * («Пн–Пт 09:00–20:00»). Строка, не разобранная целиком, фактов не даёт (всё false/null).
 * Позднее закрытие — самое позднее время «до» после 20:00 (24:00 и ночные интервалы не
 * считаем «поздним» — это круглосуточно или ночная смена). «Работает в выходные» — суббота
 * или воскресенье названы рабочими; «круглосуточно» — все семь дней открыты круглые сутки.
 */
export function parseHours(raw: string | null | undefined): DossierHours | null {
  const text = (raw ?? '').trim();
  if (!text) return null;
  const schedule = parseSchedule(text);
  if (!schedule) return { lateClose: null, weekends: false, everyDay: false, roundTheClock: false };
  const { days } = schedule;
  let latest = -1;
  const intervals = [
    ...schedule.dayless,
    ...days.flatMap((day) => (Array.isArray(day) ? day : [])),
  ];
  for (const [from, to] of intervals) {
    if (to <= from || to >= 24 * 60) continue;
    latest = Math.max(latest, to);
  }
  const lateClose =
    latest > 20 * 60
      ? `${String(Math.floor(latest / 60)).padStart(2, '0')}:${String(latest % 60).padStart(2, '0')}`
      : null;
  return {
    lateClose,
    weekends: isOpen(days[5]) || isOpen(days[6]),
    everyDay: days.every(isOpen),
    roundTheClock: days.every(isAllDay),
  };
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

  // Фирмы с сайтом бывают у проекта площадки (run.ts → websiteIsFine): им этот пробел не пишем.
  const gaps = c.website ? [] : ['нет своего сайта'];
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
