import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@specai/database';
import { recommendEquipment } from '@specai/ai-service';

const requestSchema = z.object({
  jobDescription: z.string().min(1).max(2000),
});

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = requestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const available = await prisma.equipment.findMany({
    where: { status: 'AVAILABLE' },
    include: { category: true },
    take: 50,
  });

  const candidates = available.map((item) => ({
    id: item.id,
    name: item.name,
    category: item.category.name,
    dailyRate: Number(item.dailyRate),
    specs: (item.specs as Record<string, unknown> | null) ?? undefined,
  }));

  const result = await recommendEquipment(parsed.data.jobDescription, candidates);
  return NextResponse.json(result);
}
