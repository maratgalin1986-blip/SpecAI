import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@specai/database';
import { registerSchema } from '@specai/shared';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = registerSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
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

  return NextResponse.json({ id: user.id, email: user.email }, { status: 201 });
}
