import { describe, expect, it, vi } from 'vitest';

const apiFetch = vi.fn();
vi.mock('./api', () => ({ apiFetch }));

const {
  AVAILABILITY_LABELS,
  DEMAND_NUDGE_LABEL,
  PRICE_ASK_LABEL,
  fetchDemandNudge,
  moscowDayKey,
  rowsFrom,
  saveBody,
  setDemandNudge,
} = await import('./aktualno');
const web = await import('../../../web/src/lib/aktualno');

describe('«Цены и свободные дни» в приложении', () => {
  it('тексты — слово в слово как на сайте', () => {
    expect(PRICE_ASK_LABEL).toBe(web.PRICE_ASK_LABEL);
    expect(AVAILABILITY_LABELS).toEqual(web.AVAILABILITY_LABELS);
  });

  it('форма берёт сохранённые цены и отметку, иначе «Свободна сегодня»', () => {
    const rows = rowsFrom([
      {
        id: 'e1',
        name: 'JCB 3CX',
        categoryName: 'Экскаваторы-погрузчики',
        status: 'AVAILABLE',
        hourlyRate: 3500,
        dailyRate: 28000,
        availability: { kind: 'busy', until: '2026-10-25' },
        availabilityUpdatedAt: null,
      },
      {
        id: 'e2',
        name: 'КамАЗ',
        categoryName: 'Самосвалы',
        status: 'RENTED',
        hourlyRate: null,
        dailyRate: 24000,
        availability: null,
        availabilityUpdatedAt: null,
      },
    ]);
    expect(rows).toEqual([
      { id: 'e1', hourly: '3500', daily: '28000', kind: 'busy', until: '2026-10-25' },
      { id: 'e2', hourly: '', daily: '24000', kind: 'today', until: '' },
    ]);
    // The server reads this body (apps/web lib/aktualno.ts parseAktualnoBody).
    const parsed = web.parseAktualnoBody(saveBody([{ ...rows[0]!, hourly: '3 600' }, rows[1]!]));
    expect(parsed).toEqual({
      ok: true,
      items: [
        {
          id: 'e1',
          hourlyRate: 3600,
          dailyRate: 28000,
          availability: { kind: 'busy', until: '2026-10-25' },
        },
        { id: 'e2', hourlyRate: null, dailyRate: 24000, availability: { kind: 'today' } },
      ],
    });
  });

  it('день — по Москве', () => {
    expect(moscowDayKey(new Date('2026-10-19T21:30:00Z'))).toBe('2026-10-20');
  });
});

describe('«Спрос рядом» в приложении', () => {
  it('подпись — слово в слово как на сайте', () => {
    expect(DEMAND_NUDGE_LABEL).toBe(web.DEMAND_NUDGE_LABEL);
  });

  it('читает и меняет свой выключатель через /api/account/demand-nudge', () => {
    apiFetch.mockReset();
    void fetchDemandNudge();
    void setDemandNudge(false);
    expect(apiFetch.mock.calls).toEqual([
      ['/api/account/demand-nudge'],
      ['/api/account/demand-nudge', { method: 'PATCH', body: { enabled: false } }],
    ]);
  });
});
