// Errors of the sign-in flows (site, app, /admin) that are not "wrong
// password": too many attempts and an unreachable database. Pure module, used
// on the server and in the login page.

export const LOGIN_RATE_LIMITED = 'RATE_LIMITED';
export const LOGIN_UNAVAILABLE = 'SERVICE_UNAVAILABLE';

export const WRONG_CREDENTIALS_MESSAGE = 'Неверный e-mail или пароль';
export const RATE_LIMITED_MESSAGE =
  'Слишком много попыток входа. Подождите 15 минут и попробуйте снова';
export const UNAVAILABLE_MESSAGE = 'Сервис временно недоступен, попробуйте позже';

/** Login attempts per e-mail and per IP address (per server instance). */
export const LOGIN_LIMIT_PER_EMAIL = { limit: 10, windowMs: 15 * 60_000 };
export const LOGIN_LIMIT_PER_IP = { limit: 20, windowMs: 15 * 60_000 };
/** /admin has one shared password: fewer attempts. */
export const ADMIN_LOGIN_LIMIT = { limit: 5, windowMs: 15 * 60_000 };

export class LoginError extends Error {
  constructor(
    readonly code: typeof LOGIN_RATE_LIMITED | typeof LOGIN_UNAVAILABLE,
    readonly retryAfterSec = 0,
  ) {
    // next-auth passes the message of an error thrown in `authorize` to the
    // client as `error`, so the message is the code.
    super(code);
    this.name = 'LoginError';
  }
}

/** HTTP status and text for a failed sign-in. */
export function loginFailure(error: unknown): { status: number; message: string } {
  const code = error instanceof LoginError ? error.code : error;
  if (code === LOGIN_RATE_LIMITED) return { status: 429, message: RATE_LIMITED_MESSAGE };
  if (code === LOGIN_UNAVAILABLE) return { status: 503, message: UNAVAILABLE_MESSAGE };
  return { status: 401, message: WRONG_CREDENTIALS_MESSAGE };
}

/**
 * The text for next-auth's `signIn` result error: "CredentialsSignin" means a
 * wrong e-mail or password, our codes are explained, anything else (a crash
 * on the server) is reported as a temporary failure.
 */
export function loginErrorMessage(error: string): string {
  if (error === 'CredentialsSignin') return WRONG_CREDENTIALS_MESSAGE;
  if (error === LOGIN_RATE_LIMITED) return RATE_LIMITED_MESSAGE;
  return UNAVAILABLE_MESSAGE;
}

/** First address of X-Forwarded-For, then X-Real-IP. */
export function clientIpFrom(get: (name: string) => string | null | undefined): string {
  const forwarded = get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() || get('x-real-ip') || 'unknown';
}

/** Where a user lands after signing in without a specific target page. */
export function homeForRole(role: string | null | undefined): string {
  return role === 'PROVIDER_ADMIN' ? '/provider' : '/dashboard';
}
