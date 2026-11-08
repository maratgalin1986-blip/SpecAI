import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();
const storage = {
  getItem: vi.fn(async (key: string) => store.get(key) ?? null),
  setItem: vi.fn(async (key: string, value: string) => {
    store.set(key, value);
  }),
  removeItem: vi.fn(async (key: string) => {
    store.delete(key);
  }),
};
vi.mock('./storage', () => ({
  STORAGE_KEYS: { adminSession: 'specai.adminSession' },
  getItem: (key: string) => storage.getItem(key),
  setItem: (key: string, value: string) => storage.setItem(key, value),
  removeItem: (key: string) => storage.removeItem(key),
}));

class ApiError extends Error {
  status: number;
  details: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}
const apiFetch = vi.fn();
vi.mock('./api', () => ({ ApiError, apiFetch: (...args: unknown[]) => apiFetch(...args) }));

const session = await import('./adminSession');
const { ADMIN_EXPIRED_MESSAGE, adminFetch, adminLogin, fetchAdminStats } =
  await import('./adminApi');

describe('admin session store', () => {
  beforeEach(() => {
    store.clear();
    apiFetch.mockReset();
    storage.getItem.mockClear();
    storage.setItem.mockClear();
    session.resetAdminSessionForTests();
  });

  it('keeps the session from the password login in secure storage', async () => {
    apiFetch.mockResolvedValue({ ok: true, session: 'abc' });
    await adminLogin('secret');
    expect(apiFetch).toHaveBeenCalledWith('/api/admin/login', {
      method: 'POST',
      body: { password: 'secret', app: true },
      anonymous: true,
      credentials: 'omit',
    });
    expect(store.get('specai.adminSession')).toBe('abc');
    expect(await session.getAdminSession()).toBe('abc');
  });

  it('reads a stored session after a restart', async () => {
    store.set('specai.adminSession', 'stored');
    expect(await session.getAdminSession()).toBe('stored');
  });

  it('forgets the session on «Выйти из админки»', async () => {
    await session.saveAdminSession('abc');
    await session.clearAdminSession();
    expect(store.has('specai.adminSession')).toBe(false);
    expect(await session.getAdminSession()).toBeNull();
  });

  it('still signs in when secure storage refuses to write', async () => {
    storage.setItem.mockRejectedValueOnce(new Error('keychain locked'));
    apiFetch.mockResolvedValue({ ok: true, session: 'abc' });
    await adminLogin('secret');
    expect(await session.getAdminSession()).toBe('abc');
  });

  it('treats an unreadable storage as signed out', async () => {
    storage.getItem.mockRejectedValueOnce(new Error('keychain locked'));
    expect(await session.getAdminSession()).toBeNull();
  });

  it('does not let a slow first read undo a fresh login', async () => {
    let finishRead: (value: string | null) => void = () => {};
    storage.getItem.mockImplementationOnce(
      () => new Promise<string | null>((resolve) => (finishRead = resolve)),
    );
    const reading = session.loadAdminSession();
    await session.saveAdminSession('fresh');
    finishRead('old');
    await reading;
    expect(await session.getAdminSession()).toBe('fresh');
  });

  it('passes the server message through: wrong password, too many attempts', async () => {
    apiFetch.mockRejectedValueOnce(new ApiError(401, 'Неверный пароль'));
    await expect(adminLogin('nope')).rejects.toMatchObject({ message: 'Неверный пароль' });
    apiFetch.mockRejectedValueOnce(
      new ApiError(429, 'Слишком много попыток входа. Подождите 15 минут и попробуйте снова'),
    );
    await expect(adminLogin('nope')).rejects.toMatchObject({
      status: 429,
      message: 'Слишком много попыток входа. Подождите 15 минут и попробуйте снова',
    });
    expect(await session.getAdminSession()).toBeNull();
  });
});

describe('admin requests', () => {
  beforeEach(async () => {
    store.clear();
    apiFetch.mockReset();
    session.resetAdminSessionForTests();
    await session.saveAdminSession('abc');
  });

  it('sends the session in x-admin-session instead of the account token', async () => {
    apiFetch.mockResolvedValue({ stats: { customers: { total: 3 } } });
    const stats = await fetchAdminStats();
    expect(stats).toEqual({ customers: { total: 3 } });
    expect(apiFetch).toHaveBeenCalledWith('/api/admin/stats', {
      anonymous: true,
      credentials: 'omit',
      headers: { 'x-admin-session': 'abc' },
    });
  });

  it('drops the session on 401 so the screens ask for the password again', async () => {
    apiFetch.mockRejectedValue(new ApiError(401, 'Нет доступа'));
    await expect(adminFetch('/api/admin/stats')).rejects.toMatchObject({
      status: 401,
      message: ADMIN_EXPIRED_MESSAGE,
    });
    const state = await session.getAdminSession();
    expect(state).toBeNull();
    expect(store.has('specai.adminSession')).toBe(false);
  });

  it('keeps a newer session when an old request comes back with 401', async () => {
    apiFetch.mockImplementation(async () => {
      await session.saveAdminSession('newer');
      throw new ApiError(401, 'Нет доступа');
    });
    await expect(adminFetch('/api/admin/stats')).rejects.toMatchObject({ status: 401 });
    expect(await session.getAdminSession()).toBe('newer');
  });

  it('keeps the session on other errors', async () => {
    apiFetch.mockRejectedValue(new ApiError(409, 'Заявка уже обработана или занята'));
    await expect(adminFetch('/api/admin/orders/o1', { method: 'PATCH' })).rejects.toMatchObject({
      status: 409,
      message: 'Заявка уже обработана или занята',
    });
    expect(await session.getAdminSession()).toBe('abc');
  });

  it('asks for the password without a request when there is no session', async () => {
    await session.clearAdminSession();
    await expect(adminFetch('/api/admin/stats')).rejects.toMatchObject({ status: 401 });
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
