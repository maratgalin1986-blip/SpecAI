import { describe, expect, it } from 'vitest';
import type { PendingComment, PendingReview } from './adminApi';
import {
  emptyList,
  moderationRoute,
  optimisticReducer,
  toModerationItems,
  type OptimisticList,
} from './adminModeration';

type Item = { key: string; title: string };
const a: Item = { key: 'a', title: 'A' };
const b: Item = { key: 'b', title: 'B' };
const c: Item = { key: 'c', title: 'C' };

function loaded(items: Item[]): OptimisticList<Item> {
  return optimisticReducer(emptyList<Item>(), { type: 'load', items });
}

describe('optimistic moderation list', () => {
  it('removes a card at once and forgets it when the server agrees', () => {
    let state = optimisticReducer(loaded([a, b, c]), { type: 'remove', key: 'b' });
    expect(state.items).toEqual([a, c]);
    expect(Object.keys(state.inFlight)).toEqual(['b']);
    state = optimisticReducer(state, { type: 'confirm', key: 'b' });
    expect(state.items).toEqual([a, c]);
    expect(state.inFlight).toEqual({});
  });

  it('puts the card back in its place with the error when the server refuses', () => {
    let state = optimisticReducer(loaded([a, b, c]), { type: 'remove', key: 'b' });
    state = optimisticReducer(state, { type: 'restore', key: 'b', error: 'Нет соединения' });
    expect(state.items).toEqual([a, b, c]);
    expect(state.errors).toEqual({ b: 'Нет соединения' });
    expect(state.inFlight).toEqual({});
  });

  it('restores at the end when the list became shorter meanwhile', () => {
    let state = optimisticReducer(loaded([a, b, c]), { type: 'remove', key: 'c' });
    state = optimisticReducer(state, { type: 'remove', key: 'a' });
    state = optimisticReducer(state, { type: 'confirm', key: 'a' });
    state = optimisticReducer(state, { type: 'restore', key: 'c', error: 'Ошибка' });
    expect(state.items).toEqual([b, c]);
  });

  it('clears the old error when the owner tries again', () => {
    let state = optimisticReducer(loaded([a]), { type: 'remove', key: 'a' });
    state = optimisticReducer(state, { type: 'restore', key: 'a', error: 'Ошибка' });
    state = optimisticReducer(state, { type: 'remove', key: 'a' });
    expect(state.errors).toEqual({});
  });

  it('does not bring back a card still waiting for the server on refresh', () => {
    let state = optimisticReducer(loaded([a, b]), { type: 'remove', key: 'a' });
    state = optimisticReducer(state, { type: 'load', items: [a, b, c] });
    expect(state.items).toEqual([b, c]);
  });

  it('drops errors of cards that left the list on refresh', () => {
    let state = optimisticReducer(loaded([a, b]), { type: 'remove', key: 'a' });
    state = optimisticReducer(state, { type: 'restore', key: 'a', error: 'Ошибка' });
    state = optimisticReducer(state, { type: 'load', items: [b] });
    expect(state.errors).toEqual({});
  });

  it('does not bring back a decided card from a list asked for before the decision', () => {
    let state = optimisticReducer(loaded([a, b, c]), { type: 'remove', key: 'b' });
    state = optimisticReducer(state, { type: 'confirm', key: 'b' });
    // A refresh started before «Опубликовать» returns the old list with «b».
    state = optimisticReducer(state, { type: 'load', items: [a, b, c] });
    expect(state.items).toEqual([a, c]);
  });

  it('ignores unknown keys', () => {
    const state = loaded([a]);
    expect(optimisticReducer(state, { type: 'remove', key: 'x' })).toBe(state);
    expect(optimisticReducer(state, { type: 'restore', key: 'x', error: 'e' })).toBe(state);
  });
});

describe('moderation cards', () => {
  const review: PendingReview = {
    id: 'r1',
    rating: 4,
    comment: null,
    createdAt: '2026-10-16T10:00:00Z',
    author: { name: 'Анна Петрова', email: 'anna@example.com' },
    company: { name: 'ИП Петров' },
    equipment: { name: 'JCB 3CX' },
  };
  const comment: PendingComment = {
    id: 'c1',
    text: 'Пунктуальный заказчик',
    createdAt: '2026-10-15T10:00:00Z',
    author: { name: 'Иван', email: 'ivan@example.com' },
    targetCompany: null,
    targetUser: { name: 'Анна Петрова' },
  };

  it('merges reviews and comments, oldest first, with distinct keys', () => {
    const items = toModerationItems({ reviews: [review], comments: [comment] });
    expect(items.map((item) => item.key)).toEqual(['comment:c1', 'review:r1']);
  });

  it('says who wrote about whom', () => {
    const [first, second] = toModerationItems({ reviews: [review], comments: [comment] });
    expect(first && moderationRoute(first)).toBe('Иван → Анна Петрова');
    expect(second && moderationRoute(second)).toBe('Анна Петрова → ИП Петров · JCB 3CX');
  });
});
