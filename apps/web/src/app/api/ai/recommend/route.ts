import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@specai/database';
import { recommendEquipment } from '@specai/ai-service';
import { getRequestUser } from '@/lib/requestUser';
import { checkRateLimit } from '@/lib/rateLimit';
import { clientIpFrom } from '@/lib/loginErrors';
import { PUBLIC_FLEET } from '@/lib/fleet';
import { matchTask } from '@/lib/dispatcher';

const requestSchema = z.object({
  jobDescription: z.string().min(1).max(2000),
});

const RATE_LIMIT = { limit: 10, windowMs: 60_000 };
const GUEST_RATE_LIMIT = { limit: 5, windowMs: 60_000 };

export async function POST(request: NextRequest) {
  // Guests may pick a machine too (/recommend has no sign-in), limited by IP
  // to keep AI costs bounded.
  const currentUser = await getRequestUser(request);
  const ip = clientIpFrom((name) => request.headers.get(name));
  const rate = currentUser
    ? checkRateLimit(`ai:recommend:${currentUser.id}`, RATE_LIMIT)
    : checkRateLimit(`ai:recommend:ip:${ip}`, GUEST_RATE_LIMIT);
  if (!rate.ok) {
    return NextResponse.json(
      { error: 'Слишком много запросов, попробуйте позже' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSec) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Некорректный JSON' }, { status: 400 });
  }
  const parsed = requestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: 'Опишите задачу — до 2000 символов.' }, { status: 400 });
  }

  const available = await prisma.equipment.findMany({
    where: { ...PUBLIC_FLEET, status: 'AVAILABLE' },
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

  // Without an AI key (or if the AI fails) the rule-based dispatcher picks
  // the machine type for the job, so the page always answers.
  const byRules = () => {
    const task = matchTask(parsed.data.jobDescription);
    const picked = task ? candidates.filter((c) => c.category === task.category) : [];
    return {
      recommendations: picked
        .sort((x, y) => x.dailyRate - y.dailyRate)
        .slice(0, 3)
        .map((c) => ({ equipmentId: c.id, reason: `Подходит: ${task?.why}.` })),
      followUpQuestion: task
        ? undefined
        : 'Опишите задачу подробнее: что нужно сделать (копать, поднять, вывезти, уплотнить…), объём и адрес.',
    };
  };
  let result;
  if (!process.env.ANTHROPIC_API_KEY) {
    result = byRules();
  } else {
    try {
      result = await recommendEquipment(parsed.data.jobDescription, candidates);
    } catch {
      result = byRules();
    }
  }

  const byId = new Map(candidates.map((c) => [c.id, c]));
  const recommendations = result.recommendations
    .filter((rec) => byId.has(rec.equipmentId))
    .map((rec) => ({ ...rec, equipment: byId.get(rec.equipmentId) }));

  return NextResponse.json({ recommendations, followUpQuestion: result.followUpQuestion });
}
