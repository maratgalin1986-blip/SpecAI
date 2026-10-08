'use client';

import { memo, useState } from 'react';
import { mskToday } from '@/lib/weather';

// Date, time and the live weather on the object, always on screen (owner,
// 2026-10-03): small type in an acid colour that changes every 5 s, and an
// offer to check the weather on the object for any day of the forecast.
//
// The film review (2026-10-03) asked for calm small caps instead of a colour
// carousel; it stays acid and bright, but the change is subtle: a slow
// cross-fade between three acid tones (.acid-cycle in globals.css: #39ff14,
// #d7ff1f, #3cf2ff, about 5 s each), with no glow on the type. On phones the
// line wraps to two rows instead of being cut, and the tap target is 44 px.
// The badge is memoised, so the busy /stroyka page does not re-render it.

type Note = { level: 'ok' | 'caution' | 'stop'; title: string; advice: string };
type Forecast = {
  place: { label: string };
  weather: {
    tempMin: number;
    tempMax: number;
    windMax: number;
    precip: number;
    rain: boolean;
    snow: boolean;
    thunder: boolean;
  } | null;
  notes: Note[];
};

const days = () =>
  Array.from({ length: 10 }, (_, i) => {
    const d = new Date(Date.parse(`${mskToday()}T12:00:00Z`) + i * 86_400_000);
    const iso = d.toISOString().slice(0, 10);
    const label =
      i === 0
        ? 'Сегодня'
        : i === 1
          ? 'Завтра'
          : d.toLocaleDateString('ru-RU', {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
              timeZone: 'UTC',
            });
    return { iso, label };
  });

const signed = (t: number) => `${t > 0 ? '+' : ''}${Math.round(t)}°`;

export const WeatherBadge = memo(function WeatherBadge({
  line,
  machine,
}: {
  line: string;
  machine?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(() => mskToday());
  const [address, setAddress] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [result, setResult] = useState<Forecast | null>(null);
  const [error, setError] = useState('');

  async function check(event: React.FormEvent) {
    event.preventDefault();
    setState('loading');
    setResult(null);
    const params = new URLSearchParams({ date, kind: machine ?? 'any' });
    if (address.trim().length >= 3) params.set('q', address.trim());
    try {
      const res = await fetch(`/api/weather?${params}`);
      const body = await res.json().catch(() => null);
      if (!res.ok || !body) throw new Error(body?.error ?? 'Прогноз недоступен');
      setResult(body as Forecast);
      setState('idle');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Прогноз недоступен');
      setState('error');
    }
  }

  return (
    <div className="pointer-events-auto relative inline-block max-w-full">
      <button
        type="button"
        data-testid="conditions"
        onClick={() => setOpen((v) => !v)}
        className="acid-cycle flex min-h-11 max-w-full flex-nowrap items-center gap-x-1.5 rounded-2xl bg-slate-950/80 px-3 py-1 text-left font-mono text-[11px] font-bold uppercase leading-snug tracking-wide antialiased sm:flex-nowrap sm:rounded-full sm:text-xs"
        aria-expanded={open}
      >
        <span className="min-w-0 sm:truncate">{line}</span>
        <span className="shrink-0 underline decoration-dotted underline-offset-2">
          <span className="sr-only sm:not-sr-only">· на дату </span>▾
        </span>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-40 mt-2 w-[min(88vw,340px)] rounded-2xl bg-slate-950/95 p-4 text-sm text-white shadow-2xl ring-1 ring-white/15 backdrop-blur">
          <p className="font-semibold">Погода на объекте на дату</p>
          <p className="mt-1 text-xs text-slate-400">
            Прогноз на 9 дней и подскажем, можно ли работать технике.
          </p>
          <form onSubmit={check} className="mt-3 flex flex-col gap-2">
            <select
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-label="Дата"
              className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2"
            >
              {days().map((d) => (
                <option key={d.iso} value={d.iso}>
                  {d.label}
                </option>
              ))}
            </select>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              maxLength={200}
              placeholder="Адрес объекта (по умолчанию Челны)"
              aria-label="Адрес объекта"
              className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 placeholder:text-slate-500"
            />
            <button
              type="submit"
              disabled={state === 'loading'}
              className="rounded-full bg-amber-500 px-4 py-2 font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-60"
            >
              {state === 'loading' ? 'Смотрим…' : 'Показать погоду'}
            </button>
          </form>
          {state === 'error' && <p className="mt-3 text-amber-300">{error}</p>}
          {result && (
            <div className="mt-3 rounded-xl bg-white/5 p-3" data-testid="forecast">
              <p className="font-semibold">{result.place.label}</p>
              {result.weather ? (
                <p className="mt-1 text-slate-200">
                  {signed(result.weather.tempMin)}…{signed(result.weather.tempMax)}, ветер до{' '}
                  {Math.round(result.weather.windMax)} м/с
                  {result.weather.thunder
                    ? ', гроза'
                    : result.weather.snow
                      ? ', снег'
                      : result.weather.rain
                        ? `, дождь ${result.weather.precip} мм`
                        : ', без осадков'}
                </p>
              ) : (
                <p className="mt-1 text-slate-400">На эту дату прогноза пока нет.</p>
              )}
              <ul className="mt-2 flex flex-col gap-1">
                {result.notes.slice(0, 3).map((n) => (
                  <li
                    key={n.title}
                    className={
                      n.level === 'stop'
                        ? 'text-red-300'
                        : n.level === 'caution'
                          ? 'text-amber-200'
                          : 'text-emerald-300'
                    }
                  >
                    {n.level === 'stop' ? '⛔' : n.level === 'caution' ? '⚠️' : '✅'} {n.title}
                  </li>
                ))}
              </ul>
              <a
                href="?order=1"
                className="mt-3 inline-block rounded-full bg-white px-4 py-1.5 text-xs font-bold text-slate-950"
              >
                Заказать технику на этот день →
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
});
