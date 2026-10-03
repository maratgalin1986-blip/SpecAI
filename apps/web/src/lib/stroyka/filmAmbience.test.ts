import { describe, expect, it } from 'vitest';
import { crewDelay, filmNature, pickCrewLine, ZONE_CREW } from './filmAmbience';
import { CREW, CREW_VOICE } from './crew';
import { VOICE_CLIPS } from './voiceClips';
import { voiceKey } from './voice';
import type { WeatherPoint } from '@/lib/stroykaSky';

const point = (over: Partial<WeatherPoint>): WeatherPoint => ({
  symbol: 'clearsky_day',
  temp: 15,
  wind: 3,
  windDir: 200,
  precip: 0,
  fog: 0,
  ...over,
});

// 12:00 and 00:00 in Moscow (UTC+3), early October.
const NOON = new Date('2026-10-03T09:00:00Z');
const MIDNIGHT = new Date('2026-10-03T21:00:00Z');

describe('filmNature', () => {
  it('clear day: dry, no rain, the wind as forecast, daylight', () => {
    expect(filmNature(NOON, point({ wind: 4.5 }))).toEqual({
      rain: 0,
      snow: 0,
      wind: 4.5,
      night: 0,
      ground: 'dry',
    });
  });

  it('rain makes the ground wet; midnight is night', () => {
    const n = filmNature(MIDNIGHT, point({ symbol: 'heavyrain', wind: 9 }));
    expect(n.rain).toBe(1);
    expect(n.ground).toBe('wet');
    expect(n.wind).toBe(9);
    expect(n.night).toBe(1);
  });

  it('snow in the frost lies on the ground; New Year snow falls anyway', () => {
    expect(filmNature(NOON, point({ symbol: 'snow', temp: -5 })).ground).toBe('snow');
    const ny = filmNature(NOON, point({ symbol: 'rain', temp: 3 }), true);
    expect(ny).toMatchObject({ rain: 0, ground: 'snow' });
    expect(ny.snow).toBeGreaterThan(0.29);
  });

  it('no forecast: clear weather', () => {
    expect(filmNature(NOON, null).ground).toBe('dry');
  });
});

describe('background crew', () => {
  it('every zone worker is crew with a recorded voice for each line', () => {
    for (const id of Object.values(ZONE_CREW)) {
      expect(CREW[id!]).toBeDefined();
      expect(CREW_VOICE[id!]).toBeDefined();
    }
    for (const m of Object.values(CREW))
      for (const l of m.lines) expect(VOICE_CLIPS[voiceKey(l)]).toBeDefined();
  });

  it('prefers the worker of the zone', () => {
    expect(pickCrewLine('kotlovan', null, () => 0).name).toBe('Рустам');
    expect(pickCrewLine('gate', null, () => 0).name).toBe('Николай Петрович');
    expect(pickCrewLine('montazh', null, () => 0).id).toBe('worker-sling');
  });

  it('a zone without a worker picks anyone', () => {
    const seen = new Set<string>();
    let i = 0;
    const seq = [0.1, 0.3, 0.5, 0.7, 0.9, 0.99];
    for (let k = 0; k < 30; k++) seen.add(pickCrewLine('office', null, () => seq[i++ % 6]!).id);
    expect(seen.size).toBeGreaterThan(2);
  });

  it('never repeats the previous line', () => {
    let last: string | null = null;
    for (let k = 0; k < 200; k++) {
      const line = pickCrewLine('kotlovan', last);
      expect(line.text).not.toBe(last);
      last = line.text;
    }
  });

  it('waits 12 to 25 seconds', () => {
    expect(crewDelay(() => 0)).toBe(12_000);
    expect(crewDelay(() => 0.9999)).toBeLessThanOrEqual(25_000);
  });
});
