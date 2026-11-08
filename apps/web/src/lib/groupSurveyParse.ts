// Reading one reply to the price survey in the owner's group (lib/groupPriceSurvey.ts):
// «JCB 3CX, Набережные Челны, 3 000 ₽/ч» → the machine as written, its type,
// the city and the price. A price per shift («25 тыс/смена») is kept apart
// and never mixed into the hourly index. Pure, unit-tested.

import { detectCategorySlug, findCityInText } from '@specai/shared';
import { priceBoundsFor } from './priceReports';

/**
 * Word edges in Russian or Latin. JavaScript's `\b` knows only ASCII letters,
 * so «\bагп\b» would never match: the edges are spelled out. `word` — a whole
 * word (short codes: «КМУ», «3CX»); `stem` — the start of a word, so case
 * forms and model suffixes match («ивановца», «шакмана», «QY25K»).
 */
const EDGE = '[a-zа-яё0-9]';
const word = (body: string) => new RegExp(`(?<!${EDGE})(?:${body})(?!${EDGE})`, 'i');
const stem = (body: string) => new RegExp(`(?<!${EDGE})(?:${body})`, 'i');

/** Makes and models people write instead of the type («JCB 3CX» is a backhoe loader). */
const SYNONYMS: [RegExp, string][] = [
  [
    word('3cx|4cx|5cx|wb9[37]|102b|mst\\s*5\\d\\d|bl7[01]|terex\\s*8\\d0|case\\s*5[78]0'),
    'backhoe-loaders',
  ],
  [word('кму'), 'crane-trucks'],
  [stem('fassi|palfinger|kanglim|канглим|soosan|hiab|dongyang'), 'crane-trucks'],
  [stem('ивановц|ивановец|галичанин|клинц|челябинц|челябинец|qy\\s*\\d{2}|zoomlion'), 'cranes'],
  [stem('шакман|shacman|howo|хово|sitrak|ситрак'), 'dump-trucks'],
  [word('агп'), 'aerial-platforms'],
  [word('(?:zx|ec|pc)\\s?\\d{3}[a-z]{0,3}|r\\s?\\d{3}lc'), 'excavators'],
  [stem('sdlg|lonking|lw\\s?\\d{3}'), 'loaders'],
  [stem('shantui|т-?130|т-?170'), 'bulldozers'],
];

export function surveyCategory(text: string): string | null {
  const found = detectCategorySlug(text);
  if (found) return found;
  for (const [pattern, slug] of SYNONYMS) if (pattern.test(text)) return slug;
  return null;
}

interface Candidate {
  value: number;
  unit: 'hour' | 'shift' | null;
  index: number;
  yearLike: boolean;
}

const NUMBER = /\d{1,3}(?:[ \u00a0]\d{3})+(?!\d)|\d+(?:[.,]\d+)?/g;
const LETTER = /[a-zа-яё]/i;

function candidates(text: string): Candidate[] {
  const found: Candidate[] = [];
  for (const match of text.matchAll(NUMBER)) {
    const index = match.index ?? 0;
    // Part of a model name («ZX200», «3CX», «Т-130»).
    if (index > 0 && LETTER.test(text[index - 1]!)) continue;
    if (index > 0 && text[index - 1] === '-' && index > 1 && LETTER.test(text[index - 2]!))
      continue;
    let value = Number(match[0].replace(/[ \u00a0]/g, '').replace(',', '.'));
    if (!Number.isFinite(value)) continue;
    let rest = text.slice(index + match[0].length, index + match[0].length + 30);
    const thousand = /^\s*(?:тыс\.?|т\.\s?р\.?|тр(?![а-яё])|к(?![а-яё])|k(?![a-z]))/i.exec(rest);
    if (thousand) {
      value *= 1000;
      rest = rest.slice(thousand[0].length);
    } else if (/^[a-zа-яё]/i.test(rest) && !/^(?:р|руб|ч|час)/i.test(rest)) {
      // Glued to letters that are no price unit: «3CX», «25т».
      continue;
    } else if (/^\s*(?:т|тн|тонн[а-яё]*)(?![а-яё])/i.test(rest)) {
      // Tonnage: «самосвал 25 т».
      continue;
    }
    rest = rest.replace(/^\s*(?:₽|руб(?:лей|ля|\.)?|р\.?(?![а-яё]))/i, '');
    const unit = /^\s*(?:\/|в|за)?\s*(?:час|ч)(?![а-яё])/i.test(rest)
      ? 'hour'
      : /^\s*(?:\/|в|за)?\s*(?:смен|день|сутк|8\s*ч)/i.test(rest)
        ? 'shift'
        : null;
    const yearLike =
      !thousand && unit === null && Number.isInteger(value) && value >= 1980 && value <= 2035;
    found.push({ value: Math.round(value), unit, index, yearLike });
  }
  return found;
}

