import { NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { isAdminRequest } from '@/lib/admin';

export const dynamic = 'force-dynamic';

/**
 * Everything waiting for the owner, for the app's admin menu: reviews (stars
 * and text are hidden until approved) and comments. Decisions go through
 * PATCH /api/admin/reviews/[id] and /api/admin/comments/[id].
 */
export async function GET() {
  if (!isAdminRequest()) return NextResponse.json({ error: 'Нет доступа' }, { status: 401 });
  const [reviews, comments] = await Promise.all([
    prisma.review.findMany({
      where: { textStatus: 'PENDING' },
      select: {
        id: true,
        rating: true,
        comment: true,
        createdAt: true,
        author: { select: { name: true, email: true } },
        company: { select: { name: true } },
        equipment: { select: { name: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
    }),
    prisma.comment.findMany({
      where: { status: 'PENDING' },
      select: {
        id: true,
        text: true,
        createdAt: true,
        author: { select: { name: true, email: true } },
        targetCompany: { select: { name: true } },
        targetUser: { select: { name: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
    }),
  ]);
  return NextResponse.json({ reviews, comments });
}
