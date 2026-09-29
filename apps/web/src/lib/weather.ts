// Weather for a work shift, and what it means for each kind of machine.
//
// Data: MET Norway Locationforecast 2.0 (api.met.no), licensed CC BY 4.0 —
// free, commercial use allowed with attribution («Данные: MET Norway»). The
// terms ask for a User-Agent that identifies the site and for caching, which
// the fetch below does (Next data cache, 30 minutes). Forecasts are hourly for
// about 2.5 days ahead and 6-hourly up to ~9.5 days.
//
// A shift is 08:00–17:00 Moscow time (UTC+3, no daylight saving).

export type HourPoint = {
  /** ISO time, UTC. */
  time: string;
  temp: number;
  feels?: number;
  /** m/s, 10 min mean at 10 m (gusts are not in the data for Russia). */
  wind: number;
  windDir: number;
  /** mm over `stepHours` hours starting at `time`. */
  precip: number;
  stepHours: 1 | 6;
  symbol: string;
  fog: number;
};

export type ShiftWeather = {
  /** Local date, YYYY-MM-DD. */
  date: string;
  points: HourPoint[];
  tempMin: number;
  tempMax: number;
  feelsMin: number;
  windMax: number;
  /** Direction of the strongest wind, degrees (from). */
  windDir: number;
  precip: number;
  fogMax: number;
  /** The most significant weather symbol of the shift. */
  symbol: string;
  thunder: boolean;
  snow: boolean;
  sleet: boolean;
  rain: boolean;
  hourly: boolean;
};

const MSK_OFFSET_HOURS = 3;
export const SHIFT_START = 8;
export const SHIFT_END = 17;
export const WEATHER_USER_AGENT =
  'SpecPlast16/1.0 (+https://spec-ai-web.vercel.app; specplast16@mail.ru)';

type MetStep = {
  time: string;
  data: {
    instant: { details: Record<string, number | undefined> };
    next_1_hours?: {
      summary?: { symbol_code?: string };
      details?: { precipitation_amount?: number };
    };
    next_6_hours?: {
      summary?: { symbol_code?: string };
      details?: { precipitation_amount?: number };
    };
  };
};

/** Turns a MET Norway Locationforecast response into hour points. */
export function parseForecast(json: unknown): HourPoint[] {
  const steps = (json as { properties?: { timeseries?: MetStep[] } })?.properties?.timeseries;
  if (!Array.isArray(steps)) return [];
  const points: HourPoint[] = [];
  for (const step of steps) {
    const d = step.data?.instant?.details ?? {};
    if (typeof d.air_temperature !== 'number' || typeof d.wind_speed !== 'number') continue;
    const hourly = step.data.next_1_hours;
    const sixHourly = step.data.next_6_hours;
    const block = hourly ?? sixHourly;
    points.push({
      time: step.time,
      temp: d.air_temperature,
      feels: d.apparent_air_temperature,
      wind: d.wind_speed,
      windDir: d.wind_from_direction ?? 0,
      precip: block?.details?.precipitation_amount ?? 0,
      stepHours: hourly ? 1 : 6,
      symbol: block?.summary?.symbol_code ?? '',
      fog: d.fog_area_fraction ?? 0,
    });
  }
  return points;
}

/** Local (Moscow) date and hour of a UTC ISO time. */
export function mskParts(iso: string) {
  const shifted = new Date(Date.parse(iso) + MSK_OFFSET_HOURS * 3_600_000);
  return { date: shifted.toISOString().slice(0, 10), hour: shifted.getUTCHours() };
}

/** Today in Moscow, YYYY-MM-DD. */
export function mskToday(now = Date.now()) {
  return new Date(now + MSK_OFFSET_HOURS * 3_600_000).toISOString().slice(0, 10);
}

// Most significant first: the shift is labelled with the worst weather in it.
const SYMBOL_RANK = [
  'thunder',
  'heavysnow',
  'heavysleet',
  'heavyrain',
  'snow',
  'sleet',
  'rain',
  'fog',
  'cloudy',
  'partlycloudy',
  'fair',
  'clearsky',
];

function symbolRank(symbol: string) {
  const index = SYMBOL_RANK.findIndex((key) => symbol.includes(key));
  return index === -1 ? SYMBOL_RANK.length : index;
}

/**
 * The weather over the 08:00–17:00 shift of `date`. With 6-hourly data the
 * blocks that overlap the shift are used. Null when the date is outside the
 * forecast.
 */
