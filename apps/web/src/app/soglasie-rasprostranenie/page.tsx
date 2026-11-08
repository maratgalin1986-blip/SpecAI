import type { Metadata } from 'next';
import { SITE } from '@/lib/site';

// Consent to the distribution of personal data (152-ФЗ ст. 10.1): it must be
// a document separate from the consent to processing (/soglasie). Covers what
// the platform shows to everyone: a provider's name and base point on the map
// (for a sole trader that is personal data) and the short name under reviews,
// comments and orders on the public board.
// TODO владелец: a lawyer should confirm the text. Web provider sign-up has its
// own checkbox for it; customers see a line at sign-up. Still missing: a
// checkbox before a review or comment is posted and in the mobile sign-up.

export const metadata: Metadata = {
  title: 'Согласие на распространение персональных данных',
  description: `Согласие на распространение персональных данных на площадке ${SITE.platform}`,
  robots: { index: false },
};

export default function DistributionConsentPage() {
  const operator = SITE.legalName || SITE.name;
  return (
    <article className="mx-auto max-w-3xl space-y-4 py-6 text-slate-700 [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-slate-900 [&_li]:ml-5 [&_li]:list-disc">
      <h1 className="text-2xl font-bold text-slate-900">
        Согласие на распространение персональных данных
      </h1>
      <p className="text-sm text-slate-500">Редакция от 13 октября 2026 г.</p>
      <p>
        Это согласие отдельное от{' '}
        <a href="/soglasie" className="text-amber-700 underline">
          согласия на обработку персональных данных
        </a>
        . Отмечая галочку о согласии на распространение при регистрации исполнителя либо публикуя на
        площадке {SITE.platform} от {SITE.name} заявку, отзыв или комментарий, я даю {operator}
        {SITE.inn ? ` (ИНН ${SITE.inn}${SITE.ogrn ? `, ОГРН ${SITE.ogrn}` : ''})` : ''} (далее —
        Оператор) согласие сделать перечисленные ниже данные доступными неограниченному кругу лиц на
        сайте, в мобильном приложении и в Telegram-боте площадки.
      </p>
      <h2>Какие данные публикуются</h2>
      <ul>
        <li>
          для исполнителя: наименование компании или ИП, город, адрес базы и её точка на карте,
          техника, цены, фото техники, отзывы о работе;
        </li>
        <li>
          для заказчика и автора отзыва или комментария: имя и первая буква фамилии («Анна П.»),
          текст заявки, отзыва или комментария, город и даты работ. Телефоны, e-mail и ссылки в
          тексте заявки на доске скрываются; адрес работ, если я сам(а) написал(а) его в тексте
          заявки, виден всем.
        </li>
      </ul>
      <h2>Условия и запреты</h2>
      <ul>
        <li>
          Данные публикуются только для того, чтобы заказчики и исполнители находили друг друга на
          площадке.
        </li>
        <li>
          Телефон, e-mail, ИНН индивидуального предпринимателя-исполнителя, документы и данные
          машинистов публично не показываются.
        </li>
        <li>
          Я могу установить запреты и условия на распространение или потребовать прекратить его,
          написав Оператору; публикация прекращается в течение 3 рабочих дней с получения требования
          (ч. 12–14 ст. 10.1 152-ФЗ).
        </li>
      </ul>
      <h2>Срок и отзыв</h2>
      <p>
        Согласие действует, пока у меня есть аккаунт или опубликованные материалы на площадке, или
        до его отзыва. Отозвать согласие можно в любой момент, написав на{' '}
        <a href={`mailto:${SITE.email}`} className="text-amber-700 underline">
          {SITE.email}
        </a>{' '}
        или позвонив по телефону {SITE.phone}.
      </p>
      <p>
        Подробнее — в{' '}
        <a href="/privacy#kto-vidit" className="text-amber-700 underline">
          политике конфиденциальности
        </a>
        .
      </p>
    </article>
  );
}
