'use client';

import { useEffect, useRef, useState } from 'react';
import type { Map as LeafletMap, Marker } from 'leaflet';
import { CHELNY, createBaseMap, loadLeaflet, pinIcon } from '@/components/leaflet';
import { formatCoords, inServiceArea } from '@/lib/geo';
import type { MapPoint } from '@/lib/mapPoint';

// «Нет адреса на карте? Поставьте точку»: a small map for a work site with
// no address yet. Tap the map or drag the pin, then «Готово». Leaflet loads
// only when the visitor opens it.

export function PointPicker({
  value,
  onPick,
  dark = false,
  label = '📍 Нет адреса на карте? Поставьте точку',
}: {
  value: MapPoint | null;
  onPick: (point: MapPoint | null) => void;
  dark?: boolean;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [point, setPoint] = useState<MapPoint | null>(value);
  const [status, setStatus] = useState<string | null>(null);
  const element = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<Marker | null>(null);

  const muted = dark ? 'text-white/60' : 'text-slate-500';

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void loadLeaflet().then((L) => {
      if (cancelled || !element.current || mapRef.current) return;
      const start = point ?? { lat: CHELNY.lat, lon: CHELNY.lon };
      const map = createBaseMap(L, element.current, {
        center: [start.lat, start.lon],
        zoom: point ? 16 : 12,
      });
      mapRef.current = map;
      const place = (lat: number, lon: number) => {
        if (!inServiceArea(lat, lon)) {
          setStatus('Работаем в Татарстане и соседних регионах — поставьте точку ближе');
          return;
        }
        setStatus(null);
        setPoint({ lat, lon });
        if (!markerRef.current) {
          markerRef.current = L.marker([lat, lon], {
            icon: pinIcon(L, { imageUrl: null, isHouse: true }, 44),
            draggable: true,
          })
            .on('dragend', () => {
              const moved = markerRef.current?.getLatLng();
              if (moved) place(moved.lat, moved.lng);
            })
            .addTo(map);
        } else {
          markerRef.current.setLatLng([lat, lon]);
        }
      };
      if (point) place(point.lat, point.lon);
      map.on('click', (event) => place(event.latlng.lat, event.latlng.lng));
    });
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // The map is built once per opening; later moves go through `place`.
  }, [open]);

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`text-left text-sm underline decoration-dotted underline-offset-4 ${muted} hover:text-amber-500`}
        >
          {value ? `📍 Точка: ${formatCoords(value.lat, value.lon)} — изменить` : label}
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onPick(null)}
            className={`text-xs ${muted} hover:text-red-500`}
          >
            убрать
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className={`text-sm ${muted}`}>
        Нажмите на карту там, где будет работать техника. Значок можно перетащить.
      </p>
      <div
        ref={element}
        className="h-64 w-full overflow-hidden rounded-xl bg-slate-200 ring-1 ring-slate-200"
        aria-label="Карта: нажмите, чтобы отметить место работ"
      />
      {status && <p className="text-xs text-amber-600">{status}</p>}
      <div className="flex items-center gap-4">
        <button
          type="button"
          disabled={!point}
          onClick={() => {
            onPick(point);
            setOpen(false);
          }}
          className="inline-flex min-h-11 items-center rounded-full bg-amber-500 px-5 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50"
        >
          {point ? 'Готово' : 'Отметьте точку'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className={`text-sm ${muted}`}>
          Отмена
        </button>
      </div>
    </div>
  );
}
