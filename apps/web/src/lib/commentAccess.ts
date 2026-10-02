import { prisma } from '@specai/database';
import {
  NO_INTERACTION_MESSAGE,
  commentTargetError,
  toPublicComment,
  type CommentAuthor,
  type CommentTarget,
} from '@/lib/comments';

/**
 * Whether the author and the target dealt with each other: a booking of the
 * provider's machine by the customer, or the provider's bid on the
 * customer's order. Without it a comment is refused, so nobody can flood a
 * stranger's page.
 */
export async function hasInteraction(
  author: CommentAuthor,
  target: CommentTarget,
): Promise<boolean> {
  let customerId: string;
  let companyId: string;
  if (target.targetCompanyId) {
    customerId = author.id;
    companyId = target.targetCompanyId;
  } else if (target.targetUserId && author.companyId) {
    customerId = target.targetUserId;
    companyId = author.companyId;
  } else {
    return false;
  }
  const [booking, bid] = await Promise.all([
    prisma.booking.findFirst({
      where: { customerId, equipment: { companyId } },
      select: { id: true },
    }),
    prisma.bid.findFirst({
      where: { order: { customerId }, equipment: { companyId } },
      select: { id: true },
    }),
  ]);
  return Boolean(booking || bid);
}

/** Null when the author may comment on the target, otherwise the reason. */
export async function commentAccessError(
  author: CommentAuthor | null,
  target: CommentTarget,
): Promise<{ error: string; status: number } | null> {
  const ruleError = commentTargetError(author, target);
  if (ruleError) return { error: ruleError, status: author ? 400 : 401 };
  if (!author) return { error: 'Войдите в аккаунт', status: 401 };
  if (target.targetCompanyId) {
    const company = await prisma.company.findUnique({
      where: { id: target.targetCompanyId },
      select: { isProvider: true },
    });
    if (!company?.isProvider) return { error: 'Исполнитель не найден', status: 404 };
  } else if (target.targetUserId) {
    const user = await prisma.user.findUnique({
      where: { id: target.targetUserId },
      select: { id: true },
    });
    if (!user) return { error: 'Заказчик не найден', status: 404 };
  }
  if (!(await hasInteraction(author, target))) {
    return { error: NO_INTERACTION_MESSAGE, status: 403 };
  }
  return null;
}

/** Approved comments about a company or a customer, as everyone may see them. */
export async function approvedComments(target: CommentTarget, take = 50) {
  const comments = await prisma.comment.findMany({
    where: {
      status: 'APPROVED',
      ...(target.targetCompanyId
        ? { targetCompanyId: target.targetCompanyId }
        : { targetUserId: target.targetUserId ?? '' }),
    },
    include: {
      author: { select: { name: true, role: true, company: { select: { name: true } } } },
    },
    orderBy: { createdAt: 'desc' },
    take,
  });
  return comments.map(toPublicComment);
}
