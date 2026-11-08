import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isOnShift, nextShiftText, SITE } from './site';
import { isOnlinePaymentEnabled } from './stripe';
import * as APP from '../../../mobile/src/lib/promise';

/** The string literals of one key of the app's SITE (apps/mobile/src/lib/site.ts). */
function mobileText(key: string, nextKey: string): string {
  const source = readFileSync(join(__dirname, '../../../mobile/src/lib/site.ts'), 'utf8');
  const start = source.indexOf(`\n  ${key}:`);
  const end = source.indexOf(`\n  ${nextKey}:`, start);
  expect(start).toBeGreaterThan(0);
  const chunk = source.slice(start, end);
  return [...chunk.matchAll(/'([^']*)'/g)].map((match) => match[1]).join('');
}

// Owner, 2026-10-17: the platform serves all of Russia. The company's own
// contacts (city, region, legal address) stay in Набережные Челны, but the
// texts that describe the service never limit it to Tatarstan.
describe('SITE texts: all of Russia', () => {
  const TATARSTAN_ONLY = /Татарстан|в Набережных Челнах и/;

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
    const description = mobileText('description', 'promise');
    expect(tagline).toBe(SITE.tagline);
    expect(description).toContain('по всей России');
    expect(description).toContain('СпецПласт16 в Набережных Челнах');
    for (const text of [tagline, description]) expect(text).not.toMatch(TATARSTAN_ONLY);
  });
});

// Owner, 2026-10-17: «Бесплатно и без посредников» is the headline of every
// ad. It is honest only while the platform takes no money from the deal.
describe('SITE.promise: free and without middlemen', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is a short headline with a detail that says the customer pays directly', () => {
    expect(SITE.promise).toBe('Бесплатно и без посредников');
    expect(SITE.promiseShort).toMatch(/^Бесплатно · без посредников$/);
    expect(SITE.promiseDetail).toContain('напрямую');
    expect(SITE.promiseDetail).toContain('не берёт процент');
    expect(SITE.promiseHref).toBe('/kak-polzovatsya#besplatno');
    // ФЗ «О рекламе», ст. 5: no superlatives or guarantees next to the promise.
    for (const text of [SITE.promise, SITE.promiseShort, SITE.promiseDetail]) {
      expect(text).not.toMatch(/лучш|самы[ейх]|дешевл|гарант|низк/i);
    }
  });

  it('is in the default description (meta, OG, manifest)', () => {
    expect(SITE.description.toLowerCase()).toContain(SITE.promise.toLowerCase());
    expect(SITE.description).toContain('напрямую');
  });

  // A reminder, not a guard: a commission or online payment can come without
  // this flag. REVIEW.md («Тексты») makes such a PR change the promise too.
  it('relies on online payment being off by default (ONLINE_PAYMENTS unset)', () => {
    vi.stubEnv('ONLINE_PAYMENTS', '');
    vi.stubEnv('STRIPE_SECRET_KEY', '');
    expect(isOnlinePaymentEnabled()).toBe(false);
    // With a commission or online payment the platform would stand between
    // the customer and the provider: the promise in packages/shared/src/promise.ts
    // has to be rewritten in the same PR as the switch.
    vi.stubEnv('ONLINE_PAYMENTS', 'on');
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_x');
    expect(isOnlinePaymentEnabled()).toBe(true);
  });

  it('is the same in the app', () => {
    expect(APP.PROMISE).toBe(SITE.promise);
    expect(APP.PROMISE_SHORT).toBe(SITE.promiseShort);
    expect(APP.PROMISE_DETAIL).toBe(SITE.promiseDetail);
    expect(APP.PROMISE_LINE).toBe(SITE.promiseLine);
    expect(APP.PLATFORM_NAME).toBe(SITE.platform);
    expect(mobileText('description', 'promise').toLowerCase()).toContain(
      SITE.promise.toLowerCase(),
    );
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
