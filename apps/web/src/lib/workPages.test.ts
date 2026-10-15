import { describe, expect, it } from 'vitest';
import { hidesContactBar, isCabinetPage } from './workPages';

describe('work pages', () => {
  it('knows the cabinets, an order page and the admin', () => {
    for (const path of ['/dashboard', '/provider', '/admin', '/admin/funnel', '/orders/abc']) {
      expect(isCabinetPage(path)).toBe(true);
    }
    for (const path of ['/', '/orders', '/orders/', '/providers', '/equipment/x', null]) {
      expect(isCabinetPage(path)).toBe(false);
    }
  });

  it('hides the contact bar on cabinets, sign-in forms and /stroyka', () => {
    for (const path of ['/provider', '/orders/abc', '/register', '/login', '/stroyka']) {
      expect(hidesContactBar(path)).toBe(true);
    }
    for (const path of ['/', '/orders', '/equipment/x', '/arenda/kran']) {
      expect(hidesContactBar(path)).toBe(false);
    }
  });
});
