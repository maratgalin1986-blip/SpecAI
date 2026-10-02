import { describe, expect, it } from 'vitest';
import { asksWhatNext, guideReply, guideRole, nextSteps } from './guide';

const customer = { role: 'CUSTOMER', companyId: null };
const provider = { role: 'PROVIDER_ADMIN', companyId: 'c1' };

describe('guideRole', () => {
  it('tells guests, customers and providers apart', () => {
    expect(guideRole(null)).toBe('GUEST');
    expect(guideRole(customer)).toBe('CUSTOMER');
    expect(guideRole(provider)).toBe('PROVIDER');
    // A provider account without a company has nothing to manage yet.
    expect(guideRole({ role: 'PROVIDER_ADMIN', companyId: null })).toBe('CUSTOMER');
  });
});

describe('nextSteps: guest', () => {
  it('asks to browse and then register', () => {
    const guide = nextSteps(null);
    expect(guide.role).toBe('GUEST');
    expect(guide.next.id).toBe('browse');
    expect(guide.steps.map((s) => s.id)).toEqual(['browse', 'register', 'order']);
    expect(guide.steps.find((s) => s.id === 'register')?.action?.href).toBe('/register');
    expect(guide.progress).toEqual({ done: 0, total: 3 });
  });
});

describe('nextSteps: customer', () => {
  it('a new customer is asked to leave an order', () => {
    const guide = nextSteps(customer, {});
    expect(guide.next.id).toBe('order');
    expect(guide.next.action?.href).toBe('/orders');
    expect(guide.next.action?.app).toBe('/orders/new');
    expect(guide.progress.done).toBe(1);
  });

  it('waits for offers on an open order without bids', () => {
    const guide = nextSteps(customer, {
      orders: 1,
      openOrdersWithoutBids: 1,
      waitingOrderId: 'o1',
    });
    expect(guide.next.id).toBe('offers');
    expect(guide.next.action?.href).toBe('/orders/o1');
  });

  it('choosing among offers beats everything else', () => {
    const guide = nextSteps(customer, {
      orders: 2,
      ordersWithBids: 1,
      choiceOrderId: 'o2',
      bookingsTotal: 1,
      bookingsCompleted: 1,
      commentsWritten: 1,
    });
    expect(guide.next.id).toBe('choose');
    expect(guide.next.action?.href).toBe('/orders/o2');
  });

  it('after booking waits for confirmation, then for the work', () => {
    expect(nextSteps(customer, { bookingsTotal: 1, bookingsPending: 1 }).next.id).toBe('confirmed');
    expect(nextSteps(customer, { bookingsTotal: 1, bookingsConfirmed: 1 }).next.id).toBe('work');
  });

  it('a booking straight from the catalog counts as the order and the choice', () => {
    const guide = nextSteps(customer, { bookingsTotal: 1, bookingsPending: 1 });
    const done = Object.fromEntries(guide.steps.map((s) => [s.id, s.done]));
    expect(done).toMatchObject({ order: true, offers: true, choose: true, confirmed: false });
  });

  it('after the work asks for a comment, then offers a new order', () => {
    expect(nextSteps(customer, { bookingsTotal: 1, bookingsCompleted: 1 }).next.id).toBe(
      'feedback',
    );
    const finished = nextSteps(customer, {
      orders: 1,
      bookingsTotal: 1,
      bookingsCompleted: 1,
      commentsWritten: 1,
    });
    expect(finished.next.id).toBe('repeat');
    expect(finished.progress).toEqual({ done: 7, total: 7 });
  });
});

describe('nextSteps: provider', () => {
  it('a new provider starts with the point on the map', () => {
    const guide = nextSteps(provider, {});
    expect(guide.role).toBe('PROVIDER');
    expect(guide.next.id).toBe('base');
  });

  it('then the equipment, then the orders', () => {
    expect(nextSteps(provider, { hasBase: true, hasPinNote: true }).next.id).toBe('equipment');
    const bids = nextSteps(provider, {
      hasBase: true,
      hasPinNote: true,
      equipmentCount: 2,
      newOrders: 3,
    });
    expect(bids.next.id).toBe('bids');
    expect(bids.next.hint).toContain('3 новые заявки');
    expect(bids.next.action?.app).toBe('/provider/orders');
  });

  it('a point without a note is not enough', () => {
    expect(nextSteps(provider, { hasBase: true }).next.id).toBe('base');
  });

  it('pending bookings come first, then active ones', () => {
    const pending = nextSteps(provider, { bookingsPending: 2, bookingsTotal: 2 });
    expect(pending.next.id).toBe('confirm');
    expect(pending.next.hint).toContain('2 брони');
    const active = nextSteps(provider, {
      hasBase: true,
      hasPinNote: true,
      equipmentCount: 1,
      bidsSent: 1,
      bookingsActive: 1,
      bookingsTotal: 1,
    });
    expect(active.next.id).toBe('complete');
  });

  it('after the work asks for a comment about the customer, then new orders', () => {
    const base = {
      hasBase: true,
      hasPinNote: true,
      equipmentCount: 1,
      bidsSent: 1,
      bookingsCompleted: 1,
      bookingsTotal: 1,
    };
    expect(nextSteps(provider, base).next.id).toBe('comment');
    const finished = nextSteps(provider, { ...base, commentsWritten: 1, newOrders: 1 });
    expect(finished.next.id).toBe('repeat');
    expect(finished.next.hint).toContain('1 новая заявка');
    expect(finished.progress).toEqual({ done: 7, total: 7 });
  });
});

describe('asksWhatNext and guideReply', () => {
  it('recognises «what next» questions', () => {
    for (const text of ['Что дальше?', 'что мне делать', 'Какой следующий шаг', 'С чего начать?']) {
      expect(asksWhatNext(text)).toBe(true);
    }
    expect(asksWhatNext('Нужен экскаватор под котлован')).toBe(false);
  });

  it('answers with the next step, a link and the checklist', () => {
    const reply = guideReply(nextSteps(customer, {}));
    expect(reply).toContain('Ваш следующий шаг: Оставьте заявку');
    expect(reply).toContain('[Оставить заявку](/orders)');
    expect(reply).toContain('✅ Регистрация');
    expect(guideReply(nextSteps(customer, {}), 'plain')).not.toContain('](');
  });
});
