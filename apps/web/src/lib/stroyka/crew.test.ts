import { describe, expect, it } from 'vitest';
import { CREW, crewLine } from './crew';
import { CENSOR } from '@/lib/stroykaJokes';

describe('crew', () => {
  it('every crew member has a name, a home and several clean lines', () => {
    const homes = new Set(Object.values(CREW).map((m) => m.from));
    expect(homes.size).toBeGreaterThanOrEqual(5);
    for (const m of Object.values(CREW)) {
      expect(m.lines.length).toBeGreaterThanOrEqual(5);
      for (const l of m.lines) expect(l).not.toMatch(CENSOR);
    }
  });

  it('a crew line says who is talking; others get none', () => {
    expect(crewLine('worker-pit', undefined, () => 0)).toMatch(/^Рустам: /);
    expect(crewLine('npc-gate')).toBeNull();
  });
});
