import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { isAdminRequest } from '@/lib/admin';

export const dynamic = 'force-dynamic';

// Comments waiting for moderation (`?status=APPROVED|REJECTED` for the others).
export async function GET(request: NextRequest) {
  if (!isAdminRequest()) return NextResponse.json({ error: 'Нет доступа' }, { status: 401 });
  const requested = request.nextUrl.searchParams.get('status');
  const status = requested === 'APPROVED' || requested === 'REJECTED' ? requested : 'PENDING';
  const comments = await prisma.comment.findMany({
    where: { status },
    include: {
      author: { select: { id: true, name: true, email: true, role: true } },
      targetCompany: { select: { id: true, name: true } },
      targetUser: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: status === 'PENDING' ? 'asc' : 'desc' },
    take: 100,
  });
  return NextResponse.json({ comments });
}
