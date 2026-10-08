// Real time of day and real weather for the /stroyka scene. Pure functions:
// the sun and moon over Набережные Челны, the sky palette for a sun
// elevation, and the mapping of a MET Norway forecast point to scene state.

import {
  assessWork,
  CHELNY,
  symbolIcon,
  symbolLabel,
  type HourPoint,
  type ShiftWeather,
} from '@/lib/weather';

const RAD = Math.PI / 180;

/** Sun elevation and azimuth (degrees, azimuth from north clockwise). */
export function sunPosition(date: Date, lat: number = CHELNY.lat, lon: number = CHELNY.lon) {
  const n = date.getTime() / 86_400_000 + 2440587.5 - 2451545.0;
  const L = 280.46 + 0.9856474 * n;
  const g = (357.528 + 0.9856003 * n) * RAD;
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  const eps = (23.439 - 0.0000004 * n) * RAD;
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const gmstHours = 18.697374558 + 24.06570982441908 * n;
  const ha = ((gmstHours * 15 + lon) % 360) * RAD - ra;
  const phi = lat * RAD;
  const elevation = Math.asin(
    Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(ha),
  );
  const azimuth = Math.atan2(
    -Math.sin(ha),
    Math.tan(dec) * Math.cos(phi) - Math.sin(phi) * Math.cos(ha),
  );
  return { elevation: elevation / RAD, azimuth: (azimuth / RAD + 360) % 360 };
}

const SYNODIC_DAYS = 29.530588853;
const KNOWN_NEW_MOON = Date.UTC(2000, 0, 6, 18, 14);

/** Moon phase 0…1: 0 new, 0.25 first quarter, 0.5 full, 0.75 last quarter. */
export function moonPhase(date: Date) {
  const days = (date.getTime() - KNOWN_NEW_MOON) / 86_400_000;
  return (((days / SYNODIC_DAYS) % 1) + 1) % 1;
}

/**
 * Rough moon position: the moon lags the sun by its phase of a lunar day, so
 * it sits where the sun was that long ago. Good enough to put it in the sky.
 */
export function moonPosition(date: Date) {
  const lag = moonPhase(date) * 24.84 * 3_600_000;
  return sunPosition(new Date(date.getTime() - lag));
}

export type DayPhase = 'night' | 'dawn' | 'day' | 'golden' | 'dusk';

export function dayPhase(elevation: number, azimuth: number): DayPhase {
  const morning = azimuth < 180;
  if (elevation < -6) return 'night';
  if (elevation < 4) return morning ? 'dawn' : 'dusk';
  if (elevation < 14) return 'golden';
  return 'day';
}

export const PHASE_LABEL: Record<DayPhase, string> = {
  night: 'ночь',
  dawn: 'рассвет',
  day: 'день',
  golden: 'золотой час',
  dusk: 'сумерки',
};

// ---------------------------------------------------------------- palette

export interface SkyPalette {
  zenith: number;
  horizon: number;
  fog: number;
  sun: number;
  sunIntensity: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  /** 0 by day … 1 at night: floodlights, windows, stars. */
  night: number;
}

// [elevation°, zenith, horizon, fog, sun colour, sun intensity, hemi sky, hemi ground, hemi intensity]
// Deep night (−18°) is near black with a faint navy; −12…−6° is the blue
// hour (a saturated deep blue, distinct from night); −3…2° the warm dusk
// band on the horizon; daylight is bright (physically based lights).
const SKY_KEYS: [number, number, number, number, number, number, number, number, number][] = [
  [-18, 0x02040b, 0x070b18, 0x060a14, 0x9fb4ff, 0, 0x26345c, 0x0a0a10, 0.5],
  [-12, 0x061029, 0x141d3c, 0x111a33, 0xa9b8ff, 0, 0x2e3a66, 0x100e18, 0.55],
  [-6, 0x0f2358, 0x34487f, 0x2b3a68, 0xa9b8ff, 0, 0x3f4e88, 0x18141e, 0.65],
  [-3, 0x1b3068, 0x9c5c5c, 0x5e4652, 0xff7a3a, 0.2, 0x4f5684, 0x2a1d18, 0.7],
  [2, 0x2c4a86, 0xf08848, 0xc98260, 0xff8a3d, 1.6, 0x6b78a8, 0x5a3a26, 0.85],
  [8, 0x4672b4, 0xf5b47c, 0xe2b28a, 0xffb067, 2.9, 0x8fa6cc, 0x6a4a30, 1.0],
  [20, 0x3c7ad6, 0xbcd6ee, 0xc8d9e6, 0xfff0d8, 3.4, 0xb8d0ee, 0x7a6448, 1.12],
  [50, 0x2e6cd4, 0xaecfee, 0xbcd3e6, 0xffffff, 3.6, 0xc6daf2, 0x7e6a52, 1.18],
];

