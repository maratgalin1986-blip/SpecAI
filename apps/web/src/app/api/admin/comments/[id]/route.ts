import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@specai/database';
import { isAdminRequest } from '@/lib/admin';
import { shortAuthorName } from '@/lib/comments';
import { notifyCompany, notifyUser } from '@/lib/notifications/notifyUser';

const schema = z.object({ status: z.enum(['APPROVED', 'REJECTED']) });

// Moderation: publish (APPROVED) or reject a comment.
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminRequest()) return NextResponse.json({ error: 'Нет доступа' }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Некорректный статус' }, { status: 400 });
  const previous = await prisma.comment
    .findUnique({ where: { id: params.id }, select: { status: true } })
    .catch(() => null);
  const comment = await prisma.comment
    .update({
      where: { id: params.id },
      data: { status: parsed.data.status, moderatedAt: new Date() },
      select: {
        id: true,
        status: true,
        moderatedAt: true,
        text: true,
        authorId: true,
        targetCompanyId: true,
        targetUserId: true,
        targetCompany: { select: { name: true } },
        targetUser: { select: { name: true } },
      },
    })
    .catch(() => null);
  if (!comment) return NextResponse.json({ error: 'Комментарий не найден' }, { status: 404 });

  // Published for the first time: the author and the subject hear of it.
  if (comment.status === 'APPROVED' && previous?.status !== 'APPROVED') {
    const about = comment.targetCompany
      ? `Об исполнителе «${comment.targetCompany.name}»`
      : `О заказчике ${shortAuthorName(comment.targetUser?.name)}`;
    await notifyUser(comment.authorId, {
      type: 'comment.published',
      audience: 'author',
      about,
      text: comment.text,
    });
    const subjectEvent = {
      type: 'comment.published',
      audience: 'subject',
      about: 'Новый комментарий о вас',
      text: comment.text,
    } as const;
    if (comment.targetCompanyId) await notifyCompany(comment.targetCompanyId, subjectEvent);
    else if (comment.targetUserId) await notifyUser(comment.targetUserId, subjectEvent);
  }

  return NextResponse.json({
    comment: { id: comment.id, status: comment.status, moderatedAt: comment.moderatedAt },
  });
}
