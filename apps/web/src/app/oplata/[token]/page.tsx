import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { prisma } from '@specai/database';
import { MAP_LINK_GUIDE_TITLE, MapLinkGuide } from '@/components/office/MapLinkGuide';
import { buildInvoice } from '@/lib/office/billing';
import { officePrices } from '@/lib/office/prices';
import { OFFICE_EXTRA_SETTINGS } from '@/lib/office/settings';
import { isValidToken } from '@/lib/office/visibility';
import { rub } from '@/lib/prices';
import { SITE } from '@/lib/site';
import { siteUrl } from '@/lib/siteUrl';

export const dynamic = 'force-dynamic';

// Счёт за сайт «Сайты под ключ» для клиента (S6): открывается по секретной ссылке (тот же
// токен, что у превью), только у сайта, который согласовали или опубликовали. Суммы — цены
// клиента или базовые цены его пакета, реквизиты — текст владельца из настроек офиса.
// Онлайн-оплаты нет: перевод по реквизитам, владелец отмечает оплату в админке. Без
// индексации, без id и служебных полей (всё, что выводится, — buildInvoice). После оплаты
// сайта — инструкция, как поставить ссылку на него в карточки Яндекс Карт и 2ГИС (К16).

export const metadata: Metadata = {
  title: 'Счёт за сайт',
  robots: { index: false, follow: false, nocache: true },
  // Ссылка со страницы на сайт клиента не передаёт адрес счёта с токеном.
  referrer: 'no-referrer',
};

const money = (value: number) => `${rub(value)}\u00a0₽`;

async function loadInvoice(token: string) {
  if (!isValidToken(token)) return null;
  const [row, prices, payDetails] = await Promise.all([
    prisma.prospect.findUnique({
      where: { token },
      select: {
        kind: true,
        status: true,
        name: true,
        city: true,
        slug: true,
        token: true,
        domain: true,
        setupPrice: true,
        monthlyPrice: true,
        setupPaidAt: true,
        paidUntil: true,
      },
    }),
    officePrices(),
    prisma.appSetting.findUnique({
      where: { key: OFFICE_EXTRA_SETTINGS.payDetails },
      select: { value: true },
    }),
  ]);
  if (!row) return null;
  return buildInvoice(
    row,
    prices,
    { payDetails: payDetails?.value, baseUrl: siteUrl() },
    new Date(),
  );
}

export default async function InvoicePage(props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;
  const invoice = await loadInvoice(token);
  if (!invoice) notFound();

  return (
    <article className="mx-auto flex w-full max-w-3xl flex-col gap-6 pb-8 text-slate-700">
      <header className="flex flex-col gap-2">
        <p className="eyebrow text-amber-700">
          {SITE.platform} от {SITE.name} · Сайты под ключ
        </p>
        <h1 className="text-2xl font-extrabold leading-tight tracking-[-0.02em] text-slate-900 sm:text-4xl">
          Счёт за сайт для {invoice.company}
        </h1>
        {invoice.city && <p className="text-sm text-slate-600">{invoice.city}</p>}
      </header>

      <section
        aria-labelledby="summa"
        className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-5 sm:p-7"
      >
        <h2 id="summa" className="text-lg font-bold text-slate-900">
          {invoice.packageTitle}
        </h2>
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-sm">
          <dt>Создание и публикация сайта, разово</dt>
          <dd className="text-right font-semibold text-slate-900">
            {money(invoice.setup)}
            {invoice.setupPaidOn && (
              <span className="block text-xs font-normal text-emerald-700">
                оплачено {invoice.setupPaidOn}
              </span>
            )}
          </dd>
          <dt>Работа сайта и поддержка, в месяц</dt>
          <dd className="text-right font-semibold text-slate-900">{money(invoice.monthly)}</dd>
          {invoice.monthly > 0 && (
            <>
              <dt className="text-slate-600">Или поддержка сразу за 12 месяцев</dt>
              <dd className="text-right text-slate-700">{money(invoice.yearly)}</dd>
            </>
          )}
        </dl>
        {invoice.paidUntil && (
          <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
            Оплачено до {invoice.paidUntil}
          </p>
        )}
        {invoice.due ? (
          <div className="flex flex-col gap-1 rounded-2xl bg-amber-50 px-4 py-3">
            <p className="text-sm text-slate-700">К оплате сейчас</p>
            <p className="text-3xl font-extrabold tracking-tight text-slate-950">
              {money(invoice.due.amount)}
            </p>
            <p className="text-sm text-slate-600">{invoice.due.title}</p>
          </div>
        ) : (
          <p className="text-sm text-slate-600">Сейчас платить ничего не нужно.</p>
        )}
      </section>

      <section aria-labelledby="vhodit" className="flex flex-col gap-3">
        <h2 id="vhodit" className="text-lg font-bold text-slate-900">
          Что входит
        </h2>
        <ul className="flex flex-col gap-2 text-sm">
          {invoice.includes.map((line) => (
            <li key={line} className="flex gap-2">
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-hidden />
              <span>{line}</span>
            </li>
          ))}
        </ul>
        <p className="text-sm">
          <a
            href={invoice.siteHref}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-amber-700 hover:underline"
          >
            {invoice.sitePublished ? 'Открыть ваш сайт' : 'Посмотреть ваш сайт'}
          </a>
        </p>
      </section>

      {invoice.setupPaidOn && invoice.sitePublished && (
        <section
          aria-labelledby="ssylka-v-kartochke"
          className="flex flex-col gap-3 rounded-3xl border border-emerald-200 bg-emerald-50/50 p-5 sm:p-7"
        >
          <h2 id="ssylka-v-kartochke" className="text-lg font-bold text-slate-900">
            {MAP_LINK_GUIDE_TITLE}
          </h2>
          <MapLinkGuide siteHref={invoice.siteHref} />
        </section>
      )}

      <section
        aria-labelledby="kak-oplatit"
        className="flex flex-col gap-3 rounded-3xl border border-slate-200 bg-white p-5 sm:p-7"
      >
        <h2 id="kak-oplatit" className="text-lg font-bold text-slate-900">
          Как оплатить
        </h2>
        {invoice.payDetails ? (
          <>
            <p className="whitespace-pre-wrap break-words rounded-xl bg-slate-50 px-4 py-3 font-mono text-sm text-slate-900">
              {invoice.payDetails}
            </p>
            <p className="text-sm text-slate-600">
              В назначении платежа укажите: «Сайт для {invoice.company}».
            </p>
          </>
        ) : (
          <p className="text-sm">
            Реквизиты пришлём в ответ на письмо — или позвоните{' '}
            <a href={SITE.phoneHref} className="font-semibold text-amber-700 hover:underline">
              {SITE.phone}
            </a>
            .
          </p>
        )}
        <p className="text-sm text-slate-600">
          Оплата банковским переводом, онлайн-оплаты нет. Как только платёж придёт, мы отметим его,
          и здесь появится дата, до которой сайт оплачен.
        </p>
      </section>

      <footer className="flex flex-col gap-1 text-sm text-slate-600">
        <p>
          Исполнитель — {SITE.legalName}, ИНН {SITE.inn}.
        </p>
        <p>
          Вопросы по счёту:{' '}
          <a href={SITE.phoneHref} className="font-semibold text-amber-700 hover:underline">
            {SITE.phone}
          </a>
          ,{' '}
          <a href={`mailto:${SITE.email}`} className="font-semibold text-amber-700 hover:underline">
            {SITE.email}
          </a>
        </p>
      </footer>
    </article>
  );
}