export function shiftWeather(points: HourPoint[], date: string): ShiftWeather | null {
  const inShift = points.filter((point) => {
    const { date: day, hour } = mskParts(point.time);
    if (day !== date) return false;
    if (point.stepHours === 1) return hour >= SHIFT_START && hour < SHIFT_END;
    // A 6-hour block [hour, hour + 6) overlapping [08, 17).
    return hour < SHIFT_END && hour + 6 > SHIFT_START;
  });
  if (!inShift.length) return null;
  const strongest = inShift.reduce((a, b) => (b.wind > a.wind ? b : a));
  const worst = inShift.reduce((a, b) => (symbolRank(b.symbol) < symbolRank(a.symbol) ? b : a));
  const has = (key: string) => inShift.some((point) => point.symbol.includes(key));
  return {
    date,
    points: inShift,
    tempMin: Math.min(...inShift.map((p) => p.temp)),
    tempMax: Math.max(...inShift.map((p) => p.temp)),
    feelsMin: Math.min(...inShift.map((p) => p.feels ?? p.temp)),
    windMax: strongest.wind,
    windDir: strongest.windDir,
    precip: Math.round(inShift.reduce((sum, p) => sum + p.precip, 0) * 10) / 10,
    fogMax: Math.max(...inShift.map((p) => p.fog)),
    symbol: worst.symbol,
    thunder: has('thunder'),
    snow: has('snow'),
    sleet: has('sleet'),
    rain: has('rain'),
    hourly: inShift.every((p) => p.stepHours === 1),
  };
}

export type WorkLevel = 'ok' | 'caution' | 'stop';

export type WorkNote = { level: WorkLevel; title: string; advice: string };

/** Machine groups with the same weather limits. */
export type MachineGroup = 'lifting' | 'earth' | 'roller' | 'road' | 'any';

/** Site machine kinds (see lib/machinePhotos.ts) → weather group. */
export function machineGroup(kind: string | null | undefined): MachineGroup {
  switch (kind) {
    case 'crane':
    case 'kmu':
    case 'agp':
      return 'lifting';
    case 'backhoe':
    case 'excavator':
    case 'wheeled-excavator':
    case 'loader':
    case 'dozer':
    case 'tractor':
    case 'trench':
      return 'earth';
    case 'roller':
      return 'roller';
    case 'truck':
      return 'road';
    default:
      return 'any';
  }
}

// Limits, m/s of mean wind. Truck cranes and manipulators are typically
// limited to 10–14 m/s in operation and aerial platforms to 12.5 m/s
// (EN 280); gusts run ~1.5× the mean and are not forecast here, so the
// thresholds are set with that margin.
const LIFT_WIND_CAUTION = 7;
const LIFT_WIND_STOP = 10;
const WIND_CAUTION_ANY = 15;

/**
 * What the shift's weather means for the work, most severe first. Always
 * returns at least one note (an «ok» one when nothing stands in the way).
 */
export function assessWork(w: ShiftWeather, group: MachineGroup): WorkNote[] {
  const notes: WorkNote[] = [];
  const add = (level: WorkLevel, title: string, advice: string) =>
    notes.push({ level, title, advice });
  const lifting = group === 'lifting' || group === 'any';
  const wind = Math.round(w.windMax);

  if (w.thunder) {
    add(
      lifting ? 'stop' : 'caution',
      'Гроза',
      lifting
        ? 'Подъём грузов и работа в люльке в грозу запрещены — перенесите или ждите окна.'
        : 'В грозу работы на открытой площадке останавливают на время грозы.',
    );
  }
  if (lifting && w.windMax >= LIFT_WIND_STOP) {
    add(
      'stop',
      `Ветер ${wind} м/с`,
      'Для автокрана, манипулятора и автовышки это выше рабочих ограничений с учётом порывов — работы с подъёмом лучше перенести.',
    );
  } else if (lifting && w.windMax >= LIFT_WIND_CAUTION) {
    add(
      'caution',
      `Ветер ${wind} м/с`,
      'Порывы могут подойти к пределу для подъёма — машинист проверит ветер на месте анемометром.',
    );
  } else if (w.windMax >= WIND_CAUTION_ANY) {
    add(
      'caution',
      `Сильный ветер ${wind} м/с`,
      'Осторожно на открытой площадке и с лёгкими грузами.',
    );
  }
  if (w.sleet || (w.precip > 0 && w.tempMin <= 1 && w.tempMax >= -3)) {
    add(
      'caution',
      'Гололедица',
      'Скользко на подъезде и под опорами — нужен твёрдый подкладной материал, осторожно на уклонах.',
    );
  }
  if (group === 'roller' && (w.rain || w.precip >= 0.5)) {
    add(
      'stop',
      'Дождь',
      'Укатку асфальта в дождь не ведут: смесь остывает и не уплотняется. Грунт можно, но с осторожностью.',
    );
  } else if (group === 'roller' && w.tempMin < 5) {
    add(
      'caution',
      `Холодно, ${Math.round(w.tempMin)} °C`,
      'Для асфальта ниже +5 °C укатка хуже — лучше днём.',
    );
  }
  if ((group === 'earth' || group === 'any') && w.precip >= 5) {
    add(
      'caution',
      `Осадки ${w.precip} мм за смену`,
      'Грунт раскиснет: тяжелее копать и выезжать, возможны простои. Уточните подъезд.',
    );
  }
  if (w.fogMax >= 50 || w.symbol.includes('fog')) {
    add('caution', 'Туман', 'Плохая видимость — подъём и манёвры только с сигнальщиком.');
  }
  if (w.tempMin <= -35) {
    add(
      'stop',
      `Мороз ${Math.round(w.tempMin)} °C`,
      'Ниже −35 °C большинство машин не работает — перенос.',
    );
  } else if (w.tempMin <= -20) {
    add(
      'caution',
      `Мороз ${Math.round(w.tempMin)} °C`,
      'Нужен прогрев гидравлики, работа с перерывами; мёрзлый грунт — гидромолот или рыхлитель.',
    );
  }
  if (w.tempMax >= 32) {
    add(
      'caution',
      `Жара ${Math.round(w.tempMax)} °C`,
      'Перерывы для машиниста и контроль перегрева техники.',
    );
  }
  if (w.snow && !w.sleet) {
    add(
      'caution',
      'Снег',
      'Подъезд может замести. Кстати, погрузчики и тракторы для уборки снега у нас в каталоге.',
    );
  }
  if (!notes.length) add('ok', 'Погода не мешает работе', 'Смена по плану.');

  const order: Record<WorkLevel, number> = { stop: 0, caution: 1, ok: 2 };
  return notes.sort((a, b) => order[a.level] - order[b.level]);
}

