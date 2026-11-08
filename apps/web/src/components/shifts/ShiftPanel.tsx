'use client';

import { useCallback, useEffect, useState } from 'react';
import { SHIFT_ACTION_LABELS, type ShiftStatus } from '@specai/shared';
import { TIMESHEET_STATE_LABELS } from '@/lib/shiftRules';
import {
  callApi,
  errorText,
  formatDay,
  formatTime,
  todayKey,
  type ShiftJson,
  type TimesheetJson,
} from './client';

// Shift statuses of the operator and the timesheet, per booking. The
// customer watches (polling every 30 s) and confirms or disputes the
// timesheet; the provider's admin opens a shift, may move it, fills the
// timesheet and confirms it. Mounted in /dashboard and /provider.

const POLL_MS = 30_000;

const STATUS_TONE: Record<string, string> = {
  PLANNED: 'bg-graphite-100 text-graphite-700',
  EN_ROUTE: 'bg-sky-100 text-sky-800',
  ON_SITE: 'bg-sky-100 text-sky-800',
  WORKING: 'bg-emerald-100 text-emerald-800',
  IDLE: 'bg-amber-100 text-amber-800',
  FINISHED: 'bg-graphite-900 text-white',
};

export type ShiftRole = 'customer' | 'provider';

function TimesheetForm({
  shift,
  onSaved,
}: {
  shift: ShiftJson;
  onSaved: (shift: ShiftJson) => void;
}) {
  const suggested = Math.round((shift.workedMinutes / 60) * 4) / 4;
  const [hours, setHours] = useState(String(suggested || 8));
  const [idle, setIdle] = useState(String(Math.round((shift.idleMinutes / 60) * 4) / 4));
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const result = await callApi<{ shift: ShiftJson }>('/api/timesheets', {
        method: 'POST',
        body: { shiftId: shift.id, hoursWorked: hours, idleHours: idle || 0, note },
      });
      onSaved(result.shift);
    } catch (caught) {
      setError(errorText(caught, 'Не удалось сохранить табель'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 rounded-xl bg-graphite-50 p-3">
      <p className="text-sm font-semibold text-graphite-900">Табель смены</p>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-graphite-600">
          Отработано, ч
          <input
            type="number"
            min={0}
            max={24}
            step={0.25}
            required
            value={hours}
            onChange={(event) => setHours(event.target.value)}
            className="mt-1 w-full rounded-md border border-graphite-200 px-2 py-1.5 text-sm text-graphite-900"
          />
        </label>
        <label className="text-xs text-graphite-600">
          Простой, ч
          <input
            type="number"
            min={0}
            max={24}
            step={0.25}
            value={idle}
            onChange={(event) => setIdle(event.target.value)}
            className="mt-1 w-full rounded-md border border-graphite-200 px-2 py-1.5 text-sm text-graphite-900"
          />
        </label>
      </div>
      <input
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Примечание (необязательно)"
        maxLength={1000}
        className="w-full rounded-md border border-graphite-200 px-2 py-1.5 text-sm text-graphite-900"
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button type="submit" disabled={saving} className="cab-action w-full sm:w-auto">
        {saving ? '…' : 'Отправить заказчику'}
      </button>
    </form>
  );
}

function TimesheetView({
  timesheet,
  role,
  onChanged,
}: {
  timesheet: TimesheetJson;
  role: ShiftRole;
  onChanged: (shift: ShiftJson) => void;
}) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mine = role === 'customer' ? timesheet.customerConfirmedAt : timesheet.providerConfirmedAt;
  const canAct = timesheet.state !== 'final' && !mine;

  async function review(action: 'confirm' | 'dispute') {
    let note: string | undefined;
    if (action === 'dispute') {
      const typed = window.prompt('Что не так с табелем? Исполнитель увидит ваше замечание.');
      if (!typed?.trim()) return;
      note = typed.trim();
    }
    setPending(action);
    setError(null);
    try {
      const result = await callApi<{ shift: ShiftJson }>(`/api/timesheets/${timesheet.id}`, {
        method: 'PATCH',
        body: { action, note },
      });
      onChanged(result.shift);
    } catch (caught) {
      setError(errorText(caught, 'Не удалось сохранить'));
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-graphite-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-graphite-900">
          Табель: {timesheet.hoursWorked} ч
          {Number(timesheet.idleHours) > 0 ? ` · простой ${timesheet.idleHours} ч` : ''}
        </p>
        <span
          className={`rounded-full px-2 py-0.5 text-[0.7rem] font-semibold ${
            timesheet.state === 'final'
              ? 'bg-emerald-100 text-emerald-800'
              : timesheet.state === 'disputed'
                ? 'bg-red-100 text-red-800'
                : 'bg-amber-100 text-amber-800'
          }`}
        >
          {TIMESHEET_STATE_LABELS[timesheet.state]}
        </span>
      </div>
      {timesheet.note && <p className="text-xs text-graphite-600">{timesheet.note}</p>}
      <p className="text-xs text-graphite-500">
        Заказчик: {timesheet.customerConfirmedAt ? 'подтвердил' : '—'} · Исполнитель:{' '}
        {timesheet.providerConfirmedAt ? 'подтвердил' : '—'}
      </p>
      {timesheet.disputeNote && (
        <p className="text-xs text-red-700">Замечание: {timesheet.disputeNote}</p>
      )}
      {canAct && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending !== null}
            onClick={() => review('confirm')}
            className="cab-action"
          >
            {pending === 'confirm' ? '…' : 'Подтвердить часы'}
          </button>
          <button
            type="button"
            disabled={pending !== null}
            onClick={() => review('dispute')}
            className="cab-ghost"
          >
            {pending === 'dispute' ? '…' : 'Есть замечания'}
          </button>
        </div>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

function ShiftCard({
  shift,
  role,
  onChanged,
}: {
  shift: ShiftJson;
  role: ShiftRole;
  onChanged: (shift: ShiftJson) => void;
}) {
  const [open, setOpen] = useState(shift.status !== 'FINISHED');
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function move(status: ShiftStatus) {
    let note: string | undefined;
    if (status === 'IDLE') {
      const typed = window.prompt('Причина простоя (заказчик её увидит):');
      if (!typed?.trim()) return;
      note = typed.trim();
    }
    setPending(status);
    setError(null);
    try {
      const result = await callApi<{ shift: ShiftJson }>(`/api/shifts/${shift.id}`, {
        method: 'PATCH',
        body: { status, note },
      });
      onChanged(result.shift);
    } catch (caught) {
      setError(errorText(caught, 'Не удалось изменить статус смены'));
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="rounded-xl border border-graphite-100 p-3">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full flex-wrap items-center justify-between gap-2 text-left"
      >
        <span className="text-sm font-semibold text-graphite-900">
          Смена {formatDay(shift.date)}
          {shift.operator ? ` · ${shift.operator.name}` : ''}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[0.7rem] font-semibold ${STATUS_TONE[shift.status] ?? STATUS_TONE.PLANNED}`}
        >
          {shift.statusLabel}
        </span>
      </button>
      <p className="mt-1 text-xs text-graphite-500">
        Работа: {shift.workedLabel} · Простой: {shift.idleLabel}
      </p>
      {open && (
        <div className="mt-2 flex flex-col gap-2">
          {shift.events.length > 0 && (
            <ol className="flex flex-col gap-1 text-xs text-graphite-700">
              {shift.events.map((event) => (
                <li key={event.id} className="flex flex-wrap gap-x-2">
                  <span className="font-mono text-graphite-500">{formatTime(event.at)}</span>
                  <span className="font-semibold">{event.label}</span>
                  {event.note && <span className="text-graphite-600">— {event.note}</span>}
                  {event.photoUrl && (
                    <a
                      href={event.photoUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-signal-700 underline"
                    >
                      фото
                    </a>
                  )}
                </li>
              ))}
            </ol>
          )}
          {(shift.startPhotoUrl || shift.endPhotoUrl) && (
            <div className="flex gap-2">
              {shift.startPhotoUrl && (
                <a href={shift.startPhotoUrl} target="_blank" rel="noreferrer">
                  <img
                    src={shift.startPhotoUrl}
                    alt="Фото в начале смены"
                    className="h-16 w-16 rounded-md object-cover"
                  />
                </a>
              )}
              {shift.endPhotoUrl && (
                <a href={shift.endPhotoUrl} target="_blank" rel="noreferrer">
                  <img
                    src={shift.endPhotoUrl}
                    alt="Фото в конце смены"
                    className="h-16 w-16 rounded-md object-cover"
                  />
                </a>
              )}
            </div>
          )}
          {role === 'provider' && shift.next.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {shift.next.map((status) => (
                <button
                  key={status}
                  type="button"
                  disabled={pending !== null}
                  onClick={() => move(status as ShiftStatus)}
                  className={status === 'FINISHED' ? 'cab-action' : 'cab-ghost'}
                >
                  {pending === status ? '…' : SHIFT_ACTION_LABELS[status as ShiftStatus]}
                </button>
              ))}
            </div>
          )}
          {shift.timesheet ? (
            <TimesheetView timesheet={shift.timesheet} role={role} onChanged={onChanged} />
          ) : shift.status === 'FINISHED' && role === 'provider' ? (
            <TimesheetForm shift={shift} onSaved={onChanged} />
          ) : shift.status === 'FINISHED' ? (
            <p className="text-xs text-graphite-500">Исполнитель заполняет табель смены.</p>
          ) : null}
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}

export function ShiftPanel({
  bookingId,
  bookingStatus,
  role,
}: {
  bookingId: string;
  bookingStatus: string;
  role: ShiftRole;
}) {
  const [shifts, setShifts] = useState<ShiftJson[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const canHaveShifts = ['CONFIRMED', 'ACTIVE', 'COMPLETED'].includes(bookingStatus);

  const load = useCallback(async () => {
    try {
      const result = await callApi<{ shifts: ShiftJson[] }>(
        `/api/shifts?bookingId=${encodeURIComponent(bookingId)}`,
      );
      setShifts(result.shifts);
      setError(null);
    } catch (caught) {
      setError(errorText(caught, 'Не удалось загрузить смены'));
      setShifts((prev) => prev ?? []);
    }
  }, [bookingId]);

  useEffect(() => {
    if (!canHaveShifts) return undefined;
    void load();
    // The customer sees the operator's moves within half a minute; a
    // completed booking is loaded once.
    if (bookingStatus === 'COMPLETED') return undefined;
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [load, canHaveShifts, bookingStatus]);

  if (!canHaveShifts) return null;

  const replace = (shift: ShiftJson) =>
    setShifts((prev) => (prev ?? []).map((row) => (row.id === shift.id ? shift : row)));

  async function openToday() {
    setOpening(true);
    setError(null);
    try {
      const result = await callApi<{ shift: ShiftJson }>('/api/shifts', {
        method: 'POST',
        body: { bookingId },
      });
      setShifts((prev) => {
        const rest = (prev ?? []).filter((row) => row.id !== result.shift.id);
        return [result.shift, ...rest];
      });
    } catch (caught) {
      setError(errorText(caught, 'Не удалось открыть смену'));
    } finally {
      setOpening(false);
    }
  }

  const today = todayKey();
  const hasToday = shifts?.some((shift) => shift.date === today) ?? false;
  const canOpen =
    role === 'provider' &&
    !hasToday &&
    (bookingStatus === 'CONFIRMED' || bookingStatus === 'ACTIVE');

  return (
    <div className="mt-2 flex flex-col gap-2" aria-label="Смены по брони">
      {shifts === null ? (
        <p className="text-xs text-graphite-500">Загружаем смены…</p>
      ) : shifts.length === 0 ? (
        <p className="text-xs text-graphite-500">
          {role === 'customer'
            ? 'Статусы машиниста появятся здесь, когда он выедет на объект.'
            : 'Смен ещё нет — машинист откроет смену в приложении.'}
        </p>
      ) : (
        shifts.map((shift) => (
          <ShiftCard key={shift.id} shift={shift} role={role} onChanged={replace} />
        ))
      )}
      {canOpen && (
        <button type="button" disabled={opening} onClick={openToday} className="cab-ghost w-fit">
          {opening ? '…' : 'Открыть смену на сегодня'}
        </button>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
