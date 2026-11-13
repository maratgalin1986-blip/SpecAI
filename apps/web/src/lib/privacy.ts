// Personal data rules (152-ФЗ) shared by the order pages and the orders API.
// Pure functions only, so they are unit-tested without a database.

export const HIDDEN_CONTACT = '[контакт скрыт]';

const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu;
const MESSENGER_LINK =
  /(?:https?:\/\/)?(?:www\.)?(?:t\.me|telegram\.me|wa\.me|api\.whatsapp\.com|vk\.com|ok\.ru)\/[^\s,;)]+/giu;
const USERNAME = /(^|[^\p{L}\p{N}_@])@[A-Za-z0-9_]{3,32}(?![A-Za-z0-9_])/gu;
// Digits with any separator people use to dodge the filter: spaces, dashes
// (also en/em), brackets, dots, middle dots, underscores, slashes, commas,
// pipes, asterisks. A candidate never starts inside a word («AUDIT3»).
const PHONE_LIKE = /(?<![\p{L}\d])\+?\d[\d\s().·_/,|*\u2013\u2014-]{5,}\d/gu;
// Spaces, dashes and brackets only: the usual ways to write a phone.
const CLASSIC_SEPARATORS = /^\+?[\d\s()-]+$/;
// A full date such as 01.06.2028; split out of a candidate so that a phone
// written next to a date is still hidden and the date stays readable.
const FULL_DATE_SPLIT = /((?<!\d)\d{1,2}\.\d{1,2}\.(?:19|20)\d{2}(?!\d))/;

const LIST_SPLIT = /([,|*]\s+)/;

function looksLikePhone(candidate: string): boolean {
  const digits = candidate.replace(/\D/g, '');
  if (CLASSIC_SEPARATORS.test(candidate.trim())) {
    if (digits.length >= 10 && digits.length <= 15) return true;
    // Local numbers written like 242-80-88.
    return digits.length === 7 && /^\d{3}-\d{2}-\d{2}$/.test(candidate.trim());
  }
  // Dots, commas, slashes and the like also write coordinates, sums and date
  // ranges: only a Russian number counts here (8/7 + 10 digits, or 9xx + 7).
  return (
    (digits.length === 11 && /^[78]/.test(digits)) || (digits.length === 10 && digits[0] === '9')
  );
}

function maskPhones(text: string): string {
  return text.replace(PHONE_LIKE, (match) => {
    if (FULL_DATE_SPLIT.test(match)) {
      // Odd parts are the dates; mask the phones around them.
      return match
        .split(FULL_DATE_SPLIT)
        .map((part, index) => (index % 2 === 1 ? part : maskPhones(part)))
        .join('');
    }
    // «, » / «| » / «* » between numbers is a list, not one long number.
    if (LIST_SPLIT.test(match)) {
      return match
        .split(LIST_SPLIT)
        .map((part, index) => (index % 2 === 1 ? part : maskPhones(part)))
        .join('');
    }
    if (!looksLikePhone(match)) return match;
    // Keep the space that the pattern may have swallowed at the edges.
    const lead = /^\s/.test(match) ? ' ' : '';
    const tail = /\s$/.test(match) ? ' ' : '';
    return `${lead}${HIDDEN_CONTACT}${tail}`;
  });
}

/**
 * Hides phone numbers, e-mails, @usernames and messenger links in free text,
 * e.g. the description of an order imported from a chat. The full text stays
 * in Order.rawText, which only admins and verified providers see.
 */
export function maskContacts(text: string): string {
  return maskPhones(
    text
      .replace(EMAIL, HIDDEN_CONTACT)
      .replace(MESSENGER_LINK, HIDDEN_CONTACT)
      .replace(USERNAME, (_match, prefix: string) => `${prefix}${HIDDEN_CONTACT}`),
  );
}

/**
 * Chat history as it goes to the external AI provider: every message with
 * phones, e-mails and messenger handles hidden. Roles and order are kept.
 */
export function maskMessagesForAi<T extends { content: string }>(messages: readonly T[]): T[] {
  return messages.map((message) => ({ ...message, content: maskContacts(message.content) }));
}

export const HIDDEN_LINK = '[ссылка скрыта]';

