import { describe, expect, it } from 'vitest';
import {
  companyHasPriority,
  CUSTOMER_INVITE_NOTE,
  EARLY_NOTICE_LINE,
  extendPriority,
  hasPriority,
  INVITE_DETAIL,
  INVITE_HEADLINE,
  planOrderNotice,
  priorityBadgeText,
  priorityDate,
} from './referralPriority';
import { renderNotification } from './notifications/routing';
import { invitationText } from './referral';
import * as APP from '../../../mobile/src/lib/referralBonus';

const DAY = 86_400_000;
const NOW = new Date('2026-10-17T09:00:00Z');
const days = (n: number) => new Date(NOW.getTime() + n * DAY);

describe('extendPriority', () => {
  it('gives a week from now to a user without the bonus or with an expired one', () => {
    expect(extendPriority(null, NOW)).toEqual(days(7));
    expect(extendPriority(undefined, NOW)).toEqual(days(7));
    expect(extendPriority(days(-3), NOW)).toEqual(days(7));
  });

  it('stacks a week on top of a running bonus', () => {
    expect(extendPriority(days(7), NOW)).toEqual(days(14));
    expect(extendPriority(days(14), NOW)).toEqual(days(21));
  });

  it('never reaches further than 30 days ahead', () => {
    expect(extendPriority(days(28), NOW)).toEqual(days(30));
    expect(extendPriority(days(30), NOW)).toEqual(days(30));
    let until: Date | null = null;
    for (let i = 0; i < 10; i += 1) until = extendPriority(until, NOW);
    expect(until).toEqual(days(30));
  });

  it('never shortens a longer bonus', () => {
    expect(extendPriority(days(40), NOW)).toEqual(days(40));
  });
});

describe('hasPriority / companyHasPriority', () => {
  it('is on only strictly before the end', () => {
    expect(hasPriority(days(1), NOW)).toBe(true);
    expect(hasPriority(NOW, NOW)).toBe(false);
    expect(hasPriority(null, NOW)).toBe(false);
    expect(hasPriority('garbage', NOW)).toBe(false);
  });

  it('counts a company when any of its managers holds the bonus', () => {
    expect(companyHasPriority([{ priorityUntil: null }, { priorityUntil: days(2) }], NOW)).toBe(
      true,
    );
    expect(companyHasPriority([{ priorityUntil: days(-1) }, {}], NOW)).toBe(false);
    expect(companyHasPriority([], NOW)).toBe(false);
  });
});

describe('planOrderNotice', () => {
  const p = (userId: string) => ({ userId, priority: true });
  const o = (userId: string) => ({ userId, priority: false });

  it('splits when both bonus holders and others are matched', () => {
    expect(planOrderNotice([p('a'), o('b'), o('c'), p('d')])).toEqual({
      now: ['a', 'd'],
      later: ['b', 'c'],
    });
  });

  it('tells everyone at once when nobody holds the bonus', () => {
    expect(planOrderNotice([o('b'), o('c')])).toEqual({ now: ['b', 'c'], later: [] });
  });

  it('tells everyone at once when everyone holds it', () => {
    expect(planOrderNotice([p('a'), p('d')])).toEqual({ now: ['a', 'd'], later: [] });
  });

  it('has nothing to send for nobody', () => {
    expect(planOrderNotice([])).toEqual({ now: [], later: [] });
  });
});

describe('texts', () => {
  it('formats the date as a Moscow day in Russian', () => {
    expect(priorityDate(new Date('2026-10-24T09:00:00Z'))).toBe('24 октября');
    // 22:30 UTC is already the next day in Moscow.
    expect(priorityDate(new Date('2026-10-23T22:30:00Z'))).toBe('24 октября');
    expect(priorityDate('2026-12-31T20:59:00Z')).toBe('31 декабря');
  });

  it('shows the badge only while the bonus lasts', () => {
    expect(priorityBadgeText(new Date('2026-10-24T09:00:00Z'), NOW)).toBe(
      '🚀 Заявки приходят вам на 5 минут раньше — до 24 октября',
    );
    expect(priorityBadgeText(days(-1), NOW)).toBeNull();
    expect(priorityBadgeText(null, NOW)).toBeNull();
  });

  it('keeps the owner-approved wording of the invitation', () => {
    expect(INVITE_HEADLINE).toBe(
      'Пригласите друга — неделю получаете заявки на 5 минут раньше всех',
    );
    expect(INVITE_DETAIL).toBe(
      'Друг регистрируется по вашей ссылке — и 7 дней уведомления о новых заявках рядом приходят вам на 5 минут раньше остальных исполнителей. За каждого следующего — ещё неделя (до 30 дней вперёд).',
    );
    expect(CUSTOMER_INVITE_NOTE).toContain('когда подключите свою технику');
  });

  it('says the same in the app (apps/mobile/src/lib/referralBonus.ts)', () => {
    expect(APP.INVITE_HEADLINE).toBe(INVITE_HEADLINE);
    expect(APP.INVITE_DETAIL).toBe(INVITE_DETAIL);
    expect(APP.CUSTOMER_INVITE_NOTE).toBe(CUSTOMER_INVITE_NOTE);
    expect(APP.priorityBadgeText('2026-10-24T09:00:00Z', NOW)).toBe(
      priorityBadgeText(new Date('2026-10-24T09:00:00Z'), NOW),
    );
    for (const role of ['PROVIDER', 'CUSTOMER'] as const) {
      expect(APP.invitationMessage(role, 'L')).toBe(`${invitationText(role)} L`);
    }
  });

  it('adds the early line only to an early alert', () => {
    const base = {
      type: 'order.new' as const,
      orderId: 'o1',
      description: 'Нужен экскаватор',
      startDate: new Date('2026-10-20T06:00:00Z'),
    };
    expect(renderNotification({ ...base, early: true }).body).toContain(EARLY_NOTICE_LINE);
    expect(renderNotification(base).body).not.toContain('🚀');
  });

  it('tells the inviter until when, honestly for a customer', () => {
    const until = new Date('2026-10-24T09:00:00Z');
    const provider = renderNotification({ type: 'referral.bonus', until, provider: true });
    expect(provider.body).toBe(
      'Ваш друг зарегистрировался по приглашению — до 24 октября новые заявки рядом приходят вам на 5 минут раньше остальных.',
    );
    const customer = renderNotification({ type: 'referral.bonus', until, provider: false });
    expect(customer.body).toContain('если вы подключите свою технику как исполнитель');
    expect(customer.path).toBe('/dashboard#invite');
    expect(provider.path).toBe('/provider#invite');
  });
});
