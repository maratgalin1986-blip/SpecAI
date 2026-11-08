import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getRequestUser = vi.fn();
const findUnique = vi.fn();
const update = vi.fn();
vi.mock('@specai/database', () => ({ prisma: { user: { findUnique, update } } }));
vi.mock('@/lib/requestUser', () => ({ getRequestUser }));

const { GET, PATCH } = await import('./route');

function patch(body: unknown) {
  return PATCH(
    new NextRequest('http://localhost/api/account/news', {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  );
}

describe('/api/account/news', () => {
  beforeEach(() => {
    for (const mock of [getRequestUser, findUnique, update]) mock.mockReset();
    getRequestUser.mockResolvedValue({ id: 'u1', role: 'CUSTOMER', companyId: null });
    update.mockResolvedValue({ emailVerified: new Date() });
  });

  it('asks to sign in first', async () => {
    getRequestUser.mockResolvedValue(null);
    expect((await GET(new NextRequest('http://localhost/api/account/news'))).status).toBe(401);
    expect((await patch({ subscribed: true })).status).toBe(401);
  });

  it('shows the state of the own account', async () => {
    findUnique.mockResolvedValue({
      newsConsentAt: new Date(),
      newsUnsubscribedAt: null,
      emailVerified: null,
    });
    const response = await GET(new NextRequest('http://localhost/api/account/news'));
    expect(await response.json()).toEqual({
      available: true,
      subscribed: true,
      emailVerified: false,
    });
    expect(findUnique.mock.calls[0]?.[0].where).toEqual({ id: 'u1' });
  });

  it('subscribes and unsubscribes the own account only', async () => {
    expect((await patch({ subscribed: true })).status).toBe(200);
    expect(update.mock.calls[0]?.[0].where).toEqual({ id: 'u1' });
    expect(update.mock.calls[0]?.[0].data.newsConsentAt).toBeInstanceOf(Date);
    expect(update.mock.calls[0]?.[0].data.newsUnsubscribedAt).toBeNull();

    expect((await patch({ subscribed: false })).status).toBe(200);
    expect(update.mock.calls[1]?.[0].data.newsConsentAt).toBeNull();
  });

  it('accepts only a boolean', async () => {
    expect((await patch({ subscribed: 'yes' })).status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it('is not for machinists', async () => {
    getRequestUser.mockResolvedValue({ id: 'u2', role: 'PROVIDER_OPERATOR', companyId: 'c1' });
    expect((await patch({ subscribed: true })).status).toBe(403);
    const response = await GET(new NextRequest('http://localhost/api/account/news'));
    expect(await response.json()).toEqual({
      available: false,
      subscribed: false,
      emailVerified: false,
    });
    expect(update).not.toHaveBeenCalled();
  });
});
