'use client';

// The card of a tapped machine on the picture: what it does, «Заказать» with its
// machinery kind and «Встать на линию». Loaded once the scene is up.
import { kindInfo, WORLD_PROVIDER_HREF, worldOrderHref, type WorldKind } from './kinds';

export default function PickedCard({
  kind,
  categoryIds,
  onClose,
}: {
  kind: WorldKind;
  categoryIds: Partial<Record<WorldKind, string>>;
  onClose: () => void;
}) {
  const info = kindInfo(kind);
  return (
    <div
      role="dialog"
      aria-label={info.title}
      className="absolute inset-x-3 bottom-3 rounded-2xl bg-white/95 p-4 shadow-2xl backdrop-blur sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-80"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm text-emerald-700">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
            на линии
          </p>
          <p className="text-lg font-bold text-slate-900">{info.title}</p>
        </div>
        <button
          type="button"
          onClick={() => onClose()}
          aria-label="Закрыть"
          className="rounded-full px-2 text-2xl leading-none text-slate-500 hover:text-slate-900"
        >
          ×
        </button>
      </div>
      <p className="mt-1 text-sm text-slate-600">{info.text}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <a
          href={worldOrderHref(categoryIds[info.kind])}
          className="rounded-full bg-amber-500 px-4 py-2 font-semibold text-slate-950 hover:bg-amber-400"
        >
          Заказать
        </a>
        <a
          href={WORLD_PROVIDER_HREF}
          className="rounded-full border border-slate-300 px-4 py-2 font-semibold text-slate-800 hover:border-slate-500"
        >
          Встать на линию
        </a>
      </div>
    </div>
  );
}
