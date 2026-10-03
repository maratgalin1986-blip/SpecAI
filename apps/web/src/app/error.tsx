'use client';

import { useEffect } from 'react';
import { SITE } from '@/lib/site';

// Shown instead of a blank "Application error" page when a page fails on the
// server (for example, the database is unreachable).
export default function PageError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center py-16 text-center">
      <div className="text-7xl">🛠️</div>
      <h1 className="mt-4 text-3xl font-bold">Сервис временно недоступен</h1>
      <p className="mt-2 text-slate-600">
        Мы уже чиним. Попробуйте обновить страницу через минуту или позвоните — оформим заказ по
        телефону.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-md bg-amber-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-800"
        >
          Попробовать ещё раз
        </button>
        <a
          href={SITE.phoneHref}
          className="rounded-md border border-slate-300 px-5 py-2.5 text-sm font-semibold hover:bg-slate-100"
        >
          {SITE.phone}
        </a>
      </div>
      {error.digest ? (
        <p className="mt-6 text-xs text-slate-600">Код ошибки: {error.digest}</p>
      ) : null}
    </div>
  );
}
