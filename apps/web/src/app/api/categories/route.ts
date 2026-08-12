import { NextResponse } from 'next/server';
import { prisma } from '@specai/database';

export const dynamic = 'force-dynamic';

export async function GET() {
  const categories = await prisma.equipmentCategory.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });
  return NextResponse.json({ categories });
}
