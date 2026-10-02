import { describe, expect, it } from 'vitest';
import {
  HIDDEN_CONTACT,
  canSeeChatContacts,
  canSeeCustomerName,
  isHttpsUrl,
  isSafeHttpUrl,
  maskContacts,
  maskMessagesForAi,
  orderDescriptionFor,
  visibleBids,
} from './privacy';

describe('maskContacts', () => {
  it('hides phone numbers in any common format', () => {
    for (const phone of [
      '89170001122',
      '+79170001122',
      '8 (917) 000-11-22',
      '+7 917 000 11 22',
      '8-917-000-11-22',
      '242-80-88',
    ]) {
      const masked = maskContacts(`Нужен кран, тел ${phone}, звоните`);
      expect(masked).toBe(`Нужен кран, тел ${HIDDEN_CONTACT}, звоните`);
    }
  });

  it('hides e-mails, @usernames and messenger links', () => {
    expect(maskContacts('пишите ivan.petrov@mail.ru')).toBe(`пишите ${HIDDEN_CONTACT}`);
    expect(maskContacts('в личку @ivan_kran16')).toBe(`в личку ${HIDDEN_CONTACT}`);
    expect(maskContacts('@ivan_kran16 нужен кран')).toBe(`${HIDDEN_CONTACT} нужен кран`);
    expect(maskContacts('t.me/ivan_kran16 или https://wa.me/79170001122')).toBe(
      `${HIDDEN_CONTACT} или ${HIDDEN_CONTACT}`,
    );
  });

  it('keeps dates, sizes, tonnage and prices', () => {
    const text =
      'Нужен экскаватор-погрузчик 01.06.2028, траншея 20 м, автокран 25 т, до 30000 руб, 2027-03-10';
    expect(maskContacts(text)).toBe(text);
  });

  it('masks the example from the acceptance report', () => {
    const text =
      'Нужен экскаватор-погрузчик завтра, Набережные Челны, траншея 20 м, тел 89170001122';
    expect(maskContacts(text)).not.toContain('89170001122');
    expect(maskContacts(text)).toContain('траншея 20 м');
  });
});

describe('maskMessagesForAi', () => {
  it('hides phones and e-mails in every message before the AI provider', () => {
    const masked = maskMessagesForAi([
      { role: 'user' as const, content: 'Экскаватор на завтра, мой номер +7 900 000-00-00' },
      { role: 'assistant' as const, content: 'Принял. Оставьте телефон.' },
      { role: 'user' as const, content: 'Городской 8 (8552) 12-34-56, почта Ivan.Petrov@mail.ru' },
      { role: 'user' as const, content: '+7 843 123 45 67, 89000000000' },
    ]);
    expect(masked.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'user']);
    const text = masked.map((m) => m.content).join(' ');
    expect(text).not.toMatch(/\d{3}[\s-]?\d{2}[\s-]?\d{2}/);
    expect(text).not.toContain('@');
    expect(masked[0]?.content).toBe(`Экскаватор на завтра, мой номер ${HIDDEN_CONTACT}`);
  });

  it('keeps dates, sums and sizes and does not mutate the input', () => {
    const input = [
      { role: 'user' as const, content: 'С 01.06.2028, 8 часов, 3500 ₽, яма 10x20 м' },
    ];
    expect(maskMessagesForAi(input)[0]?.content).toBe(input[0]?.content);
    expect(maskMessagesForAi(input)[0]).not.toBe(input[0]);
  });
});

describe('url checks', () => {
  it('accepts only http and https', () => {
    expect(isSafeHttpUrl('https://t.me/chat/1')).toBe(true);
    expect(isSafeHttpUrl('http://example.com')).toBe(true);
    expect(isSafeHttpUrl('javascript:alert(document.cookie)')).toBe(false);
    expect(isSafeHttpUrl('JavaScript:alert(1)')).toBe(false);
    expect(isSafeHttpUrl('data:text/html,<script>1</script>')).toBe(false);
    expect(isSafeHttpUrl('/relative')).toBe(false);
    expect(isSafeHttpUrl(null)).toBe(false);
  });

  it('https only for images', () => {
    expect(isHttpsUrl('https://x.public.blob.vercel-storage.com/a.jpg')).toBe(true);
    expect(isHttpsUrl('http://example.com/a.jpg')).toBe(false);
    expect(isHttpsUrl('javascript:alert(1)')).toBe(false);
  });
});

describe('visibleBids', () => {
  const bids = [
    { id: 'b1', equipment: { companyId: 'c1' } },
    { id: 'b2', equipment: { companyId: 'c2' } },
  ];

  it('shows all bids to the order owner and admins', () => {
    expect(visibleBids(bids, { userId: 'u1' }, 'u1')).toHaveLength(2);
    expect(visibleBids(bids, { isAdmin: true }, 'u1')).toHaveLength(2);
    expect(visibleBids(bids, { userId: 'a', role: 'PLATFORM_ADMIN' }, 'u1')).toHaveLength(2);
  });

  it('shows a provider only the bids of their company', () => {
    const own = visibleBids(bids, { userId: 'p', role: 'PROVIDER_ADMIN', companyId: 'c2' }, 'u1');
    expect(own.map((b) => b.id)).toEqual(['b2']);
  });

  it('shows nothing to anonymous visitors and other customers', () => {
    expect(visibleBids(bids, {}, 'u1')).toEqual([]);
    expect(visibleBids(bids, { userId: 'u2', role: 'CUSTOMER' }, 'u1')).toEqual([]);
  });
});

describe('who sees personal data', () => {
  it('customer name: owner and admins only', () => {
    expect(canSeeCustomerName({}, 'u1')).toBe(false);
    expect(canSeeCustomerName({ userId: 'u2', role: 'PROVIDER_ADMIN' }, 'u1')).toBe(false);
    expect(canSeeCustomerName({ userId: 'u1' }, 'u1')).toBe(true);
    expect(canSeeCustomerName({ isAdmin: true }, 'u1')).toBe(true);
  });

  it('chat contacts: admins and providers with a confirmed e-mail', () => {
    expect(canSeeChatContacts({})).toBe(false);
    expect(canSeeChatContacts({ role: 'CUSTOMER', emailVerified: true })).toBe(false);
    expect(canSeeChatContacts({ role: 'PROVIDER_ADMIN', emailVerified: false })).toBe(false);
    expect(canSeeChatContacts({ role: 'PROVIDER_ADMIN', emailVerified: true })).toBe(true);
    expect(canSeeChatContacts({ isAdmin: true })).toBe(true);
  });

  it('masks descriptions of imported orders for everyone else', () => {
    const imported = { description: 'кран, тел 89170001122', source: 'TELEGRAM' };
    expect(orderDescriptionFor(imported, {})).toBe(`кран, тел ${HIDDEN_CONTACT}`);
    expect(orderDescriptionFor(imported, { isAdmin: true })).toBe(imported.description);
    const site = { description: 'мой тел 89170001122', source: 'SITE' };
    expect(orderDescriptionFor(site, {})).toBe(site.description);
  });
});
