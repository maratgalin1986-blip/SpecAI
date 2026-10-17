import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { becomeProviderSchema } from '@specai/shared';
import { readJson, zodErrorMessage } from '@/lib/apiInput';
import { checkRateLimit } from '@/lib/rateLimit';
import { getRequestUser } from '@/lib/requestUser';
import { resolveProviderBase } from '@/lib/providerBase';

/**
 * «Стать исполнителем» под тем же логином: заказчик создаёт компанию (с местом,
 * где стоит техника, как при регистрации исполнителя) и становится её
 * администратором. Заявки и брони заказчика остаются при нём: исполнитель
 * заказывает технику в «режиме заказчика» того же аккаунта.
 */
export async function POST(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Необходимо войти в аккаунт' }, { status: 401 });
  }
  if (user.role === 'PROVIDER_ADMIN' && user.companyId) {
    return NextResponse.json({ error: 'Вы уже исполнитель' }, { status: 409 });
  }
  if (user.role !== 'CUSTOMER') {
    return NextResponse.json(
      { error: 'Стать исполнителем может только аккаунт заказчика' },
      { status: 403 },
    );
  }
  if (!checkRateLimit(`become-provider:${user.id}`, { limit: 5, windowMs: 60_000 }).ok) {
    return NextResponse.json({ error: 'Слишком часто, попробуйте через минуту' }, { status: 429 });
  }

  const body = (await readJson(request)) as Record<string, unknown> | null;
  const parsed = becomeProviderSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });
  }
  // Исполнитель виден заказчикам на карте: без места, где стоит техника, никак.
  const base = await resolveProviderBase(body ?? {});
  if (!base.ok) {
    return NextResponse.json({ error: base.error }, { status: base.status ?? 400 });
  }

  const phone = parsed.data.phone || undefined;
  const updated = await prisma.$transaction(async (tx) => {
    // Повторное нажатие не создаёт вторую компанию: роль проверяется внутри транзакции.
    const current = await tx.user.findUnique({
      where: { id: user.id },
      select: { role: true, phone: true },
    });
    if (current?.role !== 'CUSTOMER') return null;
    const company = await tx.company.create({
      data: {
        name: parsed.data.companyName,
        isProvider: true,
        phone: phone ?? current.phone ?? null,
        ...base.value,
      },
    });
    return tx.user.update({
      where: { id: user.id },
      data: {
        role: 'PROVIDER_ADMIN',
        companyId: company.id,
        ...(phone && !current.phone ? { phone } : {}),
      },
      select: { id: true, email: true, name: true, role: true, companyId: true },
    });
  });
  if (!updated) {
    return NextResponse.json({ error: 'Вы уже исполнитель' }, { status: 409 });
  }
  return NextResponse.json({ user: updated }, { status: 201 });
}
