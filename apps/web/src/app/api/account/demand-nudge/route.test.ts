import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { HOUSE_COMPANY_ID } from '@/lib/fleet';

const getRequestUser = vi.fn();
const demandNudgeEnabled = vi.fn();
const setDemandNudge = vi.fn();
vi.mock('@/lib/requestUser', () => ({ getRequestUser }));
vi.mock('@/lib/demandNudgeData', () => ({ demandNudgeEnabled, setDemandNudge }));

const { GET, PATCH, PUT } = await import('./route');

const URL_ = 'http://localhost/api/account/demand-nudge';

function get() {
  return GET(new NextRequest(URL_));
}

function patch(body: unknown, raw = false) {
  return PATCH(
    new NextRequest(URL_, { method: 'PATCH', body: raw ? String(body) : JSON.stringify(body) }),
  );
}

describe('/api/account/demand-nudge', () => {
  beforeEach(() => {
    for (const mock of [getRequestUser, demandNudgeEnabled, setDemandNudge]) mock.mockReset();
    getRequestUser.mockResolvedValue({ id: 'u1', role: 'PROVIDER_ADMIN', companyId: 'c1' });
    demandNudgeEnabled.mockResolvedValue(true);
    setDemandNudge.mockResolvedValue(undefined);
  });

  it('asks to sign in first', async () => {
    getRequestUser.mockResolvedValue(null);
    const response = await get();
    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe('Необходимо войти в аккаунт');
    expect((await patch({ enabled: false })).status).toBe(401);
    expect(setDemandNudge).not.toHaveBeenCalled();
  });

  it('shows the switch of the own account to a provider manager', async () => {
    demandNudgeEnabled.mockResolvedValue(false);
    const response = await get();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ available: true, enabled: false });
    expect(demandNudgeEnabled).toHaveBeenCalledWith('u1');
  });

  it('turns the message off and on for the own account only', async () => {
    const off = await patch({ enabled: false });
    expect(off.status).toBe(200);
    expect(await off.json()).toEqual({ available: true, enabled: false });
    expect(setDemandNudge).toHaveBeenLastCalledWith('u1', false);

    const on = await PUT(
      new NextRequest(URL_, { method: 'PUT', body: JSON.stringify({ enabled: true }) }),
    );
    expect(on.status).toBe(200);
    expect(setDemandNudge).toHaveBeenLastCalledWith('u1', true);
  });

  it('accepts only a boolean in JSON', async () => {
    const wrong = await patch({ enabled: 'yes' });
    expect(wrong.status).toBe(400);
    expect((await wrong.json()).error).toBe('Укажите, включить или выключить');
    expect((await patch({})).status).toBe(400);
    expect((await patch('{not json', true)).status).toBe(400);
    expect(setDemandNudge).not.toHaveBeenCalled();
  });

  it('is not for the house fleet: the owner sees every order anyway', async () => {
    getRequestUser.mockResolvedValue({
      id: 'h1',
      role: 'PROVIDER_ADMIN',
      companyId: HOUSE_COMPANY_ID,
    });
    expect(await (await get()).json()).toEqual({ available: false, enabled: false });
    const response = await patch({ enabled: false });
    expect(response.status).toBe(403);
    expect((await response.json()).error).toMatch(/руководителей компаний-исполнителей/);
    expect(demandNudgeEnabled).not.toHaveBeenCalled();
    expect(setDemandNudge).not.toHaveBeenCalled();
  });

  it('is not for customers, machinists or platform admins', async () => {
    for (const user of [
      { id: 'c', role: 'CUSTOMER', companyId: null },
      { id: 'o', role: 'PROVIDER_OPERATOR', companyId: 'c1' },
      { id: 'a', role: 'PLATFORM_ADMIN', companyId: null },
      { id: 'p', role: 'PROVIDER_ADMIN', companyId: null },
    ]) {
      getRequestUser.mockResolvedValue(user);
      expect(await (await get()).json()).toEqual({ available: false, enabled: false });
      expect((await patch({ enabled: true })).status).toBe(403);
    }
    expect(demandNudgeEnabled).not.toHaveBeenCalled();
    expect(setDemandNudge).not.toHaveBeenCalled();
  });
});
