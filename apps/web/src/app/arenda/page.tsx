import { Breadcrumbs } from '@/components/Breadcrumbs';
import { HOME_CRUMB } from '@/lib/breadcrumbs';
import type { Metadata } from 'next';
import { LANDINGS, landingListRate } from '@/lib/landings';
import { pageMeta } from '@/lib/pageMeta';
import { fromPerHour, SHIFT_HOURS } from '@/lib/prices';
import { SITE } from '@/lib/site';

// The index of /arenda/<вид>: the address used to answer 404 while every kind
// under it worked. Kinds and prices come from lib/landings.ts and lib/prices.ts.

export const metadata: Metadata = pageMeta('/arenda', {
  title: 'Аренда спецтехники с машинистом — виды техники',
  description: `Аренда спецтехники с машинистом по всей России: исполнители рядом с объектом и парк ${SITE.name} в Набережных Челнах. Выберите вид техники.`,
});

export default function ArendaIndexPage() {
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <Breadcrumbs dark={false} trail={[HOME_CRUMB, { name: 'Аренда', path: '/arenda' }]} />
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-5xl">
          Аренда спецтехники с машинистом
        </h1>
        <p className="max-w-2xl text-slate-600">
          Выберите вид техники. Цены ниже — прайс парка {SITE.name} в Набережных Челнах, с
          машинистом, смена {SHIFT_HOURS} часов; у других исполнителей — свои ставки на карточках.
        </p>
      </header>

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {LANDINGS.map((landing) => (
          <li key={landing.slug}>
            <a
              href={`/arenda/${landing.slug}`}
              className="flex h-full min-h-[44px] flex-col gap-1 rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-amber-400"
            >
              <span className="text-lg font-bold tracking-tight text-slate-900">
                {landing.short}
              </span>
              <span className="font-mono text-sm font-semibold text-slate-700">
                {fromPerHour(landingListRate(landing))}
              </span>
            </a>
          </li>
        ))}
      </ul>

      <p className="text-sm text-slate-600">
        Не нашли нужную технику?{' '}
        <a href="/equipment" className="font-semibold text-amber-700 underline">
          Весь каталог
        </a>{' '}
        или{' '}
        <a href="/orders#new" className="font-semibold text-amber-700 underline">
          разместите заявку
        </a>{' '}
        — исполнители пришлют цены.
      </p>
    </div>
  );
}
