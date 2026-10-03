// Services that process visitors' data for the site, with their country.
// Shown in the privacy policy (/privacy) and the consent (/soglasie): keep
// this list true when a service is added or removed.

export interface Processor {
  name: string;
  purpose: string;
  country: string;
}

export const PROCESSORS: Processor[] = [
  {
    name: 'Vercel Inc.',
    purpose: 'хостинг сайта (IP-адреса и запросы в журналах сервера), хранение фото (Vercel Blob)',
    country: 'США',
  },
  {
    name: 'Telegram',
    purpose: 'уведомления оператору о новых заявках (имя, телефон, текст заявки)',
    country: 'серверы за пределами России, компания в ОАЭ',
  },
  {
    name: 'Resend',
    purpose: 'отправка писем (e-mail и текст письма), если пользователь указал e-mail',
    country: 'США',
  },
  {
    name: 'Anthropic',
    purpose:
      'ответы ИИ-ассистента: текст сообщений из чата, только когда ИИ включён; без ИИ чат отвечает по правилам на сервере сайта',
    country: 'США',
  },
  {
    name: 'ООО «Яндекс» (Яндекс.Метрика)',
    purpose: 'статистика посещений, cookie, IP-адрес',
    country: 'Россия',
  },
  {
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
