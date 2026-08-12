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

  if (available.length === 0) {
    return NextResponse.json({ recommendations: [], followUpQuestion: undefined });
  }

  const candidates = available.map((item) => ({
    id: item.id,
    name: item.name,
    category: item.category.name,
    dailyRate: Number(item.dailyRate),
    specs: (item.specs as Record<string, unknown> | null) ?? undefined,
  }));

  let result;
  try {
    result = await recommendEquipment(parsed.data.jobDescription, candidates);
  } catch {
    return NextResponse.json({ error: 'ИИ-подбор сейчас недоступен' }, { status: 502 });
  }

  const byId = new Map(candidates.map((c) => [c.id, c]));
  const recommendations = result.recommendations
    .filter((rec) => byId.has(rec.equipmentId))
    .map((rec) => ({ ...rec, equipment: byId.get(rec.equipmentId) }));

  return NextResponse.json({ recommendations, followUpQuestion: result.followUpQuestion });
}
