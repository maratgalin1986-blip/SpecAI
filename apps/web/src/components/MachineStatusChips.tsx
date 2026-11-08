'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { EquipmentStatusValue } from '@/lib/equipmentEdit';

// «Техника на линии»: one row per machine with status chips — Свободна,
// Занята, На ремонте. One tap saves it (PATCH /api/equipment/[id]); taking a
// machine off the site («Снять с публикации») stays in the full card below.

const CHIPS: { value: EquipmentStatusValue; label: string; active: string }[] = [
  { value: 'AVAILABLE', label: 'Свободна', active: 'bg-signal-500 text-graphite-950' },
  { value: 'RENTED', label: 'Занята', active: 'bg-graphite-900 text-white' },
  { value: 'IN_MAINTENANCE', label: 'На ремонте', active: 'bg-graphite-500 text-white' },
];

export interface StatusMachine {
  id: string;
  name: string;
  status: EquipmentStatusValue;
}

function MachineRow({ machine }: { machine: StatusMachine }) {
  const router = useRouter();
  const [status, setStatus] = useState(machine.status);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function change(next: EquipmentStatusValue) {
    if (next === status || saving) return;
    const previous = status;
    setStatus(next);
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/equipment/${machine.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setStatus(previous);
        setError(body?.error ?? 'Не удалось сохранить');
        return;
      }
      router.refresh();
    } catch {
      setStatus(previous);
      setError('Нет связи, попробуйте ещё раз');
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
      <a
        href={`/equipment/${machine.id}`}
        className="min-w-0 break-words text-sm font-semibold text-graphite-900 hover:underline"
      >
        {machine.name}
      </a>
      <div className="flex flex-col gap-1 sm:items-end">
        <div
          className="flex gap-1 rounded-full bg-graphite-50 p-1"
          role="radiogroup"
          aria-label={`Статус: ${machine.name}`}
        >
          {CHIPS.map((chip) => (
            <button
              key={chip.value}
              type="button"
              role="radio"
              aria-checked={status === chip.value}
              disabled={saving}
              onClick={() => void change(chip.value)}
              className={`min-h-[36px] flex-1 rounded-full px-3 text-xs font-bold transition sm:flex-none ${
                status === chip.value ? chip.active : 'text-graphite-600 hover:bg-white'
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    </li>
  );
}

export function MachineStatusChips({ machines }: { machines: StatusMachine[] }) {
  if (machines.length === 0) {
    return (
      <p className="text-sm text-graphite-600">
        Техники пока нет —{' '}
        <a href="#add-equipment" className="font-semibold text-signal-700 underline">
          добавьте первую машину
        </a>
        .
      </p>
    );
  }
  return (
    <ul className="divide-y divide-graphite-100">
      {machines.map((machine) => (
        // Keyed by status too: after a refresh the row starts from the saved value.
        <MachineRow key={`${machine.id}:${machine.status}`} machine={machine} />
      ))}
    </ul>
  );
}