// Any web link: with a scheme, starting with www., or a bare domain with a
// common zone (site.ru/page). Runs after maskContacts, so e-mails are gone.
// Trailing punctuation after a link stays in the text.
const WEB_LINK =
  /(?:https?:\/\/|www\.)[^\s<>"']*[^\s<>"'.,;:!?)]|(?<![\p{L}\p{N}@-])[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.(?:ru|рф|com|net|org|su|info|biz|pro|site|online|store|shop|me|io|ua|by|kz)(?![\p{L}\p{N}])(?:\/(?:[^\s<>"']*[^\s<>"'.,;:!?)])?)?/giu;

/**
 * Text written by users for other users (comments): contacts and any web
 * links are hidden, so the platform is not used to lure clients away or to
 * post spam.
 */
export function maskContactsAndLinks(text: string): string {
  return maskContacts(text).replace(WEB_LINK, HIDDEN_LINK);
}

export const HIDDEN_ADDRESS = '[адрес — после подтверждения брони]';

// ---------------------------------------------------------------------------
// Addresses in the free text of an order. The work site lives in Location and
// is shown by lib/orderLocationPrivacy.ts; the same rule covers a street and a
// house typed into the task text. The city stays readable. Each pattern is
// built from strings so that the street word matches in any letter case while
// the street name keeps its capital letter.
// ---------------------------------------------------------------------------

/** «ул» → «[уУ][лЛ]»: one word in any letter case, without the `i` flag. */
function anyCase(source: string): string {
  return source.replace(/[а-яё]/g, (letter) => `[${letter}${letter.toUpperCase()}]`);
}

const NOT_IN_WORD = '(?<![\\p{L}\\d])';
const WORD_END = '(?![\\p{L}])';

// Street words that are never anything else («ул.», «пр-т», «мкр»).
const STREET_SHORT = anyCase(
  '(?:ул\\.?|пр-т|пр-кт|просп\\.?|пр\\.|пер\\.|б-р|бул\\.|наб\\.|ш\\.|пл\\.|пр-д|туп\\.|мкрн?\\.?|м-н|кв-л|снт|днт|жк)',
);
// Full words: also used in plain speech («на улице холодно»), so they need a
// name with a capital letter or a house number next to them.
const STREET_WORD = anyCase(
  '(?:улиц(?:а|ы|е|у|ей)|проспект(?:а|е|у|ом)?|переул(?:ок|ка|ке|ку)|шоссе|бульвар(?:а|е|у|ом)?|' +
    'набережн(?:ая|ой|ую)|площад(?:ь|и)|проезд(?:а|е|у)?|тракт(?:а|е|у)?|тупик(?:а|е)?|' +
    'алле(?:я|е|и|ю)|микрорайон(?:а|е|у)?|жилой\\s+комплекс|жилом\\s+комплексе)',
);
const STREET_ANY = `(?:${STREET_SHORT}|${STREET_WORD})${WORD_END}`;
// The words after which «Name + word» is an address even without a house
// («Московский проспект», «Сармановский тракт»).
const AVENUE_WORD = anyCase(
  '(?:проспект(?:а|е|у|ом)?|пр-т|пр-кт|шоссе|бульвар(?:а|е|у|ом)?|б-р|тракт(?:а|е|у)?)',
);

const CAPITAL_WORD = '[А-ЯЁA-Z][\\p{L}\\d-]*';
// «40 лет Победы», «8 Марта», «1-я Парковая».
const NUMBER_NAME = '\\d{1,2}(?:-[а-яё]{1,2})?\\s+(?:лет\\s+)?[А-ЯЁ][\\p{L}-]*';
// «проезд КамАЗа свободен» names a machine, not a street.
const NOT_A_MACHINE =
  '(?!(?:КамАЗ|КАМАЗ|Камаз|МАЗ|ЗИЛ|ГАЗ|Газел|УАЗ|Урал|JCB|CAT|Hitachi|Komatsu|Volvo|Bobcat)[\\p{L}]*(?![\\p{L}\\d]))';
const STREET_NAME =
  `(?:${anyCase('им')}\\.?\\s*)?[«"]?${NOT_A_MACHINE}(?:${NUMBER_NAME}|${CAPITAL_WORD})` +
  `(?:\\s+${CAPITAL_WORD}){0,2}[»"]?`;

// Volumes, tonnage, time and money are not house numbers: «25 т», «2 смены».
const UNIT =
  '(?:т|тн|тонн[\\p{L}]*|ч|час[\\p{L}]*|смен[\\p{L}]*|м|м2|м3|м²|м³|мм|см|км|кг|га|л|' +
  'метр[\\p{L}]*|куб[\\p{L}]*|кв\\.?\\s*м[\\p{L}]*|квадрат[\\p{L}]*|сот[\\p{L}]*|шт|штук[\\p{L}]*|' +
  'р|руб[\\p{L}]*|тыс[\\p{L}]*|дн[\\p{L}]*|день|сут[\\p{L}]*|мин[\\p{L}]*|недел[\\p{L}]*|' +
  'лет|год[\\p{L}]*|раз[\\p{L}]*|рейс[\\p{L}]*|маш[\\p{L}]*|человек[\\p{L}]*|этаж[\\p{L}]*|' +
  'комнат[\\p{L}]*|градус[\\p{L}]*)';
// «дом 6 на 8» is a size; «Мира 15 на 2 смены» is a house and a duration.
const TIME_UNIT = '(?:смен|дн|день|час|сут|недел|рейс)';
const NOT_A_MEASURE =
  `(?!\\d)(?!\\s*[.,]\\d)(?!\\s*(?:${UNIT})(?![\\p{L}\\d]))(?!\\s*[₽%°])` +
  `(?!\\s*(?:на\\s+\\d+(?!\\d)(?!\\s*${TIME_UNIT})|[xх×*]\\s*\\d|-?\\s*х\\s))(?!:\\d\\d)`;
// «15», «15а», «15/2», «15к2», «10/25».
const HOUSE_NUMBER =
  `№?\\s*\\d{1,4}${NOT_A_MEASURE}(?:[А-Яа-яA-Za-z](?![\\p{L}\\d]))?` +
  `(?:\\s?[/-]\\s?\\d{1,4}[А-Яа-я]?${WORD_END})?` +
  `(?:\\s?${anyCase('к')}\\.?\\s?\\d{1,3}(?![\\p{L}\\d]))?`;
// «, корп. 2, кв. 7», «стр. 3», «офис 12».
const HOUSE_EXTRA =
  `(?:\\s*,?\\s*${anyCase('(?:корп(?:ус)?|стр(?:оение)?|кв(?:артира)?|оф(?:ис)?|под(?:ъезд)?|пом(?:ещение)?|лит(?:ера?)?)')}` +
  `\\.?\\s*№?\\s*\\d{1,4}${NOT_A_MEASURE}[А-Яа-я]?${WORD_END})*`;
const HOUSE_LABEL = anyCase(
  '(?:д\\.|дом(?:а|е)?|зд\\.|здани(?:е|я)|вл\\.|стр\\.|строени(?:е|я)|уч\\.|участ(?:ок|ка))',
);
const HOUSE = `(?:\\s*,\\s*|\\s+)(?:${HOUSE_LABEL}\\s*)?${HOUSE_NUMBER}${HOUSE_EXTRA}`;

// Words of plain speech that follow «на улице …» and are not a street name.
const NOT_A_NAME =
  `(?!${anyCase('(?:работ|стоит|стоя|нужн|нужен|надо|минус|плюс|около|пример|будет|есть|всего|только|шириной|длиной|глубин|высот|холод|тепл|мороз|дожд|снег)')})` +
  `(?!${anyCase('(?:на|в|во|с|со|по|до|от|и|или|не|для|за|под|над|при|к|у|о|об|через|без|из|это|то|как|что|где|там|тут|уже|ещё|еще|пока)')}${WORD_END})`;
const LOWER_NAME = `${NOT_A_NAME}[\\p{L}][\\p{L}-]*(?:\\s+${NOT_A_NAME}[\\p{L}][\\p{L}-]*)??`;

// Набережные Челны: «52 комплекс, д. 12», «комплекс 52», «ГЭС 10/25», «Новый город 30/05».
const COMPLEX_WORD = anyCase(
  '(?:комплекс(?:а|е|у)?|компл\\.|к-с|мкрн?\\.?|микрорайон(?:а|е|у)?|кв-л)',
);
const NOT_A_SET = `(?!\\s+${anyCase('(?:работ|услуг|мер|мероприят|оборудован|техник|машин)')})`;
const CHELNY_BLOCK = `(?:ГЭС|ЗЯБ|${anyCase('нов(?:ый|ом)\\s+город(?:е)?')})`;

const ADDRESS_PATTERNS: RegExp[] = [
  // «ул. Мира, д. 15», «проспект Сююмбике 40», «улица 40 лет Победы», «ЖК «Солнечный»».
  `${NOT_IN_WORD}${STREET_ANY}\\.?\\s*${STREET_NAME}(?:${HOUSE})?`,
  // «ул мира 15», «улица ленина 5а»: a name in small letters needs a house number.
  `${NOT_IN_WORD}${STREET_ANY}\\.?\\s*${LOWER_NAME}${HOUSE}`,
  // «Московский проспект, 15», «Сармановский тракт».
  `${NOT_IN_WORD}[А-ЯЁ][а-яё-]*(?:ий|ый|ой|ая|ое|ого|ому|ом|ую)\\s+${AVENUE_WORD}${WORD_END}(?:${HOUSE})?`,
  // «Мира проспект 40», «Ленина улица, 5».
  `${NOT_IN_WORD}${CAPITAL_WORD}\\s+${STREET_ANY}${HOUSE}`,
  // «52 комплекс, д. 12», «17А комплекс», «5-й микрорайон».
  `${NOT_IN_WORD}\\d{1,3}(?:-?[а-яё]{1,2}|[А-Я])?\\s*${COMPLEX_WORD}${WORD_END}${NOT_A_SET}(?:${HOUSE})?`,
  // «комплекс 52», «мкр 5, д. 3».
  `${NOT_IN_WORD}${COMPLEX_WORD}\\s*${HOUSE_NUMBER}(?:${HOUSE})?`,
  // «ГЭС 10/25», «Новый город, 30/05».
  `${NOT_IN_WORD}${CHELNY_BLOCK}\\s*,?\\s*(?:${HOUSE_LABEL}\\s*)?\\d{1,2}\\s?/\\s?\\d{1,3}[А-Яа-я]?${WORD_END}${HOUSE_EXTRA}`,
  // «д. 15», «дом 15к2», «дом 7 кв 12» without a street.
  `${NOT_IN_WORD}${anyCase('(?:д\\.|дом(?:а|е)?)')}\\s*${HOUSE_NUMBER}${HOUSE_EXTRA}`,
  // «кв. 7», «корпус 2», «офис 12».
  `${NOT_IN_WORD}${anyCase('(?:кв\\.|квартир(?:а|е|у|ы)|корп\\.|корпус(?:а|е|у)?|строени(?:е|я)|оф\\.|офис(?:а|е)?)')}\\s*№?\\s*\\d{1,4}${NOT_A_MEASURE}[А-Яа-я]?${WORD_END}`,
].map((source) => new RegExp(source, 'gu'));

// «Адрес: …», «Адрес объекта — …», «по адресу: …»: the line to its end.
const ADDRESS_LINE = new RegExp(
  `(${NOT_IN_WORD}(?:${anyCase('по\\s+адресу')}\\s*[:—–-]|` +
    `${anyCase('адрес')}(?:\\s+${anyCase('(?:объекта|работ|доставки|подачи|площадки|участка|стройки)')})?\\s*[:—–-])[^\\S\\n]*)\\S[^\\n]*`,
  'gu',
);
// «по адресу Мира 15»: no street word, so everything up to the house number.
const BY_ADDRESS = new RegExp(
  `(${NOT_IN_WORD}${anyCase('по\\s+адресу')}\\s+)(?!\\[)[^\\n\\d;!?\\[]{0,60}?${HOUSE_NUMBER}${HOUSE_EXTRA}`,
  'gu',
);
const ESCAPED_ADDRESS = HIDDEN_ADDRESS.replace(/[[\]]/g, '\\$&');
const ADDRESS_RUN = new RegExp(`${ESCAPED_ADDRESS}(?:\\s*[,;]?\\s*${ESCAPED_ADDRESS})+`, 'gu');

/**
 * Hides a street and a house typed into free text: «ул. Мира, д. 15», «52
 * комплекс, д. 12», «ГЭС 10/25», the whole «Адрес: …» line. The city, volumes,
 * tonnage, hours and prices stay as written.
 */
export function maskAddresses(text: string): string {
  let result = text.replace(ADDRESS_LINE, `$1${HIDDEN_ADDRESS}`);
  for (const pattern of ADDRESS_PATTERNS) result = result.replace(pattern, HIDDEN_ADDRESS);
  return result.replace(BY_ADDRESS, `$1${HIDDEN_ADDRESS}`).replace(ADDRESS_RUN, HIDDEN_ADDRESS);
}

/**
 * The task text of an order as everyone except its author, the platform's
 * managers and the booked provider reads it: contacts, links and the address
 * hidden (REVIEW.md §1). The address itself is in Location and follows
 * lib/orderLocationPrivacy.ts.
 */
export function maskOrderText(text: string): string {
  return maskAddresses(maskContactsAndLinks(text));
}

const ADDRESS_MARK = new RegExp(
  `(?:(?:по\\s+адресу|адрес(?:\\s+\\p{L}+)?)\\s*)?[,;:—–-]?\\s*${ESCAPED_ADDRESS}`,
  'giu',
);

/**
 * maskOrderText for a one-line excerpt of a few dozen characters (the evening
 * digest): the address is dropped without a mark, so the line keeps the job.
 */
export function orderTextWithoutAddress(text: string): string {
  return maskOrderText(text)
    .replace(ADDRESS_MARK, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,;:.—–-]+/, '')
    .trim();
}

