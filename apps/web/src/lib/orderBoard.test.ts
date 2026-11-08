import { describe, expect, it } from 'vitest';
import {
  ANY_CATEGORY,
  BID_NEEDS_PROVIDER_NOTE,
  DEFAULT_PLACE,
  EXCERPT_MAX,
  bidLoginHref,
  bidsLabel,
  boardHref,
  categoryEmoji,
  dateRangeLabel,
  daysCount,
  excerpt,
  groupCategories,
  parseBoardQuery,
  sourceLabel,
  timeAgo,
  toBoardCard,
  whenWindow,
  type BoardOrderRow,
} from './orderBoard';

// 2026-10-11 12:00 Moscow.
const NOW = new Date('2026-10-11T09:00:00Z');

function row(overrides: Partial<BoardOrderRow> = {}): BoardOrderRow {
  return {
    id: 'ord1',
    description: 'Нужен экскаватор на два дня, траншея 50 м.',
    desiredStartDate: new Date('2026-10-12T00:00:00Z'),
    desiredEndDate: new Date('2026-10-13T00:00:00Z'),
    createdAt: new Date('2026-10-11T07:00:00Z'),
    bidsUntil: new Date('2026-10-11T10:20:00Z'),
    source: 'SITE',
    category: { id: 'cat1', name: 'Экскаваторы' },
    customer: { name: 'Анна Петрова' },
    location: { city: 'Елабуга' },
    bidCount: 3,
    ...overrides,
  };
}

describe('toBoardCard', () => {
  it('shows the customer as «Анна П.» and nothing personal', () => {
    const card = toBoardCard(row(), NOW);
    expect(card.customer).toBe('Анна П.');
    expect(JSON.stringify(card)).not.toContain('Петрова');
    expect(Object.keys(card)).not.toContain('customerId');
    expect(Object.keys(card)).not.toContain('contactPhone');
  });

  it('hides phones, e-mails and links in the description', () => {
    const card = toBoardCard(
      row({
        description:
          'Нужен кран. Звоните +7 917 123-45-67, пишите ivan@mail.ru или t.me/ivan, сайт kran.ru',
      }),
      NOW,
    );
    expect(card.excerpt).not.toMatch(/917|123-45-67|ivan@|t\.me|kran\.ru/);
    expect(card.excerpt).toContain('[контакт скрыт]');
  });

  it('labels the card: emoji, place, dates, days, offers, countdown, age', () => {
    const card = toBoardCard(row(), NOW);
    expect(card.emoji).toBe('🚜');
    expect(card.categoryName).toBe('Экскаваторы');
    expect(card.place).toBe('Елабуга');
    expect(card.dates).toBe('12–13 окт');
    expect(card.daysLabel).toBe('2 дня');
    expect(card.bidsLabel).toBe('3 предложения');
    expect(card.bidsLeft).toBe('осталось 1 ч 20 мин');
    expect(card.createdAgo).toBe('2 ч назад');
    expect(card.urgent).toBe(false);
    expect(card.sourceLabel).toBeNull();
    expect(card.href).toBe('/orders/ord1');
  });

  it('falls back to «Любая техника» and «Место не указано», not to a region', () => {
    const card = toBoardCard(row({ category: null, location: null }), NOW);
    expect(card.categoryName).toBe(ANY_CATEGORY);
    expect(card.place).toBe(DEFAULT_PLACE);
    expect(DEFAULT_PLACE).toBe('Место не указано');
    expect(card.emoji).toBe('🛠️');
  });

  it('marks work starting today as urgent and shows no countdown once bids are over', () => {
    const card = toBoardCard(
      row({
        desiredStartDate: new Date('2026-10-11T00:00:00Z'),
        desiredEndDate: new Date('2026-10-11T00:00:00Z'),
        bidsUntil: new Date('2026-10-11T08:00:00Z'),
        bidCount: 0,
      }),
      NOW,
    );
    expect(card.urgent).toBe(true);
    expect(card.daysLabel).toBe('1 день');
    expect(card.dates).toBe('11 окт');
    expect(card.bidsLeft).toBeNull();
    expect(card.bidsLabel).toBe('Пока без предложений');
  });

  it('uses the chat author’s short name and a source badge for imported orders', () => {
    const card = toBoardCard(
      row({
        source: 'TELEGRAM',
        customer: { name: 'Импорт из чатов' },
        contactName: 'Рустем Галиев',
      }),
      NOW,
    );
    expect(card.customer).toBe('Рустем Г.');
    expect(card.sourceLabel).toBe('из Telegram-чата');
    expect(sourceLabel('WHATSAPP')).toBe('из WhatsApp-чата');
    expect(sourceLabel('SITE')).toBeNull();
  });
});

describe('excerpt', () => {
  it('cuts long text at a word under the limit with an ellipsis', () => {
    const long = Array.from({ length: 60 }, (_, i) => `слово${i}`).join(' ');
    const text = excerpt(long);
    expect(text.length).toBeLessThanOrEqual(EXCERPT_MAX);
    // Ends with a whole word and the ellipsis, not a cut word.
    expect(text).toMatch(/слово\d+…$/);
  });

  it('folds whitespace and keeps short text as is', () => {
    expect(excerpt('Нужен  кран\n\nна завтра')).toBe('Нужен кран на завтра');
  });
});

