import { describe, expect, it } from 'vitest';
import {
  CHAT_MESSAGE_MAX_LENGTH,
  chatContactsOpen,
  countUnread,
  counterpartName,
  isFromOtherSide,
  prepareAttachmentUrl,
  prepareChatMessage,
  resolveThreadCompany,
  senderNameFor,
  threadRole,
  toPublicMessage,
  visibleThreads,
  type ChatOrder,
} from './orderChat';

const order: ChatOrder = {
  id: 'o1',
  customerId: 'cust',
  bidCompanyIds: ['romashka', 'specplast16-house'],
  booking: null,
};
const booked: ChatOrder = {
  ...order,
  booking: { companyId: 'romashka', status: 'CONFIRMED' },
};

const customer = { id: 'cust', role: 'CUSTOMER' };
const romashka = { id: 'p1', role: 'PROVIDER_ADMIN', companyId: 'romashka' };
const house = { id: 'p2', role: 'PROVIDER_ADMIN', companyId: 'specplast16-house' };
const stranger = { id: 'p3', role: 'PROVIDER_ADMIN', companyId: 'other' };
const admin = { id: 'a1', role: 'PLATFORM_ADMIN' };
const cookieAdmin = { id: 'admin', isAdmin: true };

describe('threadRole', () => {
  it('lets the customer and a bidding company into their thread', () => {
    expect(threadRole(customer, order, 'romashka')).toBe('customer');
    expect(threadRole(romashka, order, 'romashka')).toBe('provider');
    expect(threadRole(house, order, 'specplast16-house')).toBe('provider');
  });

  it('keeps a provider out of other companies threads', () => {
    expect(threadRole(romashka, order, 'specplast16-house')).toBeNull();
    expect(threadRole(stranger, order, 'other')).toBeNull();
    expect(threadRole(stranger, order, 'romashka')).toBeNull();
  });

  it('lets the booked company in even without a bid row', () => {
    const direct: ChatOrder = {
      ...order,
      bidCompanyIds: [],
      booking: { companyId: 'romashka', status: 'PENDING' },
    };
    expect(threadRole(romashka, direct, 'romashka')).toBe('provider');
  });

  it('gives admins a read-only role and nothing to the signed-out', () => {
    expect(threadRole(admin, order, 'romashka')).toBe('admin');
    expect(threadRole(cookieAdmin, order, 'romashka')).toBe('admin');
    expect(threadRole(null, order, 'romashka')).toBeNull();
    expect(threadRole({ id: 'x', role: 'CUSTOMER' }, order, 'romashka')).toBeNull();
  });
});

describe('resolveThreadCompany', () => {
  it('a provider always gets its own thread', () => {
    expect(resolveThreadCompany(romashka, order, null)).toEqual({
      ok: true,
      companyId: 'romashka',
    });
    expect(resolveThreadCompany(romashka, order, 'specplast16-house')).toMatchObject({
      ok: false,
      status: 403,
    });
    expect(resolveThreadCompany(stranger, order, null)).toMatchObject({ ok: false, status: 403 });
  });

  it('the customer names a bidder, not anyone else', () => {
    expect(resolveThreadCompany(customer, order, 'romashka')).toEqual({
      ok: true,
      companyId: 'romashka',
    });
    expect(resolveThreadCompany(customer, order, 'other')).toMatchObject({
      ok: false,
      status: 404,
    });
    expect(resolveThreadCompany(customer, order, null)).toMatchObject({ ok: false, status: 400 });
    expect(resolveThreadCompany(null, order, 'romashka')).toMatchObject({
      ok: false,
      status: 401,
    });
  });
});

describe('visibleThreads', () => {
  const threads = [{ companyId: 'romashka' }, { companyId: 'specplast16-house' }];

  it('customer and admins see every thread, a provider only its own', () => {
    expect(visibleThreads(threads, customer, order)).toHaveLength(2);
    expect(visibleThreads(threads, admin, order)).toHaveLength(2);
    expect(visibleThreads(threads, romashka, order)).toEqual([{ companyId: 'romashka' }]);
    expect(visibleThreads(threads, stranger, order)).toEqual([]);
    expect(visibleThreads(threads, null, order)).toEqual([]);
  });
});

