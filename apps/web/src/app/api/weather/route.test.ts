import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const fetchForecast = vi.fn();
const geocodeAddress = vi.fn();
vi.mock('@/lib/weather', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/weather')>()),
  fetchForecast,
}));
vi.mock('@/lib/geo', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/geo')>()),
  geocodeAddress,
}));

const { GET } = await import('./route');
const { mskToday } = await import('@/lib/weather');

const call = (query: string) =>
  GET(new NextRequest(`https://example.test/api/weather?date=${mskToday()}${query}`));

describe('GET /api/weather', () => {
  beforeEach(() => {
    fetchForecast.mockReset();
    geocodeAddress.mockReset();
    fetchForecast.mockResolvedValue([]);
  });

  it('gives no forecast without a place, instead of a default town', async () => {
    const response = await call('');
    expect(response.status).toBe(400);
    expect(fetchForecast).not.toHaveBeenCalled();
  });

  it('gives no forecast for an address the geocoder cannot find', async () => {
    geocodeAddress.mockResolvedValue(null);
    const response = await call(`&q=${encodeURIComponent('ул. Мира 10')}`);
    expect(response.status).toBe(404);
    expect(fetchForecast).not.toHaveBeenCalled();
  });

  it('forecasts for the point or the found address, anywhere in Russia', async () => {
    expect((await call('&lat=56.84&lon=60.6')).status).toBe(200);
    expect(fetchForecast).toHaveBeenLastCalledWith(56.84, 60.6);
    geocodeAddress.mockResolvedValue({ lat: 53.2, lon: 50.1, label: 'Самара' });
    const response = await call(`&q=${encodeURIComponent('Самара, ул. Ленина 5')}`);
    expect(response.status).toBe(200);
    expect(fetchForecast).toHaveBeenLastCalledWith(53.2, 50.1);
  });
});
