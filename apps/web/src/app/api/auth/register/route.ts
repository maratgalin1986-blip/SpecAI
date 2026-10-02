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

  // СпецПласт16 is the only executor on its site: no sign-up for outside
  // equipment providers. The owner's fleet account is linked in /admin.
  if (parsed.data.accountType === 'PROVIDER') {
    return NextResponse.json(
      { error: 'Регистрация поставщиков закрыта: всю технику предоставляет СпецПласт16.' },
      { status: 403 },
    );
  }

  const existing = await findUserByEmail(parsed.data.email, { select: { id: true } });
  if (existing) {
    return NextResponse.json({ error: 'Этот e-mail уже зарегистрирован' }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);

  const user = await prisma.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      phone: parsed.data.phone,
      passwordHash,
      role: 'CUSTOMER',
    },
  });

  // Письмо подтверждения — best-effort: сбой не должен ломать регистрацию.
  try {
    await sendVerificationEmail(user);
  } catch (error) {
    console.error('[auth] failed to send verification email', error);
  }

  return NextResponse.json({ id: user.id, email: user.email }, { status: 201 });
}
