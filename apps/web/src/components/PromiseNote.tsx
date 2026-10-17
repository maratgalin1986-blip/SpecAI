import { SITE } from '@/lib/site';

/**
 * «Бесплатно и без посредников: цену назначает владелец техники…» — one quiet
 * line under the submit buttons (owner, 2026-10-17: the promise always in view,
 * never in the way). The headline links to the explanation on /kak-polzovatsya.
 * No hooks: works in server and client components alike.
 */
export function PromiseNote({
  dark = false,
  large = false,
  className = '',
}: {
  /** Light text for a dark panel (the callback form, the footer). */
  dark?: boolean;
  /** text-sm instead of text-xs (the footer). */
  large?: boolean;
  className?: string;
}) {
  return (
    <p
      data-promise-note
      className={`${large ? 'text-sm' : 'text-xs'} leading-snug ${dark ? 'text-slate-300' : 'text-slate-500'} ${className}`}
    >
      <a
        href={SITE.promiseHref}
        className={`font-semibold underline-offset-2 hover:underline ${
          dark ? 'text-emerald-300' : 'text-emerald-700'
        }`}
      >
        ✓ {SITE.promise}
      </a>
      {SITE.promiseLine.slice(SITE.promise.length)}
    </p>
  );
}