/** The overall verdict of a list of notes. */
export function worstLevel(notes: WorkNote[]): WorkLevel {
  if (notes.some((n) => n.level === 'stop')) return 'stop';
  if (notes.some((n) => n.level === 'caution')) return 'caution';
  return 'ok';
}

export const LEVEL_LABEL: Record<WorkLevel, string> = {
  ok: 'Можно работать',
  caution: 'Осторожно',
  stop: 'Лучше перенести',
};

/** Russian name of a MET Norway symbol code. */
export function symbolLabel(symbol: string) {
  if (symbol.includes('thunder')) return 'гроза';
  if (symbol.includes('heavysnow')) return 'сильный снег';
  if (symbol.includes('snow')) return 'снег';
  if (symbol.includes('sleet')) return 'дождь со снегом';
  if (symbol.includes('heavyrain')) return 'сильный дождь';
  if (symbol.includes('rain')) return 'дождь';
  if (symbol.includes('fog')) return 'туман';
  if (symbol.includes('partlycloudy')) return 'переменная облачность';
  if (symbol.includes('cloudy')) return 'облачно';
  if (symbol.includes('fair')) return 'малооблачно';
  if (symbol.includes('clearsky')) return 'ясно';
  return 'без данных';
}

/** Compass point of a «wind from» direction. */
export function windFrom(degrees: number) {
  const points = ['С', 'СВ', 'В', 'ЮВ', 'Ю', 'ЮЗ', 'З', 'СЗ'];
  return points[Math.round((((degrees % 360) + 360) % 360) / 45) % 8]!;
}

/** Naberezhnye Chelny, city centre — the default work area. */
export const CHELNY = { lat: 55.74, lon: 52.4 };

/**
 * Forecast points for a place (server side). Coordinates are rounded to two
 * decimals (~1 km) as MET Norway asks, which also shares the cache between
 * nearby sites. Null when the service is unavailable.
 */
export async function fetchForecast(lat: number, lon: number): Promise<HourPoint[] | null> {
  const url = `https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=${lat.toFixed(2)}&lon=${lon.toFixed(2)}`;
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': WEATHER_USER_AGENT },
      next: { revalidate: 1800 },
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return null;
    const points = parseForecast(await response.json());
    return points.length ? points : null;
  } catch {
    return null;
  }
}

const signed = (value: number) => `${value > 0 ? '+' : ''}${Math.round(value)}`;

/** «+9…+14°» or «+12°». */
export function tempRange(w: ShiftWeather) {
  const min = Math.round(w.tempMin);
  const max = Math.round(w.tempMax);
  return min === max ? `${signed(min)}°` : `${signed(min)}…${signed(max)}°`;
}

/** One line for lists and messages: «+9…+14°, облачно, ветер 6 м/с С — Осторожно». */
export function weatherLine(w: ShiftWeather, notes: WorkNote[]) {
  return `${tempRange(w)}, ${symbolLabel(w.symbol)}, ветер ${Math.round(w.windMax)} м/с ${windFrom(w.windDir)}${w.precip ? `, осадки ${w.precip} мм` : ''} — ${LEVEL_LABEL[worstLevel(notes)]}`;
}
