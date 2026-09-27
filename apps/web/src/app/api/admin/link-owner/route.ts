import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { HOUSE_COMPANY_ID, prisma } from '@specai/database';
import { isAdminRequest } from '@/lib/admin';

const schema = z.object({ email: z.string().trim().toLowerCase().email() });

// Makes a registered user the manager (PROVIDER_ADMIN) of СпецПласт16's own
// fleet, so prices and availability can be edited in the provider cabinet.
export async function POST(request: NextRequest) {
  if (!isAdminRequest()) {
    return NextResponse.json({ error: 'Нет доступа' }, { status: 401 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Укажите e-mail' }, { status: 400 });
  }
  const company = await prisma.company.findUnique({ where: { id: HOUSE_COMPANY_ID } });
  if (!company) {
    return NextResponse.json({ error: 'Парк компании ещё не создан' }, { status: 404 });
  }
  const user = await prisma.user.findFirst({
    where: { email: { equals: parsed.data.email, mode: 'insensitive' } },
  });
  if (!user) {
    return NextResponse.json(
      { error: 'Пользователь не найден — сначала зарегистрируйтесь на сайте' },
      { status: 404 },
    );
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { companyId: HOUSE_COMPANY_ID, role: 'PROVIDER_ADMIN' },
  });
  return NextResponse.json({ ok: true, company: company.name });
}
