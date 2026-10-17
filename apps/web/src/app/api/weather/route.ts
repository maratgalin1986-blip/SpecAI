import { NextRequest, NextResponse } from 'next/server';
import { clientIp } from '@/lib/loginErrors';
import { geocodeAddress } from '@/lib/geo';
import {
  assessWork,
  fetchForecast,
  machineGroup,
  mskToday,
  shiftWeather,
  worstLevel,
} from '@/lib/weather';
import { checkRateLimit } from '@/lib/rateLimit';
import { liftingStop, nearestPoint } from '@/lib/stroykaSky';

// Forecast for a work shift and what it means for a machine:
// GET /api/weather?date=YYYY-MM-DD&kind=crane&(lat=&lon= | q=address)
// The platform serves all of Russia: without a place (or with an address the
// geocoder cannot find) there is no forecast — 400 / 404, never a default town.

const DAY_MS = 86_400_000;

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const date = params.get('date') ?? mskToday();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Дата в формате ГГГГ-ММ-ДД' }, { status: 400 });
  }
  const ahead = (Date.parse(date) - Date.parse(mskToday())) / DAY_MS;
  if (!(ahead >= 0 && ahead <= 10)) {
    return NextResponse.json({ error: 'Прогноз есть на ближайшие 9 дней' }, { status: 400 });
  }

  let place: { lat: number; lon: number; label: string } | null = null;
  const lat = Number(params.get('lat'));
  const lon = Number(params.get('lon'));
  const q = params.get('q');
  if (Number.isFinite(lat) && Number.isFinite(lon) && params.has('lat') && params.has('lon')) {
    place = { lat, lon, label: params.get('label') || 'Объект' };
  } else if (q) {
    const ip = clientIp(request);
    if (!checkRateLimit(`geocode:${ip}`, { limit: 20, windowMs: 60_000 }).ok) {
      return NextResponse.json(
        { error: 'Слишком часто, попробуйте через минуту' },
        { status: 429 },
      );
    }
    const found = await geocodeAddress(q);
    if (!found) return NextResponse.json({ error: 'Адрес не найден' }, { status: 404 });
    place = found;
  }
  if (!place) {
    return NextResponse.json({ error: 'Укажите место работ' }, { status: 400 });
  }

  const points = await fetchForecast(place.lat, place.lon);
  if (!points) {
    return NextResponse.json({ error: 'Прогноз временно недоступен' }, { status: 503 });
  }
  const weather = shiftWeather(points, date);
  const nowPoint = nearestPoint(points, Date.now());
  const notes = weather ? assessWork(weather, machineGroup(params.get('kind'))) : [];
  return NextResponse.json(
    {
      place,
      date,
      weather,
      notes,
      level: weather ? worstLevel(notes) : null,
      // The forecast hour closest to the request and whether lifting machines
      // stop then (assessWork), for the live /stroyka scene.
      now: nowPoint,
      nowLift: nowPoint ? liftingStop(nowPoint) : null,
    },
    { headers: { 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=1800' } },
  );
}
