'use client';

import { useEffect, useState } from 'react';
import { SiteMap } from '@/components/SiteMap';
import { WeatherHud } from '@/components/WeatherHud';
import { machineTypeOf } from '@/lib/equipmentCatalog';
import { reachGoal } from '@/lib/marketing';
import { machineGroup } from '@/lib/weather';
import type { ShiftWeather, WorkNote } from '@/lib/weather';

// Live preview under an order form: the weather for the chosen day at the
// typed address, and the top-down map once the address is found. The address
// is looked up only after a 1.5 s pause and once it has a house number, not on
// every keystroke; the server caches forecasts and geocoding. Without a found
// address there is no forecast: the platform serves all of Russia, so there is
// no default town to show the weather for.

type Result = {
  place: { lat: number; lon: number; label: string };
  weather: ShiftWeather | null;
  notes: WorkNote[];
};

export function ConditionsPreview({
  date,
  address,
  categoryName,
}: {
  /** YYYY-MM-DD */
  date: string;
  address: string;
  categoryName?: string;
}) {
  const [result, setResult] = useState<Result | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'far' | 'error' | 'not_found'>('idle');

  useEffect(() => {
    if (!date) {
      setResult(null);
      setState('idle');
      return;
    }
    const params = new URLSearchParams({ date });
    const kind = machineTypeOf(categoryName ?? '');
    if (kind) params.set('kind', kind);
    const query = address.trim();
    if (!(query.length >= 5 && /\d/.test(query))) {
      setResult(null);
      setState('idle');
      return;
    }
    params.set('q', query);
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setState('loading');
      try {
        const response = await fetch(`/api/weather?${params}`, { signal: controller.signal });
        if (response.status === 400) {
          setResult(null);
          setState('far');
          return;
        }
        if (response.status === 404) {
          setResult(null);
          setState('not_found');
          reachGoal('geo_fail');
          return;
        }
        if (!response.ok) throw new Error('weather');
        const data = (await response.json()) as Result;
        setResult(data);
        setState('idle');
        reachGoal('geo_found');
      } catch (error) {
        if ((error as Error).name !== 'AbortError') setState('error');
      }
    }, 1500);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [date, address, categoryName]);

  if (!date) return null;
  const dateLabel = new Date(`${date}T12:00:00`).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
  });
  const kind = machineTypeOf(categoryName ?? '');

  return (
    <div className="flex flex-col gap-3" aria-live="polite">
      {state === 'far' && (
        <p className="text-sm text-slate-500">
          Прогноз погоды на {dateLabel} появится за 9 дней до даты работ.
        </p>
      )}
      {state === 'error' && (
        <p className="text-sm text-slate-500">
          Прогноз сейчас не загрузился — это не мешает заявке.
        </p>
      )}
      {state === 'loading' && !result && (
        <div
          className="skeleton skeleton-dark h-40 rounded-3xl bg-slate-900/80"
          aria-label="Загружаем прогноз"
        />
      )}
      {result && (
        <>
          <WeatherHud
            weather={result.weather}
            notes={result.notes}
            place={result.place.label.split(',').slice(-2).join(',').trim()}
            dateLabel={dateLabel}
            machineLabel={kind ? `для выбранной техники` : undefined}
            group={machineGroup(kind)}
          />
          <SiteMap
            lat={result.place.lat}
            lon={result.place.lon}
            label={result.place.label}
            caption="Так мы видим место работ"
          />
        </>
      )}
      {state === 'not_found' && (
        <p className="text-sm text-slate-500">
          Адрес на карте не нашёлся — не страшно: точку уточним по телефону, заявку можно
          отправлять.
        </p>
      )}
    </div>
  );
}
