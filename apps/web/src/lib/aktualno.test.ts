import { describe, expect, it } from 'vitest';
import {
  availabilityBadge,
  availableFromChoice,
  canAnswerPriceAsk,
  choiceFromStored,
  freshFirst,
  parseAktualnoBody,
  priceAskDue,
  priceAskUsersWhere,
  PRICE_ASK_INTERVAL_MS,
} from './aktualno';
import { HOUSE_COMPANY_ID } from './fleet';
import { renderNotification } from './notifications/routing';

// Monday 2026-10-19, 08:00 in Moscow.
const now = new Date('2026-10-19T05:00:00Z');
const day = (key: string) => new Date(`${key}T00:00:00.000Z`);
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000);

describe('who is asked', () => {
  it('only provider managers of companies other than the house fleet', () => {
    expect(canAnswerPriceAsk({ role: 'PROVIDER_ADMIN', companyId: 'c1' })).toBe(true);
    expect(canAnswerPriceAsk({ role: 'PROVIDER_ADMIN', companyId: HOUSE_COMPANY_ID })).toBe(false);
    expect(canAnswerPriceAsk({ role: 'PROVIDER_OPERATOR', companyId: 'c1' })).toBe(false);
    expect(canAnswerPriceAsk({ role: 'CUSTOMER', companyId: null })).toBe(false);
    expect(canAnswerPriceAsk({ role: 'PLATFORM_ADMIN', companyId: 'c1' })).toBe(false);
    expect(canAnswerPriceAsk(null)).toBe(false);
  });

  it('the recipients query: managers, not the house fleet, a provider with machinery on the site', () => {
    expect(priceAskUsersWhere()).toEqual({
      role: 'PROVIDER_ADMIN',
      companyId: { not: HOUSE_COMPANY_ID },
      company: { isProvider: true, equipment: { some: { status: { not: 'RETIRED' } } } },
    });
  });

  it('once a week, and never after the switch was turned off', () => {
    expect(priceAskDue(null, now)).toBe(true);
    expect(priceAskDue({ priceAsk: true, priceAskSentAt: null }, now)).toBe(true);
    expect(priceAskDue({ priceAsk: false, priceAskSentAt: null }, now)).toBe(false);
    expect(priceAskDue({ priceAsk: true, priceAskSentAt: hoursAgo(24) }, now)).toBe(false);
    // Last Monday's run, even if it was an hour late, does not block this one.
    const lastWeek = new Date(now.getTime() - PRICE_ASK_INTERVAL_MS);
    expect(priceAskDue({ priceAsk: true, priceAskSentAt: lastWeek }, now)).toBe(true);
  });

  it('the message names the platform and leads to the quick page', () => {
    const message = renderNotification({ type: 'price.ask' });
    expect(message.title).toBe('ИИСтройка24: обновите цены и свободные дни');
    expect(message.body).toBe('Заказчики видят актуальную технику первой. Займёт 30 секунд.');
    expect(message.path).toBe('/provider/aktualno');
  });
});

describe('free days', () => {
  it('today, tomorrow and «busy until» by the Moscow calendar', () => {
    // 23:30 in Moscow on the 19th is still the 19th there.
    const late = new Date('2026-10-19T20:30:00Z');
    expect(availableFromChoice({ kind: 'today' }, late)).toEqual({
      ok: true,
      day: day('2026-10-19'),
    });
    expect(availableFromChoice({ kind: 'tomorrow' }, late)).toEqual({
      ok: true,
      day: day('2026-10-20'),
    });
    // Busy up to the 25th inclusive: free from the 26th.
    expect(availableFromChoice({ kind: 'busy', until: '2026-10-25' }, now)).toEqual({
      ok: true,
      day: day('2026-10-26'),
    });
  });

  it('refuses a past, far or broken date', () => {
    expect(availableFromChoice({ kind: 'busy', until: '2026-10-18' }, now).ok).toBe(false);
    expect(availableFromChoice({ kind: 'busy', until: '2027-03-01' }, now).ok).toBe(false);
    expect(availableFromChoice({ kind: 'busy', until: '2026-02-30' }, now).ok).toBe(false);
    expect(availableFromChoice({ kind: 'busy', until: 'завтра' }, now).ok).toBe(false);
  });

  it('a stored day comes back as the same chip', () => {
    expect(choiceFromStored(null, now)).toBeNull();
    expect(choiceFromStored(day('2026-10-10'), now)).toEqual({ kind: 'today' });
    expect(choiceFromStored(day('2026-10-19'), now)).toEqual({ kind: 'today' });
    expect(choiceFromStored(day('2026-10-20'), now)).toEqual({ kind: 'tomorrow' });
    expect(choiceFromStored(day('2026-10-26'), now)).toEqual({ kind: 'busy', until: '2026-10-25' });
  });
});

