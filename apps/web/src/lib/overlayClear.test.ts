import { describe, expect, it } from 'vitest';
import { samplePoints } from './overlayClear';

describe('samplePoints', () => {
  it('covers a 48 px button densely enough to hit any 44 px target under it', () => {
    const points = samplePoints({ left: 10, top: 600, right: 58, bottom: 648 }, 22);
    // 48 px at a 22 px step: 4 points per side.
    expect(points).toHaveLength(16);
    const xs = [...new Set(points.map((p) => p.x))].sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i += 1) expect(xs[i]! - xs[i - 1]!).toBeLessThanOrEqual(22);
    expect(xs[0]).toBe(11);
    expect(xs[xs.length - 1]).toBe(57);
  });

  it('keeps every point inside the box', () => {
    const box = { left: 0, top: 500, right: 370, bottom: 546 };
    const points = samplePoints(box);
    expect(points.length).toBeGreaterThan(30);
    for (const p of points) {
      expect(p.x).toBeGreaterThan(box.left);
      expect(p.x).toBeLessThan(box.right);
      expect(p.y).toBeGreaterThan(box.top);
      expect(p.y).toBeLessThan(box.bottom);
    }
  });

  it('gives nothing for an empty box or a bad step', () => {
    expect(samplePoints({ left: 5, top: 5, right: 5, bottom: 40 })).toEqual([]);
    expect(samplePoints({ left: 0, top: 0, right: 10, bottom: 10 }, 0)).toEqual([]);
  });
});
