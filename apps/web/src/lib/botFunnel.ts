// The order funnel of the Telegram bot @specplast16_zayavki_bot, as pure
// helpers (the webhook in app/api/integrations/telegram does the I/O):
//   /start <source>  →  1) which machine  →  2) when  →  3) where  →  phone
// The answers travel in the buttons' callback_data (no extra table, the shared
// database stays as it is). At step 3 a draft lead is saved, so the phone can
// be attached to it and one reminder can be sent an hour later. Prices come
// only from lib/prices.ts.

import { LANDINGS } from '@/lib/landings';
import { MACHINE_LABELS } from '@/lib/machinePhotos';
import { HAMMER_RATE, rateOf, rub, SHIFT_HOURS } from '@/lib/prices';
import { SITE } from '@/lib/site';
import { siteUrl } from '@/lib/siteUrl';

export type InlineButton = { text: string; callback_data: string };
export type InlineKeyboard = { inline_keyboard: InlineButton[][] };

export const WHEN = [
  { code: '0', label: 'Сегодня' },
  { code: '1', label: 'Завтра' },
  { code: '7', label: 'На этой неделе' },
  { code: 'x', label: 'Позже, уточню' },
] as const;

export const CITIES = [
  'Набережные Челны',
  'Елабуга',
  'Нижнекамск',
  'Менделеевск',
  'Другое место',
] as const;

/** Source kept in callback data: Telegram allows 64 bytes per button. */
const SRC_MAX = 48;
/** Shortens a start parameter for callback_data, keeping the «__y<yclid>» tail. */
export function shortSource(start: string) {
  const clean = start.replace(/[^A-Za-z0-9_-]/g, '');
  if (clean.length <= SRC_MAX) return clean || 'bot';
  const y = /__y\d+$/.exec(clean)?.[0] ?? '';
  return `${clean.slice(0, SRC_MAX - y.length).replace(/[-_]+$/, '')}${y}` || 'bot';
}

export const UNSUBSCRIBE: InlineButton = { text: 'Отписаться', callback_data: 'u' };

const rows = <T>(items: T[], size: number) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, i * size + size),
  );

export function machineName(index: number) {
  const landing = LANDINGS[index];
  return landing ? MACHINE_LABELS[landing.machine] : 'Техника';
}

/** «от 4 000 ₽/ч с машинистом, смена 8 ч — от 32 000 ₽». */
export function priceLine(index: number) {
  const landing = LANDINGS[index];
  if (!landing) return '';
  const rate = rateOf(landing.machine);
  return `от ${rub(rate)} ₽/ч с машинистом, смена ${SHIFT_HOURS} ч — от ${rub(rate * SHIFT_HOURS)} ₽`;
}

export function machineKeyboard(src: string): InlineKeyboard {
  const buttons = LANDINGS.map((landing, i) => ({
    text: landing.short,
    callback_data: `m|${i}|${src}`,
  }));
  return { inline_keyboard: [...rows(buttons, 2), [UNSUBSCRIBE]] };
}

export function whenKeyboard(machine: number, src: string): InlineKeyboard {
  const buttons = WHEN.map((w) => ({
    text: w.label,
    callback_data: `w|${machine}|${w.code}|${src}`,
  }));
  return { inline_keyboard: [...rows(buttons, 2), [UNSUBSCRIBE]] };
}

export function placeKeyboard(machine: number, when: string, src: string): InlineKeyboard {
  const buttons = CITIES.map((city, i) => ({
    text: city,
    callback_data: `p|${machine}|${when}|${i}|${src}`,
  }));
  return { inline_keyboard: [...rows(buttons, 2), [UNSUBSCRIBE]] };
}

/** The «Поделиться номером» reply keyboard. */
export const CONTACT_KEYBOARD = {
  keyboard: [[{ text: '📱 Поделиться номером', request_contact: true }]],
  resize_keyboard: true,
  one_time_keyboard: true,
};

export type Callback =
  | { step: 'machine'; machine: number; src: string }
  | { step: 'when'; machine: number; when: string; src: string }
  | { step: 'place'; machine: number; when: string; city: number; src: string }
  | { step: 'unsubscribe' };

/** Reads callback_data back; null for anything malformed. */
export function parseCallback(data: string | undefined): Callback | null {
  if (!data) return null;
  if (data === 'u') return { step: 'unsubscribe' };
  const [kind, ...rest] = data.split('|');
  const machine = Number(rest[0]);
  if (!Number.isInteger(machine) || !LANDINGS[machine]) return null;
  if (kind === 'm' && rest.length === 2)
    return { step: 'machine', machine, src: shortSource(rest[1]!) };
  const when = rest[1] ?? '';
  if (!WHEN.some((w) => w.code === when)) return null;
  if (kind === 'w' && rest.length === 3)
    return { step: 'when', machine, when, src: shortSource(rest[2]!) };
  const city = Number(rest[2]);
  if (kind === 'p' && rest.length === 4 && Number.isInteger(city) && CITIES[city]) {
    return { step: 'place', machine, when, city, src: shortSource(rest[3]!) };
  }
  return null;
}

