'use client';

import { useState } from 'react';
import { callApi, errorText, type OperatorJson } from './client';

// «Машинист» on a booking card in /provider: pick one of the company's
// active operators (POST /api/operators/assign) or take them off.

export function OperatorSelect({
  bookingId,
  bookingStatus,
  operatorId,
  operators,
}: {
  bookingId: string;
  bookingStatus: string;
  operatorId: string | null;
  operators: Pick<OperatorJson, 'id' | 'name' | 'active'>[];
}) {
  const [value, setValue] = useState(operatorId ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locked = bookingStatus === 'CANCELLED' || bookingStatus === 'COMPLETED';
  const current = operators.find((row) => row.id === (operatorId ?? ''));

  if (locked) {
    return current ? <p className="text-xs text-graphite-600">Машинист: {current.name}</p> : null;
  }
  if (operators.length === 0) {
    return (
      <p className="text-xs text-graphite-500">
        Машинистов пока нет —{' '}
        <a href="#operators" className="text-signal-700 underline">
          добавьте
        </a>
        , чтобы назначать на брони.
      </p>
    );
  }

  async function change(next: string) {
    const previous = value;
    setValue(next);
    setSaving(true);
    setError(null);
    try {
      await callApi('/api/operators/assign', {
        method: 'POST',
        body: { bookingId, operatorId: next || null },
      });
    } catch (caught) {
      setValue(previous);
      setError(errorText(caught, 'Не удалось назначить машиниста'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <label className="flex flex-col gap-1 text-xs text-graphite-600">
      Машинист
      <select
        value={value}
        disabled={saving}
        onChange={(event) => void change(event.target.value)}
        className="rounded-md border border-graphite-200 bg-white px-2 py-1.5 text-sm text-graphite-900"
      >
        <option value="">Не назначен</option>
        {operators
          .filter((row) => row.active || row.id === value)
          .map((row) => (
            <option key={row.id} value={row.id}>
              {row.name}
              {row.active ? '' : ' (отключён)'}
            </option>
          ))}
      </select>
      {error && <span className="text-red-600">{error}</span>}
    </label>
  );
}
