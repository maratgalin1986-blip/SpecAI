import { describe, expect, it } from 'vitest';
import {
  callbackReminderText,
  crmCounters,
  crmHref,
  filterCrm,
  isDueToday,
  isOverdue,
  mskDate,
  mskDayBounds,
  mskDayStart,
  parseCrmQuery,
  sortCrm,
  type CrmLead,
} from './adminCrm';

// Thursday 22.10.2026 19:00 Moscow.
const NOW = new Date('2026-10-22T16:00:00Z');

function lead(partial: Partial<CrmLead> & { id: string }): CrmLead {
  return {
    name: 'Имя',
    phone: '+7 900 000-00-00',
    status: 'IN_PROGRESS',
    createdAt: new Date('2026-10-20T08:00:00Z'),
    ...partial,
  };
}

describe('Moscow days', () => {
  it('names the Moscow date of an instant and its bounds', () => {
    // 23:30 UTC is already the next day in Moscow.
    expect(mskDate(new Date('2026-10-22T23:30:00Z'))).toBe('2026-10-23');
    const { start, end } = mskDayBounds(NOW);
    expect(start.toISOString()).toBe('2026-10-21T21:00:00.000Z');
    expect(end.toISOString()).toBe('2026-10-22T21:00:00.000Z');
  });

  it('rejects a bad day', () => {
    expect(mskDayStart('2026-02-30')).toBeNull();
    expect(mskDayStart('вчера')).toBeNull();
  });
});

describe('parseCrmQuery and crmHref', () => {
  it('reads the filters and makes «по» inclusive', () => {
    const query = parseCrmQuery({
      status: 'work',
      today: '1',
      city: ' Казань ',
      from: '2026-10-01',
      to: '2026-10-22',
    });
    expect(query.status).toBe('work');
    expect(query.today).toBe(true);
    expect(query.city).toBe('Казань');
    expect(query.from?.toISOString()).toBe('2026-09-30T21:00:00.000Z');
    expect(query.to?.toISOString()).toBe('2026-10-22T21:00:00.000Z');
    expect(crmHref(query)).toBe(
      '/admin/leads?status=work&today=1&city=%D0%9A%D0%B0%D0%B7%D0%B0%D0%BD%D1%8C&from=2026-10-01&to=2026-10-22',
    );
  });

  it('falls back to no filters', () => {
    const query = parseCrmQuery({ status: 'weird', to: 'x' });
    expect(query).toEqual({ status: 'all', today: false, city: '', from: null, to: null });
    expect(crmHref(query)).toBe('/admin/leads');
    expect(crmHref(query, { status: 'new' })).toBe('/admin/leads?status=new');
  });
});

describe('due and overdue', () => {
  const later = lead({ id: 'a', callAt: new Date('2026-10-22T17:30:00Z') }); // 20:30 today
  const missed = lead({ id: 'b', callAt: new Date('2026-10-22T07:00:00Z') }); // 10:00 today
  const next = lead({ id: 'c', callAt: new Date('2026-10-23T07:00:00Z') });
  const closed = lead({ id: 'd', status: 'DONE', callAt: new Date('2026-10-22T07:00:00Z') });

  it('counts today and the past, never a closed lead', () => {
    expect(isDueToday(later, NOW)).toBe(true);
    expect(isDueToday(missed, NOW)).toBe(true);
    expect(isDueToday(next, NOW)).toBe(false);
    expect(isDueToday(closed, NOW)).toBe(false);
    expect(isOverdue(missed, NOW)).toBe(true);
    expect(isOverdue(later, NOW)).toBe(false);
    expect(isOverdue(closed, NOW)).toBe(false);
  });

  it('filters by status, today, city and dates together', () => {
    const list = [
      later,
      missed,
      next,
      closed,
      lead({ id: 'e', status: 'NEW', city: 'Казань', createdAt: new Date('2026-10-22T10:00:00Z') }),
      lead({ id: 'f', status: 'NEW', city: 'казань', createdAt: new Date('2026-09-01T10:00:00Z') }),
    ];
    const base = parseCrmQuery({});
    expect(filterCrm(list, { ...base, today: true }, NOW).map((l) => l.id)).toEqual(['a', 'b']);
    expect(filterCrm(list, { ...base, status: 'new', city: 'каз' }, NOW).map((l) => l.id)).toEqual([
      'e',
      'f',
    ]);
    expect(
      filterCrm(list, parseCrmQuery({ city: 'Казань', from: '2026-10-22' }), NOW).map((l) => l.id),
    ).toEqual(['e']);
    expect(filterCrm(list, parseCrmQuery({ from: '2026-10-21', to: '2026-10-21' }), NOW)).toEqual(
      [],
    );
  });

  it('sorts overdue, new, today, in work, done', () => {
    const list = [
      closed,
      lead({ id: 'w' }),
      later,
      lead({ id: 'n', status: 'NEW' }),
      missed,
      lead({ id: 'n2', status: 'NEW', createdAt: new Date('2026-10-22T12:00:00Z') }),
    ];
    expect(sortCrm(list, NOW).map((l) => l.id)).toEqual(['b', 'n2', 'n', 'a', 'w', 'd']);
    expect(crmCounters(list, NOW)).toEqual({ new: 2, today: 2, overdue: 1 });
  });
});

describe('callbackReminderText', () => {
  it('is silent when nothing is due', () => {
    expect(callbackReminderText([lead({ id: 'x' })], NOW)).toBeNull();
    expect(
      callbackReminderText([lead({ id: 'y', callAt: new Date('2026-10-25T07:00:00Z') })], NOW),
    ).toBeNull();
  });

  it('lists tomorrow and the missed ones with name, phone, city and a short note', () => {
    const text = callbackReminderText(
      [
        lead({
          id: '1',
          name: 'Ильдар',
          city: 'Елабуга',
          note: 'нужен кран 25 т\nна  пятницу',
          callAt: new Date('2026-10-23T06:00:00Z'),
        }),
        lead({ id: '2', name: 'Ольга', callAt: new Date('2026-10-21T06:00:00Z') }),
        lead({
          id: '3',
          name: 'Закрыта',
          status: 'DONE',
          callAt: new Date('2026-10-21T06:00:00Z'),
        }),
        // Later tonight: not tomorrow, not missed yet.
        lead({ id: '4', name: 'Вечером', callAt: new Date('2026-10-22T18:00:00Z') }),
      ],
      NOW,
    );
    expect(text).toBe(
      [
        '📞 Перезвонить завтра (1):',
        '• Ильдар · +7 900 000-00-00 · Елабуга — нужен кран 25 т на пятницу',
        '',
        '⚠️ Просрочено (1):',
        '• Ольга · +7 900 000-00-00',
      ].join('\n'),
    );
  });

  it('caps the list at 30 lines', () => {
    const many = Array.from({ length: 35 }, (_, i) =>
      lead({ id: String(i), name: `К${i}`, callAt: new Date('2026-10-23T06:00:00Z') }),
    );
    const text = callbackReminderText(many, NOW) ?? '';
    expect(text.split('\n')).toHaveLength(32);
    expect(text.endsWith('… и ещё 5 — в /admin/leads')).toBe(true);
  });
});
