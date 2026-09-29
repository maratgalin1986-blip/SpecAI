import { afterEach, describe, expect, it, vi } from 'vitest';
import { MACHINE_PHOTO_VARIANTS, MACHINE_TYPES, photosOf, pickPhoto } from './machinePhotos';

describe('photosOf', () => {
  it('has at least one photo for every type', () => {
    for (const type of MACHINE_TYPES) {
      expect(photosOf(type).length).toBeGreaterThan(0);
    }
  });

  it('lists /images/machines files for types with variants', () => {
    for (const type of MACHINE_TYPES) {
      const count = MACHINE_PHOTO_VARIANTS[type] ?? 0;
      if (count > 0) expect(photosOf(type)[0]).toBe(`/images/machines/${type}-1.jpg`);
    }
  });
});

describe('pickPhoto', () => {
  const craneVariants = MACHINE_PHOTO_VARIANTS.crane;
  afterEach(() => {
    vi.unstubAllGlobals();
    MACHINE_PHOTO_VARIANTS.crane = craneVariants;
  });

  it('never repeats the photo shown last time for the type', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('window', {
      sessionStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
      },
    });
    MACHINE_PHOTO_VARIANTS.crane = 3;
    let last = pickPhoto('crane');
    for (let i = 0; i < 20; i++) {
      const next = pickPhoto('crane');
      expect(next).not.toBe(last);
      expect(photosOf('crane')).toContain(next);
      last = next;
    }
  });

  it('still picks when storage throws', () => {
    vi.stubGlobal('window', {
      get sessionStorage(): Storage {
        throw new Error('blocked');
      },
    });
    MACHINE_PHOTO_VARIANTS.crane = 3;
    expect(photosOf('crane')).toContain(pickPhoto('crane'));
  });
});
