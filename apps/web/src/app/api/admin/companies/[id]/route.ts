import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@specai/database';
import { isAdminRequest } from '@/lib/admin';

const schema = z.object({ verified: z.boolean() });

// «Проверен»: the admin marks a provider company as checked (ИНН, documents,
// a call) or removes the mark.
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminRequest()) return NextResponse.json({ error: 'Нет доступа' }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: 'Некорректное значение' }, { status: 400 });
  const company = await prisma.company
    .update({
      where: { id: params.id },
      data: { verified: parsed.data.verified },
      select: { id: true, verified: true },
    })
    .catch(() => null);
  if (!company) return NextResponse.json({ error: 'Компания не найдена' }, { status: 404 });
  return NextResponse.json({ company });
}
