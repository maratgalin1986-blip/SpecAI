import { describe, expect, it } from 'vitest';
import {
  buildNewsEmail,
  countNear,
  distinctMachines,
  maskEmail,
  newsBody,
  newsRecipientsWhere,
  NEWS_INTERVAL_MS,
  unsubscribeToken,
  unsubscribeUrls,
  verifyUnsubscribeToken,
  type NationwideStats,
} from './newsletter';
import { distanceKm } from './geo';
import { SITE } from './site';

const SECRET = 'test-secret';

describe('unsubscribe token', () => {
  it('round-trips the user id', () => {
    const token = unsubscribeToken('ckuser123', SECRET) as string;
    expect(token).toBeTruthy();
    expect(verifyUnsubscribeToken(token, SECRET)).toBe('ckuser123');
  });

  it('rejects junk, a cut token and a token signed with another secret', () => {
    const token = unsubscribeToken('ckuser123', SECRET) as string;
    for (const bad of ['', 'abc', 'a.b', `${token}.x`, token.slice(0, -3), null, 42]) {
      expect(verifyUnsubscribeToken(bad, SECRET)).toBeNull();
    }
    expect(verifyUnsubscribeToken(token, 'another-secret')).toBeNull();
  });

  it('rejects a token whose user id was swapped (tampered)', () => {
    const token = unsubscribeToken('ckuser123', SECRET) as string;
    const [, signature] = token.split('.');
    const forged = `${Buffer.from('ckother999').toString('base64url')}.${signature}`;
    expect(verifyUnsubscribeToken(forged, SECRET)).toBeNull();
    // A flipped character of the signature.
    const last = token.at(-1) === 'A' ? 'B' : 'A';
    expect(verifyUnsubscribeToken(`${token.slice(0, -1)}${last}`, SECRET)).toBeNull();
  });

  it('gives no token without a secret', () => {
    const saved = process.env.NEXTAUTH_SECRET;
    delete process.env.NEXTAUTH_SECRET;
    try {
      expect(unsubscribeToken('ckuser123')).toBeNull();
      expect(verifyUnsubscribeToken('x.y')).toBeNull();
    } finally {
      if (saved !== undefined) process.env.NEXTAUTH_SECRET = saved;
    }
  });
});

describe('maskEmail', () => {
  it('shows only the first letters and the zone', () => {
    expect(maskEmail('ivan.petrov@gmail.com')).toBe('i***@g***.com');
    expect(maskEmail('a@b')).toBe('a***@b***');
  });
});

// A tiny evaluator of the Prisma filter used for recipients, so the test
// checks who passes it, not how the object is spelled.
type Row = {
  emailVerified: Date | null;
  newsConsentAt: Date | null;
  newsUnsubscribedAt: Date | null;
  role: string;
  email: string;
  lastNewsAt: Date | null;
};
function passes(row: Row, now: Date): boolean {
  const where = newsRecipientsWhere(now);
  const lastOk = where.OR.some((clause) =>
    'lt' in (clause.lastNewsAt ?? {})
      ? row.lastNewsAt !== null && row.lastNewsAt < (clause.lastNewsAt as { lt: Date }).lt
      : row.lastNewsAt === null,
  );
  return (
    row.newsConsentAt !== null &&
    (where.emailVerified.not === null ? row.emailVerified !== null : true) &&
    where.newsUnsubscribedAt === null &&
    row.newsUnsubscribedAt === null &&
    where.role.in.includes(row.role as never) &&
    row.email.includes(where.email.contains) &&
    !row.email.endsWith(where.email.not.endsWith) &&
    lastOk
  );
}

describe('newsletter recipients', () => {
  const now = new Date('2026-10-19T05:00:00Z');
  const base: Row = {
    emailVerified: new Date('2026-10-01T00:00:00Z'),
    newsConsentAt: new Date('2026-10-01T00:00:00Z'),
    newsUnsubscribedAt: null,
    role: 'CUSTOMER',
    email: 'anna@example.com',
    lastNewsAt: null,
  };

  it('takes a subscriber who was not mailed this week', () => {
    expect(passes(base, now)).toBe(true);
    expect(passes({ ...base, lastNewsAt: new Date(now.getTime() - 7 * 86_400_000) }, now)).toBe(
      true,
    );
  });

  it('excludes no consent, unsubscribed, technical .invalid addresses and machinists', () => {
    expect(passes({ ...base, newsConsentAt: null }, now)).toBe(false);
    expect(passes({ ...base, newsUnsubscribedAt: now }, now)).toBe(false);
    expect(passes({ ...base, email: 'chat-import@specplast16.invalid' }, now)).toBe(false);
    expect(passes({ ...base, role: 'PROVIDER_OPERATOR' }, now)).toBe(false);
  });

  it('excludes an address its owner never confirmed (someone may have typed a stranger’s e-mail)', () => {
    expect(passes({ ...base, emailVerified: null }, now)).toBe(false);
  });

  it('excludes whoever got the letter in the last six days (a retried cron)', () => {
    expect(passes({ ...base, lastNewsAt: new Date(now.getTime() - 3600_000) }, now)).toBe(false);
    expect(
      passes({ ...base, lastNewsAt: new Date(now.getTime() - NEWS_INTERVAL_MS + 1000) }, now),
    ).toBe(false);
  });
});

