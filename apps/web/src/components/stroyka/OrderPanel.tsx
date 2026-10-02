'use client';

import { useEffect, useRef, useState } from 'react';
import { CallbackForm } from '@/components/CallbackForm';
import { MACHINE_LABELS, type MachineType } from '@/lib/machinePhotos';
import { MACHINE_WORKS } from '@/lib/machineWorks';
import { SITE } from '@/lib/site';
import { hourlyRate, orderHref, PRICES, rub, SHIFT_HOURS } from '@/lib/stroyka';
import { orderSummary, type OrderContext } from '@/lib/stroyka/context';
import { smetaHref } from '@/lib/stroyka/brain';

const MACHINES = Object.keys(MACHINE_WORKS) as MachineType[];

function priceNote(type: MachineType) {
  if (type === 'crane') return `32 т — ${rub(PRICES.crane32)} ₽/ч`;
  if (MACHINE_WORKS[type]?.hammerRate) return `гидромолот — ${rub(PRICES.hammer)} ₽/ч`;
  return null;
}

// The order panel: every machine with its price and three ways to order.
// Pure DOM, works without WebGL — the impatient visitor's one-tap exit.
export function OrderPanel({
  open,
  machine,
  ctx,
  onClose,
  onSent,
}: {
  open: boolean;
  machine?: MachineType | null;
  ctx: OrderContext;
  onClose: () => void;
  onSent?: () => void;
}) {
  const [formFor, setFormFor] = useState<MachineType | null>(null);
  const first = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (!open) setFormFor(null);
    else first.current?.scrollIntoView({ block: 'nearest' });
  }, [open, machine]);
  if (!open) return null;
  const list = machine ? [machine, ...MACHINES.filter((m) => m !== machine)] : MACHINES;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Заказ техники"
      data-testid="order-panel"
      className="pointer-events-auto fixed inset-0 z-[95] flex items-end justify-center bg-slate-950/70 backdrop-blur-sm sm:items-center"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex max-h-[92dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl border border-amber-500/40 bg-slate-900 text-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-widest text-amber-400">
              Наряд на технику
            </div>
            <div className="text-lg font-bold">Техника СпецПласт16 — что нужно?</div>
            <div className="text-xs text-slate-400">
              Свой парк и свои машинисты, подача обычно в день заявки
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-white/10 px-3 py-1.5 text-sm font-semibold hover:bg-white/20"
            aria-label="Закрыть заказ"
          >
            ✕
          </button>
        </div>
        <ul className="flex-1 divide-y divide-white/10 overflow-y-auto overscroll-contain">
          {list.map((type, i) => {
            const note = priceNote(type);
            const rate = hourlyRate(type);
            const selected = type === machine;
            return (
              <li
                key={type}
                ref={i === 0 ? first : undefined}
                className={`px-4 py-3 ${selected ? 'bg-amber-500/10' : ''}`}
                data-machine={type}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="font-semibold">{MACHINE_LABELS[type]}</span>
                  <span className="font-mono text-sm text-amber-300">
                    от {rub(rate)} ₽/ч · смена {rub(rate * SHIFT_HOURS)} ₽
                  </span>
                </div>
                {note && <div className="text-xs text-slate-400">{note}</div>}
                <div className="mt-2 flex flex-wrap gap-2">
                  <a
                    href={orderHref(type)}
                    className="rounded-full bg-amber-500 px-3 py-1.5 text-sm font-bold text-slate-950 hover:bg-amber-400"
                  >
                    Оформить наряд
                  </a>
                  <a
                    href={SITE.phoneHref}
                    className="rounded-full bg-white/10 px-3 py-1.5 text-sm font-semibold hover:bg-white/20"
                  >
                    Позвонить
                  </a>
                  <a
                    href={smetaHref(null, type)}
                    className="rounded-full bg-white/10 px-3 py-1.5 text-sm font-semibold hover:bg-white/20"
                  >
                    🧮 Смета
                  </a>
                  <button
                    type="button"
                    onClick={() => setFormFor(formFor === type ? null : type)}
                    aria-expanded={formFor === type}
                    className="rounded-full bg-white/10 px-3 py-1.5 text-sm font-semibold hover:bg-white/20"
                  >
                    Заявка
                  </button>
                </div>
                {formFor === type && (
                  <div className="mt-3 rounded-xl bg-slate-950/60 p-3" onSubmit={() => onSent?.()}>
                    <CallbackForm
                      source="stroyka"
                      dark
                      title={`Заявка: ${MACHINE_LABELS[type]}`}
                      subtitle={`${SITE.callbackPromise}.`}
                      defaultMessage={
                        orderSummary({ ...ctx, machine: type }) ||
                        `Нужен: ${MACHINE_LABELS[type]}. `
                      }
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <a
          href={smetaHref(ctx.task, machine ?? ctx.machine)}
          data-testid="order-smeta"
          className="mx-4 mb-2 mt-1 rounded-full border border-amber-400/60 px-4 py-2 text-center text-sm font-bold text-amber-300 hover:bg-amber-400/10"
        >
          🧮 Рассчитать смету — примерно, за минуту
        </a>
        <a
          href="/smeta?mode=snab"
          data-testid="order-snab"
          className="mx-4 mb-2 rounded-full border border-sky-400/60 px-4 py-2 text-center text-sm font-bold text-sky-200 hover:bg-sky-400/10"
        >
          📦 Смета для снабженца — материалы и доставка
        </a>
        <div className="border-t border-white/10 px-4 py-2 text-center text-xs text-slate-400">
          Цены с машинистом, смена — {SHIFT_HOURS} ч. Диспетчер: {SITE.phone}
        </div>
      </div>
    </div>
  );
}
