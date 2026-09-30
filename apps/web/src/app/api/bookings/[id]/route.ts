import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@specai/database';
import { getRequestUser } from '@/lib/requestUser';
import { sendEmail } from '@/lib/email';
import { bookingStatusChanged } from '@/lib/emailTemplates';
import { getStripe } from '@/lib/stripe';
import { isFleetManager } from '@/lib/fleet';

const updateSchema = z.object({
  status: z.enum(['CONFIRMED', 'ACTIVE', 'COMPLETED', 'CANCELLED']),
});

const PROVIDER_ALLOWED_TRANSITIONS: Record<string, string[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['ACTIVE', 'CANCELLED'],
  ACTIVE: ['COMPLETED'],
};

/**
 * A cancelled booking must not stay payable: expire the open Checkout Session
 * and mark the Payment FAILED. The Payment is flipped only after Stripe
 * confirmed the expiry — if `expire` fails (e.g. the customer just completed
 * the session), the row stays PENDING so the webhook can still reconcile it.
 * Any Stripe error is logged and never blocks the cancellation itself.
 */
async function closePendingCheckout(
  payment: { id: string; status: string; stripeCheckoutSessionId: string | null } | null,
) {
  if (!payment || payment.status !== 'PENDING' || !payment.stripeCheckoutSessionId) {
    return;
  }
  try {
    await getStripe().checkout.sessions.expire(payment.stripeCheckoutSessionId);
  } catch (error) {
    console.error(
      `[stripe] failed to expire checkout session ${payment.stripeCheckoutSessionId} on cancel`,
      error,
    );
    return;
  }
  try {
    await prisma.payment.updateMany({
      where: { id: payment.id, status: 'PENDING' },
      data: { status: 'FAILED' },
    });
  } catch (error) {
    console.error(`[stripe] failed to mark payment ${payment.id} FAILED on cancel`, error);
  }
}

/**
 * A cancelled booking whose deposit was already PAID needs a refund. Refunds
 * are done manually in the Stripe Dashboard; the Payment is marked
 * refundRequired so it does not silently stay PAID.
 */
async function flagPaidPaymentForRefund(
  bookingId: string,
  payment: { id: string; status: string } | null,
) {
  if (!payment || payment.status !== 'PAID') {
    return;
  }
  try {
    await prisma.payment.updateMany({
      where: { id: payment.id, status: 'PAID' },
      data: { refundRequired: true },
    });
    console.error(
      `[stripe] booking ${bookingId} cancelled after payment ${payment.id} was PAID — manual refund required`,
    );
  } catch (error) {
    console.error(
      `[stripe] failed to flag payment ${payment.id} for refund after cancelling booking ${bookingId}`,
      error,
    );
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const currentUser = await getRequestUser(request);
  if (!currentUser) {
    return NextResponse.json({ error: 'Необходимо войти в аккаунт' }, { status: 401 });
  }

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const booking = await prisma.booking.findUnique({
    where: { id: params.id },
    include: { equipment: true, customer: { select: { email: true } }, payment: true },
  });
  if (!booking) {
    return NextResponse.json({ error: 'Бронирование не найдено' }, { status: 404 });
  }

  const isOwningProvider =
    isFleetManager(currentUser) && currentUser.companyId === booking.equipment.companyId;
  const isCustomer = booking.customerId === currentUser.id;

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

  if (updated.status === 'CANCELLED' && booking.status !== 'CANCELLED') {
    await closePendingCheckout(booking.payment);
    await flagPaidPaymentForRefund(updated.id, booking.payment);
  }

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
