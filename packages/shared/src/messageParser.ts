// Rule-based parser for messages from Telegram/WhatsApp chats: decides whether
// a message is someone *looking for* special equipment (a job request), as
// opposed to a provider advertising theirs, and pulls out what it can.
// Works offline; the AI extractor (ai-service) is used on top when available.

export interface ParsedEquipmentRequest {
  isRequest: boolean;
  /** 0..1 — how sure the parser is that this is a genuine request. */
  confidence: number;
  categorySlug?: string;
  city?: string;
  phone?: string;
  startDate: Date;
  endDate: Date;
  /** Human-readable reasons, useful for moderation. */
  signals: string[];
}

// JavaScript's \b only knows Latin letters, so "\bнужен\b" never matches.
// Every \b in the patterns below is rewritten into a Cyrillic-aware boundary.
const W = '[a-zа-яё0-9]';
const BOUNDARY = `(?:(?<!${W})(?=${W})|(?<=${W})(?!${W}))`;
function re(pattern: RegExp): RegExp {
  return new RegExp(pattern.source.replace(/\\b/g, BOUNDARY), pattern.flags);
}

const EQUIPMENT: { slug: string; label: string; pattern: RegExp }[] = [
  {
    slug: 'backhoe-loaders',
    label: 'экскаватор-погрузчик',
    pattern: re(
      /экскаватор[\s-]*погрузчик|погрузчик[\s-]*экскаватор|\bjcb\b|джисиби|\b[34]cx\b|case\s?570|\bкейс\b|hidromek|гидромек|terex|терекс|гидромолот/,
    ),
  },
  { slug: 'crane-trucks', label: 'манипулятор', pattern: re(/манипулятор|кму\b|воровайк/) },
  { slug: 'cranes', label: 'автокран', pattern: re(/автокран|\bкран(а|ом|у|ы)?\b|кс-?\d{4,5}/) },
  { slug: 'excavators', label: 'экскаватор', pattern: re(/экскаватор|гусеничн|полноповоротн/) },
  {
    slug: 'loaders',
    label: 'погрузчик',
    pattern: re(
      /фронтальн|фронтальник|погрузчик|амкодор|lonking|sdlg|bobcat|бобкэт|мини[\s-]?погрузчик/,
    ),
  },
  {
    slug: 'dump-trucks',
    label: 'самосвал',
    pattern: re(/самосвал|камаз|шаланд|тонар|howo|хово|shacman|шакман/),
  },
  { slug: 'bulldozers', label: 'бульдозер', pattern: re(/бульдозер|\bдоз[еє]р|шантуй/) },
  { slug: 'tractors', label: 'трактор', pattern: re(/трактор|\bмтз\b|беларус|\bюмз\b/) },
  { slug: 'aerial-platforms', label: 'автовышка', pattern: re(/автовышк|\bвышк[аиу]\b/) },
];

// "I need …" signals.
const REQUEST_PATTERNS: RegExp[] = [
  re(/\bнуж(ен|на|но|ны)\b/),
  re(/\bтребу(ется|ются)\b/),
  re(/\bищ(у|ем)\b/),
  re(/кто (может|сможет|свободен|возьм)/),
  re(/есть (у кого|ли)/),
  re(/\bнадо\b/),
  re(/\bзаказ(ать|ем|ываем)?\b/),
  re(/интересует/),
  re(/подскажите/),
  re(/\bсрочно\b/),
  re(/\bвозьм(у|ем)\b/),
];

// "I offer …" signals — providers advertising their machines.
const OFFER_PATTERNS: RegExp[] = [
  re(/\bсда(ю|м|ем|дим)\b/),
  re(/предлага(ю|ем)/),
  re(/оказ(ываем|ываю)/),
  re(/\bуслуги\b/),
  re(/в наличии/),
  re(/свобод(ен|на|ны|ная|ный)\b.*(завтра|сегодня|с \d)/),
  re(/\bработа(ем|ю)\b/),
  re(/(руб|р|₽)\s*\/\s*(ч|час|смен)/),
  re(/\d+\s*(руб|р|₽)\s*(в|за)\s*(час|смену)/),
  re(/аренда от/),
  re(/\bнедорого\b/),
  re(/\bрассмотр(ю|им)\b.*предложени/),
];

const CITIES: { name: string; pattern: RegExp }[] = [
  { name: 'Набережные Челны', pattern: re(/набережн\w* челн|\bчелн(ы|ах|ов)\b|\bнч\b/) },
  { name: 'Нижнекамск', pattern: re(/нижнекамск/) },
  { name: 'Елабуга', pattern: re(/елабуг/) },
  { name: 'Казань', pattern: re(/казан/) },
  { name: 'Альметьевск', pattern: re(/альметьевск/) },
  { name: 'Менделеевск', pattern: re(/менделеевск/) },
  { name: 'Заинск', pattern: re(/заинск/) },
  { name: 'Мензелинск', pattern: re(/мензелинск/) },
  { name: 'Тукаевский район', pattern: re(/тукаев/) },
  { name: 'Бугульма', pattern: re(/бугульм/) },
  { name: 'Чистополь', pattern: re(/чистопол/) },
  { name: 'Лениногорск', pattern: re(/лениногорск/) },
  { name: 'Азнакаево', pattern: re(/азнака/) },
  { name: 'Агрыз', pattern: re(/агрыз/) },
];

