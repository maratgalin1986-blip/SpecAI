import { prisma } from '@specai/database';
import { SiteMap } from '@/components/SiteMap';
import { WeatherHud } from '@/components/WeatherHud';
import { machineTypeOf } from '@/lib/equipmentCatalog';
import { geocodeAddress } from '@/lib/geo';
import { MACHINE_LABELS } from '@/lib/machinePhotos';
import {
  assessWork,
  CHELNY,
  fetchForecast,
  machineGroup,
  mskParts,
  mskToday,
  shiftWeather,
} from '@/lib/weather';

// Weather for the work day and the top-down map of the site, for an order.
// Server component: coordinates are geocoded once from the order address and
// stored on its Location, the forecast is cached for 30 minutes.

type OrderLocation = {
  id: string;
  addressLine: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
};

const DAY_MS = 86_400_000;

/** The order's place with coordinates (geocoded and saved when missing). */
async function placeOf(location: OrderLocation | null) {
  if (!location) return null;
  if (location.latitude !== null && location.longitude !== null) {
    return { lat: location.latitude, lon: location.longitude, label: location.addressLine };
  }
  const query =
    location.addressLine === location.city
      ? location.city
      : `${location.city}, ${location.addressLine}`;
  const found = await geocodeAddress(query);
  if (!found) return null;
  await prisma.location
    .update({ where: { id: location.id }, data: { latitude: found.lat, longitude: found.lon } })
    .catch(() => undefined);
  return { lat: found.lat, lon: found.lon, label: location.addressLine };
}

export async function SiteConditions({
  date,
  location,
  categoryName,
}: {
  date: Date;
  location: OrderLocation | null;
  categoryName?: string | null;
}) {
  const place = await placeOf(location);
  // A city-only place (orders imported from chats) gets the weather, not the map.
  const exact = Boolean(place && location && location.addressLine !== location.city);
  const target = place ?? { lat: CHELNY.lat, lon: CHELNY.lon, label: 'Набережные Челны' };

  const day = mskParts(date.toISOString()).date;
  const ahead = (Date.parse(day) - Date.parse(mskToday())) / DAY_MS;
  const dateLabel = date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  const type = machineTypeOf(categoryName ?? '');

  let weatherBlock = null;
  if (ahead >= 0) {
    const points = ahead <= 9 ? await fetchForecast(target.lat, target.lon) : null;
    const weather = points ? shiftWeather(points, day) : null;
    weatherBlock = (
      <WeatherHud
        weather={weather}
        notes={weather ? assessWork(weather, machineGroup(type)) : []}
        place={location?.city ?? 'Набережные Челны'}
        dateLabel={dateLabel}
        machineLabel={type ? `для: ${MACHINE_LABELS[type].toLowerCase()}` : undefined}
        emptyReason={ahead <= 9 ? 'unavailable' : 'far'}
      />
    );
  }

  if (!weatherBlock && !exact) return null;
  return (
    <section className="grid gap-4 lg:grid-cols-2" aria-label="Погода и место работ">
      {weatherBlock}
      {exact && place ? <SiteMap lat={place.lat} lon={place.lon} label={place.label} /> : null}
    </section>
  );
}
