import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { extractEquipmentSpecs } from '@specai/ai-service';
import { authOptions } from '@/lib/auth';

const requestSchema = z.object({
  sourceText: z.string().min(1).max(8000),
});

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'PROVIDER_ADMIN') {
    return NextResponse.json({ error: 'Provider admin access required' }, { status: 403 });
  }

  const body = await request.json();
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const specs = await extractEquipmentSpecs(parsed.data.sourceText);
    return NextResponse.json(specs);
  } catch {
    return NextResponse.json(
      { error: 'Spec extraction is unavailable right now' },
      { status: 502 },
    );
  }
}
