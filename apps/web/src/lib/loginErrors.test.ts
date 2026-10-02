import { describe, expect, it } from 'vitest';
import {
  LOGIN_RATE_LIMITED,
  LOGIN_UNAVAILABLE,
  LoginError,
  RATE_LIMITED_MESSAGE,
  UNAVAILABLE_MESSAGE,
  WRONG_CREDENTIALS_MESSAGE,
  clientIpFrom,
  homeForRole,
  loginErrorMessage,
  loginFailure,
} from './loginErrors';

describe('login errors', () => {
  it('maps failures to HTTP statuses', () => {
    expect(loginFailure(new LoginError(LOGIN_RATE_LIMITED, 60))).toEqual({
      status: 429,
      message: RATE_LIMITED_MESSAGE,
    });
    expect(loginFailure(new LoginError(LOGIN_UNAVAILABLE))).toEqual({
      status: 503,
      message: UNAVAILABLE_MESSAGE,
    });
    expect(loginFailure(null).status).toBe(401);
  });

  it('keeps the code as the message for next-auth', () => {
    expect(new LoginError(LOGIN_UNAVAILABLE).message).toBe(LOGIN_UNAVAILABLE);
  });

  it('explains next-auth errors on the login page', () => {
    expect(loginErrorMessage('CredentialsSignin')).toBe(WRONG_CREDENTIALS_MESSAGE);
    expect(loginErrorMessage(LOGIN_RATE_LIMITED)).toBe(RATE_LIMITED_MESSAGE);
    expect(loginErrorMessage(LOGIN_UNAVAILABLE)).toBe(UNAVAILABLE_MESSAGE);
    // An unexpected crash is not "wrong password".
    expect(loginErrorMessage('Error')).toBe(UNAVAILABLE_MESSAGE);
  });

  it('reads the client ip', () => {
    const headers: Record<string, string> = { 'x-forwarded-for': '1.2.3.4, 10.0.0.1' };
    expect(clientIpFrom((name) => headers[name])).toBe('1.2.3.4');
    expect(clientIpFrom(() => undefined)).toBe('unknown');
  });

  it('sends providers to their cabinet', () => {
    expect(homeForRole('PROVIDER_ADMIN')).toBe('/provider');
    expect(homeForRole('CUSTOMER')).toBe('/dashboard');
    expect(homeForRole(undefined)).toBe('/dashboard');
  });
});
