'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

// «План обхода» на /admin/office (R2): строки «агент; ниша; город», пауза поиска →
// PUT /api/admin/office/settings. Новый план начинает обход с первой строки.

export function OfficePlanForm({ plan, paused }: { plan: string; paused: boolean }) {
  const router = useRouter();
  const [text, setText] = useState(plan);
  const [isPaused, setPaused] = useState(paused);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  const planChanged = text !== plan;
  const dirty = planChanged || isPaused !== paused;

  async function save() {
    if (saving || !dirty) return;
    setSaving(true);
    setMessage(null);
    setErrors([]);
    const body: Record<string, unknown> = {};
    if (planChanged) body.plan = text;
    if (isPaused !== paused) body.paused = isPaused;
    const response = await fetch('/api/admin/office/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => null);
    const data = (await response?.json().catch(() => null)) as {
      ok?: boolean;
      error?: string;
      errors?: string[];
    } | null;
    setSaving(false);
    if (!response?.ok || !data?.ok) {
      setMessage({
        ok: false,
        text: typeof data?.error === 'string' ? data.error : 'Не сохранилось — попробуйте ещё раз',
      });
      if (Array.isArray(data?.errors)) setErrors(data.errors);
      return;
    }
    setMessage({
      ok: true,
      text: planChanged ? 'План сохранён, обход начнётся с первой строки' : 'Сохранено',
    });
    router.refresh();
  }

  return (
    <form
      className="flex flex-col gap-2 text-sm"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <label className="flex flex-col gap-0.5 text-xs text-graphite-600">
        Строки «агент; ниша; город» — по кругу, один шаг в час. Агенты: providers, sites.
        <textarea
          value={text}
          rows={10}
          maxLength={50_000}
          onChange={(event) => setText(event.target.value)}
          spellCheck={false}
          className="rounded-md border border-slate-300 px-2 py-1 font-mono text-xs text-graphite-900"
        />
      </label>
      <label className="flex min-h-9 items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={isPaused}
          onChange={(event) => setPaused(event.target.checked)}
          className="h-4 w-4"
        />
        Пауза поиска
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={saving || !dirty}
          className="cab-action disabled:opacity-40"
        >
          {saving ? 'Сохраняю…' : 'Сохранить'}
        </button>
        {message && (
          <span className={`text-xs ${message.ok ? 'text-emerald-700' : 'text-red-700'}`}>
            {message.text}
          </span>
        )}
      </div>
      {errors.length > 0 && (
        <ul className="list-disc pl-5 text-xs text-red-700">
          {errors.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      )}
    </form>
  );
}
