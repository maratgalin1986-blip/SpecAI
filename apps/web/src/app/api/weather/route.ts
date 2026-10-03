import { NextRequest, NextResponse } from 'next/server';
import { geocodeAddress } from '@/lib/geo';
import {
  assessWork,
  CHELNY,
  fetchForecast,
  machineGroup,
  mskToday,
  shiftWeather,
  worstLevel,
} from '@/lib/weather';
import { checkRateLimit } from '@/lib/rateLimit';
import { liftingStop, nearestPoint } from '@/lib/stroykaSky';

// Forecast for a work shift and what it means for a machine:
// GET /api/weather?date=YYYY-MM-DD&kind=crane[&lat=&lon= | &q=address]
// Without a place the forecast is for Naberezhnye Chelny.

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

  let place = { lat: CHELNY.lat, lon: CHELNY.lon, label: 'Набережные Челны' };
  const lat = Number(params.get('lat'));
  const lon = Number(params.get('lon'));
  const q = params.get('q');
  if (Number.isFinite(lat) && Number.isFinite(lon) && params.has('lat') && params.has('lon')) {
    place = { lat, lon, label: params.get('label') || 'Объект' };
  } else if (q) {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    if (!checkRateLimit(`geocode:${ip}`, { limit: 20, windowMs: 60_000 }).ok) {
      return NextResponse.json(
        { error: 'Слишком часто, попробуйте через минуту' },
        { status: 429 },
      );
    }
    const found = await geocodeAddress(q);
    if (found) place = found;
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
