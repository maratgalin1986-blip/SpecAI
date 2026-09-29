import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextDeck, SITE_OBJECTS } from './siteObjects';

const VIDEO_DIR = join(__dirname, '../../public/video');

describe('SITE_OBJECTS', () => {
  it('only uses clips that exist in every format', () => {
    for (const item of SITE_OBJECTS) {
      for (const clip of [item.hero, ...Object.values(item.clips)]) {
        for (const ext of ['webm', 'mp4', 'jpg']) {
          expect(existsSync(join(VIDEO_DIR, `${clip}.${ext}`)), `${clip}.${ext}`).toBe(true);
        }
      }
    }
  });

  it('gives every project its own opening shot', () => {
    const heroes = SITE_OBJECTS.map((item) => item.hero);
    expect(new Set(heroes).size).toBe(heroes.length);
  });
});

describe('nextDeck', () => {
  it('never starts with the project shown last', () => {
    const ids = SITE_OBJECTS.map((item) => item.id);
    for (let i = 0; i < 200; i++) expect(nextDeck(ids, ids[0])[0]).not.toBe(ids[0]);
  });
});

describe('currentSiteObject', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('shows every project once before any repeats, across visits', async () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
    });
    const seen: string[] = [];
    for (let visit = 0; visit < SITE_OBJECTS.length * 3; visit++) {
      vi.resetModules();
      const { currentSiteObject } = await import('./siteObjects');
      seen.push(currentSiteObject().id);
    }
    for (let round = 0; round < 3; round++) {
      const slice = seen.slice(round * SITE_OBJECTS.length, (round + 1) * SITE_OBJECTS.length);
      expect(new Set(slice).size).toBe(SITE_OBJECTS.length);
    }
    for (let i = 1; i < seen.length; i++) expect(seen[i]).not.toBe(seen[i - 1]);
  });
});
