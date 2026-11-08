'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/Icon';
import {
  HELP_PAGE,
  HINTS,
  HINTS_RESET_EVENT,
  browserStorage,
  dismissHint,
  isHintDismissed,
  type HintId,
} from '@/lib/hints';

/**
 * A quiet hint in the flow of the page (never a modal, never over the phone
 * bar or the buttons). Rendered only after mounting: the server does not know
 * what this browser has dismissed, so the first render matches it.
 */
export function Hint({ id, className = '' }: { id: HintId; className?: string }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const check = () => setVisible(!isHintDismissed(browserStorage(), id));
    check();
    window.addEventListener(HINTS_RESET_EVENT, check);
    return () => window.removeEventListener(HINTS_RESET_EVENT, check);
  }, [id]);

  if (!visible) return null;
  const hint = HINTS[id];

  return (
    <aside
      role="note"
      aria-label="Подсказка"
      data-hint={id}
      className={`flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/80 py-1 pl-3 pr-1 text-sm text-slate-700 ${className}`}
    >
      <span className="mt-2.5 shrink-0 text-amber-600">
        <Icon name="spark" className="h-4 w-4" />
      </span>
      <p className="min-w-0 flex-1 py-2 leading-snug">
        {hint.text}
        {hint.more && (
          <>
            {' '}
            <a
              href={`${HELP_PAGE}${hint.more}`}
              className="whitespace-nowrap font-medium text-amber-800 underline decoration-amber-300"
            >
              Подробнее
            </a>
          </>
        )}
      </p>
      <button
        type="button"
        onClick={() => {
          dismissHint(browserStorage(), id);
          setVisible(false);
        }}
        aria-label="Понятно, больше не показывать"
        className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-amber-800 hover:bg-amber-100"
      >
        <span aria-hidden>✕</span> Понятно
      </button>
    </aside>
  );
}
