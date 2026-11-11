import { describe, expect, it } from 'vitest';
import { confettiPieces } from './confetti';

describe('confettiPieces', () => {
  it('is deterministic and has the asked count', () => {
    expect(confettiPieces(28)).toEqual(confettiPieces(28));
    expect(confettiPieces(10)).toHaveLength(10);
    expect(confettiPieces(0)).toEqual([]);
  });

  it('keeps every piece inside a phone screen and the effect under 2.5 s', () => {
    for (const p of confettiPieces(28)) {
      // The burst starts in the middle of a 390 px screen: at most ~190 px to a side.
      expect(Math.abs(p.dx)).toBeLessThanOrEqual(190);
      expect(p.up).toBeLessThan(0);
      expect(p.fall).toBeGreaterThan(0);
      expect(p.d + p.t).toBeLessThanOrEqual(2500);
    }
  });

  it('flies lower and shorter in the calm version', () => {
    const full = confettiPieces(10, 1);
    const calm = confettiPieces(10, 0.6);
    expect(Math.max(...calm.map((p) => p.fall))).toBeLessThan(Math.max(...full.map((p) => p.fall)));
  });
});
