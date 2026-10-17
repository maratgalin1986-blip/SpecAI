// The public face of an order outside the site: the link preview image
// (app/orders/[id]/opengraph-image.tsx), the «Поделиться заявкой» text and the
// daily post in the platform's Telegram channel (lib/channelDigest.ts).
//
// Only three facts leave the server: the kind of machine, the city and the
// day the work starts — the same as the public board (/orders). Never the
// customer's name, phone, address, the description or any bid price.
// Pure functions, safe for client components and tests.
import { publicCity } from './activity';
import { withShareUtm } from './share';

export interface OrderCardInput {
  categoryName?: string | null;
  location?: {
    city?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  } | null;
  desiredStartDate: Date;
}

export interface OrderCardText {
  /** «Нужен автокран», or «Нужна спецтехника» when the kind has no short form. */
  need: string;
  /** The category as a second line when `need` is the generic phrase, else null. */
  category: string | null;
  /** «Елабуга», or null when the place is unknown or not a plain city name. */
  city: string | null;
  /** «20 октября» (the Moscow day). */
  date: string;
  /** «Нужен автокран · Елабуга · 20 октября». */
  line: string;
}

export const GENERIC_NEED = 'Нужна спецтехника';

// Category names are plural («Автокраны»); a shared card reads better as one
// machine. The first prefix that matches the lower-cased name wins, so the
// longer names come first.
const NEED_BY_PREFIX: [string, string][] = [
  ['экскаваторы-погрузчики', 'Нужен экскаватор-погрузчик'],
  ['мини-экскаваторы', 'Нужен мини-экскаватор'],
  ['экскаваторы', 'Нужен экскаватор'],
  ['бульдозеры', 'Нужен бульдозер'],
  ['грейдеры', 'Нужен грейдер'],
  ['траншеекопатели', 'Нужен траншеекопатель'],
  ['автокраны', 'Нужен автокран'],
  ['краны-манипуляторы', 'Нужен кран-манипулятор'],
  ['автовышки', 'Нужна автовышка'],
  ['башенные краны', 'Нужен башенный кран'],
  ['гусеничные краны', 'Нужен гусеничный кран'],
  ['телескопические погрузчики', 'Нужен телескопический погрузчик'],
  ['фронтальные погрузчики', 'Нужен фронтальный погрузчик'],
  ['мини-погрузчики', 'Нужен мини-погрузчик'],
  ['вилочные погрузчики', 'Нужен вилочный погрузчик'],
  ['тракторы', 'Нужен трактор'],
  ['самосвалы', 'Нужен самосвал'],
  ['тралы', 'Нужен трал'],
  ['эвакуаторы', 'Нужен эвакуатор'],
  ['катки', 'Нужен каток'],
  ['автобетоносмесители', 'Нужен бетоносмеситель'],
  ['автобетононасосы', 'Нужен бетононасос'],
  ['ямобуры', 'Нужен ямобур'],
  ['илососы', 'Нужен илосос'],
  ['водовозы', 'Нужен водовоз'],
  ['снегоуборочная техника', 'Нужна снегоуборочная техника'],
  ['дизельные генераторы', 'Нужен дизельный генератор'],
  ['компрессоры', 'Нужен компрессор'],
];

/** «Нужен автокран» for a known category, else the generic phrase. */
export function orderNeed(categoryName: string | null | undefined): string {
  const name = categoryName?.trim().toLowerCase().replace(/ё/g, 'е') ?? '';
  if (!name) return GENERIC_NEED;
  const found = NEED_BY_PREFIX.find(([prefix]) => name.startsWith(prefix.replace(/ё/g, 'е')));
  return found ? found[1] : GENERIC_NEED;
}

