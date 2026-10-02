import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { getRequestUser } from '@/lib/requestUser';
import { INVALID_JSON_MESSAGE, readJson } from '@/lib/apiInput';
import { checkRateLimit } from '@/lib/rateLimit';
import { notifyTelegram } from '@/lib/notify';
import { isProvider } from '@/lib/fleet';
import { commentAccessError } from '@/lib/commentAccess';
import {
  COMMENT_RATE_LIMITS,
  COMMENT_SENT_MESSAGE,
  prepareCommentText,
  shortAuthorName,
  toPublicComment,
} from '@/lib/comments';

export const dynamic = 'force-dynamic';

function idParam(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 && value.length <= 64 ? value : undefined;
}

/**
 * Approved comments about a provider company (`?companyId=`, public) or about
 * a customer (`?userId=`, for providers and the customer). `canComment` says
 * whether the current user may add one.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const companyId = idParam(params.get('companyId'));
  const userId = idParam(params.get('userId'));
  if (Boolean(companyId) === Boolean(userId)) {
    return NextResponse.json({ error: 'Укажите companyId или userId' }, { status: 400 });
  }
  const user = await getRequestUser(request);
  if (userId && !(isProvider(user) || user?.id === userId)) {
    return NextResponse.json(
      { error: 'Комментарии о заказчиках видят исполнители' },
      { status: user ? 403 : 401 },
    );
  }
  const target = companyId ? { targetCompanyId: companyId } : { targetUserId: userId };
  const [comments, access] = await Promise.all([
    prisma.comment.findMany({
      where: { ...target, status: 'APPROVED' },
      include: {
        author: { select: { name: true, role: true, company: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    user ? commentAccessError(user, target) : Promise.resolve({ error: '', status: 401 }),
  ]);
  return NextResponse.json({
    comments: comments.map(toPublicComment),
    canComment: access === null,
  });
}

export async function POST(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) {
    return NextResponse.json(
      { error: 'Войдите в аккаунт, чтобы оставить комментарий' },
      { status: 401 },
    );
  }
  const body = await readJson(request);
  if (body === null || typeof body !== 'object') {
    return NextResponse.json({ error: INVALID_JSON_MESSAGE }, { status: 400 });
  }
  const input = body as Record<string, unknown>;
  const target = {
    targetCompanyId: idParam(input.targetCompanyId) ?? null,
    targetUserId: idParam(input.targetUserId) ?? null,
  };
  const prepared = prepareCommentText(input.text);
  if (!prepared.ok) return NextResponse.json({ error: prepared.error }, { status: 400 });

  const denied = await commentAccessError(user, target);
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

  for (const window of COMMENT_RATE_LIMITS) {
    const rate = checkRateLimit(`comments:${user.id}:${window.windowMs}`, window);
    if (!rate.ok) {
      return NextResponse.json(
        { error: 'Слишком много комментариев подряд. Попробуйте позже' },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfterSec) } },
      );
    }
  }

  const comment = await prisma.comment.create({
    data: { text: prepared.text, authorId: user.id, ...target },
    select: {
      id: true,
      status: true,
      targetCompany: { select: { name: true } },
      targetUser: { select: { name: true } },
    },
  });

  const about = comment.targetCompany
    ? `об исполнителе «${comment.targetCompany.name}»`
    : `о заказчике ${shortAuthorName(comment.targetUser?.name)}`;
  await notifyTelegram(
    [
      '📝 Новый комментарий на модерации',
      `${shortAuthorName(user.name)} ${about}:`,
      prepared.text.slice(0, 500),
      'Опубликовать или отклонить — в /admin',
    ].join('\n'),
  );

  return NextResponse.json(
    { comment: { id: comment.id, status: comment.status }, message: COMMENT_SENT_MESSAGE },
    { status: 201 },
  );
}