describe('contacts in messages', () => {
  it('open only for the booked company once the booking is confirmed', () => {
    expect(chatContactsOpen(order, 'romashka')).toBe(false);
    expect(
      chatContactsOpen(
        { ...booked, booking: { companyId: 'romashka', status: 'PENDING' } },
        'romashka',
      ),
    ).toBe(false);
    expect(chatContactsOpen(booked, 'romashka')).toBe(true);
    expect(chatContactsOpen(booked, 'specplast16-house')).toBe(false);
    for (const status of ['ACTIVE', 'COMPLETED']) {
      expect(
        chatContactsOpen({ ...booked, booking: { companyId: 'romashka', status } }, 'romashka'),
      ).toBe(true);
    }
  });

  it('masks phones, e-mails, handles and links before confirmation', () => {
    const result = prepareChatMessage(
      'Звоните +7 917 123-45-67, пишите ivan@mail.ru или @ivan_petrov, сайт site.ru/price',
      false,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.masked).toBe(true);
    expect(result.text).not.toContain('917');
    expect(result.text).not.toContain('ivan@mail.ru');
    expect(result.text).not.toContain('ivan_petrov');
    expect(result.text).not.toContain('site.ru');
    expect(result.text).toContain('[контакт скрыт]');
  });

  it('stores the text as written after confirmation', () => {
    const text = 'Звоните +7 917 123-45-67';
    expect(prepareChatMessage(text, true)).toEqual({ ok: true, text, masked: false });
  });

  it('reports masked only when something changed', () => {
    expect(prepareChatMessage('Подъеду к 9 утра, дата 01.06.2028', false)).toEqual({
      ok: true,
      text: 'Подъеду к 9 утра, дата 01.06.2028',
      masked: false,
    });
  });

  it('trims, normalises whitespace and limits the length', () => {
    expect(prepareChatMessage('  Привет \r\n\r\n\r\n  мир  ', true)).toEqual({
      ok: true,
      text: 'Привет \n\n мир',
      masked: false,
    });
    expect(prepareChatMessage('   ', true)).toMatchObject({ ok: false });
    expect(prepareChatMessage(42, true)).toMatchObject({ ok: false });
    expect(prepareChatMessage('x'.repeat(CHAT_MESSAGE_MAX_LENGTH), true).ok).toBe(true);
    expect(prepareChatMessage('x'.repeat(CHAT_MESSAGE_MAX_LENGTH + 1), true).ok).toBe(false);
  });

  it('accepts only https attachments', () => {
    expect(prepareAttachmentUrl(undefined)).toEqual({ ok: true, url: null });
    expect(prepareAttachmentUrl('')).toEqual({ ok: true, url: null });
    expect(prepareAttachmentUrl('https://blob.vercel-storage.com/a.jpg')).toEqual({
      ok: true,
      url: 'https://blob.vercel-storage.com/a.jpg',
    });
    expect(prepareAttachmentUrl('http://x.ru/a.jpg').ok).toBe(false);
    expect(prepareAttachmentUrl('javascript:alert(1)').ok).toBe(false);
  });
});

describe('unread and names', () => {
  const messages = [
    { senderUserId: 'cust', readAt: null },
    { senderUserId: 'p1', readAt: null },
    { senderUserId: 'p1b', readAt: null },
    { senderUserId: 'p1', readAt: new Date() },
  ];

  it('counts only messages from the other side', () => {
    expect(countUnread(messages, 'customer', 'cust', 'cust')).toBe(2);
    expect(countUnread(messages, 'provider', 'cust', 'p1')).toBe(1);
    // A colleague's message is not unread for another manager.
    expect(isFromOtherSide({ senderUserId: 'p1b' }, 'provider', 'cust', 'p1')).toBe(false);
  });

  it('shows the customer the company and the provider only «Анна П.»', () => {
    const names = { companyName: 'Ромашка', customerName: 'Анна Петрова' };
    expect(counterpartName('customer', names)).toBe('Ромашка');
    expect(counterpartName('provider', names)).toBe('Анна П.');
    expect(counterpartName('admin', names)).toContain('Анна П.');
    expect(counterpartName('admin', names)).not.toContain('Петрова');
    expect(senderNameFor('customer', names)).toBe('Анна П.');
    expect(senderNameFor('provider', names)).toBe('Ромашка');
  });

  it('never returns sender ids to the client', () => {
    const row = {
      id: 'm1',
      body: 'Привет',
      attachmentUrl: null,
      createdAt: new Date('2026-10-08T10:00:00Z'),
      readAt: null,
      senderUserId: 'cust',
    };
    expect(toPublicMessage(row, 'customer', 'cust', 'cust')).toEqual({
      id: 'm1',
      body: 'Привет',
      attachmentUrl: null,
      createdAt: '2026-10-08T10:00:00.000Z',
      mine: true,
      readAt: null,
    });
    expect(toPublicMessage(row, 'provider', 'cust', 'p1').mine).toBe(false);
    expect(toPublicMessage(row, 'admin', 'cust', 'a1').mine).toBe(false);
  });
});
