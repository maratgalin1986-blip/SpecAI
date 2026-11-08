import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@specai/database';
import { isAdminRequest } from '@/lib/admin';
import { canChangeProposalStatus } from '@/lib/proposals';

const schema = z.object({ status: z.enum(['READ', 'ARCHIVED']) });

// «Прочитано» (NEW → READ) and «В архив» (NEW/READ → ARCHIVED).
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminRequest()) return NextResponse.json({ error: 'Нет доступа' }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Некорректный статус' }, { status: 400 });
  const next = parsed.data.status;

  const current = await prisma.proposal.findUnique({
    where: { id: params.id },
    select: { status: true },
  });
  if (!current) return NextResponse.json({ error: 'Сообщение не найдено' }, { status: 404 });
  if (!canChangeProposalStatus(current.status, next)) {
    return NextResponse.json({ error: 'Уже обработано', status: current.status }, { status: 409 });
  }
  // Only from the status just read: a parallel decision (site and app) wins once.
  const { count } = await prisma.proposal.updateMany({
    where: { id: params.id, status: current.status },
    data: { status: next },
  });
  if (count === 0) return NextResponse.json({ error: 'Уже обработано' }, { status: 409 });
  return NextResponse.json({ proposal: { id: params.id, status: next } });
}
