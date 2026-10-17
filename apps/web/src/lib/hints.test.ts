import { describe, expect, it } from 'vitest';
import {
  HINTS,
  HINTS_STORAGE_KEY,
  dismissHint,
  dismissedHints,
  isHintDismissed,
  resetHints,
  type HintStorage,
} from './hints';

function memoryStorage(initial: Record<string, string> = {}): HintStorage & {
  data: Record<string, string>;
} {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => (key in data ? data[key]! : null),
    setItem: (key, value) => {
      data[key] = value;
    },
    removeItem: (key) => {
      delete data[key];
    },
  };
}

const broken: HintStorage = {
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
  removeItem: () => {
    throw new Error('SecurityError');
  },
};

describe('hint storage', () => {
  it('remembers «Понятно» per hint', () => {
    const storage = memoryStorage();
    expect(isHintDismissed(storage, 'dashboard')).toBe(false);
    expect(dismissHint(storage, 'dashboard')).toBe(true);
    expect(isHintDismissed(storage, 'dashboard')).toBe(true);
    expect(isHintDismissed(storage, 'provider')).toBe(false);
    // A second «Понятно» does not duplicate the id.
    dismissHint(storage, 'dashboard');
    expect(dismissedHints(storage)).toEqual(['dashboard']);
  });

  it('«Показать подсказки снова» brings every hint back', () => {
    const storage = memoryStorage();
    dismissHint(storage, 'dashboard');
    dismissHint(storage, 'catalog');
    expect(resetHints(storage)).toBe(true);
    expect(storage.data[HINTS_STORAGE_KEY]).toBeUndefined();
    expect(isHintDismissed(storage, 'catalog')).toBe(false);
  });

  it('a broken or foreign value counts as nothing dismissed', () => {
    expect(dismissedHints(memoryStorage({ [HINTS_STORAGE_KEY]: '{oops' }))).toEqual([]);
    expect(dismissedHints(memoryStorage({ [HINTS_STORAGE_KEY]: '{"a":1}' }))).toEqual([]);
    expect(dismissedHints(memoryStorage({ [HINTS_STORAGE_KEY]: '["a",2,null]' }))).toEqual(['a']);
  });

  it('never throws when the browser blocks storage', () => {
    expect(dismissedHints(broken)).toEqual([]);
    expect(isHintDismissed(broken, 'dashboard')).toBe(false);
    expect(dismissHint(broken, 'dashboard')).toBe(false);
    expect(resetHints(broken)).toBe(false);
    expect(dismissHint(null, 'dashboard')).toBe(false);
    expect(isHintDismissed(null, 'dashboard')).toBe(false);
  });
});

describe('hint texts', () => {
  const entries = Object.entries(HINTS);

  it('are short: one or two sentences', () => {
    for (const [id, hint] of entries) {
      const sentences = hint.text.split(/[.!?](?:\s|$)/).filter((part) => part.trim());
      expect(sentences.length, id).toBeGreaterThanOrEqual(1);
      expect(sentences.length, id).toBeLessThanOrEqual(2);
      expect(hint.text.length, id).toBeLessThanOrEqual(200);
    }
  });

  it('are Russian, without the shortened brand and English words', () => {
    for (const [id, hint] of entries) {
      expect(hint.text, id).toMatch(/[а-яё]/i);
      expect(hint.text, id).not.toMatch(/СП\s?16/);
      expect(hint.text, id).not.toMatch(/[a-z]{3,}/i);
    }
  });

  it('point to sections that exist on the help page', () => {
    for (const [id, hint] of entries) {
      if ('more' in hint && hint.more) {
        expect(['#zakazchik', '#ispolnitel', '#dve-roli', '#prilozhenie'], id).toContain(hint.more);
      }
    }
  });

  it('tell the provider the customer is «Анна П.» until the booking is confirmed', () => {
    expect(HINTS['order-provider'].text).toContain('«Анна П.»');
    expect(HINTS['order-provider'].text).toMatch(/после подтверждения брони/);
    expect(HINTS.register.text).toMatch(/тем же логином/);
  });
});