/** A number without «/ч» above this is not taken as an hourly price. */
export const UNITLESS_MAX = 15_000;

/**
 * The price of a reply: per hour (with the operator) and/or per shift. A
 * number without a unit counts as hourly only within the category's sane
 * bounds; a year («2015») only when it is the only number.
 */
export function surveyPrice(
  text: string,
  categorySlug: string | null = null,
): { hourly: number | null; shift: number | null } {
  const [min, max] = priceBoundsFor(categorySlug ?? '');
  const all = candidates(text);
  const hourly = all.find((item) => item.unit === 'hour' && item.value >= min && item.value <= max);
  const shift = all.find(
    (item) => item.unit === 'shift' && item.value >= 1000 && item.value <= 500_000,
  );
  if (hourly || shift) return { hourly: hourly?.value ?? null, shift: shift?.value ?? null };
  // Without a unit a big number is more likely a shift than an hour: unknown.
  const plainMax = Math.min(max, UNITLESS_MAX);
  const plain = all.filter(
    (item) => item.unit === null && item.value >= min && item.value <= plainMax,
  );
  const notYear = plain.filter((item) => !item.yearLike);
  const pick = (notYear.length ? notYear : plain).at(-1);
  return { hourly: pick?.value ?? null, shift: null };
}

export interface SurveyAnswerParsed {
  categorySlug: string | null;
  machineName: string | null;
  city: string | null;
  region: string | null;
  hourly: number | null;
  shift: number | null;
}

/** The whole reply: the first part as the machine («JCB 3CX»), the type, the city, the price. */
export function parseSurveyAnswer(raw: string): SurveyAnswerParsed {
  const text = raw.replace(/\s+/g, ' ').trim().slice(0, 500);
  const categorySlug = surveyCategory(text);
  const found = findCityInText(text, { address: true });
  const price = surveyPrice(text, categorySlug);
  // The machine as written: the first part of the reply, up to the city or a
  // price with its unit when they share that part («JCB 3CX Казань 3000/ч»).
  let machine = text.split(/[,;]/)[0] ?? '';
  if (found && found.index > 0 && found.index < machine.length) {
    machine = machine.slice(0, found.index);
  }
  const priced =
    /\d[\d \u00a0]*(?:[.,]\d+)?\s*(?:тыс\.?|т\.\s?р\.?|к)?\s*(?:₽|руб\.?|р\.?)?\s*(?:\/|в|за)?\s*(?:час|ч|смен\w*)(?![а-яё])/i.exec(
      machine,
    );
  if (priced && priced.index > 0) machine = machine.slice(0, priced.index);
  machine = machine
    .trim()
    .replace(/\s+(?:в|во|из|г\.?)$/i, '')
    .replace(/[\s:–—-]+$/, '')
    .trim()
    .slice(0, 100);
  return {
    categorySlug,
    machineName: machine.length >= 2 ? machine : null,
    city: found?.city.name ?? null,
    region: found?.city.region ?? null,
    hourly: price.hourly,
    shift: price.shift,
  };
}
