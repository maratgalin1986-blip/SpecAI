import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  NEWS_CONSENT_LABEL,
  newsAvailableFor,
  newsConsentFrom,
  newsSubscribed,
  newsUpdate,
} from './newsConsent';

const now = new Date('2026-10-19T05:00:00Z');

describe('newsletter consent at sign-up', () => {
  it('subscribes only on a ticked box (a literal true)', () => {
    expect(newsConsentFrom({ newsConsent: true }, now)).toEqual(now);
  });

  it('never subscribes by default or on anything that is not true', () => {
    for (const body of [
      {},
      { newsConsent: false },
      { newsConsent: 'true' },
      { newsConsent: 1 },
      { newsConsent: 'on' },
      { consent: true },
      null,
      'newsConsent',
    ]) {
      expect(newsConsentFrom(body, now)).toBeNull();
    }
  });
});

describe('newsletter state', () => {
  it('is subscribed only with a consent and no unsubscribe', () => {
    expect(newsSubscribed({ newsConsentAt: now, newsUnsubscribedAt: null })).toBe(true);
    expect(newsSubscribed({ newsConsentAt: null, newsUnsubscribedAt: null })).toBe(false);
    expect(newsSubscribed({ newsConsentAt: now, newsUnsubscribedAt: now })).toBe(false);
    expect(newsSubscribed(null)).toBe(false);
  });

  it('an unsubscribe drops the consent; a new subscribe clears the unsubscribe', () => {
    expect(newsUpdate(false, now)).toEqual({ newsConsentAt: null, newsUnsubscribedAt: now });
    expect(newsUpdate(true, now)).toEqual({ newsConsentAt: now, newsUnsubscribedAt: null });
  });

  it('is not offered to machinists', () => {
    expect(newsAvailableFor('CUSTOMER')).toBe(true);
    expect(newsAvailableFor('PROVIDER_ADMIN')).toBe(true);
    expect(newsAvailableFor('PROVIDER_OPERATOR')).toBe(false);
    expect(newsAvailableFor(undefined)).toBe(false);
  });
});

describe('the consent text', () => {
  it('is word for word the same in the app', () => {
    const app = readFileSync(new URL('../../../mobile/src/lib/news.ts', import.meta.url), 'utf8');
    expect(app).toContain(`'${NEWS_CONSENT_LABEL}'`);
  });
});
