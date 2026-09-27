import Stripe from 'stripe';

let client: Stripe | null = null;

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