describe('labels', () => {
  it('pluralises offers', () => {
    expect(bidsLabel(1)).toBe('1 предложение');
    expect(bidsLabel(5)).toBe('5 предложений');
    expect(bidsLabel(0)).toBe('Пока без предложений');
  });

  it('formats date ranges across months', () => {
    expect(dateRangeLabel(new Date('2026-09-30T00:00:00Z'), new Date('2026-10-02T00:00:00Z'))).toBe(
      '30 сен – 2 окт',
    );
    expect(daysCount(new Date('2026-09-30T00:00:00Z'), new Date('2026-10-02T00:00:00Z'))).toBe(3);
    expect(daysCount(new Date('2026-10-02T00:00:00Z'), new Date('2026-10-01T00:00:00Z'))).toBe(1);
  });

  it('says how long ago', () => {
    expect(timeAgo(new Date('2026-10-11T08:59:40Z'), NOW)).toBe('только что');
    expect(timeAgo(new Date('2026-10-11T08:55:00Z'), NOW)).toBe('5 мин назад');
    expect(timeAgo(new Date('2026-10-10T09:00:00Z'), NOW)).toBe('вчера');
    expect(timeAgo(new Date('2026-10-08T09:00:00Z'), NOW)).toBe('3 дн назад');
    expect(timeAgo(new Date('2026-08-01T09:00:00Z'), NOW)).toBe('1 авг');
  });

  it('picks an emoji by the category name', () => {
    expect(categoryEmoji('Автокраны')).toBe('🏗️');
    expect(categoryEmoji('Самосвалы')).toBe('🚛');
    expect(categoryEmoji('Автовышки')).toBe('🪜');
    expect(categoryEmoji('Что-то ещё')).toBe('🛠️');
  });

  it('builds the sign-in link back to the order', () => {
    expect(bidLoginHref('ord1')).toBe('/login?callbackUrl=%2Forders%2Ford1');
    expect(BID_NEEDS_PROVIDER_NOTE).toMatch(/исполнителя/);
  });
});

describe('parseBoardQuery and boardHref', () => {
  it('falls back to the defaults on anything odd', () => {
    expect(parseBoardQuery({})).toEqual({
      page: 1,
      group: null,
      city: null,
      when: 'all',
      sort: 'newest',
    });
    expect(
      parseBoardQuery({ page: '0', group: 'a b', city: '  ', when: 'later', sort: 'price' }),
    ).toEqual({ page: 1, group: null, city: null, when: 'all', sort: 'newest' });
  });

  it('keeps valid values and trims the city', () => {
    expect(
      parseBoardQuery({
        page: ['3'],
        group: 'earth',
        city: ' Казань ',
        when: 'today',
        sort: 'soonest',
      }),
    ).toEqual({ page: 3, group: 'earth', city: 'Казань', when: 'today', sort: 'soonest' });
  });

  it('leaves the defaults out of the link', () => {
    expect(boardHref({ page: 1, when: 'all', sort: 'newest' })).toBe('/orders');
    expect(
      boardHref({ group: 'earth', city: 'Казань', when: 'soon', sort: 'soonest', page: 2 }),
    ).toBe(
      '/orders?group=earth&city=%D0%9A%D0%B0%D0%B7%D0%B0%D0%BD%D1%8C&when=soon&sort=soonest&page=2',
    );
  });

  it('turns «when» into a start-date window of Moscow days', () => {
    expect(whenWindow('all', NOW)).toEqual({});
    expect(whenWindow('today', NOW)).toEqual({ lt: new Date('2026-10-12T00:00:00Z') });
    expect(whenWindow('tomorrow', NOW)).toEqual({
      gte: new Date('2026-10-12T00:00:00Z'),
      lt: new Date('2026-10-13T00:00:00Z'),
    });
    expect(whenWindow('soon', NOW)).toEqual({ lt: new Date('2026-10-13T00:00:00Z') });
  });
});

describe('groupCategories', () => {
  const fallback = (name: string) =>
    /кран/i.test(name) ? { id: 'lifting', label: 'Подъёмная' } : { id: 'other', label: 'Другая' };

  it('uses the task groups for a flat list', () => {
    const groups = groupCategories(
      [
        { id: 'c1', name: 'Автокраны' },
        { id: 'c2', name: 'Манипуляторы' },
        { id: 'c3', name: 'Краны-манипуляторы' },
      ],
      fallback,
    );
    expect(groups).toEqual([
      { id: 'lifting', label: 'Подъёмная', categoryIds: ['c1', 'c3'] },
      { id: 'other', label: 'Другая', categoryIds: ['c2'] },
    ]);
  });

  it('uses parent categories when the tree has them', () => {
    const groups = groupCategories(
      [
        { id: 'p1', name: 'Подъёмная техника', parentId: null },
        {
          id: 'c1',
          name: 'Автокраны',
          parentId: 'p1',
          parent: { id: 'p1', name: 'Подъёмная техника' },
        },
        { id: 'c2', name: 'Автовышки', parentId: 'p1' },
        { id: 'c3', name: 'Самосвалы' },
      ],
      fallback,
    );
    expect(groups).toEqual([
      { id: 'p1', label: 'Подъёмная техника', categoryIds: ['c1', 'c2'] },
      { id: 'other', label: 'Другая', categoryIds: ['c3'] },
    ]);
  });
});
