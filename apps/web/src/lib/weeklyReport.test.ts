import { describe, expect, it } from 'vitest';
import {
  buildWeeklyReport,
  EMPTY_WEEK,
  reportDue,
  reportWeek,
  type WeeklyData,
  type WeekStats,
} from './weeklyReport';

const week = reportWeek(new Date('2026-11-09T05:00:00Z'));

function data(current: Partial<WeekStats> = {}, previous: Partial<WeekStats> = {}): WeeklyData {
  return {
    current: { ...EMPTY_WEEK, ...current },
    previous: { ...EMPTY_WEEK, ...previous },
    line: { now: 0, house: 0, joined: 0 },
    priceUpdates: 0,
    waiting: { orders: 0, reviewTexts: 0 },
  };
}

describe('reportWeek', () => {
  it('is the last full Monday–Sunday week by Moscow time', () => {
    // Monday 9 November, 08:00 Moscow.
    expect(week.start.toISOString()).toBe('2026-11-01T21:00:00.000Z');
    expect(week.end.toISOString()).toBe('2026-11-08T21:00:00.000Z');
    expect(week.previousStart.toISOString()).toBe('2026-10-25T21:00:00.000Z');
    expect(week.key).toBe('2026-11-02');
    expect(week.label).toBe('2–8 ноября');
  });

  it('turns over at Moscow midnight, not at UTC midnight', () => {
    // Sunday 23:59 Moscow: the week of 2–8 November is not over yet.
    expect(reportWeek(new Date('2026-11-08T20:59:00Z')).key).toBe('2026-10-26');
    // Monday 00:00 Moscow is still Sunday 21:00 in UTC.
    expect(reportWeek(new Date('2026-11-08T21:00:00Z')).key).toBe('2026-11-02');
  });

  it('gives a late call the same week until the next Monday', () => {
    for (const late of ['2026-11-10T05:00:00Z', '2026-11-12T15:00:00Z', '2026-11-15T20:59:00Z']) {
      expect(reportWeek(new Date(late)).key).toBe('2026-11-02');
    }
    expect(reportWeek(new Date('2026-11-15T21:00:00Z')).key).toBe('2026-11-09');
  });

  it('names both months when the week crosses a month or a year', () => {
    expect(reportWeek(new Date('2026-11-02T05:00:00Z')).label).toBe('26 октября – 1 ноября');
    expect(reportWeek(new Date('2027-01-04T05:00:00Z')).label).toBe('28 декабря – 3 января');
    expect(reportWeek(new Date('2027-01-04T05:00:00Z')).key).toBe('2026-12-28');
  });
});

describe('reportDue', () => {
  it('starts on Monday at 07:00 Moscow and stays due for a late run', () => {
    expect(reportDue(new Date('2026-11-08T21:00:00Z'))).toBe(false); // Mon 00:00
    expect(reportDue(new Date('2026-11-09T03:59:00Z'))).toBe(false); // Mon 06:59
    expect(reportDue(new Date('2026-11-09T04:00:00Z'))).toBe(true); // Mon 07:00
    expect(reportDue(new Date('2026-11-10T05:00:00Z'))).toBe(true); // Tue
    expect(reportDue(new Date('2026-11-15T20:59:00Z'))).toBe(true); // Sun 23:59
  });
});

