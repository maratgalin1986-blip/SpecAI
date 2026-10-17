'use client';

import { useState } from 'react';
import { HINTS_RESET_EVENT, browserStorage, resetHints } from '@/lib/hints';
import { useHydrated } from '@/lib/useHydrated';

/** «Показать подсказки снова»: brings back every hint hidden with «Понятно». */
export function ResetHintsButton() {
  const hydrated = useHydrated();
  const [done, setDone] = useState<boolean | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={!hydrated}
        onClick={() => {
          const ok = resetHints(browserStorage());
          window.dispatchEvent(new Event(HINTS_RESET_EVENT));
          setDone(ok);
        }}
        className="inline-flex min-h-11 items-center rounded-full border border-amber-400 bg-amber-50 px-5 text-sm font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-60"
      >
        Показать подсказки снова
      </button>
      {done !== null && (
        <p role="status" className="text-sm text-slate-600">
          {done
            ? 'Готово: подсказки снова появятся на страницах.'
            : 'Браузер не даёт сохранить настройку — подсказки появятся после перезагрузки страницы.'}
        </p>
      )}
    </div>
  );
}
