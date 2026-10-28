import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@specai/database';
import { emailSchema } from '@specai/shared';
import { INVALID_JSON_MESSAGE, readJson, zodErrorMessage } from '@/lib/apiInput';
import { findUserByEmail } from '@/lib/findUserByEmail';
import { isQuickPlaceholderEmail } from '@/lib/quickProvider';
import { checkRateLimit } from '@/lib/rateLimit';
import { getRequestUser } from '@/lib/requestUser';
import { sendVerificationEmail } from '@/lib/verificationEmail';

export const dynamic = 'force-dynamic';

const schema = z.object({
  email: emailSchema,
  password: z
    .string()
    .min(8, 'Пароль — не короче 8 символов')
    .max(100, 'Пароль — не длиннее 100 символов'),
});

/**
 * «Сохраните вход»: аккаунт после лёгкой формы (служебный e-mail, без пароля)
 * задаёт свой e-mail и пароль, чтобы входить с других устройств. Только для
 * таких аккаунтов: сменить e-mail и пароль обычного аккаунта здесь нельзя.
 */
export async function PUT(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: 'Войдите в аккаунт' }, { status: 401 });
  if (!checkRateLimit(`login-details:${user.id}`, { limit: 5, windowMs: 60 * 60_000 }).ok) {
    return NextResponse.json({ error: 'Слишком часто, попробуйте позже' }, { status: 429 });
  }
  const record = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, email: true, name: true, passwordHash: true },
  });
  if (!record || !isQuickPlaceholderEmail(record.email) || record.passwordHash) {
    return NextResponse.json({ error: 'Вход уже настроен' }, { status: 409 });
  }
  const body = await readJson(request);
  if (body === null) return NextResponse.json({ error: INVALID_JSON_MESSAGE }, { status: 400 });
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });
  }
  if (await findUserByEmail(parsed.data.email, { select: { id: true } })) {
    return NextResponse.json({ error: 'Этот e-mail уже зарегистрирован' }, { status: 409 });
  }
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      email: parsed.data.email,
      passwordHash: await bcrypt.hash(parsed.data.password, 10),
    },
    select: { id: true, email: true, name: true },
  });
  try {
    await sendVerificationEmail(updated);
  } catch (error) {
    console.error('[account] verification email failed', error);
  }
  return NextResponse.json({ ok: true });
}
