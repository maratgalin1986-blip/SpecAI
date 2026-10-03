'use client';

// «Давайте я вас запомню?» — the zone's own character offers to remember the visitor
// on this device (lib/stroyka/visitorMemory.ts). It sits on top of the
// dialogue box in the same style, never replaces it, and the order buttons
// stay where they are. The consent text is /soglasie#zapominanie. The same
// card carries the short answer after «Да», «Не сейчас» or «Забыть меня».

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
}: {
  note: MemoryNote;
  onYes: () => void;
  onNo: () => void;
}) {
  const offer = note.mode === 'offer';
  return (
    <section
      data-testid={offer ? 'memory-consent' : 'memory-note'}
      aria-label={offer ? 'Предложение запомнить вас' : undefined}
      aria-live="polite"
      className="pointer-events-auto mx-auto w-full max-w-2xl rounded-2xl border border-amber-500/50 bg-slate-950 p-3 text-white antialiased shadow-2xl sm:p-4"
    >
      <div className="flex gap-3">
        <Portrait
          speaker={note.speaker}
          mood="happy"
          className="h-11 w-11 shrink-0 rounded-lg ring-2 ring-amber-400/70 sm:h-12 sm:w-12"
        />
        <div className="min-w-0 flex-1">
          <div className="font-mono text-sm font-bold uppercase tracking-wider text-amber-400">
            {SPEAKERS[note.speaker].name}
          </div>
          <p
            className={`mt-1 text-base leading-relaxed sm:text-[17px] ${offer ? 'font-bold' : 'font-semibold'}`}
          >
            {note.text}
          </p>
        </div>
      </div>
      {offer && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="memory-yes"
            onClick={onYes}
            className="rounded-full bg-amber-500 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-amber-400"
          >
            Да, запомни меня
          </button>
          <button
            type="button"
            data-testid="memory-no"
            onClick={onNo}
            className="rounded-full bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/20"
          >
            Не сейчас
          </button>
          <a
            href="/soglasie#zapominanie"
            target="_blank"
            rel="noopener"
            className="ml-auto text-sm font-bold text-white underline decoration-dotted underline-offset-2 hover:text-amber-200"
          >
            Что именно запоминаем
          </a>
        </div>
      )}
    </section>
  );
}