describe('what the letter says', () => {
  const nationwide: NationwideStats = { newOrders: 14, providers: 9, machinesOnLine: 3 };

  it('tells a provider how many orders wait for it, with the feed and the line', () => {
    const body = newsBody({ kind: 'provider', hasMachines: true, matched: 3 }, nationwide);
    expect(body?.lines.join(' ')).toContain('3 заявки');
    expect(body?.lines.join(' ')).toContain('Выйдите на линию');
    expect(body?.link.path).toBe('/provider#feed');
  });

  it('falls back to the real nationwide count, and says nothing when there is none', () => {
    const body = newsBody({ kind: 'provider', hasMachines: true, matched: 0 }, nationwide);
    expect(body?.lines.join(' ')).toContain('14 новых заявок');
    expect(
      newsBody(
        { kind: 'provider', hasMachines: true, matched: 0 },
        { ...nationwide, newOrders: 0 },
      ),
    ).toBeNull();
  });

  it('asks a provider without machines to add one', () => {
    const body = newsBody({ kind: 'provider', hasMachines: false, matched: 0 }, nationwide);
    expect(body?.link.path).toBe('/provider#add-equipment');
  });

  it('gives a customer the counts near the last order, else nationwide, else nothing', () => {
    const near = newsBody(
      { kind: 'customer', near: { providers: 2, machinesOnLine: 1 } },
      nationwide,
    );
    expect(near?.lines[0]).toContain('Рядом с местом вашей последней заявки');
    expect(near?.lines[0]).toContain('2 исполнителя');
    expect(near?.lines[0]).toContain('1 машина выходила на линию');
    expect(near?.link.path).toBe('/orders#new');

    const far = newsBody(
      { kind: 'customer', near: { providers: 0, machinesOnLine: 0 } },
      nationwide,
    );
    expect(far?.lines[0]).toContain('по всей России');
    expect(far?.lines[0]).toContain('9 исполнителей');

    expect(
      newsBody({ kind: 'customer', near: null }, { newOrders: 0, providers: 0, machinesOnLine: 0 }),
    ).toBeNull();
  });
});

describe('the letter', () => {
  const token = unsubscribeToken('ckuser123', SECRET) as string;
  const letter = buildNewsEmail({
    name: 'Анна <b>Петрова</b>',
    body: { lines: ['Строка'], link: { path: '/orders#new', label: 'Оставить заявку' } },
    baseUrl: 'https://spec-ai-web.vercel.app',
    token,
  });
  const { page, oneClick } = unsubscribeUrls('https://spec-ai-web.vercel.app', token);

  it('carries the one-click unsubscribe headers (RFC 8058)', () => {
    expect(letter.headers['List-Unsubscribe']).toBe(`<${oneClick}>`);
    expect(letter.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    expect(oneClick).toContain('/api/unsubscribe?t=');
  });

  it('has the unsubscribe link, the reason and the sender in the body', () => {
    for (const part of [letter.html, letter.text]) {
      expect(part).toContain(page);
      expect(part).toContain('сами подписались');
      expect(part).toContain(SITE.legalName);
      expect(part).toContain(`ИНН ${SITE.inn}`);
      expect(part).toContain(SITE.platform);
      expect(part).toContain('Бесплатно и без посредников');
    }
    expect(letter.html).toContain('>Отписаться</a>');
  });

  it('escapes the name and greets by the first name only', () => {
    expect(letter.html).not.toContain('<b>');
    expect(letter.text).toContain('Здравствуйте, Анна!');
  });
});

describe('counting helpers', () => {
  it('counts a machine once and only points within 100 km', () => {
    const rows = distinctMachines([
      { userId: 'u1', equipmentId: 'e1' },
      { userId: 'u2', equipmentId: 'e1' },
      { userId: 'u3', equipmentId: null },
    ]);
    expect(rows).toHaveLength(2);
    const chelny = { lat: 55.74, lon: 52.4 };
    const kazan = { lat: 55.79, lon: 49.12 };
    expect(countNear(chelny, [chelny, kazan], distanceKm)).toBe(1);
  });
});
