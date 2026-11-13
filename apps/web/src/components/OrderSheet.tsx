'use client';

import { useEffect, useRef } from 'react';
import { CallbackForm } from '@/components/CallbackForm';
import { Icon } from '@/components/Icon';
import { SITE } from '@/lib/site';

/** The lead's source: where the sheet was opened and on which page («header:/arenda/avtokran»). */
export function orderSource(place: string, pathname: string | null | undefined): string {
  const page = (pathname || '/').slice(0, 60);
  return `${place}:${page}`;
}

/**
 * «Заказать» in the phone's bottom bar and «Заказать технику →» in the header: the short form (a phone and the
 * consent) opens right where the visitor is, instead of a trip to the home
 * page's form. A native modal <dialog>: the browser keeps the focus inside,
 * Esc closes it, the focus returns to the button, and it lies in the top
 * layer — above the bars, the cookie strip and any transformed block. It
 * stands at the top of the screen so the keyboard does not cover it.
 */
export function OrderSheet({ source, onClose }: { source: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    // The caret goes to the phone field (the browser would pick «Закрыть»).
    dialog.querySelector<HTMLInputElement>('input[type="tel"]')?.focus();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      data-order-sheet
      aria-labelledby="order-sheet-title"
      onClose={onClose}
      // A tap on the dimmed page around the card closes it too.
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
      className="order-sheet m-0 mx-auto mt-[max(0.75rem,env(safe-area-inset-top))] max-h-[calc(100dvh-1.5rem)] w-[calc(100%-1.5rem)] max-w-md overflow-y-auto rounded-3xl bg-slate-950 p-0 text-white shadow-2xl ring-1 ring-white/15 backdrop:bg-slate-950/70"
    >
      <div className="relative p-4 pt-5">
        <button
          type="button"
          onClick={() => ref.current?.close()}
          aria-label="Закрыть"
          className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-full text-white/70 hover:bg-white/10 hover:text-white"
        >
          <span aria-hidden className="text-lg leading-none">
            ✕
          </span>
        </button>
        <div className="pr-10">
          <CallbackForm
            source={source}
            dark
            compact
            titleId="order-sheet-title"
            title="Заказать технику"
            subtitle="Оставьте телефон — диспетчер перезвонит, подберёт машину и назовёт цену."
          />
        </div>
        <a
          href={SITE.phoneHref}
          className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-white/10 font-mono text-base font-bold tabular-nums text-white ring-1 ring-white/15"
        >
          <Icon name="phone" className="h-4 w-4" />
          {SITE.phone}
        </a>
      </div>
    </dialog>
  );
}