/**
 * The task text for a viewer of an order. `full` — the author, the admin and
 * the booked company once it confirmed (lib/bidPrivacy.ts bookedProviderSees);
 * `address` — a viewer who reads the Location in full anyway (the house
 * managers): contacts stay hidden, the address stays readable.
 */
export function orderTextForViewer(
  text: string,
  viewer: { full: boolean; address?: boolean },
): string {
  if (viewer.full) return text;
  return viewer.address ? maskContactsAndLinks(text) : maskOrderText(text);
}

/** Only absolute http(s) links may be rendered as <a href>. */
export function isSafeHttpUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

export interface OrderViewer {
  userId?: string | null;
  role?: string | null;
  companyId?: string | null;
  emailVerified?: boolean;
  /** Signed in to /admin (password cookie) or PLATFORM_ADMIN. */
  isAdmin?: boolean;
}

/**
 * Who sees the bids of an order: the customer and admins see all of them, a
 * provider sees only the bids of their own company, everyone else sees none
 * (only the number of bids).
 */
export function visibleBids<T extends { equipment: { companyId: string } }>(
  bids: T[],
  viewer: OrderViewer,
  orderCustomerId: string,
): T[] {
  if (viewer.isAdmin || viewer.role === 'PLATFORM_ADMIN') return bids;
  if (viewer.userId && viewer.userId === orderCustomerId) return bids;
  if (viewer.companyId) return bids.filter((bid) => bid.equipment.companyId === viewer.companyId);
  return [];
}

