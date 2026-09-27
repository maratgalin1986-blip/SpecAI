import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@specai/database';

export const dynamic = 'force-dynamic';

/** Публичная карточка техники (используется мобильным приложением). */
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const equipment = await prisma.equipment.findUnique({
    where: { id: params.id },
    include: {
      category: true,
      location: true,
      company: { select: { id: true, name: true } },
    },
  });

  if (!equipment) {
    return NextResponse.json({ error: 'Техника не найдена' }, { status: 404 });
  }

  return NextResponse.json({ equipment });
}
