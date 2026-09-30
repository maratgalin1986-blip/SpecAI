'use client';

import { useState } from 'react';
import type { LeadOutcome as Outcome } from '@specai/shared';

const LABELS: Record<Outcome, string> = {
  deal: 'Сделка',
  no_deal: 'Отказ',
  no_answer: 'Не дозвонились',
};

export function LeadOutcome({
  id,
  outcome,
  amount,
}: {
  id: string;
  outcome: string | null;
  amount: number | null;
}) {
  const [savedOutcome, setSavedOutcome] = useState(outcome ?? '');
  const [savedAmount, setSavedAmount] = useState(amount === null ? '' : String(amount));
  const [value, setValue] = useState(savedOutcome);
  const [sum, setSum] = useState(savedAmount);
  const [isSaving, setIsSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  async function save(nextOutcome: string, nextSum: string) {
    setIsSaving(true);
    setFailed(false);
    const response = await fetch(`/api/admin/leads/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        outcome: nextOutcome || null,
        amount: nextSum === '' ? null : Number(nextSum),
      }),
    }).catch(() => null);
    setIsSaving(false);
    if (response?.ok) {
      setSavedOutcome(nextOutcome);
      setSavedAmount(nextSum);
    } else {
      setValue(savedOutcome);
      setSum(savedAmount);
      setFailed(true);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={value}
        disabled={isSaving}
        onChange={(e) => {
          setValue(e.target.value);
          void save(e.target.value, sum);
        }}
        aria-label="Итог заявки"
        className="rounded-md border border-slate-300 px-2 py-1 text-sm"
      >
        <option value="">—</option>
        {(Object.keys(LABELS) as Outcome[]).map((key) => (
          <option key={key} value={key}>
            {LABELS[key]}
          </option>
        ))}
      </select>
      <input
        type="number"
        min={0}
        step={1}
        value={sum}
        disabled={isSaving}
        placeholder="Сумма, ₽"
        aria-label="Сумма, ₽"
        onChange={(e) => setSum(e.target.value)}
        onBlur={() => {
          if (sum !== savedAmount) void save(value, sum);
        }}
        className="w-28 rounded-md border border-slate-300 px-2 py-1 text-sm"
      />
      {failed && <span className="text-xs text-red-600">Не сохранилось</span>}
    </div>
  );
}
