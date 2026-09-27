import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { extractEquipmentSpecs } from '@specai/ai-service';
import { authOptions } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rateLimit';

const requestSchema = z.object({
  sourceText: z.string().min(1).max(8000),
});

const RATE_LIMIT = { limit: 10, windowMs: 60_000 };

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'PROVIDER_ADMIN') {
    return NextResponse.json({ error: 'Требуется аккаунт поставщика' }, { status: 403 });
  }

  const rate = checkRateLimit(`ai:extract-specs:${session.user.id}`, RATE_LIMIT);
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
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const specs = await extractEquipmentSpecs(parsed.data.sourceText);
    return NextResponse.json(specs);
  } catch {
    return NextResponse.json(
      { error: 'Извлечение характеристик сейчас недоступно' },
      { status: 502 },
    );
  }
}
