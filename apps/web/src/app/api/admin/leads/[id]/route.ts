import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@specai/database';
import { leadOutcomeSchema, leadStatusSchema } from '@specai/shared';
import { isAdminRequest } from '@/lib/admin';

const updateSchema = z
  .object({
    status: leadStatusSchema,
    // null clears the outcome.
    outcome: leadOutcomeSchema.nullable(),
    amount: z.number().int().min(0).max(1_000_000_000).nullable(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0);

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminRequest()) {
    return NextResponse.json({ error: 'Нет доступа' }, { status: 401 });
  }
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Некорректные данные' }, { status: 400 });
  }
  const lead = await prisma.lead
    .update({ where: { id: params.id }, data: parsed.data })
    .catch(() => null);
  if (!lead) {
    return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 });
  }
  return NextResponse.json({ lead });
}
