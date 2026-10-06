// Comments about a provider company (written by its customers) and about a
// customer (written by providers who worked with them). Every comment waits
// for moderation in /admin; only APPROVED ones are shown. Pure functions only,
// so the rules are unit-tested without a database.
import { maskContactsAndLinks } from './privacy';

export const COMMENT_MIN_LENGTH = 10;
export const COMMENT_MAX_LENGTH = 1000;

export const COMMENT_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export type CommentStatus = (typeof COMMENT_STATUSES)[number];

export const COMMENT_SENT_MESSAGE = 'Комментарий отправлен на проверку';

/** Frequency limits per author: a burst and a daily cap. */
export const COMMENT_RATE_LIMITS = [
  { limit: 3, windowMs: 10 * 60_000 },
  { limit: 10, windowMs: 24 * 60 * 60_000 },
];

export type PreparedComment = { ok: true; text: string } | { ok: false; error: string };

/**
 * Trims and checks the length of a comment and hides contacts and links.
 * The length is checked on what the author typed, so masking cannot turn a
 * too-short text into an acceptable one.
 */
export function prepareCommentText(raw: unknown): PreparedComment {
  if (typeof raw !== 'string') return { ok: false, error: 'Напишите текст комментария' };
  const text = raw
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (text.length < COMMENT_MIN_LENGTH) {
    return {
      ok: false,
      error: `Комментарий слишком короткий: нужно не меньше ${COMMENT_MIN_LENGTH} символов`,
    };
  }
  if (text.length > COMMENT_MAX_LENGTH) {
    return {
      ok: false,
      error: `Комментарий слишком длинный: не больше ${COMMENT_MAX_LENGTH} символов`,
    };
  }
  return { ok: true, text: maskContactsAndLinks(text) };
}

/** «Иван Петров» → «Иван П.»; never an e-mail or a phone. */
export function shortAuthorName(name: string | null | undefined): string {
  const words = (name ?? '')
    .replace(/[^\p{L}\s.-]/gu, ' ')
    .split(/\s+/)
    .filter((word) => /\p{L}/u.test(word));
  if ((name ?? '').includes('@') || words.length === 0) return 'Пользователь';
  const [first, second] = words;
  const firstName = first!.charAt(0).toUpperCase() + first!.slice(1);
  return second ? `${firstName} ${second.charAt(0).toUpperCase()}.` : firstName;
}

export interface CommentAuthor {
  id: string;
  role?: string | null;
  companyId?: string | null;
}

export interface CommentTarget {
  targetCompanyId?: string | null;
  targetUserId?: string | null;
}

/**
 * Which kind of comment the author may leave, before looking at the database:
 * a customer writes about a provider company, a provider writes about a
 * customer. Returns an error text or null.
 */
export function commentTargetError(
  author: CommentAuthor | null,
  target: CommentTarget,
): string | null {
  if (!author) return 'Войдите в аккаунт, чтобы оставить комментарий';
  const toCompany = Boolean(target.targetCompanyId);
  const toUser = Boolean(target.targetUserId);
  if (toCompany === toUser) return 'Укажите, о ком комментарий: о компании или о заказчике';
  const isProviderAuthor = author.role === 'PROVIDER_ADMIN' && Boolean(author.companyId);
  if (toCompany) {
    if (author.companyId && author.companyId === target.targetCompanyId) {
      return 'Нельзя оставить комментарий о своей компании';
    }
    return null;
  }
  if (target.targetUserId === author.id) return 'Нельзя оставить комментарий о себе';
  if (!isProviderAuthor) {
    return 'Комментарии о заказчиках оставляют исполнители, которые с ними работали';
  }
  return null;
}

export const NO_INTERACTION_MESSAGE =
  'Комментарий можно оставить только после брони или предложения по заявке между вами';

/** What everyone may see of an approved comment: no e-mail, no phone, short name. */
export interface PublicComment {
  id: string;
  text: string;
  createdAt: string;
  authorName: string;
  /** Company of a provider author («СпецПласт16»), null for customers. */
  authorCompany: string | null;
}

export function toPublicComment(comment: {
  id: string;
  text: string;
  createdAt: Date;
  author: { name: string; role?: string | null; company?: { name: string } | null };
}): PublicComment {
  return {
    id: comment.id,
    // Masked once more on the way out: comments approved before a rule change stay clean.
    text: maskContactsAndLinks(comment.text),
    createdAt: comment.createdAt.toISOString(),
    authorName: shortAuthorName(comment.author.name),
    authorCompany:
      comment.author.role === 'PROVIDER_ADMIN' ? (comment.author.company?.name ?? null) : null,
  };
}
