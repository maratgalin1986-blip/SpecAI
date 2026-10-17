import type { Metadata } from 'next';
import { SITE } from '@/lib/site';
import { ResetHintsButton } from '@/components/ResetHintsButton';

// A short help page (owner, 2026-10-17: «краткая справка, как пользоваться
// сайтом»): the customer's and the provider's way in a few steps, one login
// for both, and the app. The hints on the pages link here.

export const metadata: Metadata = {
  title: 'Как пользоваться',
  description: `Как заказать спецтехнику и как исполнителю получать заявки на ${SITE.platform}: шаги, один логин для двух ролей, приложение с картой «на линии».`,
  alternates: { canonical: '/kak-polzovatsya' },
};

const CUSTOMER_STEPS = [
  {
    title: 'Опишите задачу',
    text: 'На странице «Заявки» напишите, какая техника нужна, где и когда. Можно без регистрации — телефон не публикуется, а с аккаунтом удобнее сравнивать предложения.',
  },
  {
    title: 'Получите предложения',
    text: `Исполнители, включая парк ${SITE.name}, присылают цену и машину. Они видят только ваше имя и первую букву фамилии, например «Анна П.».`,
  },
  {
    title: 'Выберите лучшее',
    text: 'Сравните цену, рейтинг и отзывы и нажмите «Принять» — бронь создастся сама.',
  },
  {
    title: 'Дождитесь подтверждения',
    text: 'Исполнитель подтверждает бронь, и вы видите его телефон. Договоритесь о времени подачи.',
  },
  {
    title: 'Оставьте отзыв',
    text: 'После работы оцените исполнителя — это помогает другим заказчикам выбрать.',
  },
];

const PROVIDER_STEPS = [
  {
    title: 'Зарегистрируйтесь',
    text: 'Выберите «Встать на линию» и укажите, где стоит техника. Уже заказывали у нас? Нажмите «Стать исполнителем» в своём кабинете.',
  },
  {
    title: 'Добавьте технику',
    text: 'Фото, характеристики и своя цена за час или смену — машина появится в каталоге и на карте.',
  },
  {
    title: 'Отвечайте на заявки',
    text: 'Откройте заявку и предложите свободную машину и цену. Другие исполнители вашу цену не видят.',
  },
  {
    title: 'Подтвердите бронь',
    text: 'Заказчик выбрал вас — нажмите «Подтвердить». До этого он показан как «Анна П.», после — с телефоном.',
  },
  {
    title: 'Работайте и завершайте',
    text: 'В день работ нажмите «Начать аренду», после смены — «Завершить». Заказчик оставит отзыв.',
  },
  {
    title: 'Выходите на линию',
    text: 'В приложении выйдите на линию со свободной машиной — заказчики увидят вас на карте рядом с объектом.',
  },
];

function Steps({ steps }: { steps: { title: string; text: string }[] }) {
  return (
    <ol className="flex flex-col gap-3">
      {steps.map((step, index) => (
        <li key={step.title} className="flex gap-3">
          <span
            aria-hidden
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500 font-mono text-sm font-bold text-slate-950"
          >
            {index + 1}
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-slate-900">{step.title}</p>
            <p className="text-sm text-slate-600">{step.text}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export default function HowToPage() {
  return (
    <article className="mx-auto flex max-w-3xl flex-col gap-8 py-6 text-slate-700">
      <header className="flex flex-col gap-2">
        <p className="cab-eyebrow">Справка</p>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
          Как пользоваться {SITE.platform}
        </h1>
        <p>
          Площадка соединяет тех, кому нужна спецтехника, и тех, у кого она есть. Регистрация,
          заявки и предложения бесплатны. Вопросы —{' '}
          <a href={SITE.phoneHref} className="font-semibold text-amber-700">
            {SITE.phone}
          </a>
          .
        </p>
      </header>

      <section id="zakazchik" aria-labelledby="zakazchik-title" className="scroll-mt-24">
        <h2 id="zakazchik-title" className="mb-4 text-xl font-bold text-slate-900">
          Я заказываю технику
        </h2>
        <Steps steps={CUSTOMER_STEPS} />
        <div className="mt-4 flex flex-wrap gap-3">
          <a href="/orders#new" className="cab-action">
            Оставить заявку
          </a>
          <a href="/equipment" className="cab-ghost min-h-11">
            Каталог техники
          </a>
        </div>
      </section>

      <section id="ispolnitel" aria-labelledby="ispolnitel-title" className="scroll-mt-24">
        <h2 id="ispolnitel-title" className="mb-4 text-xl font-bold text-slate-900">
          Я исполнитель
        </h2>
        <Steps steps={PROVIDER_STEPS} />
        <div className="mt-4">
          <a href="/register?type=provider" className="cab-action">
            Встать на линию
          </a>
        </div>
      </section>

      <section
        id="dve-roli"
        aria-labelledby="dve-roli-title"
        className="cab-card flex scroll-mt-24 flex-col gap-2"
      >
        <h2 id="dve-roli-title" className="text-xl font-bold text-slate-900">
          Один логин — две роли
        </h2>
        <p>
          Исполнитель тоже может заказывать технику, а заказчик — сдавать свою. Второй аккаунт не
          нужен:
        </p>
        <ul className="ml-5 list-disc space-y-1 text-sm">
          <li>
            заказчик в своём кабинете нажимает «Стать исполнителем», указывает название и место, где
            стоит техника;
          </li>
          <li>
            вверху кабинета появляется переключатель «Заказчик ⇄ Исполнитель» — в режиме заказчика
            ваши заявки и брони, в режиме исполнителя техника и заявки заказчиков;
          </li>
          <li>кнопка «Кабинет» в шапке открывает тот режим, в котором вы были последним.</li>
        </ul>
      </section>

      <section id="prilozhenie" aria-labelledby="prilozhenie-title" className="scroll-mt-24">
        <h2 id="prilozhenie-title" className="mb-2 text-xl font-bold text-slate-900">
          Приложение
        </h2>
        <p>
          В приложении тот же логин и те же заявки. Главное отличие — живая карта «на линии»:
          исполнитель выходит на линию со свободной машиной, а заказчик видит на карте ближайшие
          свободные машины с ценой.
        </p>
      </section>

      <p className="text-sm">
        Есть идея, как сделать площадку удобнее, или хотите сотрудничать?{' '}
        <a href="/predlozheniya" className="font-semibold text-amber-700 underline">
          Предложения и партнёрство
        </a>
        .
      </p>

      <section aria-labelledby="hints-title" className="flex flex-col gap-2 border-t pt-6">
        <h2 id="hints-title" className="text-lg font-semibold text-slate-900">
          Подсказки на страницах
        </h2>
        <p className="text-sm">
          На каждом шаге сайт показывает короткую подсказку. Скрытые кнопкой «Понятно» можно
          вернуть.
        </p>
        <ResetHintsButton />
      </section>
    </article>
  );
}
