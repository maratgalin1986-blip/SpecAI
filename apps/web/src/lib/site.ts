// Company branding and contacts, in one place so they're easy to update.
export const SITE = {
  name: 'СпецПласт16',
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
  telegramBot: process.env.NEXT_PUBLIC_TELEGRAM_BOT ?? '',
  // Promise shown next to callback forms. Keep it realistic.
  callbackPromise: 'Перезвоним в течение 15 минут в рабочее время',
  workingHours: 'Пн–Сб, 8:00–20:00 · ИИ-агенты — круглосуточно',
  // Legal details of the personal-data operator shown in the privacy policy,
  // e.g. 'ИП Иванов Иван Иванович' and the ИНН. Fill in before launch.
  legalName: 'ООО «СПЕЦПЛАСТ 16»' as string,
  inn: '1650412557' as string,
  kpp: '165001001' as string,
};
