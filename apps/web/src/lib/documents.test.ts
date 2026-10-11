import { describe, expect, it } from 'vitest';
import {
  daysUntilExpiry,
  documentStatus,
  documentTitle,
  documentsSummary,
  dueReminders,
  withStatus,
} from './documents';

// 2026-10-08 09:00 Moscow.
const now = new Date('2026-10-08T06:00:00Z');
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe('daysUntilExpiry and documentStatus', () => {
  it('counts calendar days in Moscow', () => {
    expect(daysUntilExpiry(day('2026-10-08'), now)).toBe(0);
    expect(daysUntilExpiry(day('2026-11-07'), now)).toBe(30);
    expect(daysUntilExpiry(day('2026-10-07'), now)).toBe(-1);
    // 23:30 UTC on the 8th is already the 9th in Moscow.
    expect(daysUntilExpiry(new Date('2026-10-08T23:30:00Z'), now)).toBe(1);
  });

  it('tells expired from expiring and fine', () => {
    expect(documentStatus({ expiresAt: day('2026-10-07') }, now)).toBe('expired');
    expect(documentStatus({ expiresAt: day('2026-10-08') }, now)).toBe('expiring');
    expect(documentStatus({ expiresAt: day('2026-11-07') }, now)).toBe('expiring');
    expect(documentStatus({ expiresAt: day('2026-11-08') }, now)).toBe('ok');
    expect(documentStatus({ expiresAt: null }, now)).toBe('none');
    expect(withStatus({ id: 'd', expiresAt: null }, now).status).toBe('none');
  });

  it("sums up a company's documents", () => {
    expect(
      documentsSummary(
        [
          { expiresAt: day('2026-10-01') },
          { expiresAt: day('2026-10-20') },
          { expiresAt: day('2027-01-01') },
          { expiresAt: null },
        ],
        now,
      ),
    ).toEqual({ expired: 1, expiring: 1, total: 4 });
  });
});

describe('dueReminders', () => {
  const base = { kind: 'STS', remindedAt30: null, remindedAt0: null };

  it('sends the 30-day reminder once and the day-of reminder once', () => {
    const docs = [
      { ...base, id: 'in30', expiresAt: day('2026-11-07') },
      { ...base, id: 'in31', expiresAt: day('2026-11-08') },
      { ...base, id: 'today', expiresAt: day('2026-10-08') },
      { ...base, id: 'past', expiresAt: day('2026-09-01') },
      { ...base, id: 'done30', expiresAt: day('2026-10-20'), remindedAt30: now },
      { ...base, id: 'done0', expiresAt: day('2026-10-01'), remindedAt0: now },
      { ...base, id: 'nodate', expiresAt: null },
    ];
    const due = dueReminders(docs, now);
    expect(due.map((item) => [item.doc.id, item.threshold])).toEqual([
      ['in30', 30],
      ['today', 0],
      ['past', 0],
    ]);
    expect(due[0]!.daysLeft).toBe(30);
    expect(due[2]!.daysLeft).toBeLessThan(0);
  });

  it('does not repeat the 30-day reminder on the day when it already went out', () => {
    const due = dueReminders(
      [{ ...base, id: 'today', expiresAt: day('2026-10-08'), remindedAt30: now }],
      now,
    );
    expect(due).toHaveLength(1);
    expect(due[0]!.threshold).toBe(0);
  });
});

describe('documentTitle', () => {
  it('names the kind, the number and the machine or operator', () => {
    expect(documentTitle({ kind: 'STS', number: '16 АА 123456' }, 'JCB 4CX')).toBe(
      'СТС № 16 АА 123456 (JCB 4CX)',
    );
    expect(documentTitle({ kind: 'OPERATOR_LICENSE', operatorName: 'Иванов И.' })).toBe(
      'Удостоверение машиниста (Иванов И.)',
    );
    expect(documentTitle({ kind: 'weird' })).toBe('Документ');
  });
});
