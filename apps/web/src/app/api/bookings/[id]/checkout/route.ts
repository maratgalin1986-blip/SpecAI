import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@specai/database';
import { authOptions } from '@/lib/auth';
import { getAppUrl, getStripe } from '@/lib/stripe';
import { toStripeAmount } from '@/lib/stripeAmount';

export const runtime = 'nodejs';

export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Необходимо войти в аккаунт' }, { status: 401 });
  }

  const booking = await prisma.booking.findUnique({
    where: { id: params.id },
    include: { equipment: true, payment: true },
  });
  if (!booking) {
    return NextResponse.json({ error: 'Бронирование не найдено' }, { status: 404 });
  }
  if (booking.customerId !== session.user.id) {
    return NextResponse.json({ error: 'Нет прав на оплату этого бронирования' }, { status: 403 });
  }
  if (booking.status !== 'PENDING') {
    return NextResponse.json(
      { error: 'Оплатить можно только бронирование, ожидающее подтверждения' },
      { status: 409 },
    );
  }
  if (booking.depositPaid || booking.payment?.status === 'PAID') {
    return NextResponse.json({ error: 'Бронирование уже оплачено' }, { status: 409 });
  }

  // Reuse the existing Payment row if one exists (e.g. the customer closed the
  // previous Checkout page or it expired); otherwise create it.
  const payment = booking.payment
    ? await prisma.payment.update({
        where: { id: booking.payment.id },
        data: {
          status: 'PENDING',
          amount: booking.totalPrice,
          currency: booking.currency,
          stripeCheckoutSessionId: null,
          stripePaymentIntentId: null,
        },
      })
    : await prisma.payment.create({
        data: {
          bookingId: booking.id,
          amount: booking.totalPrice,
          currency: booking.currency,
        },
      });

  const appUrl = getAppUrl();
  const dates = `${booking.startDate.toLocaleDateString('ru-RU')} – ${booking.endDate.toLocaleDateString('ru-RU')}`;

  let checkout;
  try {
    checkout = await getStripe().checkout.sessions.create({
      mode: 'payment',
      client_reference_id: booking.id,
      customer_email: session.user.email ?? undefined,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: booking.currency.toLowerCase(),
            unit_amount: toStripeAmount(booking.totalPrice, booking.currency),
            product_data: {
              name: `Аренда: ${booking.equipment.name}`,
              description: dates,
            },
          },
        },
      ],
      metadata: { bookingId: booking.id, paymentId: payment.id },
      payment_intent_data: { metadata: { bookingId: booking.id, paymentId: payment.id } },
      success_url: `${appUrl}/dashboard?payment=success&booking=${booking.id}`,
      cancel_url: `${appUrl}/dashboard?payment=cancelled&booking=${booking.id}`,
    });
  } catch (error) {
    console.error('Stripe checkout session creation failed', error);
    return NextResponse.json({ error: 'Не удалось создать платёжную сессию' }, { status: 502 });
  }

  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      stripeCheckoutSessionId: checkout.id,
      stripePaymentIntentId:
        typeof checkout.payment_intent === 'string'
          ? checkout.payment_intent
          : (checkout.payment_intent?.id ?? null),
    },
  });

  if (!checkout.url) {
    return NextResponse.json({ error: 'Stripe не вернул ссылку на оплату' }, { status: 502 });
  }

  return NextResponse.json({ url: checkout.url });
}
