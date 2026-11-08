'use client';

import { useMemo, useState } from 'react';
import {
  AVAILABILITY_LABELS,
  AVAILABILITY_MAX_DAYS,
  dayKey,
  moscowDay,
  type AvailabilityChoice,
} from '@/lib/aktualno';
import type { AktualnoMachine } from '@/lib/aktualnoData';

interface Row {
  id: string;
  hourly: string;
  daily: string;
  kind: AvailabilityChoice['kind'];
  until: string;
}

const field =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-amber-700 focus:ring-2 focus:ring-amber-700';

const KINDS: AvailabilityChoice['kind'][] = ['today', 'tomorrow', 'busy'];

/** «Сохранить» for every machine at once: prices and «Свободна …» (PUT /api/aktualno). */
export function AktualnoForm({ machines }: { machines: AktualnoMachine[] }) {
  const today = useMemo(() => moscowDay(new Date()), []);
  const minDay = dayKey(today);
  const maxDay = dayKey(new Date(today.getTime() + AVAILABILITY_MAX_DAYS * 86_400_000));
  const [rows, setRows] = useState<Row[]>(() =>
    machines.map((machine) => ({
      id: machine.id,
      hourly: machine.hourlyRate === null ? '' : String(machine.hourlyRate),
      daily: String(machine.dailyRate),
      kind: machine.availability?.kind ?? 'today',
      until: machine.availability?.kind === 'busy' ? machine.availability.until : '',
    })),
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const update = (id: string, patch: Partial<Row>) =>
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const items = rows.map((row) => ({
        id: row.id,
        hourlyRate: row.hourly.trim() === '' ? null : row.hourly,
        dailyRate: row.daily,
        availability: row.kind === 'busy' ? { kind: 'busy', until: row.until } : { kind: row.kind },
      }));
      const response = await fetch('/api/aktualno', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      const body = (await response.json().catch(() => null)) as {
        message?: string;
        error?: string;
      } | null;
      if (!response.ok) throw new Error(body?.error ?? 'Не удалось сохранить');
      setMessage({ ok: true, text: body?.message ?? 'Сохранено' });
    } catch (caught) {
      setMessage({
        ok: false,
        text: caught instanceof Error ? caught.message : 'Не удалось сохранить',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(event) => void save(event)} className="flex flex-col gap-3">
      <ul className="flex flex-col gap-3">
        {machines.map((machine) => {
          const row = rows.find((item) => item.id === machine.id)!;
          return (
            <li key={machine.id} className="cab-card flex flex-col gap-3">
              <div>
                <p className="font-bold text-graphite-950">{machine.name}</p>
                <p className="text-xs text-graphite-500">{machine.categoryName}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 text-xs text-graphite-600">
                  Цена за час, ₽
                  <input
                    className={field}
                    inputMode="numeric"
                    value={row.hourly}
                    placeholder="—"
                    onChange={(event) => update(machine.id, { hourly: event.target.value })}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-graphite-600">
                  Смена 8 ч, ₽
                  <input
                    className={field}
                    inputMode="numeric"
                    required
                    value={row.daily}
                    onChange={(event) => update(machine.id, { daily: event.target.value })}
                  />
                </label>
              </div>
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-xs text-graphite-600">Когда свободна</legend>
                <div className="flex flex-wrap gap-2">
                  {KINDS.map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      aria-pressed={row.kind === kind}
                      onClick={() => update(machine.id, { kind })}
                      className={`min-h-11 rounded-full border px-4 text-sm font-semibold transition ${
                        row.kind === kind
                          ? 'border-amber-600 bg-amber-50 text-amber-900'
                          : 'border-slate-200 bg-white text-graphite-700 hover:border-amber-400'
                      }`}
                    >
                      {AVAILABILITY_LABELS[kind]}
                    </button>
                  ))}
                </div>
                {row.kind === 'busy' && (
                  <label className="flex flex-col gap-1 text-xs text-graphite-600">
                    Занята до (включительно)
                    <input
                      type="date"
                      className={`${field} max-w-xs`}
                      required
                      min={minDay}
                      max={maxDay}
                      value={row.until}
                      onChange={(event) => update(machine.id, { until: event.target.value })}
                    />
                  </label>
                )}
              </fieldset>
            </li>
          );
        })}
      </ul>
      {message && (
        <p
          role="status"
          className={`rounded-xl px-4 py-3 text-sm ${
            message.ok ? 'bg-green-50 text-green-900' : 'bg-red-50 text-red-800'
          }`}
        >
          {message.text}
        </p>
      )}
      <button type="submit" disabled={busy} className="cab-action w-full sm:w-fit">
        {busy ? 'Сохраняем…' : 'Сохранить'}
      </button>
    </form>
  );
}