describe('the badge on a machine card', () => {
  const fresh = { status: 'AVAILABLE', availabilityUpdatedAt: hoursAgo(30) };

  it('«Свободна сейчас» or «Свободна с …» within 7 days of the answer', () => {
    expect(availabilityBadge({ ...fresh, availableFrom: day('2026-10-19') }, now)).toBe(
      'Свободна сейчас',
    );
    expect(availabilityBadge({ ...fresh, availableFrom: day('2026-10-20') }, now)).toBe(
      'Свободна с 20 октября',
    );
    // Strings from JSON work too (the app and the client components).
    expect(
      availabilityBadge(
        {
          status: 'RENTED',
          availableFrom: '2026-10-26T00:00:00.000Z',
          availabilityUpdatedAt: hoursAgo(2).toISOString(),
        },
        now,
      ),
    ).toBe('Свободна с 26 октября');
  });

  it('nothing after 7 days, without an answer, on repair, or when the status says busy now', () => {
    const stale = { ...fresh, availabilityUpdatedAt: hoursAgo(7 * 24 + 1) };
    expect(availabilityBadge({ ...stale, availableFrom: day('2026-10-19') }, now)).toBeNull();
    expect(availabilityBadge({ status: 'AVAILABLE', availableFrom: day('2026-10-19') }, now)).toBe(
      null,
    );
    expect(
      availabilityBadge(
        { ...fresh, status: 'IN_MAINTENANCE', availableFrom: day('2026-10-25') },
        now,
      ),
    ).toBeNull();
    expect(
      availabilityBadge({ ...fresh, status: 'RENTED', availableFrom: day('2026-10-19') }, now),
    ).toBeNull();
  });
});

describe('fresh answers sort a bit higher', () => {
  it('house fleet first, then fresh answers, then the rest, each in its order', () => {
    const items = [
      { id: 'old-1', companyId: 'c1', availabilityUpdatedAt: hoursAgo(24 * 10) },
      { id: 'fresh-1', companyId: 'c2', availabilityUpdatedAt: hoursAgo(5) },
      { id: 'none', companyId: 'c3' },
      { id: 'house', companyId: HOUSE_COMPANY_ID },
      { id: 'fresh-2', companyId: 'c1', availabilityUpdatedAt: hoursAgo(1) },
    ];
    expect(freshFirst(items, now).map((item) => item.id)).toEqual([
      'house',
      'fresh-1',
      'fresh-2',
      'old-1',
      'none',
    ]);
  });
});

describe('the save request', () => {
  it('reads prices as whole roubles and the free day', () => {
    const parsed = parseAktualnoBody({
      items: [
        { id: 'e1', hourlyRate: '3 500', dailyRate: 28000.4, availability: { kind: 'today' } },
        {
          id: 'e2',
          hourlyRate: null,
          dailyRate: 30000,
          availability: { kind: 'busy', until: '2026-10-25' },
        },
      ],
    });
    expect(parsed).toEqual({
      ok: true,
      items: [
        { id: 'e1', hourlyRate: 3500, dailyRate: 28000, availability: { kind: 'today' } },
        {
          id: 'e2',
          hourlyRate: null,
          dailyRate: 30000,
          availability: { kind: 'busy', until: '2026-10-25' },
        },
      ],
    });
  });

  it('refuses empty, broken, duplicate or unpriced rows', () => {
    expect(parseAktualnoBody({ items: [] }).ok).toBe(false);
    expect(parseAktualnoBody(null).ok).toBe(false);
    const row = { id: 'e1', hourlyRate: 3000, dailyRate: 24000, availability: { kind: 'today' } };
    expect(parseAktualnoBody({ items: [row, row] }).ok).toBe(false);
    expect(parseAktualnoBody({ items: [{ ...row, dailyRate: 0 }] }).ok).toBe(false);
    expect(parseAktualnoBody({ items: [{ ...row, hourlyRate: -5 }] }).ok).toBe(false);
    // Rounds to 0 ₽: refused, never saved as a zero price.
    expect(parseAktualnoBody({ items: [{ ...row, dailyRate: 0.4 }] }).ok).toBe(false);
    expect(parseAktualnoBody({ items: [{ ...row, hourlyRate: '0,4' }] }).ok).toBe(false);
    expect(parseAktualnoBody({ items: [{ ...row, availability: { kind: 'never' } }] }).ok).toBe(
      false,
    );
  });
});
