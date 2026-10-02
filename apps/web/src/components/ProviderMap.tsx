'use client';

import { useEffect, useRef, useState } from 'react';
import type { Map as LeafletMap, Marker } from 'leaflet';
import { machineCountLabel, type ProviderMapPin } from '@/lib/providerMap';
import { createBaseMap, loadLeaflet, pinIcon } from '@/components/leaflet';

// The customers' map of providers: a round marker per provider base (its
// machinery photo or the machine icon, an amber ring for СпецПласт16's own
// fleet); a tap opens a card at the bottom of the map with the note, how much
// machinery there is and links to the provider's catalog and to an order.

export function ProviderMap({ pins, embed = false }: { pins: ProviderMapPin[]; embed?: boolean }) {
  const element = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markers = useRef(new Map<string, Marker>());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const selected = pins.find((pin) => pin.id === selectedId) ?? null;

  useEffect(() => {
    let cancelled = false;
    const markerMap = markers.current;
    loadLeaflet()
      .then((L) => {
        if (cancelled || !element.current || mapRef.current) return;
        const map = createBaseMap(L, element.current);
        mapRef.current = map;
        const big = window.matchMedia('(max-width: 640px)').matches ? 56 : 52;
        for (const pin of pins) {
          const marker = L.marker([pin.lat, pin.lon], {
            icon: pinIcon(L, pin, big),
            title: pin.name,
            alt: pin.name,
            keyboard: true,
            riseOnHover: true,
          })
            .on('click', () => setSelectedId(pin.id))
            .addTo(map);
          markerMap.set(pin.id, marker);
        }
        map.on('click', () => setSelectedId(null));
        if (pins.length > 1) {
          map.fitBounds(L.latLngBounds(pins.map((pin) => [pin.lat, pin.lon])), {
            padding: [48, 48],
            maxZoom: 12,
          });
        } else if (pins[0]) {
          map.setView([pins[0].lat, pins[0].lon], 11);
        }
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerMap.clear();
    };
  }, [pins]);

  // Enlarge the chosen marker.
  useEffect(() => {
    void loadLeaflet().then((L) => {
      for (const pin of pins) {
        const marker = markers.current.get(pin.id);
        if (!marker) continue;
        const isSelected = pin.id === selectedId;
        marker.setIcon(
          pinIcon(L, { ...pin, selected: isSelected }, window.innerWidth <= 640 ? 56 : 52),
        );
        marker.setZIndexOffset(isSelected ? 1000 : 0);
      }
    });
  }, [selectedId, pins]);

  function focus(pin: ProviderMapPin) {
    setSelectedId(pin.id);
    mapRef.current?.setView([pin.lat, pin.lon], Math.max(mapRef.current.getZoom(), 12));
    element.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  return (
    <div className="flex flex-col gap-6">
      <div
        className={`relative overflow-hidden bg-slate-200 ${
          embed ? '' : '-mx-4 sm:mx-0 sm:rounded-3xl sm:ring-1 sm:ring-slate-200'
        }`}
      >
        <div
          ref={element}
          className={
            embed
              ? 'h-[78svh] min-h-[360px] w-full'
              : 'h-[68svh] min-h-[420px] w-full sm:h-[70vh] sm:min-h-[520px]'
          }
          role="region"
          aria-label="Карта исполнителей"
        />
        {failed && (
          <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-slate-600">
            Не удалось загрузить карту — список исполнителей ниже.
          </p>
        )}
        {selected && (
          <div className="absolute inset-x-3 bottom-3 z-[1000] sm:left-4 sm:right-auto sm:w-96">
            <ProviderCard pin={selected} onClose={() => setSelectedId(null)} />
          </div>
        )}
      </div>

      <section className={`flex flex-col gap-3 ${embed ? 'px-4' : ''}`}>
        <h2 className="text-lg font-semibold">
          Исполнители на карте <span className="text-slate-400">· {pins.length}</span>
        </h2>
        {pins.length === 0 ? (
          <p className="text-sm text-slate-600">
            Пока никто не отметил свою базу. Поставщики появятся здесь после регистрации.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pins.map((pin) => (
              <li key={pin.id}>
                <button
                  type="button"
                  onClick={() => focus(pin)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left transition hover:border-slate-900"
                >
                  <PinAvatar pin={pin} />
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{pin.name}</span>
                    <span className="block text-xs text-slate-500">
                      {pin.isHouse ? 'Парк СпецПласт16 · ' : ''}
                      {machineCountLabel(pin.equipmentCount)}
                    </span>
                    {pin.note && (
                      <span className="mt-0.5 block truncate text-sm text-slate-600">
                        {pin.note}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function PinAvatar({ pin }: { pin: ProviderMapPin }) {
  const ring = pin.isHouse ? 'ring-amber-500' : 'ring-slate-900';
  return pin.imageUrl ? (
    <img
      src={pin.imageUrl}
      alt=""
      width={48}
      height={48}
      loading="lazy"
      referrerPolicy="no-referrer"
      className={`h-12 w-12 shrink-0 rounded-full object-cover ring-2 ${ring}`}
    />
  ) : (
    <span
      aria-hidden
      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ring-2 ${ring} ${
        pin.isHouse ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-amber-400'
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-7 w-7"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 17h11V11H8l-2 3H3z" />
        <path d="M14 13h3l3-6" />
        <path d="M20 7l1 4h-3" />
        <circle cx="6" cy="18" r="2" />
        <circle cx="12" cy="18" r="2" />
      </svg>
    </span>
  );
}

function ProviderCard({ pin, onClose }: { pin: ProviderMapPin; onClose: () => void }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-2xl ring-1 ring-slate-200">
      <div className="flex items-start gap-3">
        <PinAvatar pin={pin} />
        <div className="min-w-0 flex-1">
          {pin.isHouse && (
            <span className="mb-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
              Парк СпецПласт16
            </span>
          )}
          <p className="break-words font-semibold leading-snug">{pin.name}</p>
          <p className="text-sm text-slate-500">{machineCountLabel(pin.equipmentCount)}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть карточку"
          className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
        >
          ✕
        </button>
      </div>
      {pin.note && <p className="mt-3 break-words text-sm text-slate-700">{pin.note}</p>}
      <div className="mt-4 grid grid-cols-2 gap-2 text-sm font-semibold">
        <a
          href={pin.catalogUrl}
          className="flex min-h-11 items-center justify-center rounded-xl border border-slate-300 px-3 py-2 text-center hover:border-slate-900"
        >
          Техника этого поставщика
        </a>
        <a
          href="/orders"
          className="flex min-h-11 items-center justify-center rounded-xl bg-amber-500 px-3 py-2 text-center text-slate-950 hover:bg-amber-400"
        >
          Оставить заявку
        </a>
      </div>
    </div>
  );
}
