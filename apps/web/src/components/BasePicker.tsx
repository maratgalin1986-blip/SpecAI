'use client';

import { useEffect, useRef, useState } from 'react';
import type { Map as LeafletMap, Marker } from 'leaflet';
import { CHELNY, createBaseMap, loadLeaflet, pinIcon } from '@/components/leaflet';
import { formatCoords, inServiceArea } from '@/lib/geo';

// Where the provider's machinery stands: type the address and press «Найти»
// (the site's geocoder), or tap the map / drag the marker. The parent keeps
// the value and sends it with the form; the server checks it again.

export type BaseValue = { address: string; lat: number | null; lon: number | null };

export function BasePicker({
  value,
  onChange,
  imageUrl = null,
}: {
  value: BaseValue;
  onChange: (next: BaseValue) => void;
  imageUrl?: string | null;
}) {
  const element = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [status, setStatus] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  // The map, once.
  useEffect(() => {
    let cancelled = false;
    void loadLeaflet().then((L) => {
      if (cancelled || !element.current || mapRef.current) return;
      const start = valueRef.current;
      const map = createBaseMap(L, element.current, {
        center:
          start.lat !== null && start.lon !== null
            ? [start.lat, start.lon]
            : [CHELNY.lat, CHELNY.lon],
        zoom: start.lat !== null ? 14 : 10,
      });
      mapRef.current = map;
      map.on('click', (event) => {
        const { lat, lng } = event.latlng;
        if (!inServiceArea(lat, lng)) {
          setStatus('Точка должна быть в Татарстане или соседних регионах');
          return;
        }
        setStatus(null);
        onChangeRef.current({ ...valueRef.current, lat, lon: lng });
      });
    });
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  // The marker follows the value.
  useEffect(() => {
    void loadLeaflet().then((L) => {
      const map = mapRef.current;
      if (!map) return;
      if (value.lat === null || value.lon === null) {
        markerRef.current?.remove();
        markerRef.current = null;
        return;
      }
      const icon = pinIcon(L, { imageUrl }, 44);
      if (!markerRef.current) {
        markerRef.current = L.marker([value.lat, value.lon], { icon, draggable: true })
          .on('dragend', () => {
            const point = markerRef.current?.getLatLng();
            if (!point) return;
            if (!inServiceArea(point.lat, point.lng)) {
              setStatus('Точка должна быть в Татарстане или соседних регионах');
              return;
            }
            onChangeRef.current({ ...valueRef.current, lat: point.lat, lon: point.lng });
          })
          .addTo(map);
      } else {
        markerRef.current.setLatLng([value.lat, value.lon]);
        markerRef.current.setIcon(icon);
      }
    });
  }, [value.lat, value.lon, imageUrl]);

  async function search() {
    const query = value.address.trim();
    if (query.length < 3) {
      setStatus('Введите адрес: город, улица, дом');
      return;
    }
    setSearching(true);
    setStatus(null);
    try {
      const response = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
      const body = (await response.json().catch(() => null)) as {
        place?: { lat: number; lon: number; label: string };
        error?: string;
      } | null;
      if (!response.ok || !body?.place) {
        setStatus(
          body?.error === 'Адрес не найден'
            ? 'Адрес не найден — уточните его или поставьте точку на карте'
            : (body?.error ?? 'Не удалось найти адрес'),
        );
        return;
      }
      const { lat, lon, label } = body.place;
      if (!inServiceArea(lat, lon)) {
        setStatus('Адрес вне Татарстана и соседних регионов — проверьте его');
        return;
      }
      onChange({ ...value, lat, lon });
      setStatus(`Найдено: ${label}. Если точка неточная — передвиньте значок.`);
      mapRef.current?.setView([lat, lon], 15);
    } catch {
      setStatus('Нет связи с сервером, попробуйте ещё раз');
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          value={value.address}
          onChange={(event) => onChange({ ...value, address: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void search();
            }
          }}
          maxLength={200}
          placeholder="Набережные Челны, Мензелинский тракт, 24"
          aria-label="Адрес базы"
          className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2"
        />
        <button
          type="button"
          onClick={() => void search()}
          disabled={searching}
          className="shrink-0 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold hover:border-slate-900 disabled:opacity-60"
        >
          {searching ? 'Ищем…' : 'Найти'}
        </button>
      </div>
      <div
        ref={element}
        className="h-64 w-full overflow-hidden rounded-xl bg-slate-200 ring-1 ring-slate-200 sm:h-72"
        aria-label="Карта: нажмите, чтобы поставить точку базы"
      />
      <p className="text-xs text-slate-500">
        {value.lat !== null && value.lon !== null
          ? `Точка: ${formatCoords(value.lat, value.lon)} — значок можно перетащить.`
          : 'Нажмите «Найти» или просто нажмите на карту там, где стоит техника.'}
      </p>
      {status && <p className="text-xs text-amber-800">{status}</p>}
    </div>
  );
}
