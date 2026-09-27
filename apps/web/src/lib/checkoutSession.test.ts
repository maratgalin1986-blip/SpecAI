import { describe, expect, it } from 'vitest';
import { decideCheckout } from './checkoutSession';

describe('decideCheckout', () => {
  it('creates a new session when there is no existing one', () => {
    expect(decideCheckout(null)).toEqual({ action: 'create', expireSessionId: null });
  });

  it('reuses an open session that still has a URL', () => {
    expect(
      decideCheckout({ id: 'cs_1', status: 'open', url: 'https://checkout.stripe.com/c/cs_1' }),
    ).toEqual({ action: 'reuse', url: 'https://checkout.stripe.com/c/cs_1' });
  });

  it('expires an open session without a URL before creating a new one', () => {
    expect(decideCheckout({ id: 'cs_2', status: 'open', url: null })).toEqual({
      action: 'create',
      expireSessionId: 'cs_2',
    });
  });

  it('creates a new session when the previous one expired', () => {
    expect(decideCheckout({ id: 'cs_3', status: 'expired', url: null })).toEqual({
      action: 'create',
      expireSessionId: null,
    });
  });

  it('refuses when the previous session was already completed', () => {
    expect(decideCheckout({ id: 'cs_4', status: 'complete', url: null })).toEqual({
      action: 'already_paid',
    });
  });
});
