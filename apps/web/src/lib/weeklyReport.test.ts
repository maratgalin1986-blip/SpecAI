import { describe, expect, it } from 'vitest';
import { buildWeeklyReport } from './weeklyReport';

const now = new Date('2026-10-05T05:00:00Z').getTime();
const daysAgo = (d: number) => new Date(now - d * 86_400_000);

describe('buildWeeklyReport', () => {
  it('counts this week against the last one and lists channels', () => {
    const text = buildWeeklyReport(
      [
        { createdAt: daysAgo(1), source: 'home · yandex / cpc', status: 'NEW' },
        { createdAt: daysAgo(2), source: 'wizard · yandex / cpc', status: 'DONE' },
        { createdAt: daysAgo(9), source: 'home', status: 'DONE' },
      ],
      [{ createdAt: daysAgo(3), source: 'TELEGRAM' }],
      now,
    );
    expect(text).toContain('Заявки на звонок: 2 (+100% к прошлой)');
    expect(text).toContain('Заявки на технику: 1 (на прошлой неделе не было)');
    expect(text).toContain('Не обработано: 1');
    expect(text).toContain('yandex / cpc: 2');
    expect(text).toContain('Из чатов Telegram/WhatsApp: 1');
  });

  it('sums deals of the week', () => {
    const text = buildWeeklyReport(
      [
        { createdAt: daysAgo(1), source: 'home', status: 'DONE', outcome: 'deal', amount: 120000 },
        { createdAt: daysAgo(2), source: 'home', status: 'DONE', outcome: 'deal', amount: 30000 },
        { createdAt: daysAgo(2), source: 'home', status: 'DONE', outcome: 'no_deal' },
      ],
      [],
      now,
    );
    expect(text).toMatch(/Сделок: 2 на 150[\s\u00a0\u202f]000 ₽/);
  });

  it('handles an empty week', () => {
    expect(buildWeeklyReport([], [], now)).toContain('Заявки на звонок: 0');
  });
});