function mixColor(a: number, b: number, k: number) {
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const r = Math.round(ar + (((b >> 16) & 255) - ar) * k);
  const g = Math.round(ag + (((b >> 8) & 255) - ag) * k);
  const bl = Math.round(ab + ((b & 255) - ab) * k);
  return (r << 16) | (g << 8) | bl;
}
const mix = (a: number, b: number, k: number) => a + (b - a) * k;

/** Sky colours and light for a sun elevation, before weather. */
export function skyPalette(elevation: number): SkyPalette {
  const keys = SKY_KEYS;
  let i = 0;
  while (i < keys.length - 2 && elevation > keys[i + 1]![0]) i++;
  const a = keys[i]!;
  const b = keys[i + 1]!;
  const k = Math.min(1, Math.max(0, (elevation - a[0]) / (b[0] - a[0])));
  return {
    zenith: mixColor(a[1], b[1], k),
    horizon: mixColor(a[2], b[2], k),
    fog: mixColor(a[3], b[3], k),
    sun: mixColor(a[4], b[4], k),
    sunIntensity: mix(a[5], b[5], k),
    hemiSky: mixColor(a[6], b[6], k),
    hemiGround: mixColor(a[7], b[7], k),
    hemiIntensity: mix(a[8], b[8], k),
    night: Math.min(1, Math.max(0, (2 - elevation) / 8)),
  };
}

/**
 * How lively the city is at this Moscow hour (fractional), 0…1: every window
 * lit and the sky glowing over the streets in the evening, most windows dark
 * after midnight. It tells 20:00 from 01:00 when the sun is far below the
 * horizon at both.
 */
export function cityLife(hour: number) {
  const h = ((hour % 24) + 24) % 24;
  if (h >= 7 && h < 17) return 0.6;
  if (h >= 17 && h < 22) return 0.6 + 0.4 * Math.min(1, (h - 17) / 1.5);
  if (h >= 22) return 1 - 0.75 * ((h - 22) / 3);
  if (h < 1) return 1 - 0.75 * ((h + 2) / 3);
  if (h < 5) return 0.25;
  return 0.25 + 0.35 * ((h - 5) / 2);
}

// ---------------------------------------------------------------- weather

export interface WeatherScene {
  symbol: string;
  label: string;
  temp: number;
  /** m/s */
  wind: number;
  /** Degrees the wind blows FROM. */
  windDir: number;
  /** 0…1 each. */
  clouds: number;
  rain: number;
  snow: number;
  fog: number;
  thunder: boolean;
  wet: boolean;
  snowGround: boolean;
}

export type WeatherPoint = Pick<
  HourPoint,
  'symbol' | 'temp' | 'wind' | 'windDir' | 'precip' | 'fog'
>;

export const CLEAR_WEATHER: WeatherPoint = {
  symbol: 'clearsky_day',
  temp: 15,
  wind: 3,
  windDir: 225,
  precip: 0,
  fog: 0,
};

const intensity = (symbol: string) =>
  symbol.includes('heavy') ? 1 : symbol.includes('light') ? 0.35 : 0.65;

