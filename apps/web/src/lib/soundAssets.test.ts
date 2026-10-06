import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MACHINE_TYPES } from './machinePhotos';
import { MACHINE_LEVELS } from './sound';
import {
  CITY_BED,
  CUE_SAMPLES,
  MACHINE_SOUNDS,
  MUSIC_BED,
  SITE_BEDS,
  SITE_EVENTS,
  SOUND_CREDITS,
  type SampleName,
} from './soundAssets';
import { cueFatigue } from './soundEngine';

const file = (name: string, ext: string) =>
  fileURLToPath(new URL(`../../public/audio/${name}.${ext}`, import.meta.url));

/** Every recording the engine may ask for, outside the nature layer. */
function usedSamples(): SampleName[] {
  const names = new Set<SampleName>([CITY_BED, MUSIC_BED, ...SITE_BEDS]);
  for (const s of Object.values(MACHINE_SOUNDS)) {
    names.add(s.idle);
    s.arrive.forEach((a) => names.add(a));
  }
  Object.values(CUE_SAMPLES).forEach((list) => list.forEach((n) => names.add(n)));
  SITE_EVENTS.forEach((e) => names.add(e.name));
  ['radio-squelch', 'radio-hiss', 'radio-beep'].forEach((n) => names.add(n as SampleName));
  return [...names];
}

describe('sound map', () => {
  it('gives every machine type a level, an idle loop and two arrivals', () => {
    for (const type of MACHINE_TYPES) {
      expect(MACHINE_LEVELS[type]).toBeGreaterThan(0);
      const s = MACHINE_SOUNDS[type];
      expect(s.idle).toMatch(/^m-idle-/);
      expect(new Set(s.arrive).size).toBe(2);
      expect(Math.abs(s.rate - 1)).toBeLessThanOrEqual(0.08);
    }
  });

  it('has two variants of the cues that repeat', () => {
    for (const cue of ['click', 'thunk', 'whoosh', 'stamp', 'chime', 'start'] as const) {
      expect(CUE_SAMPLES[cue].length).toBeGreaterThanOrEqual(2);
    }
    expect(SITE_BEDS.length).toBeGreaterThanOrEqual(2);
  });

  it('credits every recording it uses, with a free licence', () => {
    const credited = new Set(SOUND_CREDITS.map((c) => c.name));
    for (const name of usedSamples()) expect(credited.has(name), name).toBe(true);
    expect(credited.size).toBe(SOUND_CREDITS.length);
    for (const c of SOUND_CREDITS) {
      expect(c.license).toMatch(
        /^(CC0|CC BY|Public domain|Mixkit (Sound Effects|Stock Music) Free License)/,
      );
      expect(c.url).toMatch(/^https:\/\/mixkit\.co\//);
    }
  });

  it('ships every credited recording as small mono webm + mp3', () => {
    for (const c of SOUND_CREDITS) {
      for (const ext of ['webm', 'mp3']) {
        expect(existsSync(file(c.name, ext)), `${c.name}.${ext}`).toBe(true);
        expect(statSync(file(c.name, ext)).size).toBeLessThan(400_000);
      }
    }
  });

  it('ships the interface cues tiny, so the first press is heard at once', () => {
    for (const cue of ['click', 'thunk', 'whoosh'] as const) {
      for (const name of CUE_SAMPLES[cue]) {
        expect(readFileSync(file(name, 'webm')).length).toBeLessThan(8_000);
      }
    }
  });
});

describe('cue fatigue', () => {
  it('starts at full level and fades with a burst of presses', () => {
    expect(cueFatigue(0, 0)).toBe(1);
    expect(cueFatigue(3, 3)).toBeLessThan(0.6);
    expect(cueFatigue(1, 1)).toBeGreaterThan(cueFatigue(4, 4));
  });

  it('never falls silent and settles over the session', () => {
    expect(cueFatigue(50, 500)).toBeGreaterThanOrEqual(0.25);
    expect(cueFatigue(0, 500)).toBe(0.5);
    expect(cueFatigue(0, 10)).toBe(1);
  });
});
