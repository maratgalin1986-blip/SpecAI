// Services that process visitors' data for the site, with their country.
// Shown in the privacy policy (/privacy) and the consent (/soglasie): keep
// this list true when a service is added or removed.
// TODO владелец: before online payment is switched on, add Stripe (USA) here and to /privacy.

export interface Processor {
  name: string;
  purpose: string;
  country: string;
}

export const PROCESSORS: Processor[] = [
  {
    name: 'Yandex Cloud',
    purpose:
      'база данных сайта: аккаунты, заявки, предложения, брони, переписка, отзывы, журнал показов телефона',
    country: 'Россия',
  },
  {
    name: 'Vercel Inc.',
    purpose:
      'хостинг сайта (IP-адреса и запросы в журналах сервера), хранение файлов (Vercel Blob): фото техники и объектов, фото смен, вложения в переписке, документы исполнителей',
    country: 'США',
  },
  {
    name: 'Telegram',
    purpose:
      'Telegram-бот и уведомления: администратору площадки о новых заявках (имя, телефон, текст заявки), а заказчикам и исполнителям, привязавшим свой Telegram, — о заявках, предложениях и бронях (идентификатор чата, имя в Telegram, текст уведомления); чтение сообщений в открытых чатах, куда бота добавили администраторы чата',
    country: 'серверы за пределами России, компания в ОАЭ',
  },
  {
    name: 'Expo (650 Industries, Inc.)',
    purpose: 'push-уведомления в мобильном приложении (push-токен устройства и текст уведомления)',
    country: 'США',
  },
  {
    name: 'Resend',
    purpose: 'отправка писем (e-mail и текст письма), если пользователь указал e-mail',
    country: 'США',
  },
  {
    name: 'Anthropic',
    purpose:
      'ответы ИИ-ассистентов, распознавание заявок в сообщениях из чатов и характеристик техники в тексте или файле, который загрузил исполнитель: текст сообщения или файл, только когда ИИ включён; без ИИ сообщения разбираются по правилам на сервере сайта',
    country: 'США',
  },
  {
    // TODO владелец: confirm the gateway company and its country before enabling it.
    name: 'GREEN-API (шлюз WhatsApp)',
    purpose:
      'только если подключено: получение сообщений из групп WhatsApp, где состоит аккаунт площадки, и личных сообщений ему (номер и имя отправителя, текст), отправка уведомлений в WhatsApp (номер телефона и текст); сообщения доставляет WhatsApp (Meta Platforms, США)',
    country: 'Россия; WhatsApp — США',
  },
  {
    name: 'SMS.ru',
    purpose: 'только если подключено: отправка SMS (номер телефона и текст)',
    country: 'Россия',
  },
  {
    name: 'ООО «Яндекс» (Яндекс.Метрика)',
    purpose: 'статистика посещений, cookie, IP-адрес — только после согласия на Метрику',
    country: 'Россия',
  },
  {
    // Map tiles go through the site's own proxy (/api/tiles), so visitors' IPs stay with us.
    name: 'OpenStreetMap Foundation (Nominatim)',
    purpose: 'поиск координат по адресу места работ (передаётся только адрес)',
    country: 'Великобритания',
  },
  {
    name: 'MET Norway',
    purpose: 'прогноз погоды по координатам места работ, без персональных данных',
    country: 'Норвегия',
  },
];
