import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { getRequestUser } from '@/lib/requestUser';
import { isProvider } from '@/lib/fleet';

export const dynamic = 'force-dynamic';

/** Frees the days of a manual block («Не сдаётся») of the provider's own machine. */
export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ id: string; blockId: string }> },
) {
  const params = await props.params;
  const currentUser = await getRequestUser(request);
  if (!isProvider(currentUser)) {
    return NextResponse.json({ error: 'Требуется аккаунт исполнителя' }, { status: 403 });
  }
  const { count } = await prisma.equipmentBlock.deleteMany({
    where: {
      id: params.blockId,
      equipmentId: params.id,
      equipment: { companyId: currentUser.companyId },
    },
  });
  if (count === 0) {
    return NextResponse.json({ error: 'Блокировка не найдена' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
