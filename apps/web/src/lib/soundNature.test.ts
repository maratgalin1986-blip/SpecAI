import { describe, expect, it } from 'vitest';
import { natureEvent, natureMix } from './soundNature';
import { SOUND_CREDITS } from './soundAssets';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const calm = { rain: 0, snow: 0, wind: 2, night: 0, ground: 'dry' as const };

describe('nature sounds follow the weather', () => {
  it('birds on a dry day, rain instead of birds in the rain', () => {
    expect(natureMix(calm).birds).toBeGreaterThan(0.3);
    expect(natureMix(calm)['rain-light']).toBe(0);
    const rain = natureMix({ ...calm, rain: 0.4, ground: 'wet' });
    expect(rain['rain-light']).toBeGreaterThan(0.3);
    expect(rain.birds).toBe(0);
    const storm = natureMix({ ...calm, rain: 1 });
    expect(storm['rain-heavy']).toBeGreaterThan(0.5);
    expect(storm['rain-light']).toBe(0);
  });

  it('wind by its speed, the town by day or by night', () => {
    expect(natureMix(calm).wind).toBe(0);
    expect(natureMix({ ...calm, wind: 12 }).wind).toBeGreaterThan(0.4);
    expect(natureMix({ ...calm, night: 1 })['city-night']).toBeGreaterThan(0);
    expect(natureMix({ ...calm, night: 1 })['city-day']).toBe(0);
  });

  it('no chirps at night or in the rain, dogs and cats any time', () => {
    const night = { ...calm, night: 1 };
    const wet = { ...calm, rain: 0.8 };
    for (let r = 0; r < 1; r += 0.01) {
      expect(natureEvent(night, r) ?? '').not.toMatch(/chirp/);
      expect(natureEvent(wet, r) ?? '').not.toMatch(/chirp/);
    }
    const heard = new Set(Array.from({ length: 100 }, (_, i) => natureEvent(night, i / 100)));
    expect([...heard].some((n) => n?.startsWith('dog'))).toBe(true);
    expect([...heard].some((n) => n?.startsWith('cat'))).toBe(true);
  });

  it('every recording is on disk in both formats and credited', () => {
    const dir = join(__dirname, '../../public/audio');
    for (const credit of SOUND_CREDITS) {
      expect(existsSync(join(dir, `${credit.name}.webm`)), credit.name).toBe(true);
      expect(existsSync(join(dir, `${credit.name}.mp3`)), credit.name).toBe(true);
    }
  });
});
