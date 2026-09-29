'use client';

import { useEffect, useState } from 'react';
import { SiteMap } from '@/components/SiteMap';
import { WeatherHud } from '@/components/WeatherHud';
import { machineTypeOf } from '@/lib/equipmentCatalog';
import type { ShiftWeather, WorkNote } from '@/lib/weather';

// Live preview under an order form: the weather for the chosen day at the
// typed address, and the top-down map once the address is found. Requests
// are debounced; the server caches forecasts and geocoding.

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
  const [state, setState] = useState<'idle' | 'loading' | 'far' | 'error'>('idle');

  useEffect(() => {
    if (!date) {
      setResult(null);
      setState('idle');
      return;
    }
    const params = new URLSearchParams({ date });
    const kind = machineTypeOf(categoryName ?? '');
    if (kind) params.set('kind', kind);
    if (address.trim().length >= 5) params.set('q', address.trim());
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
        if (!response.ok) throw new Error('weather');
        setResult((await response.json()) as Result);
        setState('idle');
      } catch (error) {
        if ((error as Error).name !== 'AbortError') setState('error');
      }
    }, 700);
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
  const hasAddress =
    address.trim().length >= 5 && result?.place && result.place.label !== 'Набережные Челны';

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
          className="h-40 animate-pulse rounded-3xl bg-slate-900/80"
          aria-label="Загружаем прогноз"
        />
      )}
      {result && (
        <>
          <WeatherHud
            weather={result.weather}
            notes={result.notes}
            place={
              hasAddress
                ? result.place.label.split(',').slice(-2).join(',').trim()
                : 'Набережные Челны'
            }
            dateLabel={dateLabel}
            machineLabel={kind ? `для выбранной техники` : undefined}
          />
          {hasAddress && (
            <SiteMap
              lat={result.place.lat}
              lon={result.place.lon}
              label={result.place.label}
              caption="Так мы видим место работ"
            />
          )}
        </>
      )}
    </div>
  );
}
