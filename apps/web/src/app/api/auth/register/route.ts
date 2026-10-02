import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@specai/database';
import { findUserByEmail } from '@/lib/findUserByEmail';
import { registerSchema } from '@specai/shared';
import { sendVerificationEmail } from '@/lib/verificationEmail';

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { consent?: unknown } | null;
  // 152-ФЗ: без явного согласия на обработку персональных данных аккаунт не создаётся.
  if (body?.consent !== true) {
    return NextResponse.json(
      { error: 'Нужно согласие на обработку персональных данных' },
      { status: 400 },
    );
  }
  const parsed = registerSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await findUserByEmail(parsed.data.email, { select: { id: true } });
  if (existing) {
    return NextResponse.json({ error: 'Этот e-mail уже зарегистрирован' }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);

  const user = await prisma.$transaction(async (tx) => {
    if (parsed.data.accountType === 'PROVIDER') {
      const company = await tx.company.create({
        data: { name: parsed.data.companyName, isProvider: true },
      });
      return tx.user.create({
        data: {
          name: parsed.data.name,
          email: parsed.data.email,
          phone: parsed.data.phone,
          passwordHash,
          role: 'PROVIDER_ADMIN',
          companyId: company.id,
        },
      });
    }

    return tx.user.create({
      data: {
        name: parsed.data.name,
        email: parsed.data.email,
        phone: parsed.data.phone,
        passwordHash,
        role: 'CUSTOMER',
      },
    });
  });

  // Письмо подтверждения — best-effort: сбой не должен ломать регистрацию.
  try {
    await sendVerificationEmail(user);
  } catch (error) {
    console.error('[auth] failed to send verification email', error);
  }

  return NextResponse.json({ id: user.id, email: user.email }, { status: 201 });
}
