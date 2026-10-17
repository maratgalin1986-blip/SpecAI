import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const updateMany = vi.fn();
vi.mock('@specai/database', () => ({ prisma: { user: { updateMany } } }));

process.env.NEXTAUTH_SECRET = 'test-secret';
const { GET, POST } = await import('./route');
const { unsubscribeToken } = await import('@/lib/newsletter');

let ip = 0;
function post(url: string, init: { body?: string; type?: string } = {}) {
  ip += 1;
  return POST(
    new NextRequest(url, {
      method: 'POST',
      body: init.body,
      headers: {
        'x-real-ip': `10.0.0.${ip}`,
        ...(init.type ? { 'content-type': init.type } : {}),
      },
    }),
  );
}

describe('POST /api/unsubscribe', () => {
  beforeEach(() => {
    updateMany.mockReset();
    updateMany.mockResolvedValue({ count: 1 });
  });

  it('unsubscribes by the one-click POST of a mail client (RFC 8058)', async () => {
    const token = unsubscribeToken('ckuser123') as string;
    const response = await post(`http://localhost/api/unsubscribe?t=${encodeURIComponent(token)}`, {
      body: 'List-Unsubscribe=One-Click',
      type: 'application/x-www-form-urlencoded',
    });
    expect(response.status).toBe(200);
    const call = updateMany.mock.calls[0]?.[0];
    expect(call.where.id).toBe('ckuser123');
    expect(call.data.newsConsentAt).toBeNull();
    expect(call.data.newsUnsubscribedAt).toBeInstanceOf(Date);
    // No id, e-mail or name in the answer.
    const text = JSON.stringify(await response.json());
    expect(text).toBe('{"ok":true}');
  });

  it('takes the token from the confirm page body', async () => {
    const token = unsubscribeToken('ckuser123') as string;
    const response = await post('http://localhost/api/unsubscribe', {
      body: JSON.stringify({ t: token }),
      type: 'application/json',
    });
    expect(response.status).toBe(200);
    expect(updateMany).toHaveBeenCalledTimes(1);
  });

  it('refuses a missing, forged or tampered token and changes nothing', async () => {
    const token = unsubscribeToken('ckuser123') as string;
    const forged = `${Buffer.from('ckother999').toString('base64url')}.${token.split('.')[1]}`;
    for (const bad of ['', 'nonsense', forged, `${token}x`]) {
      const response = await post(`http://localhost/api/unsubscribe?t=${encodeURIComponent(bad)}`);
      expect(response.status).toBe(400);
      expect(JSON.stringify(await response.json())).not.toContain('ckuser123');
    }
    expect(updateMany).not.toHaveBeenCalled();
  });
});

describe('GET /api/unsubscribe', () => {
  it('only leads to the confirm page (link scanners open links)', async () => {
    const response = GET(new NextRequest('http://localhost/api/unsubscribe?t=abc.def'));
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('http://localhost/unsubscribe?t=abc.def');
    expect(updateMany).not.toHaveBeenCalled();
  });
});

describe('POST /api/unsubscribe from a mail provider', () => {
  it('never rate-limits a valid link (one-click POSTs share a few server IPs)', async () => {
    updateMany.mockResolvedValue({ count: 1 });
    const token = encodeURIComponent(unsubscribeToken('ckuser123') as string);
    for (let i = 0; i < 40; i += 1) {
      const response = await POST(
        new NextRequest(`http://localhost/api/unsubscribe?t=${token}`, {
          method: 'POST',
          headers: { 'x-real-ip': '203.0.113.7' },
        }),
      );
      expect(response.status).toBe(200);
    }
  });
});
