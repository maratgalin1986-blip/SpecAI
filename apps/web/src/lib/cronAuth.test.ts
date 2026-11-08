import { afterEach, describe, expect, it, vi } from 'vitest';
import { cronAllowed } from './cronAuth';

const request = (headers: Record<string, string>) => ({ headers: new Headers(headers) });

describe('cronAllowed', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('lets in only the bearer secret', () => {
    vi.stubEnv('CRON_SECRET', 's3cret');
    expect(cronAllowed(request({ authorization: 'Bearer s3cret' }))).toBe(true);
    expect(cronAllowed(request({ authorization: 'Bearer other' }))).toBe(false);
    expect(cronAllowed(request({ authorization: 'Bearer s3cret1' }))).toBe(false);
    expect(cronAllowed(request({}))).toBe(false);
  });

  it('no longer trusts the vercel-cron user agent', () => {
    vi.stubEnv('CRON_SECRET', 's3cret');
    expect(cronAllowed(request({ 'user-agent': 'vercel-cron/1.0' }))).toBe(false);
  });

  it('allows nothing when the secret is not set', () => {
    vi.stubEnv('CRON_SECRET', '');
    expect(cronAllowed(request({ 'user-agent': 'vercel-cron/1.0' }))).toBe(false);
    expect(cronAllowed(request({ authorization: 'Bearer ' }))).toBe(false);
  });
});
