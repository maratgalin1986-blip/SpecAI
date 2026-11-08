import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getRequestUser = vi.fn();
const resolveProviderBase = vi.fn();
const userFind = vi.fn();
const userUpdate = vi.fn();
const companyCreate = vi.fn();
const tx = {
  user: { findUnique: userFind, update: userUpdate },
  company: { create: companyCreate },
};
vi.mock('@specai/database', () => ({
  prisma: { $transaction: (fn: (t: typeof tx) => unknown) => fn(tx) },
}));
vi.mock('@/lib/requestUser', () => ({ getRequestUser }));
vi.mock('@/lib/providerBase', () => ({ resolveProviderBase }));

const { POST } = await import('./route');

let n = 0;
async function post(body: Record<string, unknown>, consent = true) {
  const response = await POST(
    new NextRequest('http://localhost/api/account/provider', {
      method: 'POST',
      body: JSON.stringify(consent ? { publicConsent: true, ...body } : body),
    }),
  );
  return { status: response.status, body: await response.json() };
}

describe('POST /api/account/provider: «Стать исполнителем»', () => {
  beforeEach(() => {
    n += 1;
    for (const mock of [getRequestUser, resolveProviderBase, userFind, userUpdate, companyCreate]) {
      mock.mockReset();
    }
    getRequestUser.mockResolvedValue({ id: `u${n}`, role: 'CUSTOMER', companyId: null });
    resolveProviderBase.mockResolvedValue({
      ok: true,
      value: { baseLat: 55.74, baseLon: 52.4, baseAddress: 'проспект Мира 10' },
    });
    userFind.mockResolvedValue({ role: 'CUSTOMER', phone: null });
    companyCreate.mockResolvedValue({ id: 'c-new' });
    userUpdate.mockImplementation(async ({ data }) => ({
      id: `u${n}`,
      email: 'a@example.com',
      name: 'Анна',
      role: data.role,
      companyId: data.companyId,
    }));
  });

  it('turns a customer into the admin of a new company with its base', async () => {
    const { status, body } = await post({
      companyName: '  ИП Петров ',
      phone: '+79170000000',
      baseAddress: 'пр. Мира 10',
    });
    expect(status).toBe(201);
    expect(body.user).toMatchObject({ role: 'PROVIDER_ADMIN', companyId: 'c-new' });
    expect(companyCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'ИП Петров',
        isProvider: true,
        phone: '+79170000000',
        baseLat: 55.74,
        baseLon: 52.4,
      }),
    });
    expect(userUpdate.mock.calls[0]?.[0].data).toMatchObject({
      role: 'PROVIDER_ADMIN',
      companyId: 'c-new',
      phone: '+79170000000',
    });
  });

  it('asks to sign in first', async () => {
    getRequestUser.mockResolvedValue(null);
    expect((await post({ companyName: 'A' })).status).toBe(401);
  });

  it('refuses a provider (409) and a machinist (403)', async () => {
    getRequestUser.mockResolvedValue({ id: 'p', role: 'PROVIDER_ADMIN', companyId: 'c1' });
    expect(await post({ companyName: 'A', baseAddress: 'Мира 1' })).toMatchObject({
      status: 409,
      body: { error: 'Вы уже исполнитель' },
    });
    getRequestUser.mockResolvedValue({ id: 'o', role: 'PROVIDER_OPERATOR', companyId: 'c1' });
    expect((await post({ companyName: 'A', baseAddress: 'Мира 1' })).status).toBe(403);
    expect(companyCreate).not.toHaveBeenCalled();
  });

  it('needs a company name and a place for the machinery', async () => {
    const noName = await post({ baseAddress: 'Мира 1' });
    expect(noName.status).toBe(400);
    expect(noName.body.error).toBe('Укажите название компании');

    resolveProviderBase.mockResolvedValue({ ok: false, error: 'Укажите адрес базы' });
    const noBase = await post({ companyName: 'A' });
    expect(noBase).toMatchObject({ status: 400, body: { error: 'Укажите адрес базы' } });
    expect(companyCreate).not.toHaveBeenCalled();
  });

  it('needs the consent to publish the provider card', async () => {
    const result = await post({ companyName: 'A', baseAddress: 'Мира 1' }, false);
    expect(result).toMatchObject({
      status: 400,
      body: { error: 'Нужно согласие на публикацию карточки исполнителя' },
    });
    expect(companyCreate).not.toHaveBeenCalled();
  });

  it('never creates a second company on a repeated tap', async () => {
    userFind.mockResolvedValue({ role: 'PROVIDER_ADMIN', phone: null });
    expect((await post({ companyName: 'A', baseAddress: 'Мира 1' })).status).toBe(409);
    expect(companyCreate).not.toHaveBeenCalled();
  });

  it('keeps the phone the account already has', async () => {
    userFind.mockResolvedValue({ role: 'CUSTOMER', phone: '+79171111111' });
    await post({ companyName: 'A', baseAddress: 'Мира 1', phone: '+79172222222' });
    expect(userUpdate.mock.calls[0]?.[0].data).not.toHaveProperty('phone');
  });
});
