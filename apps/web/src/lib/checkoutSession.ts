/**
 * Pure decision logic for reusing an existing Stripe Checkout Session.
 *
 * A Payment row may already point at a Checkout Session (the customer clicked
 * "Pay" before and closed the page). Instead of blindly creating a second
 * session — which would leave two payable links alive for 24 h — we look at
 * the existing session's status and decide what the checkout route should do.
 */

export type ExistingCheckoutSession = {
  id: string;
  /** Stripe.Checkout.Session['status']: 'open' | 'complete' | 'expired' | null */
  status: string | null;
  url: string | null;
};

export type CheckoutDecision =
  /** The open session is still payable: hand its URL back to the customer. */
  | { action: 'reuse'; url: string }
  /** Create a fresh session; expire `expireSessionId` first if it is set. */
  | { action: 'create'; expireSessionId: string | null }
  /** The session was already completed: the booking is paid, refuse with 409. */
  | { action: 'already_paid' };

export function decideCheckout(existing: ExistingCheckoutSession | null): CheckoutDecision {
  if (!existing) {
    return { action: 'create', expireSessionId: null };
  }
  if (existing.status === 'complete') {
    return { action: 'already_paid' };
  }
  if (existing.status === 'open') {
    if (existing.url) {
      return { action: 'reuse', url: existing.url };
    }
    // Open but without a URL (should not happen for hosted Checkout): close it
    // so the customer cannot end up with two live sessions.
    return { action: 'create', expireSessionId: existing.id };
  }
  // 'expired' (or unknown) — nothing to close, just start over.
  return { action: 'create', expireSessionId: null };
}
