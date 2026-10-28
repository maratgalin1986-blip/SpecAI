import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

process.env.NEXTAUTH_SECRET = 'test-secret-test-secret';

const userCount = vi.fn();
const userFindFirst = vi.fn();
const categoryFind = vi.fn();
const companyCreate = vi.fn();
const userCreate = vi.fn();
const equipmentCreate = vi.fn();
const presenceCreate = vi.fn();
const resolveProviderBase = vi.fn();
const tx = {
  company: { create: companyCreate },
  user: { create: userCreate },
  equipment: { create: equipmentCreate },
  linePresence: { create: presenceCreate },
};
vi.mock('@specai/database', () => ({
  prisma: {
    user: { count: userCount, findFirst: userFindFirst },
    equipmentCategory: { findFirst: categoryFind },
    $transaction: (fn: (t: typeof tx) => unknown) => fn(tx),
  },
}));
vi.mock('@/lib/providerBase', () => ({ resolveProviderBase }));
vi.mock('@/lib/referralStore', () => ({ freeReferralCode: async () => 'REF1' }));

const { POST } = await import('./route');
const { verifyQuickLoginToken } = await import('@/lib/quickProvider');

let ip = 0;
async function post(body: Record<string, unknown>) {
  ip += 1;
  const response = await POST(
    new NextRequest('http://localhost/api/auth/quick-provider', {
      method: 'POST',
      headers: { 'x-forwarded-for': `10.0.0.${ip}` },
      body: JSON.stringify(body),
    }),
  );
  return { status: response.status, body: await response.json() };
}

const form = {
  name: 'Ильдар',
  categoryId: 'cat-exc',
  consent: true,
  publicConsent: true,
  lat: 55.74,
  lon: 52.4,
  timeZone: 'Europe/Moscow',
};
let phone = 0;
const nextPhone = () => `8917${String(1000000 + (phone += 1)).slice(-7)}`;

describe('POST /api/auth/quick-provider', () => {
  beforeEach(() => {
    for (const mock of [
      userCount,
      userFindFirst,
      categoryFind,
      companyCreate,
      userCreate,
      equipmentCreate,
      presenceCreate,
      resolveProviderBase,
    ])
      mock.mockReset();
    userCount.mockResolvedValue(0);
    userFindFirst.mockResolvedValue(null);
    categoryFind.mockResolvedValue({ id: 'cat-exc', name: 'Экскаватор-погрузчик' });
    resolveProviderBase.mockResolvedValue({ ok: true, value: { baseLat: 55.74, baseLon: 52.4 } });
    companyCreate.mockResolvedValue({ id: 'comp1' });
    userCreate.mockResolvedValue({ id: 'u1', role: 'PROVIDER_ADMIN', companyId: 'comp1' });
    equipmentCreate.mockResolvedValue({ id: 'eq1' });
    presenceCreate.mockResolvedValue({});
  });

  it('создаёт provisional-компанию, машину и линию на 5 рабочих дней, без «Проверен»', async () => {
    const { status, body } = await post({ ...form, phone: nextPhone() });
    expect(status).toBe(201);
    expect(companyCreate.mock.calls[0]![0].data).toMatchObject({
      provisional: true,
      isProvider: true,
    });
    expect(companyCreate.mock.calls[0]![0].data).not.toHaveProperty('verified');
    const user = userCreate.mock.calls[0]![0].data;
    expect(user).toMatchObject({ role: 'PROVIDER_ADMIN', quickSignup: true });
    expect(user.email.endsWith('.invalid')).toBe(true);
    expect(user).not.toHaveProperty('passwordHash');
    expect(user).not.toHaveProperty('phoneVerifiedAt');
    expect(equipmentCreate.mock.calls[0]![0].data).toMatchObject({
      categoryId: 'cat-exc',
      dailyRate: 0,
    });
    const presence = presenceCreate.mock.calls[0]![0].data;
    expect(presence.standingUntil).toBeInstanceOf(Date);
    expect(presence.standingUntil.getTime()).toBeGreaterThan(Date.now());
    expect(await verifyQuickLoginToken(body.quickToken)).toBe('u1');
    expect(typeof body.token).toBe('string');
  });

  it('без согласий, с плохим телефоном или чужим видом техники — 400', async () => {
    expect((await post({ ...form, phone: nextPhone(), consent: false })).status).toBe(400);
    expect((await post({ ...form, phone: '123' })).status).toBe(400);
    categoryFind.mockResolvedValue(null);
    expect((await post({ ...form, phone: nextPhone() })).status).toBe(400);
    expect(companyCreate).not.toHaveBeenCalled();
  });

  it('телефон уже на площадке — 409 без подробностей', async () => {
    userFindFirst.mockResolvedValue({ id: 'other' });
    const { status, body } = await post({ ...form, phone: nextPhone() });
    expect(status).toBe(409);
    expect(JSON.stringify(body)).not.toContain('other');
    expect(companyCreate).not.toHaveBeenCalled();
  });

  it('лимит: один номер не чаще 3 раз в сутки, наплыв по площадке — 429', async () => {
    const same = nextPhone();
    userFindFirst.mockResolvedValue({ id: 'x' });
    for (let i = 0; i < 3; i += 1) expect((await post({ ...form, phone: same })).status).toBe(409);
    expect((await post({ ...form, phone: same })).status).toBe(429);
    userFindFirst.mockResolvedValue(null);
    userCount.mockResolvedValue(40);
    expect((await post({ ...form, phone: nextPhone() })).status).toBe(429);
  });

  it('без точки и города — просит город', async () => {
    resolveProviderBase.mockResolvedValue({ ok: false, error: 'Укажите город' });
    const { status, body } = await post({
      ...form,
      lat: undefined,
      lon: undefined,
      phone: nextPhone(),
    });
    expect(status).toBe(400);
    expect(body.needCity).toBe(true);
  });
});
