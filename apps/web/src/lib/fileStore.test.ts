import { beforeEach, describe, expect, it, vi } from 'vitest';

const create = vi.fn(async ({ data }: { data: { key: string } }) => data);
let used = { folder: 0, total: 0 };
const aggregate = vi.fn(async ({ where }: { where?: unknown }) => ({
  _sum: { size: where ? used.folder : used.total },
}));
vi.mock('@specai/database', () => ({ prisma: { storedFile: { create, aggregate } } }));
const put = vi.fn(async () => ({
  url: 'https://abc.public.blob.vercel-storage.com/equipment/c1/x.jpg',
}));
vi.mock('@vercel/blob', () => ({ put }));
vi.mock('@/lib/siteUrl', () => ({ siteUrl: () => 'https://spec-ai-web.vercel.app' }));

const { STORE_LIMITS, StoreFullError, storeFile, storedKey } = await import('./fileStore');
const { storedKeyFromUrl } = await import('./fileUrls');
const { isOurBlobUrl } = await import('./blob');

const photo = () =>
  new File([new Uint8Array([1, 2, 3])], 'фото машины.jpg', { type: 'image/jpeg' });

describe('fileStore', () => {
  beforeEach(() => {
    create.mockClear();
    put.mockClear();
    used = { folder: 0, total: 0 };
    vi.unstubAllEnvs();
  });

  it('keeps the folder and a random, safe name', () => {
    expect(storedKey('equipment/c1/my photo.jpg', 'R')).toBe('equipment/c1/R-my_photo.jpg');
    expect(storedKey('x.pdf', 'R')).toBe('R-x.pdf');
  });

  it('without Vercel Blob stores the file in the database and links to the site', async () => {
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', '');
    const url = await storeFile('equipment/c1/photo.jpg', photo());
    expect(put).not.toHaveBeenCalled();
    const saved = create.mock.calls[0]?.[0].data as {
      key: string;
      contentType: string;
      size: number;
    };
    expect(saved).toMatchObject({ contentType: 'image/jpeg', size: 3 });
    expect(saved.key).toMatch(/^equipment\/c1\/[\w-]+-photo\.jpg$/);
    expect(url).toBe(`https://spec-ai-web.vercel.app/api/files/${saved.key}`);
    expect(storedKeyFromUrl(url)).toBe(saved.key);
    expect(isOurBlobUrl(url)).toBe(true);
  });

  it('with Vercel Blob uses it', async () => {
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'vercel_blob_rw_x');
    const url = await storeFile('equipment/c1/photo.jpg', photo());
    expect(url).toContain('blob.vercel-storage.com');
    expect(create).not.toHaveBeenCalled();
  });

  it('refuses a file over the company’s or the whole store’s limit', async () => {
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', '');
    used = { folder: STORE_LIMITS.perFolder, total: 0 };
    await expect(storeFile('equipment/c1/a.jpg', photo())).rejects.toBeInstanceOf(StoreFullError);
    used = { folder: 0, total: STORE_LIMITS.total };
    await expect(storeFile('equipment/c1/a.jpg', photo())).rejects.toBeInstanceOf(StoreFullError);
    expect(create).not.toHaveBeenCalled();
  });

  it('keeps links on the site’s future domain its own', () => {
    expect(storedKeyFromUrl('https://iistroyka24.ru/api/files/equipment/c1/R-a.jpg')).toBe(
      'equipment/c1/R-a.jpg',
    );
    expect(storedKeyFromUrl('https://www.iistroyka24.ru/api/files/x.jpg')).toBe('x.jpg');
  });

  it('recognises only this site’s own file links', () => {
    expect(storedKeyFromUrl('https://evil.example/api/files/equipment/c1/a.jpg')).toBeNull();
    expect(storedKeyFromUrl('http://spec-ai-web.vercel.app/api/files/a.jpg')).toBeNull();
    expect(storedKeyFromUrl('https://spec-ai-web.vercel.app/orders/1')).toBeNull();
    expect(storedKeyFromUrl('https://spec-ai-web.vercel.app/api/files/a/%2E%2E%2Fb')).toBeNull();
    expect(isOurBlobUrl('https://t.me/someone')).toBe(false);
  });
});