// A street, a house, a village or a district never leaves the server: the
// card names a city or nothing. Location.city is not typed by the customer:
// the order routes fill it from the geocoder or a known city in the address
// (api/orders, api/orders/guest), so this is a second line of defence.
const NOT_A_CITY =
  /(?:^|[\s.])(?:ул|улица|пр|пр-т|проспект|пер|переулок|шоссе|бульвар|б-р|наб|набережная|дом|д|кв|корп|стр|мкр|микрорайон|район|р-н|снт|днт|тсн|деревня|дер|село|с|пос|посёлок|поселок|пгт|рп|участок|км)(?=[\s.]|$)/i;

/**
 * A plain city name from a free-text place: «г. Елабуга» → «Елабуга»; the
 * first part before a comma; null for streets, houses, villages or anything
 * with digits.
 */
export function cleanCityName(raw: string | null | undefined): string | null {
  const first = (raw ?? '').split(/[,;(]/)[0] ?? '';
  const name = first
    .replace(/^\s*(?:г|гор|город)(?:\.\s*|\s+)/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (name.length < 2 || name.length > 40) return null;
  if (!/^[А-ЯЁA-Z][А-ЯЁа-яёA-Za-z -]*$/.test(name)) return null;
  if (NOT_A_CITY.test(name.toLowerCase())) return null;
  return name;
}

/** The city for a card: a known city of the place, else a clean city name. */
export function orderCardCity(location: OrderCardInput['location']): string | null {
  return publicCity(location) ?? cleanCityName(location?.city);
}

/** «20 октября» for the Moscow day of an instant. */
export function orderCardDate(date: Date): string {
  return date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/Moscow',
  });
}

export function orderCardText(input: OrderCardInput): OrderCardText {
  const need = orderNeed(input.categoryName);
  const category =
    need === GENERIC_NEED && input.categoryName?.trim() ? input.categoryName.trim() : null;
  const city = orderCardCity(input.location);
  const date = orderCardDate(input.desiredStartDate);
  const head = category ? `${need}: ${lowerFirst(category)}` : need;
  return { need, category, city, date, line: [head, city, date].filter(Boolean).join(' · ') };
}

function lowerFirst(text: string): string {
  // An abbreviation («КМУ») keeps its case.
  if (/^\p{Lu}{2}/u.test(text)) return text;
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/** The order page with share tags: utm_source=<source>&utm_medium=<medium>. */
export function orderShareUrl(base: string, orderId: string, source = 'share', medium = 'share') {
  return withShareUtm(`${base}/orders/${encodeURIComponent(orderId)}`, source, medium);
}

/** «Помогите найти технику: нужен автокран · Елабуга · 20 октября». */
export function orderShareText(input: OrderCardInput): string {
  return `Помогите найти технику: ${lowerFirst(orderCardText(input).line)}`;
}

export interface OrderOgText {
  kicker: string;
  /** The big line: «Нужен автокран». */
  title: string;
  /** The category under a generic title, else a short pitch or null. */
  subtitle: string | null;
  /** «Елабуга · 20 октября», or null for the generic card. */
  details: string | null;
  /** «Ждёт предложений» and the like, or null for the generic card. */
  status: string | null;
  brand: string;
}

const OG_STATUS: Record<string, string> = {
  OPEN: 'Ждёт предложений',
  MATCHED: 'Исполнитель выбран',
  CANCELLED: 'Заявка снята',
};

/**
 * What the link preview of /orders/<id> shows. An order that is not public
 * (missing, under review) gets the generic card, so the image never confirms
 * that a hidden order exists.
 */
export function orderOgText(
  order: (OrderCardInput & { status: string }) | null,
  brand: string,
): OrderOgText {
  const kicker = 'Заявка на спецтехнику';
  const status = order ? OG_STATUS[order.status] : undefined;
  if (!order || !status) {
    return {
      kicker,
      title: 'Нужна спецтехника?',
      subtitle: 'Одна заявка — цены от исполнителей рядом',
      details: null,
      status: null,
      brand,
    };
  }
  const card = orderCardText(order);
  return {
    kicker,
    title: card.need,
    subtitle: card.category,
    details: [card.city, card.date].filter(Boolean).join(' · '),
    status,
    brand,
  };
}
