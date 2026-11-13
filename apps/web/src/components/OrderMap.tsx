'use client';

import { useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import type { Map as LeafletMap, Marker } from 'leaflet';
import { createBaseMap, loadLeaflet, nearParam, pinIcon, showVisitor } from '@/components/leaflet';
import { drawProviderLayer, type MapSelection } from '@/components/providerLayer';
import { TAP_ERRORS, tapVisitorFix } from '@/components/visitorPosition';
import { CONSENT_ERROR, ConsentCheck, focusFirstInvalid, PhoneInput } from '@/components/FormBits';
import { LeadSuccess } from '@/components/LeadSuccess';
import { formatCoords, inServiceArea, nearestCity } from '@/lib/geo';
import { LANDINGS, landingListRate } from '@/lib/landings';
import { mapOrderMessage, type MapPoint } from '@/lib/mapPoint';
import { phoneError } from '@/lib/phoneMask';
import { LEAD_PHONE_VISIBILITY } from '@/lib/phoneVisibility';
import { rub } from '@/lib/prices';
import { SITE } from '@/lib/site';
import { ANONYMOUS_LEAD_NAME, leadErrorText, submitLead } from '@/lib/submitLead';
import { useHydrated } from '@/lib/useHydrated';

// «Где нужна техника?»: the customer marks the work site on the map (a tap,
// «Я здесь» or an address search), picks the machine and leaves a phone. The
// lead carries the point with a Yandex Maps link for the dispatcher. The
// point is optional: without it the заявка still goes, the dispatcher asks for
// the address, and the city is the one the page knows (or none).

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
  const [fieldErrors, setFieldErrors] = useState<{ phone?: string; consent?: string }>({});
  const formRef = useRef<HTMLFormElement>(null);
  // The visitor's own position, when the browser gave it: names the city of a
  // заявка sent without a point.
  const visitorRef = useRef<{ lat: number; lon: number } | null>(null);
  // Machines «на линии» are for accounts only (GET /api/line/nearby): a guest's
  // map does not ask for them, so it gets no 401. Settles once the session is known.
  const { status: sessionStatus } = useSession();
  const accountRef = useRef<{ promise: Promise<boolean>; resolve: (value: boolean) => void }>(null);
  if (!accountRef.current) {
    let resolve: (value: boolean) => void = () => {};
    const promise = new Promise<boolean>((done) => {
      resolve = done;
    });
    accountRef.current = { promise, resolve };
  }
  useEffect(() => {
    if (sessionStatus !== 'loading') accountRef.current?.resolve(sessionStatus === 'authenticated');
  }, [sessionStatus]);
  // «При выборе заказчика или исполнителя — видно вокруг него, кто рядом» (owner, 2026-11-08).
  const [selection, setSelection] = useState<MapSelection | null>(null);
  const hydrated = useHydrated();

  useEffect(() => {
    let cancelled = false;
    let marker: Marker | null = null;
    loadLeaflet()
      .then((L) => {
        if (cancelled || !element.current || mapRef.current) return;
        const map = createBaseMap(L, element.current);
        mapRef.current = map;
        // Opens on the whole country (createBaseMap's view) and moves to the
        // visitor's town once the browser gives the position (owner, 2026-10-17:
        // all of Russia, no region assumed). The pins' card still moves it.
        map.invalidateSize();
        showVisitor(L, map, {
          centreZoom: 11,
          onFix: (fix) => {
            visitorRef.current = { lat: fix.lat, lon: fix.lon };
          },
        });
        // Every provider with a label over its pin — on the line or not —, the
        // machines on the line (signed in), customers with open orders and the
        // «приём заявок» points where nobody is near. A tap lists the neighbours.
        void drawProviderLayer(L, map, () => !cancelled && mapRef.current === map, {
          onSelect: (next) => {
            if (!cancelled) setSelection(next);
          },
          signedIn: accountRef.current?.promise,
        });
        const place = (lat: number, lon: number, zoom?: number) => {
          if (!inServiceArea(lat, lon)) {
            setHint('Поставьте точку в России');
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

  async function locate() {
    setHint('Определяем местоположение…');
    const outcome = await tapVisitorFix();
    if ('error' in outcome) setHint(TAP_ERRORS[outcome.error]);
    else placeRef.current(outcome.fix.lat, outcome.fix.lon, 16);
  }

  async function search(event: React.FormEvent) {
    event.preventDefault();
    if (query.trim().length < 3) return;
    setSearching(true);
    try {
      const res = await fetch(
        `/api/geocode?q=${encodeURIComponent(query.trim())}${nearParam(mapRef.current)}`,
      );
      const body = await res.json().catch(() => null);
      if (res.ok && body?.place) placeRef.current(body.place.lat, body.place.lon, 16);
      else setHint(body?.error ?? 'Адрес не найден — поставьте точку на карте');
    } catch {
      setHint('Нет связи — поставьте точку на карте');
    } finally {
      setSearching(false);
    }
  }

  /** The city the page knows: the visitor's position, else the town the map shows. */
  function knownCity(): string | null {
    const visitor = visitorRef.current;
    if (visitor) return nearestCity(visitor.lat, visitor.lon)?.name ?? null;
    const map = mapRef.current;
    if (!map || map.getZoom() < 10) return null;
    const centre = map.getCenter();
    return nearestCity(centre.lat, centre.lng, 30)?.name ?? null;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const problems = {
      phone: phoneError(phone) ?? undefined,
      consent: consent ? undefined : CONSENT_ERROR,
    };
    setFieldErrors(problems);
    if (problems.phone || problems.consent) {
      focusFirstInvalid(formRef.current);
      return;
    }
    setStatus('sending');
    const message = mapOrderMessage({ machine, when, point, city: point ? null : knownCity() });
    try {
      await submitLead({
        name: name.trim() || ANONYMOUS_LEAD_NAME,
        phone,
        message,
        source: 'map',
        consent,
        website,
      });
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

  // 16 px on phones: iOS zooms the page when a smaller field takes focus.
  const input =
    'min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base sm:text-sm';

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
            className="min-h-11 shrink-0 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold hover:border-slate-900 disabled:opacity-60"
          >
            {searching ? '…' : 'Найти'}
          </button>
        </form>
        <button
          type="button"
          onClick={() => void locate()}
          className="min-h-11 rounded-md bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-700"
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
            : 'Нажмите на карту там, где будет работать техника. Можно и без точки — адрес уточнит диспетчер.')}
      </p>

      {selection && (
        <section
          aria-label="Кто рядом"
          data-testid="map-nearby"
          className="flex flex-col gap-2 rounded-2xl bg-white p-4 ring-1 ring-slate-200"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold">{selection.focus.title}</h2>
              <p className="text-sm text-slate-600">{selection.focus.sub}</p>
              <p className="mt-1 text-sm font-medium text-amber-700">{selection.summary}</p>
            </div>
            <button
              type="button"
              onClick={() => setSelection(null)}
              className="min-h-11 shrink-0 rounded-md border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:border-slate-900"
              aria-label="Скрыть список"
            >
              Скрыть
            </button>
          </div>
          {selection.items.length > 0 && (
            <ol className="divide-y divide-slate-100 text-sm">
              {selection.items.map((item) => (
                <li key={`${item.kind}:${item.id}`} className="flex items-baseline gap-3 py-2">
                  <span className="w-14 shrink-0 text-xs text-slate-500">{item.distanceText}</span>
                  <a href={item.href} className="min-w-0 flex-1 hover:underline">
                    <span className="font-medium">
                      {item.kind === 'live' ? '🟢 ' : item.kind === 'customer' ? '👷 ' : ''}
                      {item.title}
                    </span>
                    {item.sub && <span className="block truncate text-slate-600">{item.sub}</span>}
                  </a>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      <form
        ref={formRef}
        method="post"
        noValidate
        onSubmit={handleSubmit}
        data-map-order-form
        data-lead-form
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
                {l.short} — от {rub(landingListRate(l))} ₽/ч с машинистом
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
          <PhoneInput
            value={phone}
            onChange={(next) => {
              setPhone(next);
              if (fieldErrors.phone)
                setFieldErrors((current) => ({ ...current, phone: undefined }));
            }}
            error={fieldErrors.phone}
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
        <ConsentCheck
          checked={consent}
          onChange={(next) => {
            setConsent(next);
            if (next) setFieldErrors((current) => ({ ...current, consent: undefined }));
          }}
          error={fieldErrors.consent}
        />
        {!point && (
          // Said before sending, not as an error after it: the point helps, it is not required.
          <p data-map-no-point className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Точка на карте не отмечена — ничего страшного: адрес уточнит диспетчер по телефону.
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={!hydrated || status === 'sending'}
          className="min-h-11 rounded-md bg-amber-500 px-5 py-2.5 text-sm font-semibold text-slate-950 shadow-lg shadow-amber-600/30 transition hover:bg-amber-400 disabled:opacity-60"
        >
          {status === 'sending' ? 'Отправляем…' : 'Заказать технику сюда'}
        </button>
        <p className="text-xs text-slate-500">
          Диспетчер перезвонит и назовёт точную цену с подачей до этого места.{' '}
          {LEAD_PHONE_VISIBILITY}
        </p>
      </form>
    </div>
  );
}
