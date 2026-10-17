import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isOnShift, nextShiftText, SITE } from './site';

// Owner, 2026-10-17: the platform serves all of Russia. The company's own
// contacts (city, region, legal address) stay in Набережные Челны, but the
// texts that describe the service never limit it to Tatarstan.
describe('SITE texts: all of Russia', () => {
  const TATARSTAN_ONLY = /Татарстан|в Набережных Челнах и/;

  /** The string literals of one key of the app's SITE (apps/mobile/src/lib/site.ts). */
  function mobileText(key: string, nextKey: string): string {
    const source = readFileSync(join(__dirname, '../../../mobile/src/lib/site.ts'), 'utf8');
    const start = source.indexOf(`\n  ${key}:`);
    const end = source.indexOf(`\n  ${nextKey}:`, start);
    expect(start).toBeGreaterThan(0);
    const chunk = source.slice(start, end);
    return [...chunk.matchAll(/'([^']*)'/g)].map((match) => match[1]).join('');
  }

  it('says the service covers Russia on the web', () => {
    for (const text of [SITE.tagline, SITE.description]) {
      expect(text).not.toMatch(TATARSTAN_ONLY);
      expect(text).toContain('по всей России');
    }
    // СпецПласт16 stays a provider from Набережные Челны.
    expect(SITE.description).toContain('СпецПласт16 — в Набережных Челнах');
    expect(SITE.city).toBe('Набережные Челны');
  });

  it('says the same in the app', () => {
    const tagline = mobileText('tagline', 'description');
    const description = mobileText('description', 'city');
    expect(tagline).toBe(SITE.tagline);
    expect(description).toContain('по всей России');
    expect(description).toContain('СпецПласт16 в Набережных Челнах');
    for (const text of [tagline, description]) expect(text).not.toMatch(TATARSTAN_ONLY);
  });
});

// Times are UTC; Moscow is UTC+3.
describe('isOnShift', () => {
  it('is on shift on weekdays and Saturday 8:00–20:00 Moscow time', () => {
    expect(isOnShift(new Date('2026-10-01T07:00:00Z'))).toBe(true); // Thu 10:00
    expect(isOnShift(new Date('2026-10-03T16:59:00Z'))).toBe(true); // Sat 19:59
    expect(isOnShift(new Date('2026-10-01T05:00:00Z'))).toBe(true); // Thu 8:00
  });
  it('is off shift at night and on Sunday', () => {
    expect(isOnShift(new Date('2026-10-01T04:59:00Z'))).toBe(false); // Thu 7:59
    expect(isOnShift(new Date('2026-10-01T17:00:00Z'))).toBe(false); // Thu 20:00
    expect(isOnShift(new Date('2026-10-04T09:00:00Z'))).toBe(false); // Sun 12:00
  });
});

describe('nextShiftText', () => {
  it('names the next working morning', () => {
    expect(nextShiftText(new Date('2026-10-01T02:00:00Z'))).toBe('сегодня с 8:00'); // Thu 5:00
    expect(nextShiftText(new Date('2026-10-01T18:00:00Z'))).toBe('завтра с 8:00'); // Thu 21:00
    expect(nextShiftText(new Date('2026-10-03T18:00:00Z'))).toBe('в понедельник с 8:00'); // Sat 21:00
    expect(nextShiftText(new Date('2026-10-04T09:00:00Z'))).toBe('завтра с 8:00'); // Sun 12:00
  });
});
