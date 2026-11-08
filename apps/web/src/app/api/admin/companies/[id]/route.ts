import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@specai/database';
import { isAdminRequest } from '@/lib/admin';
import {
  canDecide,
  decisionData,
  verificationStatus,
  type AdminDecision,
} from '@/lib/providerVerification';

const schema = z.union([
  z.object({ verified: z.boolean() }),
  z.object({ decision: z.literal('approve') }),
  z.object({ decision: z.literal('revoke') }),
  z.object({
    decision: z.literal('reject'),
    reason: z.string().trim().min(3, 'Напишите причину').max(300),
  }),
]);

// «Проверен»: the admin approves a provider company (ИНН, СТС, a call),
// returns its form with a reason, or removes the mark. The older
// `{ verified }` body of the toggle maps to approve / revoke.
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminRequest()) return NextResponse.json({ error: 'Нет доступа' }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: 'Некорректное значение' }, { status: 400 });
  const body = parsed.data;
  const decision: AdminDecision =
    'verified' in body
      ? { action: body.verified ? 'approve' : 'revoke' }
      : body.decision === 'reject'
        ? { action: 'reject', reason: body.reason }
        : { action: body.decision };

  const current = await prisma.company.findUnique({
    where: { id: params.id },
    select: {
      verified: true,
      provisional: true,
      verificationRequestedAt: true,
      verificationRejectedReason: true,
    },
  });
  if (!current) return NextResponse.json({ error: 'Компания не найдена' }, { status: 404 });
  if (!canDecide(verificationStatus(current), decision.action)) {
    return NextResponse.json({ error: 'Это решение сейчас недоступно' }, { status: 409 });
  }
  const company = await prisma.company.update({
    where: { id: params.id },
    data: decisionData(decision),
    select: { id: true, verified: true, provisional: true },
  });
  return NextResponse.json({ company });
}
