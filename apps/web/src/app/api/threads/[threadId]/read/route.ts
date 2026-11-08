import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { chatViewer, companyUserIds, threadContext } from '@/lib/orderChatAccess';

export const dynamic = 'force-dynamic';

/**
 * Marks the other side's messages in the thread as read by the viewer. An
 * admin reading a thread changes nothing.
 */
export async function POST(request: NextRequest, { params }: { params: { threadId: string } }) {
  const viewer = await chatViewer(request);
  const access = await threadContext(params.threadId, viewer);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const { context } = access;
  if (context.role === 'admin') return NextResponse.json({ ok: true, read: 0 });

  const ours =
    context.role === 'provider' ? await companyUserIds(context.thread.companyId) : [viewer!.id];
  const { count } = await prisma.orderMessage.updateMany({
    where: { threadId: context.thread.id, readAt: null, senderUserId: { notIn: ours } },
    data: { readAt: new Date() },
  });
  return NextResponse.json({ ok: true, read: count });
}
