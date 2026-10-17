import { describe, expect, it, vi } from 'vitest';

vi.mock('./storage', () => ({
  STORAGE_KEYS: { hints: 'specai.hints' },
  getItem: vi.fn().mockResolvedValue(null),
  setItem: vi.fn().mockResolvedValue(undefined),
  removeItem: vi.fn().mockResolvedValue(undefined),
}));

const { HINTS, createHintStore, firstOpenHint, parseDismissed } = await import('./hints');

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: vi.fn(async (key: string) => data.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      data.set(key, value);
    }),
    removeItem: vi.fn(async (key: string) => {
      data.delete(key);
    }),
  };
}

describe('hints', () => {
  it('keeps every hint short: one or two sentences, no forbidden words', () => {
    for (const hint of Object.values(HINTS)) {
      const sentences = hint.text.split(/[.!?](?:\s|$)/).filter((part) => part.trim());
      expect(sentences.length).toBeLessThanOrEqual(2);
      expect(hint.text).not.toMatch(/кабинет|вкладк/i);
    }
  });

  it('reads the dismissed list and ignores junk', () => {
    expect([...parseDismissed('["home.order","nope",3]')]).toEqual(['home.order']);
    expect(parseDismissed('not json').size).toBe(0);
    expect(parseDismissed('{"home.order":true}').size).toBe(0);
    expect(parseDismissed(null).size).toBe(0);
  });

  it('shows only the first hint that is still open', () => {
    expect(firstOpenHint(['home.order', 'home.sheet'], new Set())).toBe('home.order');
    expect(firstOpenHint(['home.order', 'home.sheet'], new Set(['home.order'] as const))).toBe(
      'home.sheet',
    );
    expect(
      firstOpenHint(['home.order', 'home.sheet'], new Set(['home.order', 'home.sheet'] as const)),
    ).toBeNull();
  });

  it('hides nothing until the saved list is read', async () => {
    const storage = memoryStorage({ 'specai.hints': '["feed.start"]' });
    const store = createHintStore(storage, 'specai.hints');
    expect(store.getSnapshot().loaded).toBe(false);
    await store.load();
    expect(store.getSnapshot()).toMatchObject({ loaded: true });
    expect(store.getSnapshot().dismissed.has('feed.start')).toBe(true);
  });

  it('remembers a dismissed hint across restarts', async () => {
    const storage = memoryStorage({ 'specai.hints': '["feed.start"]' });
    const first = createHintStore(storage, 'specai.hints');
    await first.dismiss('bid.form');
    expect(first.getSnapshot().dismissed.has('bid.form')).toBe(true);
    // Сохранённая раньше подсказка не потерялась.
    expect(JSON.parse(storage.data.get('specai.hints') ?? '[]')).toEqual([
      'feed.start',
      'bid.form',
    ]);

    const second = createHintStore(storage, 'specai.hints');
    await second.load();
    expect([...second.getSnapshot().dismissed].sort()).toEqual(['bid.form', 'feed.start']);
  });

  it('notifies the screen when a hint is dismissed', async () => {
    const store = createHintStore(memoryStorage(), 'specai.hints');
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    await store.load();
    listener.mockClear();
    await store.dismiss('orders.list');
    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });

  it('«Показать подсказки снова» clears the list', async () => {
    const storage = memoryStorage({ 'specai.hints': '["home.order","home.sheet"]' });
    const store = createHintStore(storage, 'specai.hints');
    await store.load();
    await store.reset();
    expect(store.getSnapshot()).toEqual({ loaded: true, dismissed: new Set() });
    expect(storage.data.has('specai.hints')).toBe(false);
    expect(firstOpenHint(['home.order'], store.getSnapshot().dismissed)).toBe('home.order');
  });

  it('hides a hint for the session when the storage fails', async () => {
    const storage = {
      getItem: vi.fn().mockRejectedValue(new Error('keychain locked')),
      setItem: vi.fn().mockRejectedValue(new Error('keychain locked')),
      removeItem: vi.fn().mockRejectedValue(new Error('keychain locked')),
    };
    const store = createHintStore(storage, 'specai.hints');
    await store.load();
    expect(store.getSnapshot()).toEqual({ loaded: true, dismissed: new Set() });
    await expect(store.dismiss('jobs.list')).resolves.toBeUndefined();
    expect(store.getSnapshot().dismissed.has('jobs.list')).toBe(true);
    await expect(store.reset()).resolves.toBeUndefined();
    expect(store.getSnapshot().dismissed.size).toBe(0);
  });

  it('keeps a hint dismissed before the saved list finished loading', async () => {
    let release: (value: string | null) => void = () => undefined;
    const storage = memoryStorage();
    storage.getItem.mockImplementationOnce(
      () =>
        new Promise<string | null>((resolve) => {
          release = resolve;
        }),
    );
    const store = createHintStore(storage, 'specai.hints');
    void store.load();
    const dismissing = store.dismiss('fleet.list');
    expect(store.getSnapshot().dismissed.has('fleet.list')).toBe(true);
    release('["profile.switch"]');
    await dismissing;
    expect([...store.getSnapshot().dismissed].sort()).toEqual(['fleet.list', 'profile.switch']);
    expect(JSON.parse(storage.data.get('specai.hints') ?? '[]').sort()).toEqual([
      'fleet.list',
      'profile.switch',
    ]);
  });

  it('«Показать снова» before the saved list is read is not undone by the read', async () => {
    let release: (value: string | null) => void = () => undefined;
    const storage = memoryStorage();
    storage.getItem.mockImplementationOnce(
      () =>
        new Promise<string | null>((resolve) => {
          release = resolve;
        }),
    );
    const store = createHintStore(storage, 'specai.hints');
    const loading = store.load();
    await store.reset();
    release('["home.order","home.sheet"]');
    await loading;
    expect(store.getSnapshot()).toEqual({ loaded: true, dismissed: new Set() });
  });
});
