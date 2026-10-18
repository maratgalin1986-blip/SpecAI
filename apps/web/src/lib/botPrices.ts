// «💰 Цены на технику» in a private chat with the bot (2026-10-18): the same
// three questions as /ceny/opros — the machine, the city, the price per hour —
// asked openly as ИИСтройка24 to whoever starts the chat (a menu button, the
// /ceny command or the deep link t.me/<bot>?start=ceny). The bot never writes
// first. Answers travel in the buttons' callback_data like the order funnel
// (lib/botFunnel.ts). The phone is asked only on «Хочу заявки рядом» and only
// through Telegram's «Поделиться номером», with the consent notice.
// Pure helpers; the webhook does the I/O (lib/botPriceStore.ts saves).

import { CITIES } from '@/lib/cities';
import { LANDINGS } from '@/lib/landings';
import { priceBoundsFor, PRICE_SURVEY_LEAD, PRICE_SURVEY_TITLE } from '@/lib/priceReports';
import { SITE } from '@/lib/site';
import { siteUrl } from '@/lib/siteUrl';
import type { InlineButton, InlineKeyboard } from '@/lib/botFunnel';

/** The start parameter of the deep link: t.me/<bot>?start=ceny. */
export const PRICE_START = 'ceny';

export function priceSurveyLink(bot: string = SITE.telegramBot): string | null {
  return bot ? `https://t.me/${bot}?start=${PRICE_START}` : null;
}

export const PRICES_BUTTON: InlineButton = { text: '💰 Цены на технику', callback_data: 'c' };

/** «/ceny», «/ceny@bot», «/start ceny». */
export function isPriceStart(text: string): boolean {
  const trimmed = text.trim();
  return (
    /^\/ceny(?:@\w+)?(?:\s|$)/i.test(trimmed) ||
    new RegExp(`^/start\\s+${PRICE_START}(?:\\s|$)`, 'i').test(trimmed)
  );
}

/** City buttons per page. */
export const CITY_PAGE = 12;
/** The hourly prices offered as buttons, ₽ (filtered by the category's bounds). */
export const PRICE_STEPS = [
  1500, 2000, 2500, 3000, 3500, 4000, 4500, 5000, 6000, 7000, 8000, 10000, 12000, 15000,
];

const rows = <T>(items: T[], size: number) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, i * size + size),
  );

export function priceIntroText(): string {
  return (
    `💰 ${PRICE_SURVEY_TITLE} ${PRICE_SURVEY_LEAD}\n` +
    `Это открытый опрос ${SITE.platform}: ответы обезличены, имя и телефон не нужны.\n\n` +
    '1/3. Какая у вас техника?'
  );
}

export function categoryKeyboard(): InlineKeyboard {
  const buttons = LANDINGS.map((landing, i) => ({ text: landing.short, callback_data: `cc|${i}` }));
  return { inline_keyboard: rows(buttons, 2) };
}

export const CITY_TEXT = '2/3. В каком городе вы работаете?';

export function cityKeyboard(landing: number, page = 0): InlineKeyboard {
  const pages = Math.ceil(CITIES.length / CITY_PAGE);
  const current = Math.min(Math.max(page, 0), pages - 1);
  const buttons = CITIES.slice(current * CITY_PAGE, (current + 1) * CITY_PAGE).map((city, i) => ({
    text: city.name,
    callback_data: `cs|${landing}|${current * CITY_PAGE + i}`,
  }));
  const nav: InlineButton[] = [];
  if (current > 0) nav.push({ text: '‹ Назад', callback_data: `cg|${landing}|${current - 1}` });
  if (current < pages - 1) {
    nav.push({ text: 'Другие города ›', callback_data: `cg|${landing}|${current + 1}` });
  }
  return { inline_keyboard: [...rows(buttons, 2), ...(nav.length ? [nav] : [])] };
}

export function priceText(landing: number, city: number): string {
  return (
    `3/3. ${LANDINGS[landing]!.short}, ${CITIES[city]!.name}: сколько вы берёте за час с ` +
    'машинистом? Выберите ближайшее. Точную цену можно указать на сайте: ' +
    `${siteUrl()}/ceny/opros`
  );
}

export function pricesFor(landing: number): number[] {
  const [min, max] = priceBoundsFor(LANDINGS[landing]!.categorySlug);
  return PRICE_STEPS.filter((price) => price >= min && price <= max);
}

export function priceKeyboard(landing: number, city: number): InlineKeyboard {
  const buttons = pricesFor(landing).map((price) => ({
    text: `${price.toLocaleString('ru-RU').replace(/\s/g, ' ')} ₽`,
    callback_data: `cv|${landing}|${city}|${price}`,
  }));
  return { inline_keyboard: rows(buttons, 3) };
}

export type PriceCallback =
  | { step: 'start' }
  | { step: 'category'; landing: number }
  | { step: 'cities'; landing: number; page: number }
  | { step: 'city'; landing: number; city: number }
  | { step: 'price'; landing: number; city: number; price: number }
  | { step: 'phone' };

const int = (value: string | undefined) => {
  const number = Number(value);
  return value !== undefined && /^\d{1,6}$/.test(value) && Number.isInteger(number) ? number : null;
};

/** Reads a price-survey button back; null for anything else (the order funnel's own). */
export function parsePriceCallback(data: string | undefined): PriceCallback | null {
  if (!data) return null;
  if (data === 'c') return { step: 'start' };
  if (data === 'cn') return { step: 'phone' };
  const [kind, ...rest] = data.split('|');
  const landing = int(rest[0]);
  if (landing === null || !LANDINGS[landing]) return null;
  if (kind === 'cc' && rest.length === 1) return { step: 'category', landing };
  const second = int(rest[1]);
  if (second === null) return null;
  if (kind === 'cg' && rest.length === 2) {
    return second * CITY_PAGE < CITIES.length ? { step: 'cities', landing, page: second } : null;
  }
  if (!CITIES[second]) return null;
  if (kind === 'cs' && rest.length === 2) return { step: 'city', landing, city: second };
  const price = int(rest[2]);
  if (kind === 'cv' && rest.length === 3 && price !== null && pricesFor(landing).includes(price)) {
    return { step: 'price', landing, city: second, price };
  }
  return null;
}

/** After the answer: the colleagues' prices, and the way to get orders. */
export function priceAnswerText(indexText: string): string {
  return (
    `Спасибо! ${indexText}\n\n` +
    `Все цены на рынке: ${siteUrl()}/ceny\n` +
    `Хотите получать заявки рядом? Регистрация исполнителя — бесплатно: ${siteUrl()}/register?role=provider`
  );
}

export const WANT_ORDERS_BUTTON: InlineButton = {
  text: '📱 Хочу заявки рядом — оставить номер',
  callback_data: 'cn',
};

export function askPricePhoneText(): string {
  return (
    'Нажмите «📱 Поделиться номером» — мы свяжемся и расскажем, как получать заявки рядом. ' +
    `Отправляя номер, вы соглашаетесь на обработку персональных данных: ${siteUrl()}/soglasie ` +
    `(политика — ${siteUrl()}/privacy)`
  );
}

export const PRICE_PHONE_SAVED =
  'Спасибо, номер сохранили — свяжемся в рабочее время. Зарегистрироваться самому: ' +
  'кнопка «Встать на линию» на сайте и в приложении.';

export const PRICE_LIMITED = 'Вы уже ответили несколько раз — попробуйте через час.';