/** What the forecast point means for the scene. */
export function weatherScene(point: WeatherPoint | null | undefined): WeatherScene {
  const p = point ?? CLEAR_WEATHER;
  const s = p.symbol || '';
  let clouds = 0.1;
  let fog = 0;
  let rain = 0;
  let snow = 0;
  const showers = s.includes('showers');
  if (s.includes('clearsky')) clouds = 0.05;
  else if (s.includes('fair')) clouds = 0.25;
  else if (s.includes('partlycloudy')) clouds = 0.5;
  else if (s.includes('cloudy')) clouds = 0.9;
  if (s.includes('fog')) {
    clouds = 0.85;
    fog = 0.85;
  }
  if (s.includes('sleet')) {
    rain = 0.5 * intensity(s);
    snow = 0.5 * intensity(s);
  } else if (s.includes('snow')) {
    snow = intensity(s);
  } else if (s.includes('rain')) {
    rain = intensity(s);
  }
  if (rain || snow) clouds = Math.max(clouds, showers ? 0.7 : 0.95);
  const thunder = s.includes('thunder');
  if (thunder) {
    clouds = 1;
    if (!snow) rain = Math.max(rain, 0.75);
  }
  // Precipitation without a precipitation symbol (6-hour blocks).
  if (!rain && !snow && p.precip > 0.2) {
    if (p.temp < 0) snow = Math.min(0.6, p.precip / 2);
    else rain = Math.min(0.6, p.precip / 2);
  }
  fog = Math.max(fog, Math.min(1, (p.fog || 0) / 100) * 0.9);
  return {
    symbol: s,
    label: symbolLabel(s),
    temp: p.temp,
    wind: p.wind,
    windDir: p.windDir,
    clouds,
    rain,
    snow,
    fog,
    thunder,
    wet: rain > 0.05,
    snowGround: (snow > 0.05 && p.temp <= 2) || (s.includes('sleet') && p.temp < 0),
  };
}

export type LiftStop = { stop: boolean; reason: 'wind' | 'thunder' | 'other' | null };

/**
 * Whether lifting machines (crane, aerial platform) stop now, using the same
 * rules as the forecast on the site (`assessWork` for the «lifting» group).
 */
export function liftingStop(point: WeatherPoint | null | undefined): LiftStop {
  const p = point ?? CLEAR_WEATHER;
  const w: ShiftWeather = {
    date: '',
    points: [],
    tempMin: p.temp,
    tempMax: p.temp,
    feelsMin: p.temp,
    windMax: p.wind,
    windDir: p.windDir,
    precip: p.precip,
    fogMax: p.fog,
    symbol: p.symbol,
    thunder: p.symbol.includes('thunder'),
    snow: p.symbol.includes('snow'),
    sleet: p.symbol.includes('sleet'),
    rain: p.symbol.includes('rain'),
    hourly: true,
  };
  const stop = assessWork(w, 'lifting').find((note) => note.level === 'stop');
  if (!stop) return { stop: false, reason: null };
  if (stop.title === 'Гроза') return { stop: true, reason: 'thunder' };
  if (stop.title.startsWith('Ветер')) return { stop: true, reason: 'wind' };
  return { stop: true, reason: 'other' };
}

/**
 * Dev overrides only (`?weather=wind`): the two lifting rules that matter for
 * the demo, without loading the forecast rules into the page. The live scene
 * gets the verdict from /api/weather (`nowLift`, computed with assessWork).
 */
export function overrideLiftStop(point: WeatherPoint | null | undefined): LiftStop {
  if (!point) return { stop: false, reason: null };
  if (point.symbol.includes('thunder')) return { stop: true, reason: 'thunder' };
  if (point.wind >= 10) return { stop: true, reason: 'wind' };
  return { stop: false, reason: null };
}

/** The forecast point closest to `now`. */
export function nearestPoint<T extends { time: string }>(points: T[], now: number): T | null {
  let best: T | null = null;
  let bestGap = Infinity;
  for (const point of points) {
    const gap = Math.abs(Date.parse(point.time) - now);
    if (gap < bestGap) {
      best = point;
      bestGap = gap;
    }
  }
  return best;
}

// ---------------------------------------------------------------- HUD and overrides

const MSK_MS = 3 * 3_600_000;

