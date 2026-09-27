import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@specai/database';
import { consumeToken } from '@/lib/tokens';

const schema = z.object({
  token: z.string().min(1).max(256),
  password: z.string().min(8).max(100),
});

const INVALID_MESSAGE = 'Ссылка недействительна или устарела';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const passwordIssue = parsed.error.issues.some((i) => i.path[0] === 'password');
    return NextResponse.json(
      { error: passwordIssue ? 'Пароль должен быть от 8 до 100 символов' : INVALID_MESSAGE },
      { status: 400 },
    );
  }

  const userId = await consumeToken(parsed.data.token, 'PASSWORD_RESET');
  if (!userId) {
    return NextResponse.json({ error: INVALID_MESSAGE }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  const now = new Date();
  await prisma.$transaction([
    // passwordChangedAt делает недействительными все JWT, выданные до смены пароля.
    prisma.user.update({ where: { id: userId }, data: { passwordHash, passwordChangedAt: now } }),
    // Остальные неиспользованные ссылки на сброс становятся бесполезными.
    prisma.verificationToken.updateMany({
      where: { userId, type: 'PASSWORD_RESET', usedAt: null },
      data: { usedAt: now },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
