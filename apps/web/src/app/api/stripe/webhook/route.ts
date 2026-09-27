import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { prisma, type Prisma } from '@specai/database';
import { getStripe, getStripeWebhookSecret } from '@/lib/stripe';
import { sendEmail } from '@/lib/email';
import { paymentReceived } from '@/lib/emailTemplates';

// Signature verification needs the raw request body, which is only reliably
// available in the Node.js runtime.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function paymentIntentId(session: Stripe.Checkout.Session): string | null {
  return typeof session.payment_intent === 'string'
    ? session.payment_intent
    : (session.payment_intent?.id ?? null);
}

type PaidNotification = {
  bookingId: string;
  equipmentName: string;
  amount: Prisma.Decimal;
  currency: string;
  customerEmail: string;
  providerEmails: string[];
};

async function notifyPaymentReceived(info: PaidNotification) {
  try {
    await sendEmail({
      to: info.customerEmail,
      ...paymentReceived({
        bookingId: info.bookingId,
        equipmentName: info.equipmentName,
        amount: info.amount,
        currency: info.currency,
        recipient: 'customer',
      }),
    });
    if (info.providerEmails.length > 0) {
      await sendEmail({
        to: info.providerEmails,
        ...paymentReceived({
          bookingId: info.bookingId,
          equipmentName: info.equipmentName,
          amount: info.amount,
          currency: info.currency,
          recipient: 'provider',
        }),
      });
    }
  } catch (error) {
    console.error('[email] paymentReceived failed', error);
  }
}

async function markPaid(session: Stripe.Checkout.Session) {
  const notification = await prisma.$transaction(async (tx): Promise<PaidNotification | null> => {
    const payment = await tx.payment.findFirst({
      where: {
        OR: [
          { stripeCheckoutSessionId: session.id },
          ...(session.metadata?.paymentId ? [{ id: session.metadata.paymentId }] : []),
        ],
      },
      include: {
        booking: {
          select: {
            status: true,
            customer: { select: { email: true } },
            equipment: {
              select: {
                name: true,
                company: {
                  select: {
                    users: { where: { role: 'PROVIDER_ADMIN' }, select: { email: true } },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!payment) {
      console.warn(`Stripe webhook: no Payment for checkout session ${session.id}`);
      return null;
    }
    // Idempotent and race-safe: Stripe may deliver the same event more than
    // once, possibly concurrently. Only the delivery that flips PENDING -> PAID
    // (count === 1) confirms the booking and sends the emails.
    const { count } = await tx.payment.updateMany({
      where: { id: payment.id, status: 'PENDING' },
      data: {
        status: 'PAID',
        stripeCheckoutSessionId: session.id,
        stripePaymentIntentId: paymentIntentId(session),
      },
    });
    if (count !== 1) {
      return null;
    }

    if (payment.booking.status === 'CANCELLED') {
      // Money arrived for a booking that was cancelled in the meantime. Keep the
      // booking cancelled, do not notify anyone as "confirmed" — a refund is needed.
      console.error(
        `Stripe webhook: payment ${payment.id} (checkout session ${session.id}) ` +
          `received for CANCELLED booking ${payment.bookingId} — manual refund required`,
      );
      return null;
    }

    await tx.booking.update({
      where: { id: payment.bookingId },
      data: {
        depositPaid: true,
        // Only a PENDING booking is auto-confirmed; others keep their status.
        ...(payment.booking.status === 'PENDING' ? { status: 'CONFIRMED' } : {}),
      },
    });

    return {
      bookingId: payment.bookingId,
      equipmentName: payment.booking.equipment.name,
      amount: payment.amount,
      currency: payment.currency,
      customerEmail: payment.booking.customer.email,
      providerEmails: payment.booking.equipment.company.users.map((user) => user.email),
    };
  });

  // Emails go out only after the transaction committed; failures are logged, not thrown.
  if (notification) {
    await notifyPaymentReceived(notification);
  }
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
