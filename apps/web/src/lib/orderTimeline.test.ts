import { describe, expect, it } from 'vitest';
import { orderTimeline } from './orderTimeline';

const states = (input: Parameters<typeof orderTimeline>[0]) =>
  orderTimeline(input, 'o1').steps.map((step) => step.state);

describe('orderTimeline', () => {
  it('a fresh order waits for offers', () => {
    const timeline = orderTimeline({ orderStatus: 'OPEN', bidCount: 0 }, 'o1');
    expect(timeline.steps.map((s) => s.title)).toEqual([
      'Создан',
      'Предложения',
      'Исполнитель выбран',
      'На объекте',
      'Завершён',
    ]);
    expect(states({ orderStatus: 'OPEN', bidCount: 0 })).toEqual([
      'done',
      'current',
      'upcoming',
      'upcoming',
      'upcoming',
    ]);
    expect(timeline.next.action).toBeUndefined();
  });

  it('with offers the next action is to choose', () => {
    const timeline = orderTimeline({ orderStatus: 'OPEN', bidCount: 3 }, 'o1');
    expect(timeline.steps[1]!.state).toBe('done');
    expect(timeline.steps[2]!.state).toBe('current');
    expect(timeline.next.text).toContain('3');
    expect(timeline.next.action?.href).toBe('/orders/o1#offers');
  });

  it('follows the booking: pending, confirmed, active, completed', () => {
    const pending = orderTimeline({
      orderStatus: 'MATCHED',
      bidCount: 2,
      bookingStatus: 'PENDING',
    });
    expect(pending.steps[2]!.state).toBe('done');
    expect(pending.next.text).toMatch(/подтвердит/);
    const confirmed = orderTimeline({
      orderStatus: 'MATCHED',
      bidCount: 2,
      bookingStatus: 'CONFIRMED',
    });
    expect(confirmed.next.action?.href).toBe('/dashboard#bookings');
    expect(states({ orderStatus: 'MATCHED', bidCount: 2, bookingStatus: 'ACTIVE' })).toEqual([
      'done',
      'done',
      'done',
      'done',
      'current',
    ]);
    const done = orderTimeline({ orderStatus: 'MATCHED', bidCount: 2, bookingStatus: 'COMPLETED' });
    expect(done.steps.every((step) => step.state === 'done')).toBe(true);
    expect(done.next.action?.label).toBe('Оставить отзыв');
  });

  it('a cancelled order has no current step and offers a new order', () => {
    const timeline = orderTimeline({ orderStatus: 'CANCELLED', bidCount: 1 });
    expect(timeline.cancelled).toBe(true);
    expect(timeline.steps.some((step) => step.state === 'current')).toBe(false);
    expect(timeline.next.action?.href).toBe('/orders#new');
  });
});
