import { describe, expect, it } from 'vitest';
import { dialogueNode } from '@/lib/stroyka';
import {
  atMskTime,
  conditionsLine,
  dayPhase,
  liftingStop,
  moonPhase,
  nearestPoint,
  overrideLiftStop,
  parseOverrides,
  skyPalette,
  sunPosition,
  weatherScene,
  WEATHER_PRESETS,
} from '@/lib/stroykaSky';

describe('sun over Набережные Челны', () => {
  it('stands at ~57.7° due south at the June solstice noon', () => {
    // Solar noon at 52.4° E is about 08:30 UTC.
    const { elevation, azimuth } = sunPosition(new Date('2026-06-21T08:30:00Z'));
    expect(elevation).toBeGreaterThan(56.7);
    expect(elevation).toBeLessThan(58.7);
    expect(azimuth).toBeGreaterThan(175);
    expect(azimuth).toBeLessThan(185);
  });

  it('is ~34° high at the March equinox noon and rises in the east', () => {
    expect(sunPosition(new Date('2026-03-20T08:40:00Z')).elevation).toBeCloseTo(34.3, 0);
    const morning = sunPosition(new Date('2026-03-20T03:00:00Z'));
    expect(morning.azimuth).toBeGreaterThan(80);
    expect(morning.azimuth).toBeLessThan(110);
  });

  it('is deep below the horizon on a winter midnight', () => {
    expect(sunPosition(new Date('2026-12-21T21:00:00Z')).elevation).toBeLessThan(-40);
  });

  it('names the phases of the day', () => {
    expect(dayPhase(-20, 0)).toBe('night');
    expect(dayPhase(1, 90)).toBe('dawn');
    expect(dayPhase(1, 270)).toBe('dusk');
    expect(dayPhase(8, 250)).toBe('golden');
    expect(dayPhase(40, 180)).toBe('day');
  });
});

describe('moon', () => {
  it('is full on 3 January 2026 and new on 18 January 2026', () => {
    expect(moonPhase(new Date('2026-01-03T10:03:00Z'))).toBeCloseTo(0.5, 1);
    const fresh = moonPhase(new Date('2026-01-18T19:52:00Z'));
    expect(Math.min(fresh, 1 - fresh)).toBeLessThan(0.03);
  });
});

describe('sky palette', () => {
  it('turns the floodlights on at night and off by day', () => {
    expect(skyPalette(-20).night).toBe(1);
    expect(skyPalette(30).night).toBe(0);
    expect(skyPalette(30).sunIntensity).toBeGreaterThan(skyPalette(3).sunIntensity);
    expect(skyPalette(-20).sunIntensity).toBe(0);
  });
});

describe('weather → scene', () => {
  it('maps MET symbols', () => {
    const clear = weatherScene({ ...WEATHER_PRESETS.clear! });
    expect(clear.clouds).toBeLessThan(0.1);
    expect(clear.rain + clear.snow + clear.fog).toBe(0);

    const rain = weatherScene({ ...WEATHER_PRESETS.clear!, symbol: 'lightrainshowers_day' });
    expect(rain.rain).toBeCloseTo(0.35);
    expect(rain.wet).toBe(true);
    expect(rain.label).toBe('дождь');

    const heavy = weatherScene({ ...WEATHER_PRESETS.clear!, symbol: 'heavyrain' });
    expect(heavy.rain).toBe(1);
    expect(heavy.clouds).toBeGreaterThan(0.9);

    const snow = weatherScene(WEATHER_PRESETS.snow);
    expect(snow.snow).toBeGreaterThan(0.5);
    expect(snow.snowGround).toBe(true);
    expect(snow.rain).toBe(0);

    const fog = weatherScene(WEATHER_PRESETS.fog);
    expect(fog.fog).toBeGreaterThan(0.8);

    const storm = weatherScene(WEATHER_PRESETS.thunder);
    expect(storm.thunder).toBe(true);
    expect(storm.clouds).toBe(1);

    expect(weatherScene(null).symbol).toBe('clearsky_day');
  });

  it('stops lifting in strong wind and thunder, with Ильдар saying so', () => {
    expect(liftingStop(WEATHER_PRESETS.clear)).toEqual({ stop: false, reason: null });
    expect(liftingStop(WEATHER_PRESETS.wind)).toEqual({ stop: true, reason: 'wind' });
    expect(liftingStop(WEATHER_PRESETS.thunder)).toEqual({ stop: true, reason: 'thunder' });
    const line = dialogueNode('montazh', liftingStop(WEATHER_PRESETS.wind));
    expect(line?.text).toContain('Ветер сильный, кран не поднимаем — запишу на завтра');
    expect(line?.replies[0]?.action).toEqual({ kind: 'form' });
    expect(dialogueNode('montazh', liftingStop(WEATHER_PRESETS.clear))?.text).not.toContain(
      'Ветер',
    );
  });

  it('dev overrides agree with assessWork on wind and thunder', () => {
    for (const preset of ['clear', 'wind', 'thunder', 'rain', 'snow'] as const)
      expect(overrideLiftStop(WEATHER_PRESETS[preset])).toEqual(
        liftingStop(WEATHER_PRESETS[preset]),
      );
  });

  it('picks the forecast hour nearest to now', () => {
    const points = [
      { time: '2026-10-02T10:00:00Z' },
      { time: '2026-10-02T11:00:00Z' },
      { time: '2026-10-02T12:00:00Z' },
    ];
    expect(nearestPoint(points, Date.parse('2026-10-02T11:20:00Z'))?.time).toBe(
      '2026-10-02T11:00:00Z',
    );
    expect(nearestPoint([], 0)).toBe(null);
  });
});

describe('HUD and overrides', () => {
  it('prints the conditions line in Moscow time', () => {
    const date = new Date('2026-10-02T18:14:00Z');
    expect(conditionsLine(date, weatherScene({ ...WEATHER_PRESETS.rain!, temp: 3, wind: 7 }))).toBe(
      '🌧️ Челны · пт, 2 окт · 21:14 · +3° · дождь · ветер 7 м/с',
    );
    expect(conditionsLine(date, null)).toBe('Челны · пт, 2 окт · 21:14');
    // A clear night shows the moon.
    expect(conditionsLine(date, weatherScene(WEATHER_PRESETS.clear!)).startsWith('🌙')).toBe(true);
  });

  it('reads ?time= and ?weather= overrides', () => {
    expect(parseOverrides('?time=23:00&weather=rain')).toEqual({
      time: { h: 23, m: 0 },
      weather: WEATHER_PRESETS.rain,
    });
    expect(parseOverrides('?weather=toString&time=25:00')).toEqual({});
    expect(parseOverrides('?wind=12').weather?.wind).toBe(12);
    const at = atMskTime(new Date('2026-10-02T22:30:00Z'), 23, 0);
    expect(at.toISOString()).toBe('2026-10-03T20:00:00.000Z');
  });
});
