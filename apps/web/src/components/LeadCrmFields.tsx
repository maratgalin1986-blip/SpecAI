'use client';

import { useState } from 'react';

// The CRM fields of one lead (/admin/leads): the city, when to call back and
// the owner's note. Saved through PATCH /api/admin/leads/[id]; the server
// moves a new lead to «В работе» once a call-back time is set.

/** A Date as the value of <input type="datetime-local"> in Moscow time. */
export function toMskLocalInput(date: Date | null): string {
  if (!date) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

/** The input's value (Moscow wall time) as an ISO instant, or null when empty. */
export function fromMskLocalInput(value: string): string | null {
  if (!value) return null;
  const date = new Date(`${value}:00+03:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function LeadCrmFields({
  id,
  city,
  callAt,
  note,
  onStatusChange,
}: {
  id: string;
  city: string | null;
  callAt: Date | null;
  note: string | null;
  onStatusChange?: (status: string) => void;
}) {
  const [cityValue, setCity] = useState(city ?? '');
  const [callValue, setCall] = useState(toMskLocalInput(callAt));
  const [noteValue, setNote] = useState(note ?? '');
  const [saved, setSaved] = useState({
    city: city ?? '',
    call: toMskLocalInput(callAt),
    note: note ?? '',
  });
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');

  const dirty = cityValue !== saved.city || callValue !== saved.call || noteValue !== saved.note;

  async function save() {
    if (!dirty || state === 'saving') return;
    setState('saving');
    const body: Record<string, unknown> = {};
    if (cityValue !== saved.city) body.city = cityValue.trim() || null;
    if (noteValue !== saved.note) body.note = noteValue.trim() || null;
    if (callValue !== saved.call) body.callAt = fromMskLocalInput(callValue);
    const response = await fetch(`/api/admin/leads/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => null);
    if (response?.ok) {
      const data = (await response.json().catch(() => null)) as {
        lead?: { status?: string };
      } | null;
      setSaved({ city: cityValue, call: callValue, note: noteValue });
      setState('saved');
      if (data?.lead?.status && onStatusChange) onStatusChange(data.lead.status);
    } else {
      setState('failed');
    }
  }

  return (
    <div className="flex w-full flex-col gap-2 text-sm">
      <div className="flex flex-wrap gap-2">
        <label className="flex flex-col gap-0.5 text-xs text-graphite-600">
          Город
          <input
            value={cityValue}
            maxLength={80}
            onChange={(e) => setCity(e.target.value)}
            onBlur={() => void save()}
            placeholder="Набережные Челны"
            className="min-w-[11rem] rounded-md border border-slate-300 px-2 py-1 text-sm text-graphite-900"
          />
        </label>
        <label className="flex flex-col gap-0.5 text-xs text-graphite-600">
          Перезвонить
          <input
            type="datetime-local"
            value={callValue}
            onChange={(e) => setCall(e.target.value)}
            onBlur={() => void save()}
            className="rounded-md border border-slate-300 px-2 py-1 text-sm text-graphite-900"
          />
        </label>
      </div>
      <label className="flex flex-col gap-0.5 text-xs text-graphite-600">
        Заметка
        <textarea
          value={noteValue}
          maxLength={2000}
          rows={2}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => void save()}
          placeholder="О чём договорились, что нужно"
          className="rounded-md border border-slate-300 px-2 py-1 text-sm text-graphite-900"
        />
      </label>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={!dirty || state === 'saving'}
          className="cab-action disabled:opacity-40"
        >
          {state === 'saving' ? 'Сохраняю…' : 'Сохранить'}
        </button>
        {state === 'saved' && !dirty && <span className="text-xs text-emerald-700">Сохранено</span>}
        {state === 'failed' && (
          <span className="text-xs text-red-700">Не сохранилось — попробуйте ещё раз</span>
        )}
      </div>
    </div>
  );
}
