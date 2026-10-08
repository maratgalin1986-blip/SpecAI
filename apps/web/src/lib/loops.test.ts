import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LANDINGS } from './landings';
import { landingLoop, LOOPS, STEP_LOOPS, type LoopName } from './loops';

const DIR = join(__dirname, '../../public/loops');
const names = Object.keys(LOOPS) as LoopName[];

// Width and height of the first video track (the `tkhd` box of an mp4).
function mp4Size(file: string): [number, number] {
  const data = readFileSync(file);
  const at = data.indexOf('tkhd');
  // Width and height are the last 8 bytes of the box, 16.16 fixed point.
  const end = at - 4 + data.readUInt32BE(at - 4);
  return [data.readUInt32BE(end - 8) >> 16, data.readUInt32BE(end - 4) >> 16];
}

describe('LOOPS (public/loops)', () => {
  it('has the 720p, 480p and poster files of every loop, within budget', () => {
    for (const name of names) {
      const full = join(DIR, `${name}.mp4`);
      const light = join(DIR, `${name}-sm.mp4`);
      const poster = join(DIR, `${name}.webp`);
      for (const file of [full, light, poster]) expect(existsSync(file), file).toBe(true);
      expect(statSync(full).size, `${name}.mp4`).toBeLessThanOrEqual(1_500_000);
      expect(statSync(light).size, `${name}-sm.mp4`).toBeLessThanOrEqual(600_000);
      expect(statSync(poster).size, `${name}.webp`).toBeLessThanOrEqual(90_000);
      expect(mp4Size(full)).toEqual([1280, 720]);
      expect(mp4Size(light)).toEqual([854, 480]);
    }
  });

  it('ships no audio track and no stray files', () => {
    for (const name of names) {
      for (const file of [`${name}.mp4`, `${name}-sm.mp4`]) {
        expect(readFileSync(join(DIR, file)).includes('soun'), file).toBe(false);
      }
    }
    const expected = new Set(names.flatMap((n) => [`${n}.mp4`, `${n}-sm.mp4`, `${n}.webp`]));
    expect(readdirSync(DIR).filter((f) => !expected.has(f))).toEqual([]);
  });

  it('credits a Mixkit clip for every loop, and each clip once', () => {
    const ids = names.map((n) => LOOPS[n].mixkit);
    expect(ids.every((id) => Number.isInteger(id) && id > 0)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('maps landings to loops only for real landing slugs, and four steps', () => {
    const slugs = new Set(LANDINGS.map((l) => l.slug));
    const withLoop = LANDINGS.filter((l) => landingLoop(l.slug));
    expect(withLoop.length).toBeGreaterThanOrEqual(7);
    for (const slug of slugs) {
      const loop = landingLoop(slug);
      if (loop) expect(names).toContain(loop);
    }
    expect(landingLoop('no-such-landing')).toBeUndefined();
    expect(STEP_LOOPS).toHaveLength(4);
  });
});
