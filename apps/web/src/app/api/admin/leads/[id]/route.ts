import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { leadCrmPatchSchema } from '@specai/shared';
import { isAdminRequest } from '@/lib/admin';

/**
 * The owner edits a lead from /admin and /admin/leads: status, outcome and
 * amount, and the CRM fields — note, city, when to call back. Setting a
 * call-back time on a new lead moves it to «В работе» so it is never lost
 * among the new ones (requirement R2 of tasks/autopilot/2026-10-22-crm).
 */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminRequest()) {
    return NextResponse.json({ error: 'Нет доступа' }, { status: 401 });
  }
  const parsed = leadCrmPatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Некорректные данные' }, { status: 400 });
  }
  const data = { ...parsed.data };
  if (data.callAt && !data.status) {
    const current = await prisma.lead.findUnique({
      where: { id: params.id },
      select: { status: true },
    });
    if (!current) return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 });
    if (current.status === 'NEW') data.status = 'IN_PROGRESS';
  }
  const lead = await prisma.lead.update({ where: { id: params.id }, data }).catch(() => null);
  if (!lead) {
    return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 });
  }
  return NextResponse.json({ lead });
}
