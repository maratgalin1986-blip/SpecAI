import { rub, type SitePackage } from '@/lib/prices';

// Пакеты «Сайта под ключ» с ценами (S2). Серверный компонент: пакеты строит страница из
// sitePackages(officePrices()), здесь только вывод — ни одного рубля в разметке не вшито.

function Check() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="mt-0.5 h-5 w-5 shrink-0 text-amber-600"
      fill="none"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.5"
        d="M5 12.5l4.5 4.5L19 7.5"
      />
    </svg>
  );
}

export function PackageCards({
  packages,
  formHref,
}: {
  packages: SitePackage[];
  formHref: string;
}) {
  return (
    <ul className="grid gap-4 md:grid-cols-2">
      {packages.map((pkg, index) => {
        const featured = index === 0;
        return (
          <li
            key={pkg.key}
            className={`flex flex-col gap-5 rounded-3xl border p-6 sm:p-7 ${
              featured
                ? 'border-amber-300 bg-amber-50/60 shadow-lg shadow-amber-600/10'
                : 'border-slate-200 bg-white'
            }`}
          >
            <div className="flex flex-col gap-1">
              <h3 className="text-xl font-extrabold tracking-tight text-slate-900">{pkg.title}</h3>
              <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">
                  {rub(pkg.setup)}&nbsp;₽
                </span>
                <span className="text-sm text-slate-600">разово</span>
              </p>
              <p className="text-base font-semibold text-slate-800">
                + {rub(pkg.monthly)}&nbsp;₽ в месяц{' '}
                <span className="font-normal text-slate-600">
                  — работа сайта, поддержка, правки
                </span>
              </p>
              {pkg.yearly < pkg.monthly * 12 && (
                <p className="text-sm text-slate-600">
                  или {rub(pkg.yearly)}&nbsp;₽ сразу за год поддержки
                </p>
              )}
            </div>
            <ul className="flex flex-1 flex-col gap-2.5 text-sm text-slate-700">
              {pkg.includes.map((line) => (
                <li key={line} className="flex gap-2">
                  <Check />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
            <a
              href={formHref}
              className={`inline-flex min-h-12 items-center justify-center rounded-full px-6 text-base font-bold transition ${
                featured
                  ? 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                  : 'border border-slate-300 bg-white text-slate-900 hover:border-slate-900'
              }`}
            >
              Хочу этот пакет
            </a>
          </li>
        );
      })}
    </ul>
  );
}
