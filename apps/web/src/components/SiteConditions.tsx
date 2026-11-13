import { prisma } from '@specai/database';
import { SiteMap } from '@/components/SiteMap';
import { WeatherHud } from '@/components/WeatherHud';
import { machineTypeOf } from '@/lib/equipmentCatalog';
import { geocodeAddress } from '@/lib/geo';
import { siteBlockView } from '@/lib/orderLocationPrivacy';
import { MACHINE_LABELS } from '@/lib/machinePhotos';
import {
  assessWork,
  fetchForecast,
  machineGroup,
  mskParts,
  mskToday,
  shiftWeather,
} from '@/lib/weather';

// Weather for the work day and the top-down map of the site, for an order.
// Server component: coordinates are geocoded once from the order address and
// stored on its Location, the forecast is cached for 30 minutes.
// `showExact` follows lib/orderLocationPrivacy.ts: the map and the address are
// for the customer, the platform's managers and the booked company; everyone
// else gets the weather under the city's name, and neither the address nor
// the coordinates reach the markup.

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
    !location.city || location.addressLine === location.city
      ? location.addressLine
      : `${location.city}, ${location.addressLine}`;
  const found = await geocodeAddress(query);
  if (!found) return null;
  // Previews share the production database: only production caches coordinates.
  if (!process.env.VERCEL_ENV || process.env.VERCEL_ENV === 'production') {
    await prisma.location
      .update({ where: { id: location.id }, data: { latitude: found.lat, longitude: found.lon } })
      .catch(() => undefined);
  }
  return { lat: found.lat, lon: found.lon, label: location.addressLine };
}

export async function SiteConditions({
  date,
  location,
  categoryName,
  showExact,
}: {
  date: Date;
  location: OrderLocation | null;
  categoryName?: string | null;
  /** Whether this viewer reads the address and sees the exact point. */
  showExact: boolean;
}) {
  const place = await placeOf(location);
  const shown = siteBlockView(location, place, showExact);

  const day = mskParts(date.toISOString()).date;
  const ahead = (Date.parse(day) - Date.parse(mskToday())) / DAY_MS;
  const dateLabel = date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  const type = machineTypeOf(categoryName ?? '');

  // The forecast only for a known place: an order whose place is unknown gets
  // none rather than the weather of a town we would have to guess.
  let weatherBlock = null;
  if (ahead >= 0 && place) {
    const points = ahead <= 9 ? await fetchForecast(place.lat, place.lon) : null;
    const weather = points ? shiftWeather(points, day) : null;
    weatherBlock = (
      <WeatherHud
        weather={weather}
        notes={weather ? assessWork(weather, machineGroup(type)) : []}
        group={machineGroup(type)}
        place={shown.weatherPlace}
        dateLabel={dateLabel}
        machineLabel={type ? `для: ${MACHINE_LABELS[type].toLowerCase()}` : undefined}
        emptyReason={ahead <= 9 ? 'unavailable' : 'far'}
      />
    );
  }

  if (!weatherBlock && !shown.map) return null;
  return (
    <section className="grid gap-4 lg:grid-cols-2" aria-label="Погода и место работ">
      {weatherBlock}
      {shown.map ? (
        <SiteMap lat={shown.map.lat} lon={shown.map.lon} label={shown.map.label} />
      ) : null}
    </section>
  );
}
