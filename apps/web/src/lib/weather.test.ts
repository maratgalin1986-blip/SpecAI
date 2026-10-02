import { describe, expect, it } from 'vitest';
import {
  assessWork,
  bestWindow,
  machineGroup,
  mskParts,
  parseForecast,
  shiftWeather,
  windFrom,
  worstLevel,
  type HourPoint,
  type ShiftWeather,
} from './weather';

const step = (time: string, temp: number, wind: number, precip: number, symbol: string) => ({
  time,
  data: {
    instant: {
      details: {
        air_temperature: temp,
        wind_speed: wind,
        wind_from_direction: 200,
        fog_area_fraction: 0,
      },
    },
    next_1_hours: { summary: { symbol_code: symbol }, details: { precipitation_amount: precip } },
  },
});

describe('parseForecast', () => {
  it('reads MET Norway timeseries and skips broken steps', () => {
    const points = parseForecast({
      properties: {
        timeseries: [
          step('2026-10-01T05:00:00Z', 6, 3, 0, 'cloudy'),
          { time: '2026-10-01T06:00:00Z', data: { instant: { details: {} } } },
        ],
      },
    });
    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({ temp: 6, wind: 3, stepHours: 1, symbol: 'cloudy' });
    expect(parseForecast(null)).toEqual([]);
  });
});

describe('shiftWeather', () => {
  it('uses Moscow time: 08:00–17:00 MSK is 05:00–13:59 UTC', () => {
    expect(mskParts('2026-10-01T05:00:00Z')).toEqual({ date: '2026-10-01', hour: 8 });
    const points = parseForecast({
      properties: {
        timeseries: [
          step('2026-10-01T04:00:00Z', 1, 1, 0, 'clearsky_day'), // 07:00 — before the shift
          step('2026-10-01T05:00:00Z', 4, 3, 0.2, 'rain'),
          step('2026-10-01T09:00:00Z', 9, 8, 0.4, 'thunder'),
          step('2026-10-01T14:00:00Z', 7, 12, 0, 'cloudy'), // 17:00 — after
        ],
      },
    });
    const shift = shiftWeather(points, '2026-10-01')!;
    expect(shift.points).toHaveLength(2);
    expect(shift).toMatchObject({ tempMin: 4, tempMax: 9, windMax: 8, precip: 0.6, thunder: true });
    expect(shift.symbol).toBe('thunder');
    expect(shiftWeather(points, '2026-10-05')).toBeNull();
  });
});

const shift = (over: Partial<ShiftWeather>): ShiftWeather => ({
  date: '2026-10-01',
  points: [] as HourPoint[],
  tempMin: 8,
  tempMax: 14,
  feelsMin: 6,
  windMax: 3,
  windDir: 200,
  precip: 0,
  fogMax: 0,
  symbol: 'partlycloudy_day',
  thunder: false,
  snow: false,
  sleet: false,
  rain: false,
  hourly: true,
  ...over,
});

describe('assessWork', () => {
  it('is fine on a calm dry day', () => {
    const notes = assessWork(shift({}), 'lifting');
    expect(worstLevel(notes)).toBe('ok');
  });

  it('stops lifting in strong wind and thunder, but not earthworks', () => {
    expect(worstLevel(assessWork(shift({ windMax: 11 }), 'lifting'))).toBe('stop');
    expect(worstLevel(assessWork(shift({ windMax: 8 }), 'lifting'))).toBe('caution');
    expect(worstLevel(assessWork(shift({ windMax: 11 }), 'earth'))).toBe('ok');
    expect(worstLevel(assessWork(shift({ thunder: true }), 'lifting'))).toBe('stop');
    expect(worstLevel(assessWork(shift({ thunder: true }), 'earth'))).toBe('caution');
  });

  it('stops asphalt rolling in rain and warns about wet ground', () => {
    expect(worstLevel(assessWork(shift({ rain: true, precip: 2 }), 'roller'))).toBe('stop');
    expect(worstLevel(assessWork(shift({ precip: 7 }), 'earth'))).toBe('caution');
  });

  it('handles frost and ice', () => {
    expect(worstLevel(assessWork(shift({ tempMin: -25, tempMax: -18 }), 'earth'))).toBe('caution');
    expect(worstLevel(assessWork(shift({ tempMin: -37, tempMax: -30 }), 'earth'))).toBe('stop');
    const ice = assessWork(shift({ tempMin: -1, tempMax: 2, precip: 1 }), 'road');
    expect(ice.map((n) => n.title)).toContain('Гололедица');
  });

  it('puts the most severe note first', () => {
    const notes = assessWork(shift({ windMax: 12, fogMax: 80 }), 'lifting');
    expect(notes[0]!.level).toBe('stop');
  });
});

describe('helpers', () => {
  it('maps machine kinds to weather groups', () => {
    expect(machineGroup('crane')).toBe('lifting');
    expect(machineGroup('agp')).toBe('lifting');
    expect(machineGroup('backhoe')).toBe('earth');
    expect(machineGroup('roller')).toBe('roller');
    expect(machineGroup(undefined)).toBe('any');
  });

  it('names wind directions', () => {
    expect(windFrom(0)).toBe('С');
    expect(windFrom(225)).toBe('ЮЗ');
    expect(windFrom(359)).toBe('С');
  });
});

describe('bestWindow', () => {
  // Shift hours 08..16 MSK = 05..13 UTC.
  const hours = (wind: (h: number) => number, precip: (h: number) => number = () => 0) =>
    ({
      hourly: true,
      points: Array.from({ length: 9 }, (_, i) => ({
        time: `2026-10-01T${String(5 + i).padStart(2, '0')}:00:00Z`,
        temp: 10,
        wind: wind(8 + i),
        windDir: 0,
        precip: precip(8 + i),
        stepHours: 1,
        symbol: 'cloudy',
        fog: 0,
      })),
    }) as unknown as ShiftWeather;

  it('finds the calm hours before the wind picks up for a crane', () => {
    const w = hours((h) => (h >= 13 ? 12 : 4));
    expect(bestWindow(w, 'lifting')).toEqual({ from: 8, to: 13 });
    expect(bestWindow(w, 'earth')).toEqual({ from: 8, to: 17 });
  });

  it('returns null when it rains all day', () => {
    expect(
      bestWindow(
        hours(
          () => 3,
          () => 1,
        ),
        'earth',
      ),
    ).toBeNull();
  });
});
