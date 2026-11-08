import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { HOUSE_COMPANY_ID, prisma } from '@specai/database';
import { isAdminRequest } from '@/lib/admin';
import { linkOwnerDecision, roleLabel } from '@/lib/linkOwner';

const schema = z.object({
  email: z.string().trim().toLowerCase().email(),
  /** Without it the route only shows whose account it is (nothing changes). */
  confirm: z.boolean().optional(),
});

// Makes a registered user the manager (PROVIDER_ADMIN) of СпецПласт16's own
// fleet, so prices and availability can be edited in the provider cabinet.
// Two steps: a preview of the account, then {confirm: true} (lib/linkOwner.ts).
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
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      companyId: true,
      company: { select: { name: true } },
      _count: { select: { orders: true } },
    },
  });
  if (!user) {
    return NextResponse.json(
      { error: 'Пользователь не найден — сначала зарегистрируйтесь на сайте' },
      { status: 404 },
    );
  }
  const decision = linkOwnerDecision(
    {
      role: user.role,
      companyId: user.companyId,
      companyName: user.company?.name,
      orders: user._count.orders,
    },
    HOUSE_COMPANY_ID,
  );
  if (decision.kind === 'refuse') {
    return NextResponse.json({ error: decision.error }, { status: 409 });
  }
  if (decision.kind === 'already') {
    return NextResponse.json({ ok: true, already: true, company: company.name });
  }
  if (!parsed.data.confirm) {
    return NextResponse.json({
      preview: {
        name: user.name,
        email: user.email,
        role: roleLabel(user.role),
        company: user.company?.name ?? null,
        warnings: decision.warnings,
      },
      company: company.name,
    });
  }
  // Only if nothing changed since the preview (still no other company).
  const updated = await prisma.user.updateMany({
    where: {
      id: user.id,
      OR: [{ companyId: null }, { companyId: HOUSE_COMPANY_ID }],
      role: { not: 'PLATFORM_ADMIN' },
    },
    data: { companyId: HOUSE_COMPANY_ID, role: 'PROVIDER_ADMIN' },
  });
  if (updated.count === 0) {
    return NextResponse.json(
      { error: 'Аккаунт изменился — проверьте его ещё раз' },
      { status: 409 },
    );
  }
  return NextResponse.json({ ok: true, company: company.name });
}
