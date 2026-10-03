import Image from 'next/image';
import { MINI_APP_MACHINES, priceLine } from '@/lib/miniApp';
import { SHIFT_HOURS } from '@/lib/prices';

// «Техника»: СпецПласт16's machine types with the owner's prices (lib/prices.ts).

export function Catalogue({ onOrder }: { onOrder: (slug: string) => void }) {
  return (
    <div className="h-full overflow-y-auto overscroll-contain px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-4">
      <p className="mb-3 text-sm text-slate-400">
        Своя техника СпецПласт16, всегда с машинистом. Смена — {SHIFT_HOURS} часов.
      </p>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {MINI_APP_MACHINES.map((machine, i) => {
          const price = priceLine(machine.type);
          return (
            <li
              key={machine.slug}
              className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900"
            >
              <div className="relative aspect-[16/9] bg-slate-800">
                <Image
                  src={machine.photo}
                  alt={machine.label}
                  fill
                  sizes="(max-width: 640px) 100vw, 50vw"
                  priority={i < 2}
                  className="object-cover"
                />
                {machine.modelPhoto && (
                  <span className="absolute bottom-2 left-2 rounded bg-slate-950/70 px-1.5 py-0.5 text-[10px] text-slate-300">
                    Фото модели
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-2 p-3">
                <h2 className="text-base font-semibold text-white">{machine.name}</h2>
                <p className="text-sm text-slate-300">
                  <span className="font-semibold text-amber-400">{price.hour}</span> с машинистом
                  <span className="text-slate-400"> · смена {price.shift}</span>
                </p>
                <ul className="list-inside list-disc text-xs text-slate-400">
                  {machine.tasks.map((task) => (
                    <li key={task}>{task}</li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => onOrder(machine.slug)}
                  className="mt-1 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 active:bg-amber-400"
                >
                  Заказать
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
