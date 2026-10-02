import Stripe from 'stripe';

let client: Stripe | null = null;

/**
 * Online payment is switched off: the service is free for everyone (owner's
 * decision, 2026-10). The Stripe code stays for a future commission model;
 * to bring it back, set ONLINE_PAYMENTS=on together with STRIPE_SECRET_KEY.
 */
export function isOnlinePaymentEnabled(): boolean {
  return process.env.ONLINE_PAYMENTS === 'on' && Boolean(process.env.STRIPE_SECRET_KEY);
}

// Stripe keys are read lazily so `next build` (which imports route modules)
// does not fail on machines/CI where STRIPE_* are not configured.
export function getStripe(): Stripe {
  if (client) {
    return client;
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY is not set');
  }

  client = new Stripe(secretKey, { typescript: true });
  return client;
}

export function getStripeWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not set');
  }
  return secret;
}

export function getAppUrl(): string {
  const url =
    process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL ?? 'http://localhost:3000';
  return url.replace(/\/+$/, '');
}
