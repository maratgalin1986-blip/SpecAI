'use client';

import { useEffect, useRef, useState } from 'react';
import type { Map as LeafletMap } from 'leaflet';
import { CHELNY, createBaseMap, escapeHtml, loadLeaflet } from '@/components/leaflet';
import { DEMAND_COLORS, DEMAND_LABELS, type CityDemand, type DemandLevel } from '@/lib/demand';

interface DemandResponse {
  cities: CityDemand[];
  categories: { name: string; level: DemandLevel; orders: number; supply: number }[];
  providerText: string | null;
}

/**
 * The demand map (/map?layer=demand): a coloured circle per Tatarstan city —
 * green, amber or red for низкий / средний / высокий demand of the last two
 * weeks (GET /api/demand). The app's «Карта спроса» screen embeds it.
 */
export function DemandMap({ embed = false }: { embed?: boolean }) {
  const element = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const [data, setData] = useState<DemandResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/demand')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((body: DemandResponse) => !cancelled && setData(body))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!data) return;
    let cancelled = false;
    loadLeaflet()
      .then((L) => {
        if (cancelled || !element.current || mapRef.current) return;
        const map = createBaseMap(L, element.current, {
          center: [CHELNY.lat, CHELNY.lon],
          zoom: 8,
        });
        mapRef.current = map;
        for (const city of data.cities) {
          const radius = 6000 + Math.min(city.orders, 20) * 900;
          L.circle([city.lat, city.lon], {
            radius,
            color: DEMAND_COLORS[city.level],
            fillColor: DEMAND_COLORS[city.level],
            fillOpacity: 0.35,
            weight: 2,
          })
            .bindPopup(
              `<strong>${escapeHtml(city.city)}</strong><br/>Спрос: ${DEMAND_LABELS[city.level]}<br/>` +
                `Заявок за 14 дней: ${city.orders}, свободных машин рядом: ${city.supply}` +
                (city.topCategory ? `<br/>Чаще всего: ${escapeHtml(city.topCategory)}` : ''),
            )
            .addTo(map);
        }
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [data]);

  return (
    <div className="flex flex-col gap-3">
      {!embed && (
        <header className="flex flex-col gap-1">
          <p className="eyebrow text-amber-700">Карта спроса · последние 14 дней</p>
          <h1 className="text-2xl font-extrabold tracking-tight">Где нужна техника</h1>
        </header>
      )}
      {data?.providerText && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {data.providerText}
        </p>
      )}
      <div
        ref={element}
        role="img"
        aria-label="Карта спроса по городам Татарстана"
        className="h-[60vh] min-h-[320px] w-full overflow-hidden rounded-2xl bg-slate-100 ring-1 ring-slate-200"
      />
      {failed && (
        <p role="alert" className="text-sm text-red-700">
          Не удалось загрузить карту спроса — попробуйте позже.
        </p>
      )}
      <ul className="flex flex-wrap gap-3 text-xs text-slate-600">
        {(Object.keys(DEMAND_LABELS) as DemandLevel[]).map((level) => (
          <li key={level} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block h-3 w-3 rounded-full"
              style={{ background: DEMAND_COLORS[level] }}
            />
            {DEMAND_LABELS[level]}
          </li>
        ))}
      </ul>
      {data && data.categories.length > 0 && (
        <ul className="grid gap-2 sm:grid-cols-2">
          {data.categories.slice(0, 8).map((row) => (
            <li
              key={row.name}
              className="flex items-center justify-between rounded-xl bg-white px-3 py-2 text-sm ring-1 ring-slate-200"
            >
              <span>{row.name}</span>
              <span className="font-semibold" style={{ color: DEMAND_COLORS[row.level] }}>
                {DEMAND_LABELS[row.level]} · {row.orders} / {row.supply}
              </span>
            </li>
          ))}
        </ul>
      )}
      {data && data.cities.length === 0 && (
        <p className="text-sm text-slate-600">За две недели заявок с адресом не было.</p>
      )}
    </div>
  );
}