/** «21:14» in Moscow time (Набережные Челны is on Moscow time). */
export function mskClock(date: Date) {
  const d = new Date(date.getTime() + MSK_MS);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

/** «пт, 2 окт» — the real date in Moscow time. */
export function mskDate(date: Date) {
  const d = new Date(date.getTime() + MSK_MS);
  return `${WEEKDAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** «🌧️ Челны · пт, 2 окт · 21:14 · +3° · дождь · ветер 7 м/с». */
export function conditionsLine(date: Date, weather: WeatherScene | null) {
  const parts = ['Челны', mskDate(date), mskClock(date)];
  if (weather) {
    const t = Math.round(weather.temp);
    parts.push(`${t > 0 ? '+' : ''}${t}°`, weather.label, `ветер ${Math.round(weather.wind)} м/с`);
    const hour = Number(mskClock(date).slice(0, 2));
    return `${symbolIcon(weather.symbol, hour < 6 || hour >= 20)} ${parts.join(' · ')}`;
  }
  return parts.join(' · ');
}

/** Test presets for `?weather=`. */
export const WEATHER_PRESETS: Record<string, WeatherPoint> = {
  clear: CLEAR_WEATHER,
  cloudy: { ...CLEAR_WEATHER, symbol: 'cloudy', temp: 9, wind: 4 },
  rain: { ...CLEAR_WEATHER, symbol: 'rain', temp: 7, wind: 5, precip: 1.2 },
  heavyrain: { ...CLEAR_WEATHER, symbol: 'heavyrain', temp: 9, wind: 7, precip: 4 },
  snow: { ...CLEAR_WEATHER, symbol: 'snow', temp: -4, wind: 4, precip: 0.8, windDir: 320 },
  sleet: { ...CLEAR_WEATHER, symbol: 'sleet', temp: 0, wind: 6, precip: 1 },
  fog: { ...CLEAR_WEATHER, symbol: 'fog', temp: 4, wind: 1, fog: 90 },
  thunder: { ...CLEAR_WEATHER, symbol: 'heavyrainandthunder', temp: 18, wind: 8, precip: 5 },
  wind: { ...CLEAR_WEATHER, symbol: 'partlycloudy_day', temp: 6, wind: 13, windDir: 270 },
};

export interface SceneOverrides {
  /** Moscow time of day to show instead of now. */
  time?: { h: number; m: number };
  weather?: WeatherPoint;
  /** `?date=2027-06-01`: the construction as it will be on that Moscow day (noon). */
  date?: number;
}

/** Reads `?time=23:00&weather=rain&wind=12&date=2027-06-01` (testing and demos). */
export function parseOverrides(search: string): SceneOverrides {
  const params = new URLSearchParams(search);
  const out: SceneOverrides = {};
  const time = /^(\d{1,2}):(\d{2})$/.exec(params.get('time') ?? '');
  if (time) {
    const h = Number(time[1]);
    const m = Number(time[2]);
    if (h < 24 && m < 60) out.time = { h, m };
  }
  const preset = params.get('weather');
  if (preset && Object.prototype.hasOwnProperty.call(WEATHER_PRESETS, preset)) {
    out.weather = { ...WEATHER_PRESETS[preset]! };
  }
  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(params.get('date') ?? '');
  if (date) {
    const [y, mo, d] = [Number(date[1]), Number(date[2]), Number(date[3])];
    // Noon in Moscow; a real calendar day within a sane range only.
    const ms = Date.UTC(y, mo - 1, d, 9);
    const check = new Date(ms);
    if (y >= 2020 && y <= 2100 && check.getUTCMonth() === mo - 1 && check.getUTCDate() === d)
      out.date = ms;
  }
  const wind = Number(params.get('wind'));
  if (params.has('wind') && Number.isFinite(wind) && wind >= 0 && wind < 60) {
    out.weather = { ...(out.weather ?? CLEAR_WEATHER), wind };
  }
  return out;
}

/** `now` moved to the given Moscow time of the same Moscow day. */
export function atMskTime(now: Date, h: number, m: number) {
  const d = new Date(now.getTime() + MSK_MS);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h, m) - MSK_MS);
}
