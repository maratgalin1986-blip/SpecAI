'use client';

import { useCallback, useEffect, useState } from 'react';
import { DAY_KIND_LABELS, type CalendarDay, type DayKind } from '@/lib/occupancy';
import { formatMoney } from '@/lib/money';
import { callApi, errorText, todayKey, type MachineCalendarJson } from './client';

// «Календарь занятости» in /provider: a month per machine — booked, pending,
// blocked («Не сдаётся»), maintenance, free. A tap on a day shows the
// booking; the provider blocks days by hand and frees them again.

const KIND_CLASS: Record<DayKind, string> = {
  free: 'bg-white text-graphite-900 hover:bg-graphite-50',
  booked: 'bg-graphite-900 text-white',
  pending: 'bg-amber-200 text-amber-900',
  blocked: 'bg-graphite-300 text-graphite-800 line-through',
  maintenance: 'bg-sky-100 text-sky-900',
};

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const MONTHS = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
];

const BOOKING_STATUS: Record<string, string> = {
  PENDING: 'ждёт подтверждения',
  CONFIRMED: 'подтверждена',
  ACTIVE: 'в работе',
  COMPLETED: 'завершена',
};

function shiftMonth(year: number, month: number, delta: number) {
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

function monthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function DayDetails({
  day,
  calendar,
  onFreed,
}: {
  day: CalendarDay;
  calendar: MachineCalendarJson;
  onFreed: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const booking = day.bookingId
    ? calendar.bookings.find((row) => row.id === day.bookingId)
    : undefined;
  const block = day.blockId ? calendar.blocks.find((row) => row.id === day.blockId) : undefined;

  async function free() {
    if (!block) return;
    setBusy(true);
    setError(null);
    try {
      await callApi(`/api/equipment/${calendar.equipment.id}/blocks/${block.id}`, {
        method: 'DELETE',
      });
      onFreed();
    } catch (caught) {
      setError(errorText(caught, 'Не удалось снять блокировку'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl bg-graphite-50 p-3 text-sm text-graphite-800">
      <p className="font-semibold">
        {day.date.split('-').reverse().join('.')} — {DAY_KIND_LABELS[day.kind]}
      </p>
      {booking && (
        <p className="mt-1 text-xs text-graphite-600">
          Бронь {booking.startDate.split('-').reverse().slice(0, 2).join('.')} –{' '}
          {booking.endDate.split('-').reverse().slice(0, 2).join('.')} · {booking.customer} ·{' '}
          {formatMoney(booking.totalPrice, booking.currency)} ·{' '}
          {BOOKING_STATUS[booking.status] ?? booking.status}
          {booking.operator ? ` · машинист ${booking.operator.name}` : ''}{' '}
          <a href="#bookings" className="text-signal-700 underline">
            к броням
          </a>
        </p>
      )}
      {block && (
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-graphite-600">
          <span>
            Не сдаётся {block.from.split('-').reverse().slice(0, 2).join('.')} –{' '}
            {block.to.split('-').reverse().slice(0, 2).join('.')}
            {block.reason ? ` · ${block.reason}` : ''}
          </span>
          <button type="button" disabled={busy} onClick={free} className="cab-ghost">
            {busy ? '…' : 'Снова сдавать'}
          </button>
        </div>
      )}
      {day.kind === 'maintenance' && (
        <p className="mt-1 text-xs text-graphite-600">
          Машина отмечена «На ремонте» — верните статус «Свободна», когда она готова.
        </p>
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function BlockForm({ equipmentId, onAdded }: { equipmentId: string; onAdded: () => void }) {
  const today = todayKey();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await callApi(`/api/equipment/${equipmentId}/blocks`, {
        method: 'POST',
        body: { from, to, reason },
      });
      setReason('');
      onAdded();
    } catch (caught) {
      setError(errorText(caught, 'Не удалось заблокировать дни'));
    } finally {
      setBusy(false);
    }
  }

  const input = 'rounded-md border border-graphite-200 px-2 py-1.5 text-sm text-graphite-900';
  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <p className="text-sm font-semibold text-graphite-900">Не сдаётся</p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-graphite-600">
          С
          <input
            type="date"
            required
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            className={`${input} mt-1 block`}
          />
        </label>
        <label className="text-xs text-graphite-600">
          По
          <input
            type="date"
            required
            value={to}
            onChange={(event) => setTo(event.target.value)}
            className={`${input} mt-1 block`}
          />
        </label>
        <input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Причина (ТО, свой объект…)"
          maxLength={200}
          className={`${input} min-w-[12rem] flex-1`}
        />
        <button type="submit" disabled={busy} className="cab-ghost">
          {busy ? '…' : 'Заблокировать'}
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </form>
  );
}

export function MachineCalendar({ machines }: { machines: { id: string; name: string }[] }) {
  const [equipmentId, setEquipmentId] = useState(machines[0]?.id ?? '');
  const [period, setPeriod] = useState(() => {
    const [year, month] = todayKey().split('-').map(Number) as [number, number];
    return { year, month };
  });
  const [calendar, setCalendar] = useState<MachineCalendarJson | null>(null);
  const [selected, setSelected] = useState<CalendarDay | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!equipmentId) return;
    try {
      const result = await callApi<MachineCalendarJson>(
        `/api/equipment/${equipmentId}/calendar?month=${monthKey(period.year, period.month)}`,
      );
      setCalendar(result);
      setError(null);
    } catch (caught) {
      setError(errorText(caught, 'Не удалось загрузить календарь'));
    }
  }, [equipmentId, period]);

  useEffect(() => {
    setSelected(null);
    void load();
  }, [load]);

  if (machines.length === 0) return null;

  const firstWeekday = (new Date(Date.UTC(period.year, period.month - 1, 1)).getUTCDay() + 6) % 7;
  const legend: DayKind[] = ['free', 'booked', 'pending', 'blocked', 'maintenance'];

  return (
    <section id="calendar" className="cab-card flex scroll-mt-24 flex-col gap-3">
      <div>
        <h2 className="text-lg font-bold text-graphite-950">Календарь занятости</h2>
        <p className="text-sm text-graphite-600">
          Занятые, ожидающие и свободные дни каждой машины. Нажмите на день, чтобы увидеть бронь;
          дни, когда машина не сдаётся, блокируйте вручную.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={equipmentId}
          onChange={(event) => setEquipmentId(event.target.value)}
          aria-label="Машина"
          className="rounded-md border border-graphite-200 bg-white px-2 py-1.5 text-sm text-graphite-900"
        >
          {machines.map((machine) => (
            <option key={machine.id} value={machine.id}>
              {machine.name}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Предыдущий месяц"
            onClick={() => setPeriod((prev) => shiftMonth(prev.year, prev.month, -1))}
            className="cab-ghost min-h-[36px] px-3"
          >
            ‹
          </button>
          <span className="min-w-[9rem] text-center text-sm font-semibold text-graphite-900">
            {MONTHS[period.month - 1]} {period.year}
          </span>
          <button
            type="button"
            aria-label="Следующий месяц"
            onClick={() => setPeriod((prev) => shiftMonth(prev.year, prev.month, 1))}
            className="cab-ghost min-h-[36px] px-3"
          >
            ›
          </button>
        </div>
        {calendar?.nextFree && (
          <span className="cab-chip">
            Свободна с {calendar.nextFree.split('-').reverse().slice(0, 2).join('.')}
          </span>
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {calendar && calendar.equipment.id === equipmentId && (
        <>
          <div className="grid grid-cols-7 gap-1 text-center text-[0.7rem] font-semibold text-graphite-500">
            {WEEKDAYS.map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: firstWeekday }, (_, index) => (
              <span key={`pad-${index}`} />
            ))}
            {calendar.days.map((day) => (
              <button
                key={day.date}
                type="button"
                onClick={() => setSelected(day)}
                aria-label={`${day.date}: ${DAY_KIND_LABELS[day.kind]}`}
                aria-pressed={selected?.date === day.date}
                className={`min-h-[40px] rounded-md border text-sm font-semibold transition ${KIND_CLASS[day.kind]} ${
                  selected?.date === day.date ? 'border-signal-600' : 'border-graphite-100'
                } ${day.past ? 'opacity-50' : ''}`}
              >
                {Number(day.date.slice(-2))}
              </button>
            ))}
          </div>
          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-graphite-600">
            {legend.map((kind) => (
              <li key={kind} className="flex items-center gap-1">
                <span
                  className={`inline-block h-3 w-3 rounded-sm border border-graphite-200 ${KIND_CLASS[kind]}`}
                />
                {DAY_KIND_LABELS[kind]}
                {calendar.summary[kind] > 0 ? ` · ${calendar.summary[kind]}` : ''}
              </li>
            ))}
          </ul>
          {selected && (
            <DayDetails
              day={selected}
              calendar={calendar}
              onFreed={() => {
                setSelected(null);
                void load();
              }}
            />
          )}
          <BlockForm equipmentId={equipmentId} onAdded={() => void load()} />
        </>
      )}
    </section>
  );
}
