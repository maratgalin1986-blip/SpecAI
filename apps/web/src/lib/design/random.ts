// A tiny seeded PRNG (mulberry32): the same seed always gives the same
// design, so a shared link or «Ещё вариант» history is reproducible.

export type Rand = () => number;

export function rng(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Uniform number in [min, max). */
export const between = (r: Rand, min: number, max: number) => min + (max - min) * r();

export const pick = <T>(r: Rand, items: readonly T[]): T =>
  items[Math.floor(r() * items.length) % items.length]!;

export const chance = (r: Rand, p: number) => r() < p;

/** A fresh random seed for «Ещё вариант». */
export const newSeed = () => Math.floor(Math.random() * 1_000_000) + 1;

export const round = (n: number, digits = 1) => {
  const k = 10 ** digits;
  return Math.round(n * k) / k;
};
