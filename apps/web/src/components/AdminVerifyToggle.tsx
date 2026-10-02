'use client';

import { useState } from 'react';

// /admin «Исполнители»: switch the «Проверен» mark of a provider company.
export function AdminVerifyToggle({ companyId, initial }: { companyId: string; initial: boolean }) {
  const [verified, setVerified] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    const next = !verified;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/companies/${companyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verified: next }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? 'Не удалось сохранить');
        return;
      }
      setVerified(next);
    } catch {
      setError('Нет связи');
    } finally {
      setSaving(false);
    }
  }

  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={verified}
        disabled={saving}
        onClick={() => void toggle()}
        className={`rounded-full px-3 py-1 text-xs font-bold ${
          verified ? 'bg-graphite-900 text-signal-300' : 'border border-slate-300 text-slate-600'
        }`}
      >
        {verified ? 'Проверен ✓' : 'Отметить «Проверен»'}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
