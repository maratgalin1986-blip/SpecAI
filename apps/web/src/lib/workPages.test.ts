import { describe, expect, it } from 'vitest';
import { DOCUMENT_PAGES } from './sound';
import { hidesContactBar, isCabinetPage } from './workPages';

describe('document pages', () => {
  it('cover every legal page, so none of them gets the sound director', () => {
    for (const path of [
      '/privacy',
      '/pravila',
      '/pravila/',
      '/soglasie',
      '/soglasie-rasprostranenie',
      '/credits',
    ]) {
      expect(DOCUMENT_PAGES.test(path)).toBe(true);
    }
    for (const path of ['/', '/orders', '/providers', '/equipment/x', '/soglasieX']) {
      expect(DOCUMENT_PAGES.test(path)).toBe(false);
    }
  });
});

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
