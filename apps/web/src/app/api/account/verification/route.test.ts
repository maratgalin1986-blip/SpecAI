import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getRequestUser = vi.fn();
const companyFind = vi.fn();
const companyUpdate = vi.fn();
const fileFind = vi.fn();
const docCreate = vi.fn();
const equipmentFind = vi.fn();
const bookingCount = vi.fn();
const docFindFirst = vi.fn();
vi.mock('@specai/database', () => ({
  prisma: {
    company: { findUnique: companyFind, update: companyUpdate },
    storedFile: { findUnique: fileFind },
    providerDocument: { create: docCreate, findFirst: docFindFirst },
    equipment: { findFirst: equipmentFind },
    booking: { count: bookingCount },
    $transaction: (ops: unknown[]) => Promise.all(ops),
  },
}));
vi.mock('@/lib/requestUser', () => ({ getRequestUser }));

const { GET, PUT } = await import('./route');

const form = {
  legalForm: 'IP',
  legalName: 'Петров Пётр Петрович',
  inn: '500100732259',
  taxRegime: 'USN',
  stsNumber: '16 49 123456',
  stsFileKey: 'private/verification/comp1/rnd-sts.jpg',
};

let n = 0;
async function put(body: Record<string, unknown>) {
  const response = await PUT(
    new NextRequest('http://localhost/api/account/verification', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  );
  return { status: response.status, body: await response.json() };
}

describe('/api/account/verification', () => {
  beforeEach(() => {
    n += 1;
    for (const mock of [
      companyFind,
      companyUpdate,
      fileFind,
      docCreate,
      equipmentFind,
      bookingCount,
      docFindFirst,
    ])
      mock.mockReset();
    getRequestUser.mockResolvedValue({ id: `u${n}`, role: 'PROVIDER_ADMIN', companyId: 'comp1' });
    companyFind.mockResolvedValue({ verified: false, provisional: true, bankAccount: null });
    fileFind.mockResolvedValue({ key: form.stsFileKey });
    companyUpdate.mockResolvedValue({});
    docCreate.mockResolvedValue({});
  });

  it('отправляет на проверку и не ставит «Проверен»', async () => {
    const { status, body } = await put(form);
    expect(status).toBe(200);
    expect(body.status).toBe('pending');
    const data = companyUpdate.mock.calls[0]![0].data;
    expect(data).toMatchObject({ taxId: '500100732259', taxRegime: 'USN', legalForm: 'IP' });
    expect(data.verificationRequestedAt).toBeInstanceOf(Date);
    expect(data).not.toHaveProperty('verified');
    expect(docCreate.mock.calls[0]![0].data).toMatchObject({
      companyId: 'comp1',
      kind: 'STS',
      fileUrl: '/api/private-files/private/verification/comp1/rnd-sts.jpg',
    });
  });

  it('не принимает фото чужой компании', async () => {
    const { status } = await put({ ...form, stsFileKey: 'private/verification/comp2/x.jpg' });
    expect(status).toBe(400);
    expect(companyUpdate).not.toHaveBeenCalled();
  });

  it('ИНН с ошибкой — 400', async () => {
    expect((await put({ ...form, inn: '500100732258' })).status).toBe(400);
  });

  it('повторно, пока на проверке или уже проверен — 409', async () => {
    companyFind.mockResolvedValue({ verified: false, verificationRequestedAt: new Date() });
    expect((await put(form)).status).toBe(409);
    companyFind.mockResolvedValue({ verified: true });
    expect((await put(form)).status).toBe(409);
    expect(companyUpdate).not.toHaveBeenCalled();
  });

  it('машинисту, заказчику и гостю — 403', async () => {
    for (const user of [
      { id: 'o', role: 'PROVIDER_OPERATOR', companyId: 'comp1' },
      { id: 'c', role: 'CUSTOMER', companyId: null },
      null,
    ]) {
      getRequestUser.mockResolvedValue(user);
      expect((await put(form)).status).toBe(403);
      expect((await GET(new NextRequest('http://localhost/api/account/verification'))).status).toBe(
        403,
      );
    }
  });

  it('GET прячет счёт и предлагает регистрацию после первого заказа', async () => {
    companyFind.mockResolvedValue({
      verified: false,
      provisional: true,
      bankAccount: '40702810000000001234',
    });
    bookingCount.mockResolvedValue(1);
    docFindFirst.mockResolvedValue(null);
    const response = await GET(new NextRequest('http://localhost/api/account/verification'));
    const body = await response.json();
    expect(body.offerFullRegistration).toBe(true);
    expect(body.status).toBe('provisional');
    expect(body.company.bankAccount).toBeUndefined();
    expect(body.company.bankAccountMasked).toBe('•••• 1234');
  });
});
