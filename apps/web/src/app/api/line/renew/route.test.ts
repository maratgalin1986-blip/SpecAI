import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const findUnique = vi.fn();
const updateMany = vi.fn();
vi.mock('@specai/database', () => ({ prisma: { linePresence: { findUnique, updateMany } } }));
vi.mock('@/lib/notifications/notifyUser', () => ({ notifyUser: vi.fn() }));

process.env.NEXTAUTH_SECRET = 'renew-test-secret';
const { POST } = await import('./route');
const { lineRenewToken } = await import('@/lib/lineRenew');

const until = new Date('2026-10-30T20:59:59.999Z');
let ip = 0;

async function post(body: unknown) {
  const response = await POST(
    new NextRequest('http://localhost/api/line/renew', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'x-forwarded-for': `10.0.0.${++ip}` },
    }),
  );
  return { status: response.status, body: await response.json() };
}

describe('POST /api/line/renew (public, signed link)', () => {
  beforeEach(() => {
    vi.useRealTimers();
    findUnique.mockReset();
    updateMany.mockReset();
    updateMany.mockResolvedValue({ count: 1 });
  });

  it('renews the signed period by 5 working days after its end, answering only the date', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-29T16:00:00Z')); // Thursday 19:00 Moscow
    findUnique.mockResolvedValue({
      id: 'p1',
      standingUntil: until,
      standingForever: false,
      timeZone: 'Europe/Moscow',
      equipmentId: 'e1',
    });
    const { status, body } = await post({ t: lineRenewToken('p1', until) });
    expect(status).toBe(200);
    expect(body).toEqual({ ok: true, already: false, until: '06.11 (пт)' });
    expect(updateMany.mock.calls[0]?.[0].data.standingUntil.toISOString()).toBe(
      '2026-11-06T20:59:59.999Z',
    );
    const json = JSON.stringify(body);
    expect(json).not.toContain('p1');
    expect(json).not.toContain('e1');
    vi.useRealTimers();
  });

  it('a second tap changes nothing', async () => {
    const renewed = new Date('2026-11-06T20:59:59.999Z');
    findUnique.mockResolvedValue({
      id: 'p1',
      standingUntil: renewed,
      standingForever: false,
      timeZone: null,
      equipmentId: 'e1',
    });
    const { status, body } = await post({ t: lineRenewToken('p1', until) });
    expect(status).toBe(200);
    expect(body.already).toBe(true);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('refuses a forged token and does not bring back a line switched off', async () => {
    expect((await post({ t: 'abc.123.def' })).status).toBe(400);
    findUnique.mockResolvedValue({
      id: 'p1',
      standingUntil: null,
      standingForever: false,
      timeZone: null,
      equipmentId: null,
    });
    expect((await post({ t: lineRenewToken('p1', until) })).status).toBe(409);
    expect(updateMany).not.toHaveBeenCalled();
  });
});
