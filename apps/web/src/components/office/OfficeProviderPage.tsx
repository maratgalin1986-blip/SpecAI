import type { ProviderPage } from '@/lib/office/pages';
import { PromiseNote } from '@/components/PromiseNote';
import { SITE } from '@/lib/site';

// The provider page the «Подрядчики» agent makes for a machinery company
// found on the map (R10): in the platform's own look, like /providers/[id].
// Server component; gets only the built `ProviderPage` (R19). The phone is in
// `page.phone` only once the company agreed (R13) — the builder decides, the
// component just shows what it gets.

export function OfficeProviderPage({ page }: { page: ProviderPage }) {
  const place = page.address ?? page.city;

  return (
    <div className="flex flex-col gap-8">
      <nav aria-label="Навигация" className="eyebrow text-[0.65rem] text-slate-500">
        <a href="/providers" className="hover:text-slate-900">
          Исполнители
        </a>
        <span className="mx-2 text-slate-300">/</span>
        {page.title}
      </nav>

      <header className="cab-dark flex flex-col gap-4 sm:p-8">
        <p className="cab-eyebrow text-signal-300">
          {page.city ? `Исполнитель · ${page.city}` : `Исполнитель на ${SITE.platform}`}
        </p>
        <h1 className="break-words text-3xl font-extrabold tracking-tight sm:text-5xl">
          {page.title}
        </h1>
        <p className="w-fit rounded-full border border-graphite-700 bg-graphite-800 px-3 py-1 text-xs font-semibold text-graphite-100">
          Новый исполнитель, страница создана площадкой
        </p>
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-graphite-300">База</dt>
            <dd className="font-semibold">{place ?? 'не указана'}</dd>
          </div>
          <div>
            <dt className="text-graphite-300">Техника</dt>
            <dd className="font-semibold">{page.machines.slice(0, 3).join(', ')}</dd>
          </div>
          {page.hours && (
            <div>
              <dt className="text-graphite-300">Часы работы</dt>
              <dd className="font-semibold">{page.hours}</dd>
            </div>
          )}
        </dl>
        <div className="flex flex-col gap-2 sm:flex-row">
          <a href={page.orderHref} className="cab-action">
            Заказать технику
          </a>
          {page.phoneHref && page.phone && (
            <a
              href={page.phoneHref}
              className="cab-ghost border-graphite-600 bg-transparent text-white hover:border-white"
            >
              Позвонить · {page.phone}
            </a>
          )}
        </div>
        <PromiseNote dark />
      </header>

      <section className="flex flex-col gap-4">
        <h2 className="text-2xl font-extrabold tracking-tight">Виды техники</h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {page.machines.map((machine) => (
            <li key={machine} className="cab-card flex items-center gap-3">
              <span className="h-2 w-2 shrink-0 rounded-full bg-signal-500" aria-hidden />
              <span className="font-semibold text-graphite-900">{machine}</span>
            </li>
          ))}
        </ul>
        <p className="text-sm text-slate-600">
          Оставьте заявку — исполнитель ответит ценой и сроком, расчёт напрямую с владельцем
          техники.
        </p>
      </section>

      <section className="cab-card flex flex-col gap-3 border-signal-200 bg-signal-50">
        <h2 className="text-xl font-extrabold tracking-tight">Это ваша компания?</h2>
        <p className="text-graphite-800">
          Встаньте на линию бесплатно — заказчики будут писать вам напрямую. Страница уже готова,
          останется подтвердить данные и добавить технику.
        </p>
        <div>
          <a href={page.joinHref} className="cab-action">
            Это моя компания
          </a>
        </div>
      </section>

      {(page.address || page.hours || page.phone) && (
        <section className="cab-card">
          <h2 className="cab-eyebrow">Контакты</h2>
          <dl className="mt-3 grid gap-4 text-sm sm:grid-cols-3">
            {page.address && (
              <div>
                <dt className="text-slate-500">Адрес</dt>
                <dd className="font-semibold text-graphite-900">{page.address}</dd>
              </div>
            )}
            {page.hours && (
              <div>
                <dt className="text-slate-500">Часы работы</dt>
                <dd className="font-semibold text-graphite-900">{page.hours}</dd>
              </div>
            )}
            {page.phone && page.phoneHref && (
              <div>
                <dt className="text-slate-500">Телефон</dt>
                <dd className="font-semibold text-graphite-900">
                  <a href={page.phoneHref} className="hover:underline">
                    {page.phone}
                  </a>
                </dd>
              </div>
            )}
          </dl>
        </section>
      )}
    </div>
  );
}
