'use client';

import { useEffect, useRef, useState } from 'react';
import type { Map as LeafletMap, Marker } from 'leaflet';
import { CHELNY, createBaseMap, loadLeaflet, pinIcon } from '@/components/leaflet';
import { ConsentText } from '@/components/ConsentText';
import { LeadSuccess } from '@/components/LeadSuccess';
import { formatCoords, inServiceArea } from '@/lib/geo';
import { LANDINGS } from '@/lib/landings';
import { pointMessageLine, type MapPoint } from '@/lib/mapPoint';
import { rateOf, rub } from '@/lib/prices';
import { SITE } from '@/lib/site';
import { leadErrorText, submitLead } from '@/lib/submitLead';
import { useHydrated } from '@/lib/useHydrated';

// «Где нужна техника?»: the customer marks the work site on the map (a tap,
// «Я здесь» or an address search), picks the machine and leaves a phone. The
// lead carries the point with a Yandex Maps link for the dispatcher.

const WHEN = ['Сегодня', 'Завтра', 'На этой неделе', 'Позже, уточню'] as const;

export function OrderMap({ embed = false }: { embed?: boolean }) {
  const element = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const placeRef = useRef<(lat: number, lon: number, zoom?: number) => void>(() => {});
  const [point, setPoint] = useState<MapPoint | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [machine, setMachine] = useState('');
  const [when, setWhen] = useState<string>(WHEN[0]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);
  const hydrated = useHydrated();

  useEffect(() => {
    let cancelled = false;
    let marker: Marker | null = null;
    loadLeaflet()
      .then((L) => {
        if (cancelled || !element.current || mapRef.current) return;
        const map = createBaseMap(L, element.current, {
          center: [CHELNY.lat, CHELNY.lon],
          zoom: 12,
        });
        mapRef.current = map;
        const place = (lat: number, lon: number, zoom?: number) => {
          if (!inServiceArea(lat, lon)) {
            setHint('Работаем в Татарстане и соседних регионах — поставьте точку ближе');
            return;
          }
          setHint(null);
          setPoint({ lat, lon });
          if (!marker) {
            marker = L.marker([lat, lon], {
              icon: pinIcon(L, { imageUrl: null, isHouse: true }, 48),
              draggable: true,
              title: 'Место работ',
              alt: 'Место работ',
            })
              .on('dragend', () => {
                const moved = marker?.getLatLng();
                if (moved) place(moved.lat, moved.lng);
              })
              .addTo(map);
          } else {
            marker.setLatLng([lat, lon]);
          }
          if (zoom) map.setView([lat, lon], zoom);
        };
        placeRef.current = place;
        map.on('click', (event) => place(event.latlng.lat, event.latlng.lng));
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  function locate() {
    if (!navigator.geolocation) {
      setHint('Телефон не даёт местоположение — нажмите на карту');
      return;
    }
    setHint('Определяем местоположение…');
    navigator.geolocation.getCurrentPosition(
      (pos) => placeRef.current(pos.coords.latitude, pos.coords.longitude, 16),
      () => setHint('Не удалось определить место — нажмите на карту или найдите адрес'),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  async function search(event: React.FormEvent) {
    event.preventDefault();
    if (query.trim().length < 3) return;
    setSearching(true);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(query.trim())}`);
      const body = await res.json().catch(() => null);
      if (res.ok && body?.place) placeRef.current(body.place.lat, body.place.lon, 16);
      else setHint(body?.error ?? 'Адрес не найден — поставьте точку на карте');
    } catch {
      setHint('Нет связи — поставьте точку на карте');
    } finally {
      setSearching(false);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!point) {
      setError('Отметьте на карте, где нужна техника');
      return;
    }
    setError(null);
    setStatus('sending');
    const message = [
      `Заказ с карты: ${machine || 'техника — подобрать'}, ${when.toLowerCase()}.`,
      pointMessageLine(point),
    ].join('\n');
    try {
      await submitLead({ name, phone, message, source: 'map', consent, website });
      setStatus('sent');
    } catch (err) {
      setStatus('idle');
      setError(leadErrorText(err, SITE.phone));
    }
  }

  if (status === 'sent') {
    return (
      <div className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <LeadSuccess summary={machine ? `${machine}, ${when.toLowerCase()}` : undefined} />
      </div>
    );
  }

  const input = 'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <form onSubmit={search} className="flex flex-1 gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            maxLength={200}
            placeholder="Адрес объекта, например: Челны, проспект Мира 49"
            aria-label="Адрес объекта"
            className={input}
          />
          <button
            type="submit"
            disabled={searching}
            className="shrink-0 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold hover:border-slate-900 disabled:opacity-60"
          >
            {searching ? '…' : 'Найти'}
          </button>
        </form>
        <button
          type="button"
          onClick={locate}
          className="min-h-10 rounded-md bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-700"
        >
          📍 Я на объекте
        </button>
      </div>

      {failed ? (
        <p className="rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">
          Карта не загрузилась — найдите адрес выше или позвоните: {SITE.phone}
        </p>
      ) : (
        <div
          ref={element}
          className={`${embed ? 'h-[55vh]' : 'h-[60vh] max-h-[560px]'} w-full overflow-hidden rounded-2xl bg-slate-200 ring-1 ring-slate-200`}
          aria-label="Карта: нажмите, чтобы отметить место, куда нужна техника"
        />
      )}
      <p className="-mt-2 text-sm text-slate-600">
        {hint ??
          (point
            ? `📍 Место работ: ${formatCoords(point.lat, point.lon)} Значок можно перетащить.`
            : 'Нажмите на карту там, где будет работать техника.')}
      </p>

      <form
        method="post"
        onSubmit={handleSubmit}
        className="ym-hide-content flex flex-col gap-3 rounded-2xl bg-white p-5 ring-1 ring-slate-200"
      >
        <h2 className="text-lg font-semibold">Что и когда нужно</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <select
            value={machine}
            onChange={(e) => setMachine(e.target.value)}
            aria-label="Техника"
            className={input}
          >
            <option value="">Техника — подберёт диспетчер</option>
            {LANDINGS.map((l) => (
              <option key={l.slug} value={l.short}>
                {l.short} — от {rub(rateOf(l.machine))} ₽/ч с машинистом
              </option>
            ))}
          </select>
          <select
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            aria-label="Когда"
            className={input}
          >
            {WHEN.map((w) => (
              <option key={w}>{w}</option>
            ))}
          </select>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            placeholder="Имя (необязательно)"
            autoComplete="name"
            aria-label="Имя (необязательно)"
            className={input}
          />
          <input
            required
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            maxLength={30}
            pattern="(?:\D*\d){10,15}\D*"
            title="Номер телефона: от 10 цифр"
            placeholder="+7 (___) ___-__-__"
            autoComplete="tel"
            inputMode="tel"
            aria-label="Телефон"
            className={input}
          />
        </div>
        {/* Honeypot for bots — hidden from people and screen readers. */}
        <input
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          className="hidden"
          aria-hidden
          name="website"
        />
        <label className="flex items-start gap-2 text-xs text-slate-600">
          <input
            type="checkbox"
            required
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5"
          />
          <ConsentText />
        </label>
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={!hydrated || status === 'sending'}
          className="rounded-md bg-amber-500 px-5 py-2.5 text-sm font-semibold text-slate-950 shadow-lg shadow-amber-600/30 transition hover:bg-amber-400 disabled:opacity-60"
        >
          {status === 'sending' ? 'Отправляем…' : 'Заказать технику сюда'}
        </button>
        <p className="text-xs text-slate-500">
          Диспетчер перезвонит и назовёт точную цену с подачей до этого места.
        </p>
      </form>
    </div>
  );
}
