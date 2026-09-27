import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@specai/database';
import { leadStatusSchema } from '@specai/shared';
import { isAdminRequest } from '@/lib/admin';

const updateSchema = z.object({ status: leadStatusSchema });

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminRequest()) {
    return NextResponse.json({ error: 'Нет доступа' }, { status: 401 });
  }
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Некорректный статус' }, { status: 400 });
  }
  const lead = await prisma.lead
    .update({ where: { id: params.id }, data: { status: parsed.data.status } })
    .catch(() => null);
  if (!lead) {
    return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 });
  }
  return NextResponse.json({ lead });
}
