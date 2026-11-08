import { describe, expect, it } from 'vitest';
import {
  CUSTOMER_MODE_HREF,
  MODE_COOKIE,
  PROVIDER_MODE_HREF,
  cabinetHref,
  cabinetMode,
  canSwitchModes,
  dashboardRedirect,
  modeCookie,
  parseMode,
  readModeCookie,
} from './cabinetMode';

const customer = { role: 'CUSTOMER', companyId: null };
const provider = { role: 'PROVIDER_ADMIN', companyId: 'c1' };
const operator = { role: 'PROVIDER_OPERATOR', companyId: 'c1' };
const admin = { role: 'PLATFORM_ADMIN', companyId: null };

describe('who can switch', () => {
  it('only a provider company admin', () => {
    expect(canSwitchModes(provider)).toBe(true);
    expect(canSwitchModes(customer)).toBe(false);
    expect(canSwitchModes(operator)).toBe(false);
    expect(canSwitchModes(admin)).toBe(false);
    expect(canSwitchModes({ role: 'PROVIDER_ADMIN', companyId: null })).toBe(false);
    expect(canSwitchModes(null)).toBe(false);
  });
});

describe('dashboardRedirect', () => {
  it('sends a provider to its own page by default', () => {
    expect(dashboardRedirect(provider)).toBe(PROVIDER_MODE_HREF);
    expect(dashboardRedirect(provider, undefined, 'provider')).toBe(PROVIDER_MODE_HREF);
    expect(dashboardRedirect(provider, 'provider', 'customer')).toBe(PROVIDER_MODE_HREF);
  });

  it('keeps a provider on /dashboard in the customer mode (address or cookie)', () => {
    expect(dashboardRedirect(provider, 'customer')).toBeNull();
    expect(dashboardRedirect(provider, undefined, 'customer')).toBeNull();
    // The address wins over the remembered choice.
    expect(dashboardRedirect(provider, 'customer', 'provider')).toBeNull();
  });

  it('ignores junk in the address and the cookie', () => {
    expect(dashboardRedirect(provider, 'admin', 'x')).toBe(PROVIDER_MODE_HREF);
    expect(dashboardRedirect(provider, ['customer'])).toBe(PROVIDER_MODE_HREF);
  });

  it('never moves customers, operators or the admin', () => {
    for (const user of [customer, operator, admin, null]) {
      expect(dashboardRedirect(user)).toBeNull();
      expect(dashboardRedirect(user, 'provider', 'provider')).toBeNull();
      expect(cabinetMode(user, 'provider')).toBe('customer');
    }
  });
});

describe('cabinetHref (the header «Кабинет»)', () => {
  it('leads a provider to the last mode', () => {
    expect(cabinetHref(provider)).toBe(PROVIDER_MODE_HREF);
    expect(cabinetHref(provider, 'provider')).toBe(PROVIDER_MODE_HREF);
    expect(cabinetHref(provider, 'customer')).toBe(CUSTOMER_MODE_HREF);
  });

  it('leads everyone else to /dashboard', () => {
    expect(cabinetHref(customer, 'provider')).toBe('/dashboard');
    expect(cabinetHref(operator)).toBe('/dashboard');
    expect(cabinetHref(admin)).toBe('/dashboard');
  });

  it('the customer-mode link keeps /dashboard from redirecting', () => {
    const url = new URL(CUSTOMER_MODE_HREF, 'https://example.test');
    expect(url.pathname).toBe('/dashboard');
    expect(dashboardRedirect(provider, url.searchParams.get('mode'))).toBeNull();
  });
});

describe('mode cookie', () => {
  it('is written for a year on the whole site and read back', () => {
    const value = modeCookie('customer');
    expect(value).toMatch(new RegExp(`^${MODE_COOKIE}=customer;`));
    expect(value).toContain('Path=/');
    expect(value).toContain('SameSite=Lax');
    expect(readModeCookie(`a=1; ${MODE_COOKIE}=customer; b=2`)).toBe('customer');
    expect(readModeCookie(`${MODE_COOKIE}=provider`)).toBe('provider');
  });

  it('reads nothing from a missing or foreign value', () => {
    expect(readModeCookie('')).toBeNull();
    expect(readModeCookie(null)).toBeNull();
    expect(readModeCookie(`${MODE_COOKIE}=admin`)).toBeNull();
    expect(readModeCookie(`x${MODE_COOKIE}=customer`)).toBeNull();
    expect(parseMode('customer')).toBe('customer');
    expect(parseMode(undefined)).toBeNull();
  });
});
