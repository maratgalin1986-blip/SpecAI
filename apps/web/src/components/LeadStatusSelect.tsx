'use client';

import { useState } from 'react';
import type { LeadStatus } from '@specai/shared';

const LABELS: Record<LeadStatus, string> = {
  NEW: 'Новая',
  IN_PROGRESS: 'В работе',
  DONE: 'Обработана',
};

export function LeadStatusSelect({ id, status }: { id: string; status: LeadStatus }) {
  const [value, setValue] = useState(status);
  const [isSaving, setIsSaving] = useState(false);

  async function change(next: LeadStatus) {
    const previous = value;
    setValue(next);
    setIsSaving(true);
    const response = await fetch(`/api/admin/leads/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    });
    setIsSaving(false);
    if (!response.ok) setValue(previous);
  }

  return (
    <select
      value={value}
      disabled={isSaving}
      onChange={(e) => change(e.target.value as LeadStatus)}
      aria-label="Статус заявки"
      className={`rounded-md border px-2 py-1 text-sm ${
        value === 'NEW'
          ? 'border-amber-400 bg-amber-50'
          : value === 'IN_PROGRESS'
            ? 'border-sky-400 bg-sky-50'
            : 'border-slate-300 bg-slate-50 text-slate-500'
      }`}
    >
      {(Object.keys(LABELS) as LeadStatus[]).map((key) => (
        <option key={key} value={key}>
          {LABELS[key]}
        </option>
      ))}
    </select>
  );
}
