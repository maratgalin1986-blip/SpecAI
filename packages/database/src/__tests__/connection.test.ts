import { describe, expect, it } from 'vitest';
import { isYandexDatabaseUrl, withYandexTls } from '../connection';

const YANDEX = 'postgresql://user:p%40ss@rc1a-abc123.mdb.yandexcloud.net:6432/specai';

describe('isYandexDatabaseUrl', () => {
  it('recognises Yandex Managed PostgreSQL hosts only', () => {
    expect(isYandexDatabaseUrl(YANDEX)).toBe(true);
    expect(isYandexDatabaseUrl('postgresql://u:p@ep-x.eu.aws.neon.tech/db')).toBe(false);
    expect(isYandexDatabaseUrl('not a url')).toBe(false);
    expect(isYandexDatabaseUrl(undefined)).toBe(false);
  });
});

describe('withYandexTls', () => {
  it('adds sslmode and the CA path for Yandex hosts', () => {
    const url = new URL(withYandexTls(`${YANDEX}?schema=public`, '/tmp/ca.pem'));
    expect(url.searchParams.get('sslmode')).toBe('require');
    expect(url.searchParams.get('sslcert')).toBe('/tmp/ca.pem');
    // Without an explicit `strict` Prisma accepts any server certificate.
    expect(url.searchParams.get('sslaccept')).toBe('strict');
    expect(url.searchParams.get('schema')).toBe('public');
    expect(url.password).toBe('p%40ss');
  });

  it('falls back to encrypted-but-unverified TLS without a CA', () => {
    const url = new URL(withYandexTls(YANDEX, null));
    expect(url.searchParams.get('sslmode')).toBe('require');
    expect(url.searchParams.get('sslaccept')).toBe('accept_invalid_certs');
  });

  it('leaves other databases and explicit TLS settings untouched', () => {
    const neon = 'postgresql://u:p@ep-x.eu.aws.neon.tech/db?sslmode=require';
    expect(withYandexTls(neon, '/tmp/ca.pem')).toBe(neon);
    const explicit = `${YANDEX}?sslmode=verify-full&sslcert=/etc/ca.pem`;
    expect(withYandexTls(explicit, '/tmp/ca.pem')).toBe(explicit);
  });
});