const MONTHS: Record<string, number> = {
  янв: 0,
  фев: 1,
  мар: 2,
  апр: 3,
  мая: 4,
  май: 4,
  июн: 5,
  июл: 6,
  авг: 7,
  сен: 8,
  окт: 9,
  ноя: 10,
  дек: 11,
};

function normalize(text: string) {
  return text.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}

/** Finds a Russian phone number and returns it as +7XXXXXXXXXX. */
export function extractPhone(text: string): string | undefined {
  const match = text.match(/(?:\+7|8|7)[\s\-(]*\d{3}[\s\-)]*\d{3}[\s-]*\d{2}[\s-]*\d{2}/);
  if (!match) return undefined;
  const digits = match[0].replace(/\D/g, '');
  return digits.length === 11 ? `+7${digits.slice(1)}` : undefined;
}

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function extractDates(text: string, now: Date): { start: Date; end: Date; found: boolean } {
  const today = startOfDay(now);
  let start: Date | undefined;
  let end: Date | undefined;

  if (/послезавтра/.test(text)) start = addDays(today, 2);
  else if (/завтра/.test(text)) start = addDays(today, 1);
  else if (/сегодня|сейчас|срочно/.test(text)) start = today;

  // "с 5 по 10 октября", "с 5 октября по 10 октября", "5-10 октября"
  const range = text.match(
    /(?:с\s*)?(\d{1,2})(?:\s*([а-я]{3})[а-я]*)?\s*(?:по|-|–|до)\s*(\d{1,2})\s*([а-я]{3})[а-я]*/,
  );
  if (range) {
    const endMonth = MONTHS[range[4] ?? ''];
    const startMonth = MONTHS[range[2] ?? ''] ?? endMonth;
    if (endMonth !== undefined && startMonth !== undefined) {
      start = new Date(today.getFullYear(), startMonth, Number(range[1]));
      end = new Date(today.getFullYear(), endMonth, Number(range[3]));
    }
  } else {
    // "на 12 октября", "15 окт"
    const single = text.match(/(\d{1,2})\s*([а-я]{3})[а-я]*/);
    const month = single ? MONTHS[single[2] ?? ''] : undefined;
    if (single && month !== undefined) {
      start = new Date(today.getFullYear(), month, Number(single[1]));
    }
  }

  // A date in a month that already passed means next year.
  if (start && start < addDays(today, -31)) {
    start = new Date(start.getFullYear() + 1, start.getMonth(), start.getDate());
    if (end) end = new Date(end.getFullYear() + 1, end.getMonth(), end.getDate());
  }

  // "на 3 дня", "на 2 смены", "на неделю"
  const duration = text.match(/на\s*(\d{1,2})\s*(дн|день|смен|сут)/);
  const days = duration ? Number(duration[1]) : /на недел/.test(text) ? 7 : 1;

  const found = Boolean(start);
  const s = start ?? addDays(today, 1);
  const e = end && end >= s ? end : addDays(s, Math.max(1, days));
  return { start: s, end: e, found };
}

export function parseEquipmentRequest(raw: string, now: Date = new Date()): ParsedEquipmentRequest {
  const text = normalize(raw);
  const signals: string[] = [];

  const equipment = EQUIPMENT.find((item) => item.pattern.test(text));
  if (equipment) signals.push(`техника: ${equipment.label}`);

  const requestHits = REQUEST_PATTERNS.filter((p) => p.test(text)).length;
  const offerHits = OFFER_PATTERNS.filter((p) => p.test(text)).length;
  if (requestHits) signals.push(`признаки запроса: ${requestHits}`);
  if (offerHits) signals.push(`признаки рекламы: ${offerHits}`);

  const city = CITIES.find((c) => c.pattern.test(text))?.name;
  if (city) signals.push(`город: ${city}`);
  const phone = extractPhone(raw);
  const dates = extractDates(text, now);
  if (dates.found) signals.push('указаны сроки');

  let confidence = 0;
  if (equipment && requestHits > 0) {
    confidence = 0.45 + Math.min(requestHits, 3) * 0.1;
    if (city) confidence += 0.1;
    if (dates.found) confidence += 0.1;
    if (phone) confidence += 0.05;
    confidence -= offerHits * 0.25;
  }
  confidence = Math.max(0, Math.min(1, Number(confidence.toFixed(2))));

  return {
    isRequest: confidence >= 0.5 && raw.trim().length >= 12,
    confidence,
    categorySlug: equipment?.slug,
    city,
    phone,
    startDate: dates.start,
    endDate: dates.end,
    signals,
  };
}

/** Normalized text fingerprint for spotting the same request posted in several chats. */
export function requestFingerprint(raw: string): string {
  return normalize(raw)
    .replace(/(?:\+7|8|7)[\s\-(]*\d{3}[\s\-)]*\d{3}[\s-]*\d{2}[\s-]*\d{2}/g, '')
    .replace(/[^a-zа-я0-9]/g, '')
    .slice(0, 300);
}
