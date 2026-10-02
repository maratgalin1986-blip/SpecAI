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
// every keystroke; the server caches forecasts and geocoding.

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
    const query = address.trim();
    const withAddress = query.length >= 5 && /\d/.test(query);
    if (withAddress) params.set('q', query);
    const controller = new AbortController();
    const timer = window.setTimeout(
      async () => {
        setState('loading');
        try {
          const response = await fetch(`/api/weather?${params}`, { signal: controller.signal });
          if (response.status === 400) {
            setResult(null);
            setState('far');
            return;
          }
          if (!response.ok) throw new Error('weather');
          const data = (await response.json()) as Result;
          setResult(data);
          setState('idle');
          if (withAddress) {
            reachGoal(data.place.label !== 'Набережные Челны' ? 'geo_found' : 'geo_fail');
          }
        } catch (error) {
          if ((error as Error).name !== 'AbortError') setState('error');
        }
      },
      withAddress ? 1500 : 300,
    );
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
    address.trim().length >= 5 &&
    /\d/.test(address) &&
    result?.place &&
    result.place.label !== 'Набережные Челны';

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
            group={machineGroup(kind)}
          />
          {!hasAddress && /\d/.test(address) && address.trim().length >= 5 && (
            <p className="text-sm text-slate-500">
              Адрес на карте не нашёлся — не страшно: точку уточним по телефону, заявку можно
              отправлять.
            </p>
          )}
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
