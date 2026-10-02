import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@specai/database';
import { isAdminRequest } from '@/lib/admin';

const schema = z.object({ status: z.enum(['APPROVED', 'REJECTED']) });

// Moderation of a review's text: publish (APPROVED) or hide it (REJECTED).
// The stars are public either way.
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminRequest()) return NextResponse.json({ error: 'Нет доступа' }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Некорректный статус' }, { status: 400 });
  const review = await prisma.review
    .update({
      where: { id: params.id },
      data: { textStatus: parsed.data.status },
      select: { id: true, textStatus: true },
    })
    .catch(() => null);
  if (!review) return NextResponse.json({ error: 'Отзыв не найден' }, { status: 404 });
  return NextResponse.json({ review });
}
