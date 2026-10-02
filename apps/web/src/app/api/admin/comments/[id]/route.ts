import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@specai/database';
import { isAdminRequest } from '@/lib/admin';

const schema = z.object({ status: z.enum(['APPROVED', 'REJECTED']) });

// Moderation: publish (APPROVED) or reject a comment.
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminRequest()) return NextResponse.json({ error: 'Нет доступа' }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Некорректный статус' }, { status: 400 });
  const comment = await prisma.comment
    .update({
      where: { id: params.id },
      data: { status: parsed.data.status, moderatedAt: new Date() },
      select: { id: true, status: true, moderatedAt: true },
    })
    .catch(() => null);
  if (!comment) return NextResponse.json({ error: 'Комментарий не найден' }, { status: 404 });
  return NextResponse.json({ comment });
}