/** A calculator hand-off: «calc_<landing>_<hours>» from /kalkulyator. */
export function parseCalcStart(
  start: string,
): { machine: number; hours: number; hammer: boolean } | null {
  const m = /^calc_(\d{1,2})_(\d{1,3})(_h)?(?:__|$)/.exec(start);
  if (!m) return null;
  const machine = Number(m[1]);
  const hours = Number(m[2]);
  if (!LANDINGS[machine] || hours < 1 || hours > 240) return null;
  return { machine, hours, hammer: Boolean(m[3]) };
}

export function calcText(machine: number, hours: number, hammer = false) {
  const landing = LANDINGS[machine]!;
  const rate = hammer ? Math.max(HAMMER_RATE, rateOf(landing.machine)) : rateOf(landing.machine);
  return (
    `Ваш расчёт: ${machineName(machine).toLowerCase()}, ${hours} ч × ${rub(rate)} ₽ = ` +
    `${rub(rate * hours)} ₽ (ориентировочно, с машинистом; подачу назовёт диспетчер).`
  );
}

export function greeting() {
  return (
    `Здравствуйте! Это бот ${SITE.name} — аренда своей спецтехники с машинистом в Набережных Челнах и рядом.\n\n` +
    `Три шага — и заявка у диспетчера. Какая техника нужна?`
  );
}

export function whenText(machine: number) {
  return `${machineName(machine)}: ${priceLine(machine)}.\n\nКогда нужна техника?`;
}

export const PLACE_TEXT = 'Где работы? Выберите город — точный адрес уточним по телефону.';

/** The draft lead saved at step 3 (phone added when the person shares it). */
export const DRAFT_MARK = '[черновик]';
export const REMINDED_MARK = '[напомнили]';
export const UNSUB_MARK = '[отписан]';
export const chatMark = (chatId: number) => `[tg:${chatId}]`;

export function draftMessage(c: Extract<Callback, { step: 'place' }>, chatId: number) {
  const when = WHEN.find((w) => w.code === c.when)!.label.toLowerCase();
  return (
    `Бот: ${machineName(c.machine).toLowerCase()}, ${when}, ${CITIES[c.city]}. ` +
    `Ориентировочно ${priceLine(c.machine)}. ${chatMark(chatId)} ${DRAFT_MARK}`
  );
}

/** Lead source: «tg-bot:<page>__<campaign>__y<yclid>». */
export const leadSource = (src: string) => `tg-bot:${src}`.slice(0, 100);

export function askPhoneText(c: Extract<Callback, { step: 'place' }>) {
  return (
    `Отлично: ${machineName(c.machine).toLowerCase()}, ${CITIES[c.city]}.\n` +
    `Ориентировочно ${priceLine(c.machine)}.\n\n` +
    `Нажмите «📱 Поделиться номером» — диспетчер перезвонит и назовёт точную цену с подачей. ` +
    `Отправляя номер, вы соглашаетесь на обработку персональных данных: ${siteUrl()}/privacy`
  );
}

export function acceptedText(onShift: boolean) {
  return onShift
    ? `Заявка принята! Диспетчер ${SITE.name} перезвонит в течение 15 минут. Срочно — ${SITE.phone}`
    : `Заявка принята, позвоним с 8:00. Срочно — ${SITE.phone}`;
}

/** The single reminder, with what the person chose: «Бот: самосвал, завтра, Елабуга. …». */
export function reminderText(draft: string) {
  const chosen = /^Бот: ([^.]+)\./.exec(draft)?.[1];
  const price = /Ориентировочно (от .+?₽)\./.exec(draft)?.[1];
  return (
    `Вы выбирали ${chosen ?? 'технику'}${price ? ` — ${price}` : ''}, но не оставили номер. ` +
    'Нажмите «📱 Поделиться номером» — диспетчер назовёт точную цену. Больше напоминать не будем.'
  );
}

export const UNSUBSCRIBED_TEXT =
  'Вы отписаны: бот больше не напишет первым. Оставить заявку можно в любой момент — /start.';

/** «+7 927 …» or ≥10 digits typed as text. */
export function phoneFromText(text: string): string | null {
  const digits = text.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15 && /^[\d\s()+-]+$/.test(text.trim())
    ? text.trim()
    : null;
}
