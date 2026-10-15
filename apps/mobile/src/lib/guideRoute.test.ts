import { describe, expect, it } from 'vitest';
import { guideAppRoute } from './guideRoute';

describe('guideAppRoute', () => {
  it('sends the provider to «Мои заказы» for bookings', () => {
    expect(guideAppRoute({ href: '/provider#bookings', app: '/(tabs)/provider' })).toBe(
      '/(tabs)/jobs',
    );
  });

  it('keeps the «Техника» tab for fleet steps', () => {
    expect(guideAppRoute({ href: '/provider#base', app: '/(tabs)/provider' })).toBe(
      '/(tabs)/provider',
    );
  });

  it('sends the customer to the bookings view of «Заказы»', () => {
    expect(guideAppRoute({ href: '/dashboard#bookings', app: '/(tabs)/bookings' })).toBe(
      '/(tabs)/orders?view=bookings',
    );
  });

  it('passes other routes through and copes with no link', () => {
    expect(guideAppRoute({ href: '/orders', app: '/orders/new' })).toBe('/orders/new');
    expect(guideAppRoute({ href: '/orders' })).toBeNull();
    expect(guideAppRoute(undefined)).toBeNull();
  });
});
