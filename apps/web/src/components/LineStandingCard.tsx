'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// «На линии на 5 рабочих дней» (owner, 2026-10-28) in the provider cabinet:
// one switch with the end date. The machine stands at its own point or the
// company's base; the phone's GPS (the app) is optional and only adds
// «рядом сейчас». PUT /api/line with `source: 'web'` (lib/lineStanding.ts).

export interface LineMachineOption {
  id: string;
  name: string;
  available: boolean;
}

export interface LineStandingState {
  on: boolean;
  equipmentId: string | null;
  /** «30.10 (пт)», «до отключения». */
  untilText: string | null;
  forever: boolean;
  /** The phone reports a fresh position. */
  live: boolean;
}

type Mode = 'days5' | 'until' | 'forever';

export function LineStandingCard({
  machines,
  initial,
  hasBase,
  maxDate,
  minDate,
}: {
  machines: LineMachineOption[];
  initial: LineStandingState;
  hasBase: boolean;
  /** «YYYY-MM-DD» bounds for «до …». */
  minDate: string;
  maxDate: string;
}) {
  const router = useRouter();
  const free = machines.filter((machine) => machine.available);
  const [equipmentId, setEquipmentId] = useState(
    initial.equipmentId && free.some((m) => m.id === initial.equipmentId)
      ? initial.equipmentId
      : (free[0]?.id ?? ''),
  );
  const [mode, setMode] = useState<Mode>(initial.forever ? 'forever' : 'days5');
  const [until, setUntil] = useState(minDate);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/line', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'web', ...body }),
      });
      const result = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setError(typeof result?.error === 'string' ? result.error : 'Не удалось сохранить');
        return;
      }
      router.refresh();
    } catch {
      setError('Не удалось связаться с сервером. Попробуйте ещё раз');
    } finally {
      setBusy(false);
    }
  }

  const goOnline = () =>
    send({
      online: true,
      equipmentId,
      standing: mode,
      ...(mode === 'until' ? { until } : {}),
    });
  const goOffline = () => send({ online: false, standing: 'off' });

  return (
    <section id="line" className="cab-card flex scroll-mt-24 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-graphite-950">На линии</h2>
        <span
          className={`rounded-full px-3 py-1 text-sm font-bold ${
            initial.on ? 'bg-signal-500 text-graphite-950' : 'bg-graphite-100 text-graphite-700'
          }`}
        >
          {initial.on
            ? initial.forever
              ? 'На линии, пока не отключите'
              : initial.untilText
                ? `На линии до ${initial.untilText} включительно`
                : 'На линии'
            : 'Не на линии'}
        </span>
      </div>
      <p className="text-sm text-graphite-600">
        Встаньте на линию один раз — заказчики видят машину на карте и получают её в подборе по
        заявкам рядом все выбранные дни, без ежедневного нажатия. Рабочие дни — пн–пт. Если машина
        занята по подтверждённой брони, в эти дни она показывается занятой. За день до конца придёт
        напоминание «Продлить на 5 рабочих дней?».
        {initial.on && initial.live ? ' Телефон машиниста передаёт место — «рядом сейчас».' : ''}
      </p>

      {!hasBase && (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Укажите, где стоит техника, ниже в разделе «Моя точка на карте»: без телефона на линии
          машина стоит на карте у базы.
        </p>
      )}

      {free.length === 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-graphite-700">
            Отметьте машину «Свободна», чтобы выйти на линию.
          </p>
          {initial.on && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void goOffline()}
              className="min-h-11 w-fit rounded-full bg-graphite-700 px-5 font-bold text-graphite-100 disabled:opacity-60"
            >
              Уйти с линии
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm font-medium text-graphite-800">
            Машина
            <select
              value={equipmentId}
              onChange={(event) => setEquipmentId(event.target.value)}
              className="min-h-11 rounded-xl border border-graphite-200 bg-white px-3"
            >
              {free.map((machine) => (
                <option key={machine.id} value={machine.id}>
                  {machine.name}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="flex flex-col gap-2 text-sm text-graphite-800">
            <legend className="mb-1 font-medium">Сколько быть на линии</legend>
            <label className="flex min-h-11 items-center gap-2">
              <input
                type="radio"
                name="line-mode"
                checked={mode === 'days5'}
                onChange={() => setMode('days5')}
              />
              5 рабочих дней
            </label>
            <label className="flex min-h-11 flex-wrap items-center gap-2">
              <input
                type="radio"
                name="line-mode"
                checked={mode === 'until'}
                onChange={() => setMode('until')}
              />
              до даты
              <input
                type="date"
                value={until}
                min={minDate}
                max={maxDate}
                onChange={(event) => {
                  setUntil(event.target.value);
                  setMode('until');
                }}
                className="min-h-11 rounded-xl border border-graphite-200 px-2"
                aria-label="До какого числа на линии"
              />
            </label>
            <label className="flex min-h-11 items-center gap-2">
              <input
                type="radio"
                name="line-mode"
                checked={mode === 'forever'}
                onChange={() => setMode('forever')}
              />
              пока не отключу
            </label>
          </fieldset>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || !equipmentId}
              onClick={() => void goOnline()}
              className="min-h-11 rounded-full bg-signal-500 px-5 font-extrabold text-graphite-950 disabled:opacity-60"
            >
              {initial.on ? 'Сохранить' : 'Встать на линию'}
            </button>
            {initial.on && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void goOffline()}
                className="min-h-11 rounded-full bg-graphite-700 px-5 font-bold text-graphite-100 disabled:opacity-60"
              >
                Уйти с линии
              </button>
            )}
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}
