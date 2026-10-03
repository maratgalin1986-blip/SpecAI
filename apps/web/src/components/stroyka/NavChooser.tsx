'use client';

// «Куда идём?»: the visitor picks where the camera goes — a place, a person or
// a sight. A bottom sheet on a phone, a side panel on a desktop.
import { useEffect } from 'react';
import type { ZoneId } from '@/lib/stroyka';
import { NAV_PEOPLE, NAV_PLACES, NAV_SIGHTS } from './navTargets';
import { Portrait } from './Portraits';

export function NavChooser({
  open,
  active,
  touring,
  onClose,
  onPlace,
  onPerson,
  onSight,
  onTour,
}: {
  open: boolean;
  active: ZoneId | null;
  touring: boolean;
  onClose: () => void;
  onPlace: (zone: ZoneId) => void;
  onPerson: (id: string) => void;
  onSight: (id: string) => void;
  onTour: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [open, onClose]);

  if (!open) return null;
  const pick = (fn: () => void) => () => {
    fn();
    onClose();
  };

  return (
    <div className="absolute inset-0 z-[66] sm:pointer-events-none" data-testid="nav-chooser">
      {/* Phones: a dim backdrop that closes the sheet; desktops keep the world clickable. */}
      <button
        type="button"
        aria-label="Закрыть"
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/40 backdrop-blur-[1px] sm:hidden"
      />
      <section
        role="dialog"
        aria-label="Куда идём?"
        className="stroyka-nav pointer-events-auto absolute inset-x-0 bottom-0 flex max-h-[74vh] flex-col overflow-hidden rounded-t-3xl border-t border-white/10 bg-slate-950/90 pb-[env(safe-area-inset-bottom)] shadow-[0_-12px_40px_rgba(0,0,0,.5)] backdrop-blur-md sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-[calc(4rem+env(safe-area-inset-top))] sm:max-h-[calc(100vh-6rem)] sm:w-[22rem] sm:rounded-3xl sm:border"
      >
        <div className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-white/25 sm:hidden" />
        <header className="flex shrink-0 items-start gap-3 px-4 pb-2 pt-2 sm:pt-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-extrabold tracking-tight">
              <span aria-hidden>🧭</span> Куда идём?
            </h2>
            <p className="mt-0.5 text-[11px] leading-snug text-slate-400">
              Или сами: коснитесь человека или земли — пойдём туда, тяните — осмотреться
              <span className="hidden sm:inline">, WASD и стрелки — шагать</span>.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            data-testid="nav-close"
            aria-label="Закрыть"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-base hover:bg-white/20"
          >
            ✕
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
          <h3 className="mb-1.5 mt-1 font-mono text-[10px] uppercase tracking-[0.25em] text-amber-400">
            Места
          </h3>
          <ul className="grid grid-cols-3 gap-1.5">
            {NAV_PLACES.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  data-testid={`nav-zone-${p.id}`}
                  onClick={pick(() => onPlace(p.id))}
                  aria-current={active === p.id ? 'location' : undefined}
                  className={`flex w-full flex-col items-center gap-0.5 rounded-2xl px-1 py-2 text-center text-[11px] font-semibold leading-tight transition active:scale-95 ${
                    active === p.id
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-white/[0.06] hover:bg-white/[0.12]'
                  }`}
                >
                  <span className="text-xl leading-none" aria-hidden>
                    {p.icon}
                  </span>
                  {p.name}
                </button>
              </li>
            ))}
          </ul>

          <h3 className="mb-1.5 mt-4 font-mono text-[10px] uppercase tracking-[0.25em] text-amber-400">
            Люди
          </h3>
          <ul className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0">
            {NAV_PEOPLE.map((p) => (
              <li key={p.id} className="shrink-0 snap-start">
                <button
                  type="button"
                  data-testid={`nav-person-${p.id}`}
                  onClick={pick(() => onPerson(p.id))}
                  className="flex w-36 items-center gap-2 rounded-2xl bg-white/[0.06] p-1.5 pr-2 text-left transition hover:bg-white/[0.12] active:scale-95 sm:w-full"
                >
                  {p.speaker === 'worker' ? (
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-500/25 text-lg"
                      aria-hidden
                    >
                      👷
                    </span>
                  ) : (
                    <Portrait speaker={p.speaker} className="h-9 w-9 shrink-0 rounded-xl" />
                  )}
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-bold">{p.name}</span>
                    <span className="block truncate text-[10px] text-slate-400">{p.role}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <h3 className="mb-1.5 mt-4 font-mono text-[10px] uppercase tracking-[0.25em] text-amber-400">
            Посмотреть
          </h3>
          <ul className="grid grid-cols-2 gap-1.5">
            {NAV_SIGHTS.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  data-testid={`nav-sight-${s.id}`}
                  onClick={pick(() => onSight(s.id))}
                  className="flex w-full items-center gap-2 rounded-2xl bg-white/[0.06] px-2.5 py-2 text-left text-xs font-semibold transition hover:bg-white/[0.12] active:scale-95"
                >
                  <span className="text-lg leading-none" aria-hidden>
                    {s.icon}
                  </span>
                  {s.name}
                </button>
              </li>
            ))}
          </ul>

          <button
            type="button"
            data-testid="nav-tour"
            onClick={pick(onTour)}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-full border border-white/15 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10"
          >
            {touring ? '⏹ Остановить экскурсию' : '▶ Экскурсия: обход с прорабом'}
          </button>
        </div>
      </section>
    </div>
  );
}
