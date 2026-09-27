import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { prisma } from '@specai/database';
import { authOptions } from '@/lib/auth';
import { sendEmail } from '@/lib/email';
import { bookingStatusChanged } from '@/lib/emailTemplates';

const updateSchema = z.object({
  status: z.enum(['CONFIRMED', 'ACTIVE', 'COMPLETED', 'CANCELLED']),
});

const PROVIDER_ALLOWED_TRANSITIONS: Record<string, string[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['ACTIVE', 'CANCELLED'],
  ACTIVE: ['COMPLETED'],
};

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Необходимо войти в аккаунт' }, { status: 401 });
  }

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const booking = await prisma.booking.findUnique({
    where: { id: params.id },
    include: { equipment: true, customer: { select: { email: true } } },
  });
  if (!booking) {
    return NextResponse.json({ error: 'Бронирование не найдено' }, { status: 404 });
  }

  const isOwningProvider =
    session.user.role === 'PROVIDER_ADMIN' &&
    session.user.companyId === booking.equipment.companyId;
  const isCustomer = booking.customerId === session.user.id;

  if (isOwningProvider) {
    const allowed = PROVIDER_ALLOWED_TRANSITIONS[booking.status] ?? [];
    if (!allowed.includes(parsed.data.status)) {
      return NextResponse.json(
        {
          error: `Нельзя перевести бронирование из статуса «${booking.status}» в «${parsed.data.status}»`,
        },
        { status: 409 },
      );
    }
  } else if (isCustomer) {
    if (parsed.data.status !== 'CANCELLED' || !['PENDING', 'CONFIRMED'].includes(booking.status)) {
      return NextResponse.json(
        {
          error:
            'Клиент может отменить только бронирование в статусе «ожидает подтверждения» или «подтверждена»',
        },
        {
          status: 409,
        },
      );
    }
  } else {
    return NextResponse.json(
      { error: 'Нет прав на изменение этого бронирования' },
      { status: 403 },
    );
  }

  const updated = await prisma.booking.update({
    where: { id: params.id },
    data: { status: parsed.data.status },
  });

  if (updated.status !== booking.status) {
    try {
      const template = bookingStatusChanged({
        bookingId: updated.id,
        equipmentName: booking.equipment.name,
        status: updated.status,
        startDate: updated.startDate,
        endDate: updated.endDate,
      });
      await sendEmail({ to: booking.customer.email, ...template });
    } catch (error) {
      console.error('[email] bookingStatusChanged failed', error);
    }
  }

  return NextResponse.json({ booking: updated });
}
