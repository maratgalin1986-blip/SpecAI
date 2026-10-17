import type { PendingComment, PendingReview } from './adminApi';

/**
 * Список «на решение» с мгновенным откликом: карточка исчезает сразу после
 * нажатия «Опубликовать»/«Скрыть», а если сервер ответил ошибкой — встаёт на
 * прежнее место с текстом ошибки. Один редьюсер для модерации отзывов и
 * комментариев и для заявок из чатов.
 */
export interface Keyed {
  key: string;
}

export interface OptimisticList<T extends Keyed> {
  items: T[];
  /** Убранные карточки, по которым ждём ответа сервера, и их прежние места. */
  inFlight: Record<string, { item: T; index: number }>;
  /** Ошибка под карточкой после неудачного решения. */
  errors: Record<string, string>;
}

export type OptimisticAction<T extends Keyed> =
  | { type: 'load'; items: T[] }
  | { type: 'remove'; key: string }
  | { type: 'confirm'; key: string }
  | { type: 'restore'; key: string; error: string };

export function emptyList<T extends Keyed>(): OptimisticList<T> {
  return { items: [], inFlight: {}, errors: {} };
}

function without<V>(record: Record<string, V>, key: string): Record<string, V> {
  if (!(key in record)) return record;
  const next = { ...record };
  delete next[key];
  return next;
}

export function optimisticReducer<T extends Keyed>(
  state: OptimisticList<T>,
  action: OptimisticAction<T>,
): OptimisticList<T> {
  switch (action.type) {
    case 'load': {
      // Свежий список с сервера: то, что ещё ждёт ответа, не возвращаем, а
      // ошибки оставляем только у карточек, которые всё ещё в списке.
      const items = action.items.filter((item) => !(item.key in state.inFlight));
      const keys = new Set(items.map((item) => item.key));
      const errors = Object.fromEntries(
        Object.entries(state.errors).filter(([key]) => keys.has(key)),
      );
      return { ...state, items, errors };
    }
    case 'remove': {
      const index = state.items.findIndex((item) => item.key === action.key);
      const item = state.items[index];
      if (!item) return state;
      return {
        items: state.items.filter((entry) => entry.key !== action.key),
        inFlight: { ...state.inFlight, [action.key]: { item, index } },
        errors: without(state.errors, action.key),
      };
    }
    case 'confirm':
      return { ...state, inFlight: without(state.inFlight, action.key) };
    case 'restore': {
      const pending = state.inFlight[action.key];
      if (!pending) return state;
      const items = [...state.items];
      items.splice(Math.min(pending.index, items.length), 0, pending.item);
      return {
        items,
        inFlight: without(state.inFlight, action.key),
        errors: { ...state.errors, [action.key]: action.error },
      };
    }
    default:
      return state;
  }
}

/** Отзыв или комментарий на модерации — одна карточка списка. */
export type ModerationItem =
  | ({ key: string; kind: 'review' } & PendingReview)
  | ({ key: string; kind: 'comment' } & PendingComment);

/** Отзывы и комментарии одним списком, сначала самые старые (как в ответе сервера). */
export function toModerationItems(data: {
  reviews: PendingReview[];
  comments: PendingComment[];
}): ModerationItem[] {
  const items: ModerationItem[] = [
    ...data.reviews.map((review) => ({
      ...review,
      kind: 'review' as const,
      key: `review:${review.id}`,
    })),
    ...data.comments.map((comment) => ({
      ...comment,
      kind: 'comment' as const,
      key: `comment:${comment.id}`,
    })),
  ];
  return items.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

/** «Кто → кому» для карточки модерации. */
export function moderationRoute(item: ModerationItem): string {
  const target =
    item.kind === 'review'
      ? item.company.name + (item.equipment ? ` · ${item.equipment.name}` : '')
      : (item.targetCompany?.name ?? item.targetUser?.name ?? '—');
  return `${item.author.name || 'Без имени'} → ${target}`;
}
