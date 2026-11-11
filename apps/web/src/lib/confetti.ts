export type Piece = { dx: number; up: number; fall: number; r: number; d: number; t: number };

/**
 * The flight of the confetti pieces: where each ends sideways (dx), how far it
 * is thrown up, how far it falls, how much it turns, and its delay and time.
 * Deterministic (no Math.random in render): the same call gives the same
 * pieces. A golden-angle fan spreads them evenly, without clumps.
 */
export function confettiPieces(count: number, spread = 1): Piece[] {
  const out: Piece[] = [];
  for (let i = 0; i < count; i += 1) {
    const a = (i * 137.508 * Math.PI) / 180;
    const k = 0.35 + ((i * 7) % 10) / 14;
    out.push({
      dx: Math.round(Math.cos(a) * 190 * k * spread),
      up: -Math.round((90 + ((i * 13) % 11) * 14) * spread),
      fall: Math.round((260 + ((i * 17) % 9) * 22) * spread),
      r: (i % 2 ? 1 : -1) * (180 + ((i * 29) % 7) * 80),
      d: (i % 6) * 35,
      t: 1500 + ((i * 11) % 5) * 120,
    });
  }
  return out;
}
