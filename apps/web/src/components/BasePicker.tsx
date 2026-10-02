'use client';

import { useEffect, useRef, useState } from 'react';
import type { Map as LeafletMap, Marker } from 'leaflet';
import { CHELNY, createBaseMap, loadLeaflet, pinIcon } from '@/components/leaflet';
import { formatCoords, inServiceArea } from '@/lib/geo';
import { baseAfterAddressEdit } from '@/lib/providerMap';

// Where the provider's machinery stands: type the address and press «Найти»
// (the site's geocoder), or tap the map / drag the marker. The parent keeps
// the value and sends it with the form; the server checks it again.
// A point found by «Найти» (or the saved one) belongs to its address: when the
// address is edited afterwards the point is dropped, so the server geocodes
// the new address instead of keeping the old point.

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
  // The address the current point was found for; null once the point was
  // placed by hand (then the address is only a label).
  const foundFor = useRef<string | null>(
    value.lat !== null && value.address.trim() ? value.address.trim() : null,
  );

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
        foundFor.current = null;
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
            foundFor.current = null;
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
          response.status === 404
            ? 'Адрес не найден — уточните его или поставьте точку на карте'
            : response.status === 503
              ? (body?.error ??
                'Сервис поиска адресов не ответил — попробуйте позже или поставьте точку на карте')
              : (body?.error ?? 'Не удалось найти адрес'),
        );
        return;
      }
      const { lat, lon, label } = body.place;
      if (!inServiceArea(lat, lon)) {
        setStatus('Адрес вне Татарстана и соседних регионов — проверьте его');
        return;
      }
      foundFor.current = query;
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
          onChange={(event) => {
            const next = baseAfterAddressEdit(value, event.target.value, foundFor.current);
            if (next.lat === null && value.lat !== null) {
              foundFor.current = null;
              setStatus('Адрес изменён — нажмите «Найти» или поставьте точку на карте заново');
            }
            onChange(next);
          }}
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
