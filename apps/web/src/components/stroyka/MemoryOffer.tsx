'use client';

// «Давайте я вас запомню?» — the zone's own character offers to remember the visitor
// on this device (lib/stroyka/visitorMemory.ts). A compact card in the
// dialogue's style; Stroyka.tsx places it (above the zone strip on phones,
// above the dialogue box from sm up), never shows it over an expanded phone
// dialogue, folds it into the small chip «Запомнить меня?» after ~8 s and
// brings it back from there. The consent text is /soglasie#zapominanie. The
// same card carries the short answer after «Да», «Не сейчас» or «Забыть меня».

import { SPEAKERS, type SpeakerId } from '@/lib/stroyka';
import { Portrait } from './Portraits';

export type MemoryNote = {
  mode: 'offer' | 'yes' | 'no' | 'bye';
  speaker: SpeakerId;
  text: string;
};

export function MemoryOffer({
  note,
  onYes,
  onNo,
  onFold,
}: {
  note: MemoryNote;
  onYes: () => void;
  onNo: () => void;
  /** Fold the offer into the chip (it can be brought back). */
  onFold?: () => void;
}) {
  const offer = note.mode === 'offer';
  return (
    <section
      data-testid={offer ? 'memory-consent' : 'memory-note'}
      aria-label={offer ? 'Предложение запомнить вас' : undefined}
      aria-live="polite"
      className="pointer-events-auto mx-auto w-full max-w-2xl rounded-2xl border border-amber-500/50 bg-slate-950 p-3 text-white antialiased shadow-2xl"
    >
      <div className="flex items-start gap-3">
        <Portrait
          speaker={note.speaker}
          mood="happy"
          className="hidden h-11 w-11 shrink-0 rounded-lg ring-2 ring-amber-400/70 sm:block"
        />
        <p
          className={`min-w-0 flex-1 text-[15px] leading-snug sm:text-base ${offer ? 'font-bold' : 'font-semibold'}`}
        >
          <b className="mr-1.5 font-mono text-xs font-bold uppercase tracking-wider text-amber-400">
            {SPEAKERS[note.speaker].name}
          </b>
          {note.text}
        </p>
        {offer && onFold && (
          <button
            type="button"
            data-testid="memory-fold"
            onClick={onFold}
            aria-label="Свернуть"
            className="-mr-2 -mt-2 grid h-11 w-11 shrink-0 place-items-center rounded-full text-slate-300 hover:text-white"
          >
            ✕
          </button>
        )}
      </div>
      {offer && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="memory-yes"
            onClick={onYes}
            className="min-h-11 rounded-full bg-amber-500 px-4 text-sm font-bold text-slate-950 hover:bg-amber-400"
          >
            Да, запомни меня
          </button>
          <button
            type="button"
            data-testid="memory-no"
            onClick={onNo}
            className="min-h-11 rounded-full bg-white/10 px-4 text-sm font-bold hover:bg-white/20"
          >
            Не сейчас
          </button>
          <a
            href="/soglasie#zapominanie"
            target="_blank"
            rel="noopener"
            className="ml-auto py-2 text-sm font-bold text-white underline decoration-dotted underline-offset-2 hover:text-amber-200"
          >
            Что запоминаем
          </a>
        </div>
      )}
    </section>
  );
}

/** The folded offer: one small chip that brings the card back. */
export function MemoryChip({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      data-testid="memory-chip"
      onClick={onOpen}
      className="pointer-events-auto min-h-11 rounded-full border border-amber-400/60 bg-slate-950/90 px-4 text-sm font-bold text-amber-200 shadow-lg hover:bg-slate-900"
    >
      Запомнить меня?
    </button>
  );
}
