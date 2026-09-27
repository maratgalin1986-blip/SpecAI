import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@specai/database';
import { authOptions } from '@/lib/auth';
import { consumeToken } from '@/lib/tokens';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token') ?? '';
  const session = await getServerSession(authOptions);
  const target = session ? '/dashboard' : '/login';

  const userId = await consumeToken(token, 'EMAIL_VERIFY');
  if (!userId) {
    return NextResponse.redirect(new URL(`${target}?verified=0`, request.nextUrl.origin));
  }

  await prisma.user.updateMany({
    where: { id: userId, emailVerified: null },
    data: { emailVerified: new Date() },
  });

  return NextResponse.redirect(new URL(`${target}?verified=1`, request.nextUrl.origin));
}
