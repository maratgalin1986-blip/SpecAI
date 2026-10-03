'use client';

import { useEffect, useRef, useState } from 'react';
import { CallbackForm } from '@/components/CallbackForm';
import { TelegramButton } from '@/components/TelegramButton';
import { LANDINGS } from '@/lib/landings';
import { MACHINE_LABELS } from '@/lib/machinePhotos';
import { reachGoal } from '@/lib/marketing';
import { rub, SHIFT_HOURS } from '@/lib/prices';
import { landingIndex, workCost, WORKS } from '@/lib/workCalc';

const HOURS = [4, 8, 16, 24, 40];

/**
 * «Сколько стоит моя работа»: work → machine → hours → sum. The result goes
 * to Telegram in one tap (the bot repeats the calculation) or to a callback.
 */
export function WorkCalculator() {
  const [work, setWork] = useState(WORKS[0]!.id);
  const picked = WORKS.find((w) => w.id === work)!;
  const [machine, setMachine] = useState(picked.machine);
  const [hours, setHours] = useState(picked.hours);
  const counted = useRef(false);
  // Demolition is priced with the hammer, as on /raboty/demontazh.
  const hammer = Boolean(picked.hammer && machine === picked.machine);
  const { rate, total } = workCost(machine, hours, hammer);
  const index = landingIndex(machine);

  useEffect(() => {
    setMachine(picked.machine);
    setHours(picked.hours);
  }, [picked]);

  useEffect(() => {
    if (counted.current) return;
    if (work !== WORKS[0]!.id || hours !== WORKS[0]!.hours) {
      counted.current = true;
      reachGoal('calc_done');
    }
  }, [work, hours]);

  const chip = (active: boolean) =>
    `min-h-10 rounded-full px-4 text-sm font-semibold transition ${
      active ? 'bg-amber-500 text-slate-950' : 'bg-white ring-1 ring-slate-300 hover:ring-amber-400'
    }`;

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">1. Что нужно сделать?</h2>
        <div className="flex flex-wrap gap-2">
          {WORKS.map((w) => (
            <button
              key={w.id}
              type="button"
              className={chip(w.id === work)}
              onClick={() => setWork(w.id)}
            >
              {w.label}
            </button>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">2. Техника {`(подобрали, можно сменить)`}</h2>
        <div className="flex flex-wrap gap-2">
          {LANDINGS.map((l) => (
            <button
              key={l.slug}
              type="button"
              className={chip(l.machine === machine)}
              onClick={() => setMachine(l.machine)}
            >
              {MACHINE_LABELS[l.machine]}
            </button>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">3. Сколько часов?</h2>
        <div className="flex flex-wrap items-center gap-2">
          {HOURS.map((h) => (
            <button key={h} type="button" className={chip(h === hours)} onClick={() => setHours(h)}>
              {h} ч{h === SHIFT_HOURS ? ' (смена)' : ''}
            </button>
          ))}
          <label className="flex items-center gap-2 text-sm">
            или
            <input
              type="number"
              min={1}
              max={240}
              value={hours}
              onChange={(e) => setHours(Math.min(240, Math.max(1, Number(e.target.value) || 1)))}
              className="w-20 rounded-lg border border-slate-300 px-2 py-2"
              aria-label="Часы"
            />
          </label>
        </div>
      </section>

      <section
        className="rounded-3xl bg-slate-950 p-6 text-white"
        aria-live="polite"
        data-testid="calc-result"
      >
        <div className="eyebrow text-amber-400">Ориентировочно</div>
        <p className="mt-2 text-sm text-white/80">
          {MACHINE_LABELS[machine]}
          {hammer ? ' с гидромолотом' : ''} с машинистом: {hours} ч × {rub(rate)} ₽
        </p>
        <p className="mt-1 text-4xl font-extrabold text-amber-400">{rub(total)} ₽</p>
        <p className="mt-2 text-xs text-white/60">
          Цена «от», с машинистом; подачу и точную сумму назовёт диспетчер СпецПласт16.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <TelegramButton
            page={`calc_${index}_${hours}${hammer ? '_h' : ''}`}
            label="Получить расчёт в Telegram"
            dark
          />
          <a href="/privacy" className="text-xs text-white/60 underline">
            Политика конфиденциальности
          </a>
        </div>
      </section>

      <div className="rounded-3xl border border-slate-200 bg-white p-5">
        <CallbackForm
          source={`calc:${machine}:${hours}`}
          defaultMessage={`Расчёт: ${MACHINE_LABELS[machine]}, ${hours} ч ≈ ${rub(total)} ₽`}
          title="Перезвонить с точной ценой"
        />
      </div>
    </div>
  );
}
