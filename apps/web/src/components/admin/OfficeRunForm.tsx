'use client';

import { useState } from 'react';

// «Запустить шаг» в карточке агента на /admin/office: ниша агента + город →
// POST /api/admin/office/run, результат прогона под формой.

type RunResult = { found: number; created: number; skipped: number; error: string | null };

export function OfficeRunForm({
  agent,
  niches,
  defaultCity,
}: {
  agent: string;
  niches: { key: string; title: string }[];
  defaultCity: string;
}) {
  const [niche, setNiche] = useState(niches[0]?.key ?? '');
  const [city, setCity] = useState(defaultCity);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (running) return;
    setRunning(true);
    setResult(null);
    setError(null);
    const response = await fetch('/api/admin/office/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent, niche, city: city.trim() }),
    }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as
      (Partial<RunResult> & { error?: string | null }) | null;
    setRunning(false);
    if (!response?.ok || !body || typeof body.found !== 'number') {
      setError(
        typeof body?.error === 'string' ? body.error : 'Шаг не выполнился — попробуйте ещё раз',
      );
      return;
    }
    setResult({
      found: body.found,
      created: body.created ?? 0,
      skipped: body.skipped ?? 0,
      error: body.error ?? null,
    });
  }

  return (
    <form
      className="flex flex-col gap-2 text-sm"
      onSubmit={(event) => {
        event.preventDefault();
        void run();
      }}
    >
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-0.5 text-xs text-graphite-600">
          Ниша
          <select
            value={niche}
            onChange={(event) => setNiche(event.target.value)}
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-graphite-900"
          >
            {niches.map((n) => (
              <option key={n.key} value={n.key}>
                {n.title}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-0.5 text-xs text-graphite-600">
          Город
          <input
            value={city}
            maxLength={80}
            required
            onChange={(event) => setCity(event.target.value)}
            placeholder="Казань"
            className="min-w-[11rem] rounded-md border border-slate-300 px-2 py-1 text-sm text-graphite-900"
          />
        </label>
        <button
          type="submit"
          disabled={running || !niche || !city.trim()}
          className="cab-action disabled:opacity-40"
        >
          {running ? 'Ищу…' : 'Запустить шаг'}
        </button>
      </div>
      {result && (
        <p className="text-xs text-graphite-700">
          Найдено {result.found}, создано {result.created}, пропущено {result.skipped}.
          {result.error ? <span className="text-red-700"> Ошибка: {result.error}</span> : null}
        </p>
      )}
      {error && <p className="text-xs text-red-700">{error}</p>}
    </form>
  );
}
