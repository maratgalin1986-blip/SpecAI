'use client';

import { useSyncExternalStore } from 'react';
import { currentTheme, setTheme, subscribeTheme } from '@/lib/theme';

/**
 * «Тёмная тема» / «Светлая тема»: one press switches the site and remembers the
 * pick in this browser (lib/theme.ts). Until then the site follows the system.
 */
export function ThemeToggle({ withLabel = false }: { withLabel?: boolean }) {
  const theme = useSyncExternalStore(subscribeTheme, currentTheme, () => 'light' as const);
  const dark = theme === 'dark';
  const label = dark ? 'Светлая тема' : 'Тёмная тема';
  return (
    <button
      type="button"
      onClick={() => setTheme(dark ? 'light' : 'dark')}
      aria-label={label}
      aria-pressed={dark}
      title={label}
      className={`theme-toggle inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 ${
        withLabel ? 'px-2' : 'min-w-11 justify-center'
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        aria-hidden
      >
        {dark ? (
          <>
            <circle cx="12" cy="12" r="4" />
            <path
              strokeLinecap="round"
              d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
            />
          </>
        ) : (
          <path strokeLinejoin="round" d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
        )}
      </svg>
      {withLabel && <span className="text-sm font-medium">{label}</span>}
    </button>
  );
}
