import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const isAdminRequest = vi.fn();
const runStep = vi.fn();
vi.mock('@/lib/admin', () => ({ isAdminRequest }));
vi.mock('@/lib/office/run', () => ({ runStep }));

const { POST, maxDuration } = await import('./route');

function request(body: unknown) {
  return new NextRequest('https://example.ru/api/admin/office/run', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('POST /api/admin/office/run', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isAdminRequest.mockResolvedValue(true);
    runStep.mockResolvedValue({ found: 3, created: 2, skipped: 1 });
  });

  it('без админа — 401 и шаг не запускается', async () => {
    isAdminRequest.mockResolvedValue(false);
    const response = await POST(request({ agent: 'sites', niche: 'dentist', city: 'Казань' }));
    expect(response.status).toBe(401);
    expect(runStep).not.toHaveBeenCalled();
  });

  it('шаг получает бюджет времени меньше лимита функции', async () => {
    const response = await POST(request({ agent: 'sites', niche: 'dentist', city: 'Казань' }));
    expect(response.status).toBe(200);
    expect(runStep).toHaveBeenCalledWith(
      { agent: 'sites', niche: 'dentist', city: 'Казань', trigger: 'admin' },
      { budgetMs: 45_000 },
    );
    expect(45_000).toBeLessThan(maxDuration * 1000);
    expect(await response.json()).toEqual({ found: 3, created: 2, skipped: 1, error: null });
  });
});