describe('buildWeeklyReport', () => {
  it('counts requests against the week before and says where they came from', () => {
    const text = buildWeeklyReport(
      data(
        {
          leads: [
            { source: 'home · yandex / cpc', status: 'NEW', count: 2 },
            { source: 'wizard · yandex / cpc', status: 'DONE', count: 1 },
            { source: 'home', status: 'DONE', count: 1 },
          ],
          orders: [
            { source: 'SITE', count: 5 },
            { source: 'TELEGRAM', count: 4 },
          ],
          rejectedImports: 7,
        },
        {
          leads: [{ source: 'home', status: 'DONE', count: 3 }],
          orders: [{ source: 'SITE', count: 6 }],
        },
      ),
      week,
    );
    expect(text.split('\n')[0]).toBe('📊 ИИСтройка24 от СпецПласт16 — неделя 2–8 ноября');
    expect(text).toContain('Заявки: 13 — на 4 больше, чем на прошлой неделе (9)');
    expect(text).toContain(
      '  • на технику: 9 (на прошлой неделе — 6): с сайта и из приложения — 5, из чатов Telegram — 4',
    );
    expect(text).toContain('  • на звонок: 4 (на прошлой неделе — 3)');
    expect(text).toContain('Сообщений из чатов, которые не оказались заявками: 7');
    expect(text).toContain('  • yandex / cpc: 3');
    expect(text).toContain('  • Прямой заход: 1');
    expect(text).toContain('  • Главная, форма звонка: 3');
    expect(text).toContain('  • заявки на звонок без ответа: 2 — /admin/leads');
  });

  it('says less, the same and nothing honestly', () => {
    const fewer = buildWeeklyReport(
      data({ orders: [{ source: 'SITE', count: 2 }] }, { orders: [{ source: 'SITE', count: 5 }] }),
      week,
    );
    expect(fewer).toContain('Заявки: 2 — на 3 меньше, чем на прошлой неделе (5)');
    const same = buildWeeklyReport(
      data({ orders: [{ source: 'SITE', count: 2 }] }, { orders: [{ source: 'SITE', count: 2 }] }),
      week,
    );
    expect(same).toContain('Заявки: 2 — столько же, сколько на прошлой неделе');
  });

  it('an empty week is reported as empty, not hidden and not made up', () => {
    const text = buildWeeklyReport(data(), week);
    expect(text).toContain('Заявки: за неделю заявок не было, как и на прошлой неделе');
    expect(text).toContain('Брони: за неделю новых броней не было, как и на прошлой неделе');
    expect(text).toContain('Новые исполнители: за неделю никто не пришёл, как и на прошлой неделе');
    expect(text).toContain('Новые машины: за неделю не добавляли, как и на прошлой неделе');
    expect(text).toContain('Вышли на линию за неделю: 0');
    expect(text).toContain('Отзывы: за неделю новых отзывов не было, как и на прошлой неделе');
    // No breakdowns and no to-do list out of nothing.
    expect(text).not.toContain('•');
    expect(text).not.toContain('Откуда пришли');
    expect(text).not.toContain('Ждёт вас');
    expect(text).not.toContain('NaN');
  });

  it('an empty week after a busy one names last week’s number', () => {
    const text = buildWeeklyReport(
      data(
        {},
        {
          orders: [{ source: 'SITE', count: 4 }],
          bookings: [{ status: 'COMPLETED', count: 2 }],
          reviews: { count: 1, ratingSum: 5 },
        },
      ),
      week,
    );
    expect(text).toContain('Заявки: за неделю заявок не было (на прошлой неделе — 4)');
    expect(text).toContain('Брони: за неделю новых броней не было (на прошлой неделе — 2)');
    expect(text).toContain('Отзывы: за неделю новых отзывов не было (на прошлой неделе — 1)');
  });

  it('lists bookings by status, leaving out the statuses with none', () => {
    const text = buildWeeklyReport(
      data(
        {
          bookings: [
            { status: 'PENDING', count: 1 },
            { status: 'COMPLETED', count: 2 },
            { status: 'CANCELLED', count: 1 },
          ],
        },
        { bookings: [{ status: 'COMPLETED', count: 1 }] },
      ),
      week,
    );
    expect(text).toContain('Брони: 4 — на 3 больше, чем на прошлой неделе (1)');
    expect(text).toContain('  • ждут подтверждения — 1, завершены — 2, отменены — 1');
    expect(text).not.toContain('подтверждены');
  });

  it('reports providers, machines, the line, price updates, reviews and deals', () => {
    const report = data(
      {
        providers: 3,
        machines: 7,
        reviews: { count: 2, ratingSum: 9 },
        leads: [{ source: 'home', status: 'DONE', count: 3 }],
        deals: { count: 2, amount: 150000 },
      },
      { providers: 1, machines: 7 },
    );
    report.line = { now: 5, house: 12, joined: 3 };
    report.priceUpdates = 2;
    report.waiting = { orders: 4, reviewTexts: 1 };
    const text = buildWeeklyReport(report, week);
    expect(text).toContain('Новые исполнители: 3 — на 2 больше, чем на прошлой неделе (1)');
    expect(text).toContain('Новые машины: 7 — столько же, сколько на прошлой неделе');
    expect(text).toContain(
      'На линии сейчас: машин других исполнителей — 5, свободных машин СпецПласт16 — 12',
    );
    expect(text).toContain('Вышли на линию за неделю: 3');
    expect(text).toContain('Обновили цены и свободные дни: 2');
    expect(text).toContain(
      'Отзывы: 2 — на 2 больше, чем на прошлой неделе (0); средняя оценка — 4,5',
    );
    expect(text).toMatch(/Сделок по заявкам на звонок: 2 на 150\s000 ₽/);
    expect(text).toContain('  • заявки из чатов на проверке: 4 — /admin');
    expect(text).toContain('  • тексты отзывов на проверке: 1 — /admin');
  });

  it('keeps the list of sources short', () => {
    const text = buildWeeklyReport(
      data({
        leads: ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((name, index) => ({
          source: `home · ${name}`,
          status: 'DONE',
          count: 10 - index,
        })),
      }),
      week,
    );
    expect(text).toContain('  • a: 10');
    expect(text).toContain('  • e: 6');
    expect(text).not.toContain('  • f: 5');
    expect(text).toContain('  • остальные: 9');
  });

  it('uses the owner’s words: «заявка», the full brand, no borrowed terms', () => {
    const text = buildWeeklyReport(data({ orders: [{ source: 'SITE', count: 1 }] }), week);
    expect(text).not.toMatch(/наряд|лид|СП16|кабинет/i);
  });
});
