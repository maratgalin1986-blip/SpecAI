import { describe, expect, it } from 'vitest';
import { HAT, lookFor, seeded } from './people';

describe('seeded people looks', () => {
  it('the same id always gives the same person', () => {
    expect(lookFor('worker-pit')).toEqual(lookFor('worker-pit'));
    expect(seeded('a')()).toBe(seeded('a')());
    expect(lookFor('worker-pit')).not.toEqual(lookFor('worker-yard'));
  });

  it('the crew wears orange or yellow hats and varies in build and height', () => {
    const crew = Array.from({ length: 40 }, (_, i) => lookFor(`crew-${i}`));
    for (const l of crew) {
      expect([HAT.orange, HAT.yellow]).toContain(l.hat);
      expect(l.build).toBeGreaterThanOrEqual(0.9);
      expect(l.build).toBeLessThanOrEqual(1.12);
      expect(l.height).toBeGreaterThanOrEqual(0.93);
      expect(l.height).toBeLessThanOrEqual(1.05);
    }
    expect(new Set(crew.map((l) => l.skin)).size).toBeGreaterThan(2);
    expect(crew.some((l) => l.facial === 'moustache' || l.facial === 'beard')).toBe(true);
    expect(crew.some((l) => l.facial === 'none')).toBe(true);
  });

  it('fixed traits win; women get no beard', () => {
    const foreman = lookFor('npc-gate', { hat: HAT.white, facial: 'moustache' });
    expect(foreman.hat).toBe(HAT.white);
    expect(foreman.facial).toBe('moustache');
    for (let i = 0; i < 20; i++) expect(lookFor(`w-${i}`, { female: true }).facial).toBe('none');
  });
});
