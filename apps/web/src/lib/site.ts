// Company branding and contacts, in one place so they're easy to update.
export const SITE = {
  name: 'СпецПласт16',
  // The platform's own name (estimates, design, site tour); the company that
  // does the work is always `name`.
  platform: 'ИИСтройка24',
  tagline: 'Аренда спецтехники и строительные услуги в Татарстане',
  description:
    'СпецПласт16 — аренда спецтехники с оператором в Набережных Челнах и по Татарстану: ' +
    'экскаваторы-погрузчики, автокраны, погрузчики. ИИ-агенты подберут технику и оформят заявку.',
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
  // PLACEHOLDER — the owner must supply the operator's legal address (from the
  // ЕГРЮЛ extract). /privacy and /soglasie show it once it is filled in; until
  // then they show nothing in its place. Never invent it.
  legalAddress: '' as string,
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
