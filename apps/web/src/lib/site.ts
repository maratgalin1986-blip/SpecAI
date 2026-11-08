// The file itself, not the package index: this module is in every page's
// client bundle (the header) and in the middleware, which must not pull in
// zod and the city list with it.
import {
  PLATFORM_PROMISE,
  PLATFORM_PROMISE_DETAIL,
  PLATFORM_PROMISE_LINE,
  PLATFORM_PROMISE_SHORT,
} from '@specai/shared/src/promise';

// Company branding and contacts, in one place so they're easy to update.
export const SITE = {
  name: 'СпецПласт16',
  // The platform (the aggregator) is `platform`, shown as «ИИСтройка24 от
  // СпецПласт16»; `name` is the house provider, the materials seller and the
  // legal operator of the site.
  platform: 'ИИСтройка24',
  // The platform serves all of Russia (owner, 2026-10-17); СпецПласт16 is one
  // provider, based in Набережные Челны. Customer-facing texts never limit the
  // service to Tatarstan (site.test.ts checks it).
  tagline: 'Заказ спецтехники с машинистом по всей России',
  description:
    'ИИСтройка24 от СпецПласт16 — заказ спецтехники с машинистом по всей России, бесплатно и без ' +
    'посредников: одна заявка — цены исполнителей рядом с вами, расчёт напрямую с владельцем ' +
    'техники. Свой парк СпецПласт16 — в Набережных Челнах.',
  // The headline promise (owner, 2026-10-17), from packages/shared/src/promise.ts:
  // the header pill, the hero, the forms, the footer, the shared texts. True
  // only while there is no commission and no online payment
  // (isOnlinePaymentEnabled() is false): introduce either and these texts must
  // change in the same PR (REVIEW.md, «Тексты»).
  promise: PLATFORM_PROMISE,
  promiseShort: PLATFORM_PROMISE_SHORT,
  promiseDetail: PLATFORM_PROMISE_DETAIL,
  /** Both in one sentence: «Бесплатно и без посредников: цену назначает…». */
  promiseLine: PLATFORM_PROMISE_LINE,
  /** Where the header pill and the notes lead: the explanation on /kak-polzovatsya. */
  promiseHref: '/kak-polzovatsya#besplatno',
  // The company's own contacts (the legal owner and the house provider), not
  // the service area: never show them as «где работаем».
  city: 'Набережные Челны',
  region: 'Республика Татарстан',
  phone: '+7 (927) 242-80-88',
  phoneHref: 'tel:+79272428088',
  email: 'specplast16@mail.ru',
  // WhatsApp chat with the same number (click-to-chat).
  whatsappHref: 'https://wa.me/79272428088',
  // Yandex.Metrika counter (created 2026-09-29); the env var can override it.
  metrikaId: process.env.NEXT_PUBLIC_YANDEX_METRIKA_ID || '113179760',
  // Telegram bot username without "@", once the bot exists (NEXT_PUBLIC_TELEGRAM_BOT).
  // The bot is @specplast16_zayavki_bot; NEXT_PUBLIC_TELEGRAM_BOT can override it.
  telegramBot: process.env.NEXT_PUBLIC_TELEGRAM_BOT || 'specplast16_zayavki_bot',
  // Promise shown next to callback forms. Keep it realistic.
  callbackPromise: 'Перезвоним в течение 15 минут в рабочее время',
  workingHours: 'Пн–Сб, 8:00–20:00 · ИИ-агенты — круглосуточно',
  // Legal details of the personal-data operator shown in the privacy policy,
  // e.g. 'ИП Иванов Иван Иванович' and the ИНН. Fill in before launch.
  legalName: 'ООО «СПЕЦПЛАСТ 16»' as string,
  inn: '1650412557' as string,
  kpp: '165001001' as string,
  ogrn: '1221600029287' as string,
  // Registered address from the ЕГРЮЛ (owner, 2026-10-07: «ты знаешь мою фирму»).
  // /privacy and /soglasie show it.
  legalAddress:
    '423823, Республика Татарстан, г. Набережные Челны, б-р Главмосстроевцев, д. 3, кв. 92' as string,
};

/** Working hours for calls: Mon–Sat, 8:00–20:00 Moscow time. */
export const SHIFT = { days: [1, 2, 3, 4, 5, 6], from: 8, to: 20 } as const;

/** Whether the dispatcher answers the phone at this moment. */
export function isOnShift(date: Date = new Date()): boolean {
  // Moscow is UTC+3 all year.
  const msk = new Date(date.getTime() + 3 * 3600 * 1000);
  const day = msk.getUTCDay();
  const hour = msk.getUTCHours();
  return (SHIFT.days as readonly number[]).includes(day) && hour >= SHIFT.from && hour < SHIFT.to;
}

const ON_DAY = [
  'в воскресенье',
  'в понедельник',
  'во вторник',
  'в среду',
  'в четверг',
  'в пятницу',
  'в субботу',
];

/**
 * When the dispatcher is next on the phone, for an off-shift promise:
 * «сегодня с 8:00», «завтра с 8:00» or «в понедельник с 8:00».
 */
export function nextShiftText(date: Date = new Date()): string {
  const msk = new Date(date.getTime() + 3 * 3600 * 1000);
  const days = SHIFT.days as readonly number[];
  for (let ahead = 0; ahead < 8; ahead += 1) {
    const day = (msk.getUTCDay() + ahead) % 7;
    if (!days.includes(day)) continue;
    if (ahead === 0 && msk.getUTCHours() >= SHIFT.from) continue;
    const when = ahead === 0 ? 'сегодня' : ahead === 1 ? 'завтра' : ON_DAY[day];
    return `${when} с ${SHIFT.from}:00`;
  }
  return `с ${SHIFT.from}:00`;
}
