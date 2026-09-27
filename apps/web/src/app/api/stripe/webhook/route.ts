import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { prisma } from '@specai/database';
import { getStripe, getStripeWebhookSecret } from '@/lib/stripe';

// Signature verification needs the raw request body, which is only reliably
// available in the Node.js runtime.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function paymentIntentId(session: Stripe.Checkout.Session): string | null {
  return typeof session.payment_intent === 'string'
    ? session.payment_intent
    : (session.payment_intent?.id ?? null);
}

async function markPaid(session: Stripe.Checkout.Session) {
  await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findFirst({
      where: {
        OR: [
          { stripeCheckoutSessionId: session.id },
          ...(session.metadata?.paymentId ? [{ id: session.metadata.paymentId }] : []),
        ],
      },
      include: { booking: { select: { status: true } } },
    });
    if (!payment) {
      console.warn(`Stripe webhook: no Payment for checkout session ${session.id}`);
      return;
    }
    // Idempotent: Stripe may deliver the same event more than once.
    if (payment.status === 'PAID') {
      return;
    }

    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: 'PAID',
        stripeCheckoutSessionId: session.id,
        stripePaymentIntentId: paymentIntentId(session),
      },
    });
    await tx.booking.update({
      where: { id: payment.bookingId },
      data: {
        depositPaid: true,
        // Only a PENDING booking is auto-confirmed; a cancelled one stays as is.
        ...(payment.booking.status === 'PENDING' ? { status: 'CONFIRMED' } : {}),
      },
    });
  });
}

async function markFailed(where: {
  stripeCheckoutSessionId?: string;
  stripePaymentIntentId?: string;
}) {
  await prisma.payment.updateMany({
    where: { ...where, status: 'PENDING' },
    data: { status: 'FAILED' },
  });
}

export async function POST(request: NextRequest) {
  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
  }

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, getStripeWebhookSecret());
  } catch (error) {
    console.error('Stripe webhook signature verification failed', error);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      // Delayed payment methods report `unpaid` here and fire
      // `checkout.session.async_payment_succeeded` later.
      if (session.payment_status === 'paid') {
        await markPaid(session);
      }
      break;
    }
    case 'checkout.session.async_payment_succeeded':
      await markPaid(event.data.object);
      break;
    case 'checkout.session.expired':
    case 'checkout.session.async_payment_failed':
      await markFailed({ stripeCheckoutSessionId: event.data.object.id });
      break;
    case 'payment_intent.payment_failed':
      await markFailed({ stripePaymentIntentId: event.data.object.id });
      break;
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