/** The customer's name is shown only to the customer and admins. */
export function canSeeCustomerName(viewer: OrderViewer, orderCustomerId: string): boolean {
  return Boolean(
    viewer.isAdmin ||
    viewer.role === 'PLATFORM_ADMIN' ||
    (viewer.userId && viewer.userId === orderCustomerId),
  );
}

/**
 * Contacts of people from messenger chats (name, phone, original message):
 * admins, and providers who confirmed their e-mail.
 */
export function canSeeChatContacts(viewer: OrderViewer): boolean {
  if (viewer.isAdmin || viewer.role === 'PLATFORM_ADMIN') return true;
  return viewer.role === 'PROVIDER_ADMIN' && viewer.emailVerified === true;
}

/** Description of an order as a given viewer may see it. */
export function orderDescriptionFor(
  order: { description: string; source: string },
  viewer: OrderViewer,
): string {
  if (order.source === 'SITE' || canSeeChatContacts(viewer)) return order.description;
  return maskContacts(order.description);
}

/**
 * Whether a short text (a machine's name) carries a contact: a Russian phone
 * number in any spelling, an e-mail, a @username or a messenger link. Model
 * codes such as «65115-6058-48» are not phones here (strict Russian shape).
 */
export function containsContact(text: string): boolean {
  if (new RegExp(EMAIL.source, 'u').test(text)) return true;
  if (new RegExp(MESSENGER_LINK.source, 'iu').test(text)) return true;
  if (new RegExp(USERNAME.source, 'u').test(text)) return true;
  for (const match of text.match(PHONE_LIKE) ?? []) {
    const digits = match.replace(/\D/g, '');
    if (
      (digits.length === 11 && /^[78]/.test(digits)) ||
      (digits.length === 10 && digits[0] === '9')
    ) {
      return true;
    }
  }
  return false;
}
