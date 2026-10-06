import type { Metadata } from 'next';
import { SITE } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Страница не найдена',
  robots: { index: false },
};

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center py-16 text-center">
      <div className="text-7xl">🚧</div>
      <h1 className="mt-4 text-3xl font-bold">Страница не найдена</h1>
      <p className="mt-2 text-slate-600">
        Похоже, здесь идут дорожные работы. Вернитесь на главную или спросите ИИ-агента.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <a
          href="/"
          className="rounded-md bg-amber-500 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400"
        >
          На главную
        </a>
        <a
          href="/equipment"
          className="rounded-md border border-slate-300 px-5 py-2.5 text-sm font-semibold hover:bg-slate-100"
        >
          Каталог техники
        </a>
        <a
          href={SITE.phoneHref}
          className="rounded-md border border-slate-300 px-5 py-2.5 text-sm font-semibold hover:bg-slate-100"
        >
          {SITE.phone}
        </a>
      </div>
    </div>
  );
}
