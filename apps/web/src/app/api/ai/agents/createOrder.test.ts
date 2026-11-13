import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// The assistant's create_order tool: the work site goes to Location (shown by
// lib/orderLocationPrivacy.ts), the description is saved as given.

const orderCreate = vi.fn();
const locationCreate = vi.fn();
const geocodeAddress = vi.fn();
const runAgent = vi.fn();
vi.mock('@specai/database', () => ({
  prisma: { order: { create: orderCreate }, location: { create: locationCreate } },
}));
vi.mock('@/lib/notify', () => ({ notifyTelegram: vi.fn() }));
vi.mock('@/lib/requestUser', () => ({
  getRequestUser: vi.fn().mockResolvedValue({ id: 'u1', name: 'Анна', role: 'CUSTOMER' }),
}));
vi.mock('@/lib/orderCategoryData', () => ({ orderCategoryId: vi.fn().mockResolvedValue('cat') }));
vi.mock('@/lib/guideState', () => ({ guideFor: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/geo', async (original) => ({
  ...(await original<typeof import('@/lib/geo')>()),
  geocodeAddress,
}));
vi.mock('@specai/ai-service', () => ({ runAgent, routeToAgent: vi.fn() }));

const { POST } = await import('./route');

type Handlers = Record<string, (input: Record<string, unknown>) => Promise<unknown>>;

async function createOrder(input: Record<string, unknown>) {
  let result: unknown;
  runAgent.mockImplementation(async (_agent: string, _messages: unknown, handlers: Handlers) => {
    result = await handlers.create_order!(input);
    return { reply: 'Заявка создана', toolsUsed: ['create_order'] };
  });
  const response = await POST(
    new NextRequest('http://localhost/api/ai/agents', {
      method: 'POST',
      body: JSON.stringify({
        agentId: 'dispatcher',
        messages: [{ role: 'user', content: 'Да, создавайте заявку' }],
      }),
    }),
  );
  expect(response.status).toBe(200);
  return result;
}

const ORDER = {
  description: 'Автокран 25 т, разгрузить плиты',
  desiredStartDate: '2027-03-01',
  desiredEndDate: '2027-03-01',
};

describe('create_order', () => {
  beforeEach(() => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    orderCreate.mockReset().mockResolvedValue({ id: 'o1', status: 'OPEN' });
    locationCreate.mockReset().mockResolvedValue({ id: 'loc1' });
    geocodeAddress.mockReset().mockResolvedValue({ lat: 55.76, lon: 52.06, city: 'Елабуга' });
  });
  afterEach(() => vi.unstubAllEnvs());

  it('saves the address as the location of the order, apart from the description', async () => {
    const result = await createOrder({ ...ORDER, address: 'Елабуга, ул. Строителей, 7' });

    expect(locationCreate).toHaveBeenCalledWith({
      data: {
        addressLine: 'Елабуга, ул. Строителей, 7',
        city: 'Елабуга',
        country: 'Россия',
        latitude: 55.76,
        longitude: 52.06,
      },
    });
    const data = orderCreate.mock.calls[0]?.[0].data;
    expect(data).toMatchObject({
      description: ORDER.description,
      locationId: 'loc1',
      customerId: 'u1',
      categoryId: 'cat',
    });
    expect(data).not.toHaveProperty('address');
    expect(result).toEqual({ id: 'o1', status: 'OPEN', link: '/orders/o1' });
  });

  it('creates an order without a location when no place was named', async () => {
    await createOrder(ORDER);

    expect(geocodeAddress).not.toHaveBeenCalled();
    expect(locationCreate).not.toHaveBeenCalled();
    expect(orderCreate.mock.calls[0]?.[0].data.locationId).toBeUndefined();
  });

  it('keeps the city the address names when the lookup finds nothing', async () => {
    geocodeAddress.mockResolvedValue(null);
    await createOrder({ ...ORDER, address: 'Елабуга, ул. Строителей, 7' });

    expect(locationCreate.mock.calls[0]?.[0].data).toMatchObject({
      city: 'Елабуга',
      latitude: null,
      longitude: null,
    });
  });
});
