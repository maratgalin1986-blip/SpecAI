import { describe, expect, it } from 'vitest';
import { kindInfo, WORLD_KINDS, worldMode, worldOrderHref, worldPixelRatio } from './kinds';

describe('world3d kinds', () => {
  it('maps every machine to a catalog slug', () => {
    expect(WORLD_KINDS.map((k) => k.slug)).toEqual([
      'backhoe-loaders',
      'cranes',
      'aerial-platforms',
      'dump-trucks',
    ]);
    expect(kindInfo('agp').title).toBe('Автовышка');
  });

  it('builds the order link only from a safe id', () => {
    expect(worldOrderHref('ckabc123')).toBe('/orders?category=ckabc123#new');
    expect(worldOrderHref(undefined)).toBe('/orders#new');
    expect(worldOrderHref('a"b<script>')).toBe('/orders#new');
  });

  it('falls back to the poster without WebGL, on data saver and weak phones', () => {
    expect(worldMode({ webgl: false, reducedMotion: false })).toBe('poster');
    expect(worldMode({ webgl: true, reducedMotion: false, saveData: true })).toBe('poster');
    expect(worldMode({ webgl: true, reducedMotion: false, memory: 2 })).toBe('poster');
    expect(worldMode({ webgl: true, reducedMotion: false, cores: 2 })).toBe('poster');
    // iPhone Safari: no deviceMemory, 6 cores.
    expect(worldMode({ webgl: true, reducedMotion: false, cores: 6 })).toBe('live');
    expect(worldMode({ webgl: true, reducedMotion: true, cores: 8 })).toBe('still');
  });

  it('caps the pixel ratio', () => {
    expect(worldPixelRatio(3, true)).toBe(1.25);
    expect(worldPixelRatio(2, false)).toBe(1.5);
    expect(worldPixelRatio(1, false)).toBe(1);
    expect(worldPixelRatio(0, false)).toBe(1);
  });
});
