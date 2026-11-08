import { describe, expect, it, vi } from 'vitest';

const files: Record<string, { data: Buffer; contentType: string; size: number }> = {
  'equipment/c1/R-a.jpg': { data: Buffer.from([1, 2, 3]), contentType: 'image/jpeg', size: 3 },
  'equipment/c1/R-page.html': { data: Buffer.from('<p>x</p>'), contentType: 'text/html', size: 8 },
  'equipment/c1/R-doc.pdf': {
    data: Buffer.from('%PDF-1.4'),
    contentType: 'application/pdf',
    size: 8,
  },
};
vi.mock('@specai/database', () => ({
  prisma: {
    storedFile: {
      findUnique: vi.fn(async ({ where }: { where: { key: string } }) => files[where.key] ?? null),
    },
  },
}));

const { GET } = await import('./route');
const get = (key: string[]) => GET(new Request('https://x.test'), { params: { key } });

describe('GET /api/files/[...key]', () => {
  it('serves a stored upload with its type and a long cache', async () => {
    const response = await get(['equipment', 'c1', 'R-a.jpg']);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/jpeg');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('content-security-policy')).toContain('sandbox');
    expect(response.headers.get('cdn-cache-control')).toContain('max-age');
    expect(response.headers.get('content-disposition')).toBe('inline');
    // Only the file: no cookie, no names, phones or ids beyond the key itself.
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('makes a PDF download instead of opening on the site', async () => {
    const response = await get(['equipment', 'c1', 'R-doc.pdf']);
    expect(response.headers.get('content-disposition')).toBe('attachment');
  });

  it('answers 404, not 500, to a broken address', async () => {
    expect((await get(['%E0%A4%A'])).status).toBe(404);
  });

  it('answers 404 for a missing file and never serves another type', async () => {
    expect((await get(['equipment', 'c1', 'nope.jpg'])).status).toBe(404);
    expect((await get(['equipment', 'c1', 'R-page.html'])).status).toBe(404);
  });
});
