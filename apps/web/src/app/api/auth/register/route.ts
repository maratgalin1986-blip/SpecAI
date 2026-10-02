import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@specai/database';
import { findUserByEmail } from '@/lib/findUserByEmail';
import { registerSchema } from '@specai/shared';
import { sendVerificationEmail } from '@/lib/verificationEmail';
import { zodErrorMessage } from '@/lib/apiInput';
import { resolveProviderBase, type ProviderBase } from '@/lib/providerBase';
import { checkRateLimit } from '@/lib/rateLimit';

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    consent?: unknown;
    baseAddress?: unknown;
    baseLat?: unknown;
    baseLon?: unknown;
  } | null;
  // 152-ФЗ: без явного согласия на обработку персональных данных аккаунт не создаётся.
  if (body?.consent !== true) {
    return NextResponse.json(
      { error: 'Нужно согласие на обработку персональных данных' },
      { status: 400 },
    );
  }
  const parsed = registerSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });
  }

  const existing = await findUserByEmail(parsed.data.email, { select: { id: true } });
  if (existing) {
    return NextResponse.json({ error: 'Этот e-mail уже зарегистрирован' }, { status: 409 });
  }

  // A provider is shown on the customers' map (/map): without the place where
  // its machinery stands it cannot sign up.
  let base: ProviderBase | null = null;
  if (parsed.data.accountType === 'PROVIDER') {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    if (!checkRateLimit(`register-base:${ip}`, { limit: 10, windowMs: 60_000 }).ok) {
      return NextResponse.json(
        { error: 'Слишком часто, попробуйте через минуту' },
        { status: 429 },
      );
    }
    const resolved = await resolveProviderBase(body ?? {});
    if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: 400 });
    base = resolved.value;
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);

  // Aggregator: a provider signs up together with its company, which then
  // publishes its fleet and answers customers' orders.
  const data = parsed.data;
  const user = await prisma.$transaction(async (tx) => {
    if (data.accountType === 'PROVIDER') {
      const company = await tx.company.create({
        data: { name: data.companyName, isProvider: true, phone: data.phone, ...base },
      });
      return tx.user.create({
        data: {
          name: data.name,
          email: data.email,
          phone: data.phone,
          passwordHash,
          role: 'PROVIDER_ADMIN',
          companyId: company.id,
        },
      });
    }
    return tx.user.create({
      data: {
        name: data.name,
        email: data.email,
        phone: data.phone,
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
