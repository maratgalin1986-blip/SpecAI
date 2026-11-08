import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const isAdminRequest = vi.fn();
const findMany = vi.fn();
const findUnique = vi.fn();
const updateMany = vi.fn();
vi.mock('@specai/database', () => ({ prisma: { proposal: { findMany, findUnique, updateMany } } }));
vi.mock('@/lib/admin', () => ({ isAdminRequest }));

const { GET } = await import('./route');
const { PATCH } = await import('./[id]/route');

function patch(id: string, body: unknown) {
  return PATCH(
    new NextRequest(`http://localhost/api/admin/proposals/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
    { params: { id } },
  );
}

describe('/api/admin/proposals', () => {
  beforeEach(() => {
    isAdminRequest.mockReset().mockReturnValue(true);
    findMany.mockReset().mockResolvedValue([]);
    findUnique.mockReset();
    updateMany.mockReset().mockResolvedValue({ count: 1 });
  });

  it('refuses without the admin session (list and status change)', async () => {
    isAdminRequest.mockReturnValue(false);
    expect((await GET(new NextRequest('http://localhost/api/admin/proposals'))).status).toBe(401);
    expect((await patch('p1', { status: 'READ' })).status).toBe(401);
    expect(findMany).not.toHaveBeenCalled();
    expect(findUnique).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('lists new ones by default, newest first, at most 100, without account ids', async () => {
    await GET(new NextRequest('http://localhost/api/admin/proposals'));
    const query = findMany.mock.calls[0]?.[0];
    expect(query.where).toEqual({ status: 'NEW' });
    expect(query.orderBy).toEqual({ createdAt: 'desc' });
    expect(query.take).toBe(100);
    expect(query.select.userId).toBeUndefined();
    expect(query.select.contact).toBe(true);
  });

  it('accepts READ and ARCHIVED, ignores anything else', async () => {
    await GET(new NextRequest('http://localhost/api/admin/proposals?status=READ'));
    await GET(new NextRequest('http://localhost/api/admin/proposals?status=ARCHIVED'));
    await GET(new NextRequest('http://localhost/api/admin/proposals?status=DROP'));
    expect(findMany.mock.calls.map((call) => call[0].where.status)).toEqual([
      'READ',
      'ARCHIVED',
      'NEW',
    ]);
  });

  it('marks a new one read, only from the status it had', async () => {
    findUnique.mockResolvedValue({ status: 'NEW' });
    const response = await patch('p1', { status: 'READ' });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ proposal: { id: 'p1', status: 'READ' } });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'p1', status: 'NEW' },
      data: { status: 'READ' },
    });
  });

  it('archives a read one', async () => {
    findUnique.mockResolvedValue({ status: 'READ' });
    expect((await patch('p1', { status: 'ARCHIVED' })).status).toBe(200);
  });

  it('answers 404 for a missing one and 409 for a decided one', async () => {
    findUnique.mockResolvedValue(null);
    expect((await patch('nope', { status: 'READ' })).status).toBe(404);
    findUnique.mockResolvedValue({ status: 'ARCHIVED' });
    expect((await patch('p1', { status: 'READ' })).status).toBe(409);
    findUnique.mockResolvedValue({ status: 'READ' });
    expect((await patch('p1', { status: 'READ' })).status).toBe(409);
    // Decided in parallel (site and app at once).
    findUnique.mockResolvedValue({ status: 'NEW' });
    updateMany.mockResolvedValue({ count: 0 });
    expect((await patch('p1', { status: 'ARCHIVED' })).status).toBe(409);
  });

  it('refuses other statuses', async () => {
    expect((await patch('p1', { status: 'NEW' })).status).toBe(400);
    expect((await patch('p1', {})).status).toBe(400);
    expect(findUnique).not.toHaveBeenCalled();
  });
});
