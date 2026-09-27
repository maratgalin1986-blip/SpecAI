import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { getRequestUser } from '@/lib/requestUser';
import { getAppUrl, getStripe } from '@/lib/stripe';
import { decideCheckout, isPayableBookingStatus } from '@/lib/checkoutSession';
import { toStripeAmount } from '@/lib/stripeAmount';

export const runtime = 'nodejs';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const currentUser = await getRequestUser(request);
  if (!currentUser) {
    return NextResponse.json({ error: 'Необходимо войти в аккаунт' }, { status: 401 });
  }

  const booking = await prisma.booking.findUnique({
    where: { id: params.id },
    include: { equipment: true, payment: true },
  });
  if (!booking) {
    return NextResponse.json({ error: 'Бронирование не найдено' }, { status: 404 });
  }
  if (booking.customerId !== currentUser.id) {
    return NextResponse.json({ error: 'Нет прав на оплату этого бронирования' }, { status: 403 });
  }
  if (!isPayableBookingStatus(booking.status)) {
    return NextResponse.json(
      {
        error:
          'Оплатить можно только бронирование в статусе «ожидает подтверждения» или «подтверждено»',
      },
      { status: 409 },
    );
  }
  if (booking.depositPaid || booking.payment?.status === 'PAID') {
    return NextResponse.json({ error: 'Бронирование уже оплачено' }, { status: 409 });
  }

  const stripe = getStripe();

  // If a Checkout Session already exists for this booking, decide whether to
  // reuse it, close it, or refuse — never leave two payable sessions alive.
  let expireSessionId: string | null = null;
  if (booking.payment?.status === 'PENDING' && booking.payment.stripeCheckoutSessionId) {
    let existing;
    try {
      existing = await stripe.checkout.sessions.retrieve(booking.payment.stripeCheckoutSessionId);
    } catch (error) {
      console.error('Stripe checkout session retrieve failed', error);
      return NextResponse.json(
        { error: 'Не удалось проверить существующую платёжную сессию' },
        { status: 502 },
      );
    }
    const decision = decideCheckout({
      id: existing.id,
      status: existing.status,
      url: existing.url,
    });
    if (decision.action === 'reuse') {
      return NextResponse.json({ url: decision.url });
    }
    if (decision.action === 'already_paid') {
      // The webhook will (or already did) flip the Payment to PAID.
      return NextResponse.json({ error: 'Бронирование уже оплачено' }, { status: 409 });
    }
    expireSessionId = decision.expireSessionId;
  }

  if (expireSessionId) {
    try {
      await stripe.checkout.sessions.expire(expireSessionId);
    } catch (error) {
      console.error('Stripe checkout session expire failed', error);
      return NextResponse.json(
        { error: 'Не удалось закрыть предыдущую платёжную сессию' },
        { status: 502 },
      );
    }
  }

  // Reuse the existing Payment row if one exists (the previous Checkout Session
  // expired or was closed above); otherwise create it.
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
    checkout = await stripe.checkout.sessions.create({
      mode: 'payment',
      client_reference_id: booking.id,
      customer_email: currentUser.email ?? undefined,
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
